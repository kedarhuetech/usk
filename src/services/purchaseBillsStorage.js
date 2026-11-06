import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { applyBatchRowsToInventory, inventoryItemsStorageKey } from "./itemsStorage.js";
import { batchMovementStorageKey, moveBatchRows, reverseBatchMovement } from "./batchInventoryService.js";
import { getAppSettings } from "./appSettingsStorage.js";
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
  const before = canUseStorage() ? [PURCHASE_BILLS_KEY, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)]) : [];
  try {
  let bill = normalizeBill({ ...value, updatedAt: new Date().toISOString() });
  const currentBills = readBills();
  const previous = currentBills.find((entry) => entry.id === bill.id || entry.invoiceId === bill.invoiceId);
  const tracking = Boolean(getAppSettings().enableBatchTracking || previous?.batchStockAdjustedAt);
  const purchaseRowsChanged = !previous || JSON.stringify(previous.rows || []) !== JSON.stringify(bill.rows || []);
  if (tracking && purchaseRowsChanged && (bill.rows || []).some((row) => row.item && Number(row.qty ?? row.quantity) > 0 && !String(row.batchNo || "").trim())) {
    throw new Error("Enter a batch number for each received item while batch tracking is enabled.");
  }
  if (tracking && previous && previous.batchStockAdjustedAt) {
    if (previous.batchMovementId) reverseBatchMovement(previous.batchMovementId, "purchase");
    else applyBatchRowsToInventory(previous.batchAllocationRows || previous.rows || [], "reduce");
    bill.batchStockAdjustedAt = "";
  } else if (tracking && previous && JSON.stringify(previous.rows) !== JSON.stringify(bill.rows)) {
    throw new Error("This historical purchase has no recorded batch movement and cannot be safely edited while batch tracking is enabled.");
  }
  if (tracking && !bill.cancelled && !bill.batchStockAdjustedAt && (bill.rows || []).some((row) => String(row.batchNo || "").trim())) {
    const batchMovementId = `${bill.id}:${Date.now()}:${crypto.randomUUID()}`;
    moveBatchRows((bill.rows || []).filter((row) => String(row.batchNo || "").trim()), "add", { referenceId: batchMovementId, sourceType: "purchase", allowCreate: true });
    bill = { ...bill, batchMovementId, batchStockAdjustedAt: new Date().toISOString(), batchAllocationRows: (bill.rows || []).map((row) => ({ ...row })) };
  }
  const next = [bill, ...currentBills.filter((entry) => entry.id !== bill.id && entry.invoiceId !== bill.invoiceId)];
  if (canUseStorage()) writeTransactionCollection(PURCHASE_BILLS_KEY, next);
  notifyBusinessDataChanged();
  return bill;
  } catch (error) {
    for (const [key, stored] of before) { if (stored === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, stored); }
    throw error;
  }
}

export function replacePurchaseBills(bills) {
  if (!Array.isArray(bills)) throw new Error("Purchase bills must be an array.");
  if (!canUseStorage()) throw new Error("Browser local storage is unavailable.");
  const before = [PURCHASE_BILLS_KEY, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)]);
  try {
  const previous = readBills();
  if (getAppSettings().enableBatchTracking || previous.some((bill) => bill.batchStockAdjustedAt)) {
    const nextById = new Map(bills.map((bill) => [String(bill.id || bill.invoiceId), bill]));
    for (const oldBill of previous) {
      const nextBill = nextById.get(String(oldBill.id || oldBill.invoiceId));
      if (!oldBill.batchStockAdjustedAt && (!nextBill || JSON.stringify(oldBill.rows) !== JSON.stringify(nextBill.rows)) && (oldBill.rows || []).some((row) => Number(row.qty ?? row.quantity) > 0)) {
        throw new Error("This historical purchase has no recorded batch allocation. It cannot be safely edited or deleted while batch tracking is enabled.");
      }
      if (oldBill.batchStockAdjustedAt && (!nextBill || JSON.stringify(oldBill.rows) !== JSON.stringify(nextBill.rows))) {
        if (oldBill.batchMovementId) reverseBatchMovement(oldBill.batchMovementId, "purchase");
        else applyBatchRowsToInventory(oldBill.batchAllocationRows || oldBill.rows || [], "reduce");
        if (nextBill) {
          nextBill.batchMovementId = `${nextBill.id}:${Date.now()}:${crypto.randomUUID()}`;
          moveBatchRows((nextBill.rows || []).filter((row) => String(row.batchNo || "").trim()), "add", { referenceId: nextBill.batchMovementId, sourceType: "purchase", allowCreate: true });
          nextBill.batchStockAdjustedAt = new Date().toISOString();
          nextBill.batchAllocationRows = (nextBill.rows || []).map((row) => ({ ...row }));
        }
      }
    }
  }
  writeTransactionCollection(PURCHASE_BILLS_KEY, bills);
  notifyBusinessDataChanged();
  return bills;
  } catch (error) {
    for (const [key, stored] of before) { if (stored === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, stored); }
    throw error;
  }
}

export const purchaseBillsStorageKey = PURCHASE_BILLS_KEY;
