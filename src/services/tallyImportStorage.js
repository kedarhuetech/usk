// Saves Tally masters through Udyog's MySQL-first businessRecords adapters and records batch audit history.
import {
  saveBusinessItem,
  saveBusinessParty,
  loadBusinessItems,
  loadBusinessParties,
} from "./businessRecords.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { getInventoryItems } from "./itemsStorage.js";
import { getParties } from "./partiesStorage.js";
import { tallyApi } from "./apiClient.js";
import { getTallyImportPayload, markStoredDuplicates } from "./tallyImportValidation.js";

// Returns whether new imports use the MySQL backend or local fallback.
export function getTallyImportStorageMode() {
  return isDatabaseMode() ? "database" : "local";
}

// Verifies MySQL backend availability for Tally imports.
export async function activateDatabaseTallyImportStorage() {
  await Promise.all([loadBusinessItems(), loadBusinessParties()]);
  return "database";
}

// Lists current records from the active repository.
export async function getImportedRecords() {
  if (isDatabaseMode()) {
    try {
      const [items, parties] = await Promise.all([loadBusinessItems(), loadBusinessParties()]);
      return { items: Array.isArray(items) ? items : [], parties: Array.isArray(parties) ? parties : [] };
    } catch {
      // Fall back to local cache when backend is unreachable.
    }
  }
  return { items: getInventoryItems(), parties: getParties() };
}

// Checks duplicates against authoritative MySQL records (or local cache if offline).
export async function checkDuplicates(records, { allowFallback = true } = {}) {
  let existingItems;
  let existingParties;
  let mode = getTallyImportStorageMode();
  let fallbackReason = "";

  if (isDatabaseMode()) {
    try {
      const [liveItems, liveParties] = await Promise.all([
        loadBusinessItems(),
        loadBusinessParties(),
      ]);
      existingItems = Array.isArray(liveItems) ? liveItems : [];
      existingParties = Array.isArray(liveParties) ? liveParties : [];
      mode = "database";
    } catch (err) {
      if (!allowFallback) throw err;
      existingItems = getInventoryItems();
      existingParties = getParties();
      mode = "local";
      fallbackReason = err?.message || "Backend unavailable";
    }
  } else {
    existingItems = getInventoryItems();
    existingParties = getParties();
  }

  return {
    records: markStoredDuplicates(records, existingParties, existingItems),
    mode,
    fallbackReason,
  };
}

// Prepares rows for review without saving any records.
export async function previewImport(records) {
  return checkDuplicates(records, { allowFallback: true });
}

// Saves ready (and optionally user-approved duplicate) rows to MySQL and logs an import batch.
export async function importRecords(records, options = {}) {
  const {
    duplicateAction = "skip",
    fileName = "tally-export.xml",
    fileHash = "",
    tallyCompanyName = "",
    unsupportedCount = 0,
    onProgress,
  } = options;

  const checked = await checkDuplicates(records, { allowFallback: !isDatabaseMode() });
  const summary = {
    imported: 0,
    updated: 0,
    duplicate: 0,
    invalid: 0,
    failed: 0,
    failures: [],
    mode: checked.mode,
    fallbackReason: checked.fallbackReason || "",
  };

  const total = checked.records.length;
  for (let idx = 0; idx < total; idx += 1) {
    const record = checked.records[idx];
    if (record.errors.length) {
      summary.invalid += 1;
      continue;
    }

    const isDuplicate = record.status === "duplicate";
    if (isDuplicate && duplicateAction !== "update") {
      summary.duplicate += 1;
      continue;
    }

    try {
      const payload = getTallyImportPayload(record);
      const targetId = isDuplicate && record.existingId ? record.existingId : undefined;
      if (record.recordType === "item") {
        await saveBusinessItem({ ...payload, id: targetId });
      } else {
        await saveBusinessParty({ ...payload, id: targetId });
      }
      if (isDuplicate) summary.updated += 1;
      else summary.imported += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push(`${record.recordType === "item" ? "Item" : "Party"} “${record.sourceName}”: ${error.message || "save failed"}`);
    }

    if (onProgress && (idx % 10 === 0 || idx === total - 1)) {
      onProgress(idx + 1, total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (isDatabaseMode()) {
    try {
      await tallyApi.recordBatch({
        fileName,
        fileHash,
        tallyCompanyName,
        totalDetected: total,
        importedCount: summary.imported,
        updatedCount: summary.updated,
        skippedCount: summary.duplicate + summary.invalid,
        failedCount: summary.failed,
        unsupportedCount,
        status: summary.failed > 0 ? "partial" : "completed",
        summaryNotes: summary.failures.slice(0, 10).join(" | "),
      });
    } catch {
      // Batch audit logging is non-blocking if the backend is offline.
    }
  }

  return summary;
}

export async function getTallyImportBatches(limit = 15) {
  if (!isDatabaseMode()) return [];
  try {
    const res = await tallyApi.listBatches(limit);
    return Array.isArray(res?.data) ? res.data : [];
  } catch {
    return [];
  }
}

export async function checkTallyFileHash(hash) {
  if (!isDatabaseMode() || !hash) return { alreadyImported: false, match: null };
  try {
    const res = await tallyApi.checkHash(hash);
    return { alreadyImported: Boolean(res?.alreadyImported), match: res?.match || null };
  } catch {
    return { alreadyImported: false, match: null };
  }
}

export const tallyImportStorageKeys = {};
