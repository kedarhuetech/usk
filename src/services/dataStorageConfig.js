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

// Global browser helpers for seamless developer toggle
if (typeof window !== "undefined") {
  window.__getStorageMode = getStorageMode;
  window.__setStorageMode = setStorageMode;
}
