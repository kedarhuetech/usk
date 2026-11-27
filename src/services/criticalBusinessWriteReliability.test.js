import test from "node:test";
import assert from "node:assert/strict";
import {
  saveBusinessSaleInvoice,
  deleteBusinessSaleInvoice,
  saveBusinessPurchaseBill,
  deleteBusinessPurchaseBill,
  saveBusinessItem,
  deleteBusinessItem,
  saveBusinessParty,
  deleteBusinessParty,
} from "./businessRecords.js";
import { getInventoryItems, inventoryItemsStorageKey, getItemsStorageKey } from "./itemsStorage.js";
import { getSaleInvoices, saleInvoicesStorageKey } from "./salesStorage.js";
import { getPurchaseBills, purchaseBillsStorageKey } from "./purchaseBillsStorage.js";
import { getParties, partiesStorageKey, setMemoryParties, getPartiesStorageKey } from "./partiesStorage.js";
import { STORAGE_MODE_KEY } from "./dataStorageConfig.js";
import { clearMemoryCollections } from "./transactionRepository.js";
import { getScopedStorageKey } from "../config/businessConfig.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    this.values.set(key, String(value));
    if (key === inventoryItemsStorageKey) {
      this.values.set(getItemsStorageKey(), String(value));
    } else if (key === partiesStorageKey) {
      this.values.set(getPartiesStorageKey(), String(value));
    } else if (key === purchaseBillsStorageKey) {
      this.values.set(getScopedStorageKey(purchaseBillsStorageKey), String(value));
    } else if (key === saleInvoicesStorageKey) {
      this.values.set(getScopedStorageKey(saleInvoicesStorageKey), String(value));
    }
  }
  removeItem(key) {
    this.values.delete(key);
    if (key === inventoryItemsStorageKey) {
      this.values.delete(getItemsStorageKey());
    } else if (key === partiesStorageKey) {
      this.values.delete(getPartiesStorageKey());
    } else if (key === purchaseBillsStorageKey) {
      this.values.delete(getScopedStorageKey(purchaseBillsStorageKey));
    } else if (key === saleInvoicesStorageKey) {
      this.values.delete(getScopedStorageKey(saleInvoicesStorageKey));
    }
  }
}

function setupEnvironment({ storageMode = "database" } = {}) {
  clearMemoryCollections();
  setMemoryParties([]);
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_MODE_KEY, storageMode);

  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;

  globalThis.window = {
    localStorage: storage,
    document: {},
    dispatchEvent: () => true,
    CustomEvent: class { constructor(type, detail) { this.type = type; this.detail = detail; } },
  };

  return {
    storage,
    restore: () => {
      clearMemoryCollections();
      setMemoryParties([]);
      globalThis.fetch = previousFetch;
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    },
  };
}

// ---------------------------------------------------------
// 1. PURCHASE BILLS WRITE RELIABILITY
// ---------------------------------------------------------

test("saveBusinessPurchaseBill: successful persistence saves to MySQL, updates local storage and inventory", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-p1", itemName: "Cement", stock: "10", openingQuantity: "10" };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));

  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        success: true,
        data: { id: "bill-1", invoiceNumber: "PB-001", totalAmount: 500 },
      }),
    };
  };

  try {
    const saved = await saveBusinessPurchaseBill({
      id: "bill-1",
      invoiceNumber: "PB-001",
      totalAmount: 500,
      rows: [{ sourceItemId: "item-p1", item: "Cement", qty: 5, price: 100 }],
    });

    assert.equal(saved.id, "bill-1");
    const bills = getPurchaseBills();
    assert.equal(bills.length, 1);
    assert.equal(bills[0].id, "bill-1");

    // Stock should have increased by 5 (10 + 5 = 15)
    const items = getInventoryItems();
    const item = items.find((i) => i.id === "item-p1");
    assert.equal(Number(item.stock), 15);
  } finally {
    env.restore();
  }
});

test("saveBusinessPurchaseBill: MySQL failure rolls back local purchase bill and stock adjustments, re-throwing error", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-p1", itemName: "Cement", stock: "10", openingQuantity: "10" };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "MySQL connection timeout" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await saveBusinessPurchaseBill({
          id: "bill-fail-1",
          invoiceNumber: "PB-FAIL",
          totalAmount: 500,
          rows: [{ sourceItemId: "item-p1", item: "Cement", qty: 5, price: 100 }],
        });
      },
      /MySQL connection timeout|Request failed/
    );

    // Verify local storage does NOT contain the failed purchase bill
    const bills = getPurchaseBills();
    assert.equal(bills.some((b) => b.id === "bill-fail-1"), false, "Failed purchase bill must not remain in local storage");

    // Verify item stock was rolled back to initial 10
    const items = getInventoryItems();
    const item = items.find((i) => i.id === "item-p1");
    assert.equal(Number(item.stock), 10, "Item stock must be rolled back on purchase failure");
  } finally {
    env.restore();
  }
});

test("saveBusinessPurchaseBill: MySQL failure on edit restores pre-existing bill and stock without wiping it", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-p1", itemName: "Cement", stock: "15", openingQuantity: "15" };
  const existingBill = {
    id: "bill-edit-1",
    invoiceNumber: "PB-001",
    totalAmount: 500,
    rows: [{ sourceItemId: "item-p1", item: "Cement", qty: 5, price: 100 }],
    stockAdjustedAt: "2026-01-01T00:00:00.000Z",
  };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));
  env.storage.setItem(purchaseBillsStorageKey, JSON.stringify([existingBill]));

  // Simulate network failure when updating
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Deadlock detected" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await saveBusinessPurchaseBill({
          id: "bill-edit-1",
          invoiceNumber: "PB-001-EDITED",
          totalAmount: 1000,
          rows: [{ sourceItemId: "item-p1", item: "Cement", qty: 10, price: 100 }],
          stockAdjustedAt: "2026-01-01T00:00:00.000Z",
        });
      },
      /Deadlock detected|Request failed/
    );

    // Pre-existing bill must still exist in its original state
    const bills = getPurchaseBills();
    assert.equal(bills.length, 1);
    assert.equal(bills[0].id, "bill-edit-1");
    assert.equal(bills[0].invoiceNumber, "PB-001");
    assert.equal(bills[0].totalAmount, 500);

    // Stock must remain unchanged at 15
    const item = getInventoryItems().find((i) => i.id === "item-p1");
    assert.equal(Number(item.stock), 15);
  } finally {
    env.restore();
  }
});

test("deleteBusinessPurchaseBill: deletes from MySQL first, then reverses stock and removes locally", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-p1", itemName: "Cement", stock: "15", openingQuantity: "15" };
  const bill = {
    id: "bill-del-1",
    invoiceNumber: "PB-DEL",
    totalAmount: 500,
    rows: [{ sourceItemId: "item-p1", item: "Cement", qty: 5, price: 100 }],
    stockAdjustedAt: "2026-01-01T00:00:00.000Z",
  };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));
  env.storage.setItem(purchaseBillsStorageKey, JSON.stringify([bill]));

  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, method: options?.method || "GET" });
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true }),
    };
  };

  try {
    await deleteBusinessPurchaseBill("bill-del-1");
    assert.ok(fetchCalls.some((c) => c.method === "DELETE" && c.url.includes("bill-del-1")));

    const bills = getPurchaseBills();
    assert.equal(bills.length, 0);

    // Purchase stock reversed (15 - 5 = 10)
    const item = getInventoryItems().find((i) => i.id === "item-p1");
    assert.equal(Number(item.stock), 10);
  } finally {
    env.restore();
  }
});

test("deleteBusinessPurchaseBill: MySQL failure halts deletion and leaves local bill and stock intact", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-p1", itemName: "Cement", stock: "15", openingQuantity: "15" };
  const bill = {
    id: "bill-del-2",
    invoiceNumber: "PB-DEL-2",
    totalAmount: 500,
    rows: [{ sourceItemId: "item-p1", item: "Cement", qty: 5, price: 100 }],
    stockAdjustedAt: "2026-01-01T00:00:00.000Z",
  };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));
  env.storage.setItem(purchaseBillsStorageKey, JSON.stringify([bill]));

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Database offline" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await deleteBusinessPurchaseBill("bill-del-2");
      },
      /Database offline|Request failed/
    );

    // Bill must still exist
    const bills = getPurchaseBills();
    assert.equal(bills.length, 1);
    assert.equal(bills[0].id, "bill-del-2");

    // Stock must NOT have been reversed
    const item = getInventoryItems().find((i) => i.id === "item-p1");
    assert.equal(Number(item.stock), 15);
  } finally {
    env.restore();
  }
});

// ---------------------------------------------------------
// 2. SALES INVOICES WRITE RELIABILITY
// ---------------------------------------------------------

test("saveBusinessSaleInvoice: successful persistence saves to MySQL, updates local storage and stock", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-s1", itemName: "Paint", stock: "20", openingQuantity: "20" };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));

  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        success: true,
        data: { id: "sale-1", invoiceNumber: "INV-001", totalAmount: 400 },
      }),
    };
  };

  try {
    const saved = await saveBusinessSaleInvoice({
      id: "sale-1",
      transactionType: "sale",
      invoiceNumber: "INV-001",
      totalAmount: 400,
      rows: [{ sourceItemId: "item-s1", item: "Paint", qty: 4, price: 100 }],
    });

    assert.equal(saved.id, "sale-1");
    const sales = getSaleInvoices();
    assert.equal(sales.length, 1);
    assert.equal(sales[0].id, "sale-1");

    // Stock should have decreased by 4 (20 - 4 = 16)
    const item = getInventoryItems().find((i) => i.id === "item-s1");
    assert.equal(Number(item.stock), 16);
  } finally {
    env.restore();
  }
});

test("saveBusinessSaleInvoice: MySQL failure rolls back local invoice and stock adjustments, re-throwing error", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-s1", itemName: "Paint", stock: "20", openingQuantity: "20" };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Transaction rolled back on MySQL" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await saveBusinessSaleInvoice({
          id: "sale-fail-1",
          transactionType: "sale",
          invoiceNumber: "INV-FAIL",
          totalAmount: 400,
          rows: [{ sourceItemId: "item-s1", item: "Paint", qty: 4, price: 100 }],
        });
      },
      /Transaction rolled back on MySQL|Request failed/
    );

    // Verify local storage does NOT contain the failed sale invoice
    const sales = getSaleInvoices();
    assert.equal(sales.some((s) => s.id === "sale-fail-1"), false);

    // Stock must be restored to 20
    const item = getInventoryItems().find((i) => i.id === "item-s1");
    assert.equal(Number(item.stock), 20);
  } finally {
    env.restore();
  }
});

test("saveBusinessSaleInvoice: MySQL failure on edit restores pre-existing invoice and stock without deleting it", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-s1", itemName: "Paint", stock: "16", openingQuantity: "16" };
  const existingSale = {
    id: "sale-edit-1",
    transactionType: "sale",
    invoiceNumber: "INV-001",
    totalAmount: 400,
    rows: [{ sourceItemId: "item-s1", item: "Paint", qty: 4, price: 100 }],
    stockAdjustedAt: "2026-01-01T00:00:00.000Z",
  };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));
  env.storage.setItem(saleInvoicesStorageKey, JSON.stringify([existingSale]));

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Lock wait timeout" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await saveBusinessSaleInvoice({
          id: "sale-edit-1",
          transactionType: "sale",
          invoiceNumber: "INV-001-EDITED",
          totalAmount: 800,
          rows: [{ sourceItemId: "item-s1", item: "Paint", qty: 8, price: 100 }],
          stockAdjustedAt: "2026-01-01T00:00:00.000Z",
        });
      },
      /Lock wait timeout|Request failed/
    );

    // Original sale must still exist
    const sales = getSaleInvoices();
    assert.equal(sales.length, 1);
    assert.equal(sales[0].id, "sale-edit-1");
    assert.equal(sales[0].invoiceNumber, "INV-001");
    assert.equal(sales[0].totalAmount, 400);

    // Stock must be restored to 16
    const item = getInventoryItems().find((i) => i.id === "item-s1");
    assert.equal(Number(item.stock), 16);
  } finally {
    env.restore();
  }
});

test("deleteBusinessSaleInvoice: deletes from MySQL first, then reverses stock and removes locally", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-s1", itemName: "Paint", stock: "16", openingQuantity: "16" };
  const sale = {
    id: "sale-del-1",
    transactionType: "sale",
    invoiceNumber: "INV-DEL",
    totalAmount: 400,
    rows: [{ sourceItemId: "item-s1", item: "Paint", qty: 4, price: 100 }],
    stockAdjustedAt: "2026-01-01T00:00:00.000Z",
  };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));
  env.storage.setItem(saleInvoicesStorageKey, JSON.stringify([sale]));

  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, method: options?.method || "GET" });
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true }),
    };
  };

  try {
    await deleteBusinessSaleInvoice("sale-del-1");
    assert.ok(fetchCalls.some((c) => c.method === "DELETE" && c.url.includes("sale-del-1")));

    const sales = getSaleInvoices();
    assert.equal(sales.length, 0);

    // Stock restored (16 + 4 = 20)
    const item = getInventoryItems().find((i) => i.id === "item-s1");
    assert.equal(Number(item.stock), 20);
  } finally {
    env.restore();
  }
});

test("deleteBusinessSaleInvoice: MySQL failure halts deletion and leaves local invoice and stock intact", async () => {
  const env = setupEnvironment();
  const initialItem = { id: "item-s1", itemName: "Paint", stock: "16", openingQuantity: "16" };
  const sale = {
    id: "sale-del-2",
    transactionType: "sale",
    invoiceNumber: "INV-DEL-2",
    totalAmount: 400,
    rows: [{ sourceItemId: "item-s1", item: "Paint", qty: 4, price: 100 }],
    stockAdjustedAt: "2026-01-01T00:00:00.000Z",
  };
  env.storage.setItem(inventoryItemsStorageKey, JSON.stringify([initialItem]));
  env.storage.setItem(saleInvoicesStorageKey, JSON.stringify([sale]));

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Foreign key constraint failure" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await deleteBusinessSaleInvoice("sale-del-2");
      },
      /Foreign key constraint failure|Request failed/
    );

    // Sale must still exist
    const sales = getSaleInvoices();
    assert.equal(sales.length, 1);
    assert.equal(sales[0].id, "sale-del-2");

    // Stock must not have changed
    const item = getInventoryItems().find((i) => i.id === "item-s1");
    assert.equal(Number(item.stock), 16);
  } finally {
    env.restore();
  }
});

// ---------------------------------------------------------
// 3. ITEMS / PRODUCTS WRITE RELIABILITY
// ---------------------------------------------------------

test("saveBusinessItem: persists to MySQL, updates local storage with remote confirmation", async () => {
  const env = setupEnvironment();

  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, "POST");
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        success: true,
        data: { id: "item-100", itemName: "Steel Rod", stock: "50" },
      }),
    };
  };

  try {
    const saved = await saveBusinessItem({ id: "item-100", itemName: "Steel Rod", stock: "50" });
    assert.equal(saved.id, "item-100");

    const items = getInventoryItems();
    assert.equal(items.length, 1);
    assert.equal(items[0].itemName, "Steel Rod");
  } finally {
    env.restore();
  }
});

test("saveBusinessItem: MySQL failure halts save and does NOT insert item into local storage", async () => {
  const env = setupEnvironment();

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Duplicate item code" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await saveBusinessItem({ id: "item-fail", itemName: "Broken Item" });
      },
      /Duplicate item code|Request failed/
    );

    const items = getInventoryItems();
    assert.equal(items.some((i) => i.id === "item-fail"), false, "Item must NOT be saved locally when MySQL fails");
  } finally {
    env.restore();
  }
});

// ---------------------------------------------------------
// 4. PARTIES WRITE RELIABILITY
// ---------------------------------------------------------

test("saveBusinessParty: persists to MySQL, updates local storage with remote confirmation", async () => {
  const env = setupEnvironment();

  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, "POST");
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        success: true,
        data: { id: "party-100", partyName: "Apex Builders", phone: "9876543210" },
      }),
    };
  };

  try {
    const saved = await saveBusinessParty({ id: "party-100", partyName: "Apex Builders", phone: "9876543210" });
    assert.equal(saved.id, "party-100");

    const parties = getParties();
    assert.equal(parties.length, 1);
    assert.equal(parties[0].partyName, "Apex Builders");
  } finally {
    env.restore();
  }
});

test("saveBusinessParty: MySQL failure halts save and does NOT insert party into local storage", async () => {
  const env = setupEnvironment();

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Invalid GSTIN format" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await saveBusinessParty({ id: "party-fail", partyName: "Bad Party" });
      },
      /Invalid GSTIN format|Request failed/
    );

    const parties = getParties();
    assert.equal(parties.some((p) => p.id === "party-fail"), false, "Party must NOT be saved locally when MySQL fails");
  } finally {
    env.restore();
  }
});

test("saveBusinessParty: MySQL failure on edit preserves existing party without deleting it", async () => {
  const env = setupEnvironment();
  const existingParty = { id: "party-edit-1", partyName: "Original Name", phone: "9000000000" };
  env.storage.setItem(partiesStorageKey, JSON.stringify([existingParty]));

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Database timeout" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await saveBusinessParty({ id: "party-edit-1", partyName: "Renamed Party", phone: "9999999999" });
      },
      /Database timeout|Request failed/
    );

    // Original party must still exist with original values
    const parties = getParties();
    assert.equal(parties.length, 1);
    assert.equal(parties[0].id, "party-edit-1");
    assert.equal(parties[0].partyName, "Original Name");
  } finally {
    env.restore();
  }
});

test("deleteBusinessParty: deletes from MySQL first, then removes party from local storage", async () => {
  const env = setupEnvironment();
  const party = { id: "party-del-1", partyName: "To Delete", phone: "9000000000" };
  env.storage.setItem(partiesStorageKey, JSON.stringify([party]));

  let deleteMethod = "";
  globalThis.fetch = async (url, options) => {
    deleteMethod = options.method;
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true }),
    };
  };

  try {
    await deleteBusinessParty("party-del-1");
    assert.equal(deleteMethod, "DELETE");

    const parties = getParties();
    assert.equal(parties.length, 0);
  } finally {
    env.restore();
  }
});

test("deleteBusinessParty: MySQL failure halts deletion and leaves party intact in local storage", async () => {
  const env = setupEnvironment();
  const party = { id: "party-del-2", partyName: "Cannot Delete", phone: "9000000000" };
  env.storage.setItem(partiesStorageKey, JSON.stringify([party]));

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 409,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Party has linked transactions" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await deleteBusinessParty("party-del-2");
      },
      /Party has linked transactions|Request failed/
    );

    const parties = getParties();
    assert.equal(parties.length, 1);
    assert.equal(parties[0].id, "party-del-2");
  } finally {
    env.restore();
  }
});
