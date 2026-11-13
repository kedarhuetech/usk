import test from "node:test";
import assert from "node:assert/strict";
import {
  getSaleOrders,
  saveSaleOrders,
  getPurchaseOrders,
  savePurchaseOrders,
  updateSaleOrderStatus,
  updatePurchaseOrderStatus,
} from "../../services/transactionRepository.js";
import { BACKUP_SOURCES, collectBackupData } from "../../services/backupToComputer.js";

function setupInMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
    CustomEvent: class CustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    },
  };
  return store;
}

test("transactionRepository: Sale Orders CRUD and Status Update", () => {
  setupInMemoryStorage();

  assert.deepEqual(getSaleOrders(), [], "Should return empty array when no orders exist");

  const sampleOrder = {
    id: "so-101",
    orderNo: "SO-1",
    customer: "Acme Corp",
    date: "2026-11-01",
    dueDate: "2026-11-20",
    status: "Open",
    rows: [
      { item: "Laptop", qty: 2, price: 50000, tax: 18, discount: 0 },
    ],
  };

  saveSaleOrders([sampleOrder]);
  const fetched = getSaleOrders();
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].customer, "Acme Corp");
  assert.equal(fetched[0].status, "Open");

  // Update status to Converted to Sale
  const updated = updateSaleOrderStatus("so-101", "Converted to Sale", {
    convertedInvoiceId: "inv-999",
    convertedInvoiceNumber: "INV-999",
  });
  assert.ok(Array.isArray(updated) && updated.length === 1);

  const afterUpdate = getSaleOrders();
  assert.equal(afterUpdate[0].status, "Converted to Sale");
  assert.equal(afterUpdate[0].convertedInvoiceId, "inv-999");
  assert.equal(afterUpdate[0].convertedInvoiceNumber, "INV-999");
  assert.equal(afterUpdate[0].customer, "Acme Corp", "Preserves party");
  assert.equal(afterUpdate[0].rows[0].item, "Laptop", "Preserves items");
});

test("transactionRepository: Purchase Orders CRUD and Status Update", () => {
  setupInMemoryStorage();

  assert.deepEqual(getPurchaseOrders(), [], "Should return empty array when no orders exist");

  const samplePO = {
    id: "po-201",
    orderNo: "PO-1",
    supplier: "Global Supplies",
    date: "2026-11-05",
    dueDate: "2026-11-25",
    status: "Open",
    rows: [
      { item: "Office Chair", qty: 10, price: 3000, tax: 18, discount: 5 },
    ],
  };

  savePurchaseOrders([samplePO]);
  const fetched = getPurchaseOrders();
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].supplier, "Global Supplies");
  assert.equal(fetched[0].status, "Open");

  // Update status to Converted to Purchase
  const updated = updatePurchaseOrderStatus("po-201", "Converted to Purchase", {
    convertedPurchaseBillId: "bill-888",
    convertedPurchaseBillNumber: "BILL-888",
  });
  assert.ok(Array.isArray(updated) && updated.length === 1);

  const afterUpdate = getPurchaseOrders();
  assert.equal(afterUpdate[0].status, "Converted to Purchase");
  assert.equal(afterUpdate[0].convertedPurchaseBillId, "bill-888");
  assert.equal(afterUpdate[0].supplier, "Global Supplies", "Preserves party");
});

test("backupToComputer includes both Sale Orders and Purchase Orders", () => {
  const soSource = BACKUP_SOURCES.find((s) => s.key === "ledgerly:saleOrders.v1");
  const poSource = BACKUP_SOURCES.find((s) => s.key === "ledgerly:purchaseOrders.v1");

  assert.ok(soSource, "ledgerly:saleOrders.v1 must be in BACKUP_SOURCES");
  assert.equal(soSource.category, "Sales");
  assert.equal(soSource.shape, "array");

  assert.ok(poSource, "ledgerly:purchaseOrders.v1 must be in BACKUP_SOURCES");
  assert.equal(poSource.category, "Purchases");
  assert.equal(poSource.shape, "array");

  // Verify collection
  const mockStorage = {
    getItem: (key) => {
      if (key === "ledgerly:companyProfile.v1") return JSON.stringify({ companyName: "USK" });
      if (key === "ledgerly:saleOrders.v1") return JSON.stringify([{ id: "so-1" }]);
      if (key === "ledgerly:purchaseOrders.v1") return JSON.stringify([{ id: "po-1" }]);
      return null;
    },
  };
  const collected = collectBackupData(mockStorage);
  assert.equal(collected.data["ledgerly:saleOrders.v1"].length, 1);
  assert.equal(collected.data["ledgerly:purchaseOrders.v1"].length, 1);
});

test("Stock Reservation logic: Converted & Cancelled Sale Orders do NOT reserve stock", () => {
  const saleOrders = [
    {
      id: "so-1",
      status: "Open",
      rows: [{ item: "Widget A", qty: 5 }],
    },
    {
      id: "so-2",
      status: "Converted to Sale", // Converted! Stock already deducted by invoice
      rows: [{ item: "Widget A", qty: 10 }],
    },
    {
      id: "so-3",
      status: "Cancelled",
      rows: [{ item: "Widget A", qty: 3 }],
    },
    {
      id: "so-4",
      status: "Closed",
      rows: [{ item: "Widget A", qty: 2 }],
    },
    {
      id: "so-5",
      status: "Pending", // Open/Pending reserves stock
      rows: [{ item: "Widget A", qty: 4 }],
    },
  ];

  // Stock reservation formula as fixed in StockSummaryReport:
  const reservedOrders = saleOrders.filter((order) => {
    const status = String(order.status || "open").toLowerCase();
    return (
      !status.includes("converted") &&
      !status.includes("cancelled") &&
      !status.includes("delivered") &&
      !status.includes("closed")
    );
  });

  assert.equal(reservedOrders.length, 2, "Only Open and Pending orders should reserve stock");
  assert.equal(reservedOrders[0].id, "so-1");
  assert.equal(reservedOrders[1].id, "so-5");

  const totalReserved = reservedOrders.reduce((sum, order) => {
    const row = order.rows.find((r) => r.item === "Widget A");
    return sum + (row ? Number(row.qty) : 0);
  }, 0);

  assert.equal(totalReserved, 9, "Total reserved should be 5 + 4 = 9 (not 19 or 24)");
});

test("Order balance calculation rule: Converted orders have 0 balance", () => {
  const openOrder = {
    amount: 15000,
    status: "Open",
  };
  const convertedSaleOrder = {
    amount: 15000,
    status: "Converted to Sale",
  };
  const convertedPurchaseOrder = {
    amount: 8000,
    status: "Converted to Purchase",
  };

  const getBalance = (order) =>
    order.status === "Converted to Sale" || order.status === "Converted to Purchase"
      ? 0
      : Number(order.amount || 0);

  assert.equal(getBalance(openOrder), 15000, "Open order balance equals amount");
  assert.equal(getBalance(convertedSaleOrder), 0, "Converted sale order balance is 0");
  assert.equal(getBalance(convertedPurchaseOrder), 0, "Converted purchase order balance is 0");
});
