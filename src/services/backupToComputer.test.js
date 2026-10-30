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
