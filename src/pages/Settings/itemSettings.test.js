import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  getAppSettings,
  saveAppSettings,
  APP_SETTINGS_KEY,
  APP_SETTINGS_UPDATED_EVENT,
} from "../../services/appSettingsStorage.js";
import { getUnits, addCustomUnit } from "../../services/unitsStorage.js";
import { saveSaleInvoice } from "../../services/salesStorage.js";
import { inventoryItemsStorageKey } from "../../services/itemsStorage.js";

// Mock localStorage if in Node environment
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
  };
}

test("Item settings exist with correct defaults matching USK desktop", () => {
  const settings = getAppSettings();

  // Column 1: Inventory & Item Properties
  assert.equal(settings.enableBarcodeScanning, true, "enableBarcodeScanning default is true");
  assert.equal(settings.enableItemCategory, true, "enableItemCategory default is true");
  assert.equal(settings.enableItemDescription, true, "enableItemDescription default is true");
  assert.equal(settings.enableBatchTracking, false, "enableBatchTracking default is false");
  assert.equal(settings.enableSerialTracking, false, "enableSerialTracking default is false");
  assert.equal(settings.stopSaleOnNegativeStock, false, "stopSaleOnNegativeStock default is false");
  assert.equal(settings.blockNewItemsFromTxn, false, "blockNewItemsFromTxn default is false");

  // Column 2: Units & Pricing Configuration
  assert.equal(settings.defaultItemUnit, "PCS", "defaultItemUnit default is PCS");
  assert.equal(settings.enableItemDiscount, true, "enableItemDiscount default is true");
  assert.equal(settings.enableGst, true, "enableGst default is true");
});

test("Item settings can be updated and retrieved reactively", () => {
  const updated = saveAppSettings({
    enableBarcodeScanning: false,
    enableItemCategory: false,
    enableItemDescription: false,
    enableBatchTracking: true,
    enableSerialTracking: true,
    stopSaleOnNegativeStock: true,
    blockNewItemsFromTxn: true,
    defaultItemUnit: "BOX",
    enableItemDiscount: false,
    enableGst: false,
  });

  assert.equal(updated.enableBarcodeScanning, false);
  assert.equal(updated.enableItemCategory, false);
  assert.equal(updated.enableItemDescription, false);
  assert.equal(updated.enableBatchTracking, true);
  assert.equal(updated.enableSerialTracking, true);
  assert.equal(updated.stopSaleOnNegativeStock, true);
  assert.equal(updated.blockNewItemsFromTxn, true);
  assert.equal(updated.defaultItemUnit, "BOX");
  assert.equal(updated.enableItemDiscount, false);
  assert.equal(updated.enableGst, false);

  const reloaded = getAppSettings();
  assert.equal(reloaded.defaultItemUnit, "BOX");
  assert.equal(reloaded.enableBatchTracking, true);
  assert.equal(reloaded.enableSerialTracking, true);
  assert.equal(reloaded.stopSaleOnNegativeStock, true);
  assert.equal(reloaded.blockNewItemsFromTxn, true);

  // Restore defaults
  saveAppSettings({
    enableBarcodeScanning: true,
    enableItemCategory: true,
    enableItemDescription: true,
    enableBatchTracking: false,
    enableSerialTracking: false,
    stopSaleOnNegativeStock: false,
    blockNewItemsFromTxn: false,
    defaultItemUnit: "PCS",
    enableItemDiscount: true,
    enableGst: true,
  });
});

test("Unit management functions correctly", () => {
  const initialUnits = getUnits();
  assert.ok(initialUnits.includes("PCS"), "Standard unit PCS is available");
  assert.ok(initialUnits.includes("BOX"), "Standard unit BOX is available");

  // Add custom unit
  const testUnitName = `CUSTOM_ROLL_${Date.now()}`;
  const updatedUnits = addCustomUnit(testUnitName);
  assert.ok(updatedUnits.includes(testUnitName), "New custom unit is added");

  // Adding duplicate unit does not duplicate
  const deduplicated = addCustomUnit(testUnitName);
  const count = deduplicated.filter((u) => u === testUnitName).length;
  assert.equal(count, 1, "Duplicate unit names are ignored");
});

test("Negative stock setting blocks sale when stock is zero or exceeded", () => {
  saveAppSettings({ stopSaleOnNegativeStock: true });

  // Seed inventory item with zero stock
  const testInventory = [
    {
      id: "item-out-of-stock",
      itemName: "Zero Stock Widget",
      openingQuantity: 0,
      stock: 0,
    },
  ];
  window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(testInventory));

  const saleTxn = {
    transactionType: "sale",
    partyName: "Test Party",
    items: [
      {
        itemId: "item-out-of-stock",
        item: "Zero Stock Widget",
        quantity: 5,
        price: 100,
      },
    ],
  };

  assert.throws(
    () => {
      saveSaleInvoice(saleTxn);
    },
    /Stop Sale on Negative Stock is enabled/i,
    "Throws when selling item with 0 stock and stopSaleOnNegativeStock is enabled"
  );

  // Restore setting
  saveAppSettings({ stopSaleOnNegativeStock: false });
});

test("Block new items setting prevents adding uncataloged items in transactions", () => {
  saveAppSettings({ blockNewItemsFromTxn: true });

  const uncatalogedSaleTxn = {
    transactionType: "sale",
    partyName: "Test Party",
    items: [
      {
        id: "",
        itemId: "",
        item: "New Unregistered Widget",
        quantity: 1,
        price: 50,
      },
    ],
  };

  assert.throws(
    () => {
      saveSaleInvoice(uncatalogedSaleTxn);
    },
    /Creating new items from transactions is blocked/i,
    "Throws when creating new uncataloged item during sale transaction"
  );

  // Restore setting
  saveAppSettings({ blockNewItemsFromTxn: false });
});
