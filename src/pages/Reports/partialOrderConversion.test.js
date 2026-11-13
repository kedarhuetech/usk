import test from "node:test";
import assert from "node:assert/strict";
import {
  getSaleOrders,
  saveSaleOrders,
  getPurchaseOrders,
  savePurchaseOrders,
  getOrderFulfillmentSummary,
  fulfillSaleOrder,
  fulfillPurchaseOrder,
  calculateOrderRowAmount,
  updateSaleOrderStatus,
} from "../../services/transactionRepository.js";
import {
  collectBackupData,
  createBackupPayload,
  validateBackupPayload,
  restoreBackupPayload,
} from "../../services/backupToComputer.js";
import { createLocalStorageBackupRestoreRepository } from "../../services/backupRestoreRepository.js";

function setupInMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const storage = {
    getItem: (key) => store.get(key) ?? null,
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

// Helper simulating stock reservation logic from StockSummaryReport.jsx
function computeReservedStock(saleOrders, itemName) {
  let reservedQty = 0;
  const target = itemName.trim().toLowerCase();

  saleOrders.forEach((so) => {
    const status = (so.status || "").toLowerCase();
    if (
      status === "cancelled" ||
      status === "delivered" ||
      status === "closed" ||
      status === "fully converted" ||
      status === "converted to sale" ||
      status === "converted"
    ) {
      return;
    }
    (so.rows || []).forEach((r) => {
      const name = (r.item || "").trim().toLowerCase();
      if (name !== target) return;
      const ordered = Number(r.orderedQty ?? r.qty ?? r.quantity ?? 0);
      const converted = Number(r.convertedQty ?? 0);
      const remaining =
        r.remainingQty != null ? Number(r.remainingQty) : Math.max(0, ordered - converted);
      if (remaining > 0) {
        reservedQty += remaining;
      }
    });
  });

  return reservedQty;
}

test("1. Full Sale Order Conversion in a single invoice", () => {
  setupInMemoryStorage();

  const order = {
    id: "so-100",
    number: "SO-100",
    customer: "Nexus Corp",
    date: "2026-11-01",
    status: "Open",
    rows: [
      { id: "row-1", item: "Item A", qty: 100, price: 50, tax: 18, discount: 0 },
    ],
  };
  saveSaleOrders([order]);

  // Convert all 100 units
  const fulfilledOrder = fulfillSaleOrder(
    "so-100",
    [{ sourceOrderRowId: "row-1", qty: 100 }],
    { invoiceId: "inv-1", invoiceNumber: "INV-001" }
  );

  assert.equal(fulfilledOrder.status, "Fully Converted");
  const summary = getOrderFulfillmentSummary(fulfilledOrder);
  assert.equal(summary.status, "Fully Converted");
  assert.equal(summary.totalOrderedQty, 100);
  assert.equal(summary.totalConvertedQty, 100);
  assert.equal(summary.totalRemainingQty, 0);
  assert.equal(summary.remainingAmount, 0);
  assert.equal(fulfilledOrder.convertedInvoices.length, 1);
  assert.equal(fulfilledOrder.convertedInvoices[0].invoiceId, "inv-1");
});

test("2. Partial Sale Order Conversion: 40 of 100 units converted", () => {
  setupInMemoryStorage();

  const order = {
    id: "so-200",
    number: "SO-200",
    customer: "Apex Industries",
    date: "2026-11-01",
    status: "Open",
    rows: [
      { id: "row-1", item: "Widget Pro", qty: 100, price: 100, tax: 0, discount: 0 },
    ],
  };
  saveSaleOrders([order]);

  // Convert 40 units
  const updatedOrder = fulfillSaleOrder(
    "so-200",
    [{ sourceOrderRowId: "row-1", qty: 40 }],
    { invoiceId: "inv-201", invoiceNumber: "INV-201" }
  );

  assert.equal(updatedOrder.status, "Partially Converted");
  const summary = getOrderFulfillmentSummary(updatedOrder);
  assert.equal(summary.status, "Partially Converted");
  assert.equal(summary.totalOrderedQty, 100);
  assert.equal(summary.totalConvertedQty, 40);
  assert.equal(summary.totalRemainingQty, 60);
  assert.equal(summary.originalAmount, 10000);
  assert.equal(summary.convertedAmount, 4000);
  assert.equal(summary.remainingAmount, 6000);

  // Row inspection
  const row = updatedOrder.rows[0];
  assert.equal(row.orderedQty, 100);
  assert.equal(row.convertedQty, 40);
  assert.equal(row.remainingQty, 60);
});

test("3. Multiple partial conversions culminating in fully converted status", () => {
  setupInMemoryStorage();

  const order = {
    id: "so-300",
    number: "SO-300",
    customer: "Global Supplies",
    date: "2026-11-01",
    status: "Open",
    rows: [
      { id: "row-1", item: "Motor Assembly", qty: 100, price: 250, tax: 0, discount: 0 },
    ],
  };
  saveSaleOrders([order]);

  // First invoice converts 40 units
  let orderState = fulfillSaleOrder(
    "so-300",
    [{ sourceOrderRowId: "row-1", qty: 40 }],
    { invoiceId: "inv-301", invoiceNumber: "INV-301" }
  );
  assert.equal(orderState.status, "Partially Converted");
  assert.equal(orderState.rows[0].remainingQty, 60);

  // Second invoice converts 35 units
  orderState = fulfillSaleOrder(
    "so-300",
    [{ sourceOrderRowId: "row-1", qty: 35 }],
    { invoiceId: "inv-302", invoiceNumber: "INV-302" }
  );
  assert.equal(orderState.status, "Partially Converted");
  assert.equal(orderState.rows[0].convertedQty, 75);
  assert.equal(orderState.rows[0].remainingQty, 25);

  // Third invoice converts remaining 25 units
  orderState = fulfillSaleOrder(
    "so-300",
    [{ sourceOrderRowId: "row-1", qty: 25 }],
    { invoiceId: "inv-303", invoiceNumber: "INV-303" }
  );
  assert.equal(orderState.status, "Fully Converted");
  assert.equal(orderState.rows[0].convertedQty, 100);
  assert.equal(orderState.rows[0].remainingQty, 0);

  // Verify all 3 invoices tracked in history
  assert.equal(orderState.convertedInvoices.length, 3);
  assert.deepEqual(
    orderState.convertedInvoices.map((i) => i.invoiceNumber),
    ["INV-301", "INV-302", "INV-303"]
  );

  const summary = getOrderFulfillmentSummary(orderState);
  assert.equal(summary.totalRemainingQty, 0);
  assert.equal(summary.remainingAmount, 0);
});

test("4. Quantity over-conversion prevention", () => {
  setupInMemoryStorage();

  const order = {
    id: "so-400",
    number: "SO-400",
    customer: "Beta Systems",
    date: "2026-11-01",
    status: "Open",
    rows: [
      { id: "row-1", item: "Sensor Unit", qty: 50, price: 100, tax: 0, discount: 0 },
    ],
  };
  saveSaleOrders([order]);

  // Convert 30 units (20 remaining)
  fulfillSaleOrder(
    "so-400",
    [{ sourceOrderRowId: "row-1", qty: 30 }],
    { invoiceId: "inv-401", invoiceNumber: "INV-401" }
  );

  // Attempt to convert 25 units (when only 20 remaining)
  // fulfillSaleOrder clamps the converted quantity to the row's remainingQty
  const nextOrder = fulfillSaleOrder(
    "so-400",
    [{ sourceOrderRowId: "row-1", qty: 25 }],
    { invoiceId: "inv-402", invoiceNumber: "INV-402" }
  );

  assert.equal(nextOrder.rows[0].convertedQty, 50);
  assert.equal(nextOrder.rows[0].remainingQty, 0);
  assert.equal(nextOrder.status, "Fully Converted");
});

test("5. Multi-item order with mixed conversion quantities", () => {
  setupInMemoryStorage();

  const order = {
    id: "so-500",
    number: "SO-500",
    customer: "Gamma Tech",
    date: "2026-11-01",
    status: "Open",
    rows: [
      { id: "row-A", item: "Item A", qty: 50, price: 100, tax: 0, discount: 0 },
      { id: "row-B", item: "Item B", qty: 20, price: 200, tax: 0, discount: 0 },
    ],
  };
  saveSaleOrders([order]);

  // Fully convert Item A (50 units), partially convert Item B (5 of 20 units)
  const step1 = fulfillSaleOrder(
    "so-500",
    [
      { sourceOrderRowId: "row-A", qty: 50 },
      { sourceOrderRowId: "row-B", qty: 5 },
    ],
    { invoiceId: "inv-501", invoiceNumber: "INV-501" }
  );

  assert.equal(step1.status, "Partially Converted");
  const summary1 = getOrderFulfillmentSummary(step1);
  assert.equal(summary1.status, "Partially Converted");
  assert.equal(summary1.rows[0].remainingQty, 0);
  assert.equal(summary1.rows[1].remainingQty, 15);
  assert.equal(summary1.totalRemainingQty, 15);

  // Second invoice converts remaining 15 units of Item B
  const step2 = fulfillSaleOrder(
    "so-500",
    [{ sourceOrderRowId: "row-B", qty: 15 }],
    { invoiceId: "inv-502", invoiceNumber: "INV-502" }
  );

  assert.equal(step2.status, "Fully Converted");
  const summary2 = getOrderFulfillmentSummary(step2);
  assert.equal(summary2.status, "Fully Converted");
  assert.equal(summary2.totalRemainingQty, 0);
  assert.equal(summary2.remainingAmount, 0);
});

test("6. Tax and discount preservation across partial conversions", () => {
  const row = {
    id: "row-tax",
    item: "High Precision Valve",
    price: 100,
    discount: 10, // 10% discount
    discountType: "percentage",
    tax: 18, // 18% GST
    cess: 2, // 2% Cess
  };

  // Original row amount for 10 units:
  // Gross = 10 * 100 = 1000
  // Discount = 10% of 1000 = 100 -> Net = 900
  // Tax = 18% of 900 = 162
  // Cess = 2% of 900 = 18
  // Total = 900 + 162 + 18 = 1080
  const fullAmount = calculateOrderRowAmount(row, 10);
  assert.equal(fullAmount, 1080);

  // Partial 4 units:
  // Gross = 400, Discount = 40 -> Net = 360
  // Tax = 18% of 360 = 64.8, Cess = 2% of 360 = 7.2
  // Total = 360 + 64.8 + 7.2 = 432
  const partial4 = calculateOrderRowAmount(row, 4);
  assert.equal(partial4, 432);

  // Remaining 6 units:
  // Gross = 600, Discount = 60 -> Net = 540
  // Tax = 18% of 540 = 97.2, Cess = 2% of 540 = 10.8
  // Total = 540 + 97.2 + 10.8 = 648
  const partial6 = calculateOrderRowAmount(row, 6);
  assert.equal(partial6, 648);

  // Sum of parts equals whole
  assert.equal(partial4 + partial6, fullAmount);
});

test("7. Stock reservation updates dynamically: open, partial, fully converted", () => {
  setupInMemoryStorage();

  const order = {
    id: "so-stock-1",
    number: "SO-STK-1",
    customer: "Delta Warehousing",
    date: "2026-11-01",
    status: "Open",
    rows: [{ id: "r1", item: "Solar Inverter 5kW", qty: 100 }],
  };
  saveSaleOrders([order]);

  // Stage 1: Open order -> reserves all 100 units
  let currentOrders = getSaleOrders();
  assert.equal(computeReservedStock(currentOrders, "Solar Inverter 5kW"), 100);

  // Stage 2: 40 units converted by invoice -> order status Partially Converted
  fulfillSaleOrder(
    "so-stock-1",
    [{ sourceOrderRowId: "r1", qty: 40 }],
    { invoiceId: "inv-s1", invoiceNumber: "INV-S1" }
  );
  currentOrders = getSaleOrders();
  // Reserved stock must drop to exactly 60 (the remaining unconverted quantity)
  assert.equal(computeReservedStock(currentOrders, "Solar Inverter 5kW"), 60);

  // Stage 3: Remaining 60 units converted by second invoice -> order Fully Converted
  fulfillSaleOrder(
    "so-stock-1",
    [{ sourceOrderRowId: "r1", qty: 60 }],
    { invoiceId: "inv-s2", invoiceNumber: "INV-S2" }
  );
  currentOrders = getSaleOrders();
  // Fully converted order must reserve 0 units (physical invoice handles stock deduction)
  assert.equal(computeReservedStock(currentOrders, "Solar Inverter 5kW"), 0);
});

test("8. Order cancellation releases all reservations", () => {
  setupInMemoryStorage();

  const order = {
    id: "so-cancel-1",
    number: "SO-CNCL",
    customer: "Echo Logistics",
    date: "2026-11-01",
    status: "Open",
    rows: [{ id: "r1", item: "Hydraulic Pump", qty: 50 }],
  };
  saveSaleOrders([order]);

  // Open order reserves 50 units
  assert.equal(computeReservedStock(getSaleOrders(), "Hydraulic Pump"), 50);

  // Partially convert 20 units
  fulfillSaleOrder(
    "so-cancel-1",
    [{ sourceOrderRowId: "r1", qty: 20 }],
    { invoiceId: "inv-c1", invoiceNumber: "INV-C1" }
  );
  assert.equal(computeReservedStock(getSaleOrders(), "Hydraulic Pump"), 30);

  // Customer cancels remaining order
  updateSaleOrderStatus("so-cancel-1", "Cancelled");
  assert.equal(computeReservedStock(getSaleOrders(), "Hydraulic Pump"), 0);
});

test("9. Partial Purchase Order conversion mirroring", () => {
  setupInMemoryStorage();

  const po = {
    id: "po-100",
    number: "PO-100",
    supplier: "Zenith Fabricators",
    date: "2026-11-01",
    status: "Open",
    rows: [
      { id: "po-r1", item: "Copper Sheets 1mm", qty: 200, price: 300, tax: 18, discount: 0 },
    ],
  };
  savePurchaseOrders([po]);

  // First purchase bill converts 80 units
  const step1 = fulfillPurchaseOrder(
    "po-100",
    [{ sourceOrderRowId: "po-r1", qty: 80 }],
    { billId: "pb-101", billNumber: "BILL-101" }
  );

  assert.equal(step1.status, "Partially Converted");
  const summary1 = getOrderFulfillmentSummary(step1);
  assert.equal(summary1.status, "Partially Converted");
  assert.equal(summary1.totalOrderedQty, 200);
  assert.equal(summary1.totalConvertedQty, 80);
  assert.equal(summary1.totalRemainingQty, 120);
  assert.equal(step1.convertedBills.length, 1);
  assert.equal(step1.convertedBills[0].billNumber, "BILL-101");

  // Second purchase bill converts remaining 120 units
  const step2 = fulfillPurchaseOrder(
    "po-100",
    [{ sourceOrderRowId: "po-r1", qty: 120 }],
    { billId: "pb-102", billNumber: "BILL-102" }
  );

  assert.equal(step2.status, "Fully Converted");
  const summary2 = getOrderFulfillmentSummary(step2);
  assert.equal(summary2.status, "Fully Converted");
  assert.equal(summary2.totalRemainingQty, 0);
  assert.equal(summary2.remainingAmount, 0);
  assert.equal(step2.convertedBills.length, 2);
});

test("10. Backup & restore preserves partial conversion and item fulfillment structure", () => {
  const { storage } = setupInMemoryStorage();

  const saleOrder = {
    id: "so-bk-1",
    number: "SO-BK-1",
    customer: "Sterling Works",
    date: "2026-11-01",
    status: "Partially Converted",
    rows: [
      {
        id: "r1",
        item: "Alloy Bar",
        orderedQty: 100,
        convertedQty: 45,
        remainingQty: 55,
        price: 80,
      },
    ],
    convertedInvoices: [{ invoiceId: "inv-bk", invoiceNumber: "INV-BK-1", at: "2026-11-02" }],
  };
  saveSaleOrders([saleOrder]);

  const purchaseOrder = {
    id: "po-bk-1",
    number: "PO-BK-1",
    supplier: "Titanium Forge",
    date: "2026-11-01",
    status: "Partially Converted",
    rows: [
      {
        id: "pr1",
        item: "Titanium Ingot",
        orderedQty: 50,
        convertedQty: 20,
        remainingQty: 30,
        price: 500,
      },
    ],
    convertedBills: [{ billId: "pb-bk", billNumber: "PB-BK-1", at: "2026-11-02" }],
  };
  savePurchaseOrders([purchaseOrder]);

  // Create backup
  const collected = collectBackupData(storage);
  const backupPayload = createBackupPayload(collected);
  assert.equal(validateBackupPayload(backupPayload).valid, true);

  // Restore into a clean storage
  const { storage: restoreStorage } = setupInMemoryStorage();
  const repo = createLocalStorageBackupRestoreRepository(restoreStorage);
  restoreBackupPayload(backupPayload, repo);

  // Verify restored sale orders
  const restoredSaleRaw = restoreStorage.getItem("ledgerly:saleOrders.v1");
  assert.ok(restoredSaleRaw);
  const restoredSOs = JSON.parse(restoredSaleRaw);
  assert.equal(restoredSOs.length, 1);
  const soSummary = getOrderFulfillmentSummary(restoredSOs[0]);
  assert.equal(soSummary.status, "Partially Converted");
  assert.equal(soSummary.totalOrderedQty, 100);
  assert.equal(soSummary.totalConvertedQty, 45);
  assert.equal(soSummary.totalRemainingQty, 55);
  assert.equal(restoredSOs[0].convertedInvoices[0].invoiceNumber, "INV-BK-1");

  // Verify restored purchase orders
  const restoredPoRaw = restoreStorage.getItem("ledgerly:purchaseOrders.v1");
  assert.ok(restoredPoRaw);
  const restoredPOs = JSON.parse(restoredPoRaw);
  assert.equal(restoredPOs.length, 1);
  const poSummary = getOrderFulfillmentSummary(restoredPOs[0]);
  assert.equal(poSummary.status, "Partially Converted");
  assert.equal(poSummary.totalOrderedQty, 50);
  assert.equal(poSummary.totalConvertedQty, 20);
  assert.equal(poSummary.totalRemainingQty, 30);
  assert.equal(restoredPOs[0].convertedBills[0].billNumber, "PB-BK-1");
});

test("11. Backward compatibility with legacy whole-order records", () => {
  // Legacy orders have no orderedQty, convertedQty, or remainingQty on rows
  const legacyConvertedOrder = {
    id: "legacy-so-1",
    number: "SO-LEG-1",
    customer: "Legacy Client",
    date: "2026-10-01",
    status: "Converted to Sale",
    rows: [{ id: "leg-r1", item: "Classic Desk", qty: 15, price: 1200 }],
  };

  const summaryConverted = getOrderFulfillmentSummary(legacyConvertedOrder);
  assert.equal(summaryConverted.status, "Converted to Sale");
  assert.equal(summaryConverted.totalOrderedQty, 15);
  assert.equal(summaryConverted.totalConvertedQty, 15);
  assert.equal(summaryConverted.totalRemainingQty, 0);
  assert.equal(summaryConverted.remainingAmount, 0);

  const legacyOpenOrder = {
    id: "legacy-so-2",
    number: "SO-LEG-2",
    customer: "Legacy Client 2",
    date: "2026-10-05",
    status: "Open",
    rows: [{ id: "leg-r2", item: "Classic Chair", qty: 30, price: 400 }],
  };

  const summaryOpen = getOrderFulfillmentSummary(legacyOpenOrder);
  assert.equal(summaryOpen.status, "Open");
  assert.equal(summaryOpen.totalOrderedQty, 30);
  assert.equal(summaryOpen.totalConvertedQty, 0);
  assert.equal(summaryOpen.totalRemainingQty, 30);
  assert.equal(summaryOpen.remainingAmount, 12000);
});
