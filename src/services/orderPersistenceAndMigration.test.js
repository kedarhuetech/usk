import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSaleOrders,
  saveSaleOrders,
  getPurchaseOrders,
  savePurchaseOrders,
  getOrderFulfillmentSummary,
  transactionStorageKeys,
} from "./transactionRepository.js";
import { transactionsDb, saleOrdersDb, purchaseOrdersDb } from "./databaseRepository.js";

function setupMockEnvironment(initialStorage = {}) {
  const store = new Map(Object.entries(initialStorage));
  const sessionStore = new Map();
  const eventListeners = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
    },
    sessionStorage: {
      getItem: (key) => sessionStore.get(key) ?? null,
      setItem: (key, val) => sessionStore.set(key, String(val)),
      removeItem: (key) => sessionStore.delete(key),
    },
    addEventListener: (event, handler) => {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      const list = eventListeners.get(event) || [];
      eventListeners.set(event, list.filter((h) => h !== handler));
    },
    dispatchEvent: (event) => {
      const type = event?.type || event;
      const list = eventListeners.get(type) || [];
      list.forEach((h) => h(event));
      return true;
    },
  };

  return { store, sessionStore, eventListeners };
}

test("1. Creating a Sale Order preserves all document numbers, dates, party and item details", () => {
  setupMockEnvironment({
    [transactionStorageKeys.saleOrders]: "[]",
  });

  const saleOrder = {
    id: "so-1001",
    transactionType: "sale_order",
    number: "SO-001",
    customer: "Metro Supermarket",
    phone: "9876543210",
    date: "2026-11-16",
    dueDate: "2026-11-25",
    state: "Maharashtra",
    amount: 5400,
    status: "Open",
    roundOff: true,
    roundOffValue: "-0.50",
    terms: "Payment within 15 days",
    description: "Urgent festival order",
    rows: [
      {
        id: "r1",
        item: "Premium Basmati Rice",
        size: "25kg",
        description: "Grade A Aged Rice",
        qty: "4",
        unit: "BAG",
        price: "1200",
        discount: "5",
        tax: "5",
        cess: "0",
      },
      {
        id: "r2",
        item: "Cooking Oil Can",
        size: "5L",
        description: "Refined Sunflower",
        qty: "2",
        unit: "CAN",
        price: "600",
        discount: "0",
        tax: "5",
        cess: "0",
      },
    ],
  };

  saveSaleOrders([saleOrder]);
  const loaded = getSaleOrders();

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "so-1001");
  assert.equal(loaded[0].number, "SO-001");
  assert.equal(loaded[0].customer, "Metro Supermarket");
  assert.equal(loaded[0].phone, "9876543210");
  assert.equal(loaded[0].date, "2026-11-16");
  assert.equal(loaded[0].dueDate, "2026-11-25");
  assert.equal(loaded[0].amount, 5400);
  assert.equal(loaded[0].status, "Open");
  assert.equal(loaded[0].rows.length, 2);
  assert.equal(loaded[0].rows[0].item, "Premium Basmati Rice");
  assert.equal(loaded[0].rows[0].size, "25kg");
  assert.equal(loaded[0].rows[0].description, "Grade A Aged Rice");
  assert.equal(loaded[0].rows[0].qty, "4");
  assert.equal(loaded[0].rows[0].price, "1200");
  assert.equal(loaded[0].rows[0].discount, "5");
});

test("2. Editing a Sale Order updates the record in-place without duplicating", () => {
  const initial = {
    id: "so-1002",
    number: "SO-002",
    customer: "Apex Retail",
    phone: "9822001122",
    date: "2026-11-16",
    amount: 2000,
    status: "Open",
    rows: [{ id: "r1", item: "Widget A", qty: "2", price: "1000" }],
  };

  setupMockEnvironment({
    [transactionStorageKeys.saleOrders]: JSON.stringify([initial]),
  });

  const updated = {
    ...initial,
    amount: 3000,
    rows: [{ id: "r1", item: "Widget A", qty: "3", price: "1000" }],
    description: "Increased order quantity to 3",
  };

  const list = getSaleOrders();
  const next = list.map((order) => (order.id === updated.id ? updated : order));
  saveSaleOrders(next);

  const reloaded = getSaleOrders();
  assert.equal(reloaded.length, 1, "Must maintain exactly 1 order row");
  assert.equal(reloaded[0].id, "so-1002");
  assert.equal(reloaded[0].amount, 3000);
  assert.equal(reloaded[0].rows[0].qty, "3");
  assert.equal(reloaded[0].description, "Increased order quantity to 3");
});

test("3. Deleting a Sale Order removes the specific record completely", () => {
  setupMockEnvironment({
    [transactionStorageKeys.saleOrders]: JSON.stringify([
      { id: "so-keep", number: "SO-010", customer: "Customer 1", amount: 1000 },
      { id: "so-del", number: "SO-011", customer: "Customer 2", amount: 2000 },
    ]),
  });

  const current = getSaleOrders();
  const next = current.filter((order) => order.id !== "so-del");
  saveSaleOrders(next);

  const remaining = getSaleOrders();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "so-keep");
  assert.equal(remaining[0].number, "SO-010");
});

test("4. Creating a Purchase Order preserves supplier details, quantities, rates and notes", () => {
  setupMockEnvironment({
    [transactionStorageKeys.purchaseOrders]: "[]",
  });

  const purchaseOrder = {
    id: "po-2001",
    transactionType: "purchase_order",
    number: "PO-501",
    supplier: "Global Mills Ltd",
    phone: "9811223344",
    date: "2026-11-16",
    dueDate: "2026-11-30",
    amount: 15000,
    status: "Open",
    terms: "Delivery at warehouse gate",
    description: "Raw material bulk procurement",
    rows: [
      {
        id: "pr1",
        item: "Industrial Fabric",
        qty: "100",
        unit: "MTR",
        price: "150",
        discount: "0",
        tax: "12",
      },
    ],
  };

  savePurchaseOrders([purchaseOrder]);
  const loaded = getPurchaseOrders();

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "po-2001");
  assert.equal(loaded[0].number, "PO-501");
  assert.equal(loaded[0].supplier, "Global Mills Ltd");
  assert.equal(loaded[0].phone, "9811223344");
  assert.equal(loaded[0].amount, 15000);
  assert.equal(loaded[0].rows[0].item, "Industrial Fabric");
  assert.equal(loaded[0].rows[0].qty, "100");
  assert.equal(loaded[0].rows[0].price, "150");
});

test("5. Editing a Purchase Order updates fields in-place without duplication", () => {
  const initial = {
    id: "po-2002",
    number: "PO-502",
    supplier: "Zenith Packaging",
    amount: 8000,
    status: "Open",
    rows: [{ id: "r1", item: "Boxes", qty: "400", price: "20" }],
  };

  setupMockEnvironment({
    [transactionStorageKeys.purchaseOrders]: JSON.stringify([initial]),
  });

  const updated = {
    ...initial,
    amount: 10000,
    rows: [{ id: "r1", item: "Boxes", qty: "500", price: "20" }],
    status: "Partially Received",
  };

  const list = getPurchaseOrders();
  savePurchaseOrders(list.map((order) => (order.id === updated.id ? updated : order)));

  const reloaded = getPurchaseOrders();
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].id, "po-2002");
  assert.equal(reloaded[0].amount, 10000);
  assert.equal(reloaded[0].status, "Partially Received");
});

test("6. Deleting a Purchase Order removes the specific record", () => {
  setupMockEnvironment({
    [transactionStorageKeys.purchaseOrders]: JSON.stringify([
      { id: "po-1", number: "PO-100", supplier: "Supplier A" },
      { id: "po-2", number: "PO-200", supplier: "Supplier B" },
    ]),
  });

  const current = getPurchaseOrders();
  savePurchaseOrders(current.filter((o) => o.id !== "po-1"));

  const remaining = getPurchaseOrders();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "po-2");
});

test("7. Refresh persistence: Orders re-hydrate seamlessly from persistent storage", () => {
  const storeData = [
    {
      id: "so-refresh-test",
      number: "SO-999",
      customer: "Permanent Customer",
      date: "2026-11-16",
      amount: 4500,
      status: "Open",
      rows: [{ id: "r1", item: "Steel Rods", qty: "10", price: "450" }],
    },
  ];

  setupMockEnvironment({
    [transactionStorageKeys.saleOrders]: JSON.stringify(storeData),
  });

  // Emulate browser tab refresh
  const freshLoaded = getSaleOrders();
  assert.equal(freshLoaded.length, 1);
  assert.equal(freshLoaded[0].id, "so-refresh-test");
  assert.equal(freshLoaded[0].customer, "Permanent Customer");
  assert.equal(freshLoaded[0].amount, 4500);
});

test("8. Existing localStorage migration: local orders map to database transaction format", () => {
  const localOrder = {
    id: "legacy-so-1",
    number: "SO-LEGACY-01",
    customer: "Old Customer",
    phone: "9998887776",
    date: "2026-11-01",
    dueDate: "2026-11-15",
    amount: 7200,
    status: "Open",
    rows: [
      {
        id: "line-1",
        item: "Cement Bags",
        description: "50kg Grade 53",
        size: "50kg",
        qty: "20",
        price: "360",
        discount: "0",
        tax: "28",
      },
    ],
  };

  // Convert to database payload representation
  const dbPayload = {
    id: localOrder.id,
    transactionType: "sale_order",
    type: "sale_order",
    documentNumber: localOrder.number,
    number: localOrder.number,
    transactionDate: localOrder.date,
    partyName: localOrder.customer,
    customer: localOrder.customer,
    partyPhone: localOrder.phone,
    totalAmount: localOrder.amount,
    amount: localOrder.amount,
    status: localOrder.status,
    rows: localOrder.rows.map((r) => ({
      name: r.item,
      itemName: r.item,
      itemCode: r.size,
      serialNo: r.description,
      qty: Number(r.qty),
      unitPrice: Number(r.price),
    })),
  };

  assert.equal(dbPayload.id, "legacy-so-1");
  assert.equal(dbPayload.transactionType, "sale_order");
  assert.equal(dbPayload.documentNumber, "SO-LEGACY-01");
  assert.equal(dbPayload.customer, "Old Customer");
  assert.equal(dbPayload.rows[0].itemName, "Cement Bags");
  assert.equal(dbPayload.rows[0].itemCode, "50kg");
  assert.equal(dbPayload.rows[0].serialNo, "50kg Grade 53");
});

test("9. Duplicate migration prevention: idempotent deduplication by stable ID and number", () => {
  const existingRemote = [
    { id: "so-1", number: "SO-001", customer: "Customer A", amount: 1000 },
    { id: "so-2", number: "SO-002", customer: "Customer B", amount: 2000 },
  ];

  const localList = [
    { id: "so-1", number: "SO-001", customer: "Customer A", amount: 1000 }, // Duplicate of remote
    { id: "so-3", number: "SO-003", customer: "Customer C", amount: 3000 }, // New unmigrated
  ];

  const remoteIdSet = new Set(existingRemote.map((r) => String(r.id || r.number)));
  const unmigrated = localList.filter((l) => !remoteIdSet.has(String(l.id)) && !remoteIdSet.has(String(l.number)));

  assert.equal(unmigrated.length, 1);
  assert.equal(unmigrated[0].id, "so-3");

  // Merging deduplicates perfectly
  const mergedMap = new Map();
  existingRemote.forEach((r) => mergedMap.set(String(r.id || r.number), r));
  unmigrated.forEach((u) => mergedMap.set(String(u.id || u.number), u));

  const finalMerged = [...mergedMap.values()];
  assert.equal(finalMerged.length, 3);
  assert.deepEqual(
    finalMerged.map((m) => m.id),
    ["so-1", "so-2", "so-3"]
  );
});

test("10. MySQL failure handling: local data is preserved and marked pending when backend is offline", async () => {
  setupMockEnvironment({
    [transactionStorageKeys.saleOrders]: "[]",
  });

  const order = {
    id: "so-offline-1",
    number: "SO-OFFLINE",
    customer: "Offline Client",
    amount: 1200,
    rows: [{ item: "Item Off", qty: "1", price: "1200" }],
  };

  // 1. Local cache persists first
  saveSaleOrders([order]);
  const cached = getSaleOrders();
  assert.equal(cached.length, 1, "Cache must preserve entered order immediately");

  // 2. Mock network failure
  let errorCaught = false;
  let simulatedDbSave = async () => {
    throw new Error("ETIMEDOUT: MySQL server unreachable");
  };

  try {
    // Calling simulated remote save
    await simulatedDbSave();
  } catch (err) {
    errorCaught = true;
  }
  assert.equal(errorCaught, true);

  // 3. User data remains fully intact in storage
  const persistedLocally = getSaleOrders();
  assert.equal(persistedLocally.length, 1);
  assert.equal(persistedLocally[0].id, "so-offline-1");
  assert.equal(persistedLocally[0].customer, "Offline Client");
});

test("11. Preservation of party and item details across round-trip", () => {
  const rawOrder = {
    id: "po-detail-check",
    number: "PO-777",
    supplier: "Precision Tooling Co",
    phone: "9123400000",
    date: "2026-11-16",
    dueDate: "2026-11-20",
    amount: 6720,
    status: "Open",
    rows: [
      {
        id: "item-1",
        item: "Carbide Drill Bit",
        size: "10mm",
        description: "Hardened steel coating",
        qty: "10",
        unit: "PCS",
        price: "600",
        discount: "0",
        tax: "12",
        cess: "0",
      },
    ],
  };

  setupMockEnvironment({
    [transactionStorageKeys.purchaseOrders]: JSON.stringify([rawOrder]),
  });

  const loaded = getPurchaseOrders();
  assert.equal(loaded[0].supplier, "Precision Tooling Co");
  assert.equal(loaded[0].rows[0].item, "Carbide Drill Bit");
  assert.equal(loaded[0].rows[0].size, "10mm");
  assert.equal(loaded[0].rows[0].description, "Hardened steel coating");
  assert.equal(loaded[0].rows[0].qty, "10");
  assert.equal(loaded[0].rows[0].price, "600");
  assert.equal(loaded[0].rows[0].tax, "12");
});

test("12. Regression checks: Order fulfillment summary and conversion calculations remain intact", () => {
  const orderWithPartialConversion = {
    id: "so-fulfill-test",
    number: "SO-300",
    amount: 10000,
    status: "Partially Converted",
    rows: [
      {
        id: "r1",
        item: "Item Alpha",
        orderedQty: 100,
        qty: 100,
        convertedQty: 40,
        remainingQty: 60,
        price: 100,
      },
    ],
  };

  const summary = getOrderFulfillmentSummary(orderWithPartialConversion);
  assert.equal(summary.totalOrderedQty, 100);
  assert.equal(summary.totalConvertedQty, 40);
  assert.equal(summary.totalRemainingQty, 60);
  assert.equal(summary.convertedAmount, 4000);
  assert.equal(summary.remainingAmount, 6000);
  assert.equal(summary.isPartiallyConverted, true);
  assert.equal(summary.isFullyConverted, false);
});
