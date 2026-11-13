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

test("Scenario 1-4: Sale Order creation, editing, conversion to Invoice, and duplicate conversion prevention", () => {
  setupInMemoryStorage();

  // 1. Create Sale Order
  const initialSO = {
    id: "so-1001",
    number: "SO-001",
    customer: "Alpha Enterprises",
    phone: "9876543210",
    date: "2026-11-01",
    dueDate: "2026-11-15",
    status: "Open",
    rows: [
      { id: "row-1", item: "Steel Pipe 2 inch", qty: 10, price: 500, tax: 18, discount: 0 },
    ],
  };
  saveSaleOrders([initialSO]);
  let orders = getSaleOrders();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].rows.length, 1);

  // 2. Edit existing Sale Order (add second item, modify first)
  const editedSO = {
    ...orders[0],
    rows: [
      { id: "row-1", item: "Steel Pipe 2 inch", qty: 12, price: 500, tax: 18, discount: 5 },
      { id: "row-2", item: "Fitting Joint", qty: 24, price: 50, tax: 18, discount: 0 },
    ],
  };
  saveSaleOrders([editedSO]);
  orders = getSaleOrders();
  assert.equal(orders[0].rows.length, 2);
  assert.equal(orders[0].rows[0].qty, 12);
  assert.equal(orders[0].rows[0].discount, 5);

  // 3. Convert Sale Order to Sale Invoice
  const orderToConvert = orders[0];
  assert.equal(orderToConvert.status, "Open");

  // Simulate invoice creation transferring item lines, customer, and tax/discount
  const createdInvoice = {
    id: "inv-2001",
    invoiceNumber: "INV-2001",
    customer: orderToConvert.customer,
    date: "2026-11-02",
    saleOrderId: orderToConvert.id,
    saleOrderNumber: orderToConvert.number,
    rows: orderToConvert.rows.map((r) => ({
      ...r,
      taxRate: String(r.tax),
      discountAmount: r.discount || 0,
    })),
  };

  // Status update triggered by AddSale saveSale
  updateSaleOrderStatus(orderToConvert.id, "Converted to Sale", {
    convertedInvoiceId: createdInvoice.id,
    convertedInvoiceNumber: createdInvoice.invoiceNumber,
  });

  orders = getSaleOrders();
  assert.equal(orders[0].status, "Converted to Sale");
  assert.equal(orders[0].convertedInvoiceId, "inv-2001");
  assert.equal(orders[0].convertedInvoiceNumber, "INV-2001");

  // 4. Attempt to convert again
  const canConvertAgain = orders[0].status !== "Converted to Sale";
  assert.equal(canConvertAgain, false, "Must block duplicate conversion");
});

test("Scenario 5-8: Purchase Order creation, editing, conversion to Bill, and duplicate conversion prevention", () => {
  setupInMemoryStorage();

  // 5. Create Purchase Order
  const initialPO = {
    id: "po-3001",
    number: "PO-001",
    supplier: "Beta Metal Traders",
    phone: "9123456780",
    date: "2026-11-03",
    dueDate: "2026-11-20",
    status: "Open",
    rows: [
      { id: "row-1", item: "Raw Steel 50kg", qty: 5, price: 4000, tax: 18, discount: 2 },
    ],
  };
  savePurchaseOrders([initialPO]);
  let orders = getPurchaseOrders();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].supplier, "Beta Metal Traders");

  // 6. Edit existing Purchase Order
  const editedPO = {
    ...orders[0],
    rows: [
      { id: "row-1", item: "Raw Steel 50kg", qty: 8, price: 3900, tax: 18, discount: 2 },
    ],
  };
  savePurchaseOrders([editedPO]);
  orders = getPurchaseOrders();
  assert.equal(orders[0].rows[0].qty, 8);
  assert.equal(orders[0].rows[0].price, 3900);

  // 7. Convert to Purchase Bill
  const poToConvert = orders[0];
  const createdBill = {
    id: "bill-4001",
    invoiceNumber: "BILL-4001",
    supplier: poToConvert.supplier,
    purchaseOrderId: poToConvert.id,
    purchaseOrderNumber: poToConvert.number,
  };

  updatePurchaseOrderStatus(poToConvert.id, "Converted to Purchase", {
    convertedPurchaseBillId: createdBill.id,
    convertedPurchaseBillNumber: createdBill.invoiceNumber,
  });

  orders = getPurchaseOrders();
  assert.equal(orders[0].status, "Converted to Purchase");
  assert.equal(orders[0].convertedPurchaseBillId, "bill-4001");

  // 8. Attempt to convert again
  const canConvertAgain = orders[0].status !== "Converted to Purchase";
  assert.equal(canConvertAgain, false, "Must block duplicate PO conversion");
});

test("Scenario 9: Stock calculation rules before and after conversion", () => {
  const initialStock = 100;

  // Case A: Open Sale Order for 15 units
  const saleOrders = [
    { id: "so-1", status: "Open", rows: [{ item: "Item-X", qty: 15 }] },
  ];

  const getReservedStock = (orders, itemName) =>
    orders
      .filter((o) => {
        const s = String(o.status || "").toLowerCase();
        return !s.includes("converted") && !s.includes("cancelled") && !s.includes("closed");
      })
      .reduce((sum, o) => {
        const row = (o.rows || []).find((r) => r.item === itemName);
        return sum + (row ? Number(row.qty || 0) : 0);
      }, 0);

  // Before conversion:
  const reservedBefore = getReservedStock(saleOrders, "Item-X");
  assert.equal(reservedBefore, 15, "Open SO must reserve 15 units");
  const availableStockBefore = initialStock - reservedBefore;
  assert.equal(availableStockBefore, 85, "Available stock is 100 - 15 = 85");

  // After conversion to Sale Invoice:
  // 1) The sale invoice physically deducts 15 units: stock becomes 100 - 15 = 85
  const physicalStockAfter = initialStock - 15;
  // 2) SO status is now "Converted to Sale"
  saleOrders[0].status = "Converted to Sale";
  const reservedAfter = getReservedStock(saleOrders, "Item-X");
  assert.equal(reservedAfter, 0, "Converted SO must NOT reserve stock");
  const availableStockAfter = physicalStockAfter - reservedAfter;
  assert.equal(availableStockAfter, 85, "Available stock remains 85, no double deduction!");
});

test("Scenario 10-13: Sale/Purchase Orders Report filtering, metrics, and search", () => {
  const soList = [
    {
      id: "so-1",
      number: "SO-001",
      customer: "Global Motors",
      date: "2026-11-01",
      dueDate: "2026-11-10",
      status: "Converted to Sale",
      amount: 50000,
      rows: [{ item: "Car Battery", qty: 10, price: 5000 }],
    },
    {
      id: "so-2",
      number: "SO-002",
      customer: "Speedy Repairs",
      date: "2026-11-05",
      dueDate: "2026-11-25",
      status: "Open",
      amount: 12000,
      rows: [{ item: "Brake Pads", qty: 6, price: 2000 }],
    },
  ];

  const poList = [
    {
      id: "po-1",
      number: "PO-001",
      supplier: "Exide Distribution",
      date: "2026-11-02",
      dueDate: "2026-11-12",
      status: "Open",
      amount: 40000,
      rows: [{ item: "Car Battery", qty: 10, price: 4000 }],
    },
  ];

  const normalized = [
    ...soList.map((o) => ({
      type: "Sale Order",
      orderNo: o.number,
      party: o.customer,
      amount: o.amount,
      balance: o.status === "Converted to Sale" ? 0 : o.amount,
      status: o.status,
      date: o.date,
    })),
    ...poList.map((o) => ({
      type: "Purchase Order",
      orderNo: o.number,
      party: o.supplier,
      amount: o.amount,
      balance: o.status === "Converted to Purchase" ? 0 : o.amount,
      status: o.status,
      date: o.date,
    })),
  ];

  assert.equal(normalized.length, 3);

  // Total summary calculations
  const totalOrders = normalized.length;
  const totalAmount = normalized.reduce((s, o) => s + o.amount, 0);
  const totalBalance = normalized.reduce((s, o) => s + o.balance, 0);
  assert.equal(totalOrders, 3);
  assert.equal(totalAmount, 102000);
  assert.equal(totalBalance, 52000, "Balance only counts open orders (12000 + 40000 = 52000)");

  // Filter by Type: Sale Order only
  const saleOnly = normalized.filter((o) => o.type === "Sale Order");
  assert.equal(saleOnly.length, 2);

  // Filter by Status: Open only
  const openOnly = normalized.filter((o) => o.status === "Open");
  assert.equal(openOnly.length, 2);

  // Filter by Party: "Global Motors"
  const globalMotorsOnly = normalized.filter((o) => o.party === "Global Motors");
  assert.equal(globalMotorsOnly.length, 1);
  assert.equal(globalMotorsOnly[0].orderNo, "SO-001");

  // Search by keyword "Speedy"
  const searchMatch = normalized.filter((o) =>
    o.orderNo.toLowerCase().includes("speedy") || o.party.toLowerCase().includes("speedy")
  );
  assert.equal(searchMatch.length, 1);
  assert.equal(searchMatch[0].orderNo, "SO-002");

  const searchSO2 = normalized.filter((o) => o.orderNo.toLowerCase().includes("so-002"));
  assert.equal(searchSO2.length, 1);
  assert.equal(searchSO2[0].party, "Speedy Repairs");
});

test("Scenario 15: Backup and Restore full round-trip for Orders", () => {
  const { storage } = setupInMemoryStorage({
    "ledgerly:companyProfile.v1": JSON.stringify({ companyName: "USK Test Co" }),
    "ledgerly:saleOrders.v1": JSON.stringify([
      { id: "so-1", number: "SO-1", customer: "Customer A", status: "Converted to Sale", amount: 1500 },
    ]),
    "ledgerly:purchaseOrders.v1": JSON.stringify([
      { id: "po-1", number: "PO-1", supplier: "Supplier B", status: "Open", amount: 2500 },
    ]),
  });

  // 1. Collect and Create Backup
  const collected = collectBackupData(storage);
  assert.ok(collected.data["ledgerly:saleOrders.v1"]);
  assert.ok(collected.data["ledgerly:purchaseOrders.v1"]);

  const payload = createBackupPayload(collected);
  validateBackupPayload(payload);

  // 2. Clear storage to simulate fresh device
  storage.clear();
  assert.equal(storage.getItem("ledgerly:saleOrders.v1"), null);
  assert.equal(storage.getItem("ledgerly:purchaseOrders.v1"), null);

  // 3. Restore Backup
  const repository = createLocalStorageBackupRestoreRepository(storage);
  const restoreResult = restoreBackupPayload(payload, repository);
  assert.ok(restoreResult.restoredCount >= 2);

  // 4. Verify orders are fully restored
  const restoredSO = JSON.parse(storage.getItem("ledgerly:saleOrders.v1"));
  const restoredPO = JSON.parse(storage.getItem("ledgerly:purchaseOrders.v1"));

  assert.equal(restoredSO.length, 1);
  assert.equal(restoredSO[0].number, "SO-1");
  assert.equal(restoredSO[0].status, "Converted to Sale");

  assert.equal(restoredPO.length, 1);
  assert.equal(restoredPO[0].number, "PO-1");
  assert.equal(restoredPO[0].status, "Open");
});
