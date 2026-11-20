/**
 * USV — Bank Accounts EAV-to-Relational Production Migration Script
 * 
 * Objective:
 * Migrates existing EAV Bank Accounts and Bank Transactions from:
 *   - business_growth_records
 *   - business_growth_record_fields
 * into normalized relational tables:
 *   - bank_accounts
 *   - bank_transactions
 * 
 * Safety & Invariant Guarantees:
 * 1. Read-only against EAV: Zero DELETE, UPDATE, or ALTER operations on source EAV tables.
 * 2. Idempotent: Never overwrites existing relational records. Skips already-migrated IDs.
 * 3. Strict Financial Integrity: Invalid amounts, malformed dates, or orphaned records are skipped and reported. Never invented or clamped.
 * 4. Atomic: Operations run inside a database transaction; rolls back safely on unexpected errors.
 * 5. Isolated Balance Recalculation: Only accounts inserted in this migration run have their current_balance recalculated.
 * 
 * Execution:
 *   node server/scripts/migrateBankAccountsFromEav.js
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/mysql.js";

// Reconstructs nested/flattened EAV fields into an object
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
 * Runs the EAV to Relational Bank Accounts Migration.
 * 
 * @param {object} [dbPool] - Optional MySQL connection pool.
 * @returns {Promise<object>} Detailed migration result report.
 */
export async function migrateBankAccountsFromEav(dbPool = pool) {
  const report = {
    timestamp: new Date().toISOString(),
    sourceAccountsFound: 0,
    sourceTransactionsFound: 0,
    accountsInserted: 0,
    accountsSkipped: 0,
    transactionsInserted: 0,
    transactionsSkipped: 0,
    invalidAccounts: [],
    invalidTransactions: [],
    orphanedTransactions: [],
    reconciledBalances: {},
    finalRelationalCounts: { accounts: 0, transactions: 0 },
    errors: [],
  };

  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Query Existing Relational IDs
    const [existingRelAccounts] = await connection.query(
      "SELECT id, business_id, account_name, opening_balance, current_balance, status FROM bank_accounts"
    );
    const existingRelAccountIds = new Set(existingRelAccounts.map((a) => a.id));

    const [existingRelTxns] = await connection.query(
      "SELECT id, business_id, account_id, type, amount, transaction_date FROM bank_transactions"
    );
    const existingRelTxnIds = new Set(existingRelTxns.map((t) => t.id));

    // 2. Fetch EAV Bank Accounts
    const [eavAccountHeaders] = await connection.query(
      "SELECT business_id, resource, record_id, created_at, updated_at FROM business_growth_records WHERE resource = 'bank-accounts' ORDER BY created_at ASC"
    );
    report.sourceAccountsFound = eavAccountHeaders.length;

    const newlyInsertedAccountIds = new Set();
    const accountsForBalanceReconciliation = new Map();

    if (eavAccountHeaders.length > 0) {
      const [accountFieldRows] = await connection.query(
        "SELECT record_id, field_path, parent_path, field_name, ordinal, value_type, value_text, value_number, value_boolean FROM business_growth_record_fields WHERE resource = 'bank-accounts' ORDER BY record_id, CHAR_LENGTH(field_path), ordinal"
      );

      const fieldsByRecord = new Map();
      for (const f of accountFieldRows) {
        if (!fieldsByRecord.has(f.record_id)) fieldsByRecord.set(f.record_id, []);
        fieldsByRecord.get(f.record_id).push(f);
      }

      for (const header of eavAccountHeaders) {
        // Skip if already in relational bank_accounts (preserve existing data)
        if (existingRelAccountIds.has(header.record_id)) {
          report.accountsSkipped++;
          continue;
        }

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

        // Validate account
        const validationErrors = validateAccountFields(accountRecord);
        if (validationErrors.length > 0) {
          report.invalidAccounts.push({ id: header.record_id, errors: validationErrors, raw: accountRecord });
          report.accountsSkipped++;
          continue;
        }

        // Insert into relational bank_accounts
        const openingBalNum = Number(accountRecord.openingBalance);
        await connection.query(
          `INSERT INTO bank_accounts (
            id, business_id, account_name, account_holder_name, account_number,
            bank_name, ifsc_code, branch_name, opening_balance, current_balance,
            account_type, as_of_date, notes, status, is_default, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            accountRecord.id,
            accountRecord.businessId,
            accountRecord.accountName.trim(),
            accountRecord.accountHolderName ? accountRecord.accountHolderName.trim() : null,
            String(accountRecord.accountNumber).replace(/\s/g, ""),
            accountRecord.bankName ? accountRecord.bankName.trim() : null,
            accountRecord.ifsc ? String(accountRecord.ifsc).trim().toUpperCase() : null,
            accountRecord.branch ? accountRecord.branch.trim() : null,
            openingBalNum,
            openingBalNum, // initial current_balance set to opening_balance before txns
            restored.accountType || "Savings",
            accountRecord.openingBalanceDate,
            accountRecord.notes ? accountRecord.notes.trim() : null,
            accountRecord.status === "inactive" ? "inactive" : "active",
            accountRecord.isDefault ? 1 : 0,
            accountRecord.createdAt,
            accountRecord.updatedAt,
          ]
        );

        report.accountsInserted++;
        newlyInsertedAccountIds.add(accountRecord.id);
        accountsForBalanceReconciliation.set(accountRecord.id, {
          accountName: accountRecord.accountName.trim(),
          openingBalance: Math.round(openingBalNum * 100),
          totalMoneyIn: 0,
          totalMoneyOut: 0,
          finalBalance: 0,
        });
      }
    }

    // Set of all relational account IDs currently in database (pre-existing + newly inserted)
    const validAccountIds = new Set([...existingRelAccountIds, ...newlyInsertedAccountIds]);

    // 3. Fetch EAV Bank Transactions
    const [eavTxnHeaders] = await connection.query(
      "SELECT business_id, resource, record_id, created_at, updated_at FROM business_growth_records WHERE resource = 'bank-transactions' ORDER BY created_at ASC"
    );
    report.sourceTransactionsFound = eavTxnHeaders.length;

    if (eavTxnHeaders.length > 0) {
      const [txnFieldRows] = await connection.query(
        "SELECT record_id, field_path, parent_path, field_name, ordinal, value_type, value_text, value_number, value_boolean FROM business_growth_record_fields WHERE resource = 'bank-transactions' ORDER BY record_id, CHAR_LENGTH(field_path), ordinal"
      );

      const fieldsByRecord = new Map();
      for (const f of txnFieldRows) {
        if (!fieldsByRecord.has(f.record_id)) fieldsByRecord.set(f.record_id, []);
        fieldsByRecord.get(f.record_id).push(f);
      }

      for (const header of eavTxnHeaders) {
        // Skip if already in relational bank_transactions (preserve existing data)
        if (existingRelTxnIds.has(header.record_id)) {
          report.transactionsSkipped++;
          continue;
        }

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

        // Validate transaction
        const validationErrors = validateTransactionFields(txnRecord);
        if (validationErrors.length > 0) {
          report.invalidTransactions.push({ id: header.record_id, errors: validationErrors, raw: txnRecord });
          report.transactionsSkipped++;
          continue;
        }

        // Verify that target bank account exists in relational bank_accounts
        if (!validAccountIds.has(txnRecord.accountId)) {
          report.orphanedTransactions.push({
            id: header.record_id,
            targetAccountId: txnRecord.accountId,
            reason: "Target account does not exist in relational bank_accounts.",
          });
          report.transactionsSkipped++;
          continue;
        }

        const amountNum = Number(txnRecord.amount);
        await connection.query(
          `INSERT INTO bank_transactions (
            id, business_id, account_id, type, amount,
            transaction_date, reference, description, related_party, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            txnRecord.id,
            txnRecord.businessId,
            txnRecord.accountId,
            txnRecord.type,
            amountNum,
            txnRecord.date,
            txnRecord.reference ? txnRecord.reference.trim() : null,
            txnRecord.description.trim(),
            txnRecord.relatedParty ? txnRecord.relatedParty.trim() : null,
            txnRecord.createdAt,
          ]
        );

        report.transactionsInserted++;

        // If target account was inserted in this migration run, update its balance tracker
        if (accountsForBalanceReconciliation.has(txnRecord.accountId)) {
          const acc = accountsForBalanceReconciliation.get(txnRecord.accountId);
          const amountPaise = Math.round(amountNum * 100);
          if (txnRecord.type === "money-in") {
            acc.totalMoneyIn += amountPaise;
          } else if (txnRecord.type === "money-out") {
            acc.totalMoneyOut += amountPaise;
          }
        }
      }
    }

    // 4. Recalculate Current Balances for Newly Migrated Accounts Only
    // Strategy: Only accounts inserted during this migration batch have their current_balance
    // updated to avoid overwriting or mutating newer data in pre-existing accounts.
    if (newlyInsertedAccountIds.size > 0) {
      for (const [accountId, balanceData] of accountsForBalanceReconciliation.entries()) {
        const finalPaise = balanceData.openingBalance + balanceData.totalMoneyIn - balanceData.totalMoneyOut;
        balanceData.finalBalance = finalPaise / 100;
        balanceData.openingBalance = balanceData.openingBalance / 100;
        balanceData.totalMoneyIn = balanceData.totalMoneyIn / 100;
        balanceData.totalMoneyOut = balanceData.totalMoneyOut / 100;

        await connection.query(
          "UPDATE bank_accounts SET current_balance = ? WHERE id = ?",
          [balanceData.finalBalance, accountId]
        );

        report.reconciledBalances[accountId] = balanceData;
      }
    }

    // 5. Final Relational Counts (Inside transaction before commit)
    const [finalAccRows] = await connection.query("SELECT COUNT(*) as count FROM bank_accounts");
    const [finalTxnRows] = await connection.query("SELECT COUNT(*) as count FROM bank_transactions");
    report.finalRelationalCounts.accounts = Number(finalAccRows[0]?.count || 0);
    report.finalRelationalCounts.transactions = Number(finalTxnRows[0]?.count || 0);

    // Commit Transaction
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    report.errors.push(err.message);
    throw err;
  } finally {
    connection.release();
  }

  return report;
}

/**
 * Formats and prints migration summary report to stdout.
 */
export function printMigrationReport(report) {
  console.log("================================================================================");
  console.log("             USV — BANK ACCOUNTS EAV-TO-RELATIONAL MIGRATION REPORT            ");
  console.log("================================================================================");
  console.log(`Execution Timestamp: ${report.timestamp}`);
  console.log("Transaction Status: COMMITTED (All relational changes persisted safely)\n");

  console.log("--- 1. SOURCE (EAV) COUNTS ---");
  console.log(`  Source EAV Bank Accounts:           ${report.sourceAccountsFound}`);
  console.log(`  Source EAV Bank Transactions:       ${report.sourceTransactionsFound}\n`);

  console.log("--- 2. MIGRATION OPERATIONS ---");
  console.log(`  Accounts Inserted into MySQL:       ${report.accountsInserted}`);
  console.log(`  Accounts Skipped:                   ${report.accountsSkipped}`);
  console.log(`  Transactions Inserted into MySQL:   ${report.transactionsInserted}`);
  console.log(`  Transactions Skipped:               ${report.transactionsSkipped}\n`);

  console.log("--- 3. DATA INTEGRITY & VALIDATION ---");
  console.log(`  Invalid accounts skipped:           ${report.invalidAccounts.length}`);
  console.log(`  Invalid transactions skipped:       ${report.invalidTransactions.length}`);
  console.log(`  Orphaned transactions skipped:      ${report.orphanedTransactions.length}`);

  if (report.invalidAccounts.length > 0) {
    console.log("\n  [!] Invalid Accounts Detail:");
    report.invalidAccounts.forEach((inv) => {
      console.log(`    - Account ID ${inv.id}: ${inv.errors.join("; ")}`);
    });
  }

  if (report.invalidTransactions.length > 0) {
    console.log("\n  [!] Invalid Transactions Detail:");
    report.invalidTransactions.forEach((inv) => {
      console.log(`    - Transaction ID ${inv.id}: ${inv.errors.join("; ")}`);
    });
  }

  if (report.orphanedTransactions.length > 0) {
    console.log("\n  [!] Orphaned Transactions Detail:");
    report.orphanedTransactions.forEach((orphan) => {
      console.log(`    - Transaction ID ${orphan.id} -> Target Account ID: ${orphan.targetAccountId} (Skipped: Not Found)`);
    });
  }

  console.log("\n--- 4. BALANCE RECONCILIATION FOR MIGRATED ACCOUNTS ---");
  const reconciledEntries = Object.entries(report.reconciledBalances);
  if (reconciledEntries.length === 0) {
    console.log("  No newly migrated accounts required balance recalculation.");
  } else {
    for (const [id, acc] of reconciledEntries) {
      console.log(`  Account: ${acc.accountName} (${id})`);
      console.log(`    Opening Balance:  ₹${acc.openingBalance.toFixed(2)}`);
      console.log(`    Money-In:        +₹${acc.totalMoneyIn.toFixed(2)}`);
      console.log(`    Money-Out:       -₹${acc.totalMoneyOut.toFixed(2)}`);
      console.log(`    Current Balance:  ₹${acc.finalBalance.toFixed(2)}`);
    }
  }

  console.log("\n--- 5. FINAL RELATIONAL DATABASE TOTALS ---");
  console.log(`  Total rows in bank_accounts:        ${report.finalRelationalCounts.accounts}`);
  console.log(`  Total rows in bank_transactions:    ${report.finalRelationalCounts.transactions}\n`);

  console.log("--- 6. SUMMARY CONCLUSION ---");
  if (report.sourceAccountsFound === 0 && report.sourceTransactionsFound === 0) {
    console.log("  >>> RESULT: Zero source EAV bank records found in business_growth_records.");
    console.log("  >>> No records needed migration. Database remains in clean relational state.");
  } else {
    console.log(`  >>> RESULT: Successfully migrated ${report.accountsInserted} bank accounts and ${report.transactionsInserted} bank transactions.`);
  }

  if (report.errors.length > 0) {
    console.log("\nErrors encountered:");
    report.errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("================================================================================\n");
}

// CLI Execution entry point
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  migrateBankAccountsFromEav()
    .then((report) => {
      printMigrationReport(report);
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Migration Fatal Error]", err);
      process.exit(1);
    });
}
