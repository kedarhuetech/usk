import test from "node:test";
import assert from "node:assert/strict";
import { APP_SETTINGS_KEY } from "./appSettingsStorage.js";
import { inventoryItemsStorageKey } from "./itemsStorage.js";
import { savePurchaseBill, replacePurchaseBills, purchaseBillsStorageKey } from "./purchaseBillsStorage.js";

test("purchase batch receipt, edit and deletion update multiple batch allocations once", () => {
  const prior = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }, dispatchEvent: () => true };
  try {
    data.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    data.set(inventoryItemsStorageKey, JSON.stringify([{ id: "i", itemName: "Item", openingQuantity: "0", stock: "0", batches: [] }]));
    const bill = savePurchaseBill({ id: "p1", rows: [
      { id: "r1", sourceItemId: "i", item: "Item", batchNo: "A", expDate: "2099-01-01", qty: "4" },
      { id: "r2", sourceItemId: "i", item: "Item", batchNo: "B", expDate: "2099-02-01", qty: "3" },
    ] });
    let item = JSON.parse(data.get(inventoryItemsStorageKey))[0];
    assert.equal(item.openingQuantity, "7");
    savePurchaseBill({ ...bill, rows: [bill.rows[0], { ...bill.rows[1], qty: "5" }] });
    item = JSON.parse(data.get(inventoryItemsStorageKey))[0];
    assert.equal(item.openingQuantity, "9");
    assert.equal(item.batches.find((batch) => batch.batchNo === "A").openingQty, "4");
    assert.equal(item.batches.find((batch) => batch.batchNo === "B").openingQty, "5");
    replacePurchaseBills([]);
    item = JSON.parse(data.get(inventoryItemsStorageKey))[0];
    assert.equal(item.openingQuantity, "0");
    assert.equal(JSON.parse(data.get(purchaseBillsStorageKey)).length, 0);
  } finally { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; }
});
