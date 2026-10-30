import { CASH_ADJUSTMENTS_STORAGE_KEY } from "./cashInHand.js";
import { getChequeStorageKey } from "./chequesRepository.js";
import { inventoryItemsStorageKey } from "./itemsStorage.js";
import { getLoanAccountsStorageKey } from "./loanAccountsRepository.js";
import { partiesStorageKey } from "./partiesStorage.js";
import { purchaseBillsStorageKey } from "./purchaseBillsStorage.js";
import { saleInvoicesStorageKey } from "./salesStorage.js";
import { createLocalStorageBackupRestoreRepository } from "./backupRestoreRepository.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";

export const BACKUP_LAST_CREATED_KEY = "usv:backupToComputer.lastCreated.v1";
export const BACKUP_FORMAT = "usv-backup";
export const BACKUP_FORMAT_VERSION = 1;

export const BACKUP_SOURCES = [
  { category: "Company profile", key: "ledgerly:companyProfile.v1", shape: "object" },
  { category: "Items", key: inventoryItemsStorageKey, shape: "array" },
  { category: "Items", key: "ledgerly:itemsCsvImports.v1", shape: "array" },
  { category: "Items", key: "ledgerly:itemsUiOverrides.v1", shape: "object" },
  { category: "Items", key: "ledgerly:itemsTransactionActions.v1", shape: "object" },
  { category: "Items", key: "ledgerly:inventoryAdjustments.v1", shape: "array" },
  { category: "Items", key: "ledgerly:customUnits.v1", shape: "array" },
  { category: "Items", key: "ledgerly:unitConversions.v1", shape: "array" },
  { category: "Parties", key: partiesStorageKey, shape: "array" },
  { category: "Sales", key: saleInvoicesStorageKey, shape: "array" },
  { category: "Sales", key: "ledgerly:saleInvoiceUiActions.v1", shape: "object" },
  { category: "Sales", key: "ledgerly:estimateQuotations.v1", shape: "array" },
  { category: "Sales", key: "ledgerly:proformaInvoices.v1", shape: "array" },
  { category: "Sales", key: "ledgerly:paymentIns.v1", shape: "array" },
  { category: "Sales", key: "ledgerly:saleOrders.v1", shape: "array" },
  { category: "Sales", key: "ledgerly:deliveryChallans.v1", shape: "array" },
  { category: "Sales", key: "ledgerly:saleReturns.v1", shape: "array" },
  { category: "Purchases", key: purchaseBillsStorageKey, shape: "array" },
  { category: "Cash & bank", key: CASH_ADJUSTMENTS_STORAGE_KEY, shape: "array" },
  { category: "Cash & bank", key: getChequeStorageKey(), shape: "array" },
  { category: "Loans", key: getLoanAccountsStorageKey(), shape: "array" },
];

const SECRET_FIELD = /(password|passcode|access.?token|refresh.?token|auth.?token|(^|[._-])token($|[._-])|secret|api.?key|authorization|credential)/i;

function cleanSecrets(value, path, redactedPaths) {
  if (Array.isArray(value)) return value.map((entry, index) => cleanSecrets(entry, `${path}[${index}]`, redactedPaths));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const entryPath = `${path}.${key}`;
    if (SECRET_FIELD.test(key)) {
      redactedPaths.push(entryPath);
      return [];
    }
    return [[key, cleanSecrets(entry, entryPath, redactedPaths)]];
  }));
}

function readBackupStorage(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    throw new Error("Browser local storage is unavailable. No backup was created.");
  }
  const data = {};
  const included = [];
  const redactedPaths = [];

  for (const source of BACKUP_SOURCES) {
    let raw;
    try {
      raw = storage.getItem(source.key);
    } catch (error) {
      throw new Error(`Could not read ${source.category} data (${source.key}). No backup was created.`, { cause: error });
    }
    if (raw === null) continue;

    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Stored ${source.category} data is malformed (${source.key}). Fix or remove the invalid record before backing up.`, { cause: error });
    }
    const validShape = source.shape === "array" ? Array.isArray(value)
      : value && typeof value === "object" && !Array.isArray(value);
    if (!validShape) {
      throw new Error(`Stored ${source.category} data has an unexpected format (${source.key}). No backup was created.`);
    }

    data[source.key] = cleanSecrets(value, source.key, redactedPaths);
    included.push({ category: source.category, key: source.key, recordCount: Array.isArray(value) ? value.length : 1 });
  }

  return { data, included, redactedPaths };
}

export function collectBackupData(storage = typeof window !== "undefined" ? window.localStorage : null) {
  return readBackupStorage(storage);
}

function filenameFor(timestamp) {
  const compact = timestamp.replaceAll(":", "").replaceAll("-", "").replace(/\.\d{3}Z$/, "Z");
  return `USV-backup-${compact}.usvbackup`;
}

export function createBackupPayload(collected, { now = new Date(), version = import.meta.env?.VITE_APP_VERSION || "unknown" } = {}) {
  const createdAt = now.toISOString();
  const categories = [...new Set(collected.included.map((entry) => entry.category))];
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    application: { name: "USV", version },
    manifest: {
      categories,
      included: collected.included,
      redactedFields: collected.redactedPaths,
      dataSource: "browser-local-storage",
    },
    data: collected.data,
  };
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { valid: false, error: "Backup must be a JSON object." };
  if (payload.format !== BACKUP_FORMAT) return { valid: false, error: "This is not a USV backup file." };
  if (payload.formatVersion !== BACKUP_FORMAT_VERSION) return { valid: false, error: `Unsupported USV backup version: ${payload.formatVersion}.` };
  if (!Number.isFinite(Date.parse(payload.createdAt || "")) || !payload.application?.name
    || !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data) || !Array.isArray(payload.manifest?.included)) {
    return { valid: false, error: "The backup manifest or data section is missing." };
  }
  return { valid: true, error: "" };
}

export function previewBackupPayload(payload) {
  const validation = validateBackupPayload(payload);
  if (!validation.valid) throw new Error(validation.error);

  const sourcesByKey = new Map(BACKUP_SOURCES.map((source) => [source.key, source]));
  const entries = [];
  for (const [key, value] of Object.entries(payload.data)) {
    const source = sourcesByKey.get(key);
    if (!source) throw new Error(`This backup contains an unsupported data store (${key}).`);
    const validShape = source.shape === "array" ? Array.isArray(value)
      : value && typeof value === "object" && !Array.isArray(value);
    if (!validShape) throw new Error(`Backup data for ${source.category} is invalid (${key}).`);
    entries.push({ ...source, recordCount: Array.isArray(value) ? value.length : 1 });
  }
  return { createdAt: payload.createdAt, companyName: payload.data["ledgerly:companyProfile.v1"]?.companyName || "Not specified", entries };
}

export function restoreBackupPayload(payload, repository = createLocalStorageBackupRestoreRepository()) {
  const preview = previewBackupPayload(payload);
  if (!repository || typeof repository.restore !== "function") throw new Error("A compatible restore repository is required.");
  repository.restore(preview.entries, payload.data);
  notifyBusinessDataChanged();
  return { restoredCount: preview.entries.reduce((sum, entry) => sum + entry.recordCount, 0), entries: preview.entries };
}

export function downloadBackupFile(payload, { windowRef = window, documentRef = document } = {}) {
  const validation = validateBackupPayload(payload);
  if (!validation.valid) throw new Error(validation.error);
  const filename = filenameFor(payload.createdAt);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });

  if (typeof windowRef.showSaveFilePicker === "function") {
    return windowRef.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "USV backup", accept: { "application/json": [".usvbackup"] } }],
    }).then(async (handle) => {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { filename, method: "save-picker" };
    });
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error("The browser could not start the backup download.", { cause: error });
  }
  windowRef.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve({ filename, method: "browser-download" });
}
