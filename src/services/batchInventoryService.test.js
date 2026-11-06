import test from "node:test";
import assert from "node:assert/strict";
import { batchMovementStorageKey, listBatchExpiryStatus, moveBatchRows, reconcileBatchQuantities, reverseBatchMovement } from "./batchInventoryService.js";
import { applyBatchRowsToInventory as applyItemBatchRows, inventoryItemsStorageKey } from "./itemsStorage.js";
import { saveInventoryAdjustment, cancelInventoryAdjustment } from "./inventoryAdjustmentsStorage.js";

function memoryWindow(initial) {
  const values = new Map(Object.entries(initial));
  const prior = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) } };
  return { values, restore: () => { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; } };
}

test("batch service journals movements, prevents duplicates and reverses once", () => {
  const store = memoryWindow({ [inventoryItemsStorageKey]: JSON.stringify([{ id: "i", itemName: "Item", stock: "5", openingQuantity: "5", batches: [{ id: "b", batchNo: "A", openingQty: "5" }] }]) });
  try {
    const rows = [{ sourceItemId: "i", item: "Item", batchNo: "A", qty: "2" }];
    moveBatchRows(rows, "reduce", { referenceId: "sale-1", sourceType: "sale" });
    moveBatchRows(rows, "reduce", { referenceId: "sale-1", sourceType: "sale" });
    assert.equal(JSON.parse(store.values.get(inventoryItemsStorageKey))[0].stock, "3");
    assert.equal(JSON.parse(store.values.get(batchMovementStorageKey)).length, 1);
    assert.equal(reverseBatchMovement("sale-1", "sale").reversed, true);
    assert.equal(reverseBatchMovement("sale-1", "sale").reversed, false);
    assert.equal(JSON.parse(store.values.get(inventoryItemsStorageKey))[0].stock, "5");
  } finally { store.restore(); }
});

test("expiry status excludes missing dates and uses calendar day boundaries", () => {
  const rows = listBatchExpiryStatus({ today: "2026-04-01", items: [{ id: "i", itemName: "Item", batches: [
    { batchNo: "expired", expDate: "2026-03-31", openingQty: "1" },
    { batchNo: "near", expDate: "2026-04-30", openingQty: "2" },
    { batchNo: "valid", expDate: "2026-05-02", openingQty: "3" },
    { batchNo: "none", expDate: "", openingQty: "4" },
  ] }] });
  assert.deepEqual(rows.map((row) => row.status), ["Expired", "Near expiry", "Not expired"]);
});

test("reconciliation reports differences without changing stock", () => {
  const items = [{ id: "i", itemName: "Item", stock: "8", openingQuantity: "8", batches: [{ batchNo: "A", openingQty: "5" }] }];
  assert.equal(reconcileBatchQuantities(items)[0].difference, 3);
  assert.equal(items[0].stock, "8");
});

test("batch movements refuse to overwrite unreconciled aggregate stock", () => {
  const store = memoryWindow({ [inventoryItemsStorageKey]: JSON.stringify([{ id: "i", itemName: "Item", stock: "8", openingQuantity: "8", batches: [{ batchNo: "A", openingQty: "5" }] }]) });
  try {
    assert.throws(() => applyItemBatchRows([{ sourceItemId: "i", item: "Item", batchNo: "A", qty: 1 }], "reduce"), /does not reconcile/);
    assert.equal(JSON.parse(store.values.get(inventoryItemsStorageKey))[0].stock, "8");
  } finally { store.restore(); }
});

test("batch adjustments add to a selected batch, reject excess reduction and reverse once", () => {
  const store = memoryWindow({ [inventoryItemsStorageKey]: JSON.stringify([{ id: "i", itemName: "Item", stock: "5", openingQuantity: "5", batches: [{ id: "b", batchNo: "A", openingQty: "5" }] }]) });
  try {
    const added = saveInventoryAdjustment({ itemId: "i", itemName: "Item", batchTracked: true, direction: "add", quantity: 2, batchNo: "A" });
    assert.equal(JSON.parse(store.values.get(inventoryItemsStorageKey))[0].stock, "7");
    assert.throws(() => saveInventoryAdjustment({ itemId: "i", itemName: "Item", batchTracked: true, direction: "reduce", quantity: 8, batchNo: "A" }), /only 7 in stock/);
    cancelInventoryAdjustment(added.id);
    cancelInventoryAdjustment(added.id);
    assert.equal(JSON.parse(store.values.get(inventoryItemsStorageKey))[0].stock, "5");
  } finally { store.restore(); }
});
