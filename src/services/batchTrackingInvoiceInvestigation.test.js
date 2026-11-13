import test from "node:test";
import assert from "node:assert/strict";
import {
  saveSaleInvoice,
  getSaleInvoices,
  deleteSaleInvoice,
  setSaleInvoiceLifecycle,
} from "./salesStorage.js";
import {
  inventoryItemsStorageKey,
  getInventoryItems,
  saveInventoryItem,
  isItemBatchTracked,
} from "./itemsStorage.js";
import { APP_SETTINGS_KEY } from "./appSettingsStorage.js";
import {
  getSaleOrders,
  saveSaleOrders,
  fulfillSaleOrder,
  getOrderFulfillmentSummary,
} from "./transactionRepository.js";

function setupInMemoryEnvironment(initialStore = {}) {
  const store = new Map(Object.entries(initialStore));
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  globalThis.window = {
    localStorage: storage,
    dispatchEvent: () => true,
    CustomEvent: class CustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    },
  };
  return { store, storage };
}

test("Scenario 1: Non-batch-tracked item creates and saves sale invoice cleanly without batch error", () => {
  setupInMemoryEnvironment();

  // Enable batch tracking globally
  window.localStorage.setItem(
    APP_SETTINGS_KEY,
    JSON.stringify({ enableBatchTracking: true })
  );

  // Item TEST Cotton Shirt Finished (non-batch product, opening stock 80)
  const item = {
    id: "test-item-fin-1",
    itemName: "TEST Cotton Shirt Finished",
    type: "product",
    openingQuantity: "80",
    stock: "80",
    price: "950",
    batches: [],
  };
  saveInventoryItem(item);

  assert.equal(isItemBatchTracked(item), false);

  // Create sale invoice for 1 unit of TEST Cotton Shirt Finished
  const invoice = {
    id: "inv-test-1",
    transactionType: "sale",
    invoiceNumber: "INV-101",
    form: { customer: "Acme Corp" },
    rows: [
      {
        id: "row-1",
        sourceItemId: "test-item-fin-1",
        item: "TEST Cotton Shirt Finished",
        qty: 1,
        price: 950,
        batchNo: "", // No batch
        expDate: "",
      },
    ],
  };

  // Must save without throwing "Batch tracking is enabled, but TEST Cotton Shirt Finished has no batch stock"
  const saved = saveSaleInvoice(invoice);
  assert.ok(saved);
  assert.equal(saved.rows[0].item, "TEST Cotton Shirt Finished");

  // Stock should be deducted from aggregate stock (80 -> 79)
  const updatedItem = getInventoryItems().find((i) => i.id === "test-item-fin-1");
  assert.equal(updatedItem.stock, "79");
  assert.equal(updatedItem.openingQuantity, "79");
});

test("Scenario 2: Batch-tracked item with available batch stock selects batch and saves", () => {
  setupInMemoryEnvironment();

  window.localStorage.setItem(
    APP_SETTINGS_KEY,
    JSON.stringify({ enableBatchTracking: true })
  );

  // Batch-tracked medicine item
  const medItem = {
    id: "med-1",
    itemName: "Amoxicillin 500mg",
    type: "product",
    openingQuantity: "50",
    stock: "50",
    price: "120",
    batches: [
      { id: "batch-1", batchNo: "AMX-2026-01", openingQty: "30", expDate: "2099-12-31" },
      { id: "batch-2", batchNo: "AMX-2026-02", openingQty: "20", expDate: "2099-12-31" },
    ],
  };
  saveInventoryItem(medItem);

  assert.equal(isItemBatchTracked(medItem), true);

  // Save sale invoice with batch AMX-2026-01 for 5 units
  const invoice = {
    id: "inv-med-1",
    transactionType: "sale",
    invoiceNumber: "INV-MED-01",
    form: { customer: "Care Pharmacy" },
    rows: [
      {
        id: "r1",
        sourceItemId: "med-1",
        item: "Amoxicillin 500mg",
        qty: 5,
        price: 120,
        batchNo: "AMX-2026-01",
        expDate: "2099-12-31",
      },
    ],
  };

  const saved = saveSaleInvoice(invoice);
  assert.ok(saved);
  assert.equal(saved.rows[0].batchNo, "AMX-2026-01");
  assert.equal(saved.rows[0].batchId, "batch-1");
  assert.ok(saved.batchStockAdjustedAt);

  // Check inventory deduction
  const updated = getInventoryItems().find((i) => i.id === "med-1");
  assert.equal(updated.batches[0].openingQty, "25"); // 30 - 5 = 25
  assert.equal(updated.batches[1].openingQty, "20");
  assert.equal(updated.openingQuantity, "45"); // 50 - 5 = 45
});

test("Scenario 3: Batch-tracked item without batch stock shows meaningful validation error", () => {
  setupInMemoryEnvironment();

  window.localStorage.setItem(
    APP_SETTINGS_KEY,
    JSON.stringify({ enableBatchTracking: true })
  );

  // Explicitly batch-tracked item with zero batches configured
  const item = {
    id: "vac-1",
    itemName: "Specialty Vaccine",
    type: "product",
    enableBatchTracking: true,
    openingQuantity: "0",
    stock: "0",
    price: "1500",
    batches: [],
  };
  saveInventoryItem(item);

  assert.equal(isItemBatchTracked(item), true);

  const invoice = {
    id: "inv-vac-1",
    transactionType: "sale",
    invoiceNumber: "INV-VAC-1",
    form: { customer: "City Hospital" },
    rows: [
      {
        id: "r1",
        sourceItemId: "vac-1",
        item: "Specialty Vaccine",
        qty: 1,
        price: 1500,
        batchNo: "",
      },
    ],
  };

  assert.throws(
    () => saveSaleInvoice(invoice),
    /Batch tracking is enabled, but Specialty Vaccine has no batch stock\. Add stock with a batch before selling\./
  );
});

test("Scenario 4: Batch belonging to another item is rejected", () => {
  setupInMemoryEnvironment();

  window.localStorage.setItem(
    APP_SETTINGS_KEY,
    JSON.stringify({ enableBatchTracking: true })
  );

  const itemA = {
    id: "item-a",
    itemName: "Product Alpha",
    type: "product",
    openingQuantity: "10",
    stock: "10",
    batches: [{ id: "ba", batchNo: "BATCH-ALPHA-01", openingQty: "10", expDate: "2099-01-01" }],
  };
  const itemB = {
    id: "item-b",
    itemName: "Product Beta",
    type: "product",
    openingQuantity: "10",
    stock: "10",
    batches: [{ id: "bb", batchNo: "BATCH-BETA-01", openingQty: "10", expDate: "2099-01-01" }],
  };
  saveInventoryItem(itemA);
  saveInventoryItem(itemB);

  // Attempt to sell Product Alpha using Product Beta's batch number
  const invoice = {
    id: "inv-mismatch",
    transactionType: "sale",
    invoiceNumber: "INV-MISMATCH",
    form: { customer: "Test Buyer" },
    rows: [
      {
        id: "r1",
        sourceItemId: "item-a",
        item: "Product Alpha",
        qty: 2,
        price: 50,
        batchNo: "BATCH-BETA-01", // Belongs to Product Beta!
      },
    ],
  };

  assert.throws(
    () => saveSaleInvoice(invoice),
    /Select a valid batch for Product Alpha\./
  );

  // Stocks must remain intact
  const refreshedA = getInventoryItems().find((i) => i.id === "item-a");
  assert.equal(refreshedA.batches[0].openingQty, "10");
});

test("Scenario 5: Sale Order converted to Sale Invoice preserves batch information and succeeds", () => {
  setupInMemoryEnvironment();

  window.localStorage.setItem(
    APP_SETTINGS_KEY,
    JSON.stringify({ enableBatchTracking: true })
  );

  // 1. Setup item TEST Cotton Shirt Finished (non-batch)
  const shirtItem = {
    id: "test-item-fin-1",
    itemName: "TEST Cotton Shirt Finished",
    type: "product",
    openingQuantity: "80",
    stock: "80",
    price: "950",
    batches: [],
  };
  saveInventoryItem(shirtItem);

  // 2. Setup Sale Order TEST-SO-701 for 5 units @ 950
  const saleOrder = {
    id: "test-so-701",
    number: "TEST-SO-701",
    customer: "TEST Customer Pvt Ltd",
    date: "2026-11-01",
    dueDate: "2026-11-15",
    amount: 4750,
    status: "Open",
    rows: [
      {
        id: "so-row-1",
        itemId: "test-item-fin-1",
        sourceItemId: "test-item-fin-1",
        item: "TEST Cotton Shirt Finished",
        qty: 5,
        price: 950,
        tax: 0,
        discount: 0,
      },
    ],
  };
  saveSaleOrders([saleOrder]);

  // 3. Convert 1 unit into Sale Invoice
  const invoice = {
    id: "inv-conv-701",
    transactionType: "sale",
    invoiceNumber: "INV-701",
    form: { customer: "TEST Customer Pvt Ltd" },
    rows: [
      {
        id: "inv-row-1",
        sourceItemId: "test-item-fin-1",
        item: "TEST Cotton Shirt Finished",
        qty: 1,
        price: 950,
        sourceOrderId: "test-so-701",
        sourceOrderNumber: "TEST-SO-701",
        sourceOrderRowId: "so-row-1",
        maxConvertibleQty: 5,
        batchNo: "", // Non-batch item
        expDate: "",
      },
    ],
  };

  // Saving invoice succeeds without batch errors
  const savedInvoice = saveSaleInvoice(invoice);
  assert.ok(savedInvoice);

  // Fulfill order
  fulfillSaleOrder(
    "test-so-701",
    [{ sourceOrderRowId: "so-row-1", qty: 1 }],
    { id: savedInvoice.id, invoiceNumber: savedInvoice.invoiceNumber }
  );

  // Verify Sale Order status and remaining quantities
  const updatedOrders = getSaleOrders();
  assert.equal(updatedOrders[0].status, "Partially Converted");
  const summary = getOrderFulfillmentSummary(updatedOrders[0]);
  assert.equal(summary.totalOrderedQty, 5);
  assert.equal(summary.totalConvertedQty, 1);
  assert.equal(summary.totalRemainingQty, 4);

  // Verify stock deduction
  const updatedShirt = getInventoryItems().find((i) => i.id === "test-item-fin-1");
  assert.equal(updatedShirt.stock, "79");
});

test("Scenario 6: Existing items and historical transactions maintain data integrity without errors", () => {
  setupInMemoryEnvironment();

  // Create an existing historical sale invoice BEFORE batch tracking is enabled
  window.localStorage.setItem(
    APP_SETTINGS_KEY,
    JSON.stringify({ enableBatchTracking: false })
  );

  const existingItem = {
    id: "hist-item-1",
    itemName: "Vintage Notebook",
    type: "product",
    openingQuantity: "100",
    stock: "100",
    price: "50",
    batches: [],
  };
  saveInventoryItem(existingItem);

  const historicalSale = saveSaleInvoice({
    id: "hist-inv-1",
    transactionType: "sale",
    invoiceNumber: "HIST-01",
    form: { customer: "Regular Client" },
    rows: [
      {
        id: "r1",
        sourceItemId: "hist-item-1",
        item: "Vintage Notebook",
        qty: 10,
        price: 50,
      },
    ],
  });

  assert.ok(historicalSale.stockAdjustedAt);
  assert.equal(getInventoryItems().find((i) => i.id === "hist-item-1").stock, "90");

  // Now enable batch tracking globally
  window.localStorage.setItem(
    APP_SETTINGS_KEY,
    JSON.stringify({ enableBatchTracking: true })
  );

  // 1. Verify historical sale can be edited without throwing "historical sale has no batch allocation"
  const editedSale = saveSaleInvoice({
    ...historicalSale,
    rows: [
      {
        id: "r1",
        sourceItemId: "hist-item-1",
        item: "Vintage Notebook",
        qty: 12, // Increased quantity from 10 to 12
        price: 50,
      },
    ],
  });
  assert.ok(editedSale);
  assert.equal(getInventoryItems().find((i) => i.id === "hist-item-1").stock, "88");

  // 2. Verify historical sale can be deleted safely without throwing
  deleteSaleInvoice(historicalSale.id);
  // Stock restored back (88 + 12 = 100)
  assert.equal(getInventoryItems().find((i) => i.id === "hist-item-1").stock, "100");
});
