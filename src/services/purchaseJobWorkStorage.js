import { inventoryItemsStorageKey } from "./itemsStorage.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";

export const purchaseJobWorkStorageKey = "ledgerly:purchaseJobWorks.v1";
const historyKey = "ledgerly:inventoryAdjustments.v1";
const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
function readList(key) {
  const raw = window.localStorage.getItem(key);
  if (raw == null) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error(`Saved ${key} data must be a list.`);
  return value;
}
export function getPurchaseJobWorks() {
  try { return readList(purchaseJobWorkStorageKey); }
  catch (error) { throw new Error(`Unable to read job-work records: ${error.message}`, { cause: error }); }
}

export function savePurchaseJobWork(input) {
  const keys = [purchaseJobWorkStorageKey, inventoryItemsStorageKey, historyKey];
  const before = Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)]));
  try {
    const records = readList(purchaseJobWorkStorageKey);
    const inventory = readList(inventoryItemsStorageKey);
    const history = readList(historyKey);
    const previous = input.id ? records.find((row) => row.id === input.id) : null;
    if (input.id && !previous) throw new Error("This job-work record no longer exists. Refresh and try again.");
    if (!String(input.party || "").trim()) throw new Error("Select a job-work vendor.");
    if (!String(input.number || "").trim()) throw new Error("Enter a job-work reference number.");
    if (records.some((row) => String(row.number) === String(input.number) && row.id !== input.id)) throw new Error("That job-work reference already exists.");
    const sentRows = (input.sentRows || []).filter((row) => row.itemId && numeric(row.qty) > 0);
    const receivedRows = (input.receivedRows || []).filter((row) => row.itemId && numeric(row.qty) > 0);
    if (!sentRows.length) throw new Error("Add at least one material sent for processing.");
    if (sentRows.some((row) => numeric(row.qty) <= 0) || receivedRows.some((row) => numeric(row.qty) <= 0)) throw new Error("Material quantities must be greater than zero.");
    const inventoryIds = new Set(inventory.map((item) => String(item.id)));
    if ([...sentRows, ...receivedRows].some((row) => !inventoryIds.has(String(row.itemId)))) throw new Error("A selected job-work item is no longer in inventory. Refresh and try again.");
    if (input.status === "Completed" && !receivedRows.length) throw new Error("A completed job must include received goods.");
    if (input.status === "Partially Completed" && !receivedRows.length) throw new Error("Record received goods before marking the job partially completed.");
    const totalsByItem = (rows) => rows.reduce((map, row) => map.set(String(row.itemId), (map.get(String(row.itemId)) || 0) + numeric(row.qty)), new Map());
    const previousSent = totalsByItem(previous?.sentRows || []);
    const previousReceived = totalsByItem(previous?.receivedRows || []);
    const currentSent = totalsByItem(sentRows);
    const currentReceived = totalsByItem(receivedRows);
    const itemIds = new Set([...previousSent.keys(), ...previousReceived.keys(), ...currentSent.keys(), ...currentReceived.keys()]);
    const stockDelta = new Map();
    const nextHistory = [];
    itemIds.forEach((itemId) => {
      const sentChange = (currentSent.get(itemId) || 0) - (previousSent.get(itemId) || 0);
      const receivedChange = (currentReceived.get(itemId) || 0) - (previousReceived.get(itemId) || 0);
      const delta = -sentChange + receivedChange;
      if (delta) stockDelta.set(itemId, delta);
      const item = inventory.find((entry) => String(entry.id) === itemId);
      const itemName = item?.itemName || item?.name || [...sentRows, ...receivedRows].find((row) => String(row.itemId) === itemId)?.item || "Item";
      const addMovement = (change, direction, note) => {
        if (!change) return;
        nextHistory.push({ id: crypto.randomUUID(), itemId, itemName, type: "Purchase Job Work", direction, quantity: Math.abs(change), note, reference: input.number, createdAt: new Date().toISOString() });
      };
      addMovement(sentChange, sentChange > 0 ? "reduce" : "add", `${sentChange > 0 ? "Sent to" : "Returned from"} ${input.party} · ${input.number}`);
      addMovement(receivedChange, receivedChange > 0 ? "add" : "reduce", `${receivedChange > 0 ? "Received from" : "Reversed receipt to"} ${input.party} · ${input.number}`);
    });
    const nextInventory = inventory.map((item) => {
      const delta = stockDelta.get(String(item.id)) || 0;
      if (!delta) return item;
      const current = numeric(item.openingQuantity !== "" && item.openingQuantity != null ? item.openingQuantity : item.stock);
      if (current + delta < -1e-9) throw new Error(`Insufficient stock for ${item.itemName || item.name}.`);
      const quantity = String(Math.max(0, current + delta));
      return { ...item, openingQuantity: quantity, stock: quantity, updatedAt: new Date().toISOString() };
    });
    const now = new Date().toISOString();
    const record = { ...input, id: input.id || crypto.randomUUID(), type: "Purchase (Job Work)", sentRows, receivedRows, charges: Math.max(0, numeric(input.charges)), status: input.status || (receivedRows.length ? "Partially Completed" : "Pending"), createdAt: input.createdAt || now, updatedAt: now };
    const nextRecords = record.id === input.id && input.id ? records.map((row) => row.id === record.id ? record : row) : [record, ...records];
    window.localStorage.setItem(purchaseJobWorkStorageKey, JSON.stringify(nextRecords));
    window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(nextInventory));
    window.localStorage.setItem(historyKey, JSON.stringify([...history, ...nextHistory]));
    if (!readList(purchaseJobWorkStorageKey).some((row) => row.id === record.id)) throw new Error("Job-work record could not be verified after saving.");
    notifyBusinessDataChanged();
    return record;
  } catch (error) {
    let rollbackError = null;
    for (const [key, value] of Object.entries(before)) {
      try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); }
      catch (failure) { rollbackError ||= failure; }
    }
    if (rollbackError) throw new Error(`${error.message} Rollback was incomplete: ${rollbackError.message}`, { cause: error });
    throw error;
  }
}
