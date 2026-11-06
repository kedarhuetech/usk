import test from "node:test";
import assert from "node:assert/strict";
import { deleteInventoryItem, getInventoryItems, inventoryItemsStorageKey, saveInventoryItem } from "./itemsStorage.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test("deleting an item clears duplicate local copies with the same SKU", () => {
  const storage = new MemoryStorage();
  globalThis.window = { localStorage: storage };
  storage.setItem(inventoryItemsStorageKey, JSON.stringify([
    { id: "visible", itemName: "Kedar", itemCode: "df", unit: "PCS" },
    { id: "duplicate", itemName: "Kedar", code: "DF", unit: "PCS" },
    { id: "different", itemName: "Kedar", itemCode: "other", unit: "PCS" },
  ]));

  deleteInventoryItem({ id: "visible", itemName: "Kedar", itemCode: "df", unit: "PCS" });

  const remaining = JSON.parse(storage.getItem(inventoryItemsStorageKey));
  assert.deepEqual(remaining.map((item) => item.id), ["different"]);
  delete globalThis.window;
});

test("item active state persists through normalization and reload", () => {
  const previousWindow = globalThis.window;
  const storage = new MemoryStorage();
  globalThis.window = { localStorage: storage };
  try {
    saveInventoryItem({ id: "inactive-item", itemName: "Inactive item", isActive: false, unit: "PCS", openingQuantity: "4" });
    const [item] = getInventoryItems();
    assert.equal(item.isActive, false);
    assert.equal(item.openingQuantity, "4");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
