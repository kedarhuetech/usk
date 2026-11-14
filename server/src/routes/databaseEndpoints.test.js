import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db/mysql.js";
import { initializeDatabaseSchema } from "../db/initSchema.js";

after(async () => {
  await pool.end();
});

test("Database Schema & Initialization", async () => {
  await initializeDatabaseSchema();

  const [tables] = await pool.query("SHOW TABLES");
  const tableNames = tables.map((t) => Object.values(t)[0]);

  assert.ok(tableNames.includes("parties"), "parties table must exist");
  assert.ok(tableNames.includes("inventory_items"), "inventory_items table must exist");
  assert.ok(tableNames.includes("transactions"), "transactions table must exist");
  assert.ok(tableNames.includes("service_reminders"), "service_reminders table must exist");
  assert.ok(tableNames.includes("bank_accounts"), "bank_accounts table must exist");
  assert.ok(tableNames.includes("app_settings"), "app_settings table must exist");
  assert.ok(tableNames.includes("company_profiles"), "company_profiles table must exist");
});

test("Parties MySQL Upsert & Indexed Lookup", async () => {
  const testId = `test_party_${Date.now()}`;
  await pool.query(
    `INSERT INTO parties (id, business_id, party_name, phone, party_type, opening_balance, current_balance)
     VALUES (?, 'demo-business', 'Ramesh Enterprises', '9876543210', 'customer', 500.00, 1500.00)
     ON DUPLICATE KEY UPDATE party_name = VALUES(party_name)`,
    [testId]
  );

  const [rows] = await pool.query(
    `SELECT * FROM parties WHERE business_id = 'demo-business' AND id = ?`,
    [testId]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].party_name, "Ramesh Enterprises");
  assert.equal(rows[0].phone, "9876543210");
  assert.equal(parseFloat(rows[0].current_balance), 1500.00);

  // Clean up
  await pool.query(`DELETE FROM parties WHERE id = ?`, [testId]);
});

test("Inventory Items Master & Stock Precision", async () => {
  const testItemId = `test_item_${Date.now()}`;
  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, item_code, category, sale_price, purchase_price, current_stock)
     VALUES (?, 'demo-business', 'Basmati Rice 5kg', 'BR5KG', 'Grains', 450.00, 380.00, 25.00)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [testItemId]
  );

  const [rows] = await pool.query(
    `SELECT * FROM inventory_items WHERE business_id = 'demo-business' AND id = ?`,
    [testItemId]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Basmati Rice 5kg");
  assert.equal(parseFloat(rows[0].sale_price), 450.00);
  assert.equal(parseFloat(rows[0].current_stock), 25.00);

  // Clean up
  await pool.query(`DELETE FROM inventory_items WHERE id = ?`, [testItemId]);
});

test("Transactions Unified Ledger & Multi-table consistency", async () => {
  const testTxnId = `test_txn_${Date.now()}`;
  const testPartyId = `test_party_tx_${Date.now()}`;

  // 1. Create party
  await pool.query(
    `INSERT INTO parties (id, business_id, party_name, current_balance)
     VALUES (?, 'demo-business', 'Transaction Customer', 0.00)`,
    [testPartyId]
  );

  // 2. Insert transaction
  await pool.query(
    `INSERT INTO transactions (
      id, business_id, transaction_type, document_number, transaction_date,
      party_id, party_name, total_amount, paid_amount, balance_amount, status
    ) VALUES (?, 'demo-business', 'sale', 'INV-9901', '2026-11-14', ?, 'Transaction Customer', 1200.00, 200.00, 1000.00, 'Pending')`,
    [testTxnId, testPartyId]
  );

  const [rows] = await pool.query(
    `SELECT * FROM transactions WHERE business_id = 'demo-business' AND id = ?`,
    [testTxnId]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].transaction_type, "sale");
  assert.equal(rows[0].document_number, "INV-9901");
  assert.equal(parseFloat(rows[0].total_amount), 1200.00);
  assert.equal(parseFloat(rows[0].balance_amount), 1000.00);

  // Clean up
  await pool.query(`DELETE FROM transactions WHERE id = ?`, [testTxnId]);
  await pool.query(`DELETE FROM parties WHERE id = ?`, [testPartyId]);
});
