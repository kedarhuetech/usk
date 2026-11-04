import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { readTransactionCollection, writeTransactionCollection, transactionStorageKeys } from "./transactionRepository.js";

const PURCHASE_BILLS_KEY = transactionStorageKeys.purchases;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readBills() {
  return readTransactionCollection(PURCHASE_BILLS_KEY);
}

function normalizeBill(bill = {}) {
  const timestamp = bill.createdAt || new Date().toISOString();
  const id = bill.id || bill.invoiceId || `purchase-${crypto.randomUUID()}`;
  return {
    ...bill,
    id,
    invoiceId: bill.invoiceId || id,
    transactionType: "purchase",
    createdAt: timestamp,
    updatedAt: bill.updatedAt || timestamp,
  };
}

export function getPurchaseBills() {
  return readBills().map(normalizeBill);
}

export function savePurchaseBill(value) {
  const bill = normalizeBill({ ...value, updatedAt: new Date().toISOString() });
  const next = [bill, ...readBills().filter((entry) => entry.id !== bill.id && entry.invoiceId !== bill.invoiceId)];
  if (canUseStorage()) writeTransactionCollection(PURCHASE_BILLS_KEY, next);
  notifyBusinessDataChanged();
  return bill;
}

export function replacePurchaseBills(bills) {
  if (!Array.isArray(bills)) throw new Error("Purchase bills must be an array.");
  if (!canUseStorage()) throw new Error("Browser local storage is unavailable.");
  writeTransactionCollection(PURCHASE_BILLS_KEY, bills);
  notifyBusinessDataChanged();
  return bills;
}

export const purchaseBillsStorageKey = PURCHASE_BILLS_KEY;
