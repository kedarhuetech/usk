// Data Storage Configuration Seam
// Controls whether transactions and inventory records are stored in browser LocalStorage
// or persisted to the backend MySQL database.
//
// Default: "database" (centralized MySQL backend with high-performance indexing and ACID transactions).
// Easily switch or inspect:
// - Call setStorageMode("database")
// - Or set VITE_STORAGE_MODE=database in your .env
// - Or run window.__setStorageMode("database") in the browser DevTools console.

export const STORAGE_MODE_KEY = "ledgerly:storageMode";

export function getStorageMode() {
  if (typeof window !== "undefined" && window.localStorage) {
    const saved = window.localStorage.getItem(STORAGE_MODE_KEY);
    if (saved === "database" || saved === "local") return saved;
  }
  return (typeof import.meta !== "undefined" && import.meta.env?.VITE_STORAGE_MODE) || "database";
}

export function setStorageMode(mode) {
  if (mode !== "local" && mode !== "database") {
    throw new Error(`Invalid storage mode "${mode}". Must be "local" or "database".`);
  }
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_MODE_KEY, mode);
    try {
      window.dispatchEvent(new CustomEvent("ledgerly:storage-mode-changed", { detail: mode }));
    } catch {}
  }
  return mode;
}

export function isDatabaseMode() {
  return getStorageMode() === "database";
}

export function purgeObsoleteLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const legacyKeys = [
      "pos_draft_v1",
      "pos_saved_bills_v1",
      "pos_open_bills_v1",
      "pos_active_bill_id_v1",
      "ledgerly:batchMovements.v1",
      "ledgerly:inventoryAdjustments.v1",
    ];
    for (const key of legacyKeys) {
      window.localStorage.removeItem(key);
    }

    const allKeys = Object.keys(window.localStorage);
    for (const k of allKeys) {
      if (k.startsWith("ledgerly:") && !k.includes("storageMode")) {
        const parts = k.split(":");
        // Any legacy unscoped key without tenant scoping (parts <= 2) is purged
        if (parts.length <= 2) {
          window.localStorage.removeItem(k);
        }
      }
    }
  } catch (e) {
    console.warn("Could not purge obsolete localStorage:", e);
  }
}

// Global browser helpers for seamless developer toggle
if (typeof window !== "undefined") {
  window.__getStorageMode = getStorageMode;
  window.__setStorageMode = setStorageMode;
  window.__purgeObsoleteLocalStorage = purgeObsoleteLocalStorage;
  // Automatically purge obsolete local storage on startup so only live database is used
  purgeObsoleteLocalStorage();
}
