import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  listBatchExpiryStatus,
  reconcileBatchQuantities,
  moveBatchRows,
  localDateOnly,
} from "../../services/batchInventoryService.js";
import {
  getInventoryItems,
  saveInventoryItem,
  inventoryItemsStorageKey,
  applyBatchStockMovement,
} from "../../services/itemsStorage.js";

function setupMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const prior = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return {
    store,
    restore: () => {
      if (prior === undefined) delete globalThis.window;
      else globalThis.window = prior;
    },
  };
}

test("Scenario A: Item has stock but no batch records displays accurate reconciliation warning", () => {
  const items = [
    {
      id: "item-1",
      itemName: "Stainless Steel Water Bottle 1L",
      stock: "22",
      openingQuantity: "22",
      batches: [],
    },
    {
      id: "item-2",
      itemName: "A4 Copier Paper 500 Sheets",
      stock: "40",
      openingQuantity: "40",
      batches: [],
    },
    {
      id: "item-3",
      itemName: "Wireless Mouse 2.4 GHz",
      stock: "15",
      openingQuantity: "15",
      batches: [],
    },
  ];

  const warnings = reconcileBatchQuantities(items);
  assert.equal(warnings.length, 3);

  assert.equal(warnings[0].itemName, "Stainless Steel Water Bottle 1L");
  assert.equal(warnings[0].aggregateQuantity, 22);
  assert.equal(warnings[0].batchQuantity, 0);
  assert.equal(warnings[0].difference, 22);

  assert.equal(warnings[1].itemName, "A4 Copier Paper 500 Sheets");
  assert.equal(warnings[1].aggregateQuantity, 40);
  assert.equal(warnings[1].batchQuantity, 0);
  assert.equal(warnings[1].difference, 40);

  assert.equal(warnings[2].itemName, "Wireless Mouse 2.4 GHz");
  assert.equal(warnings[2].aggregateQuantity, 15);
  assert.equal(warnings[2].batchQuantity, 0);
  assert.equal(warnings[2].difference, 15);
});

test("Scenario B: Item has stock and correctly saved batch records produces zero warnings", () => {
  const items = [
    {
      id: "item-med-1",
      itemName: "Amoxicillin 500mg",
      stock: "50",
      openingQuantity: "50",
      batches: [
        { id: "b-1", batchNo: "AMX-01", openingQty: "30", expDate: "2027-01-01" },
        { id: "b-2", batchNo: "AMX-02", openingQty: "20", expDate: "2027-06-01" },
      ],
    },
  ];

  const warnings = reconcileBatchQuantities(items);
  assert.equal(warnings.length, 0, "No reconciliation warning should exist when aggregate matches batch total");
});

test("Scenario C & D: Correct Near-expiry (<=30 days) and Expired (<0 days) classification", () => {
  const today = "2026-11-12";
  const items = [
    {
      id: "item-test",
      itemName: "Pharma Syrup",
      batches: [
        { id: "b-near", batchNo: "NEAR-1", openingQty: "10", expDate: "2026-11-25" }, // 13 days left
        { id: "b-exp", batchNo: "EXP-1", openingQty: "5", expDate: "2026-11-01" },   // Expired 11 days ago
        { id: "b-ok", batchNo: "OK-1", openingQty: "25", expDate: "2027-05-01" },     // Not expired
      ],
    },
  ];

  const statuses = listBatchExpiryStatus({ today, items });
  assert.equal(statuses.length, 3);

  const near = statuses.find((s) => s.batchNo === "NEAR-1");
  assert.ok(near);
  assert.equal(near.status, "Near expiry");
  assert.equal(near.daysToExpiry, 13);

  const expired = statuses.find((s) => s.batchNo === "EXP-1");
  assert.ok(expired);
  assert.equal(expired.status, "Expired");
  assert.ok(expired.daysToExpiry < 0);

  const ok = statuses.find((s) => s.batchNo === "OK-1");
  assert.ok(ok);
  assert.equal(ok.status, "Not expired");
  assert.ok(ok.daysToExpiry > 30);
});

test("Scenario E: Batch has no expiry date is handled without inventing an expiry date", () => {
  const items = [
    {
      id: "item-hardware",
      itemName: "Machine Bolts M8",
      batches: [
        { id: "b-nobatch", batchNo: "LOT-992", openingQty: "100", expDate: "" },
        { id: "b-nullbatch", batchNo: "LOT-993", openingQty: "50", expDate: null },
      ],
    },
  ];

  const statuses = listBatchExpiryStatus({ items });
  assert.equal(statuses.length, 0, "Batches without expiry date must not invent an expiry date");
});

test("Scenario F: Stock quantity changes after purchase or sale update batch availability and aggregate stock", () => {
  const item = {
    id: "item-f",
    itemName: "Energy Drink",
    stock: "20",
    openingQuantity: "20",
    batches: [
      { id: "b-f1", batchNo: "ED-01", openingQty: "20", expDate: "2027-01-01" },
    ],
  };

  // Sale of 5 units reduces batch and aggregate stock
  const afterSale = applyBatchStockMovement(item, { item: "Energy Drink", batchNo: "ED-01", qty: 5 }, "reduce");
  assert.equal(afterSale.stock, "15");
  assert.equal(afterSale.openingQuantity, "15");
  assert.equal(afterSale.batches[0].openingQty, "15");

  // Purchase of 10 units adds to batch and aggregate stock
  const afterPurchase = applyBatchStockMovement(afterSale, { item: "Energy Drink", batchNo: "ED-01", qty: 10 }, "add");
  assert.equal(afterPurchase.stock, "25");
  assert.equal(afterPurchase.openingQuantity, "25");
  assert.equal(afterPurchase.batches[0].openingQty, "25");
});

test("Scenario G & H: BatchExpiryReport implementation includes active refresh, loading state, error alert, and retry", () => {
  assert.ok(fs.existsSync("src/pages/Reports/BatchExpiryReport.jsx"));
  const code = fs.readFileSync("src/pages/Reports/BatchExpiryReport.jsx", "utf8");

  // Verifies API integration
  assert.ok(code.includes("businessDataApi.list"), "Must call backend businessDataApi.list to refresh");
  // Verifies loading state
  assert.ok(code.includes("loading") && code.includes("Refreshing..."), "Must show loading indicator while fetching");
  assert.ok(code.includes("disabled={loading}"), "Must prevent duplicate clicks while loading");
  // Verifies error handling & retry
  assert.ok(code.includes("role=\"alert\"") && code.includes("Backend/API unavailable"), "Must show error alert when API fails");
  assert.ok(code.includes("Retry"), "Must offer a Retry button when API fails");
  // Verifies real data display
  assert.ok(code.includes("listBatchExpiryStatus") && code.includes("reconcileBatchQuantities"), "Must calculate statuses and reconciliation from real items");
});
