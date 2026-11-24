import { apiRequest } from "./apiClient.js";
import { syncAllFromDatabase } from "./databaseRepository.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";

/**
 * Creates the production MySQL database restore repository.
 * Persists the entire USV backup payload atomically into MySQL tables.
 */
export function createDatabaseBackupRestoreRepository() {
  return {
    async restore(entries, data, payload) {
      const fullPayload = payload || (data ? { data, manifest: { included: entries } } : entries);
      const response = await apiRequest("/backup/restore-payload", {
        method: "POST",
        body: JSON.stringify(fullPayload),
      });

      // Hydrate client memory cache and active UI directly from live MySQL tables
      try {
        await syncAllFromDatabase();
      } catch (hydrationError) {
        console.warn("[Restore] Post-restore MySQL hydration notice:", hydrationError.message);
      }

      notifyBusinessDataChanged();
      return response;
    },
  };
}

/**
 * Synchronous in-memory / localStorage restore repository for legacy unit tests or mock environments.
 */
export function createLocalStorageBackupRestoreRepository(storage = typeof window !== "undefined" ? window.localStorage : null) {
  return {
    restore(entries, data) {
      if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
        throw new Error("Browser local storage is unavailable. No records were restored.");
      }
      const actualData = (entries && entries.data) ? entries.data : data;
      const actualEntries = (entries && entries.data) ? (data || Object.keys(actualData).map((k) => ({ key: k }))) : entries;

      const previous = new Map();
      try {
        for (const { key } of actualEntries) previous.set(key, storage.getItem(key));
        for (const { key } of actualEntries) storage.setItem(key, JSON.stringify(actualData[key]));
        for (const { key } of actualEntries) {
          if (storage.getItem(key) !== JSON.stringify(actualData[key])) throw new Error(`Could not verify restored data (${key}).`);
        }
      } catch (error) {
        for (const [key, oldValue] of previous) {
          try {
            if (oldValue === null) storage.removeItem(key);
            else storage.setItem(key, oldValue);
          } catch {
            // Best-effort rollback
          }
        }
        throw new Error(`Restore failed; previous records were rolled back where possible. ${error.message}`);
      }
      return { totalRestoredCount: actualEntries.length, stats: {} };
    },
  };
}
