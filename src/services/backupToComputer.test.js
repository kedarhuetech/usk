import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BACKUP_FORMAT,
  BACKUP_LAST_CREATED_KEY,
  collectBackupData,
  createBackupPayload,
  downloadBackupFile,
  previewBackupPayload,
  restoreBackupPayload,
  validateBackupPayload,
} from "./backupToComputer.js";
import { createLocalStorageBackupRestoreRepository } from "./backupRestoreRepository.js";
import { CASH_ADJUSTMENTS_STORAGE_KEY } from "./cashInHand.js";
import { getChequeStorageKey } from "./chequesRepository.js";
import { inventoryItemsStorageKey } from "./itemsStorage.js";
import { getLoanAccountsStorageKey } from "./loanAccountsRepository.js";
import { partiesStorageKey } from "./partiesStorage.js";
import { purchaseBillsStorageKey } from "./purchaseBillsStorage.js";
import { saleInvoicesStorageKey } from "./salesStorage.js";

const now = new Date("2026-10-28T12:30:45.000Z");

function storageWith(records = {}) {
  const values = new Map(Object.entries(records));
  return {
    values,
    storage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value),
    },
  };
}

test("collects existing business records without changing the original browser data", () => {
  const fixture = storageWith({
    [inventoryItemsStorageKey]: JSON.stringify([{ id: "item-1", itemName: "Book", price: "25" }]),
    [partiesStorageKey]: JSON.stringify([{ id: "party-1", partyName: "Customer" }]),
    [saleInvoicesStorageKey]: JSON.stringify([{ id: "sale-1", total: 100 }]),
    [purchaseBillsStorageKey]: JSON.stringify([]),
    [CASH_ADJUSTMENTS_STORAGE_KEY]: JSON.stringify([{ id: "adjustment-1", amount: 10 }]),
    [getChequeStorageKey()]: JSON.stringify([]),
    [getLoanAccountsStorageKey()]: JSON.stringify([]),
    "ledgerly:companyProfile.v1": JSON.stringify({ companyName: "USK Store", accessToken: "must-not-export" }),
    "usv:appPasscode.v1": JSON.stringify({ hash: "must-not-export" }),
  });
  const before = new Map(fixture.values);

  const collected = collectBackupData(fixture.storage);
  const payload = createBackupPayload(collected, { now, version: "1.2.3" });

  assert.equal(payload.format, BACKUP_FORMAT);
  assert.equal(payload.createdAt, now.toISOString());
  assert.equal(payload.application.version, "1.2.3");
  assert.deepEqual(payload.data[inventoryItemsStorageKey], [{ id: "item-1", itemName: "Book", price: "25" }]);
  assert.deepEqual(payload.data[purchaseBillsStorageKey], []);
  assert.equal(payload.data["ledgerly:companyProfile.v1"].accessToken, undefined);
  assert.equal(Object.hasOwn(payload.data, "usv:appPasscode.v1"), false);
  assert.ok(payload.manifest.redactedFields.length > 0);
  assert.deepEqual(fixture.values, before);
  assert.equal(fixture.values.has(BACKUP_LAST_CREATED_KEY), false);
});

test("allows absent optional stores and includes present empty arrays", () => {
  const fixture = storageWith({ [saleInvoicesStorageKey]: "[]" });
  const collected = collectBackupData(fixture.storage);
  assert.deepEqual(collected.data[saleInvoicesStorageKey], []);
  assert.equal(Object.hasOwn(collected.data, purchaseBillsStorageKey), false);
});

test("stops on malformed, unexpected, or unreadable storage instead of omitting records", () => {
  const malformed = storageWith({ [inventoryItemsStorageKey]: "{broken" });
  assert.throws(() => collectBackupData(malformed.storage), /malformed/);
  assert.equal(malformed.values.get(inventoryItemsStorageKey), "{broken");

  const unexpected = storageWith({ [inventoryItemsStorageKey]: "{}" });
  assert.throws(() => collectBackupData(unexpected.storage), /unexpected format/);
  assert.throws(() => collectBackupData({ getItem: () => { throw new Error("blocked"); } }), /Could not read/);
});

test("validates backup version and downloads a named USV file with the expected payload", async () => {
  const payload = createBackupPayload(collectBackupData(storageWith({ [inventoryItemsStorageKey]: "[]" }).storage), { now });
  assert.equal(validateBackupPayload(payload).valid, true);
  assert.equal(validateBackupPayload({ ...payload, formatVersion: 99 }).valid, false);

  let savedName = "";
  let downloadedText = "";
  const result = await downloadBackupFile(payload, {
    windowRef: {
      showSaveFilePicker: async ({ suggestedName }) => {
        savedName = suggestedName;
        return { createWritable: async () => ({ write: async (blob) => { downloadedText = await blob.text(); }, close: async () => {} }) };
      },
    },
    documentRef: {},
  });
  assert.match(savedName, /^USV-backup-20261028T123045Z\.usvbackup$/);
  assert.equal(result.filename, savedName);
  assert.equal(JSON.parse(downloadedText).data[inventoryItemsStorageKey].length, 0);
});

test("previews and restores supported records through an injected repository", () => {
  const payload = createBackupPayload(collectBackupData(storageWith({
    [inventoryItemsStorageKey]: JSON.stringify([{ id: "item-1", itemName: "Book" }]),
  }).storage), { now });
  assert.deepEqual(previewBackupPayload(payload).entries.map(({ category, recordCount }) => ({ category, recordCount })), [{ category: "Items", recordCount: 1 }]);
  let restored;
  const summary = restoreBackupPayload(payload, { restore: (entries, data) => { restored = { entries, data }; } });
  assert.equal(summary.restoredCount, 1);
  assert.equal(restored.data[inventoryItemsStorageKey][0].itemName, "Book");
});

test("local repository replaces included stores and rolls back failed writes", () => {
  const profileKey = "ledgerly:companyProfile.v1";
  const values = new Map([
    [profileKey, JSON.stringify({ companyName: "Original" })],
    [inventoryItemsStorageKey, JSON.stringify([{ id: "old" }])],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const repository = createLocalStorageBackupRestoreRepository(storage);
  const payload = createBackupPayload(collectBackupData(storageWith({
    [profileKey]: JSON.stringify({ companyName: "Restored" }),
    [inventoryItemsStorageKey]: JSON.stringify([{ id: "new" }]),
  }).storage), { now });
  restoreBackupPayload(payload, repository);
  assert.deepEqual(JSON.parse(values.get(inventoryItemsStorageKey)), [{ id: "new" }]);
  assert.deepEqual(JSON.parse(values.get(profileKey)), { companyName: "Restored" });

  values.set(profileKey, JSON.stringify({ companyName: "Before failed restore" }));
  values.set(inventoryItemsStorageKey, JSON.stringify([{ id: "before-failure" }]));
  const originalSet = storage.setItem;
  let writes = 0;
  storage.setItem = (key, value) => {
    writes += 1;
    if (writes === 2) throw new Error("quota exceeded");
    originalSet(key, value);
  };
  assert.throws(() => restoreBackupPayload(payload, repository), /rolled back/);
  assert.deepEqual(JSON.parse(values.get(inventoryItemsStorageKey)), [{ id: "before-failure" }]);
  assert.deepEqual(JSON.parse(values.get(profileKey)), { companyName: "Before failed restore" });
});

test("rejects unsupported data stores instead of importing them", () => {
  const payload = createBackupPayload(collectBackupData(storageWith({}).storage), { now });
  assert.throws(() => previewBackupPayload({ ...payload, data: { ...payload.data, "unexpected:key": [] } }), /unsupported data store/);
});

test("collectBackupData: collects business-scoped company profile, cheques, loans, and service reminder records", () => {
  const scopedProfileKey = "ledgerly:companyProfile.v1:demo-business";
  const scopedChequeKey = "usv.cheques.v1:demo-business";
  const scopedLoanKey = "usv.loanAccounts.v1:demo-business";
  const reminderKey = "ledgerly:serviceReminderRecords.v1";

  const fixture = storageWith({
    [scopedProfileKey]: JSON.stringify({
      companyName: "Sai Kirana Stores",
      businessType: "Retail",
      businessCategory: "Grocery",
      logoUrl: "https://res.cloudinary.com/demo/image/upload/logo.png",
      signatureUrl: "https://res.cloudinary.com/demo/image/upload/sig.png",
    }),
    [scopedChequeKey]: JSON.stringify([{ id: "chq-1", amount: 15000, chequeNumber: "123456" }]),
    [scopedLoanKey]: JSON.stringify([{ id: "loan-1", accountName: "Mudra Loan", principalAmount: 50000 }]),
    [reminderKey]: JSON.stringify([{ id: "srv-1", customerName: "Ramesh", serviceName: "Maintenance" }]),
  });

  const collected = collectBackupData(fixture.storage);
  const payload = createBackupPayload(collected, { now });

  // 1. Must collect company profile under canonical key with all fields preserved
  assert.equal(payload.data["ledgerly:companyProfile.v1"]?.companyName, "Sai Kirana Stores");
  assert.equal(payload.data["ledgerly:companyProfile.v1"]?.businessType, "Retail");
  assert.equal(payload.data["ledgerly:companyProfile.v1"]?.logoUrl, "https://res.cloudinary.com/demo/image/upload/logo.png");

  // 2. Must collect cheques under canonical key usv.cheques.v1
  assert.equal(Array.isArray(payload.data["usv.cheques.v1"]), true);
  assert.equal(payload.data["usv.cheques.v1"].length, 1);
  assert.equal(payload.data["usv.cheques.v1"][0].chequeNumber, "123456");

  // 3. Must collect loans under canonical key usv.loanAccounts.v1
  assert.equal(Array.isArray(payload.data["usv.loanAccounts.v1"]), true);
  assert.equal(payload.data["usv.loanAccounts.v1"].length, 1);
  assert.equal(payload.data["usv.loanAccounts.v1"][0].principalAmount, 50000);

  // 4. Must collect service reminders under ledgerly:serviceReminderRecords.v1
  assert.equal(Array.isArray(payload.data["ledgerly:serviceReminderRecords.v1"]), true);
  assert.equal(payload.data["ledgerly:serviceReminderRecords.v1"].length, 1);
  assert.equal(payload.data["ledgerly:serviceReminderRecords.v1"][0].customerName, "Ramesh");
});

test("previewBackupPayload: handles cross-business restore and scoped keys without unsupported data-store error", () => {
  const foreignPayload = {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    createdAt: "2026-11-20T10:00:00.000Z",
    application: { name: "USV", version: "1.0.0" },
    manifest: { included: [] },
    data: {
      "ledgerly:companyProfile.v1:foreign-branch": { companyName: "Foreign Branch Co" },
      "usv.cheques.v1:foreign-branch": [{ id: "c1", chequeNumber: "555555" }],
      "usv.loanAccounts.v1:foreign-branch": [{ id: "l1", accountName: "Branch Loan" }],
      "ledgerly:serviceReminderRecords.v1:foreign-branch": [{ id: "s1", serviceName: "Inspection" }],
      "ledgerly:parties.v1": [{ id: "p1", partyName: "Foreign Customer" }],
    },
  };

  const preview = previewBackupPayload(foreignPayload);
  assert.equal(preview.companyName, "Foreign Branch Co");
  assert.equal(preview.entries.length, 5);

  const categories = preview.entries.map((e) => e.category);
  assert.ok(categories.includes("Company profile"));
  assert.ok(categories.includes("Cash & bank"));
  assert.ok(categories.includes("Loans"));
  assert.ok(categories.includes("Settings"));
  assert.ok(categories.includes("Parties"));
});
