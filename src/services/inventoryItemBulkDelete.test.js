import test from "node:test";
import assert from "node:assert/strict";
import { deleteAllInventoryItems, previewDeleteAllInventoryItems } from "./inventoryItemBulkDelete.js";
import { getInventoryItems, inventoryItemsStorageKey } from "./itemsStorage.js";
import { loadBusinessItems } from "./businessRecords.js";

class MemoryStorage {
  values = new Map();
  failKey = "";
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (key === this.failKey) throw new Error("storage write failed"); this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function setup() {
  const storage = new MemoryStorage();
  globalThis.window = { localStorage: storage };
  const previousFetch = globalThis.fetch;
  let backendCalls = 0;
  globalThis.fetch = async () => { backendCalls += 1; throw new Error("Unexpected backend request"); };
  storage.setItem(inventoryItemsStorageKey, JSON.stringify([
    { id: "test-1", itemName: "Test One" },
    { id: "test-2", itemName: "Test Two" },
  ]));
  storage.setItem("ledgerly:itemsCsvImports.v1", JSON.stringify([{ id: "test-3", itemName: "Test Three" }]));
  storage.setItem("ledgerly:itemsUiOverrides.v1", JSON.stringify({ edits: { "test-1": { itemName: "Edited" } }, deleted: [] }));
  storage.setItem("ledgerly:inventoryItems.legacyDatabaseMigration.v1", JSON.stringify("false"));
  storage.setItem("ledgerly:saleInvoices.v1", JSON.stringify([{ id: "sale-1", total: 60, rows: [{ sourceItemId: "test-1", item: "Test One", qty: 2, price: 30 }] }]));
  storage.setItem("ledgerly:purchaseBills.v1", JSON.stringify([{ id: "purchase-1", total: 45, rows: [{ sourceItemId: "test-2", item: "Test Two", qty: 3, price: 15 }] }]));
  storage.setItem("ledgerly:parties.v1", JSON.stringify([{ id: "party-1", partyName: "Test Customer" }]));
  storage.setItem("ledgerly:paymentIns.v1", JSON.stringify([{ id: "payment-1", amount: 60 }]));
  storage.setItem("ledgerly:paymentOuts.v1", JSON.stringify([{ id: "payment-out-1", amount: 45 }]));
  const preservedKeys = ["ledgerly:saleInvoices.v1", "ledgerly:purchaseBills.v1", "ledgerly:parties.v1", "ledgerly:paymentIns.v1", "ledgerly:paymentOuts.v1"];
  const before = new Map(preservedKeys.map((key) => [key, storage.getItem(key)]));
  return {
    storage, before, get backendCalls() { return backendCalls; },
    restore: () => { globalThis.fetch = previousFetch; delete globalThis.window; },
  };
}

test("deletes three item master records from the repository and keeps them deleted after reload", async () => {
  const context = setup();
  try {
    assert.deepEqual(previewDeleteAllInventoryItems(), { local: 3 });
    const result = deleteAllInventoryItems(3);
    assert.deepEqual(result, { deletedLocal: 3 });

    // Verify the actual repository storage key, not only the service return value.
    assert.equal(context.storage.getItem(inventoryItemsStorageKey), "[]");
    assert.deepEqual(JSON.parse(context.storage.getItem(inventoryItemsStorageKey)), []);
    assert.equal(context.storage.getItem("ledgerly:itemsCsvImports.v1"), "[]");
    assert.equal(context.storage.getItem("ledgerly:itemsUiOverrides.v1"), JSON.stringify({ edits: {}, deleted: [] }));
    assert.equal(context.storage.getItem("ledgerly:inventoryItems.legacyDatabaseMigration.v1"), null);

    // The Items repository and page loader see no records after a page reload/restart.
    assert.deepEqual(getInventoryItems(), []);
    assert.deepEqual(await loadBusinessItems(), []);
    assert.deepEqual(getInventoryItems(), []);
    assert.equal(context.backendCalls, 0);

    for (const [key, raw] of context.before) assert.equal(context.storage.getItem(key), raw, `${key} must remain unchanged`);
  } finally { context.restore(); }
});

test("empty item repositories stay empty", () => {
  const context = setup();
  context.storage.setItem(inventoryItemsStorageKey, "[]");
  context.storage.setItem("ledgerly:itemsCsvImports.v1", "[]");
  try {
    assert.deepEqual(previewDeleteAllInventoryItems(), { local: 0 });
    assert.deepEqual(deleteAllInventoryItems(0), { deletedLocal: 0 });
    assert.deepEqual(JSON.parse(context.storage.getItem(inventoryItemsStorageKey)), []);
    assert.equal(context.backendCalls, 0);
  } finally { context.restore(); }
});

test("storage failure rolls back earlier writes and leaves historical data untouched", () => {
  const context = setup();
  context.storage.failKey = "ledgerly:itemsCsvImports.v1";
  try {
    assert.throws(() => deleteAllInventoryItems(3), /storage write failed/);
    assert.equal(JSON.parse(context.storage.getItem(inventoryItemsStorageKey)).length, 2);
    assert.equal(JSON.parse(context.storage.getItem("ledgerly:itemsCsvImports.v1")).length, 1);
    for (const [key, raw] of context.before) assert.equal(context.storage.getItem(key), raw, `${key} must remain unchanged`);
    assert.equal(context.backendCalls, 0);
  } finally { context.restore(); }
});
