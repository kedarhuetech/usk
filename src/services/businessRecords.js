import { apiRequest } from "./apiClient.js";
import { getInventoryItems, normalizeInventoryItem, saveInventoryItem } from "./itemsStorage.js";
import { getSaleInvoices, saveSaleInvoice } from "./salesStorage.js";
import { getParties, saveParty } from "./partiesStorage.js";
import { getPurchaseBills, savePurchaseBill } from "./purchaseBillsStorage.js";
import { getAppSettings } from "./appSettingsStorage.js";
import { loadLocalDashboardSummary } from "./dashboardSummary.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { itemsDb, partiesDb, transactionsDb } from "./databaseRepository.js";

// This helper handles id logic.
function withId(record = {}) {
  return { ...record, id: record.id || crypto.randomUUID() };
}

// Loads business items directly from MySQL database repository
export async function loadBusinessItems() {
  if (typeof window !== "undefined" && typeof window.document !== "undefined" && isDatabaseMode()) {
    try {
      const dbItems = await itemsDb.listAll();
      if (Array.isArray(dbItems) && dbItems.length > 0) return dbItems;
    } catch (e) {
      console.warn("[MySQL] Falling back to local items:", e.message);
    }
  }
  return getInventoryItems();
}

// Saves business item directly to MySQL database
export async function saveBusinessItem(value) {
  const normalized = normalizeInventoryItem(value);
  const saved = saveInventoryItem(normalized);
  if (typeof window !== "undefined" && typeof window.document !== "undefined" && isDatabaseMode()) {
    try {
      await itemsDb.save(saved);
    } catch (e) {
      console.warn("[MySQL] Item background save notice:", e.message);
    }
  }
  return saved;
}

// Loads business parties directly from MySQL database repository
export async function loadBusinessParties() {
  if (typeof window !== "undefined" && typeof window.document !== "undefined" && isDatabaseMode()) {
    try {
      const dbParties = await partiesDb.listAll();
      if (Array.isArray(dbParties) && dbParties.length > 0) return dbParties;
    } catch (e) {
      console.warn("[MySQL] Falling back to local parties:", e.message);
    }
  }
  return getParties();
}

// Loads business summary directly from MySQL backend /api/dashboard
export async function loadBusinessSummary() {
  if (isDatabaseMode()) {
    try {
      const res = await apiRequest("/dashboard");
      const data = res?.data ?? res;
      if (data && data.sales !== undefined) {
        return {
          sales: data.sales?.totalAmount || 0,
          received: data.sales?.receivedAmount || 0,
          receivable: data.balances?.toReceive || 0,
          payable: data.balances?.toPay || 0,
          stockValue: data.inventory?.stockValue || 0,
          totalBankBalance: data.bank?.totalBalance || 0,
          ...data,
        };
      }
    } catch (e) {
      console.warn("[MySQL] Falling back to local summary:", e.message);
    }
  }
  return loadLocalDashboardSummary();
}

// Saves business party directly to MySQL database
export async function saveBusinessParty(value) {
  const party = withId(value);
  const saved = saveParty(party);
  if (isDatabaseMode()) {
    try {
      await partiesDb.save(saved);
    } catch (e) {
      console.warn("[MySQL] Party background save notice:", e.message);
    }
  }
  return saved;
}

// Loads sales invoices directly from MySQL database transactions table
export async function loadSalesInvoices() {
  if (isDatabaseMode()) {
    try {
      const dbSales = await transactionsDb.listByType("sale");
      if (Array.isArray(dbSales) && dbSales.length > 0) {
        for (const invoice of dbSales) {
          try { saveSaleInvoice(invoice); } catch {}
        }
        return dbSales;
      }
    } catch (e) {
      console.warn("[MySQL] Falling back to local sales invoices:", e.message);
    }
  }
  return getSaleInvoices();
}

// This helper handles sales invoice number logic.
export async function nextSalesInvoiceNumber() {
  const invoices = await loadSalesInvoices();
  return String(invoices.length + 1);
}

// Saves business sale invoice directly to MySQL database
export async function saveBusinessSaleInvoice(value) {
  const localInvoice = saveSaleInvoice(value);
  if (!isDatabaseMode()) return localInvoice;

  let saved = localInvoice;
  try {
    saved = await transactionsDb.save(localInvoice);
  } catch (error) {
    console.warn("[MySQL] Saved sale invoice to local cache:", error.message);
  }

  const changedItems = getInventoryItems();
  const touchedIds = new Set((localInvoice.rows || []).map((row) => row.sourceItemId || row.itemId).filter(Boolean));
  for (const item of changedItems) {
    if (touchedIds.has(item.id)) await saveBusinessItem(item);
  }
  return saved;
}

// Loads purchase bills directly from MySQL database transactions table
export async function loadPurchaseBills() {
  if (isDatabaseMode()) {
    try {
      const dbPurchases = await transactionsDb.listByType("purchase");
      if (Array.isArray(dbPurchases) && dbPurchases.length > 0) {
        for (const bill of dbPurchases) {
          try { savePurchaseBill(bill); } catch {}
        }
        return dbPurchases;
      }
    } catch (e) {
      console.warn("[MySQL] Falling back to local purchase bills:", e.message);
    }
  }
  return getPurchaseBills();
}

// This helper handles purchase bill number logic.
export async function nextPurchaseBillNumber() {
  const bills = await loadPurchaseBills();
  return String(bills.length + 1);
}

// Saves business purchase bill directly to MySQL database
export async function saveBusinessPurchaseBill(value) {
  const bill = withId({ ...value, transactionType: "purchase" });
  const localSaved = savePurchaseBill(bill);

  if (!isDatabaseMode()) return localSaved;

  try {
    await transactionsDb.save(localSaved);
    const changedItems = getInventoryItems();
    const touchedItemIds = new Set((bill.rows || []).map((row) => row.sourceItemId || row.itemId).filter(Boolean));
    for (const item of changedItems) {
      if (touchedItemIds.has(item.id)) {
        try {
          await saveBusinessItem(item);
        } catch {}
      }
    }
  } catch (error) {
    console.warn("[MySQL] Saved purchase bill to local cache:", error.message);
  }

  return localSaved;
}
