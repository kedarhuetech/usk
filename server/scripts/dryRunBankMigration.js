/**
 * USV — Bank Accounts EAV-to-Relational Migration Dry-Run Utility
 * 
 * STRICT SAFETY RULES:
 * - READ ONLY: Executes SELECT queries ONLY.
 * - Zero INSERT, UPDATE, DELETE, ALTER, DROP, or write operations.
 * - Does not modify existing database state.
 * - Inspects and validates existing EAV records against relational constraints.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/mysql.js";

// Helper to reconstruct EAV records from flattened field rows
function restoreRecord(rows) {
  const root = {};
  const containers = new Map([["", root]]);
  const ordered = [...rows].sort((a, b) => a.field_path.length - b.field_path.length || a.ordinal - b.ordinal);
  for (const row of ordered) {
    let value;
    switch (row.value_type) {
      case "object": value = {}; break;
      case "array": value = []; break;
      case "number": value = row.value_number === null ? 0 : Number(row.value_number); break;
      case "boolean": value = Boolean(row.value_boolean); break;
      case "null": value = null; break;
      default: value = row.value_text ?? "";
    }
    const parent = containers.get(row.parent_path) || root;
    if (Array.isArray(parent)) parent[Number(row.field_name)] = value;
    else parent[row.field_name] = value;
    if (row.value_type === "object" || row.value_type === "array") containers.set(row.field_path, value);
  }
  return root;
}

function isValidIsoDate(value) {
  const dateStr = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateStr;
}

function validateAccountFields(account) {
  const errors = [];
  if (!String(account.accountName || "").trim()) {
    errors.push("Missing required field: accountName");
  } else if (account.accountName.trim().length > 120) {
    errors.push("accountName exceeds maximum length of 120 characters");
  }

  if (!String(account.bankName || "").trim()) {
    errors.push("Missing required field: bankName");
  } else if (account.bankName.trim().length > 120) {
    errors.push("bankName exceeds maximum length of 120 characters");
  }

  const cleanAccNum = String(account.accountNumber || "").replace(/\s/g, "");
  if (!cleanAccNum) {
    errors.push("Missing required field: accountNumber");
  } else if (!/^\d{6,20}$/.test(cleanAccNum)) {
    errors.push(`Invalid accountNumber: "${cleanAccNum}" (must be 6 to 20 digits)`);
  }

  const rawOpening = account.openingBalance;
  const openingNum = Number(rawOpening);
  if (rawOpening === undefined || rawOpening === null || rawOpening === "") {
    errors.push("Missing required field: openingBalance");
  } else if (!Number.isFinite(openingNum) || openingNum < 0) {
    errors.push(`Invalid openingBalance: "${rawOpening}" (must be a finite number >= 0)`);
  }

  if (!account.openingBalanceDate) {
    errors.push("Missing required field: openingBalanceDate");
  } else if (!isValidIsoDate(account.openingBalanceDate)) {
    errors.push(`Invalid openingBalanceDate format: "${account.openingBalanceDate}" (expected YYYY-MM-DD)`);
  }

  if (account.status && !["active", "inactive"].includes(account.status)) {
    errors.push(`Invalid status: "${account.status}" (must be 'active' or 'inactive')`);
  }

  if (account.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(account.ifsc).trim().toUpperCase())) {
    errors.push(`Invalid IFSC code: "${account.ifsc}" (must match standard 11-char format)`);
  }

  return errors;
}

function validateTransactionFields(txn) {
  const errors = [];
  if (!String(txn.accountId || "").trim()) {
    errors.push("Missing required field: accountId");
  }

  if (!["money-in", "money-out"].includes(txn.type)) {
    errors.push(`Invalid transaction type: "${txn.type}" (must be 'money-in' or 'money-out')`);
  }

  const rawAmount = txn.amount;
  const amountNum = Number(rawAmount);
  if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
    errors.push("Missing required field: amount");
  } else if (!Number.isFinite(amountNum) || amountNum <= 0) {
    errors.push(`Invalid transaction amount: "${rawAmount}" (must be a finite number > 0)`);
  }

  if (!txn.date) {
    errors.push("Missing required field: date");
  } else if (!isValidIsoDate(txn.date)) {
    errors.push(`Invalid transaction date format: "${txn.date}" (expected YYYY-MM-DD)`);
  }

  if (!String(txn.description || "").trim()) {
    errors.push("Missing required field: description");
  } else if (txn.description.trim().length > 240) {
    errors.push("description exceeds maximum length of 240 characters");
  }

  return errors;
}

/**
 * Executes a read-only dry run of the EAV to Relational Bank Migration.
 * 
 * @param {object} [dbPool] - Optional MySQL connection pool.
 * @returns {Promise<object>} Structured dry run migration report.
 */
export async function runBankMigrationDryRun(dbPool = pool) {
  const report = {
    timestamp: new Date().toISOString(),
    eavAccountsFound: 0,
    eavTransactionsFound: 0,
    relationalAccountsExisting: 0,
    relationalTransactionsExisting: 0,
    accountsEligibleForMigration: [],
    accountsSkippedAlreadyExisting: [],
    transactionsEligibleForMigration: [],
    transactionsSkippedAlreadyExisting: [],
    orphanedTransactions: [],
    invalidAccounts: [],
    invalidTransactions: [],
    expectedBalances: {},
    warnings: [],
  };

  // 1. Fetch Existing Relational Records (READ ONLY)
  const [existingRelAccounts] = await dbPool.query(
    "SELECT id, business_id, account_name, opening_balance, current_balance, status FROM bank_accounts"
  );
  report.relationalAccountsExisting = existingRelAccounts.length;
  const existingRelAccountIds = new Set(existingRelAccounts.map((a) => a.id));

  const [existingRelTxns] = await dbPool.query(
    "SELECT id, business_id, account_id, type, amount, transaction_date FROM bank_transactions"
  );
  report.relationalTransactionsExisting = existingRelTxns.length;
  const existingRelTxnIds = new Set(existingRelTxns.map((t) => t.id));

  // 2. Fetch EAV Bank Accounts (READ ONLY)
  const [eavAccountHeaders] = await dbPool.query(
    "SELECT business_id, resource, record_id, created_at, updated_at FROM business_growth_records WHERE resource = 'bank-accounts' ORDER BY created_at ASC"
  );
  report.eavAccountsFound = eavAccountHeaders.length;

  const restoredAccounts = new Map();

  if (eavAccountHeaders.length > 0) {
    const [accountFieldRows] = await dbPool.query(
      "SELECT record_id, field_path, parent_path, field_name, ordinal, value_type, value_text, value_number, value_boolean FROM business_growth_record_fields WHERE resource = 'bank-accounts' ORDER BY record_id, CHAR_LENGTH(field_path), ordinal"
    );

    const fieldsByRecord = new Map();
    for (const f of accountFieldRows) {
      if (!fieldsByRecord.has(f.record_id)) fieldsByRecord.set(f.record_id, []);
      fieldsByRecord.get(f.record_id).push(f);
    }

    for (const header of eavAccountHeaders) {
      const fieldRows = fieldsByRecord.get(header.record_id) || [];
      const restored = restoreRecord(fieldRows);
      const accountRecord = {
        id: header.record_id,
        businessId: header.business_id,
        accountName: restored.accountName,
        accountHolderName: restored.accountHolderName || null,
        accountNumber: restored.accountNumber,
        bankName: restored.bankName,
        ifsc: restored.ifsc || null,
        branch: restored.branch || null,
        openingBalance: restored.openingBalance,
        openingBalanceDate: restored.openingBalanceDate,
        notes: restored.notes || null,
        status: restored.status || "active",
        isDefault: Boolean(restored.isDefault),
        createdAt: header.created_at,
        updatedAt: header.updated_at,
      };

      restoredAccounts.set(header.record_id, accountRecord);

      // Check validation
      const validationErrors = validateAccountFields(accountRecord);
      if (validationErrors.length > 0) {
        report.invalidAccounts.push({ id: header.record_id, errors: validationErrors, raw: accountRecord });
      }

      // Check if already in relational
      if (existingRelAccountIds.has(header.record_id)) {
        report.accountsSkippedAlreadyExisting.push({ id: header.record_id, reason: "Account ID already exists in bank_accounts" });
      } else if (validationErrors.length === 0) {
        report.accountsEligibleForMigration.push(accountRecord);
      }
    }
  }

  // Set of all available account IDs (migrated + already existing in relational)
  const allKnownAccountIds = new Set([
    ...existingRelAccountIds,
    ...report.accountsEligibleForMigration.map((a) => a.id),
  ]);

  // 3. Fetch EAV Bank Transactions (READ ONLY)
  const [eavTxnHeaders] = await dbPool.query(
    "SELECT business_id, resource, record_id, created_at, updated_at FROM business_growth_records WHERE resource = 'bank-transactions' ORDER BY created_at ASC"
  );
  report.eavTransactionsFound = eavTxnHeaders.length;

  if (eavTxnHeaders.length > 0) {
    const [txnFieldRows] = await dbPool.query(
      "SELECT record_id, field_path, parent_path, field_name, ordinal, value_type, value_text, value_number, value_boolean FROM business_growth_record_fields WHERE resource = 'bank-transactions' ORDER BY record_id, CHAR_LENGTH(field_path), ordinal"
    );

    const fieldsByRecord = new Map();
    for (const f of txnFieldRows) {
      if (!fieldsByRecord.has(f.record_id)) fieldsByRecord.set(f.record_id, []);
      fieldsByRecord.get(f.record_id).push(f);
    }

    for (const header of eavTxnHeaders) {
      const fieldRows = fieldsByRecord.get(header.record_id) || [];
      const restored = restoreRecord(fieldRows);
      const txnRecord = {
        id: header.record_id,
        businessId: header.business_id,
        accountId: restored.accountId,
        type: restored.type,
        amount: restored.amount,
        date: restored.date,
        reference: restored.reference || null,
        description: restored.description,
        relatedParty: restored.relatedParty || null,
        createdAt: header.created_at,
      };

      // Check validation
      const validationErrors = validateTransactionFields(txnRecord);
      if (validationErrors.length > 0) {
        report.invalidTransactions.push({ id: header.record_id, errors: validationErrors, raw: txnRecord });
      }

      // Check for orphan (account does not exist in relational nor in eligible migration accounts)
      if (!allKnownAccountIds.has(txnRecord.accountId)) {
        report.orphanedTransactions.push({
          id: header.record_id,
          targetAccountId: txnRecord.accountId,
          reason: "Target bank account does not exist in bank_accounts nor in migrated EAV accounts.",
        });
      }

      // Check if already in relational
      if (existingRelTxnIds.has(header.record_id)) {
        report.transactionsSkippedAlreadyExisting.push({ id: header.record_id, reason: "Transaction ID already exists in bank_transactions" });
      } else if (validationErrors.length === 0 && allKnownAccountIds.has(txnRecord.accountId)) {
        report.transactionsEligibleForMigration.push(txnRecord);
      }
    }
  }

  // 4. Calculate Expected Balances
  // Track accounts to calculate: eligible accounts + existing relational accounts with new transactions
  const accountBalances = new Map();

  // Populate opening balances from eligible accounts
  for (const acc of report.accountsEligibleForMigration) {
    accountBalances.set(acc.id, {
      accountName: acc.accountName,
      openingBalance: Math.round(Number(acc.openingBalance || 0) * 100),
      totalMoneyIn: 0,
      totalMoneyOut: 0,
      expectedBalance: 0,
    });
  }

  // Populate opening balances from existing relational accounts
  for (const acc of existingRelAccounts) {
    if (!accountBalances.has(acc.id)) {
      accountBalances.set(acc.id, {
        accountName: acc.account_name,
        openingBalance: Math.round(Number(acc.opening_balance || 0) * 100),
        totalMoneyIn: 0,
        totalMoneyOut: 0,
        expectedBalance: 0,
      });
    }
  }

  // Apply eligible transactions
  for (const txn of report.transactionsEligibleForMigration) {
    const acc = accountBalances.get(txn.accountId);
    if (!acc) continue;
    const amountPaise = Math.round(Number(txn.amount || 0) * 100);
    if (txn.type === "money-in") {
      acc.totalMoneyIn += amountPaise;
    } else if (txn.type === "money-out") {
      acc.totalMoneyOut += amountPaise;
    }
  }

  // Format balances back to currency numbers
  for (const [id, acc] of accountBalances.entries()) {
    acc.expectedBalance = (acc.openingBalance + acc.totalMoneyIn - acc.totalMoneyOut) / 100;
    acc.openingBalance = acc.openingBalance / 100;
    acc.totalMoneyIn = acc.totalMoneyIn / 100;
    acc.totalMoneyOut = acc.totalMoneyOut / 100;
    report.expectedBalances[id] = acc;
  }

  // 5. Warnings
  if (report.orphanedTransactions.length > 0) {
    report.warnings.push(`${report.orphanedTransactions.length} transactions reference accounts that do not exist.`);
  }
  if (report.invalidAccounts.length > 0) {
    report.warnings.push(`${report.invalidAccounts.length} EAV account records failed validation.`);
  }
  if (report.invalidTransactions.length > 0) {
    report.warnings.push(`${report.invalidTransactions.length} EAV transaction records failed validation.`);
  }

  return report;
}

/**
 * Formats and prints the dry-run report to stdout.
 */
export function printDryRunSummary(report) {
  console.log("================================================================================");
  console.log("             USV — BANK ACCOUNTS MIGRATION DRY-RUN REPORT                       ");
  console.log("================================================================================");
  console.log(`Execution Timestamp: ${report.timestamp}`);
  console.log("Mode: DRY-RUN ONLY (Zero database writes performed)\n");

  console.log("--- 1. SOURCE (EAV) & TARGET (RELATIONAL) COUNTS ---");
  console.log(`  EAV Bank Accounts found:                  ${report.eavAccountsFound}`);
  console.log(`  EAV Bank Transactions found:              ${report.eavTransactionsFound}`);
  console.log(`  Relational Bank Accounts already present: ${report.relationalAccountsExisting}`);
  console.log(`  Relational Transactions already present:  ${report.relationalTransactionsExisting}\n`);

  console.log("--- 2. MIGRATION ELIGIBILITY PREVIEW ---");
  console.log(`  Accounts eligible for migration:          ${report.accountsEligibleForMigration.length}`);
  console.log(`  Accounts skipped (already in relational): ${report.accountsSkippedAlreadyExisting.length}`);
  console.log(`  Transactions eligible for migration:      ${report.transactionsEligibleForMigration.length}`);
  console.log(`  Transactions skipped (already present):   ${report.transactionsSkippedAlreadyExisting.length}`);
  console.log(`  Orphaned transactions (missing account):  ${report.orphanedTransactions.length}\n`);

  console.log("--- 3. DATA VALIDATION STATUS ---");
  console.log(`  Invalid accounts:                         ${report.invalidAccounts.length}`);
  console.log(`  Invalid transactions:                     ${report.invalidTransactions.length}`);

  if (report.invalidAccounts.length > 0) {
    console.log("\n  [!] Invalid Accounts Detail:");
    report.invalidAccounts.forEach((inv) => {
      console.log(`    - ID ${inv.id}: ${inv.errors.join("; ")}`);
    });
  }

  if (report.invalidTransactions.length > 0) {
    console.log("\n  [!] Invalid Transactions Detail:");
    report.invalidTransactions.forEach((inv) => {
      console.log(`    - ID ${inv.id}: ${inv.errors.join("; ")}`);
    });
  }

  if (report.orphanedTransactions.length > 0) {
    console.log("\n  [!] Orphaned Transactions Detail:");
    report.orphanedTransactions.forEach((orphan) => {
      console.log(`    - Txn ID ${orphan.id} -> Target Account ID ${orphan.targetAccountId} (Not Found)`);
    });
  }

  console.log("\n--- 4. EXPECTED ACCOUNT BALANCES POST-MIGRATION ---");
  const balanceEntries = Object.entries(report.expectedBalances);
  if (balanceEntries.length === 0) {
    console.log("  No accounts to balance.");
  } else {
    for (const [id, acc] of balanceEntries) {
      console.log(`  Account: ${acc.accountName} (${id})`);
      console.log(`    Opening Balance:  ₹${acc.openingBalance.toFixed(2)}`);
      console.log(`    Total Money In:  +₹${acc.totalMoneyIn.toFixed(2)}`);
      console.log(`    Total Money Out: -₹${acc.totalMoneyOut.toFixed(2)}`);
      console.log(`    Expected Balance: ₹${acc.expectedBalance.toFixed(2)}`);
    }
  }

  console.log("\n--- 5. SUMMARY CONCLUSION ---");
  if (report.eavAccountsFound === 0 && report.eavTransactionsFound === 0) {
    console.log("  >>> RESULT: Zero source EAV bank records found.");
    console.log("  >>> No existing data needs migration. Relational schema is clean and ready.");
  } else {
    console.log(`  >>> RESULT: Ready to migrate ${report.accountsEligibleForMigration.length} accounts and ${report.transactionsEligibleForMigration.length} transactions.`);
  }

  if (report.warnings.length > 0) {
    console.log("\nWarnings encountered:");
    report.warnings.forEach((w) => console.log(`  - ${w}`));
  }
  console.log("================================================================================\n");
}

// CLI Execution entry point
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  runBankMigrationDryRun()
    .then((report) => {
      printDryRunSummary(report);
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Dry-Run Fatal Error]", err);
      process.exit(1);
    });
}
