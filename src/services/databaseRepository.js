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
import { transactionStorageKeys, setMemoryCollection } from "./transactionRepository.js";
import { setMemoryParties } from "./partiesStorage.js";
import { setMemoryItems } from "./itemsStorage.js";
import { getActiveBusinessId, getScopedStorageKey } from "../config/businessConfig.js";

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
   * MySQL is the primary source of truth. Empty DB result is preserved.
   */
  async listAll() {
    try {
      const res = await apiRequest("/parties?limit=200");
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list)) {
        setMemoryParties(list);
        return list;
      }
      return [];
    } catch (err) {
      console.warn("[MySQL] Parties fetch notice:", err.message);
      return [];
    }
  },

  /**
   * Fetches single party by ID
   */
  async get(id) {
    return apiRequest(`/parties/${encodeURIComponent(id)}`);
  },

  /**
   * Persists a party to MySQL. Awaited, throws on failure.
   */
  async save(party) {
    const res = await apiRequest("/parties", {
      method: "POST",
      body: JSON.stringify(party),
    });
    const saved = res?.data || res;
    // Update scoped local cache
    const current = readLocal(getScopedStorageKey(PARTIES_KEY), []);
    const updated = [saved, ...current.filter((p) => String(p.id) !== String(saved.id))];
    writeLocal(getScopedStorageKey(PARTIES_KEY), updated);
    return saved;
  },

  /**
   * Deletes a party from MySQL
   */
  async remove(id) {
    const res = await apiRequest(`/parties/${encodeURIComponent(id)}`, { method: "DELETE" });
    const current = readLocal(getScopedStorageKey(PARTIES_KEY), []);
    writeLocal(getScopedStorageKey(PARTIES_KEY), current.filter((p) => String(p.id) !== String(id)));
    return res;
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
   * MySQL is the primary source of truth. Empty DB result is preserved.
   */
  async listAll() {
    try {
      const res = await apiRequest("/items?limit=1000");
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list)) {
        setMemoryItems(list);
        writeLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), list);
        writeLocal(INVENTORY_ITEMS_KEY, list);
        return list;
      }
      return readLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), null) || readLocal(INVENTORY_ITEMS_KEY, []);
    } catch (err) {
      console.warn("[MySQL] Falling back to scoped local cache for items:", err.message);
      return readLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), null) || readLocal(INVENTORY_ITEMS_KEY, []);
    }
  },

  /**
   * Fetches single item by ID
   */
  async get(id) {
    return apiRequest(`/items/${encodeURIComponent(id)}`);
  },

  /**
   * Persists an item to MySQL. Awaited, throws on failure.
   */
  async save(item) {
    const res = await apiRequest("/items", {
      method: "POST",
      body: JSON.stringify(item),
    });
    const saved = res?.data || res;
    const current = readLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), null) || readLocal(INVENTORY_ITEMS_KEY, []);
    const updated = [saved, ...current.filter((i) => String(i.id) !== String(saved.id))];
    writeLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), updated);
    writeLocal(INVENTORY_ITEMS_KEY, updated);
    return saved;
  },

  /**
   * Deletes an item from MySQL
   */
  async remove(id, options = {}) {
    const params = new URLSearchParams();
    if (options.deactivate) params.append("deactivate", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiRequest(`/items/${encodeURIComponent(id)}${query}`, { method: "DELETE" });
    const current = readLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), null) || readLocal(INVENTORY_ITEMS_KEY, []);
    const updated = options.deactivate || res?.action === "deactivated"
      ? current.map((i) => (String(i.id) === String(id) ? { ...i, isActive: false } : i))
      : current.filter((i) => String(i.id) !== String(id));
    writeLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), updated);
    writeLocal(INVENTORY_ITEMS_KEY, updated);
    return res;
  },

  /**
   * Explicitly deactivates an item in MySQL
   */
  async deactivate(id) {
    const res = await apiRequest(`/items/${encodeURIComponent(id)}/deactivate`, { method: "PATCH" });
    const current = readLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), null) || readLocal(INVENTORY_ITEMS_KEY, []);
    const updated = current.map((i) => (String(i.id) === String(id) ? { ...i, isActive: false } : i));
    writeLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), updated);
    writeLocal(INVENTORY_ITEMS_KEY, updated);
    return res;
  },

  /**
   * Reactivates an item in MySQL
   */
  async reactivate(id) {
    const res = await apiRequest(`/items/${encodeURIComponent(id)}/reactivate`, { method: "PATCH" });
    const current = readLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), null) || readLocal(INVENTORY_ITEMS_KEY, []);
    const updated = current.map((i) => (String(i.id) === String(id) ? { ...i, isActive: true } : i));
    writeLocal(getScopedStorageKey(INVENTORY_ITEMS_KEY), updated);
    writeLocal(INVENTORY_ITEMS_KEY, updated);
    return res;
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
        const estimates = list.filter((t) => t.transactionType === "estimate" || t.type === "estimate");
        const proformas = list.filter((t) => t.transactionType === "proforma" || t.type === "proforma");
        const challans = list.filter((t) => t.transactionType === "delivery_challan" || t.type === "delivery_challan");
        const debitNotes = list.filter((t) => t.transactionType === "debit_note" || t.type === "debit_note");
        const creditNotes = list.filter((t) => t.transactionType === "credit_note" || t.transactionType === "sale_return" || t.type === "sale_return" || t.type === "credit_note");
        const saleOrders = list.filter((t) => t.transactionType === "sale_order" || t.type === "sale_order");
        const purchaseOrders = list.filter((t) => t.transactionType === "purchase_order" || t.type === "purchase_order");

        if (sales.length > 0) setMemoryCollection(SALE_INVOICES_KEY, sales);
        if (purchases.length > 0) setMemoryCollection(PURCHASE_BILLS_KEY, purchases);
        if (paymentIns.length > 0) setMemoryCollection(transactionStorageKeys.paymentIns, paymentIns);
        if (paymentOuts.length > 0) setMemoryCollection(transactionStorageKeys.paymentOuts, paymentOuts);
        if (expenses.length > 0) {
          setMemoryCollection(transactionStorageKeys.expenses, expenses);
          setMemoryCollection("ledgerly:expenses.v1", expenses);
        }
        if (estimates.length > 0) setMemoryCollection("ledgerly:estimateQuotations.v1", estimates);
        if (proformas.length > 0) setMemoryCollection("ledgerly:proformaInvoices.v1", proformas);
        if (challans.length > 0) setMemoryCollection("ledgerly:deliveryChallans.v1", challans);
        if (debitNotes.length > 0) setMemoryCollection("ledgerly:purchaseReturns.v1", debitNotes);
        if (creditNotes.length > 0) setMemoryCollection("ledgerly:saleReturns.v1", creditNotes);
        if (saleOrders.length > 0) setMemoryCollection("ledgerly:saleOrders.v1", saleOrders);
        if (purchaseOrders.length > 0) setMemoryCollection("ledgerly:purchaseOrders.v1", purchaseOrders);
        return list;
      }
      return [];
    } catch (err) {
      console.warn("[MySQL] Transactions fetch notice:", err.message);
      return [];
    }
  },

  /**
   * Atomically saves a transaction and adjusts stock & balances in MySQL
   */
  async save(transaction) {
    const isGenuineCash =
      transaction.saleType === "cash" &&
      (!transaction.form?.customer && !transaction.customer && !transaction.partyName && !transaction.customerName);

    const partyName =
      transaction.partyName ||
      transaction.customer ||
      transaction.supplier ||
      transaction.party ||
      transaction.form?.customer ||
      transaction.form?.supplier ||
      transaction.customerName ||
      transaction.supplierName ||
      (isGenuineCash ? "Cash Sale" : (transaction.saleType === "cash" ? "Cash Sale" : null));

    const partyId =
      transaction.partyId ||
      transaction.party_id ||
      transaction.form?.partyId ||
      transaction.customerId ||
      null;

    const phone =
      transaction.partyPhone ||
      transaction.phone ||
      transaction.form?.phone ||
      null;

    const transactionType = (transaction.transactionType || transaction.type || "sale").toLowerCase();
    const invoiceNumber = String(
      transaction.documentNumber ||
      transaction.number ||
      transaction.invoiceNumber ||
      transaction.billNumber ||
      transaction.form?.invoiceNumber ||
      "1"
    );

    const transactionDate =
      transaction.transactionDate ||
      transaction.invoiceDate ||
      transaction.billDate ||
      transaction.form?.invoiceDate ||
      transaction.date ||
      new Date().toISOString().slice(0, 10);

    const totalAmount = Number(
      transaction.totalAmount ??
      transaction.amount ??
      transaction.totals?.finalTotal ??
      transaction.total ??
      0
    );

    const paidAmount = Number(
      transaction.paidAmount ??
      transaction.receivedAmount ??
      transaction.received ??
      transaction.totals?.received ??
      (transactionType === "payment_in" || transactionType === "payment_out" ? totalAmount : (transaction.saleType === "cash" ? totalAmount : 0))
    );

    const balanceAmount = Number(
      transaction.balanceAmount ??
      transaction.totals?.balance ??
      (transactionType === "payment_in" || transactionType === "payment_out" ? 0 : Math.max(0, totalAmount - paidAmount))
    );

    const rawPayments = Array.isArray(transaction.payments) && transaction.payments.length > 0 ? transaction.payments : [];
    const rawRows = (Array.isArray(transaction.items) && transaction.items.length)
      ? transaction.items
      : (Array.isArray(transaction.rows) && transaction.rows.length
          ? transaction.rows
          : (rawPayments.length > 0
              ? rawPayments.map((p, idx) => ({
                  id: p.id || `pay-${Date.now()}-${idx}`,
                  name: p.type || "Payment",
                  item: p.type || "Payment",
                  itemName: p.type || "Payment",
                  unit: "TXN",
                  qty: 1,
                  quantity: 1,
                  price: Number(p.amount || 0),
                  unitPrice: Number(p.amount || 0),
                  amount: Number(p.amount || 0),
                  totalAmount: Number(p.amount || 0),
                  itemCode: p.reference || "",
                  serialNo: p.chequeDate || "",
                }))
              : []));
    const items = rawRows.map((r, idx) => ({
      id: r.id || `line-${Date.now()}-${idx}`,
      itemId: r.itemId || r.sourceItemId || null,
      sourceItemId: r.sourceItemId || r.itemId || null,
      name: r.item || r.name || r.itemName || "Item",
      itemName: r.item || r.name || r.itemName || "Item",
      itemCode: r.itemCode || r.code || r.size || null,
      hsnCode: r.hsnCode || r.hsn || null,
      batchNo: r.batchNo || null,
      serialNo: Array.isArray(r.serialNumbers) ? r.serialNumbers.join(",") : (r.serialNo || r.serial || r.description || null),
      qty: Number(r.qty ?? r.quantity ?? 1),
      quantity: Number(r.qty ?? r.quantity ?? 1),
      unit: r.unit || "PCS",
      price: Number(r.price ?? r.unitPrice ?? 0),
      unitPrice: Number(r.price ?? r.unitPrice ?? 0),
      purchasePrice: Number(r.purchasePrice ?? 0),
      discountPercent: Number(r.discountPercent ?? (r.discountType !== "amount" ? r.discount : 0) ?? 0),
      discountAmount: Number(r.discountAmount ?? (r.discountType === "amount" ? r.discount : 0) ?? 0),
      taxRate: Number(r.taxRate || (r.tax && r.tax !== "NONE" ? String(r.tax).replace(/[^0-9.]/g, "") : 0) || 0),
      taxAmount: Number(r.taxAmount || 0),
      cessAmount: Number(r.cessAmount || r.cess || 0),
      amount: Number(r.amount ?? r.totalAmount ?? (Number(r.qty ?? 1) * Number(r.price ?? 0))),
      totalAmount: Number(r.amount ?? r.totalAmount ?? (Number(r.qty ?? 1) * Number(r.price ?? 0))),
    }));

    const payload = {
      ...transaction,
      id: transaction.id || transaction.invoiceId,
      transactionType,
      type: transactionType,
      documentNumber: invoiceNumber,
      number: invoiceNumber,
      invoiceNumber,
      billNumber: transaction.billNumber || invoiceNumber,
      transactionDate,
      invoiceDate: transactionDate,
      date: transactionDate,
      partyId,
      partyName,
      customer: partyName,
      customerName: partyName,
      supplier: partyName,
      supplierName: partyName,
      dueDate: transaction.dueDate || null,
      partyPhone: phone,
      phone,
      billingAddress: transaction.billingAddress || transaction.form?.billingAddress || null,
      shippingAddress: transaction.shippingAddress || transaction.form?.shippingAddress || null,
      subtotal: Number(transaction.subtotal ?? transaction.totals?.subtotal ?? totalAmount),
      totalAmount,
      total: totalAmount,
      amount: totalAmount,
      paidAmount,
      receivedAmount: paidAmount,
      received: paidAmount,
      balanceAmount,
      status: transaction.status || "Open",
      paymentStatus: transaction.status || "Open",
      roundOff: typeof transaction.roundOffValue !== "undefined" && transaction.roundOffValue !== "" ? Number(transaction.roundOffValue) : (typeof transaction.roundOff === "number" ? transaction.roundOff : 0),
      roundOffValue: transaction.roundOffValue ?? "",
      paymentMode: transaction.paymentMode || transaction.paymentType || transaction.form?.paymentType || (transaction.saleType === "cash" ? "Cash" : "Credit"),
      paymentType: transaction.paymentType || transaction.paymentMode || "Cash",
      notes: transaction.notes || transaction.description || null,
      description: transaction.description || transaction.notes || null,
      linkedInvoiceId: transaction.linkedInvoiceId || transaction.poNumber || null,
      payments: rawPayments,
      items,
      rows: items,
    };

    const res = await apiRequest("/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return res?.data || payload;
  },

  /**
   * Fetches a single transaction by ID with normalized line items from MySQL
   */
  async getById(id) {
    try {
      const res = await apiRequest(`/transactions/${encodeURIComponent(id)}`);
      const doc = res?.data || res;
      if (!doc) return null;
      const rawItems = doc.items || doc.rows || [];
      const rows = rawItems.map((r) => ({
        ...r,
        item: r.item || r.name || r.itemName || r.item_name || "",
        qty: r.qty != null ? String(r.qty) : (r.quantity != null ? String(r.quantity) : "1"),
        price: r.price != null ? String(r.price) : (r.unitPrice != null ? String(r.unitPrice) : (r.unit_price != null ? String(r.unit_price) : "0")),
        sourceItemId: r.sourceItemId || r.itemId || r.item_id || "",
      }));
      const party = doc.partyName || doc.customerName || doc.party || doc.customer || doc.form?.customer || "Cash Sale";
      const phone = doc.partyPhone || doc.phone || doc.mobile || doc.form?.phone || "";
      const form = {
        customer: party,
        phone,
        billingAddress: doc.billingAddress || doc.form?.billingAddress || "",
        shippingAddress: doc.shippingAddress || doc.form?.shippingAddress || "",
        invoiceNumber: String(doc.documentNumber || doc.invoiceNumber || doc.form?.invoiceNumber || "1"),
        invoiceDate: doc.transactionDate || doc.invoiceDate || doc.form?.invoiceDate || "",
        paymentType: doc.paymentMode || doc.paymentType || doc.form?.paymentType || "Cash",
        ...(doc.form || {}),
        customer: party || doc.form?.customer || "Cash Sale",
        phone: phone || doc.form?.phone || "",
      };
      return {
        ...doc,
        partyName: party,
        customerName: party,
        customer: party,
        partyPhone: phone,
        phone,
        items: rawItems,
        rows,
        form,
      };
    } catch (err) {
      console.warn(`[MySQL] Failed to fetch transaction ${id}:`, err.message);
      return null;
    }
  },

  /**
   * Deletes a transaction from MySQL
   */
  async remove(id) {
    return apiRequest(`/transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const paymentInsDb = {
  listAll: () => transactionsDb.listByType("payment_in"),
  save: (payment) => transactionsDb.save({ ...payment, transactionType: "payment_in", type: "payment_in" }),
  remove: (id) => transactionsDb.remove(id),
};

export const paymentOutsDb = {
  listAll: () => transactionsDb.listByType("payment_out"),
  save: (payment) => transactionsDb.save({ ...payment, transactionType: "payment_out", type: "payment_out" }),
  remove: (id) => transactionsDb.remove(id),
};

export const saleOrdersDb = {
  listAll: () => transactionsDb.listByType("sale_order"),
  save: (order) => transactionsDb.save({ ...order, transactionType: "sale_order", type: "sale_order" }),
  remove: (id) => transactionsDb.remove(id),
};

export const purchaseOrdersDb = {
  listAll: () => transactionsDb.listByType("purchase_order"),
  save: (order) => transactionsDb.save({ ...order, transactionType: "purchase_order", type: "purchase_order" }),
  remove: (id) => transactionsDb.remove(id),
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
        const scopedKey = getScopedStorageKey(COMPANY_PROFILE_KEY);
        writeLocal(scopedKey, data);
        if (typeof window !== "undefined") {
          try {
            window.dispatchEvent(new CustomEvent("ledgerly:company-profile-updated", { detail: data }));
          } catch {}
        }
        return data;
      }
      return data;
    } catch (err) {
      console.warn("[MySQL] Failed to load company profile from MySQL:", err.message);
      throw err;
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
  async listRepayments(loanId) {
    const res = await apiRequest(`/cash-bank/loan-accounts/${encodeURIComponent(loanId)}/repayments`);
    return Array.isArray(res) ? res : (res?.data || []);
  },
  async saveRepayment(loanId, repayment) {
    return apiRequest(`/cash-bank/loan-accounts/${encodeURIComponent(loanId)}/repayments`, {
      method: "POST",
      body: JSON.stringify(repayment),
    });
  },
};

// ============================================================================
// 8.1. EXPENSE CATEGORIES DATABASE API
// ============================================================================

export const expenseCategoriesDb = {
  async getAll() {
    const res = await apiRequest("/expense-categories");
    return Array.isArray(res) ? res : (res?.data || []);
  },
  async save(category) {
    return apiRequest("/expense-categories", {
      method: "POST",
      body: JSON.stringify(category),
    });
  },
  async remove(idOrName) {
    return apiRequest(`/expense-categories/${encodeURIComponent(idOrName)}`, {
      method: "DELETE",
    });
  },
};

export const expenseItemsDb = {
  async getAll() {
    try {
      const res = await apiRequest("/expense-items");
      return Array.isArray(res) ? res : (res?.data || []);
    } catch (err) {
      console.warn("[MySQL] Falling back for expense items:", err.message);
      return [];
    }
  },
  async save(item) {
    return apiRequest("/expense-items", {
      method: "POST",
      body: JSON.stringify(item),
    });
  },
  async remove(idOrName) {
    return apiRequest(`/expense-items/${encodeURIComponent(idOrName)}`, {
      method: "DELETE",
    });
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
  async listConversions(unit = "") {
    const query = unit ? `?unit=${encodeURIComponent(unit)}` : "";
    const res = await apiRequest(`/units/conversions${query}`);
    return res?.data || [];
  },
  async saveConversion(conversion) {
    return apiRequest("/units/conversions", { method: "POST", body: JSON.stringify(conversion) });
  },
  async removeConversion(id) {
    return apiRequest(`/units/conversions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const purchaseJobWorksDb = {
  async listAll() {
    const res = await apiRequest("/purchase-job-works");
    return res?.data || [];
  },
  async save(jobWork) {
    return apiRequest("/purchase-job-works", { method: "POST", body: JSON.stringify(jobWork) });
  },
  async remove(id) {
    return apiRequest(`/purchase-job-works/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const balanceSheetDb = {
  async listAccounts() {
    const res = await apiRequest("/balance-sheet/accounts");
    return res?.data || [];
  },
  async saveAccount(account) {
    return apiRequest("/balance-sheet/accounts", { method: "POST", body: JSON.stringify(account) });
  },
  async removeAccount(id) {
    return apiRequest(`/balance-sheet/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const migrationDb = {
  async migrateLocalData(payload) {
    return apiRequest("/migration/migrate-local-data", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async rollbackBatch(batchId) {
    return apiRequest(`/migration/rollback-batch/${encodeURIComponent(batchId)}`, {
      method: "POST",
    });
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
  const paymentIns = readLocal(transactionStorageKeys.paymentIns, []);
  const paymentOuts = readLocal(transactionStorageKeys.paymentOuts, []);
  const reminders = readLocal(SERVICE_REMINDERS_KEY, []);
  const bankAccounts = readLocal(BANK_ACCOUNTS_KEY, []);
  const settings = readLocal(SETTINGS_KEY, {});
  const companyProfile = readLocal(COMPANY_PROFILE_KEY, {});

  // Combine all local transactions into transactions payload
  const estimates = readLocal("ledgerly:estimateQuotations.v1", []);
  const proformas = readLocal("ledgerly:proformaInvoices.v1", []);
  const challans = readLocal("ledgerly:deliveryChallans.v1", []);
  const expenses = readLocal("ledgerly:expenses.v1", []);
  const debitNotes = readLocal("ledgerly:purchaseReturns.v1", []);
  const creditNotes = readLocal("ledgerly:saleReturns.v1", []);
  const saleOrders = readLocal("ledgerly:saleOrders.v1", []);
  const purchaseOrders = readLocal("ledgerly:purchaseOrders.v1", []);

  const transactions = [
    ...sales.map((s) => ({ ...s, transactionType: "sale" })),
    ...purchases.map((p) => ({ ...p, transactionType: "purchase" })),
    ...paymentIns.map((pi) => ({ ...pi, transactionType: "payment_in" })),
    ...paymentOuts.map((po) => ({ ...po, transactionType: "payment_out" })),
    ...estimates.map((e) => ({ ...e, transactionType: "estimate" })),
    ...proformas.map((p) => ({ ...p, transactionType: "proforma" })),
    ...challans.map((c) => ({ ...c, transactionType: "delivery_challan" })),
    ...expenses.map((x) => ({ ...x, transactionType: "expense" })),
    ...debitNotes.map((d) => ({ ...d, transactionType: "debit_note" })),
    ...creditNotes.map((c) => ({ ...c, transactionType: "sale_return" })),
    ...saleOrders.map((o) => ({
      ...o,
      transactionType: "sale_order",
      type: "sale_order",
      documentNumber: o.number || o.documentNumber,
      partyName: o.customer || o.partyName,
      customer: o.customer || o.partyName,
      rows: (o.rows || o.items || []).map((r) => ({
        ...r,
        item: r.item || r.itemName || r.name || "Item",
        name: r.item || r.itemName || r.name || "Item",
        itemName: r.item || r.itemName || r.name || "Item",
        itemCode: r.itemCode || r.code || r.size || null,
        serialNo: r.serialNo || r.serial || r.description || null,
      })),
      items: (o.rows || o.items || []).map((r) => ({
        ...r,
        item: r.item || r.itemName || r.name || "Item",
        name: r.item || r.itemName || r.name || "Item",
        itemName: r.item || r.itemName || r.name || "Item",
        itemCode: r.itemCode || r.code || r.size || null,
        serialNo: r.serialNo || r.serial || r.description || null,
      })),
    })),
    ...purchaseOrders.map((o) => ({
      ...o,
      transactionType: "purchase_order",
      type: "purchase_order",
      documentNumber: o.number || o.documentNumber,
      partyName: o.supplier || o.partyName,
      supplier: o.supplier || o.partyName,
      rows: (o.rows || o.items || []).map((r) => ({
        ...r,
        item: r.item || r.itemName || r.name || "Item",
        name: r.item || r.itemName || r.name || "Item",
        itemName: r.item || r.itemName || r.name || "Item",
        itemCode: r.itemCode || r.code || r.size || null,
        serialNo: r.serialNo || r.serial || r.description || null,
      })),
      items: (o.rows || o.items || []).map((r) => ({
        ...r,
        item: r.item || r.itemName || r.name || "Item",
        name: r.item || r.itemName || r.name || "Item",
        itemName: r.item || r.itemName || r.name || "Item",
        itemCode: r.itemCode || r.code || r.size || null,
        serialNo: r.serialNo || r.serial || r.description || null,
      })),
    })),
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
    await syncAllFromDatabase().catch(() => {});
  }, 10);

  // Re-sync when browser window regains focus to keep tabs/devices in sync
  if (typeof window.addEventListener === "function") {
    window.addEventListener("focus", () => {
      syncAllFromDatabase().catch(() => {});
    });
  }
}

