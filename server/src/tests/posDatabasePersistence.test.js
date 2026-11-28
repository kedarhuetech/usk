import assert from "node:assert/strict";
import { test } from "node:test";
import { pool } from "../db/mysql.js";
import { initializeDatabaseSchema } from "../db/initSchema.js";
import express from "express";
import posRouter from "../routes/posRouter.js";
import transactionsRouter from "../routes/transactionsRouter.js";

const app = express();
app.use(express.json());

// Inject mock auth middleware setting businessId = 'test-pos-biz'
app.use((req, _res, next) => {
  const customBiz = req.headers["x-test-business-id"];
  req.user = { businessId: customBiz || "test-pos-biz", userId: "usr-test" };
  req.businessId = customBiz || "test-pos-biz";
  next();
});

app.use("/api/pos", posRouter);
app.use("/api/transactions", transactionsRouter);

async function testFetch(path, options = {}) {
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const body = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers,
          body,
        });
        const json = await res.json().catch(() => null);
        server.close(() => resolve({ status: res.status, ok: res.ok, body: json }));
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

test("Phase 2B: Full Suite - POS Draft Lifecycle, Stock Enforcement & Atomic Finalization", async (t) => {
  if (!String(process.env.DB_NAME || "").toLowerCase().includes("test")) {
    t.skip("Real MySQL POS tests require an explicitly configured isolated test database (DB_NAME containing 'test').");
    return;
  }
  const testBiz = "test-pos-biz";
  const otherBiz = "test-other-biz";

  // 1. Ensure database schema and test businesses exist
  await initializeDatabaseSchema();
  await pool.query(`INSERT IGNORE INTO businesses (id, name) VALUES (?, 'POS Test Business')`, [testBiz]);
  await pool.query(`INSERT IGNORE INTO businesses (id, name) VALUES (?, 'Other Business')`, [otherBiz]);

  // Clean test fixtures
  await pool.query(`DELETE FROM pos_drafts WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM transaction_items WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM transactions WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM inventory_items WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM app_settings WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM parties WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM cash_in_hand WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);

  // Create test items
  const itemId = "item-pos-coke";
  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, item_code, current_stock, item_type)
     VALUES (?, ?, 'Coca Cola 500ml', 'COKE-500', 10.00, 'product')`,
    [itemId, testBiz]
  );

  const customerId = "cust-pos-john";
  await pool.query(
    `INSERT INTO parties (id, business_id, party_name, current_balance)
     VALUES (?, ?, 'John Doe', 0.00)`,
    [customerId, testBiz]
  );

  // Enable stopSaleOnNegativeStock
  await pool.query(
    `INSERT INTO app_settings (business_id, setting_key, setting_value)
     VALUES (?, 'stopSaleOnNegativeStock', 'true')`,
    [testBiz]
  );

  await t.test("1. POS Draft CRUD & isolation", async () => {
    const draftId = "draft-tab-1";
    const payload = {
      invoiceNo: "POS-TEST-001",
      draftName: "Walk-in Counter 1",
      customer: "John Doe",
      customerId,
      items: [
        { productId: itemId, name: "Coca Cola 500ml", qty: 2, price: 40.0, total: 80.0 },
      ],
      total: 80.0,
      paymentMode: "Cash",
    };

    // PUT create
    const createRes = await testFetch(`/api/pos/drafts/${draftId}`, {
      method: "PUT",
      body: payload,
    });
    assert.equal(createRes.status, 200);
    assert.equal(createRes.body.success, true);

    // GET by ID
    const getRes = await testFetch(`/api/pos/drafts/${draftId}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.id, draftId);
    assert.equal(getRes.body.data.items.length, 1);
    assert.equal(getRes.body.data.isFinalized, false);

    // Verify other business cannot see or access it
    const crossGet = await testFetch(`/api/pos/drafts/${draftId}`, {
      headers: { "x-test-business-id": otherBiz },
    });
    assert.equal(crossGet.status, 404);

    const sameIdOtherTenant = await testFetch(`/api/pos/drafts/${draftId}`, {
      method: "PUT",
      headers: { "x-test-business-id": otherBiz },
      body: { ...payload, customer: "Other tenant", businessId: testBiz },
    });
    assert.equal(sameIdOtherTenant.status, 200);
    const [ownedRows] = await pool.query(
      `SELECT business_id, JSON_UNQUOTE(JSON_EXTRACT(payload, '$.customer')) AS customer FROM pos_drafts WHERE id = ? ORDER BY business_id`,
      [draftId]
    );
    assert.equal(ownedRows.length, 2, "Same draft ID must exist independently for both tenants");
    assert.equal(ownedRows.find((row) => row.business_id === testBiz).customer, "John Doe");
    assert.equal(ownedRows.find((row) => row.business_id === otherBiz).customer, "Other tenant");

    // Verify draft created NO side effects on stock, balance, or cash
    const [stockRows] = await pool.query(
      `SELECT current_stock FROM inventory_items WHERE id = ?`,
      [itemId]
    );
    assert.equal(parseFloat(stockRows[0].current_stock), 10.0, "Draft creation must NOT decrement stock");

    const [cashRows] = await pool.query(
      `SELECT COUNT(*) as count FROM cash_in_hand WHERE business_id = ?`,
      [testBiz]
    );
    assert.equal(cashRows[0].count, 0, "Draft creation must NOT add cash ledger entries");
  });

  await t.test("2. Rejection when stock is insufficient and stopSaleOnNegativeStock is enabled", async () => {
    const draftId = "draft-tab-oversell";
    const payload = {
      invoiceNo: "POS-TEST-002",
      items: [
        { productId: itemId, name: "Coca Cola 500ml", qty: 15, price: 40.0, total: 600.0 }, // Available: 10
      ],
      total: 600.0,
      paymentMode: "Cash",
    };

    await testFetch(`/api/pos/drafts/${draftId}`, { method: "PUT", body: payload });

    const finalizeRes = await testFetch(`/api/pos/drafts/${draftId}/finalize`, {
      method: "POST",
    });

    assert.equal(finalizeRes.status, 400);
    assert.equal(finalizeRes.body.code, "INSUFFICIENT_STOCK");
    assert.ok(finalizeRes.body.message.includes("Insufficient stock"));

    // Verify draft is still NOT finalized and still editable
    const [checkDraft] = await pool.query(
      `SELECT is_finalized FROM pos_drafts WHERE id = ?`,
      [draftId]
    );
    assert.equal(checkDraft[0].is_finalized, 0);

    // Clean up
    await pool.query(`DELETE FROM pos_drafts WHERE id = ?`, [draftId]);
  });

  await t.test("3. Atomic Finalization of Cash Bill: verifies stock decrement, cash-in-hand, and idempotency", async () => {
    const draftId = "draft-tab-1"; // items: qty 2 of Coke (stock 10 -> 8)

    const finalizeRes = await testFetch(`/api/pos/drafts/${draftId}/finalize`, {
      method: "POST",
    });

    assert.equal(finalizeRes.status, 201);
    assert.equal(finalizeRes.body.success, true);
    assert.equal(finalizeRes.body.data.transactionType, "pos");
    assert.equal(finalizeRes.body.data.paymentStatus, "Paid");

    // Stock deducted in MySQL
    const [stockRows] = await pool.query(
      `SELECT current_stock FROM inventory_items WHERE id = ?`,
      [itemId]
    );
    assert.equal(parseFloat(stockRows[0].current_stock), 8.0, "Stock must decrement by 2");

    // Cash drawer updated in cash_in_hand
    const [cashRows] = await pool.query(
      `SELECT amount, reference_type FROM cash_in_hand WHERE business_id = ? AND reference_type = 'pos'`,
      [testBiz]
    );
    assert.equal(cashRows.length, 1);
    assert.equal(parseFloat(cashRows[0].amount), 80.0);

    // Idempotency: second call returns existing transaction without re-decrementing stock
    const replayRes = await testFetch(`/api/pos/drafts/${draftId}/finalize`, {
      method: "POST",
    });
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.body.isIdempotentReplay, true);

    const [stockAfterReplay] = await pool.query(
      `SELECT current_stock FROM inventory_items WHERE id = ?`,
      [itemId]
    );
    assert.equal(parseFloat(stockAfterReplay[0].current_stock), 8.0, "Replay must NOT decrement stock again");

    // Check draft is marked finalized
    const [draftAfter] = await pool.query(
      `SELECT is_finalized, finalized_transaction_id FROM pos_drafts WHERE id = ?`,
      [draftId]
    );
    assert.equal(draftAfter[0].is_finalized, 1);
  });

  await t.test("4. Sales Invoice consumer compatibility: type=sale lists both 'sale' and 'pos'", async () => {
    const listRes = await testFetch(`/api/transactions?type=sale`);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.data));
    const foundPos = listRes.body.data.find((tx) => tx.transactionType === "pos" || tx.transaction_type === "pos");
    assert.ok(foundPos, "Transactions query with type=sale must include POS transactions");
    assert.equal(foundPos.documentNumber, "POS-TEST-001");
  });

  await t.test("5. Credit sale atomic finalization: verifies customer balance update", async () => {
    const draftId = "draft-tab-credit";
    const payload = {
      invoiceNo: "POS-TEST-003",
      customer: "John Doe",
      customerId,
      items: [
        { productId: itemId, name: "Coca Cola 500ml", qty: 1, price: 40.0, total: 40.0 },
      ],
      total: 40.0,
      paymentMode: "Credit",
      amountReceived: 0,
      due: 40.0,
    };

    await testFetch(`/api/pos/drafts/${draftId}`, { method: "PUT", body: payload });

    const finalizeRes = await testFetch(`/api/pos/drafts/${draftId}/finalize`, {
      method: "POST",
    });
    assert.equal(finalizeRes.status, 201);
    assert.equal(finalizeRes.body.data.paymentStatus, "Unpaid");

    // Party balance updated
    const [partyRows] = await pool.query(
      `SELECT current_balance FROM parties WHERE id = ?`,
      [customerId]
    );
    assert.equal(parseFloat(partyRows[0].current_balance), 40.0, "Customer balance must increase by unpaid credit balance");

    // Stock decremented (8 -> 7)
    const [stockRows] = await pool.query(
      `SELECT current_stock FROM inventory_items WHERE id = ?`,
      [itemId]
    );
    assert.equal(parseFloat(stockRows[0].current_stock), 7.0);
  });

  // Final cleanup
  await pool.query(`DELETE FROM pos_drafts WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM transactions WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM inventory_items WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM app_settings WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM parties WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
  await pool.query(`DELETE FROM cash_in_hand WHERE business_id IN (?, ?)`, [testBiz, otherBiz]);
});
