import test from "node:test";
import assert from "node:assert/strict";
import {
  getAppSettings,
  saveAppSettings,
  APP_SETTINGS_KEY,
  APP_SETTINGS_UPDATED_EVENT,
} from "./appSettingsStorage.js";
import {
  getInventoryItems,
  saveInventoryItem,
  inventoryItemsStorageKey,
  sameInventoryItemIdentity,
} from "./itemsStorage.js";

class MockMemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

function setupMockEnvironment() {
  const storage = new MockMemoryStorage();
  const dispatchedEvents = [];
  globalThis.window = {
    localStorage: storage,
    dispatchEvent: (event) => dispatchedEvents.push(event),
  };
  globalThis.localStorage = storage;
  return { storage, dispatchedEvents };
}

function tearDownMockEnvironment() {
  delete globalThis.window;
  delete globalThis.localStorage;
}

test("Item Settings Persistence & Default Values", () => {
  const { storage, dispatchedEvents } = setupMockEnvironment();

  // 1. Initial defaults
  const defaults = getAppSettings();
  assert.equal(defaults.enableBarcodeScanning, true);
  assert.equal(defaults.enableItemCategory, true);
  assert.equal(defaults.enableBatchTracking, false);
  assert.equal(defaults.enableSerialTracking, false);

  // 2. Save new settings
  const updated = saveAppSettings({
    ...defaults,
    enableBatchTracking: true,
    enableSerialTracking: true,
  });
  assert.equal(updated.enableBatchTracking, true);
  assert.equal(updated.enableSerialTracking, true);

  // 3. Verify event dispatched
  assert.ok(dispatchedEvents.some((e) => e.type === APP_SETTINGS_UPDATED_EVENT));

  // 4. Persistence across reads
  const reloaded = getAppSettings();
  assert.equal(reloaded.enableBatchTracking, true);
  assert.equal(reloaded.enableSerialTracking, true);
  assert.equal(reloaded.enableBarcodeScanning, true);
  assert.equal(reloaded.enableItemCategory, true);

  // 5. Raw localStorage validation
  const raw = JSON.parse(storage.getItem(APP_SETTINGS_KEY));
  assert.equal(raw.enableBatchTracking, true);
  assert.equal(raw.enableSerialTracking, true);

  tearDownMockEnvironment();
});

test("Setting 1: Barcode Scanning Support - normalization, lookup, and data preservation", () => {
  const { storage } = setupMockEnvironment();

  // Create item with barcode
  const itemWithBarcode = {
    id: "item-bc-1",
    itemName: "Wireless Mouse",
    itemCode: "WM-01",
    barcode: "8901234567890",
    salePrice: 500,
    openingQuantity: 10,
  };
  saveInventoryItem(itemWithBarcode);

  const items = getInventoryItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].barcode, "8901234567890");

  // Lookup matches by barcode
  const lookupByBarcode = {
    id: "different-id",
    itemName: "Different Name",
    barcode: "8901234567890",
  };
  assert.ok(sameInventoryItemIdentity(items[0], lookupByBarcode));

  // Data safety: when barcode scanning setting is disabled, barcode data is not deleted
  saveAppSettings({
    ...getAppSettings(),
    enableBarcodeScanning: false,
  });

  // Re-read items from storage
  const persistedItems = getInventoryItems();
  assert.equal(persistedItems[0].barcode, "8901234567890", "Barcode must be preserved even when setting is disabled");

  tearDownMockEnvironment();
});

test("Setting 2: Category & Sub-Category - normalization and preservation", () => {
  const { storage } = setupMockEnvironment();

  // Create item with Category and SubCategory
  const itemWithCategory = {
    id: "item-cat-1",
    itemName: "iPhone 15",
    itemCode: "IP15",
    category: "Electronics",
    subCategory: "Mobiles",
    salePrice: 79999,
    openingQuantity: 5,
  };
  saveInventoryItem(itemWithCategory);

  const items = getInventoryItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].category, "Electronics");
  assert.equal(items[0].subCategory, "Mobiles");

  // Disable item category setting
  saveAppSettings({
    ...getAppSettings(),
    enableItemCategory: false,
  });

  // Data safety: Category and SubCategory must remain preserved in storage
  const persistedItems = getInventoryItems();
  assert.equal(persistedItems[0].category, "Electronics", "Category must be preserved when disabled");
  assert.equal(persistedItems[0].subCategory, "Mobiles", "Sub-category must be preserved when disabled");

  tearDownMockEnvironment();
});

test("Setting 3: Batch Number & Expiry Date Tracking - quantity calculation & preservation", () => {
  const { storage } = setupMockEnvironment();

  // Create item with multiple batches
  const itemWithBatches = {
    id: "item-batch-1",
    itemName: "Paracetamol 500mg",
    itemCode: "PARA-500",
    batches: [
      { batchNo: "B001", expDate: "2026-12-31", quantity: 30, mrp: 20 },
      { batchNo: "B002", expDate: "2027-06-30", quantity: 20, mrp: 20 },
    ],
    salePrice: 20,
  };
  saveInventoryItem(itemWithBatches);

  const items = getInventoryItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].batches.length, 2);
  // Opening quantity should sum the batches
  assert.equal(Number(items[0].openingQuantity), 50);

  // Disable batch tracking setting
  saveAppSettings({
    ...getAppSettings(),
    enableBatchTracking: false,
  });

  // Data safety: Batches and stock must remain completely preserved
  const persistedItems = getInventoryItems();
  assert.equal(persistedItems[0].batches.length, 2, "Batches must be preserved when disabled");
  assert.equal(persistedItems[0].batches[0].batchNo, "B001");
  assert.equal(persistedItems[0].batches[0].expDate, "2026-12-31");
  assert.equal(Number(persistedItems[0].openingQuantity), 50);

  tearDownMockEnvironment();
});

test("Setting 4: Serial Number / IMEI Tracking per Unit - sync, deduplication & preservation", () => {
  const { storage } = setupMockEnvironment();

  // Create item with serial numbers (with a duplicate to test deduplication)
  const itemWithSerials = {
    id: "item-sn-1",
    itemName: "MacBook Pro M3",
    itemCode: "MBP-M3",
    serialNumbers: ["SN-1001", "SN-1002", "SN-1003", "SN-1001"], // duplicate SN-1001
    salePrice: 199999,
  };
  saveInventoryItem(itemWithSerials);

  const items = getInventoryItems();
  assert.equal(items.length, 1);
  // Deduplicated serial numbers
  assert.deepEqual(items[0].serialNumbers, ["SN-1001", "SN-1002", "SN-1003"]);
  // Opening quantity automatically synchronized to unique serials length
  assert.equal(Number(items[0].openingQuantity), 3);

  // Disable serial tracking setting
  saveAppSettings({
    ...getAppSettings(),
    enableSerialTracking: false,
  });

  // Data safety: Serials must remain completely preserved
  const persistedItems = getInventoryItems();
  assert.deepEqual(
    persistedItems[0].serialNumbers,
    ["SN-1001", "SN-1002", "SN-1003"],
    "Serial numbers must be preserved when disabled"
  );
  assert.equal(Number(persistedItems[0].openingQuantity), 3);

  tearDownMockEnvironment();
});

test("Transaction Rows: Preservation of Batch, Expiry, and Serial Numbers in Invoices", () => {
  const { storage } = setupMockEnvironment();

  const invoiceRow = {
    id: "row-1",
    item: "Samsung S24 Ultra",
    code: "S24U",
    barcode: "880123456789",
    category: "Smartphones",
    qty: "2",
    unit: "PCS",
    price: "120000",
    batchNo: "BATCH-S24",
    expDate: "2028-12-31",
    serialNumbers: ["IMEI-001", "IMEI-002"],
    amount: "240000",
  };

  const invoiceRecord = {
    id: "inv-001",
    invoiceNumber: "INV-101",
    date: "2026-11-04",
    rows: [invoiceRow],
  };

  storage.setItem("ledgerly:saleInvoices.v1", JSON.stringify([invoiceRecord]));

  const rawInvoices = JSON.parse(storage.getItem("ledgerly:saleInvoices.v1"));
  const row = rawInvoices[0].rows[0];

  assert.equal(row.batchNo, "BATCH-S24");
  assert.equal(row.expDate, "2028-12-31");
  assert.deepEqual(row.serialNumbers, ["IMEI-001", "IMEI-002"]);
  assert.equal(row.barcode, "880123456789");
  assert.equal(row.category, "Smartphones");

  tearDownMockEnvironment();
});

test("Combination: All 4 settings enabled simultaneously", () => {
  const { storage } = setupMockEnvironment();

  saveAppSettings({
    enableBarcodeScanning: true,
    enableItemCategory: true,
    enableBatchTracking: true,
    enableSerialTracking: true,
  });

  const fullItem = {
    id: "item-full-1",
    itemName: "Smart Galaxy Tab",
    itemCode: "TAB-01",
    barcode: "880912345678",
    category: "Electronics",
    subCategory: "Tablets",
    batches: [{ batchNo: "BATCH-T1", expDate: "2028-01-01", quantity: 2 }],
    serialNumbers: ["TAB-SN-001", "TAB-SN-002"],
    salePrice: 45000,
    openingQuantity: 2,
  };

  saveInventoryItem(fullItem);

  const retrieved = getInventoryItems()[0];
  assert.equal(retrieved.barcode, "880912345678");
  assert.equal(retrieved.category, "Electronics");
  assert.equal(retrieved.subCategory, "Tablets");
  assert.equal(retrieved.batches.length, 1);
  assert.equal(retrieved.batches[0].batchNo, "BATCH-T1");
  assert.deepEqual(retrieved.serialNumbers, ["TAB-SN-001", "TAB-SN-002"]);

  tearDownMockEnvironment();
});

test("Combination: All 4 settings disabled simultaneously preserves existing data", () => {
  const { storage } = setupMockEnvironment();

  // First save with all attributes
  const fullItem = {
    id: "item-full-2",
    itemName: "Enterprise Server",
    itemCode: "SRV-01",
    barcode: "123456789012",
    category: "Hardware",
    subCategory: "Servers",
    batches: [{ batchNo: "SRV-B1", expDate: "2029-01-01", quantity: 1 }],
    serialNumbers: ["SRV-SN-999"],
    salePrice: 500000,
    openingQuantity: 1,
  };
  saveInventoryItem(fullItem);

  // Now disable all 4 settings
  saveAppSettings({
    enableBarcodeScanning: false,
    enableItemCategory: false,
    enableBatchTracking: false,
    enableSerialTracking: false,
  });

  // Re-read item - verify all 4 specialized data fields are preserved
  const retrieved = getInventoryItems()[0];
  assert.equal(retrieved.barcode, "123456789012");
  assert.equal(retrieved.category, "Hardware");
  assert.equal(retrieved.subCategory, "Servers");
  assert.equal(retrieved.batches.length, 1);
  assert.deepEqual(retrieved.serialNumbers, ["SRV-SN-999"]);
  assert.equal(Number(retrieved.openingQuantity), 1);

  tearDownMockEnvironment();
});
