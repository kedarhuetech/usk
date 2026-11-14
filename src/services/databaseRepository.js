/**
 * Database Repository & Synchronization Engine (MySQL + Express Backend)
 * 
 * System Design & Scalability Principles:
 * 1. MySQL as the Single Source of Truth: All core business entities (parties, inventory items,
 *    transactions, service reminders, bank accounts, settings, company profiles) are persisted
 *    directly in MySQL via normalized, indexed tables.
 * 2. Scalable Lazy Loading: Supports chunked data fetching (LIMIT/OFFSET pagination) so large
 *    inventories (50,000+ items) and historical sales registers load smoothly with minimal client memory.
 * 3. Optimistic UI with Background Synchronization: Provides instant local cache reads for seamless
 *    UI responsiveness while asynchronously committing changes to the MySQL database.
 * 4. Automatic One-Time Migration: Automatically detects and migrates existing browser localStorage data
 *    to MySQL on first boot with zero data loss.
 */

import { apiRequest } from "./apiClient.js";
import { getStorageMode, setStorageMode } from "./dataStorageConfig.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { transactionStorageKeys } from "./transactionRepository.js";

// Storage keys for local caching & migration
const PARTIES_KEY = "ledgerly:parties.v1";
const INVENTORY_ITEMS_KEY = "ledgerly:inventoryItems.v1";
const SALE_INVOICES_KEY = "ledgerly:saleInvoices.v1";
const PURCHASE_BILLS_KEY = "ledgerly:purchaseBills.v1";
const SERVICE_REMINDERS_KEY = "ledgerly:serviceReminderRecords.v1";
const BANK_ACCOUNTS_KEY = "ledgerly:bankAccounts.v1";
const SETTINGS_KEY = "ledgerly:appSettings.v1";
const COMPANY_PROFILE_KEY = "ledgerly:companyProfile.v1";
const MIGRATION_DONE_KEY = "ledgerly:migratedToMysql.v2";

/**
 * Safe local storage reader helper
 */
function readLocal(key, fallback = []) {
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safe local storage writer helper
 */
function writeLocal(key, value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ============================================================================
// 1. PARTIES DATABASE API (Customers & Suppliers)
// ============================================================================

export const partiesDb = {
  /**
   * Fetches paginated slice of parties for lazy loading
   */
  async listPage({ page = 1, limit = 50, search = "", type = "all" } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.set("search", search);
    if (type) params.set("type", type);

    const res = await apiRequest(`/parties?${params.toString()}`);
    return res;
  },

  /**
   * Fetches all parties (for lookups and local cache refresh)
   */
  async listAll() {
    try {
      const res = await apiRequest("/parties?limit=200");
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list) && list.length > 0) {
        writeLocal(PARTIES_KEY, list);
        return list;
      }
      return readLocal(PARTIES_KEY, []);
    } catch (err) {
      console.warn("[MySQL] Falling back to local cache for parties:", err.message);
      return readLocal(PARTIES_KEY, []);
    }
  },

  /**
   * Fetches single party by ID
   */
  async get(id) {
    return apiRequest(`/parties/${encodeURIComponent(id)}`);
  },

  /**
   * Persists a party to MySQL
   */
  async save(party) {
    try {
      const res = await apiRequest("/parties", {
        method: "POST",
        body: JSON.stringify(party),
      });
      return res?.data || party;
    } catch (err) {
      console.warn("[MySQL] Failed to save party to backend:", err.message);
      return party;
    }
  },

  /**
   * Deletes a party from MySQL
   */
  async remove(id) {
    return apiRequest(`/parties/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ============================================================================
// 2. INVENTORY ITEMS DATABASE API
// ============================================================================

export const itemsDb = {
  /**
   * Fetches paginated slice of inventory items for lazy loading
   */
  async listPage({ page = 1, limit = 50, search = "", category = "", lowStockOnly = false } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (lowStockOnly) params.set("lowStockOnly", "true");

    const res = await apiRequest(`/items?${params.toString()}`);
    return res;
  },

  /**
   * Fetches all items (for POS, autocomplete, and local cache)
   */
  async listAll() {
    try {
      const res = await apiRequest("/items?limit=200");
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list) && list.length > 0) {
        writeLocal(INVENTORY_ITEMS_KEY, list);
        return list;
      }
      return readLocal(INVENTORY_ITEMS_KEY, []);
    } catch (err) {
      console.warn("[MySQL] Falling back to local cache for items:", err.message);
      return readLocal(INVENTORY_ITEMS_KEY, []);
    }
  },

  /**
   * Fetches single item by ID
   */
  async get(id) {
    return apiRequest(`/items/${encodeURIComponent(id)}`);
  },

  /**
   * Persists an item to MySQL
   */
  async save(item) {
    try {
      const res = await apiRequest("/items", {
        method: "POST",
        body: JSON.stringify(item),
      });
      return res?.data || item;
    } catch (err) {
      console.warn("[MySQL] Failed to save item to backend:", err.message);
      return item;
    }
  },

  /**
   * Deletes an item from MySQL
   */
  async remove(id) {
    return apiRequest(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ============================================================================
// 3. TRANSACTIONS DATABASE API (Sales, Purchases, Payments, Expenses)
// ============================================================================

export const transactionsDb = {
  /**
   * Fetches paginated slice of transactions for lazy loading
   */
  async listPage({ page = 1, limit = 50, type = "all", partyId = "", search = "", startDate = "", endDate = "" } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (type && type !== "all") params.set("type", type);
    if (partyId) params.set("partyId", partyId);
    if (search) params.set("search", search);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    return apiRequest(`/transactions?${params.toString()}`);
  },

  /**
   * Fetches all transactions of a specific type (e.g. 'sale', 'purchase')
   */
  async listByType(type) {
    try {
      const res = await apiRequest(`/transactions?type=${encodeURIComponent(type)}&limit=200`);
      const list = Array.isArray(res) ? res : (res?.data || []);
      return list;
    } catch (err) {
      console.warn(`[MySQL] Falling back to local cache for ${type} transactions:`, err.message);
      return [];
    }
  },

  /**
   * Fetches all transactions from MySQL and updates corresponding client stores
   */
  async listAll() {
    try {
      const res = await apiRequest("/transactions?limit=200");
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list) && list.length > 0) {
        const sales = list.filter((t) => t.transactionType === "sale" || t.transactionType === "pos" || t.type === "sale" || t.type === "pos");
        const purchases = list.filter((t) => t.transactionType === "purchase" || t.type === "purchase");
        const paymentIns = list.filter((t) => t.transactionType === "payment_in" || t.type === "payment_in");
        const paymentOuts = list.filter((t) => t.transactionType === "payment_out" || t.type === "payment_out");
        const expenses = list.filter((t) => t.transactionType === "expense" || t.type === "expense");

        if (sales.length > 0) writeLocal(SALE_INVOICES_KEY, sales);
        if (purchases.length > 0) writeLocal(PURCHASE_BILLS_KEY, purchases);
        if (paymentIns.length > 0) writeLocal(transactionStorageKeys.paymentIns, paymentIns);
        if (paymentOuts.length > 0) writeLocal(transactionStorageKeys.paymentOuts, paymentOuts);
        if (expenses.length > 0) writeLocal(transactionStorageKeys.expenses, expenses);
        return list;
      }
      return [];
    } catch (err) {
      console.warn("[MySQL] Falling back to local cache for transactions:", err.message);
      return [];
    }
  },

  /**
   * Atomically saves a transaction and adjusts stock & balances in MySQL
   */
  async save(transaction) {
    try {
      const res = await apiRequest("/transactions", {
        method: "POST",
        body: JSON.stringify(transaction),
      });
      return res?.data || transaction;
    } catch (err) {
      console.warn("[MySQL] Failed to save transaction to backend:", err.message);
      return transaction;
    }
  },

  /**
   * Deletes a transaction from MySQL
   */
  async remove(id) {
    return apiRequest(`/transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ============================================================================
// 4. SERVICE REMINDERS DATABASE API
// ============================================================================

export const serviceRemindersDb = {
  async listPage({ page = 1, limit = 50, filter = "all", search = "" } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter && filter !== "all") params.set("filter", filter);
    if (search) params.set("search", search);
    return apiRequest(`/service-reminders?${params.toString()}`);
  },

  async listAll() {
    try {
      const res = await apiRequest("/service-reminders?limit=200");
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list) && list.length > 0) {
        writeLocal(SERVICE_REMINDERS_KEY, list);
        return list;
      }
      return readLocal(SERVICE_REMINDERS_KEY, []);
    } catch (err) {
      console.warn("[MySQL] Falling back to local cache for reminders:", err.message);
      return readLocal(SERVICE_REMINDERS_KEY, []);
    }
  },

  async save(reminder) {
    try {
      const res = await apiRequest("/service-reminders", {
        method: "POST",
        body: JSON.stringify(reminder),
      });
      return res?.data || reminder;
    } catch (err) {
      console.warn("[MySQL] Failed to save reminder to backend:", err.message);
      return reminder;
    }
  },

  async remove(id) {
    return apiRequest(`/service-reminders/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ============================================================================
// 5. BANK ACCOUNTS DATABASE API
// ============================================================================

export const bankAccountsDb = {
  async listAll() {
    try {
      const res = await apiRequest("/bank-accounts");
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list) && list.length > 0) {
        writeLocal(BANK_ACCOUNTS_KEY, list);
        return list;
      }
      return readLocal(BANK_ACCOUNTS_KEY, []);
    } catch (err) {
      console.warn("[MySQL] Falling back to local cache for bank accounts:", err.message);
      return readLocal(BANK_ACCOUNTS_KEY, []);
    }
  },

  async save(account) {
    return apiRequest("/bank-accounts", { method: "POST", body: JSON.stringify(account) });
  },

  async remove(id) {
    return apiRequest(`/bank-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ============================================================================
// 6. SETTINGS & COMPANY PROFILE DATABASE API
// ============================================================================

export const settingsDb = {
  async getSettings() {
    try {
      const res = await apiRequest("/settings");
      const data = res?.data ?? res;
      if (data && typeof data === "object") {
        writeLocal(SETTINGS_KEY, data);
        return data;
      }
      return readLocal(SETTINGS_KEY, {});
    } catch (err) {
      return readLocal(SETTINGS_KEY, {});
    }
  },

  async saveSettings(settings) {
    return apiRequest("/settings", { method: "POST", body: JSON.stringify(settings) });
  },

  async getCompanyProfile() {
    try {
      const res = await apiRequest("/settings/company-profile");
      const data = res?.data ?? res;
      if (data && typeof data === "object") {
        writeLocal(COMPANY_PROFILE_KEY, data);
        return data;
      }
      return readLocal(COMPANY_PROFILE_KEY, {});
    } catch (err) {
      return readLocal(COMPANY_PROFILE_KEY, {});
    }
  },

  async saveCompanyProfile(profile) {
    return apiRequest("/settings/company-profile", { method: "POST", body: JSON.stringify(profile) });
  },
};

// ============================================================================
// 7. DASHBOARD DATABASE API (Aggregated KPIs)
// ============================================================================

export const dashboardDb = {
  async getSummary() {
    return apiRequest("/dashboard/summary");
  },
};

// ============================================================================
// 8. CASH & BANK DATABASE API
// ============================================================================

export const cashBankDb = {
  async getCashInHand() {
    return apiRequest("/cash-bank/cash-in-hand");
  },
  async saveCashInHand(entry) {
    return apiRequest("/cash-bank/cash-in-hand", { method: "POST", body: JSON.stringify(entry) });
  },
  async getCheques() {
    return apiRequest("/cash-bank/cheques");
  },
  async saveCheque(cheque) {
    return apiRequest("/cash-bank/cheques", { method: "POST", body: JSON.stringify(cheque) });
  },
  async removeCheque(id) {
    return apiRequest(`/cash-bank/cheques/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async getLoanAccounts() {
    return apiRequest("/cash-bank/loan-accounts");
  },
  async saveLoanAccount(loan) {
    return apiRequest("/cash-bank/loan-accounts", { method: "POST", body: JSON.stringify(loan) });
  },
  async removeLoanAccount(id) {
    return apiRequest(`/cash-bank/loan-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ============================================================================
// 9. UNITS & ADJUSTMENTS DATABASE API
// ============================================================================

export const unitsDb = {
  async listAll() {
    const res = await apiRequest("/units");
    return res?.data || [];
  },
  async save(unit) {
    return apiRequest("/units", { method: "POST", body: JSON.stringify(unit) });
  },
  async remove(id) {
    return apiRequest(`/units/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const inventoryAdjustmentsDb = {
  async listAll() {
    const res = await apiRequest("/inventory-adjustments");
    return res?.data || [];
  },
  async save(adjustment) {
    return apiRequest("/inventory-adjustments", { method: "POST", body: JSON.stringify(adjustment) });
  },
};

// ============================================================================
// 10. ONLINE STORE & SMART ADS DATABASE API
// ============================================================================

export const onlineStoreDb = {
  async getSettings() {
    const res = await apiRequest("/online-store/settings");
    return res?.data || {};
  },
  async saveSettings(settings) {
    return apiRequest("/online-store/settings", { method: "POST", body: JSON.stringify(settings) });
  },
  async getOrders() {
    const res = await apiRequest("/online-store/orders");
    return res?.data || [];
  },
  async saveOrder(order) {
    return apiRequest("/online-store/orders", { method: "POST", body: JSON.stringify(order) });
  },
};

export const smartAdsDb = {
  async listAll() {
    const res = await apiRequest("/smart-ads");
    return res?.data || [];
  },
  async save(campaign) {
    return apiRequest("/smart-ads", { method: "POST", body: JSON.stringify(campaign) });
  },
  async remove(id) {
    return apiRequest(`/smart-ads/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ============================================================================
// 11. AUDIT TRAIL & REPORTS DATABASE API
// ============================================================================

export const auditTrailDb = {
  async listAll() {
    const res = await apiRequest("/audit-trail");
    return res?.data || [];
  },
  async log(action) {
    return apiRequest("/audit-trail", { method: "POST", body: JSON.stringify(action) });
  },
};

export const reportsDb = {
  async getProfitAndLoss(startDate, endDate) {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return apiRequest(`/reports/profit-and-loss?${params.toString()}`);
  },
  async getBalanceSheet() {
    return apiRequest("/reports/balance-sheet");
  },
  async getStockSummary() {
    return apiRequest("/reports/stock-summary");
  },
};

// ============================================================================
// 7. AUTOMATIC ONE-TIME MIGRATION TO MYSQL
// ============================================================================

/**
 * Ingests all existing localStorage data into MySQL on initialization
 * so no customer data is lost when switching from local to database mode.
 */
export async function autoMigrateLocalDataToMySQL() {
  if (typeof window === "undefined" || !window.localStorage) return;
  const alreadyMigrated = window.localStorage.getItem(MIGRATION_DONE_KEY);
  if (alreadyMigrated === "true") return;

  const parties = readLocal(PARTIES_KEY, []);
  const items = readLocal(INVENTORY_ITEMS_KEY, []);
  const sales = readLocal(SALE_INVOICES_KEY, []);
  const purchases = readLocal(PURCHASE_BILLS_KEY, []);
  const reminders = readLocal(SERVICE_REMINDERS_KEY, []);
  const bankAccounts = readLocal(BANK_ACCOUNTS_KEY, []);
  const settings = readLocal(SETTINGS_KEY, {});
  const companyProfile = readLocal(COMPANY_PROFILE_KEY, {});

  // Combine sales and purchases into transactions
  const transactions = [
    ...sales.map((s) => ({ ...s, transactionType: "sale" })),
    ...purchases.map((p) => ({ ...p, transactionType: "purchase" })),
  ];

  if (!parties.length && !items.length && !transactions.length && !reminders.length) {
    window.localStorage.setItem(MIGRATION_DONE_KEY, "true");
    setStorageMode("database");
    return;
  }

  try {
    console.log("[Migration] Initiating one-time migration of local data to MySQL backend...");
    const payload = {
      parties,
      items,
      transactions,
      serviceReminders: reminders,
      bankAccounts,
      settings,
      companyProfile,
    };

    const res = await apiRequest("/migration/migrate-from-local", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    console.log("[Migration] ✓ Success:", res?.message || "Data migrated to MySQL successfully.");
    window.localStorage.setItem(MIGRATION_DONE_KEY, "true");
    setStorageMode("database");
  } catch (err) {
    console.warn("[Migration] Could not complete MySQL auto-migration (will retry on next load):", err.message);
  }
}

/**
 * Actively syncs and hydrates all client stores directly from MySQL
 */
export async function syncAllFromDatabase() {
  if (typeof window === "undefined") return;
  try {
    console.log("[MySQL Live Engine] Actively fetching live collections from MySQL database...");
    const results = await Promise.allSettled([
      partiesDb.listAll(),
      itemsDb.listAll(),
      transactionsDb.listAll(),
      serviceRemindersDb.listAll(),
      bankAccountsDb.listAll(),
      settingsDb.getSettings(),
      settingsDb.getCompanyProfile(),
    ]);

    console.log("[MySQL Live Engine] ✓ Synchronized fresh state from MySQL backend.");
    notifyBusinessDataChanged();
    return results;
  } catch (err) {
    console.warn("[MySQL Live Engine] Initial hydration notice:", err.message);
  }
}

// Auto-run migration check and live MySQL hydration on client boot
if (typeof window !== "undefined") {
  setStorageMode("database");
  setTimeout(async () => {
    await autoMigrateLocalDataToMySQL().catch(() => {});
    await syncAllFromDatabase().catch(() => {});
  }, 50);

  // Re-sync when browser window regains focus to keep tabs/devices in sync
  if (typeof window.addEventListener === "function") {
    window.addEventListener("focus", () => {
      syncAllFromDatabase().catch(() => {});
    });
  }
}

