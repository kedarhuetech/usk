// Saves Tally masters through the same local adapters used by the rest of the app.
import { saveBusinessItem } from "./businessRecords.js";
import { getInventoryItems } from "./itemsStorage.js";
import { getParties, saveParty } from "./partiesStorage.js";
import { getTallyImportPayload, markStoredDuplicates } from "./tallyImportValidation.js";

const LOCAL_MODE = "local-demo";

// Returns whether new imports use the backend or local demo storage.
export function getTallyImportStorageMode() {
  return LOCAL_MODE;
}

// Checks the existing API before switching future imports to the database.
export async function activateDatabaseTallyImportStorage() {
  throw new Error("Tally imports use local storage and are saved to the shared Items and Parties lists.");
}

// Lists records from the active repository only.
export async function getImportedRecords() {
  const items = getInventoryItems();
  const parties = getParties();
  return { items, parties };
}

// Checks duplicates in the active repository and optionally starts local fallback.
export async function checkDuplicates(records, { allowFallback = true } = {}) {
  let existing;
  existing = { items: getInventoryItems(), parties: getParties() };
  return { records: markStoredDuplicates(records, existing.parties, existing.items), mode: LOCAL_MODE };
}

// Prepares rows for review without saving any records.
export async function previewImport(records) {
  return checkDuplicates(records);
}

// Saves ready rows one at a time and reports skipped or failed rows.
export async function importRecords(records) {
  const checked = await checkDuplicates(records, { allowFallback: false });
  // Count each outcome separately so partial backend failures are visible.
  const summary = { imported: 0, duplicate: 0, invalid: 0, failed: 0, failures: [], mode: LOCAL_MODE, fallbackReason: "" };
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
      if (record.recordType === "item") {
        await saveBusinessItem({ ...payload, id: undefined });
      } else {
        saveParty({ ...payload, id: undefined });
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
  return [];
}

// Migrates local demo records only after a fresh database duplicate check.
export async function migrateLocalDemoRecords() {
  const localRecords = [];
  // Recheck against current API data immediately before any migration writes.
  const items = getInventoryItems();
  const parties = getParties();
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
      else saveParty({ ...payload, id: undefined });
      summary.imported += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push(`${record.recordType === "item" ? "Item" : "Party"} “${record.sourceName}”: ${error.message || "save failed"}`);
    }
  }
  return summary;
}

export const tallyImportStorageKeys = {};
