import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { zipSync } from "fflate";
import initSqlJs from "sql.js";
import { importVyaparPreview, previewVyaparImport } from "./vyaparImportService.js";
import { parseVyaparBackup } from "./vyaparBackupParser.js";
import { mapVyaparData } from "./vyaparDataMapper.js";
import { createLocalVyaparImportRepository } from "./vyaparImportRepository.js";
import { inventoryItemsStorageKey } from "./itemsStorage.js";
import { partiesStorageKey } from "./partiesStorage.js";
import { saleInvoicesStorageKey } from "./salesStorage.js";

const fixture = new Uint8Array(fs.readFileSync(fileURLToPath(new URL("./__fixtures__/vyapar-bluepeak-redacted.vyb", import.meta.url))));
const wasmBinary = fs.readFileSync(fileURLToPath(new URL("../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url)));
let sqlRuntime;

async function openDatabase(bytes) {
  sqlRuntime ||= initSqlJs({ wasmBinary });
  const SQL = await sqlRuntime;
  return new SQL.Database(bytes);
}

class MemoryStorage {
  values = new Map();
  failNextKey = "";

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failNextKey) {
      this.failNextKey = "";
      throw new Error("Simulated storage write failure");
    }
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

function makeRepository(storage = new MemoryStorage()) {
  return { storage, repository: createLocalVyaparImportRepository(storage) };
}

test("parses the redacted real .vyb fixture and verifies the sample's transaction structure", async () => {
  const { repository } = makeRepository();
  const preview = await previewVyaparImport(fixture, { openDatabase }, { repository });

  assert.equal(preview.fileSummary.transactions, 4);
  assert.equal(preview.counts.customers, 6);
  assert.equal(preview.counts.suppliers, 5);
  assert.equal(preview.counts.items, 6);
  assert.equal(preview.counts.salesInvoices, 4);
  assert.equal(preview.readyCounts.salesInvoices, 1);
  assert.equal(preview.counts.purchaseInvoices, 0);
  assert.equal(preview.counts.unclassifiedTransactions, 0);
  assert.equal(preview.invalidRecords.length, 3);
  assert.equal(preview.salesInvoices[0].sourceData.typeCode, 1);
  assert.equal(preview.salesInvoices[0].form.invoiceNumber, "3");
  assert.equal(preview.salesInvoices[0].rows.length, 2);
  assert.equal(preview.salesInvoices[0].rows[0].sourceItemId, "vyapar-item-2");
  assert.equal(preview.salesInvoices[0].rows[1].unit, "Bag");
  assert.equal(preview.salesInvoices[0].form.customerId, "vyapar-party-8");
  assert.ok(preview.invalidRecords.every((entry) => entry.reason.includes("line items")));
});

test("rejects unreadable and unsupported backup archives", async () => {
  const { repository } = makeRepository();
  await assert.rejects(
    previewVyaparImport(new Uint8Array([1, 2, 3]), { openDatabase }, { repository }),
    /not a readable ZIP backup/,
  );
  await assert.rejects(
    previewVyaparImport(new Uint8Array(zipSync({ "notes.txt": new TextEncoder().encode("not a database") })), { openDatabase }, { repository }),
    /contains no supported \.vyp database/,
  );
  await assert.rejects(
    previewVyaparImport(new Uint8Array(zipSync({ "invalid.vyp": new TextEncoder().encode("not SQLite") })), { openDatabase }, { repository }),
    /not a SQLite database/,
  );
});

test("does not import a sale invoice whose source product relationship is invalid", async () => {
  const parsed = await parseVyaparBackup(fixture, { openDatabase });
  const transaction = parsed.transactions.find((entry) => entry.lineItems.length > 0);
  transaction.lineItems[0].item_id = 987654321;
  const mapped = mapVyaparData(parsed);

  assert.equal(mapped.salesInvoices.length, 0);
  assert.ok(mapped.invalidRecords.some((entry) => entry.sourceId === String(transaction.txn_id) && entry.reason.includes("missing product")));
});

test("keeps a transaction with an unknown type code unsupported", async () => {
  const parsed = await parseVyaparBackup(fixture, { openDatabase });
  parsed.transactions[0].txn_type = 987;
  const mapped = mapVyaparData(parsed);

  assert.equal(mapped.counts.unclassifiedTransactions, 1);
  assert.ok(mapped.skipped.some((entry) => entry.sourceId === "1" && /not verified/.test(entry.reason)));
  assert.ok(!mapped.salesInvoices.some((invoice) => invoice.sourceId === "1"));
});

test("imports linked supported records, preserves current profile unless opted in, and skips the same backup on repeat", async () => {
  const { storage, repository } = makeRepository();
  storage.setItem("ledgerly:companyProfile.v1", JSON.stringify({ companyName: "Current USV Company" }));
  const preview = await previewVyaparImport(fixture, { openDatabase }, { repository });

  const first = await importVyaparPreview(preview, { repository });
  assert.deepEqual(first.imported, {
    items: 6,
    parties: 11,
    salesInvoices: 1,
    purchaseInvoices: 0,
    receipts: 0,
    payments: 0,
    companyProfile: 0,
  });
  assert.equal(JSON.parse(storage.getItem("ledgerly:companyProfile.v1")).companyName, "Current USV Company");
  const savedInvoices = JSON.parse(storage.getItem(saleInvoicesStorageKey));
  assert.equal(savedInvoices.length, preview.readyCounts.salesInvoices);
  assert.ok(JSON.parse(storage.getItem(inventoryItemsStorageKey)).some((item) => item.id === savedInvoices[0].rows[0].sourceItemId));
  assert.ok(JSON.parse(storage.getItem(partiesStorageKey)).some((party) => party.id === savedInvoices[0].form.customerId));

  const secondPreview = await previewVyaparImport(fixture, { openDatabase }, { repository });
  assert.equal(secondPreview.duplicates.items, 6);
  assert.equal(secondPreview.duplicates.parties, 11);
  assert.equal(secondPreview.duplicates.salesInvoices, 1);
  const second = await importVyaparPreview(secondPreview, { repository });
  assert.equal(Object.values(second.imported).reduce((sum, count) => sum + count, 0), 0);
  assert.equal(Object.values(second.duplicates).reduce((sum, count) => sum + count, 0), 18);
  assert.equal(JSON.parse(storage.getItem(saleInvoicesStorageKey)).length, 1);
});

test("rolls back all previously written stores when a later store fails", async () => {
  const { storage, repository } = makeRepository();
  storage.setItem(inventoryItemsStorageKey, JSON.stringify([{ id: "existing-item" }]));
  storage.setItem(partiesStorageKey, JSON.stringify([{ id: "existing-party" }]));
  const previousItems = storage.getItem(inventoryItemsStorageKey);
  const previousParties = storage.getItem(partiesStorageKey);
  const preview = await previewVyaparImport(fixture, { openDatabase }, { repository });
  storage.failNextKey = partiesStorageKey;

  await assert.rejects(importVyaparPreview(preview, { repository }), /rolled back/);
  assert.equal(storage.getItem(inventoryItemsStorageKey), previousItems);
  assert.equal(storage.getItem(partiesStorageKey), previousParties);
  assert.equal(storage.getItem(saleInvoicesStorageKey), null);
});

test("replaces company profile only after explicit opt-in", async () => {
  const { storage, repository } = makeRepository();
  storage.setItem("ledgerly:companyProfile.v1", JSON.stringify({ companyName: "Current USV Company" }));
  const preview = await previewVyaparImport(fixture, { openDatabase }, { repository });
  await importVyaparPreview(preview, { repository, includeCompanyProfile: true });
  assert.equal(JSON.parse(storage.getItem("ledgerly:companyProfile.v1")).companyName, "Redacted Test Company");
});
