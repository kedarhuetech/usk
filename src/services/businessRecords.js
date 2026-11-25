import { apiRequest } from "./apiClient.js";
import { getInventoryItems, normalizeInventoryItem, saveInventoryItem, deleteInventoryItem, writeItems, inventoryItemsStorageKey } from "./itemsStorage.js";
import { getSaleInvoices, saveSaleInvoice, deleteSaleInvoice, normalizeInvoice, saleInvoicesStorageKey } from "./salesStorage.js";
import { batchMovementStorageKey } from "./batchInventoryService.js";
import { getParties, saveParty, deleteParty, partiesStorageKey, deduplicatePartyList } from "./partiesStorage.js";
import { getPurchaseBills, savePurchaseBill, deletePurchaseBill, purchaseBillsStorageKey } from "./purchaseBillsStorage.js";
import { getAppSettings } from "./appSettingsStorage.js";
import { loadLocalDashboardSummary } from "./dashboardSummary.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { itemsDb, partiesDb, transactionsDb } from "./databaseRepository.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { writeTransactionCollection, setMemoryCollection, transactionStorageKeys } from "./transactionRepository.js";

// This helper handles id logic.
function withId(record = {}) {
  return { ...record, id: record.id || crypto.randomUUID() };
}

// Loads business items directly from MySQL database repository
export async function loadBusinessItems() {
  if (typeof window !== "undefined" && typeof window.document !== "undefined" && isDatabaseMode()) {
    try {
      const dbItems = await itemsDb.listAll();
      if (Array.isArray(dbItems)) {
        const normalized = dbItems.map((item) => normalizeInventoryItem(item));
        writeItems(normalized, { skipEvent: true });
        return normalized;
      }
    } catch (e) {
      console.warn("[MySQL] Failed to load items:", e.message);
      throw e;
    }
  }
  return getInventoryItems();
}

// Saves business item directly to MySQL database with awaited persistence
export async function saveBusinessItem(value) {
  const normalized = normalizeInventoryItem(value);
  if (typeof window !== "undefined" && typeof window.document !== "undefined" && isDatabaseMode()) {
    try {
      const remote = await itemsDb.save(normalized);
      const saved = { ...normalized, ...(remote || {}) };
      saveInventoryItem(saved, { skipRemoteSync: true });
      notifyBusinessDataChanged();
      return saved;
    } catch (e) {
      console.warn("[MySQL] Item save failure:", e.message);
      throw e;
    }
  }
  return saveInventoryItem(normalized);
}

// Deletes business item directly from MySQL database with awaited persistence
export async function deleteBusinessItem(itemOrId, options = {}) {
  const target = typeof itemOrId === "object" ? itemOrId : null;
  const itemId = target?.id || itemOrId;
  if (!itemId) throw new Error("Item ID is required for deletion.");

  let result = null;
  if (typeof window !== "undefined" && typeof window.document !== "undefined" && isDatabaseMode()) {
    // 1. MySQL is the primary source of truth: Await remote deletion first.
    // If referenced in transactions, backend throws 409 Conflict.
    result = await itemsDb.remove(itemId, options);
  } else if (!options.deactivate) {
    // In local storage mode: check if item is in transactions before permanent deletion
    const itemObj = target || getInventoryItems().find((i) => i.id === itemId);
    const itemName = itemObj?.itemName;
    const matches = (r) =>
      r.sourceItemId === itemId ||
      r.itemId === itemId ||
      r.productId === itemId ||
      (itemName && String(r.item || "").trim().toLowerCase() === String(itemName).trim().toLowerCase()) ||
      (itemName && String(r.itemName || "").trim().toLowerCase() === String(itemName).trim().toLowerCase());

    const hasSales = (getSaleInvoices() || []).some((inv) => (inv.rows || []).some(matches));
    const hasPurchases = (getPurchaseBills() || []).some((bill) => (bill.rows || []).some(matches));
    if (hasSales || hasPurchases) {
      const err = new Error(`Cannot delete "${itemName || itemId}" because it is included in transactions. You can mark it inactive instead.`);
      err.status = 409;
      err.code = "ITEM_REFERENCED";
      throw err;
    }
  }

  // 2. Synchronize local cache after backend confirms success
  if (result?.action === "deactivated" || options?.deactivate) {
    saveInventoryItem({ ...(target || { id: itemId }), isActive: false }, { skipRemoteSync: true });
  } else {
    deleteInventoryItem(itemOrId, { skipRemoteSync: true });
  }

  notifyBusinessDataChanged();
  return result || { success: true };
}

// Loads business parties directly from MySQL database repository
export async function loadBusinessParties() {
  if (typeof window !== "undefined" && typeof window.document !== "undefined" && isDatabaseMode()) {
    try {
      const dbParties = await partiesDb.listAll();
      if (Array.isArray(dbParties)) {
        const normalized = dbParties.map((party) => {
          const isInactive = party?.status === "inactive" || party?.isActive === false;
          return {
            ...party,
            status: isInactive ? "inactive" : "active",
            isActive: !isInactive,
          };
        });
        const deduplicated = deduplicatePartyList(normalized);
        return deduplicated;
      }
    } catch (e) {
      console.warn("[MySQL] Failed to load parties:", e.message);
      throw e;
    }
  }
  return deduplicatePartyList(getParties());
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
          totalSales: data.sales?.totalAmount || 0,
          activeSales: Array.isArray(data.activeSales) ? data.activeSales : [],
          salesCount: data.sales?.count || 0,
          received: data.sales?.receivedAmount || 0,
          receivable: data.balances?.toReceive || 0,
          payable: data.balances?.toPay || 0,
          stockValue: data.inventory?.stockValue || 0,
          totalBankBalance: data.bank?.totalBalance || 0,
          ...data,
        };
      }
    } catch (e) {
      console.warn("[MySQL] Failed to load dashboard summary:", e.message);
      throw e;
    }
  }
  return loadLocalDashboardSummary();
}

// Saves business party directly to MySQL database with awaited persistence
export async function saveBusinessParty(value) {
  let party = value;
  const rawName = String(party?.partyName || party?.name || party?.party_name || "").trim();
  const normName = rawName.toLowerCase().replace(/\s+/g, " ");
  if (!party.id && normName) {
    const existing = getParties().find(
      (p) => String(p.partyName || p.name || p.party_name || "").trim().toLowerCase().replace(/\s+/g, " ") === normName
    );
    if (existing?.id) {
      party = { ...party, id: existing.id };
    }
  }
  party = withId(party);
  if (isDatabaseMode()) {
    try {
      const remote = await partiesDb.save(party);
      const saved = { ...party, ...(remote || {}) };
      saveParty(saved, { skipRemoteSync: true });
      notifyBusinessDataChanged();
      return saved;
    } catch (e) {
      console.warn("[MySQL] Party save failure:", e.message);
      throw e;
    }
  }
  return saveParty(party);
}

// Deletes or deactivates business party with backend confirmation
export async function deleteBusinessParty(partyId) {
  let result = { success: true, action: "deleted" };
  if (isDatabaseMode()) {
    try {
      result = await partiesDb.remove(partyId);
    } catch (e) {
      console.warn("[MySQL] Party delete failure:", e.message);
      throw e;
    }
  }
  if (result?.action === "deactivated") {
    const existing = getParties().find((p) => String(p.id) === String(partyId)) || { id: partyId };
    saveParty({ ...existing, isActive: false, status: "inactive" }, { skipRemoteSync: true });
  } else {
    deleteParty(partyId, { skipRemoteSync: true });
  }
  notifyBusinessDataChanged();
  return result;
}

// Loads sales invoices directly from MySQL database transactions table
export async function loadSalesInvoices() {
  if (isDatabaseMode()) {
    try {
      const dbSales = await transactionsDb.listByType("sale");
      if (Array.isArray(dbSales)) {
        const normalized = dbSales.map(normalizeInvoice);
        try {
          writeTransactionCollection(transactionStorageKeys.sales, normalized);
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(saleInvoicesStorageKey, JSON.stringify(normalized));
          }
        } catch {}
        return normalized;
      }
    } catch (e) {
      console.warn("[MySQL] Failed to load sales invoices:", e.message);
      throw e;
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
  const canUseStorage = typeof window !== "undefined" && Boolean(window.localStorage);
  const before = canUseStorage
    ? [saleInvoicesStorageKey, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)])
    : [];

  const localInvoice = saveSaleInvoice(value, { skipRemoteSync: true });
  if (!isDatabaseMode()) return localInvoice;

  let saved;
  try {
    const remote = await transactionsDb.save(localInvoice);
    saved = { ...localInvoice, ...(remote || {}) };

    const changedItems = getInventoryItems();
    const touchedIds = new Set((localInvoice.rows || []).map((row) => row.sourceItemId || row.itemId).filter(Boolean));
    for (const item of changedItems) {
      if (touchedIds.has(item.id)) {
        try {
          await saveBusinessItem(item);
        } catch (itemErr) {
          console.warn("[MySQL] Item stock sync notice after sale:", itemErr.message);
        }
      }
    }
  } catch (error) {
    if (canUseStorage) {
      for (const [key, stored] of before) {
        if (stored === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, stored);
      }
      try {
        const storedInvoices = before.find(([k]) => k === saleInvoicesStorageKey)?.[1];
        setMemoryCollection(saleInvoicesStorageKey, storedInvoices ? JSON.parse(storedInvoices) : null);
      } catch {}
      try {
        const storedItems = before.find(([k]) => k === inventoryItemsStorageKey)?.[1];
        if (storedItems) writeItems(JSON.parse(storedItems));
      } catch {}
    }
    console.warn("[MySQL] Sale invoice save failure:", error.message);
    throw error;
  }

  notifyBusinessDataChanged();
  return saved;
}

// Deletes sales invoice directly from MySQL database transactions table
export async function deleteBusinessSaleInvoice(invoiceId) {
  if (isDatabaseMode()) {
    try {
      await transactionsDb.remove(invoiceId);
    } catch (e) {
      console.warn("[MySQL] Sale invoice delete failure:", e.message);
      throw e;
    }
  }
  deleteSaleInvoice(invoiceId, { skipRemoteSync: true });
  notifyBusinessDataChanged();
}

// Loads purchase bills directly from MySQL database transactions table
export async function loadPurchaseBills() {
  if (isDatabaseMode()) {
    try {
      const dbPurchases = await transactionsDb.listByType("purchase");
      if (Array.isArray(dbPurchases)) {
        try {
          writeTransactionCollection(transactionStorageKeys.purchases, dbPurchases);
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(purchaseBillsStorageKey, JSON.stringify(dbPurchases));
          }
        } catch {}
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
  const canUseStorage = typeof window !== "undefined" && Boolean(window.localStorage);
  const before = canUseStorage
    ? [purchaseBillsStorageKey, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)])
    : [];

  const bill = withId({ ...value, transactionType: "purchase" });
  const localSaved = savePurchaseBill(bill, { skipRemoteSync: true });

  if (!isDatabaseMode()) return localSaved;

  let saved;
  try {
    const remote = await transactionsDb.save(localSaved);
    saved = { ...localSaved, ...(remote || {}) };

    const changedItems = getInventoryItems();
    const touchedItemIds = new Set((bill.rows || []).map((row) => row.sourceItemId || row.itemId).filter(Boolean));
    for (const item of changedItems) {
      if (touchedItemIds.has(item.id)) {
        try {
          await saveBusinessItem(item);
        } catch (itemErr) {
          console.warn("[MySQL] Item stock sync notice after purchase:", itemErr.message);
        }
      }
    }
  } catch (error) {
    if (canUseStorage) {
      for (const [key, stored] of before) {
        if (stored === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, stored);
      }
      try {
        const storedBills = before.find(([k]) => k === purchaseBillsStorageKey)?.[1];
        setMemoryCollection(purchaseBillsStorageKey, storedBills ? JSON.parse(storedBills) : null);
      } catch {}
      try {
        const storedItems = before.find(([k]) => k === inventoryItemsStorageKey)?.[1];
        if (storedItems) writeItems(JSON.parse(storedItems));
      } catch {}
    }
    console.warn("[MySQL] Purchase bill save failure:", error.message);
    throw error;
  }

  notifyBusinessDataChanged();
  return saved;
}

// Deletes purchase bill directly from MySQL database transactions table
export async function deleteBusinessPurchaseBill(billId) {
  if (isDatabaseMode()) {
    try {
      await transactionsDb.remove(billId);
    } catch (e) {
      console.warn("[MySQL] Purchase bill delete failure:", e.message);
      throw e;
    }
  }
  deletePurchaseBill(billId, { skipRemoteSync: true });
  notifyBusinessDataChanged();
}
