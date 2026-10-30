import { applySaleInvoiceStockUpdate, inventoryItemsStorageKey } from "./itemsStorage.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";

const SALE_INVOICES_KEY = "ledgerly:saleInvoices.v1";

// This helper handles parse logic.
// Checks whether use storage.
function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

// Reads invoices.
function readInvoices() {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(SALE_INVOICES_KEY);
  if (raw === null) return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error("Saved sale invoices are corrupted; no invoice was changed.", { cause: error });
  }
  if (!Array.isArray(value)) throw new Error("Saved sale invoices must be a list; no invoice was changed.");
  return value;
}

// Writes invoices.
function writeInvoices(invoices) {
  if (!canUseStorage()) throw new Error("Browser storage is unavailable; the invoice was not saved.");
  window.localStorage.setItem(SALE_INVOICES_KEY, JSON.stringify(invoices));
}

// Makes the invoice value consistent.
function normalizeInvoice(invoice = {}) {
  const timestamp = invoice.createdAt || new Date().toISOString();
  const invoiceNumber = invoice.form?.invoiceNumber || invoice.invoiceNumber || "1";
  const id = invoice.id || invoice.invoiceId || `sale-${crypto.randomUUID()}`;

  return {
    ...invoice,
    id,
    invoiceId: invoice.invoiceId || id,
    invoiceNumber,
    transactionType: invoice.transactionType || "sale",
    createdAt: timestamp,
    updatedAt: invoice.updatedAt || timestamp,
  };
}

// Gets sale invoices.
export function getSaleInvoices() {
  return readInvoices().map(normalizeInvoice).filter((invoice) => invoice.transactionType === "sale");
}

// Gets next sale invoice number.
export function getNextSaleInvoiceNumber() {
  const nextNumber = getSaleInvoices().length + 1;
  return String(nextNumber);
}

// Saves sale invoice.
export function saveSaleInvoice(invoice) {
  if (!canUseStorage()) throw new Error("Browser storage is unavailable; the invoice was not saved.");
  const previousInvoices = window.localStorage.getItem(SALE_INVOICES_KEY);
  const previousItems = window.localStorage.getItem(inventoryItemsStorageKey);
  try {
  let normalized = normalizeInvoice({ ...invoice, updatedAt: new Date().toISOString() });
  const existing = readInvoices();
  const existingInvoice = existing.find((current) => current.id === normalized.id || current.invoiceId === normalized.invoiceId);
  const shouldAdjustStock =
    normalized.transactionType === "sale" &&
    !normalized.stockAdjustedAt &&
    !existingInvoice?.stockAdjustedAt;

  if (shouldAdjustStock) {
    applySaleInvoiceStockUpdate(normalized);
    normalized = {
      ...normalized,
      stockAdjustedAt: new Date().toISOString(),
    };
  }

  const nextInvoices = [normalized, ...existing.filter((current) => current.id !== normalized.id)];
  writeInvoices(nextInvoices);
  if (!readInvoices().some((current) => current.id === normalized.id)) {
    throw new Error("The invoice could not be verified after saving.");
  }
  notifyBusinessDataChanged();
  return normalized;
  } catch (error) {
    try {
      if (previousInvoices === null) window.localStorage.removeItem(SALE_INVOICES_KEY);
      else window.localStorage.setItem(SALE_INVOICES_KEY, previousInvoices);
      if (previousItems === null) window.localStorage.removeItem(inventoryItemsStorageKey);
      else window.localStorage.setItem(inventoryItemsStorageKey, previousItems);
    } catch (rollbackError) {
      throw new Error(`${error.message} Rollback could not fully restore local data: ${rollbackError.message}`, { cause: rollbackError });
    }
    throw error;
  }
}

// Deletes sale invoice.
export function deleteSaleInvoice(invoiceId) {
  if (!canUseStorage()) return;
  writeInvoices(readInvoices().filter((invoice) => invoice.id !== invoiceId && invoice.invoiceId !== invoiceId));
  notifyBusinessDataChanged();
}

export const saleInvoicesStorageKey = SALE_INVOICES_KEY;
