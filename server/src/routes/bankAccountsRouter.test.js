import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_TABLES } from "./backupRouter.js";

// Mock database state
function createMockDb() {
  const accounts = new Map();
  const transactions = new Map();
  let failNextQuery = null;

  const mockConnection = {
    inTransaction: false,
    async beginTransaction() {
      this.inTransaction = true;
    },
    async commit() {
      this.inTransaction = false;
    },
    async rollback() {
      this.inTransaction = false;
    },
    release() {},
    async query(sql, params) {
      if (failNextQuery) {
        const err = failNextQuery;
        failNextQuery = null;
        throw err;
      }
      return executeMockQuery(sql, params);
    }
  };

  function executeMockQuery(sql, params = []) {
    const normSql = sql.replace(/\s+/g, " ").trim();

    // 1. SELECT single account by id from bank_accounts
    if (normSql.startsWith("SELECT") && normSql.includes("FROM bank_accounts") && /\bid = \?/.test(normSql)) {
      const [businessId, id] = params;
      const acc = accounts.get(id);
      if (acc && acc.business_id === businessId) {
        return [[{ ...acc }]];
      }
      return [[]];
    }

    // 2. Check duplicate account number
    if (normSql.startsWith("SELECT") && normSql.includes("FROM bank_accounts") && normSql.includes("account_number = ?")) {
      const [businessId, accNum, id] = params;
      const dup = Array.from(accounts.values()).find((a) => a.business_id === businessId && a.account_number === accNum && a.id !== id);
      return dup ? [[{ id: dup.id }]] : [[]];
    }

    // 3. SELECT all accounts from bank_accounts
    if (normSql.startsWith("SELECT") && normSql.includes("FROM bank_accounts") && normSql.includes("WHERE business_id = ?")) {
      const [businessId] = params;
      const list = Array.from(accounts.values()).filter((a) => a.business_id === businessId);
      return [list];
    }

    // 4. INSERT into bank_accounts
    if (normSql.startsWith("INSERT INTO bank_accounts")) {
      const [
        id, business_id, account_name, account_holder_name, account_number, bank_name,
        ifsc_code, branch_name, opening_balance, current_balance, account_type,
        as_of_date, notes, status, is_default
      ] = params;

      if (accounts.has(id)) {
        // ON DUPLICATE KEY UPDATE: preserves opening_balance and current_balance
        const existing = accounts.get(id);
        accounts.set(id, {
          ...existing,
          account_name,
          account_holder_name,
          account_number,
          bank_name,
          ifsc_code,
          branch_name,
          account_type,
          notes,
          status,
          is_default,
          updated_at: new Date().toISOString(),
        });
      } else {
        accounts.set(id, {
          id,
          business_id,
          account_name,
          account_holder_name,
          account_number,
          bank_name,
          ifsc_code,
          branch_name,
          opening_balance,
          current_balance,
          account_type,
          as_of_date,
          notes,
          status,
          is_default,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      return [{ affectedRows: 1 }];
    }

    // 5. Check duplicate transaction ID
    if (normSql.startsWith("SELECT") && normSql.includes("FROM bank_transactions") && /\bid = \?/.test(normSql)) {
      const [businessId, id] = params;
      const dup = transactions.get(id);
      return (dup && dup.business_id === businessId) ? [[{ id }]] : [[]];
    }

    // 6. Check transactions for account deletion check (LIMIT 1 with account_id)
    if (normSql.startsWith("SELECT") && normSql.includes("FROM bank_transactions") && normSql.includes("account_id = ?") && normSql.includes("LIMIT 1")) {
      const [businessId, accountId] = params;
      const hasTx = Array.from(transactions.values()).some((t) => t.business_id === businessId && t.account_id === accountId);
      return hasTx ? [[{ id: "tx_found" }]] : [[]];
    }

    // 7. SELECT from bank_transactions (all or filtered by account_id)
    if (normSql.startsWith("SELECT") && normSql.includes("FROM bank_transactions") && normSql.includes("WHERE business_id = ?")) {
      const [businessId] = params;
      let list = Array.from(transactions.values()).filter((t) => t.business_id === businessId);
      if (normSql.includes("account_id = ?")) {
        const accountId = params[1];
        list = list.filter((t) => t.account_id === accountId);
      }
      return [list];
    }

    // 8. INSERT into bank_transactions
    if (normSql.startsWith("INSERT INTO bank_transactions")) {
      const [id, business_id, account_id, type, amount, transaction_date, reference, description, related_party] = params;
      transactions.set(id, {
        id,
        business_id,
        account_id,
        type,
        amount,
        transaction_date,
        reference,
        description,
        related_party,
        created_at: new Date().toISOString(),
      });
      return [{ affectedRows: 1 }];
    }

    // 9. UPDATE bank_accounts SET current_balance = opening_balance + SUM(...)
    if (normSql.startsWith("UPDATE bank_accounts") && normSql.includes("current_balance = opening_balance +")) {
      const [bId1, accId1, bId2, accId2] = params;
      const acc = accounts.get(accId2);
      if (acc && acc.business_id === bId2) {
        const accTxns = Array.from(transactions.values()).filter((t) => t.business_id === bId1 && t.account_id === accId1);
        const netPaise = accTxns.reduce((sum, t) => {
          const paise = Math.round(Number(t.amount) * 100);
          return sum + (t.type === "money-in" ? paise : -paise);
        }, 0);
        acc.current_balance = (Math.round(Number(acc.opening_balance) * 100) + netPaise) / 100;
        acc.updated_at = new Date().toISOString();
      }
      return [{ affectedRows: 1 }];
    }

    // 10. DELETE FROM bank_accounts
    if (normSql.startsWith("DELETE FROM bank_accounts")) {
      const [businessId, id] = params;
      const acc = accounts.get(id);
      if (acc && acc.business_id === businessId) {
        accounts.delete(id);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    return [[]];
  }

  const mockPool = {
    async query(sql, params) {
      if (failNextQuery) {
        const err = failNextQuery;
        failNextQuery = null;
        throw err;
      }
      return executeMockQuery(sql, params);
    },
    async getConnection() {
      return mockConnection;
    },
    setFailNext(err) {
      failNextQuery = err;
    }
  };

  return { accounts, transactions, mockPool };
}

// In-memory request dispatcher that executes the Express router directly without opening network sockets
function dispatch(router, { method = "GET", url = "/", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url, "http://localhost");
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    const lowerHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }

    const req = {
      method: method.toUpperCase(),
      url: parsedUrl.pathname + parsedUrl.search,
      originalUrl: url,
      baseUrl: "",
      path: parsedUrl.pathname,
      query,
      headers: lowerHeaders,
      get(headerName) {
        return lowerHeaders[headerName.toLowerCase()];
      },
      header(headerName) {
        return lowerHeaders[headerName.toLowerCase()];
      },
      body: body ? (typeof body === "string" ? JSON.parse(body) : body) : {},
      params: {},
    };

    let statusCode = 200;
    let resData = null;

    const res = {
      statusCode: 200,
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        resolve({
          status: statusCode,
          ok: statusCode >= 200 && statusCode < 300,
          json: async () => resData,
          data: resData,
        });
        return this;
      },
      send(data) {
        resData = data;
        resolve({
          status: statusCode,
          ok: statusCode >= 200 && statusCode < 300,
          json: async () => (typeof resData === "string" ? JSON.parse(resData) : resData),
          data: resData,
        });
        return this;
      },
      end() {
        resolve({
          status: statusCode,
          ok: statusCode >= 200 && statusCode < 300,
          json: async () => resData,
          data: resData,
        });
        return this;
      }
    };

    router(req, res, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          status: 404,
          ok: false,
          json: async () => ({ success: false, message: "Not found" }),
          data: { success: false, message: "Not found" },
        });
      }
    });
  });
}

test("Bank Accounts Backend Relational Persistence Suite", async (t) => {
  const { accounts, transactions, mockPool } = createMockDb();

  // Monkey-patch pool for the router import
  const mysqlModule = await import("../db/mysql.js");
  const origQuery = mysqlModule.pool.query;
  const origGetConn = mysqlModule.pool.getConnection;

  mysqlModule.pool.query = (...args) => mockPool.query(...args);
  mysqlModule.pool.getConnection = (...args) => mockPool.getConnection(...args);

  const { default: bankAccountsRouter } = await import("./bankAccountsRouter.js");

  t.after(() => {
    mysqlModule.pool.query = origQuery;
    mysqlModule.pool.getConnection = origGetConn;
  });

  const request = (options) => dispatch(bankAccountsRouter, {
    headers: { "X-Business-Id": "test-business", ...options.headers },
    ...options
  });

  await t.test("1. Backup inclusion of bank_transactions", () => {
    assert.ok(BACKUP_TABLES.includes("bank_accounts"), "BACKUP_TABLES must include bank_accounts");
    assert.ok(BACKUP_TABLES.includes("bank_transactions"), "BACKUP_TABLES must include bank_transactions");
  });

  await t.test("2. Create bank account with all fields", async () => {
    const payload = {
      id: "acc-101",
      accountName: "HDFC Primary Checking",
      accountHolderName: "Sai Enterprises",
      accountNumber: "123456789012",
      bankName: "HDFC Bank",
      ifsc: "HDFC0001234",
      branch: "Indiranagar",
      openingBalance: 1000.50,
      openingBalanceDate: "2026-11-01",
      accountType: "Current",
      notes: "Main operational account",
      status: "active",
      isDefault: true,
    };

    const res = await request({
      method: "POST",
      url: "/",
      body: payload,
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.id, "acc-101");
    assert.equal(json.data.accountName, "HDFC Primary Checking");
    assert.equal(json.data.accountHolderName, "Sai Enterprises");
    assert.equal(json.data.accountNumber, "123456789012");
    assert.equal(json.data.bankName, "HDFC Bank");
    assert.equal(json.data.ifsc, "HDFC0001234");
    assert.equal(json.data.branch, "Indiranagar");
    assert.equal(json.data.openingBalance, 1000.50);
    assert.equal(json.data.currentBalance, 1000.50);
    assert.equal(json.data.openingBalanceDate, "2026-11-01");
    assert.equal(json.data.notes, "Main operational account");
    assert.equal(json.data.status, "active");
    assert.equal(json.data.isDefault, true);
  });

  await t.test("3. GET /api/bank-accounts returns complete mapped accounts", async () => {
    const res = await request({
      method: "GET",
      url: "/",
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].id, "acc-101");
    assert.equal(json.data[0].accountHolderName, "Sai Enterprises");
  });

  await t.test("4. Editing an account preserves existing current balance and opening balance", async () => {
    // Modify current_balance directly to simulate prior transaction activity
    accounts.get("acc-101").current_balance = 5500.75;

    // Update account with new branch and notes, but omit currentBalance
    const updatePayload = {
      id: "acc-101",
      accountName: "HDFC Primary Checking Updated",
      bankName: "HDFC Bank",
      accountNumber: "123456789012",
      branch: "Koramangala Branch",
      notes: "Updated notes",
      status: "active",
    };

    const res = await request({
      method: "PUT",
      url: "/acc-101",
      body: updatePayload,
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.accountName, "HDFC Primary Checking Updated");
    assert.equal(json.data.branch, "Koramangala Branch");
    // Ensure currentBalance was strictly preserved and NOT reset to 0 or openingBalance
    assert.equal(json.data.currentBalance, 5500.75);
    assert.equal(json.data.openingBalance, 1000.50);
  });

  await t.test("5. POST /api/bank-accounts/transactions (money-in) atomically updates balance", async () => {
    const txnPayload = {
      id: "tx-201",
      accountId: "acc-101",
      type: "money-in",
      amount: 1500.25,
      date: "2026-11-05",
      description: "Customer invoice payment",
      reference: "INV-9901",
      relatedParty: "Acme Corp",
    };

    const res = await request({
      method: "POST",
      url: "/transactions",
      body: txnPayload,
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.id, "tx-201");
    assert.equal(json.data.type, "money-in");
    assert.equal(json.data.amount, 1500.25);

    // Opening was 1000.50, + 1500.25 = 2500.75
    assert.equal(json.updatedAccountBalance, 2500.75);
    assert.equal(accounts.get("acc-101").current_balance, 2500.75);
  });

  await t.test("6. POST /api/bank-accounts/transactions (money-out) atomically decreases balance", async () => {
    const txnPayload = {
      id: "tx-202",
      accountId: "acc-101",
      type: "money-out",
      amount: 500.75,
      date: "2026-11-06",
      description: "Supplier bill payment",
      reference: "BILL-104",
    };

    const res = await request({
      method: "POST",
      url: "/transactions",
      body: txnPayload,
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.type, "money-out");
    assert.equal(json.data.amount, 500.75);

    // Previous was 2500.75, - 500.75 = 2000.00
    assert.equal(json.updatedAccountBalance, 2000.00);
    assert.equal(accounts.get("acc-101").current_balance, 2000.00);
  });

  await t.test("7. GET /api/bank-accounts/transactions returns transaction list", async () => {
    const res = await request({
      method: "GET",
      url: "/transactions?accountId=acc-101",
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.length, 2);
    assert.equal(json.data[0].id, "tx-201");
    assert.equal(json.data[1].id, "tx-202");
  });

  await t.test("8. Invalid transaction parameters are rejected with HTTP 400", async () => {
    // Negative amount
    const res1 = await request({
      method: "POST",
      url: "/transactions",
      body: { accountId: "acc-101", type: "money-in", amount: -10, date: "2026-11-05", description: "Bad" },
    });
    assert.equal(res1.status, 400);

    // Invalid type
    const res2 = await request({
      method: "POST",
      url: "/transactions",
      body: { accountId: "acc-101", type: "transfer", amount: 100, date: "2026-11-05", description: "Bad" },
    });
    assert.equal(res2.status, 400);

    // Missing description
    const res3 = await request({
      method: "POST",
      url: "/transactions",
      body: { accountId: "acc-101", type: "money-in", amount: 100, date: "2026-11-05", description: "   " },
    });
    assert.equal(res3.status, 400);
  });

  await t.test("9. Duplicate transaction ID is rejected with HTTP 409", async () => {
    const dupPayload = {
      id: "tx-201", // already exists
      accountId: "acc-101",
      type: "money-in",
      amount: 100,
      date: "2026-11-05",
      description: "Duplicate attempt",
    };

    const res = await request({
      method: "POST",
      url: "/transactions",
      body: dupPayload,
    });

    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.message, /already exists/i);
  });

  await t.test("10. Inactive bank account rejects new transactions with HTTP 409", async () => {
    accounts.get("acc-101").status = "inactive";

    const res = await request({
      method: "POST",
      url: "/transactions",
      body: { accountId: "acc-101", type: "money-in", amount: 50, date: "2026-11-07", description: "Inactive test" },
    });

    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.message, /Reactivate/i);

    // Restore active
    accounts.get("acc-101").status = "active";
  });

  await t.test("11. Non-existent bank account returns HTTP 404", async () => {
    const res = await request({
      method: "POST",
      url: "/transactions",
      body: { accountId: "acc-missing", type: "money-in", amount: 50, date: "2026-11-07", description: "Missing test" },
    });

    assert.equal(res.status, 404);
  });

  await t.test("12. Transactions are immutable: PUT and DELETE return HTTP 409", async () => {
    const putRes = await request({
      method: "PUT",
      url: "/transactions/tx-201",
      body: { amount: 9999 },
    });
    assert.equal(putRes.status, 409);

    const delRes = await request({
      method: "DELETE",
      url: "/transactions/tx-201",
    });
    assert.equal(delRes.status, 409);
  });

  await t.test("13. Account deletion is prevented with HTTP 409 if transaction history exists", async () => {
    const res = await request({
      method: "DELETE",
      url: "/acc-101",
    });

    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.message, /Cannot delete bank account with existing transaction history/i);

    // Verify account still exists
    assert.ok(accounts.has("acc-101"));
  });

  await t.test("14. Account without transactions can be deleted safely", async () => {
    // Create new account without transactions
    accounts.set("acc-clean", {
      id: "acc-clean",
      business_id: "test-business",
      account_name: "Empty Account",
      opening_balance: 0,
      current_balance: 0,
    });

    const res = await request({
      method: "DELETE",
      url: "/acc-clean",
    });

    assert.equal(res.status, 200);
    assert.equal(accounts.has("acc-clean"), false);
  });

  await t.test("15. Transaction rollback on database error", async () => {
    mockPool.setFailNext(new Error("Simulated query deadlock"));

    const res = await request({
      method: "POST",
      url: "/transactions",
      body: { accountId: "acc-101", type: "money-in", amount: 100, date: "2026-11-08", description: "Deadlock test" },
    });

    assert.equal(res.status, 500);
    const json = await res.json();
    assert.match(json.message, /Simulated query deadlock/i);
  });
});
