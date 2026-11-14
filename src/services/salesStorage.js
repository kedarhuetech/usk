import { applySaleInvoiceStockUpdate, applyBatchRowsToInventory, inventoryItemsStorageKey, isItemBatchTracked } from "./itemsStorage.js";
import { batchMovementStorageKey, localDateOnly, moveBatchRows, reverseBatchMovement } from "./batchInventoryService.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { getAppSettings } from "./appSettingsStorage.js";
import { recordAuditTrail } from "./auditTrailStorage.js";
import { readTransactionCollection, writeTransactionCollection, transactionStorageKeys } from "./transactionRepository.js";
import { transactionsDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

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
  const previousMovements = window.localStorage.getItem(batchMovementStorageKey);
  try {
  let normalized = normalizeInvoice({ ...invoice, updatedAt: new Date().toISOString() });
  const appSettings = getAppSettings();
  if (normalized.transactionType === "sale" && appSettings.enableBatchTracking) {
    const inventory = JSON.parse(window.localStorage.getItem(inventoryItemsStorageKey) || "[]");
    normalized = { ...normalized, rows: (normalized.rows || []).map((row) => {
      const item = inventory.find((entry) => entry.id === (row.sourceItemId || row.itemId) || String(entry.itemName || "").trim().toLowerCase() === String(row.item || "").trim().toLowerCase());
      if (!item || item.type === "service" || !Number(row.qty ?? row.quantity)) return row;
      const batchTracked = isItemBatchTracked(item);
      if (!batchTracked) {
        return row;
      }
      if (!(item.batches || []).length) throw new Error(`Batch tracking is enabled, but ${item.itemName} has no batch stock. Add stock with a batch before selling.`);
      const rawBatchNo = String(row.batchNo || "").trim();
      if (!rawBatchNo) throw new Error(`Select a valid batch for ${item.itemName}.`);
      const batch = (item.batches || []).find((entry) => String(entry.batchNo || "").trim().toLowerCase() === rawBatchNo.toLowerCase());
      if (!batch) throw new Error(`Select a valid batch for ${item.itemName}.`);
      const today = localDateOnly();
      if (batch.expDate && batch.expDate < today) throw new Error(`Batch ${batch.batchNo} for ${item.itemName} has expired.`);
      const available = Number(batch.openingQty ?? batch.quantity ?? 0);
      const reqQty = Number(row.qty ?? row.quantity ?? 0);
      if (reqQty > available) throw new Error(`Batch ${batch.batchNo} for ${item.itemName} has only ${available} in stock (requested: ${reqQty}).`);
      return { ...row, batchNo: batch.batchNo, expDate: batch.expDate || "", batchId: batch.id || "" };
    }) };
  }
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

  // Enforce Settings: Block New Items From Transaction
  if (normalized.transactionType === "sale" && appSettings.blockNewItemsFromTxn) {
    const rawItems = window.localStorage.getItem(inventoryItemsStorageKey);
    let inventory = [];
    try { inventory = rawItems ? JSON.parse(rawItems) : []; } catch {}
    for (const row of normalized.rows || []) {
      const name = (row.item || "").trim().toLowerCase();
      if (!name) continue;
      const match = inventory.find(
        (i) => i.id === row.sourceItemId || i.id === row.itemId || (i.itemName && i.itemName.toLowerCase() === name)
      );
      if (!match) {
        throw new Error(`Creating new items from transactions is blocked in Settings: "${row.item}" is not registered in Item master.`);
      }
    }
  }

  // Enforce Settings: Block New Parties From Transaction
  if (normalized.transactionType === "sale" && appSettings.blockNewPartiesFromTxn) {
    const customer = (normalized.form?.customer || normalized.customer || "").trim();
    if (customer && customer.toLowerCase() !== "cash sale") {
      let parties = [];
      try {
        const rawParties = window.localStorage.getItem("ledgerly:parties.v1");
        parties = rawParties ? JSON.parse(rawParties) : [];
      } catch {}
      const match = parties.find(
        (p) => (p.partyName || p.name || "").trim().toLowerCase() === customer.toLowerCase()
      );
      if (!match) {
        throw new Error(`Creating new parties from transactions is blocked in Settings: "${customer}" is not registered in Party master.`);
      }
    }
  }

  const shouldAdjustStock =
    normalized.transactionType === "sale" &&
    !normalized.stockAdjustedAt &&
    !existingInvoice?.stockAdjustedAt;

  const wasCancelled = Boolean(existingInvoice?.cancelled || existingInvoice?.invoiceStatus === "Cancelled" || existingInvoice?.status === "Cancelled");
  const isCancelled = Boolean(normalized.cancelled || normalized.invoiceStatus === "Cancelled" || normalized.status === "Cancelled");
  const hasBatchRows = (normalized.rows || []).some((r) => r.batchNo && String(r.batchNo).trim() && Number(r.qty ?? r.quantity) > 0);
  const hadBatchRows = (existingInvoice?.batchAllocationRows || existingInvoice?.rows || []).some((r) => r.batchNo && String(r.batchNo).trim() && Number(r.qty ?? r.quantity) > 0);
  const batchMode = normalized.transactionType === "sale" && Boolean(existingInvoice?.batchStockAdjustedAt || (appSettings.enableBatchTracking && (hasBatchRows || hadBatchRows)));

  if (existingInvoice && !wasCancelled) {
    if (existingInvoice.batchStockAdjustedAt) {
      const reversalRows = existingInvoice.batchAllocationRows || existingInvoice.rows || [];
      if (existingInvoice.batchMovementId) reverseBatchMovement(existingInvoice.batchMovementId, "sale");
      else applyBatchRowsToInventory(reversalRows, "add", { allowCreate: false });
    } else if (existingInvoice.stockAdjustedAt) {
      const invItems = JSON.parse(window.localStorage.getItem(inventoryItemsStorageKey) || "[]");
      const restored = invItems.map((item) => {
        const matching = (existingInvoice.rows || []).filter((r) => r.sourceItemId === item.id || (!r.sourceItemId && (r.item || "").trim().toLowerCase() === (item.itemName || "").trim().toLowerCase()));
        if (!matching.length) return item;
        const addQty = matching.reduce((s, r) => s + Math.max(0, Number(r.qty ?? r.quantity ?? 0)), 0);
        const cur = Number(item.openingQuantity ?? item.stock ?? 0);
        return { ...item, openingQuantity: String(cur + addQty), stock: String(cur + addQty) };
      });
      window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(restored));
    }
  }

  if (batchMode && !isCancelled && (!existingInvoice || wasCancelled || existingInvoice.batchStockAdjustedAt || existingInvoice.stockAdjustedAt)) {
    const batchMovementId = `${normalized.id}:${Date.now()}:${crypto.randomUUID()}`;
    const batchRows = (normalized.rows || []).filter((r) => r.batchNo && String(r.batchNo).trim() && Number(r.qty ?? r.quantity) > 0);
    if (batchRows.length > 0) {
      moveBatchRows(batchRows, "reduce", { referenceId: batchMovementId, sourceType: "sale" });
      normalized = { ...normalized, batchMovementId, batchStockAdjustedAt: new Date().toISOString(), batchStockRestoredAt: "", batchAllocationRows: batchRows.map((row) => ({ ...row })) };
    }
    const nonBatchRows = (normalized.rows || []).filter((r) => (!r.batchNo || !String(r.batchNo).trim()) && Number(r.qty ?? r.quantity) > 0);
    if (nonBatchRows.length > 0) {
      applySaleInvoiceStockUpdate({ ...normalized, rows: nonBatchRows });
      normalized = { ...normalized, stockAdjustedAt: new Date().toISOString() };
    }
  } else if (batchMode && isCancelled && existingInvoice && !wasCancelled && existingInvoice.batchStockAdjustedAt) {
    normalized = { ...normalized, batchStockRestoredAt: new Date().toISOString() };
  } else if (!batchMode && (shouldAdjustStock || (existingInvoice?.stockAdjustedAt && !isCancelled))) {
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
  if (isDatabaseMode()) {
    transactionsDb.save({
      ...normalized,
      transactionType: "sale",
      documentNumber: normalized.invoiceNumber,
      transactionDate: normalized.invoiceDate || normalized.date,
      totalAmount: normalized.totals?.finalTotal || normalized.totalAmount || 0,
      paidAmount: normalized.totals?.receivedAmount || normalized.paidAmount || 0,
      balanceAmount: normalized.totals?.balanceDue || normalized.balanceAmount || 0,
    }).catch((err) => console.warn("[MySQL] Background sale sync notice:", err.message));
  }
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
      if (previousMovements === null) window.localStorage.removeItem(batchMovementStorageKey);
      else window.localStorage.setItem(batchMovementStorageKey, previousMovements);
    } catch (rollbackError) {
      throw new Error(`${error.message} Rollback could not fully restore local data: ${rollbackError.message}`, { cause: rollbackError });
    }
    throw error;
  }
}

// Deletes sale invoice.
export function deleteSaleInvoice(invoiceId) {
  if (!canUseStorage()) return;
  const beforeItems = window.localStorage.getItem(inventoryItemsStorageKey);
  const beforeMovements = window.localStorage.getItem(batchMovementStorageKey);
  const invoices = readInvoices();
  const target = invoices.find((invoice) => invoice.id === invoiceId || invoice.invoiceId === invoiceId);
  try {
    if (target?.stockAdjustedAt && !target.batchStockAdjustedAt) {
      const inventory = JSON.parse(window.localStorage.getItem(inventoryItemsStorageKey) || "[]");
      const updated = inventory.map((item) => {
        const rows = (target.rows || []).filter((r) => r.sourceItemId === item.id || (!r.sourceItemId && (r.item || "").trim().toLowerCase() === (item.itemName || "").trim().toLowerCase()));
        if (!rows.length) return item;
        const addQty = rows.reduce((s, r) => s + Math.max(0, Number(r.qty ?? r.quantity ?? 0)), 0);
        const cur = Number(item.openingQuantity ?? item.stock ?? 0);
        return { ...item, openingQuantity: String(cur + addQty), stock: String(cur + addQty) };
      });
      window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(updated));
    }
    if (target?.batchStockAdjustedAt && !target.batchStockRestoredAt) {
      if (target.batchMovementId) reverseBatchMovement(target.batchMovementId, "sale");
      else applyBatchRowsToInventory(target.batchAllocationRows || target.rows || [], "add");
    }
    writeInvoices(invoices.filter((invoice) => invoice.id !== invoiceId && invoice.invoiceId !== invoiceId));
  } catch (error) {
    if (beforeItems === null) window.localStorage.removeItem(inventoryItemsStorageKey); else window.localStorage.setItem(inventoryItemsStorageKey, beforeItems);
    if (beforeMovements === null) window.localStorage.removeItem(batchMovementStorageKey); else window.localStorage.setItem(batchMovementStorageKey, beforeMovements);
    throw error;
  }
  notifyBusinessDataChanged();
  if (isDatabaseMode() && invoiceId) {
    transactionsDb.remove(invoiceId).catch((err) => console.warn("[MySQL] Background sale delete notice:", err.message));
  }
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
