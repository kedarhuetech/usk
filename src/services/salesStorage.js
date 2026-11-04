import { applySaleInvoiceStockUpdate, inventoryItemsStorageKey } from "./itemsStorage.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { getAppSettings } from "./appSettingsStorage.js";
import { recordAuditTrail } from "./auditTrailStorage.js";
import { readTransactionCollection, writeTransactionCollection, transactionStorageKeys } from "./transactionRepository.js";

const SALE_INVOICES_KEY = transactionStorageKeys.sales;

// This helper handles parse logic.
// Checks whether use storage.
function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

// Reads invoices.
function readInvoices() {
  try { return readTransactionCollection(SALE_INVOICES_KEY); }
  catch (error) { throw new Error(`${error.message}; no invoice was changed.`, { cause: error }); }
}

// Writes invoices.
function writeInvoices(invoices) {
  if (!canUseStorage()) throw new Error("Browser storage is unavailable; the invoice was not saved.");
  writeTransactionCollection(SALE_INVOICES_KEY, invoices);
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
  const appSettings = getAppSettings();
  const existing = readInvoices();
  const existingInvoice = existing.find((current) => current.id === normalized.id || current.invoiceId === normalized.invoiceId);

  // Enforce Settings: Stop Sale on Negative Stock
  if (normalized.transactionType === "sale" && appSettings.stopSaleOnNegativeStock) {
    const rawItems = window.localStorage.getItem(inventoryItemsStorageKey);
    let inventory = [];
    try { inventory = rawItems ? JSON.parse(rawItems) : []; } catch {}
    for (const row of normalized.rows || []) {
      const match = inventory.find((i) => i.id === row.sourceItemId || i.id === row.itemId || (i.itemName && i.itemName.toLowerCase() === (row.item || "").toLowerCase()));
      if (match) {
        const available = Number(match.openingQuantity ?? match.stock ?? 0);
        const reqQty = Number(row.qty ?? row.quantity ?? 0);
        if (reqQty > available) {
          throw new Error(`Stop Sale on Negative Stock is enabled: "${match.itemName || row.item}" has only ${available} in stock (requested: ${reqQty}).`);
        }
      }
    }
  }

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
  recordAuditTrail({
    action: existingInvoice ? "Sale Invoice Updated" : "Sale Invoice Created",
    entity: "Sales",
    details: `Invoice #${normalized.invoiceNumber} for ${normalized.form?.customer || 'Cash'} · Amount ${normalized.totals?.finalTotal || normalized.totalAmount || 0}`,
    user: "User",
  });
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
  recordAuditTrail({
    action: "Sale Invoice Deleted",
    entity: "Sales",
    details: `Invoice ID ${invoiceId}`,
    user: "User",
  });
}

export function setSaleInvoiceLifecycle(invoiceId, invoiceStatus) {
  if (!["Draft", "Active", "Cancelled"].includes(invoiceStatus)) throw new Error("Invalid invoice status.");
  const invoice = readInvoices().find((entry) => String(entry.id || entry.invoiceId) === String(invoiceId));
  if (!invoice) throw new Error("Sale invoice not found.");
  return saveSaleInvoice({ ...invoice, invoiceStatus, cancelled: invoiceStatus === "Cancelled", status: invoiceStatus, updatedAt: new Date().toISOString() });
}

export const saleInvoicesStorageKey = SALE_INVOICES_KEY;
