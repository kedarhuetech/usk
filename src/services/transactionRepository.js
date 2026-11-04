import { notifyBusinessDataChanged } from "./businessDataChanged.js";

// Storage adapter seam for persisted business transactions. UI and business
// services use these operations; a future API adapter can implement the same
// contract without changing consumers.
const PREFIX = "ledgerly:";
export const transactionStorageKeys = Object.freeze({
  sales: `${PREFIX}saleInvoices.v1`,
  purchases: `${PREFIX}purchaseBills.v1`,
  paymentIns: `${PREFIX}paymentIns.v1`,
  paymentOuts: `${PREFIX}paymentOuts.v1`,
  saleInvoiceUi: `${PREFIX}saleInvoiceUiActions.v1`,
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

