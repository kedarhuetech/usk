import { transactionStorageKeys } from "./transactionRepository.js";
import { getScopedStorageKey, getActiveBusinessId } from "../config/businessConfig.js";
import { createDatabaseBackupRestoreRepository, createLocalStorageBackupRestoreRepository } from "./backupRestoreRepository.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";

export const CASH_ADJUSTMENTS_STORAGE_KEY = "ledgerly:cashAdjustments.v1";
export const CHEQUE_STORAGE_KEY = "usv.cheques.v1";
export const LOAN_ACCOUNTS_STORAGE_KEY = "usv.loanAccounts.v1";
export const inventoryItemsStorageKey = "ledgerly:inventoryItems.v1";
export const partiesStorageKey = "ledgerly:parties.v1";
export const saleInvoicesStorageKey = transactionStorageKeys.sales;
export const purchaseBillsStorageKey = transactionStorageKeys.purchases;
export const SERVICE_REMINDER_RECORDS_KEY = "ledgerly:serviceReminderRecords.v1";

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
  { category: "Purchases", key: "ledgerly:purchaseOrders.v1", shape: "array" },
  { category: "Purchases", key: "ledgerly:paymentOuts.v1", shape: "array" },
  { category: "Purchases", key: "ledgerly:purchaseReturns.v1", shape: "array" },
  { category: "Purchases", key: "ledgerly:expenses.v1", shape: "array" },
  { category: "Purchases", key: "ledgerly:expenseCategories.v1", shape: "array" },
  { category: "Purchases", key: "ledgerly:expenseItems.v1", shape: "array" },
  { category: "Cash & bank", key: CASH_ADJUSTMENTS_STORAGE_KEY, shape: "array" },
  { category: "Cash & bank", key: "ledgerly:bankAccounts.v1", shape: "array" },
  { category: "Cash & bank", key: "ledgerly:bankTransactions.v1", shape: "array" },
  { category: "Cash & bank", key: CHEQUE_STORAGE_KEY, shape: "array" },
  { category: "Loans", key: LOAN_ACCOUNTS_STORAGE_KEY, shape: "array" },
  { category: "Settings", key: "ledgerly:appSettings.v1", shape: "object" },
  { category: "Settings", key: "ledgerly:printSettings.v1", shape: "object" },
  { category: "Settings", key: SERVICE_REMINDER_RECORDS_KEY, shape: "array" },
  { category: "Settings", key: "ledgerly:serviceReminderSettings.v1", shape: "object" },
  { category: "Business growth", key: "ledgerly:onlineStoreSettings.v1", shape: "object" },
  { category: "Business growth", key: "ledgerly:onlineStoreOrders.v1", shape: "array" },
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

export function getBackupTenantContext(storage) {
  let businessId = "";
  let isExplicit = false;

  if (storage && typeof storage.getItem === "function") {
    try {
      const authBiz = storage.getItem("usk_auth_business_id");
      if (authBiz && typeof authBiz === "string" && authBiz.trim() && authBiz.trim() !== "local-development") {
        businessId = authBiz.trim();
        isExplicit = true;
      }
      if (!businessId) {
        const userRaw = storage.getItem("usk_auth_user");
        if (userRaw) {
          const u = JSON.parse(userRaw);
          if (u && u.businessId && typeof u.businessId === "string" && u.businessId.trim() && u.businessId.trim() !== "local-development") {
            businessId = u.businessId.trim();
            isExplicit = true;
          }
        }
      }
    } catch {}
  }

  if (!businessId) {
    businessId = getActiveBusinessId();
  }

  return { businessId, isExplicit };
}

function verifyBusinessOwnership(parsedValue, expectedBusinessId) {
  if (!parsedValue || typeof parsedValue !== "object") return false;
  if (!Array.isArray(parsedValue)) {
    const bizId = String(parsedValue.businessId || parsedValue.business_id || "").trim();
    return bizId === expectedBusinessId;
  }
  if (parsedValue.length === 0) return false;
  let taggedCount = 0;
  for (const record of parsedValue) {
    if (!record || typeof record !== "object") return false;
    const bizId = String(record.business_id || record.businessId || "").trim();
    if (bizId) {
      if (bizId !== expectedBusinessId) return false;
      taggedCount++;
    }
  }
  return taggedCount > 0;
}

function getCandidateStorageKeys(source, businessId) {
  // Genuinely global settings (printer config, margins, paper size)
  if (source.key === "ledgerly:printSettings.v1") {
    return {
      scopedKeys: [getScopedStorageKey("ledgerly:printSettings.v1", businessId)],
      legacyKeys: ["ledgerly:printSettings.v1"],
      isGlobal: true,
    };
  }

  // Business growth (Online store - strictly preserved per requirement 9)
  if (source.category === "Business growth") {
    return {
      scopedKeys: [],
      legacyKeys: [source.key],
      isGlobal: true,
    };
  }

  // Cheques
  if (source.key === CHEQUE_STORAGE_KEY) {
    return {
      scopedKeys: [
        getScopedStorageKey(CHEQUE_STORAGE_KEY, businessId),
        getScopedStorageKey("ledgerly:cheques.v1", businessId),
      ],
      legacyKeys: [CHEQUE_STORAGE_KEY, "ledgerly:cheques.v1"],
      isGlobal: false,
    };
  }

  // Loans
  if (source.key === LOAN_ACCOUNTS_STORAGE_KEY) {
    return {
      scopedKeys: [
        getScopedStorageKey(LOAN_ACCOUNTS_STORAGE_KEY, businessId),
        getScopedStorageKey("ledgerly:loanAccounts.v1", businessId),
      ],
      legacyKeys: [LOAN_ACCOUNTS_STORAGE_KEY, "ledgerly:loanAccounts.v1"],
      isGlobal: false,
    };
  }

  // Service reminders
  if (source.key === SERVICE_REMINDER_RECORDS_KEY) {
    return {
      scopedKeys: [
        getScopedStorageKey(SERVICE_REMINDER_RECORDS_KEY, businessId),
        getScopedStorageKey("ledgerly:serviceReminders.v1", businessId),
      ],
      legacyKeys: [SERVICE_REMINDER_RECORDS_KEY, "ledgerly:serviceReminders.v1"],
      isGlobal: false,
    };
  }

  // All other tenant-specific business data
  return {
    scopedKeys: [getScopedStorageKey(source.key, businessId)],
    legacyKeys: [source.key],
    isGlobal: false,
  };
}

function readBackupStorage(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    throw new Error("Browser local storage is unavailable. No backup was created.");
  }
  const data = {};
  const included = [];
  const redactedPaths = [];

  const { businessId, isExplicit } = getBackupTenantContext(storage);

  for (const source of BACKUP_SOURCES) {
    let raw = null;
    const { scopedKeys, legacyKeys, isGlobal } = getCandidateStorageKeys(source, businessId);

    try {
      // 1. Try reading from the active tenant's scoped keys (never other tenants' scoped keys)
      for (const scopedKey of scopedKeys) {
        const val = storage.getItem(scopedKey);
        if (val !== null && val !== undefined) {
          raw = val;
          break;
        }
      }

      // 2. If absent from scoped keys, evaluate legacy unscoped keys
      if (raw === null || raw === undefined) {
        for (const legacyKey of legacyKeys) {
          const val = storage.getItem(legacyKey);
          if (val === null || val === undefined) continue;

          // For genuinely global settings or online store, allow direct fallback
          if (isGlobal) {
            raw = val;
            break;
          }

          // If no explicit tenant session exists in storage (legacy unauthenticated/test mode),
          // allow legacy unscoped key
          if (!isExplicit) {
            raw = val;
            break;
          }

          // In an explicit tenant session, NEVER use an unscoped key unless ownership can be verified
          try {
            const parsed = JSON.parse(val);
            if (verifyBusinessOwnership(parsed, businessId)) {
              raw = val;
              break;
            }
          } catch {
            // Malformed data will be handled or ignored
          }
        }
      }
    } catch (error) {
      throw new Error(`Could not read ${source.category} data (${source.key}). No backup was created.`, { cause: error });
    }
    if (raw === null || raw === undefined) continue;

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

  return { data, included, redactedPaths, businessId };
}

export function collectBackupData(storage = typeof window !== "undefined" ? window.localStorage : null) {
  return readBackupStorage(storage);
}

export function resolveSourceDefinition(key) {
  if (!key || typeof key !== "string") return null;

  // 1. Company profile (canonical or scoped)
  if (key === "ledgerly:companyProfile.v1" || key.startsWith("ledgerly:companyProfile.v1:")) {
    return { category: "Company profile", key: "ledgerly:companyProfile.v1", shape: "object" };
  }
  // 2. Cheques (usv or legacy ledgerly prefix, with or without business scope)
  if (
    key === CHEQUE_STORAGE_KEY ||
    key.startsWith(`${CHEQUE_STORAGE_KEY}:`) ||
    key === "ledgerly:cheques.v1" ||
    key.startsWith("ledgerly:cheques.v1:")
  ) {
    return { category: "Cash & bank", key: CHEQUE_STORAGE_KEY, shape: "array" };
  }
  // 3. Loans (usv or legacy ledgerly prefix, with or without business scope)
  if (
    key === LOAN_ACCOUNTS_STORAGE_KEY ||
    key.startsWith(`${LOAN_ACCOUNTS_STORAGE_KEY}:`) ||
    key === "ledgerly:loanAccounts.v1" ||
    key.startsWith("ledgerly:loanAccounts.v1:")
  ) {
    return { category: "Loans", key: LOAN_ACCOUNTS_STORAGE_KEY, shape: "array" };
  }
  // 4. Service reminders (serviceReminderRecords or legacy serviceReminders, with or without business scope)
  if (
    key === SERVICE_REMINDER_RECORDS_KEY ||
    key.startsWith(`${SERVICE_REMINDER_RECORDS_KEY}:`) ||
    key === "ledgerly:serviceReminders.v1" ||
    key.startsWith("ledgerly:serviceReminders.v1:")
  ) {
    return { category: "Settings", key: SERVICE_REMINDER_RECORDS_KEY, shape: "array" };
  }

  // 5. Direct exact match in BACKUP_SOURCES
  const direct = BACKUP_SOURCES.find((s) => s.key === key);
  if (direct) return direct;

  // 6. Scoped key match (prefix before business ID suffix)
  const colonIdx = key.lastIndexOf(":");
  if (colonIdx > 0) {
    const baseKey = key.slice(0, colonIdx);
    const matched = BACKUP_SOURCES.find((s) => s.key === baseKey);
    if (matched) return matched;
  }

  return null;
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
      ...(collected.businessId ? { businessId: collected.businessId } : {}),
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

  const entries = [];
  let companyName = "Not specified";

  for (const [key, value] of Object.entries(payload.data)) {
    const source = resolveSourceDefinition(key);
    if (!source) throw new Error(`This backup contains an unsupported data store (${key}).`);
    const validShape = source.shape === "array" ? Array.isArray(value)
      : value && typeof value === "object" && !Array.isArray(value);
    if (!validShape) throw new Error(`Backup data for ${source.category} is invalid (${key}).`);

    if (source.category === "Company profile" && value && typeof value === "object" && (value.companyName || value.businessName)) {
      companyName = value.companyName || value.businessName;
    }

    entries.push({ ...source, originalKey: key, recordCount: Array.isArray(value) ? value.length : 1 });
  }

  // Fallback company name check if not already set
  if (companyName === "Not specified") {
    const profileKey = Object.keys(payload.data).find((k) => k === "ledgerly:companyProfile.v1" || k.startsWith("ledgerly:companyProfile.v1:"));
    if (profileKey && payload.data[profileKey] && typeof payload.data[profileKey] === "object") {
      companyName = payload.data[profileKey].companyName || payload.data[profileKey].businessName || "Not specified";
    }
  }

  return { createdAt: payload.createdAt, companyName, entries };
}

export function restoreBackupPayload(payload, repository = createDatabaseBackupRestoreRepository()) {
  const preview = previewBackupPayload(payload);
  if (!repository || typeof repository.restore !== "function") throw new Error("A compatible restore repository is required.");

  const rawResult = repository.restore(preview.entries, payload.data, payload);
  if (rawResult && typeof rawResult.then === "function") {
    return rawResult.then((result) => {
      notifyBusinessDataChanged();
      return {
        restoredCount: result?.totalRestoredCount ?? preview.entries.reduce((sum, entry) => sum + entry.recordCount, 0),
        entries: preview.entries,
        stats: result?.stats || {},
        replacedStores: result?.replacedStores || preview.entries.map((e) => e.category),
        message: result?.message || `USV restore completed: ${preview.entries.reduce((sum, entry) => sum + entry.recordCount, 0)} records restored to MySQL.`,
      };
    });
  }
  notifyBusinessDataChanged();
  return {
    restoredCount: rawResult?.totalRestoredCount ?? preview.entries.reduce((sum, entry) => sum + entry.recordCount, 0),
    entries: preview.entries,
    stats: rawResult?.stats || {},
    replacedStores: rawResult?.replacedStores || preview.entries.map((e) => e.category),
    message: rawResult?.message || `USV restore completed: ${preview.entries.reduce((sum, entry) => sum + entry.recordCount, 0)} records saved.`,
  };
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
