export function createLocalStorageBackupRestoreRepository(storage = typeof window !== "undefined" ? window.localStorage : null) {
  return {
    restore(entries, data) {
      if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
        throw new Error("Browser local storage is unavailable. No records were restored.");
      }
      const previous = new Map();
      try {
        for (const { key } of entries) previous.set(key, storage.getItem(key));
        for (const { key } of entries) storage.setItem(key, JSON.stringify(data[key]));
        for (const { key } of entries) {
          if (storage.getItem(key) !== JSON.stringify(data[key])) throw new Error(`Could not verify restored data (${key}).`);
        }
      } catch (error) {
        for (const [key, oldValue] of previous) {
          try {
            if (oldValue === null) storage.removeItem(key);
            else storage.setItem(key, oldValue);
          } catch {
            // Best-effort rollback if the browser storage itself has become unavailable.
          }
        }
        throw new Error(`Restore failed; previous records were rolled back where possible. ${error.message}`);
      }
    },
  };
}
