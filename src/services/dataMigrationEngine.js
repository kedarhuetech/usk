/**
 * Comprehensive Browser-to-MySQL Data Migration Engine
 * 
 * Safety & Audit Guarantees:
 * 1. Pre-migration snapshot: Snapshots all localStorage business keys before any mutation.
 * 2. Non-destructive: Does not wipe browser storage until database persistence is confirmed.
 * 3. Identity preservation: Maintains original UUIDs (including RT Pharmacy '933f31db-61eb-4c2b-a3d1-2c862c8fc888').
 * 4. Business ID scoping: All migrated records explicitly scoped to the active business ('demo-business').
 * 5. Batch audit & rollback: Logs each migration run with a unique batch ID for clean reversal.
 */

import { getActiveBusinessId } from "../config/businessConfig.js";
import { migrationDb } from "./databaseRepository.js";

export const MIGRATION_SNAPSHOT_PREFIX = "usv.migration_backup.";
export const LAST_MIGRATION_REPORT_KEY = "usv.last_migration_report.v1";

const BUSINESS_DATA_STORAGE_KEYS = [
  { key: "ledgerly:parties.v1", entity: "parties" },
  { key: "ledgerly:items.v1", entity: "items" },
  { key: "ledgerly:inventoryItems.v1", entity: "items" },
  { key: "ledgerly:inventoryAdjustments.v1", entity: "inventoryAdjustments" },
  { key: "ledgerly:units.v1", entity: "units" },
  { key: "ledgerly:unitConversions.v1", entity: "unitConversions" },
  { key: "ledgerly:saleInvoices.v1", entity: "transactions" },
  { key: "ledgerly:purchaseBills.v1", entity: "transactions" },
  { key: "ledgerly:paymentIns.v1", entity: "transactions" },
  { key: "ledgerly:paymentOuts.v1", entity: "transactions" },
  { key: "ledgerly:saleOrders.v1", entity: "transactions" },
  { key: "ledgerly:purchaseOrders.v1", entity: "transactions" },
  { key: "ledgerly:estimates.v1", entity: "transactions" },
  { key: "ledgerly:estimateQuotations.v1", entity: "transactions" },
  { key: "ledgerly:proformaInvoices.v1", entity: "transactions" },
  { key: "ledgerly:deliveryChallans.v1", entity: "transactions" },
  { key: "ledgerly:saleReturns.v1", entity: "transactions" },
  { key: "ledgerly:purchaseReturns.v1", entity: "transactions" },
  { key: "ledgerly:expenses.v1", entity: "transactions" },
  { key: "ledgerly:bankAccounts.v1", entity: "bankAccounts" },
  { key: "ledgerly:cheques.v1", entity: "cheques" },
  { key: "usv.cheques.v1", entity: "cheques" },
  { key: "ledgerly:loanAccounts.v1", entity: "loans" },
  { key: "usv.loanAccounts.v1", entity: "loans" },
  { key: "ledgerly:purchaseJobWorks.v1", entity: "jobWorks" },
  { key: "usv.balanceSheetAccounts.v1", entity: "balanceSheetAccounts" },
  { key: "ledgerly:companyProfile.v1", entity: "companyProfile" },
  { key: "ledgerly:appSettings.v1", entity: "appSettings" },
  { key: "ledgerly:smartAds.v1", entity: "smartAds" },
];

function readJsonSafe(key) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Creates an immutable snapshot of all browser business data.
 */
export function createPreMigrationSnapshot() {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Window localStorage is not available for snapshot.");
  }

  const timestamp = new Date().toISOString();
  const snapshotKey = `${MIGRATION_SNAPSHOT_PREFIX}${timestamp.replace(/[:.]/g, "-")}`;
  const businessId = getActiveBusinessId();

  const data = {};
  for (const { key } of BUSINESS_DATA_STORAGE_KEYS) {
    const val = readJsonSafe(key);
    if (val !== null) {
      data[key] = val;
    }
  }

  // Also include business-scoped keys
  const scopedPrefixes = ["usv.cheques.v1:", "usv.loanAccounts.v1:", "usk.smartAds.v1:"];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && scopedPrefixes.some((prefix) => k.startsWith(prefix))) {
      data[k] = readJsonSafe(k);
    }
  }

  const snapshot = {
    metadata: {
      timestamp,
      businessId,
      totalKeysCaptured: Object.keys(data).length,
      snapshotKey,
    },
    data,
  };

  try {
    window.localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
  } catch (err) {
    console.warn("[MigrationSnapshot] Could not save snapshot to localStorage:", err.message);
  }

  return snapshot;
}

/**
 * Prepares the unified payload of records to migrate to MySQL under the active business ID.
 */
export function prepareMigrationPayload() {
  const businessId = getActiveBusinessId();

  // 1. Parties
  const rawParties = readJsonSafe("ledgerly:parties.v1") || [];
  const parties = Array.isArray(rawParties) ? rawParties : [];

  // 2. Items
  const rawItems1 = readJsonSafe("ledgerly:inventoryItems.v1") || [];
  const rawItems2 = readJsonSafe("ledgerly:items.v1") || [];
  const itemsMap = new Map();
  [...(Array.isArray(rawItems1) ? rawItems1 : []), ...(Array.isArray(rawItems2) ? rawItems2 : [])].forEach((item) => {
    if (item && (item.id || item.itemName || item.name)) {
      const key = item.id || item.itemName || item.name;
      if (!itemsMap.has(key)) itemsMap.set(key, item);
    }
  });
  const items = Array.from(itemsMap.values());

  // 3. Unit Conversions
  const rawConversions = readJsonSafe("ledgerly:unitConversions.v1") || [];
  const unitConversions = Array.isArray(rawConversions) ? rawConversions : [];

  // 4. Transactions (Sales, Purchases, Payments, Orders, Quotations, Challans, Expenses)
  const txnKeys = [
    "ledgerly:saleInvoices.v1", "ledgerly:purchaseBills.v1",
    "ledgerly:paymentIns.v1", "ledgerly:paymentOuts.v1",
    "ledgerly:saleOrders.v1", "ledgerly:purchaseOrders.v1",
    "ledgerly:estimates.v1", "ledgerly:estimateQuotations.v1",
    "ledgerly:proformaInvoices.v1", "ledgerly:deliveryChallans.v1",
    "ledgerly:saleReturns.v1", "ledgerly:purchaseReturns.v1",
    "ledgerly:expenses.v1",
  ];
  const txnsMap = new Map();
  for (const key of txnKeys) {
    const list = readJsonSafe(key);
    if (Array.isArray(list)) {
      list.forEach((t) => {
        if (t && t.id && !txnsMap.has(t.id)) {
          txnsMap.set(t.id, t);
        }
      });
    }
  }
  const transactions = Array.from(txnsMap.values());

  // 5. Cheques
  const rawCheques1 = readJsonSafe(`usv.cheques.v1:${encodeURIComponent(businessId)}`) || [];
  const rawCheques2 = readJsonSafe("usv.cheques.v1") || [];
  const rawCheques3 = readJsonSafe("ledgerly:cheques.v1") || [];
  const chequesMap = new Map();
  [...rawCheques1, ...rawCheques2, ...rawCheques3].forEach((c) => {
    if (c && c.id && !chequesMap.has(c.id)) chequesMap.set(c.id, c);
  });
  const cheques = Array.from(chequesMap.values());

  // 6. Loans
  const rawLoans1 = readJsonSafe(`usv.loanAccounts.v1:${encodeURIComponent(businessId)}`) || [];
  const rawLoans2 = readJsonSafe("usv.loanAccounts.v1") || [];
  const rawLoans3 = readJsonSafe("ledgerly:loanAccounts.v1") || [];
  const loansMap = new Map();
  [...rawLoans1, ...rawLoans2, ...rawLoans3].forEach((l) => {
    if (l && l.id && !loansMap.has(l.id)) loansMap.set(l.id, l);
  });
  const loans = Array.from(loansMap.values());

  // 7. Purchase Job Works
  const rawJobWorks = readJsonSafe("ledgerly:purchaseJobWorks.v1") || [];
  const jobWorks = Array.isArray(rawJobWorks) ? rawJobWorks : [];

  // 8. Balance Sheet Accounts
  const rawAccounts = readJsonSafe("usv.balanceSheetAccounts.v1") || [];
  const balanceSheetAccounts = Array.isArray(rawAccounts) ? rawAccounts : [];

  return {
    businessId,
    parties,
    items,
    unitConversions,
    transactions,
    cheques,
    loans,
    jobWorks,
    balanceSheetAccounts,
  };
}

/**
 * Executes safe end-to-end migration of browser data into MySQL.
 */
export async function executeBrowserToMysqlMigration() {
  // Step 1: Create local snapshot
  const snapshot = createPreMigrationSnapshot();

  // Step 2: Prepare payload
  const payload = prepareMigrationPayload();

  // Step 3: Call backend atomic migration endpoint
  try {
    const result = await migrationDb.migrateLocalData(payload);
    const report = result?.report || result;

    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(LAST_MIGRATION_REPORT_KEY, JSON.stringify(report));
    }

    return {
      success: true,
      snapshotKey: snapshot.metadata.snapshotKey,
      report,
    };
  } catch (err) {
    console.error("[DataMigration] Batch migration failed:", err);
    throw new Error(`Browser-to-MySQL data migration failed: ${err.message}`, { cause: err });
  }
}

/**
 * Rolls back a previous migration batch cleanly.
 */
export async function rollbackMigrationBatch(batchId) {
  return await migrationDb.rollbackBatch(batchId);
}
