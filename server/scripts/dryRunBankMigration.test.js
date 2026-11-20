import test from "node:test";
import assert from "node:assert/strict";
import { runBankMigrationDryRun } from "./dryRunBankMigration.js";

test("dryRunBankMigration handles populated EAV accounts, transactions, edge cases, and balance calculations", async () => {
  // Mock MySQL Pool
  const mockPool = {
    async query(sql, params) {
      if (sql.includes("FROM bank_accounts")) {
        // Return 1 existing relational account
        return [[{ id: "existing-acc-1", business_id: "demo-business", account_name: "Pre-existing Account", opening_balance: "1000.00", current_balance: "1000.00", status: "active" }]];
      }
      if (sql.includes("FROM bank_transactions")) {
        // Return 1 existing relational transaction
        return [[{ id: "existing-txn-1", business_id: "demo-business", account_id: "existing-acc-1", type: "money-in", amount: "500.00", transaction_date: "2026-11-01" }]];
      }
      if (sql.includes("FROM business_growth_records WHERE resource = 'bank-accounts'")) {
        return [[
          { business_id: "demo-business", resource: "bank-accounts", record_id: "existing-acc-1", created_at: "2026-11-01T10:00:00.000Z", updated_at: "2026-11-01T10:00:00.000Z" },
          { business_id: "demo-business", resource: "bank-accounts", record_id: "new-acc-2", created_at: "2026-11-02T10:00:00.000Z", updated_at: "2026-11-02T10:00:00.000Z" },
          { business_id: "demo-business", resource: "bank-accounts", record_id: "invalid-acc-3", created_at: "2026-11-03T10:00:00.000Z", updated_at: "2026-11-03T10:00:00.000Z" },
        ]];
      }
      if (sql.includes("FROM business_growth_record_fields WHERE resource = 'bank-accounts'")) {
        return [[
          // Fields for existing-acc-1
          { record_id: "existing-acc-1", field_path: "/accountName", parent_path: "", field_name: "accountName", ordinal: 0, value_type: "string", value_text: "Pre-existing Account", value_number: null, value_boolean: null },
          { record_id: "existing-acc-1", field_path: "/bankName", parent_path: "", field_name: "bankName", ordinal: 1, value_type: "string", value_text: "HDFC Bank", value_number: null, value_boolean: null },
          { record_id: "existing-acc-1", field_path: "/accountNumber", parent_path: "", field_name: "accountNumber", ordinal: 2, value_type: "string", value_text: "1234567890", value_number: null, value_boolean: null },
          { record_id: "existing-acc-1", field_path: "/openingBalance", parent_path: "", field_name: "openingBalance", ordinal: 3, value_type: "number", value_text: null, value_number: 1000, value_boolean: null },
          { record_id: "existing-acc-1", field_path: "/openingBalanceDate", parent_path: "", field_name: "openingBalanceDate", ordinal: 4, value_type: "string", value_text: "2026-11-01", value_number: null, value_boolean: null },
          { record_id: "existing-acc-1", field_path: "/status", parent_path: "", field_name: "status", ordinal: 5, value_type: "string", value_text: "active", value_number: null, value_boolean: null },

          // Fields for new-acc-2 (Valid account to migrate)
          { record_id: "new-acc-2", field_path: "/accountName", parent_path: "", field_name: "accountName", ordinal: 0, value_type: "string", value_text: "Current Operations", value_number: null, value_boolean: null },
          { record_id: "new-acc-2", field_path: "/bankName", parent_path: "", field_name: "bankName", ordinal: 1, value_type: "string", value_text: "ICICI Bank", value_number: null, value_boolean: null },
          { record_id: "new-acc-2", field_path: "/accountNumber", parent_path: "", field_name: "accountNumber", ordinal: 2, value_type: "string", value_text: "987654321012", value_number: null, value_boolean: null },
          { record_id: "new-acc-2", field_path: "/openingBalance", parent_path: "", field_name: "openingBalance", ordinal: 3, value_type: "number", value_text: null, value_number: 5000, value_boolean: null },
          { record_id: "new-acc-2", field_path: "/openingBalanceDate", parent_path: "", field_name: "openingBalanceDate", ordinal: 4, value_type: "string", value_text: "2026-11-02", value_number: null, value_boolean: null },
          { record_id: "new-acc-2", field_path: "/status", parent_path: "", field_name: "status", ordinal: 5, value_type: "string", value_text: "active", value_number: null, value_boolean: null },

          // Fields for invalid-acc-3 (Missing bankName, invalid account number)
          { record_id: "invalid-acc-3", field_path: "/accountName", parent_path: "", field_name: "accountName", ordinal: 0, value_type: "string", value_text: "Broken Account", value_number: null, value_boolean: null },
          { record_id: "invalid-acc-3", field_path: "/accountNumber", parent_path: "", field_name: "accountNumber", ordinal: 1, value_type: "string", value_text: "123", value_number: null, value_boolean: null },
          { record_id: "invalid-acc-3", field_path: "/openingBalance", parent_path: "", field_name: "openingBalance", ordinal: 2, value_type: "number", value_text: null, value_number: -50, value_boolean: null },
          { record_id: "invalid-acc-3", field_path: "/openingBalanceDate", parent_path: "", field_name: "openingBalanceDate", ordinal: 3, value_type: "string", value_text: "invalid-date", value_number: null, value_boolean: null },
        ]];
      }
      if (sql.includes("FROM business_growth_records WHERE resource = 'bank-transactions'")) {
        return [[
          // Existing txn
          { business_id: "demo-business", resource: "bank-transactions", record_id: "existing-txn-1", created_at: "2026-11-02T10:00:00.000Z", updated_at: "2026-11-02T10:00:00.000Z" },
          // Valid txn for new-acc-2 (money-in)
          { business_id: "demo-business", resource: "bank-transactions", record_id: "new-txn-2", created_at: "2026-11-03T10:00:00.000Z", updated_at: "2026-11-03T10:00:00.000Z" },
          // Valid txn for new-acc-2 (money-out)
          { business_id: "demo-business", resource: "bank-transactions", record_id: "new-txn-3", created_at: "2026-11-04T10:00:00.000Z", updated_at: "2026-11-04T10:00:00.000Z" },
          // Orphaned txn (target account does not exist)
          { business_id: "demo-business", resource: "bank-transactions", record_id: "orphan-txn-4", created_at: "2026-11-05T10:00:00.000Z", updated_at: "2026-11-05T10:00:00.000Z" },
          // Invalid txn (amount <= 0)
          { business_id: "demo-business", resource: "bank-transactions", record_id: "invalid-txn-5", created_at: "2026-11-06T10:00:00.000Z", updated_at: "2026-11-06T10:00:00.000Z" },
        ]];
      }
      if (sql.includes("FROM business_growth_record_fields WHERE resource = 'bank-transactions'")) {
        return [[
          // existing-txn-1
          { record_id: "existing-txn-1", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "existing-acc-1" },
          { record_id: "existing-txn-1", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-in" },
          { record_id: "existing-txn-1", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: 500 },
          { record_id: "existing-txn-1", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-01" },
          { record_id: "existing-txn-1", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Old deposit" },

          // new-txn-2 (money-in: 1500.50 into new-acc-2)
          { record_id: "new-txn-2", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "new-acc-2" },
          { record_id: "new-txn-2", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-in" },
          { record_id: "new-txn-2", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: 1500.50 },
          { record_id: "new-txn-2", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-03" },
          { record_id: "new-txn-2", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Customer deposit" },

          // new-txn-3 (money-out: 250.25 from new-acc-2)
          { record_id: "new-txn-3", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "new-acc-2" },
          { record_id: "new-txn-3", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-out" },
          { record_id: "new-txn-3", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: 250.25 },
          { record_id: "new-txn-3", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-04" },
          { record_id: "new-txn-3", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Vendor payment" },

          // orphan-txn-4 (accountId does not exist)
          { record_id: "orphan-txn-4", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "non-existent-account" },
          { record_id: "orphan-txn-4", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-in" },
          { record_id: "orphan-txn-4", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: 999 },
          { record_id: "orphan-txn-4", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-05" },
          { record_id: "orphan-txn-4", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Orphaned deposit" },

          // invalid-txn-5 (amount is negative, type is invalid)
          { record_id: "invalid-txn-5", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "new-acc-2" },
          { record_id: "invalid-txn-5", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "unknown-type" },
          { record_id: "invalid-txn-5", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: -100 },
          { record_id: "invalid-txn-5", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "bad-date" },
          { record_id: "invalid-txn-5", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "" },
        ]];
      }
      return [[]];
    }
  };

  const report = await runBankMigrationDryRun(mockPool);

  // Assert counts
  assert.equal(report.eavAccountsFound, 3);
  assert.equal(report.eavTransactionsFound, 5);
  assert.equal(report.relationalAccountsExisting, 1);
  assert.equal(report.relationalTransactionsExisting, 1);

  // Assert eligibility
  assert.equal(report.accountsEligibleForMigration.length, 1);
  assert.equal(report.accountsEligibleForMigration[0].id, "new-acc-2");

  assert.equal(report.accountsSkippedAlreadyExisting.length, 1);
  assert.equal(report.accountsSkippedAlreadyExisting[0].id, "existing-acc-1");

  assert.equal(report.transactionsEligibleForMigration.length, 2);
  assert.deepEqual(report.transactionsEligibleForMigration.map((t) => t.id), ["new-txn-2", "new-txn-3"]);

  assert.equal(report.transactionsSkippedAlreadyExisting.length, 1);
  assert.equal(report.transactionsSkippedAlreadyExisting[0].id, "existing-txn-1");

  assert.equal(report.orphanedTransactions.length, 1);
  assert.equal(report.orphanedTransactions[0].id, "orphan-txn-4");
  assert.equal(report.orphanedTransactions[0].targetAccountId, "non-existent-account");

  // Assert invalid records
  assert.equal(report.invalidAccounts.length, 1);
  assert.equal(report.invalidAccounts[0].id, "invalid-acc-3");

  assert.equal(report.invalidTransactions.length, 1);
  assert.equal(report.invalidTransactions[0].id, "invalid-txn-5");

  // Assert balance calculation:
  // new-acc-2 opening: 5000.00, in: 1500.50, out: 250.25 -> expected: 6250.25
  const newAccBalance = report.expectedBalances["new-acc-2"];
  assert.ok(newAccBalance);
  assert.equal(newAccBalance.openingBalance, 5000);
  assert.equal(newAccBalance.totalMoneyIn, 1500.5);
  assert.equal(newAccBalance.totalMoneyOut, 250.25);
  assert.equal(newAccBalance.expectedBalance, 6250.25);
});
