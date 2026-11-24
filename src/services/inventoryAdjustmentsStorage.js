import { getScopedStorageKey } from "../config/businessConfig.js";

const BASE_ADJUSTMENTS_KEY = "ledgerly:inventoryAdjustments.v1";
const getAdjustmentsKey = () => getScopedStorageKey(BASE_ADJUSTMENTS_KEY);
export const ADJUSTMENTS_KEY = BASE_ADJUSTMENTS_KEY;
import { getInventoryItems, inventoryItemsStorageKey } from "./itemsStorage.js";
import { batchMovementStorageKey, moveBatchRows, reverseBatchMovement } from "./batchInventoryService.js";
import { inventoryAdjustmentsDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

// Reads adjustments.
function readAdjustments() {
  try {
    const value = JSON.parse(window.localStorage.getItem(getAdjustmentsKey()) || "[]");
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
  const currentKey = getAdjustmentsKey();
  const before = [currentKey, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)]);
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
  window.localStorage.setItem(currentKey, JSON.stringify(next));
  if (isDatabaseMode()) {
    const resolvedItem = getInventoryItems().find((it) => it.id === entry.itemId);
    const resolvedName = entry.itemName && entry.itemName !== "Item"
      ? entry.itemName
      : (resolvedItem?.itemName || resolvedItem?.name || entry.itemName || "Item");

    inventoryAdjustmentsDb.save({
      id: entry.id,
      itemId: entry.itemId,
      itemName: resolvedName,
      adjustmentType: entry.direction === "add" ? "add" : "reduce",
      quantity: parseFloat(entry.quantity) || 0,
      reason: entry.reason || "",
      adjustmentDate: (entry.createdAt || new Date().toISOString()).slice(0, 10),
    }).catch((err) => console.warn("[MySQL] Adjustment background sync:", err.message));
  }
  return entry;
  } catch (error) {
    for (const [key, value] of before) { if (value == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); }
    throw error;
  }
}

export function cancelInventoryAdjustment(adjustmentId) {
  const currentKey = getAdjustmentsKey();
  const before = [currentKey, inventoryItemsStorageKey, batchMovementStorageKey].map((key) => [key, window.localStorage.getItem(key)]);
  try {
  const adjustments = readAdjustments();
  const entry = adjustments.find((item) => item.id === adjustmentId);
  if (!entry) throw new Error("Stock adjustment was not found.");
  if (entry.cancelled) return entry;
  if (entry.batchTracked && entry.batchMovementId) reverseBatchMovement(entry.batchMovementId, "stock-adjustment");
  const cancelled = { ...entry, cancelled: true, cancelledAt: new Date().toISOString() };
  window.localStorage.setItem(currentKey, JSON.stringify(adjustments.map((item) => item.id === entry.id ? cancelled : item)));
  return cancelled;
  } catch (error) {
    for (const [key, value] of before) { if (value == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); }
    throw error;
  }
}
