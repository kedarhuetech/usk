import { getInventoryItems, applyBatchRowsToInventory as applyItemBatchRows } from "./itemsStorage.js";

const DAY_MS = 86_400_000;
export const batchMovementStorageKey = "ledgerly:batchMovements.v1";
export const localDateOnly = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function readMovements() {
  try { const value = JSON.parse(window.localStorage.getItem(batchMovementStorageKey) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

export function moveBatchRows(rows, direction, { referenceId = "", sourceType = "", allowCreate = false } = {}) {
  const movementId = referenceId && sourceType ? `${sourceType}:${referenceId}:${direction}` : "";
  const movements = readMovements();
  if (movementId && movements.some((entry) => entry.id === movementId)) return getInventoryItems();
  const items = applyItemBatchRows(rows, direction, { allowCreate });
  if (movementId) window.localStorage.setItem(batchMovementStorageKey, JSON.stringify([...movements, { id: movementId, referenceId, sourceType, direction, rows: rows.map((row) => ({ ...row })), createdAt: new Date().toISOString() }]));
  return items;
}

export function applyBatchRowsToInventory(rows, direction, options = {}) {
  return moveBatchRows(rows, direction, options);
}

export function reverseBatchMovement(referenceId, sourceType) {
  const movements = readMovements();
  const original = movements.find((entry) => entry.referenceId === referenceId && entry.sourceType === sourceType && !entry.reversedAt);
  if (!original) return { reversed: false, items: getInventoryItems() };
  const reverseDirection = original.direction === "add" ? "reduce" : "add";
  const items = applyItemBatchRows(original.rows, reverseDirection);
  const next = movements.map((entry) => entry.id === original.id ? { ...entry, reversedAt: new Date().toISOString() } : entry);
  window.localStorage.setItem(batchMovementStorageKey, JSON.stringify(next));
  return { reversed: true, items };
}

export function listBatchExpiryStatus({ today = localDateOnly(), nearExpiryDays = 30, items = getInventoryItems() } = {}) {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return items.flatMap((item) => (item.batches || []).filter((batch) => batch.expDate).map((batch) => {
    const expiryMs = Date.parse(`${batch.expDate}T00:00:00Z`);
    const daysToExpiry = Math.floor((expiryMs - todayMs) / DAY_MS);
    const status = daysToExpiry < 0 ? "Expired" : daysToExpiry <= nearExpiryDays ? "Near expiry" : "Not expired";
    return { itemId: item.id, itemName: item.itemName || item.name, batchId: batch.id || "", batchNo: batch.batchNo || "", quantity: Number(batch.openingQty ?? batch.quantity ?? 0) || 0, mfgDate: batch.mfgDate || "", expDate: batch.expDate, daysToExpiry, status };
  }));
}

export function reconcileBatchQuantities(items = getInventoryItems()) {
  return items.flatMap((item) => {
    const batchTotal = (item.batches || []).reduce((sum, batch) => sum + (Number(batch.openingQty ?? batch.quantity ?? 0) || 0), 0);
    const aggregate = Number(item.openingQuantity ?? item.stock ?? 0) || 0;
    return Math.abs(batchTotal - aggregate) > 1e-9 ? [{ itemId: item.id, itemName: item.itemName || item.name, aggregateQuantity: aggregate, batchQuantity: batchTotal, difference: aggregate - batchTotal, warning: "Aggregate item stock differs from saved batch totals; no automatic allocation was made." }] : [];
  });
}
