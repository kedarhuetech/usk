import assert from "node:assert/strict";
import { test } from "node:test";
import { getSaleInvoices, saveSaleInvoice, normalizeInvoice, deleteSaleInvoice } from "./salesStorage.js";
import { saveBusinessSaleInvoice, loadSalesInvoices } from "./businessRecords.js";
import { transactionMatchesParty } from "./partyBalances.js";
import { transactionStorageKeys } from "./transactionRepository.js";
import { businessDataChangedEvent } from "./businessDataChanged.js";
import { setStorageMode } from "./dataStorageConfig.js";

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

test("1. A sale created for an existing selected party retains the correct party ID and party name", async () => {
  setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: "[]",
    "ledgerly:inventoryItems.v1": JSON.stringify([
      { id: "item-bat", itemName: "BAT", stock: "20", openingQuantity: "20" },
    ]),
  });

  const invoice = {
    id: "sale-party-test-1",
    transactionType: "sale",
    saleType: "credit",
    invoiceNumber: "INV-101",
    partyId: "party-sharma-101",
    partyName: "Sharma Traders",
    customer: "Sharma Traders",
    phone: "9876543210",
    form: {
      customer: "Sharma Traders",
      partyId: "party-sharma-101",
      partyName: "Sharma Traders",
      phone: "9876543210",
      invoiceNumber: "INV-101",
      invoiceDate: "2026-11-16",
      paymentType: "Credit",
    },
    rows: [
      { itemId: "item-bat", sourceItemId: "item-bat", item: "BAT", qty: 2, price: 500, unit: "PCS", amount: 1000 },
    ],
    totals: { finalTotal: 1000, received: 0, balance: 1000 },
  };

  const saved = await saveBusinessSaleInvoice(invoice);

  // Assert in returned object
  assert.equal(saved.partyId, "party-sharma-101");
  assert.equal(saved.partyName, "Sharma Traders");
  assert.equal(saved.customer, "Sharma Traders");
  assert.equal(saved.form.customer, "Sharma Traders");
  assert.equal(saved.form.partyId, "party-sharma-101");

  // Assert in persisted storage
  const loaded = getSaleInvoices();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].partyId, "party-sharma-101");
  assert.equal(loaded[0].partyName, "Sharma Traders");
  assert.equal(loaded[0].customer, "Sharma Traders");
  assert.equal(loaded[0].form?.customer, "Sharma Traders");
  assert.equal(loaded[0].form?.partyId, "party-sharma-101");

  delete globalThis.window;
});

test("2. A genuine Cash Sale remains identified as Cash Sale", async () => {
  setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: "[]",
    "ledgerly:inventoryItems.v1": JSON.stringify([
      { id: "item-bat", itemName: "BAT", stock: "20", openingQuantity: "20" },
    ]),
  });

  const invoice = {
    id: "sale-cash-test-1",
    transactionType: "sale",
    saleType: "cash",
    invoiceNumber: "INV-102",
    partyId: null,
    partyName: "Cash Sale",
    customer: "Cash Sale",
    form: {
      customer: "Cash Sale",
      invoiceNumber: "INV-102",
      invoiceDate: "2026-11-16",
      paymentType: "Cash",
    },
    rows: [
      { itemId: "item-bat", sourceItemId: "item-bat", item: "BAT", qty: 1, price: 500, unit: "PCS", amount: 500 },
    ],
    totals: { finalTotal: 500, received: 500, balance: 0 },
  };

  const saved = await saveBusinessSaleInvoice(invoice);

  assert.equal(saved.partyId, null);
  assert.equal(saved.partyName, "Cash Sale");
  assert.equal(saved.customer, "Cash Sale");
  assert.equal(saved.form.customer, "Cash Sale");

  const loaded = getSaleInvoices();
  assert.equal(loaded[0].partyName, "Cash Sale");
  assert.equal(loaded[0].partyId, null);

  delete globalThis.window;
});

test("3. The selected item BAT and its quantity are associated with the correct invoice", async () => {
  const { store } = setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: "[]",
    "ledgerly:inventoryItems.v1": JSON.stringify([
      { id: "item-bat", itemName: "BAT", stock: "20", openingQuantity: "20" },
    ]),
  });

  const invoice = {
    id: "sale-bat-test-1",
    transactionType: "sale",
    saleType: "credit",
    invoiceNumber: "INV-103",
    form: {
      customer: "Sharma Traders",
      partyId: "party-sharma-101",
      invoiceNumber: "INV-103",
      invoiceDate: "2026-11-16",
    },
    rows: [
      { itemId: "item-bat", sourceItemId: "item-bat", item: "BAT", qty: 4, price: 500, unit: "PCS", amount: 2000 },
    ],
    totals: { finalTotal: 2000, received: 0, balance: 2000 },
  };

  const saved = await saveBusinessSaleInvoice(invoice);

  assert.equal(saved.rows.length, 1);
  assert.equal(saved.rows[0].item, "BAT");
  assert.equal(saved.rows[0].itemName, "BAT");
  assert.equal(saved.rows[0].itemId, "item-bat");
  assert.equal(saved.rows[0].quantity, 4);
  assert.equal(saved.rows[0].unitPrice, 500);

  // Stock deduction check
  const inventory = JSON.parse(store.get("ledgerly:inventoryItems.v1"));
  assert.equal(inventory[0].stock, "16");

  delete globalThis.window;
});

test("4. A successfully saved invoice appears in the Sales Transactions list", async () => {
  setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: "[]",
    "ledgerly:inventoryItems.v1": "[]",
  });

  const invoice = {
    id: "sale-list-test-1",
    transactionType: "sale",
    saleType: "credit",
    invoiceNumber: "INV-104",
    partyId: "party-sharma-101",
    partyName: "Sharma Traders",
    form: { customer: "Sharma Traders", partyId: "party-sharma-101", invoiceNumber: "INV-104", invoiceDate: "2026-11-16" },
    rows: [{ item: "BAT", qty: 1, price: 600 }],
    totals: { finalTotal: 600, received: 0, balance: 600 },
  };

  await saveBusinessSaleInvoice(invoice);

  const transactions = await loadSalesInvoices();
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].invoiceNumber, "INV-104");
  assert.equal(transactions[0].partyName, "Sharma Traders");
  assert.equal(transactions[0].totalAmount, 600);

  delete globalThis.window;
});

test("5. The new invoice becomes visible in Reports without a full page refresh", async () => {
  const { eventListeners } = setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: "[]",
    "ledgerly:parties.v1": JSON.stringify([{ id: "party-sharma-101", partyName: "Sharma Traders" }]),
  });

  // Simulate Reports component tracking live sales
  let reportSalesState = [];
  window.addEventListener(businessDataChangedEvent, () => {
    reportSalesState = getSaleInvoices();
  });

  assert.equal(reportSalesState.length, 0);

  const invoice = {
    id: "sale-report-live-1",
    transactionType: "sale",
    saleType: "credit",
    invoiceNumber: "INV-105",
    partyId: "party-sharma-101",
    partyName: "Sharma Traders",
    form: { customer: "Sharma Traders", partyId: "party-sharma-101", invoiceNumber: "INV-105" },
    rows: [{ item: "BAT", qty: 2, price: 500 }],
    totals: { finalTotal: 1000, received: 0, balance: 1000 },
  };

  await saveBusinessSaleInvoice(invoice);

  // Live report state updated via event without browser refresh
  assert.equal(reportSalesState.length, 1);
  assert.equal(reportSalesState[0].partyName, "Sharma Traders");

  // Party statement matching check
  const party = { id: "party-sharma-101", partyName: "Sharma Traders" };
  const matches = transactionMatchesParty(reportSalesState[0], party);
  assert.equal(matches, true);

  delete globalThis.window;
});

test("6. The invoice remains visible after refreshing the browser", async () => {
  const env = setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: "[]",
  });

  const invoice = {
    id: "sale-reload-test-1",
    transactionType: "sale",
    saleType: "credit",
    invoiceNumber: "INV-106",
    partyId: "party-sharma-101",
    partyName: "Sharma Traders",
    form: { customer: "Sharma Traders", partyId: "party-sharma-101", invoiceNumber: "INV-106" },
    rows: [{ item: "BAT", qty: 1, price: 1000 }],
    totals: { finalTotal: 1000, received: 0, balance: 1000 },
  };

  await saveBusinessSaleInvoice(invoice);

  // Simulate browser refresh by creating fresh window object referencing the same persisted store
  const savedData = env.store.get(transactionStorageKeys.sales);
  assert.ok(savedData);

  setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: savedData,
  });

  const freshLoaded = await loadSalesInvoices();
  assert.equal(freshLoaded.length, 1);
  assert.equal(freshLoaded[0].invoiceNumber, "INV-106");
  assert.equal(freshLoaded[0].partyName, "Sharma Traders");
  assert.equal(freshLoaded[0].partyId, "party-sharma-101");
  assert.equal(freshLoaded[0].rows[0].item, "BAT");

  delete globalThis.window;
});

test("7. Existing sales invoices continue to load correctly", async () => {
  // Existing legacy invoice in storage dated 16/11/2026 with Cash Sale or missing form
  const legacyInvoices = [
    {
      id: "legacy-sale-16-11-2026",
      transactionType: "sale",
      saleType: "cash",
      invoiceNumber: "1",
      createdAt: "2026-11-16T10:00:00.000Z",
      form: { customer: "Cash Sale", invoiceNumber: "1", invoiceDate: "2026-11-16", paymentType: "Cash" },
      totals: { finalTotal: 450, received: 450, balance: 0 },
      rows: [{ item: "General Item", qty: 1, price: 450 }],
    },
  ];

  setupMockEnvironment({
    "ledgerly:storageMode": "local",
    [transactionStorageKeys.sales]: JSON.stringify(legacyInvoices),
  });

  const loaded = await loadSalesInvoices();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "legacy-sale-16-11-2026");
  assert.equal(loaded[0].partyName, "Cash Sale");
  assert.equal(loaded[0].totalAmount, 450);
  assert.equal(loaded[0].rows[0].item, "General Item");

  delete globalThis.window;
});

test("8. A failed save does not incorrectly display a successful receipt/save confirmation", async () => {
  let shouldFail = false;
  const env = setupMockEnvironment({
    "ledgerly:storageMode": "database",
    [transactionStorageKeys.sales]: "[]",
  });

  // Mock global fetch to fail when saving to MySQL
  globalThis.fetch = async () => {
    if (shouldFail) {
      return {
        ok: false,
        status: 500,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ success: false, message: "Database connection failed" }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: true, data: { id: "test-id" } }),
    };
  };

  shouldFail = true;

  const invoice = {
    id: "sale-must-fail-1",
    transactionType: "sale",
    saleType: "credit",
    invoiceNumber: "INV-FAIL",
    form: { customer: "Sharma Traders", invoiceNumber: "INV-FAIL" },
    rows: [{ item: "BAT", qty: 1, price: 100 }],
    totals: { finalTotal: 100, received: 0, balance: 100 },
  };

  let caughtError = null;
  try {
    await saveBusinessSaleInvoice(invoice);
  } catch (err) {
    caughtError = err;
  }

  // Persistence failure was correctly raised
  assert.ok(caughtError);
  assert.match(caughtError.message, /Database connection failed/);

  // Local storage did not keep the failed invoice
  const currentSales = getSaleInvoices();
  assert.equal(currentSales.length, 0);

  // Session storage did not store the receipt
  assert.equal(env.sessionStore.get("ledgerly:lastSaleInvoice") ?? null, null);

  delete globalThis.fetch;
  delete globalThis.window;
});
