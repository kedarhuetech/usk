import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { applyBatchRowsToInventory, applyPurchaseBillStockUpdate, inventoryItemsStorageKey } from "./itemsStorage.js";
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

    if (previous && previous.batchStockAdjustedAt) {
      if (previous.batchMovementId) reverseBatchMovement(previous.batchMovementId, "purchase");
      else applyBatchRowsToInventory(previous.batchAllocationRows || previous.rows || [], "reduce");
      bill.batchStockAdjustedAt = "";
    }
    if (previous && previous.stockAdjustedAt) {
      applyPurchaseBillStockUpdate(previous, "reduce");
      bill.stockAdjustedAt = "";
    }

    const batchRows = (bill.rows || []).filter((row) => String(row.batchNo || "").trim() && Number(row.qty ?? row.quantity) > 0);
    const nonBatchRows = (bill.rows || []).filter((row) => !String(row.batchNo || "").trim() && Number(row.qty ?? row.quantity) > 0);

    if (batchRows.length > 0 && !bill.cancelled && !bill.batchStockAdjustedAt) {
      const batchMovementId = `${bill.id}:${Date.now()}:${crypto.randomUUID()}`;
      moveBatchRows(batchRows, "add", { referenceId: batchMovementId, sourceType: "purchase", allowCreate: true });
      bill = { ...bill, batchMovementId, batchStockAdjustedAt: new Date().toISOString(), batchAllocationRows: batchRows.map((row) => ({ ...row })) };
    }

    if (nonBatchRows.length > 0 && !bill.cancelled && !bill.stockAdjustedAt) {
      applyPurchaseBillStockUpdate(bill, "add");
      bill = { ...bill, stockAdjustedAt: new Date().toISOString() };
    }

    const next = [bill, ...currentBills.filter((entry) => entry.id !== bill.id && entry.invoiceId !== bill.invoiceId)];
    if (canUseStorage()) writeTransactionCollection(PURCHASE_BILLS_KEY, next);
    notifyBusinessDataChanged();
    return bill;
  } catch (error) {
    for (const [key, stored] of before) {
      if (stored === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, stored);
    }
    throw error;
  }
}

export function replacePurchaseBills(bills) {
  if (!Array.isArray(bills)) throw new Error("Purchase bills must be an array.");
  if (!canUseStorage()) throw new Error("Browser local storage is unavailable.");
  const before = [PURCHASE_BILLS_KEY, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)]);
  try {
    const previous = readBills();
    const nextById = new Map(bills.map((bill) => [String(bill.id || bill.invoiceId), bill]));
    for (const oldBill of previous) {
      const nextBill = nextById.get(String(oldBill.id || oldBill.invoiceId));
      const changed = !nextBill || JSON.stringify(oldBill.rows) !== JSON.stringify(nextBill.rows);
      if (oldBill.batchStockAdjustedAt && changed) {
        if (oldBill.batchMovementId) reverseBatchMovement(oldBill.batchMovementId, "purchase");
        else applyBatchRowsToInventory(oldBill.batchAllocationRows || oldBill.rows || [], "reduce");
      }
      if (oldBill.stockAdjustedAt && changed) {
        applyPurchaseBillStockUpdate(oldBill, "reduce");
      }
      if (nextBill && changed) {
        const nextBatchRows = (nextBill.rows || []).filter((row) => String(row.batchNo || "").trim() && Number(row.qty ?? row.quantity) > 0);
        const nextNonBatchRows = (nextBill.rows || []).filter((row) => !String(row.batchNo || "").trim() && Number(row.qty ?? row.quantity) > 0);
        if (nextBatchRows.length > 0) {
          nextBill.batchMovementId = `${nextBill.id}:${Date.now()}:${crypto.randomUUID()}`;
          moveBatchRows(nextBatchRows, "add", { referenceId: nextBill.batchMovementId, sourceType: "purchase", allowCreate: true });
          nextBill.batchStockAdjustedAt = new Date().toISOString();
          nextBill.batchAllocationRows = nextBatchRows.map((row) => ({ ...row }));
        }
        if (nextNonBatchRows.length > 0) {
          applyPurchaseBillStockUpdate(nextBill, "add");
          nextBill.stockAdjustedAt = new Date().toISOString();
        }
      }
    }
    writeTransactionCollection(PURCHASE_BILLS_KEY, bills);
    notifyBusinessDataChanged();
    return bills;
  } catch (error) {
    for (const [key, stored] of before) {
      if (stored === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, stored);
    }
    throw error;
  }
}

export const purchaseBillsStorageKey = PURCHASE_BILLS_KEY;
