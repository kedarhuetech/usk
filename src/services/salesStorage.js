import { applySaleInvoiceStockUpdate } from "./itemsStorage.js";

const SALE_INVOICES_KEY = "ledgerly:saleInvoices.v1";

function safeParse(value, fallback) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readInvoices() {
  if (!canUseStorage()) return [];
  return safeParse(window.localStorage.getItem(SALE_INVOICES_KEY), []);
}

function writeInvoices(invoices) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SALE_INVOICES_KEY, JSON.stringify(invoices));
}

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

export function getSaleInvoices() {
  return readInvoices().map(normalizeInvoice).filter((invoice) => invoice.transactionType === "sale");
}

export function getNextSaleInvoiceNumber() {
  const nextNumber = getSaleInvoices().length + 1;
  return String(nextNumber);
}

export function saveSaleInvoice(invoice) {
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
  return normalized;
}

export const saleInvoicesStorageKey = SALE_INVOICES_KEY;
