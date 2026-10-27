// Uses the existing APIs or a separate local demo store for Tally imports.
import { businessDataApi } from "./apiClient.js";
import { saveBusinessItem } from "./businessRecords.js";
import { getTallyImportPayload, markStoredDuplicates } from "./tallyImportValidation.js";

// Match LocalStorage keys to the same business ID sent by the API client.
const BUSINESS_SCOPE = encodeURIComponent(import.meta.env?.VITE_BUSINESS_ID || "demo-business");
// Separate the storage mode and records from every other app feature.
const MODE_KEY = `ledgerly:tallyImport.storageMode.v1:${BUSINESS_SCOPE}`;
const RECORDS_KEY = `ledgerly:tallyImport.localDemoRecords.v1:${BUSINESS_SCOPE}`;
const LOCAL_MODE = "local-demo";
// Restores this company's selected storage mode after a page refresh.
function savedMode() {
  try {
    // A saved local-demo choice keeps refreshes in the same repository.
    return typeof window !== "undefined" && window.localStorage?.getItem(MODE_KEY) === LOCAL_MODE ? LOCAL_MODE : "database";
  } catch {
    return "database";
  }
}
let mode = savedMode();

// Reads only Tally import demo records for the active company.
function readLocalRecords() {
  // Parse the feature's own key and fail loudly if its saved data is damaged.
  const value = JSON.parse(window.localStorage.getItem(RECORDS_KEY) || "[]");
  if (!Array.isArray(value)) throw new Error("Local demo records are not in a readable format. No records were changed.");
  return value;
}

// Saves Tally demo records without changing the app's normal records.
function writeLocalRecords(records) {
  window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// Pins this feature to local storage until the user switches modes.
function activateLocalDemoMode() {
  mode = LOCAL_MODE;
  window.localStorage.setItem(MODE_KEY, LOCAL_MODE);
}

// Returns whether new imports use the backend or local demo storage.
export function getTallyImportStorageMode() {
  return mode;
}

// Checks the existing API before switching future imports to the database.
export async function activateDatabaseTallyImportStorage() {
  // Check both APIs first so the app does not switch into an unavailable backend.
  const [items, parties] = await Promise.all([businessDataApi.list("items"), businessDataApi.list("parties")]);
  mode = "database";
  window.localStorage.removeItem(MODE_KEY);
  return { items: items.length, parties: parties.length };
}

// Lists records from the active repository only.
export async function getImportedRecords() {
  if (mode === LOCAL_MODE) {
    // Return only records from LocalStorage; never combine them with API records.
    const local = readLocalRecords();
    return {
      items: local.filter((entry) => entry.recordType === "item").map((entry) => entry.record),
      parties: local.filter((entry) => entry.recordType === "party").map((entry) => entry.record),
    };
  }
  const [items, parties] = await Promise.all([businessDataApi.list("items"), businessDataApi.list("parties")]);
  return { items, parties };
}

// Checks duplicates in the active repository and optionally starts local fallback.
export async function checkDuplicates(records, { allowFallback = true } = {}) {
  let existing;
  if (mode === LOCAL_MODE) {
    const local = readLocalRecords();
    existing = {
      items: local.filter((entry) => entry.recordType === "item").map((entry) => entry.record),
      parties: local.filter((entry) => entry.recordType === "party").map((entry) => entry.record),
    };
  } else {
    try {
      // Load current company records before deciding whether an import is a duplicate.
      const [items, parties] = await Promise.all([businessDataApi.list("items"), businessDataApi.list("parties")]);
      existing = { items, parties };
    } catch (error) {
      // Only preview may fall back; confirmation fails safely if the API just went down.
      if (!allowFallback) throw new Error(`The database became unavailable before import. No records were saved. Upload the file again to preview it in Local Demo Storage, or retry when the database is available. ${error.message}`, { cause: error });
      // No import has been written yet. Pin this feature to its isolated local
      // demo repository so the user can preview and import without mixing stores.
      activateLocalDemoMode();
      existing = {
        items: readLocalRecords().filter((entry) => entry.recordType === "item").map((entry) => entry.record),
        parties: readLocalRecords().filter((entry) => entry.recordType === "party").map((entry) => entry.record),
      };
      return { records: markStoredDuplicates(records, existing.parties, existing.items), mode, fallbackReason: error.message };
    }
  }
  return { records: markStoredDuplicates(records, existing.parties, existing.items), mode };
}

// Prepares rows for review without saving any records.
export async function previewImport(records) {
  return checkDuplicates(records);
}

// Saves ready rows one at a time and reports skipped or failed rows.
export async function importRecords(records) {
  const checked = await checkDuplicates(records, { allowFallback: false });
  // Count each outcome separately so partial backend failures are visible.
  const summary = { imported: 0, duplicate: 0, invalid: 0, failed: 0, failures: [], mode: checked.mode, fallbackReason: checked.fallbackReason || "" };
  for (const record of checked.records) {
    if (record.status === "duplicate") {
      summary.duplicate += 1;
      continue;
    }
    if (record.errors.length) {
      summary.invalid += 1;
      continue;
    }
    try {
      const payload = getTallyImportPayload(record);
      if (mode === LOCAL_MODE) {
        // Demo records use a separate key and never enter normal item/party lists.
        const local = readLocalRecords();
        local.push({ recordType: record.recordType, record: { ...payload, id: `tally-demo-${crypto.randomUUID()}` }, importedAt: new Date().toISOString() });
        writeLocalRecords(local);
      } else if (record.recordType === "item") {
        // Reuse the inventory service so items follow normal normalization rules.
        await saveBusinessItem({ ...payload, id: undefined });
      } else {
        // Reuse the existing party endpoint instead of writing to the database directly.
        await businessDataApi.save("parties", { ...payload, id: undefined });
      }
      summary.imported += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push(`${record.recordType === "item" ? "Item" : "Party"} “${record.sourceName}”: ${error.message || "save failed"}`);
    }
  }
  return summary;
}

// Reads local demo records for display or a later deliberate migration.
export async function getImportedLocalDemoRecords() {
  return readLocalRecords();
}

// Migrates local demo records only after a fresh database duplicate check.
export async function migrateLocalDemoRecords() {
  const localRecords = readLocalRecords();
  // Recheck against current API data immediately before any migration writes.
  const [items, parties] = await Promise.all([businessDataApi.list("items"), businessDataApi.list("parties")]);
  const candidates = localRecords.map((entry, index) => ({
    recordType: entry.recordType,
    sourceName: entry.record?.itemName || entry.record?.partyName || "Imported record",
    sourceIndex: index + 1,
    errors: !["item", "party"].includes(entry.recordType)
      ? ["Unsupported local record type."]
      : entry.recordType === "item" && !String(entry.record?.itemName || "").trim()
        ? ["Item name is required."]
        : entry.recordType === "party" && !String(entry.record?.partyName || "").trim()
          ? ["Party name is required."]
          : [],
    warnings: [],
    status: "ready",
    ...(entry.recordType === "party" ? { party: entry.record } : { item: entry.record }),
  }));
  const checked = markStoredDuplicates(candidates, parties, items);
  const summary = { imported: 0, duplicate: 0, invalid: 0, failed: 0, failures: [] };
  for (const record of checked) {
    if (record.status === "duplicate") {
      summary.duplicate += 1;
      continue;
    }
    if (record.errors.length) {
      summary.invalid += 1;
      summary.failures.push(`${record.recordType} “${record.sourceName}”: ${record.errors.join("; ")}`);
      continue;
    }
    try {
      const payload = getTallyImportPayload(record);
      // Save each record through the same adapters used by a normal import.
      if (record.recordType === "item") await saveBusinessItem({ ...payload, id: undefined });
      else await businessDataApi.save("parties", { ...payload, id: undefined });
      summary.imported += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push(`${record.recordType === "item" ? "Item" : "Party"} “${record.sourceName}”: ${error.message || "save failed"}`);
    }
  }
  if (!summary.failed && !summary.invalid) {
    // Keep local source records as a deliberate recovery copy after migration.
    mode = "database";
    window.localStorage.removeItem(MODE_KEY);
  }
  return summary;
}

export const tallyImportStorageKeys = { mode: MODE_KEY, records: RECORDS_KEY };
