import test from "node:test";
import assert from "node:assert/strict";
import { APP_SETTINGS_KEY } from "./appSettingsStorage.js";
import {
  getInventoryItems,
  saveInventoryItem,
  inventoryItemsStorageKey,
} from "./itemsStorage.js";
import {
  savePurchaseBill,
  replacePurchaseBills,
  purchaseBillsStorageKey,
} from "./purchaseBillsStorage.js";
import {
  saveSaleInvoice,
  saleInvoicesStorageKey,
} from "./salesStorage.js";
import {
  listBatchExpiryStatus,
  reconcileBatchQuantities,
  localDateOnly,
} from "./batchInventoryService.js";

function setupMockEnvironment(initialData = {}) {
  const store = new Map(Object.entries(initialData));
  const priorWindow = globalThis.window;
  const dispatchedEvents = [];

  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    dispatchEvent: (event) => {
      dispatchedEvents.push(event?.type || event);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return {
    store,
    dispatchedEvents,
    restore: () => {
      if (priorWindow === undefined) delete globalThis.window;
      else globalThis.window = priorWindow;
    },
  };
}

test("Test A: Purchase without batch increases aggregate stock by purchased quantity and creates no fake batches", () => {
  const env = setupMockEnvironment();
  try {
    env.store.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    saveInventoryItem({
      id: "item-paper",
      itemName: "A4 Premium Copier Paper - 500 Sheets",
      openingQuantity: "10",
      stock: "10",
      batches: [],
    });

    // Save purchase bill without batch
    savePurchaseBill({
      id: "bill-1",
      rows: [
        {
          id: "row-1",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "2",
          price: "198",
        },
      ],
    });

    const items = getInventoryItems();
    const paper = items.find((i) => i.id === "item-paper");
    assert.equal(paper.openingQuantity, "12", "Stock should be incremented from 10 to 12");
    assert.equal(paper.stock, "12", "Stock field should match openingQuantity");
    assert.equal(paper.batches.length, 0, "No fake batches should be created");
  } finally {
    env.restore();
  }
});

test("Test B: Purchase with batch creates batch record, updates aggregate stock, and reflects in Batch Expiry Report", () => {
  const env = setupMockEnvironment();
  try {
    env.store.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    saveInventoryItem({
      id: "item-paper",
      itemName: "A4 Premium Copier Paper - 500 Sheets",
      openingQuantity: "10",
      stock: "10",
      batches: [],
    });

    // Save purchase bill with batch entry
    const futureDate = "2027-12-31";
    savePurchaseBill({
      id: "bill-2",
      rows: [
        {
          id: "row-1",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "2",
          price: "198",
          batchNo: "BATCH-001",
          expDate: futureDate,
          mfgDate: "2026-01-01",
        },
      ],
    });

    const items = getInventoryItems();
    const paper = items.find((i) => i.id === "item-paper");
    assert.equal(paper.openingQuantity, "12", "Aggregate stock should be 10 + 2 = 12");
    assert.equal(paper.batches.length, 1, "One batch record should exist");
    assert.equal(paper.batches[0].batchNo, "BATCH-001");
    assert.equal(paper.batches[0].openingQty, "2");
    assert.equal(paper.batches[0].expDate, futureDate);

    // Verify Batch Expiry status
    const batchReport = listBatchExpiryStatus({ items });
    const paperBatch = batchReport.find((b) => b.batchNo === "BATCH-001");
    assert.ok(paperBatch, "Batch should appear in Batch Expiry Report");
    assert.equal(paperBatch.availableQty, 2);
    assert.equal(paperBatch.quantity, 2);
    assert.equal(paperBatch.status, "Not expired");
  } finally {
    env.restore();
  }
});

test("Test C: Multiple batches on same item calculate quantities accurately", () => {
  const env = setupMockEnvironment();
  try {
    env.store.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    saveInventoryItem({
      id: "item-paper",
      itemName: "A4 Premium Copier Paper - 500 Sheets",
      openingQuantity: "0",
      stock: "0",
      batches: [],
    });

    savePurchaseBill({
      id: "bill-3",
      rows: [
        {
          id: "row-1",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "5",
          batchNo: "BATCH-A",
          expDate: "2028-01-01",
        },
        {
          id: "row-2",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "10",
          batchNo: "BATCH-B",
          expDate: "2028-06-01",
        },
      ],
    });

    const items = getInventoryItems();
    const paper = items.find((i) => i.id === "item-paper");
    assert.equal(paper.openingQuantity, "15");
    assert.equal(paper.batches.length, 2);
    assert.equal(paper.batches.find((b) => b.batchNo === "BATCH-A").openingQty, "5");
    assert.equal(paper.batches.find((b) => b.batchNo === "BATCH-B").openingQty, "10");

    const warnings = reconcileBatchQuantities(items);
    assert.equal(warnings.length, 0, "No reconciliation warning when batch total equals aggregate");
  } finally {
    env.restore();
  }
});

test("Test D: Repeated purchase on existing batch increments batch quantity and aggregate stock", () => {
  const env = setupMockEnvironment();
  try {
    env.store.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    saveInventoryItem({
      id: "item-paper",
      itemName: "A4 Premium Copier Paper - 500 Sheets",
      openingQuantity: "0",
      stock: "0",
      batches: [],
    });

    savePurchaseBill({
      id: "bill-p1",
      rows: [
        {
          id: "r1",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "3",
          batchNo: "LOT-99",
          expDate: "2029-01-01",
        },
      ],
    });

    savePurchaseBill({
      id: "bill-p2",
      rows: [
        {
          id: "r2",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "7",
          batchNo: "LOT-99",
          expDate: "2029-01-01",
        },
      ],
    });

    const items = getInventoryItems();
    const paper = items.find((i) => i.id === "item-paper");
    assert.equal(paper.openingQuantity, "10", "Aggregate stock should be 3 + 7 = 10");
    assert.equal(paper.batches.length, 1, "Still 1 batch record for LOT-99");
    assert.equal(paper.batches[0].openingQty, "10", "Batch quantity should be 3 + 7 = 10");
  } finally {
    env.restore();
  }
});

test("Test E: Sale after purchase decrements aggregate stock and batch available quantity", () => {
  const env = setupMockEnvironment();
  try {
    env.store.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    saveInventoryItem({
      id: "item-paper",
      itemName: "A4 Premium Copier Paper - 500 Sheets",
      openingQuantity: "0",
      stock: "0",
      batches: [],
    });

    // Purchase 10 units of LOT-55
    savePurchaseBill({
      id: "bill-p",
      rows: [
        {
          id: "r1",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "10",
          batchNo: "LOT-55",
          expDate: "2029-01-01",
        },
      ],
    });

    // Sell 4 units from LOT-55
    saveSaleInvoice({
      id: "sale-1",
      rows: [
        {
          id: "sr1",
          sourceItemId: "item-paper",
          item: "A4 Premium Copier Paper - 500 Sheets",
          qty: "4",
          batchNo: "LOT-55",
          expDate: "2029-01-01",
        },
      ],
    });

    const items = getInventoryItems();
    const paper = items.find((i) => i.id === "item-paper");
    assert.equal(paper.openingQuantity, "6", "Aggregate stock should be reduced from 10 to 6");
    assert.equal(paper.batches[0].openingQty, "6", "Batch openingQty should be reduced to 6");

    const batchReport = listBatchExpiryStatus({ items });
    const batchRow = batchReport.find((b) => b.batchNo === "LOT-55");
    assert.equal(batchRow.availableQty, 6);
  } finally {
    env.restore();
  }
});

test("Test F: Expiry report classifies <=30 days as Near expiry, past dates as Expired, >30 days as Normal/Not expired", () => {
  const today = new Date();
  const pastDate = new Date(today.getTime() - 5 * 86400000).toISOString().slice(0, 10);
  const nearDate = new Date(today.getTime() + 15 * 86400000).toISOString().slice(0, 10);
  const futureDate = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10);

  const items = [
    {
      id: "item-exp",
      itemName: "Item Expiry Test",
      batches: [
        { id: "b1", batchNo: "EXPIRED", expDate: pastDate, openingQty: "5" },
        { id: "b2", batchNo: "NEAR", expDate: nearDate, openingQty: "8" },
        { id: "b3", batchNo: "NORMAL", expDate: futureDate, openingQty: "12" },
        { id: "b4", batchNo: "NO_EXP", expDate: "", openingQty: "20" },
      ],
    },
  ];

  const report = listBatchExpiryStatus({ items });
  assert.equal(report.find((b) => b.batchNo === "EXPIRED").status, "Expired");
  assert.equal(report.find((b) => b.batchNo === "NEAR").status, "Near expiry");
  assert.equal(report.find((b) => b.batchNo === "NORMAL").status, "Not expired");
  assert.equal(report.find((b) => b.batchNo === "NO_EXP"), undefined, "Batches without expiry date are omitted from expiry tracking");
});

test("Test G: Stock consistency across legacy items with unbatched stock", () => {
  const env = setupMockEnvironment();
  try {
    env.store.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    // Legacy test items that had aggregate stock but no batches
    saveInventoryItem({
      id: "item-bottle",
      itemName: "Stainless Steel Water Bottle 1L",
      openingQuantity: "22",
      stock: "22",
      batches: [],
    });

    const items = getInventoryItems();
    const warnings = reconcileBatchQuantities(items);
    assert.equal(warnings.length, 1, "Legacy item should have 1 reconciliation warning");
    assert.equal(warnings[0].difference, 22, "Difference should be 22");

    // Receiving a new batch for this item should NOT overwrite legacy stock
    savePurchaseBill({
      id: "bill-bottle",
      rows: [
        {
          id: "r1",
          sourceItemId: "item-bottle",
          item: "Stainless Steel Water Bottle 1L",
          qty: "3",
          batchNo: "BOTTLE-NEW",
          expDate: "2028-12-31",
        },
      ],
    });

    const updatedItems = getInventoryItems();
    const bottle = updatedItems.find((i) => i.id === "item-bottle");
    assert.equal(bottle.openingQuantity, "25", "Aggregate stock should be 22 + 3 = 25");
    assert.equal(bottle.batches.length, 1);
    assert.equal(bottle.batches[0].openingQty, "3");

    // Reconcile warnings should now show aggregate 25, batch 3, diff 22 (legacy retained!)
    const updatedWarnings = reconcileBatchQuantities(updatedItems);
    assert.equal(updatedWarnings[0].difference, 22);
    assert.equal(updatedWarnings[0].aggregateQuantity, 25);
    assert.equal(updatedWarnings[0].batchQuantity, 3);
  } finally {
    env.restore();
  }
});

test("Test H: Dispatch notification events on save for real-time reactivity without page reload", () => {
  const env = setupMockEnvironment();
  try {
    env.store.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    saveInventoryItem({
      id: "item-react",
      itemName: "Reactive Test Item",
      openingQuantity: "10",
      stock: "10",
      batches: [],
    });

    env.dispatchedEvents.length = 0; // Clear events

    savePurchaseBill({
      id: "bill-r1",
      rows: [
        {
          id: "r1",
          sourceItemId: "item-react",
          item: "Reactive Test Item",
          qty: "5",
        },
      ],
    });

    assert.ok(
      env.dispatchedEvents.includes("ledgerly:business-data-changed"),
      "Must dispatch ledgerly:business-data-changed on purchase bill save"
    );
    assert.ok(
      env.dispatchedEvents.includes("inventory-items-changed"),
      "Must dispatch inventory-items-changed on inventory update"
    );
  } finally {
    env.restore();
  }
});
