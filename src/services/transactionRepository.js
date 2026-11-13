import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  parseYMD,
  formatDateDMY,
  getPresetDateRange,
  normalizeExpense,
  filterExpenses,
  calculateExpenseMetrics,
} from "../utils/expenseCalculations.js";

// Storage adapter seam for persisted business transactions. UI and business
// services use these operations; a future API adapter can implement the same
// contract without changing consumers.
const PREFIX = "ledgerly:";
export const transactionStorageKeys = Object.freeze({
  sales: `${PREFIX}saleInvoices.v1`,
  purchases: `${PREFIX}purchaseBills.v1`,
  paymentIns: `${PREFIX}paymentIns.v1`,
  paymentOuts: `${PREFIX}paymentOuts.v1`,
  saleOrders: `${PREFIX}saleOrders.v1`,
  purchaseOrders: `${PREFIX}purchaseOrders.v1`,
  saleInvoiceUi: `${PREFIX}saleInvoiceUiActions.v1`,
  expenses: `${PREFIX}expenses.v1`,
  expenseCategories: `${PREFIX}expenseCategories.v1`,
  expenseItems: `${PREFIX}expenseItems.v1`,
});

function storage() {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser storage is unavailable.");
  return window.localStorage;
}

export function readTransactionCollection(key) {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const raw = window.localStorage.getItem(key);
  if (raw == null) return [];
  let value;
  try { value = JSON.parse(raw); }
  catch (error) { throw new Error(`Saved transaction data (${key}) is corrupted: ${error.message}`, { cause: error }); }
  if (!Array.isArray(value)) throw new Error(`Saved transaction data (${key}) must be a list.`);
  return value;
}

export function writeTransactionCollection(key, records) {
  if (!Array.isArray(records)) throw new Error("Transaction records must be an array.");
  storage().setItem(key, JSON.stringify(records));
  return records;
}

export function readTransactionValue(key, fallback = null) {
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`Saved transaction data (${key}) is corrupted: ${error.message}`, { cause: error }); }
}

export function writeTransactionValue(key, value) {
  storage().setItem(key, JSON.stringify(value));
  return value;
}

export function upsertTransaction(key, record) {
  const id = String(record?.id || record?.invoiceId || "");
  if (!id) throw new Error("A transaction ID is required.");
  const records = readTransactionCollection(key);
  const found = records.some((entry) => String(entry?.id || entry?.invoiceId || "") === id);
  return writeTransactionCollection(key, found
    ? records.map((entry) => String(entry?.id || entry?.invoiceId || "") === id ? record : entry)
    : [record, ...records]);
}

export const getPaymentIns = () => readTransactionCollection(transactionStorageKeys.paymentIns);
export const getPaymentOuts = () => readTransactionCollection(transactionStorageKeys.paymentOuts);
export const savePaymentIns = (records) => { const saved = writeTransactionCollection(transactionStorageKeys.paymentIns, records); notifyBusinessDataChanged(); return saved; };
export const savePaymentOuts = (records) => { const saved = writeTransactionCollection(transactionStorageKeys.paymentOuts, records); notifyBusinessDataChanged(); return saved; };

export const getSaleOrders = () => readTransactionCollection(transactionStorageKeys.saleOrders);
export const saveSaleOrders = (records) => { const saved = writeTransactionCollection(transactionStorageKeys.saleOrders, records); notifyBusinessDataChanged(); return saved; };

export const getPurchaseOrders = () => readTransactionCollection(transactionStorageKeys.purchaseOrders);
export const savePurchaseOrders = (records) => { const saved = writeTransactionCollection(transactionStorageKeys.purchaseOrders, records); notifyBusinessDataChanged(); return saved; };

export const getExpenses = () => {
  const records = readTransactionCollection(transactionStorageKeys.expenses);
  const seenIds = new Set();
  const result = [];
  (Array.isArray(records) ? records : []).forEach((r, idx) => {
    if (!r || r.deleted || r.isDeleted) return;
    const norm = normalizeExpense(r, idx);
    if (!norm) return;
    const uniqueKey = String(norm.id || `${norm.number}-${norm.date}`);
    if (!seenIds.has(uniqueKey)) {
      seenIds.add(uniqueKey);
      result.push(norm);
    }
  });
  return result;
};

export const saveExpenses = (records) => {
  const saved = writeTransactionCollection(transactionStorageKeys.expenses, records);
  notifyBusinessDataChanged();
  return saved;
};

export const getExpenseCategories = () => {
  const raw = readTransactionCollection(transactionStorageKeys.expenseCategories);
  const categoriesSet = new Set(DEFAULT_EXPENSE_CATEGORIES);

  if (Array.isArray(raw)) {
    raw.forEach((c) => {
      const s = String(c || "").trim();
      if (s) categoriesSet.add(s);
    });
  }

  // Also harvest any unique categories actively used in stored expenses
  const expenses = readTransactionCollection(transactionStorageKeys.expenses);
  if (Array.isArray(expenses)) {
    expenses.forEach((e) => {
      const cat = String(e?.category || e?.categoryName || "").trim();
      if (cat) categoriesSet.add(cat);
    });
  }

  return Array.from(categoriesSet).sort((a, b) => a.localeCompare(b));
};

export const saveExpenseCategories = (categories) => {
  const saved = writeTransactionCollection(transactionStorageKeys.expenseCategories, categories);
  notifyBusinessDataChanged();
  return saved;
};

export {
  DEFAULT_EXPENSE_CATEGORIES,
  parseYMD,
  formatDateDMY,
  getPresetDateRange,
  normalizeExpense,
  filterExpenses,
  calculateExpenseMetrics,
};

/**
 * Calculates line amount with discounts and taxes.
 */
export function calculateOrderRowAmount(row, qtyOverride = null) {
  const qty = qtyOverride != null ? Number(qtyOverride || 0) : Number(row.qty ?? row.orderedQty ?? 0);
  const price = Number(row.price || 0);
  const gross = qty * price;
  const discount =
    row.discountType === "amount"
      ? Number(row.discount || 0)
      : gross * (Number(row.discount || 0) / 100);
  const net = Math.max(0, gross - discount);
  const tax = (net * (Number(row.tax) || 0)) / 100;
  const cess = (net * (Number(row.cess) || 0)) / 100;
  return net + tax + cess;
}

/**
 * Normalizes an order's rows and calculates cumulative fulfillment metrics.
 */
export function getOrderFulfillmentSummary(order) {
  if (!order) {
    return {
      totalOrderedQty: 0,
      totalConvertedQty: 0,
      totalRemainingQty: 0,
      originalAmount: 0,
      convertedAmount: 0,
      remainingAmount: 0,
      status: "Open",
      isFullyConverted: false,
      isPartiallyConverted: false,
      isOpen: true,
      rows: [],
    };
  }

  const rawStatus = String(order.status || "Open");
  const isCancelled = rawStatus.toLowerCase() === "cancelled";
  const isLegacyFullyConverted =
    rawStatus === "Converted to Sale" ||
    rawStatus === "Converted to Purchase" ||
    rawStatus === "Fully Converted";

  const rows = (order.rows || []).map((row, idx) => {
    const rowId = row.id || `row-${idx}`;
    const orderedQty = Number(row.orderedQty ?? row.qty ?? 0);
    let convertedQty = 0;
    if (row.convertedQty != null) {
      convertedQty = Number(row.convertedQty || 0);
    } else if (isLegacyFullyConverted) {
      convertedQty = orderedQty;
    }
    // Prevent over-conversion
    convertedQty = Math.min(convertedQty, orderedQty);
    const remainingQty = Math.max(0, orderedQty - convertedQty);

    const originalRowAmount = calculateOrderRowAmount(row, orderedQty);
    const convertedRowAmount = calculateOrderRowAmount(row, convertedQty);
    const remainingRowAmount = calculateOrderRowAmount(row, remainingQty);

    return {
      ...row,
      id: rowId,
      orderedQty,
      convertedQty,
      remainingQty,
      originalRowAmount,
      convertedRowAmount,
      remainingRowAmount,
    };
  });

  const totalOrderedQty = rows.reduce((s, r) => s + r.orderedQty, 0);
  const totalConvertedQty = rows.reduce((s, r) => s + r.convertedQty, 0);
  const totalRemainingQty = rows.reduce((s, r) => s + r.remainingQty, 0);

  const originalAmount =
    order.amount != null && !rows.length
      ? Number(order.amount)
      : rows.reduce((s, r) => s + r.originalRowAmount, 0);
  const convertedAmount = rows.reduce((s, r) => s + r.convertedRowAmount, 0);
  const remainingAmount =
    isCancelled || (totalOrderedQty > 0 && totalRemainingQty === 0)
      ? 0
      : rows.reduce((s, r) => s + r.remainingRowAmount, 0);

  let status;
  if (isCancelled) {
    status = "Cancelled";
  } else if (totalOrderedQty > 0 && totalRemainingQty === 0) {
    status =
      rawStatus === "Converted to Sale"
        ? "Converted to Sale"
        : rawStatus === "Converted to Purchase"
        ? "Converted to Purchase"
        : "Fully Converted";
  } else if (totalConvertedQty > 0 && totalRemainingQty > 0) {
    status = "Partially Converted";
  } else {
    status = rawStatus === "Order Overdue" ? "Order Overdue" : "Open";
  }

  return {
    totalOrderedQty,
    totalConvertedQty,
    totalRemainingQty,
    originalAmount,
    convertedAmount,
    remainingAmount,
    status,
    isFullyConverted:
      status === "Fully Converted" ||
      status === "Converted to Sale" ||
      status === "Converted to Purchase" ||
      isLegacyFullyConverted,
    isPartiallyConverted: status === "Partially Converted",
    isOpen: status === "Open",
    rows,
  };
}

/**
 * Fulfills items on a Sale Order (supports full or partial fulfillment).
 */
export function fulfillSaleOrder(orderId, fulfilledItems = [], invoiceMeta = {}) {
  const orders = getSaleOrders();
  let targetOrder = null;

  const updated = orders.map((order) => {
    if (order.id !== orderId && order.number !== orderId) return order;
    targetOrder = order;

    // Normalize and fulfill rows
    const rows = (order.rows || []).map((row, idx) => {
      const rowId = row.id || `row-${idx}`;
      const orderedQty = Number(row.orderedQty ?? row.qty ?? 0);
      let existingConverted = Number(row.convertedQty ?? (order.status?.includes("Converted") ? orderedQty : 0));
      existingConverted = Math.min(existingConverted, orderedQty);

      // Match item from fulfilledItems
      const matched = fulfilledItems.find(
        (f) =>
          (f.sourceOrderRowId && f.sourceOrderRowId === rowId) ||
          (f.rowId && f.rowId === rowId) ||
          (f.item && row.item && f.item.trim().toLowerCase() === row.item.trim().toLowerCase())
      );

      const addQty = matched ? Math.max(0, Number(matched.qty || 0)) : 0;
      const newConverted = Math.min(orderedQty, existingConverted + addQty);
      const remainingQty = Math.max(0, orderedQty - newConverted);

      return {
        ...row,
        id: rowId,
        orderedQty,
        convertedQty: newConverted,
        remainingQty,
      };
    });

    const summary = getOrderFulfillmentSummary({ ...order, rows });
    const convertedUnits = fulfilledItems.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const invoiceId = invoiceMeta.id || invoiceMeta.invoiceId;
    const invoiceNum =
      invoiceMeta.invoiceNumber || invoiceMeta.id || invoiceMeta.invoiceId || "INV";

    return {
      ...order,
      rows,
      totalOrderedQty: summary.totalOrderedQty,
      totalConvertedQty: summary.totalConvertedQty,
      totalRemainingQty: summary.totalRemainingQty,
      amount: summary.originalAmount,
      convertedAmount: summary.convertedAmount,
      remainingAmount: summary.remainingAmount,
      status: summary.status === "Fully Converted" ? "Fully Converted" : summary.status,
      convertedSaleId: invoiceId || order.convertedSaleId,
      convertedInvoiceId: invoiceId || order.convertedInvoiceId,
      convertedInvoiceNumber: invoiceNum || order.convertedInvoiceNumber,
      convertedAt: new Date().toISOString(),
      convertedInvoices: [
        ...(order.convertedInvoices || []),
        {
          invoiceId,
          invoiceNumber: invoiceNum,
          date: invoiceMeta.date,
          convertedAt: new Date().toISOString(),
          items: fulfilledItems.map((f) => ({
            item: f.item,
            qty: Number(f.qty || 0),
            price: Number(f.price || 0),
          })),
        },
      ],
      history: [
        ...(order.history || []),
        {
          action: `Converted ${convertedUnits} units to Sale Invoice #${invoiceNum} (${summary.status})`,
          at: new Date().toISOString(),
          status: summary.status,
          invoiceId,
          convertedUnits,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  });

  saveSaleOrders(updated);
  return updated.find((o) => o.id === orderId || o.number === orderId) || targetOrder;
}

/**
 * Fulfills items on a Purchase Order (supports full or partial fulfillment).
 */
export function fulfillPurchaseOrder(orderId, fulfilledItems = [], billMeta = {}) {
  const orders = getPurchaseOrders();
  let targetOrder = null;

  const updated = orders.map((order) => {
    if (order.id !== orderId && order.number !== orderId) return order;
    targetOrder = order;

    const rows = (order.rows || []).map((row, idx) => {
      const rowId = row.id || `row-${idx}`;
      const orderedQty = Number(row.orderedQty ?? row.qty ?? 0);
      let existingConverted = Number(row.convertedQty ?? (order.status?.includes("Converted") ? orderedQty : 0));
      existingConverted = Math.min(existingConverted, orderedQty);

      const matched = fulfilledItems.find(
        (f) =>
          (f.sourceOrderRowId && f.sourceOrderRowId === rowId) ||
          (f.rowId && f.rowId === rowId) ||
          (f.item && row.item && f.item.trim().toLowerCase() === row.item.trim().toLowerCase())
      );

      const addQty = matched ? Math.max(0, Number(matched.qty || 0)) : 0;
      const newConverted = Math.min(orderedQty, existingConverted + addQty);
      const remainingQty = Math.max(0, orderedQty - newConverted);

      return {
        ...row,
        id: rowId,
        orderedQty,
        convertedQty: newConverted,
        remainingQty,
      };
    });

    const summary = getOrderFulfillmentSummary({ ...order, rows });
    const convertedUnits = fulfilledItems.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const billId = billMeta.id || billMeta.billId || billMeta.purchaseBillId;
    const billNum =
      billMeta.invoiceNumber ||
      billMeta.billNumber ||
      billMeta.id ||
      billMeta.billId ||
      "BILL";

    const convertedBillEntry = {
      purchaseBillId: billId,
      billId,
      billNumber: billNum,
      invoiceNumber: billNum,
      date: billMeta.date,
      convertedAt: new Date().toISOString(),
      items: fulfilledItems.map((f) => ({
        item: f.item,
        qty: Number(f.qty || 0),
        price: Number(f.price || 0),
      })),
    };

    return {
      ...order,
      rows,
      totalOrderedQty: summary.totalOrderedQty,
      totalConvertedQty: summary.totalConvertedQty,
      totalRemainingQty: summary.totalRemainingQty,
      amount: summary.originalAmount,
      convertedAmount: summary.convertedAmount,
      remainingAmount: summary.remainingAmount,
      status: summary.status === "Fully Converted" ? "Fully Converted" : summary.status,
      convertedPurchaseId: billId || order.convertedPurchaseId,
      convertedPurchaseBillId: billId || order.convertedPurchaseBillId,
      convertedPurchaseBillNumber: billNum || order.convertedPurchaseBillNumber,
      convertedAt: new Date().toISOString(),
      convertedPurchaseBills: [
        ...(order.convertedPurchaseBills || order.convertedBills || []),
        convertedBillEntry,
      ],
      convertedBills: [
        ...(order.convertedBills || order.convertedPurchaseBills || []),
        convertedBillEntry,
      ],
      history: [
        ...(order.history || []),
        {
          action: `Converted ${convertedUnits} units to Purchase Bill #${billNum} (${summary.status})`,
          at: new Date().toISOString(),
          status: summary.status,
          purchaseBillId: billId,
          billId,
          convertedUnits,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  });

  savePurchaseOrders(updated);
  return updated.find((o) => o.id === orderId || o.number === orderId) || targetOrder;
}

export function updateSaleOrderStatus(orderId, status, extra = {}) {
  const orders = getSaleOrders();
  const updated = orders.map((order) => {
    if (order.id !== orderId) return order;
    const isFullyConverted =
      status === "Converted to Sale" || status === "Fully Converted";
    const rows = (order.rows || []).map((r) => {
      const orderedQty = Number(r.orderedQty ?? r.qty ?? 0);
      const convertedQty = isFullyConverted ? orderedQty : Number(r.convertedQty || 0);
      return {
        ...r,
        orderedQty,
        convertedQty,
        remainingQty: isFullyConverted ? 0 : Math.max(0, orderedQty - convertedQty),
      };
    });
    return {
      ...order,
      ...extra,
      rows,
      status,
      updatedAt: new Date().toISOString(),
      history: [
        ...(order.history || []),
        { action: `Status changed to ${status}`, at: new Date().toISOString(), ...extra },
      ],
    };
  });
  return saveSaleOrders(updated);
}

export function updatePurchaseOrderStatus(orderId, status, extra = {}) {
  const orders = getPurchaseOrders();
  const updated = orders.map((order) => {
    if (order.id !== orderId) return order;
    const isFullyConverted =
      status === "Converted to Purchase" || status === "Fully Converted";
    const rows = (order.rows || []).map((r) => {
      const orderedQty = Number(r.orderedQty ?? r.qty ?? 0);
      const convertedQty = isFullyConverted ? orderedQty : Number(r.convertedQty || 0);
      return {
        ...r,
        orderedQty,
        convertedQty,
        remainingQty: isFullyConverted ? 0 : Math.max(0, orderedQty - convertedQty),
      };
    });
    return {
      ...order,
      ...extra,
      rows,
      status,
      updatedAt: new Date().toISOString(),
      history: [
        ...(order.history || []),
        { action: `Status changed to ${status}`, at: new Date().toISOString(), ...extra },
      ],
    };
  });
  return savePurchaseOrders(updated);
}

