const ADJUSTMENTS_KEY = "ledgerly:inventoryAdjustments.v1";
import { getInventoryItems, inventoryItemsStorageKey } from "./itemsStorage.js";
import { batchMovementStorageKey, moveBatchRows, reverseBatchMovement } from "./batchInventoryService.js";

// Reads adjustments.
function readAdjustments() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ADJUSTMENTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

// Gets inventory adjustments.
export function getInventoryAdjustments(itemId) {
  return readAdjustments().filter((adjustment) => adjustment.itemId === itemId);
}

// Saves inventory adjustment.
export function saveInventoryAdjustment(adjustment) {
  const before = [ADJUSTMENTS_KEY, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)]);
  try {
  const adjustments = readAdjustments();
  const existing = adjustment.id ? adjustments.find((item) => item.id === adjustment.id) : null;
  const entry = { ...adjustment, id: adjustment.id || crypto.randomUUID(), createdAt: existing?.createdAt || new Date().toISOString() };
  if (entry.batchTracked) {
    if (existing?.batchMovementId) reverseBatchMovement(existing.batchMovementId, "stock-adjustment");
    const movementId = `${entry.id}:${Date.now()}:${crypto.randomUUID()}`;
    moveBatchRows([{ sourceItemId: entry.itemId, item: entry.itemName || getInventoryItems().find((item) => item.id === entry.itemId)?.itemName, batchNo: entry.batchNo, expDate: entry.expDate, qty: entry.quantity }], entry.direction === "add" ? "add" : "reduce", { referenceId: movementId, sourceType: "stock-adjustment", allowCreate: entry.direction === "add" });
    entry.batchMovementId = movementId;
  }
  const next = existing ? adjustments.map((item) => item.id === entry.id ? entry : item) : [ ...adjustments, entry ];
  window.localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(next));
  return entry;
  } catch (error) {
    for (const [key, value] of before) { if (value == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); }
    throw error;
  }
}

export function cancelInventoryAdjustment(adjustmentId) {
  const before = [ADJUSTMENTS_KEY, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)]);
  try {
  const adjustments = readAdjustments();
  const entry = adjustments.find((item) => item.id === adjustmentId);
  if (!entry) throw new Error("Stock adjustment was not found.");
  if (entry.cancelled) return entry;
  if (entry.batchTracked && entry.batchMovementId) reverseBatchMovement(entry.batchMovementId, "stock-adjustment");
  const cancelled = { ...entry, cancelled: true, cancelledAt: new Date().toISOString() };
  window.localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(adjustments.map((item) => item.id === entry.id ? cancelled : item)));
  return cancelled;
  } catch (error) {
    for (const [key, value] of before) { if (value == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); }
    throw error;
  }
}
