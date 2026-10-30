import {
  inventoryItemsStorageKey,
  csvImportedItemsStorageKey,
  itemUiOverridesStorageKey,
} from "./itemsStorage.js";

let deleting = false;

function readJson(storage, key, fallback, expected) {
  const raw = storage.getItem(key);
  if (raw == null || raw === "") return fallback;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error(`Cannot safely delete items because stored data at ${key} is corrupted.`); }
  if (expected === "array" && !Array.isArray(value)) throw new Error(`Cannot safely delete items because stored data at ${key} is invalid.`);
  if (expected === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error(`Cannot safely delete items because stored data at ${key} is invalid.`);
  return value;
}

function inspectBrowser() {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser storage is unavailable.");
  const storage = window.localStorage;
  const items = readJson(storage, inventoryItemsStorageKey, [], "array");
  const csvItems = readJson(storage, csvImportedItemsStorageKey, [], "array");
  const overrides = readJson(storage, itemUiOverridesStorageKey, {}, "object");
  return { storage, items, csvItems, overrides };
}

export function previewDeleteAllInventoryItems() {
  const { items, csvItems } = inspectBrowser();
  return { local: items.length + csvItems.length };
}

export function deleteAllInventoryItems(expectedLocalCount) {
  if (deleting) throw new Error("An item deletion is already in progress.");
  deleting = true;
  try {
    const data = inspectBrowser();
    const count = data.items.length + data.csvItems.length;
    if (expectedLocalCount !== undefined && expectedLocalCount !== count) {
      throw new Error("The item count changed after the preview. No deletion was made; close and reopen the confirmation to review the current count.");
    }

    const changes = new Map([
      [inventoryItemsStorageKey, JSON.stringify([])],
      [csvImportedItemsStorageKey, JSON.stringify([])],
      [itemUiOverridesStorageKey, JSON.stringify({ ...data.overrides, edits: {}, deleted: [] })],
      ["ledgerly:inventoryItems.legacyDatabaseMigration.v1", null],
    ]);
    const snapshots = new Map([...changes.keys()].map((key) => [key, data.storage.getItem(key)]));
    try {
      for (const [key, value] of changes) {
        if (value === null) data.storage.removeItem(key);
        else data.storage.setItem(key, value);
      }
      for (const [key, value] of changes) {
        if (data.storage.getItem(key) !== value) throw new Error(`Could not verify the update to ${key}.`);
      }
      const remainingItems = readJson(data.storage, inventoryItemsStorageKey, [], "array");
      const remainingCsvItems = readJson(data.storage, csvImportedItemsStorageKey, [], "array");
      if (remainingItems.length || remainingCsvItems.length) throw new Error("Browser item storage still contains records after cleanup.");
      return { deletedLocal: count };
    } catch (error) {
      for (const [key, oldValue] of snapshots) {
        try {
          if (oldValue == null) data.storage.removeItem(key);
          else data.storage.setItem(key, oldValue);
        } catch { /* best-effort rollback; report the original failure */ }
      }
      throw error;
    }
  } finally { deleting = false; }
}
