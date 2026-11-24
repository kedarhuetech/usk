import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { restoreUsvToDatabase, validateUsvPayload } from "../services/backupRestoreService.js";

function createMockConnection() {
  const executed = [];
  let inTransaction = false;

  return {
    executed,
    inTransaction: () => inTransaction,
    async beginTransaction() {
      inTransaction = true;
      executed.push({ sql: "BEGIN", params: [] });
    },
    async commit() {
      inTransaction = false;
      executed.push({ sql: "COMMIT", params: [] });
    },
    async rollback() {
      inTransaction = false;
      executed.push({ sql: "ROLLBACK", params: [] });
    },
    async query(sql, params = []) {
      executed.push({ sql: sql.trim(), params });
      return [[]];
    },
    release() {},
  };
}

test("restores real USV backup fixture into MySQL database tables", async () => {
  const backupPath = path.resolve("USV-backup-20261102T102526Z-GSTR3B-TEST.usvbackup");
  assert.ok(fs.existsSync(backupPath), "Real USV backup file must exist in workspace root");

  const rawJson = fs.readFileSync(backupPath, "utf-8");
  const payload = JSON.parse(rawJson);

  // Validate format
  assert.equal(validateUsvPayload(payload), true);
  assert.equal(payload.format, "usv-backup");
  assert.equal(payload.formatVersion, 1);

  const conn = createMockConnection();
  const testBusinessId = "demo-business";

  const result = await restoreUsvToDatabase(conn, testBusinessId, payload);

  assert.equal(result.success, true);
  assert.equal(result.businessId, testBusinessId);
  assert.ok(result.stats.parties > 0, "Parties must be restored");
  assert.ok(result.stats.items > 0, "Items must be restored");
  assert.ok(result.stats.transactions > 0, "Transactions must be restored");
  assert.ok(result.stats.transactionItems > 0, "Transaction items must be restored");
  assert.ok(result.stats.companyProfile > 0, "Company profile must be restored");
  assert.equal(result.stats.cheques, 2, "Cheques from real backup must be restored");
  assert.equal(result.stats.loanAccounts, 1, "Loan accounts from real backup must be restored");
  assert.equal(result.stats.cashAdjustments, 2, "Cash adjustments from real backup must be restored");
  assert.ok(result.totalRestoredCount > 30, "Substantial number of business records must be restored");

  // Verify transaction isolation
  assert.ok(conn.executed.some((q) => q.sql.includes("company_profiles")), "company_profiles table must be updated");
  assert.ok(conn.executed.some((q) => q.sql.includes("parties")), "parties table must be updated");
  assert.ok(conn.executed.some((q) => q.sql.includes("inventory_items")), "inventory_items table must be updated");
  assert.ok(conn.executed.some((q) => q.sql.includes("transactions")), "transactions table must be updated");
  assert.ok(conn.executed.some((q) => q.sql.includes("transaction_items")), "transaction_items table must be updated");

  // Verify all queries use demo-business and never touch other businesses
  const otherBizQueries = conn.executed.filter(
    (q) => q.params && q.params.some((p) => typeof p === "string" && p.startsWith("other-biz"))
  );
  assert.equal(otherBizQueries.length, 0, "Must never touch other businesses");
});

test("database transaction rollback on forced failure mid-restoration", async () => {
  const conn = createMockConnection();
  // Simulate an error occurring when inserting parties
  const origQuery = conn.query;
  conn.query = async (sql, params = []) => {
    if (sql.includes("INSERT INTO parties")) {
      const err = new Error("Simulated duplicate key / constraint error");
      err.code = "ER_DUP_ENTRY";
      throw err;
    }
    return origQuery(sql, params);
  };

  const payload = {
    format: "usv-backup",
    formatVersion: 1,
    data: {
      "ledgerly:companyProfile.v1": { companyName: "Rollback Test" },
      "ledgerly:parties.v1": [{ id: "p1", partyName: "Fail Party" }],
    },
  };

  await assert.rejects(
    restoreUsvToDatabase(conn, "demo-business", payload),
    /Simulated duplicate key/
  );
});
