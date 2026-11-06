import test from "node:test";
import assert from "node:assert/strict";
import { getInventoryItems, saveInventoryItem } from "./itemsStorage.js";
import { loadGrowthItems, saveGrowthItem } from "./businessGrowthData.js";
import { saveBusinessItem } from "./businessRecords.js";

// Mock localStorage and window for Node test environment
if (typeof window === "undefined" || !window.localStorage) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

test("Items section items are accessible in online store", async () => {
  window.localStorage.clear();

  // 1. Add item from Items section using saveBusinessItem or saveInventoryItem
  const sampleItem = {
    id: "item-paper-a4",
    itemName: "A4 Premium Copier Paper - 500 Sheets",
    salePrice: "350",
    openingQuantity: "34",
    unit: "PCS",
    category: "Office Supplies",
  };
  saveInventoryItem(sampleItem);

  // Verify item exists in universal inventory
  const inventoryItems = getInventoryItems();
  assert.equal(inventoryItems.length, 1);
  assert.equal(inventoryItems[0].itemName, "A4 Premium Copier Paper - 500 Sheets");

  // 2. Verify Online Store loadGrowthItems() loads this item
  const storeItems = await loadGrowthItems();
  const found = storeItems.find((it) => it.id === "item-paper-a4");
  assert.ok(found, "Item from items section must be loaded in online store items");
  assert.equal(found.itemName, "A4 Premium Copier Paper - 500 Sheets");
  assert.equal(found.salePrice, "350");
  assert.equal(found.openingQuantity, "34");
});

test("Adding an item from Online Store saves to universal items inventory", async () => {
  window.localStorage.clear();

  // 1. User adds item from Online Store using AddItem form logic (calls saveGrowthItem)
  const newOnlineItem = {
    itemName: "BluePeak Gel Pen - Blue",
    salePrice: "20",
    openingQuantity: "60",
    unit: "PCS",
    category: "Stationery",
  };
  const saved = await saveGrowthItem(newOnlineItem);
  assert.ok(saved.id, "Saved item should have an id");
  assert.equal(saved.itemName, "BluePeak Gel Pen - Blue");

  // 2. Verify it is now immediately accessible in getInventoryItems() (the Items section)
  const inventory = getInventoryItems();
  const matched = inventory.find((it) => it.id === saved.id || it.itemName === "BluePeak Gel Pen - Blue");
  assert.ok(matched, "Item added from Online Store must be in universal Items section inventory");
  assert.equal(matched.salePrice, "20");
  assert.equal(matched.openingQuantity, "60");

  // 3. Verify it is also returned by loadGrowthItems()
  const onlineItems = await loadGrowthItems();
  const onlineMatched = onlineItems.find((it) => it.id === saved.id);
  assert.ok(onlineMatched, "Item added from Online Store must be accessible in Online Store");
});

test("Saving item from Items section is immediately reflected in Online Store", async () => {
  window.localStorage.clear();

  const freshItem = {
    itemName: "Desk Organizer - Graphite",
    salePrice: "450",
    openingQuantity: "18",
    unit: "PCS",
  };
  const saved = await saveBusinessItem(freshItem);

  const growthItems = await loadGrowthItems();
  const found = growthItems.find((it) => it.id === saved.id);
  assert.ok(found, "Item saved via saveBusinessItem must be in loadGrowthItems");
  assert.equal(found.itemName, "Desk Organizer - Graphite");
});

