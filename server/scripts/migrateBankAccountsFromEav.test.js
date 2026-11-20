import test from "node:test";
import assert from "node:assert/strict";
import { migrateBankAccountsFromEav } from "./migrateBankAccountsFromEav.js";

function createMockDbPool() {
  const state = {
    bankAccounts: new Map(),
    bankTransactions: new Map(),
    eavRecords: [],
    eavFields: [],
    queriesExecuted: [],
    transactionCommitted: false,
    transactionRolledBack: false,
  };

  const mockConnection = {
    async beginTransaction() {
      state.queriesExecuted.push("BEGIN");
    },
    async commit() {
      state.transactionCommitted = true;
      state.queriesExecuted.push("COMMIT");
    },
    async rollback() {
      state.transactionRolledBack = true;
      state.queriesExecuted.push("ROLLBACK");
    },
    release() {
      state.queriesExecuted.push("RELEASE");
    },
    async query(sql, params) {
      state.queriesExecuted.push({ sql, params });

      // Ensure zero mutation of EAV tables
      assert.doesNotMatch(sql, /DELETE FROM business_growth/i, "Must NEVER delete from business_growth tables");
      assert.doesNotMatch(sql, /UPDATE business_growth/i, "Must NEVER update business_growth tables");
      assert.doesNotMatch(sql, /DROP /i, "Must NEVER drop tables");

      // 1. SELECT existing relational bank_accounts
      if (sql.includes("SELECT id, business_id, account_name, opening_balance, current_balance, status FROM bank_accounts")) {
        return [Array.from(state.bankAccounts.values())];
      }

      // 2. SELECT existing relational bank_transactions
      if (sql.includes("SELECT id, business_id, account_id, type, amount, transaction_date FROM bank_transactions")) {
        return [Array.from(state.bankTransactions.values())];
      }

      // 3. SELECT EAV bank-accounts headers
      if (sql.includes("FROM business_growth_records WHERE resource = 'bank-accounts'")) {
        return [state.eavRecords.filter((r) => r.resource === "bank-accounts")];
      }

      // 4. SELECT EAV bank-accounts fields
      if (sql.includes("FROM business_growth_record_fields WHERE resource = 'bank-accounts'")) {
        return [state.eavFields.filter((f) => f.resource === "bank-accounts")];
      }

      // 5. INSERT into bank_accounts
      if (sql.includes("INSERT INTO bank_accounts")) {
        const [
          id, business_id, account_name, account_holder_name, account_number,
          bank_name, ifsc_code, branch_name, opening_balance, current_balance,
          account_type, as_of_date, notes, status, is_default, created_at, updated_at
        ] = params;
        state.bankAccounts.set(id, {
          id, business_id, account_name, account_holder_name, account_number,
          bank_name, ifsc_code, branch_name, opening_balance, current_balance,
          account_type, as_of_date, notes, status, is_default, created_at, updated_at
        });
        return [{ affectedRows: 1 }];
      }

      // 6. SELECT EAV bank-transactions headers
      if (sql.includes("FROM business_growth_records WHERE resource = 'bank-transactions'")) {
        return [state.eavRecords.filter((r) => r.resource === "bank-transactions")];
      }

      // 7. SELECT EAV bank-transactions fields
      if (sql.includes("FROM business_growth_record_fields WHERE resource = 'bank-transactions'")) {
        return [state.eavFields.filter((f) => f.resource === "bank-transactions")];
      }

      // 8. INSERT into bank_transactions
      if (sql.includes("INSERT INTO bank_transactions")) {
        const [
          id, business_id, account_id, type, amount,
          transaction_date, reference, description, related_party, created_at
        ] = params;
        state.bankTransactions.set(id, {
          id, business_id, account_id, type, amount,
          transaction_date, reference, description, related_party, created_at
        });
        return [{ affectedRows: 1 }];
      }

      // 9. UPDATE bank_accounts SET current_balance = ? WHERE id = ?
      if (sql.includes("UPDATE bank_accounts SET current_balance = ? WHERE id = ?")) {
        const [newBalance, id] = params;
        if (state.bankAccounts.has(id)) {
          state.bankAccounts.get(id).current_balance = newBalance;
        }
        return [{ affectedRows: 1 }];
      }

      // 10. SELECT COUNT(*) as count FROM bank_accounts
      if (sql.includes("COUNT(*) as count FROM bank_accounts")) {
        return [[{ count: state.bankAccounts.size }]];
      }

      // 11. SELECT COUNT(*) as count FROM bank_transactions
      if (sql.includes("COUNT(*) as count FROM bank_transactions")) {
        return [[{ count: state.bankTransactions.size }]];
      }

      return [[]];
    }
  };

  return {
    state,
    async getConnection() {
      return mockConnection;
    }
  };
}

test("migrateBankAccountsFromEav: migrates valid accounts, transactions, calculates balance and commits", async () => {
  const pool = createMockDbPool();

  // Seed sample EAV accounts
  pool.state.eavRecords.push(
    { business_id: "demo-business", resource: "bank-accounts", record_id: "acc_demo_1", created_at: "2026-11-01T10:00:00.000Z", updated_at: "2026-11-01T10:00:00.000Z" }
  );
  pool.state.eavFields.push(
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/accountName", parent_path: "", field_name: "accountName", ordinal: 0, value_type: "string", value_text: "Operational Checking" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/bankName", parent_path: "", field_name: "bankName", ordinal: 1, value_type: "string", value_text: "State Bank of India" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/accountHolderName", parent_path: "", field_name: "accountHolderName", ordinal: 2, value_type: "string", value_text: "Sai Enterprises" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/accountNumber", parent_path: "", field_name: "accountNumber", ordinal: 3, value_type: "string", value_text: "123456789012" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/ifsc", parent_path: "", field_name: "ifsc", ordinal: 4, value_type: "string", value_text: "SBIN0001234" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/branch", parent_path: "", field_name: "branch", ordinal: 5, value_type: "string", value_text: "Main Branch" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/openingBalance", parent_path: "", field_name: "openingBalance", ordinal: 6, value_type: "number", value_number: 10000.00 },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/openingBalanceDate", parent_path: "", field_name: "openingBalanceDate", ordinal: 7, value_type: "string", value_text: "2026-11-01" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/notes", parent_path: "", field_name: "notes", ordinal: 8, value_type: "string", value_text: "Primary business account" },
    { resource: "bank-accounts", record_id: "acc_demo_1", field_path: "/status", parent_path: "", field_name: "status", ordinal: 9, value_type: "string", value_text: "active" }
  );

  // Seed sample EAV transactions: 1 deposit (+2500.50), 1 withdrawal (-500.25)
  pool.state.eavRecords.push(
    { business_id: "demo-business", resource: "bank-transactions", record_id: "tx_1", created_at: "2026-11-02T10:00:00.000Z", updated_at: "2026-11-02T10:00:00.000Z" },
    { business_id: "demo-business", resource: "bank-transactions", record_id: "tx_2", created_at: "2026-11-03T10:00:00.000Z", updated_at: "2026-11-03T10:00:00.000Z" }
  );
  pool.state.eavFields.push(
    { resource: "bank-transactions", record_id: "tx_1", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "acc_demo_1" },
    { resource: "bank-transactions", record_id: "tx_1", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-in" },
    { resource: "bank-transactions", record_id: "tx_1", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: 2500.50 },
    { resource: "bank-transactions", record_id: "tx_1", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-02" },
    { resource: "bank-transactions", record_id: "tx_1", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Customer payment" },

    { resource: "bank-transactions", record_id: "tx_2", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "acc_demo_1" },
    { resource: "bank-transactions", record_id: "tx_2", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-out" },
    { resource: "bank-transactions", record_id: "tx_2", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: 500.25 },
    { resource: "bank-transactions", record_id: "tx_2", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-03" },
    { resource: "bank-transactions", record_id: "tx_2", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Office supplies" }
  );

  const report = await migrateBankAccountsFromEav(pool);

  assert.equal(report.sourceAccountsFound, 1);
  assert.equal(report.accountsInserted, 1);
  assert.equal(report.accountsSkipped, 0);

  assert.equal(report.sourceTransactionsFound, 2);
  assert.equal(report.transactionsInserted, 2);
  assert.equal(report.transactionsSkipped, 0);

  assert.equal(report.invalidAccounts.length, 0);
  assert.equal(report.invalidTransactions.length, 0);
  assert.equal(report.orphanedTransactions.length, 0);

  assert.equal(pool.state.transactionCommitted, true);
  assert.equal(pool.state.transactionRolledBack, false);

  // Verify inserted account details
  const insertedAcc = pool.state.bankAccounts.get("acc_demo_1");
  assert.ok(insertedAcc);
  assert.equal(insertedAcc.account_name, "Operational Checking");
  assert.equal(insertedAcc.bank_name, "State Bank of India");
  assert.equal(insertedAcc.account_holder_name, "Sai Enterprises");
  assert.equal(insertedAcc.account_number, "123456789012");
  assert.equal(insertedAcc.ifsc_code, "SBIN0001234");
  assert.equal(insertedAcc.branch_name, "Main Branch");
  assert.equal(insertedAcc.opening_balance, 10000);
  assert.equal(insertedAcc.notes, "Primary business account");
  assert.equal(insertedAcc.status, "active");

  // Verify balance reconciliation: 10000 + 2500.50 - 500.25 = 12000.25
  assert.equal(insertedAcc.current_balance, 12000.25);
  assert.equal(report.reconciledBalances["acc_demo_1"].finalBalance, 12000.25);
});

test("migrateBankAccountsFromEav: idempotency check — running a second time skips all existing records", async () => {
  const pool = createMockDbPool();

  // Pre-seed relational tables (as if already migrated)
  pool.state.bankAccounts.set("acc_demo_1", {
    id: "acc_demo_1",
    business_id: "demo-business",
    account_name: "Operational Checking",
    opening_balance: 10000,
    current_balance: 12000.25,
    status: "active"
  });
  pool.state.bankTransactions.set("tx_1", {
    id: "tx_1",
    business_id: "demo-business",
    account_id: "acc_demo_1",
    type: "money-in",
    amount: 2500.50,
    transaction_date: "2026-11-02"
  });

  // Source EAV has the same records
  pool.state.eavRecords.push(
    { business_id: "demo-business", resource: "bank-accounts", record_id: "acc_demo_1", created_at: "2026-11-01T10:00:00.000Z", updated_at: "2026-11-01T10:00:00.000Z" },
    { business_id: "demo-business", resource: "bank-transactions", record_id: "tx_1", created_at: "2026-11-02T10:00:00.000Z", updated_at: "2026-11-02T10:00:00.000Z" }
  );

  const report = await migrateBankAccountsFromEav(pool);

  assert.equal(report.sourceAccountsFound, 1);
  assert.equal(report.accountsInserted, 0);
  assert.equal(report.accountsSkipped, 1);

  assert.equal(report.sourceTransactionsFound, 1);
  assert.equal(report.transactionsInserted, 0);
  assert.equal(report.transactionsSkipped, 1);

  // Pre-existing account balance was NOT modified
  assert.equal(pool.state.bankAccounts.get("acc_demo_1").current_balance, 12000.25);
  assert.equal(pool.state.transactionCommitted, true);
});

test("migrateBankAccountsFromEav: skips and reports invalid amounts, dates, and orphaned transactions", async () => {
  const pool = createMockDbPool();

  // Seed 1 valid account and 1 invalid account
  pool.state.eavRecords.push(
    { business_id: "demo-business", resource: "bank-accounts", record_id: "acc_valid", created_at: "2026-11-01T10:00:00.000Z", updated_at: "2026-11-01T10:00:00.000Z" },
    { business_id: "demo-business", resource: "bank-accounts", record_id: "acc_invalid", created_at: "2026-11-01T10:00:00.000Z", updated_at: "2026-11-01T10:00:00.000Z" }
  );

  pool.state.eavFields.push(
    // acc_valid
    { resource: "bank-accounts", record_id: "acc_valid", field_path: "/accountName", field_name: "accountName", ordinal: 0, value_type: "string", value_text: "Valid Bank" },
    { resource: "bank-accounts", record_id: "acc_valid", field_path: "/bankName", field_name: "bankName", ordinal: 1, value_type: "string", value_text: "HDFC" },
    { resource: "bank-accounts", record_id: "acc_valid", field_path: "/accountNumber", field_name: "accountNumber", ordinal: 2, value_type: "string", value_text: "1234567890" },
    { resource: "bank-accounts", record_id: "acc_valid", field_path: "/openingBalance", field_name: "openingBalance", ordinal: 3, value_type: "number", value_number: 500 },
    { resource: "bank-accounts", record_id: "acc_valid", field_path: "/openingBalanceDate", field_name: "openingBalanceDate", ordinal: 4, value_type: "string", value_text: "2026-11-01" },

    // acc_invalid (negative opening balance, missing bank name, bad date)
    { resource: "bank-accounts", record_id: "acc_invalid", field_path: "/accountName", field_name: "accountName", ordinal: 0, value_type: "string", value_text: "Bad Bank" },
    { resource: "bank-accounts", record_id: "acc_invalid", field_path: "/accountNumber", field_name: "accountNumber", ordinal: 1, value_type: "string", value_text: "1234567890" },
    { resource: "bank-accounts", record_id: "acc_invalid", field_path: "/openingBalance", field_name: "openingBalance", ordinal: 2, value_type: "number", value_number: -500 },
    { resource: "bank-accounts", record_id: "acc_invalid", field_path: "/openingBalanceDate", field_name: "openingBalanceDate", ordinal: 3, value_type: "string", value_text: "invalid-date" }
  );

  // Seed 1 orphaned transaction (account does not exist) and 1 invalid transaction (negative amount)
  pool.state.eavRecords.push(
    { business_id: "demo-business", resource: "bank-transactions", record_id: "tx_orphan", created_at: "2026-11-02T10:00:00.000Z", updated_at: "2026-11-02T10:00:00.000Z" },
    { business_id: "demo-business", resource: "bank-transactions", record_id: "tx_invalid", created_at: "2026-11-02T10:00:00.000Z", updated_at: "2026-11-02T10:00:00.000Z" }
  );

  pool.state.eavFields.push(
    // tx_orphan references acc_non_existent
    { resource: "bank-transactions", record_id: "tx_orphan", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "acc_non_existent" },
    { resource: "bank-transactions", record_id: "tx_orphan", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-in" },
    { resource: "bank-transactions", record_id: "tx_orphan", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: 100 },
    { resource: "bank-transactions", record_id: "tx_orphan", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-02" },
    { resource: "bank-transactions", record_id: "tx_orphan", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Orphan" },

    // tx_invalid has negative amount
    { resource: "bank-transactions", record_id: "tx_invalid", field_path: "/accountId", field_name: "accountId", ordinal: 0, value_type: "string", value_text: "acc_valid" },
    { resource: "bank-transactions", record_id: "tx_invalid", field_path: "/type", field_name: "type", ordinal: 1, value_type: "string", value_text: "money-in" },
    { resource: "bank-transactions", record_id: "tx_invalid", field_path: "/amount", field_name: "amount", ordinal: 2, value_type: "number", value_number: -25 },
    { resource: "bank-transactions", record_id: "tx_invalid", field_path: "/date", field_name: "date", ordinal: 3, value_type: "string", value_text: "2026-11-02" },
    { resource: "bank-transactions", record_id: "tx_invalid", field_path: "/description", field_name: "description", ordinal: 4, value_type: "string", value_text: "Bad amount" }
  );

  const report = await migrateBankAccountsFromEav(pool);

  // 1 valid account inserted, 1 invalid account skipped
  assert.equal(report.accountsInserted, 1);
  assert.equal(report.accountsSkipped, 1);
  assert.equal(report.invalidAccounts.length, 1);
  assert.equal(report.invalidAccounts[0].id, "acc_invalid");

  // 0 transactions inserted (1 orphan, 1 invalid amount)
  assert.equal(report.transactionsInserted, 0);
  assert.equal(report.transactionsSkipped, 2);
  assert.equal(report.orphanedTransactions.length, 1);
  assert.equal(report.orphanedTransactions[0].id, "tx_orphan");
  assert.equal(report.invalidTransactions.length, 1);
  assert.equal(report.invalidTransactions[0].id, "tx_invalid");

  assert.equal(pool.state.transactionCommitted, true);
});

test("migrateBankAccountsFromEav: rolls back transaction safely on unexpected database error", async () => {
  const pool = createMockDbPool();

  pool.state.eavRecords.push(
    { business_id: "demo-business", resource: "bank-accounts", record_id: "acc_error", created_at: "2026-11-01T10:00:00.000Z", updated_at: "2026-11-01T10:00:00.000Z" }
  );
  pool.state.eavFields.push(
    { resource: "bank-accounts", record_id: "acc_error", field_path: "/accountName", field_name: "accountName", ordinal: 0, value_type: "string", value_text: "Fail Bank" },
    { resource: "bank-accounts", record_id: "acc_error", field_path: "/bankName", field_name: "bankName", ordinal: 1, value_type: "string", value_text: "Fail Bank" },
    { resource: "bank-accounts", record_id: "acc_error", field_path: "/accountNumber", field_name: "accountNumber", ordinal: 2, value_type: "string", value_text: "1234567890" },
    { resource: "bank-accounts", record_id: "acc_error", field_path: "/openingBalance", field_name: "openingBalance", ordinal: 3, value_type: "number", value_number: 100 },
    { resource: "bank-accounts", record_id: "acc_error", field_path: "/openingBalanceDate", field_name: "openingBalanceDate", ordinal: 4, value_type: "string", value_text: "2026-11-01" }
  );

  // Override connection query to simulate failure on INSERT
  const originalGetConn = pool.getConnection;
  pool.getConnection = async () => {
    const conn = await originalGetConn.call(pool);
    const origQuery = conn.query;
    conn.query = async (sql, params) => {
      if (sql.includes("INSERT INTO bank_accounts")) {
        throw new Error("Simulated disk error during INSERT");
      }
      return origQuery.call(conn, sql, params);
    };
    return conn;
  };

  await assert.rejects(
    () => migrateBankAccountsFromEav(pool),
    /Simulated disk error during INSERT/
  );

  assert.equal(pool.state.transactionRolledBack, true);
  assert.equal(pool.state.transactionCommitted, false);
});
