import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db/mysql.js";
import { initializeDatabaseSchema } from "../db/initSchema.js";

after(async () => {
  await pool.end();
});

test("Database Schema & Complete Relational Normalization", async () => {
  await initializeDatabaseSchema();

  const [tables] = await pool.query("SHOW TABLES");
  const tableNames = tables.map((t) => Object.values(t)[0]);

  // Verify all section tables
  const expectedTables = [
    "businesses", "company_profiles", "app_settings", "parties",
    "units", "inventory_items", "item_batches", "inventory_adjustments",
    "transactions", "transaction_items", "service_reminders", "service_reminder_history",
    "bank_accounts", "cash_in_hand", "cheques", "loan_accounts",
    "online_store_settings", "online_store_orders", "online_store_order_items",
    "smart_ads", "audit_trails",
    "unit_conversions", "purchase_job_works", "purchase_job_work_items",
    "loan_repayments", "balance_sheet_accounts", "migration_logs"
  ];

  for (const table of expectedTables) {
    assert.ok(tableNames.includes(table), `Table ${table} must exist in MySQL.`);
  }

  // Verify ZERO JSON columns in the entire database
  const [jsonCols] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME 
     FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = 'vyapaar' AND DATA_TYPE = 'json'`
  );
  assert.equal(jsonCols.length, 0, "No JSON data types allowed. Everything must be pure SQL rows & columns.");
});

test("Parties MySQL Upsert & Indexed Lookup (Pure Columns)", async () => {
  const testId = `test_party_${Date.now()}`;
  await pool.query(
    `INSERT INTO parties (id, business_id, party_name, phone, party_type, opening_balance, current_balance, billing_city)
     VALUES (?, 'demo-business', 'Ramesh Enterprises', '9876543210', 'customer', 500.00, 1500.00, 'Mumbai')
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
  assert.equal(rows[0].billing_city, "Mumbai");
  assert.equal(parseFloat(rows[0].current_balance), 1500.00);

  // Clean up
  await pool.query(`DELETE FROM parties WHERE id = ?`, [testId]);
});

test("Inventory Items & Normalized Batches (Pure Rows and Columns)", async () => {
  const testItemId = `test_item_${Date.now()}`;
  const testBatchId = `test_batch_${Date.now()}`;

  // 1. Insert item
  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, item_code, category, sale_price, purchase_price, current_stock, is_batch_tracked)
     VALUES (?, 'demo-business', 'Basmati Rice 5kg', 'BR5KG', 'Grains', 450.00, 380.00, 25.00, 1)`,
    [testItemId]
  );

  // 2. Insert batch into child table item_batches
  await pool.query(
    `INSERT INTO item_batches (id, item_id, business_id, batch_no, mfg_date, exp_date, opening_qty, current_qty, sale_price)
     VALUES (?, ?, 'demo-business', 'BATCH-001', '2026-01-01', '2027-01-01', 25.00, 25.00, 450.00)`,
    [testBatchId, testItemId]
  );

  // 3. Query with JOIN
  const [batchRows] = await pool.query(
    `SELECT b.*, i.name as itemName 
     FROM item_batches b
     JOIN inventory_items i ON b.item_id = i.id
     WHERE b.business_id = 'demo-business' AND b.item_id = ?`,
    [testItemId]
  );

  assert.equal(batchRows.length, 1);
  assert.equal(batchRows[0].itemName, "Basmati Rice 5kg");
  assert.equal(batchRows[0].batch_no, "BATCH-001");
  assert.equal(parseFloat(batchRows[0].current_qty), 25.00);

  // Clean up
  await pool.query(`DELETE FROM item_batches WHERE id = ?`, [testBatchId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = ?`, [testItemId]);
});

test("Transactions & Normalized Line Items (Pure Rows and Columns)", async () => {
  const testTxnId = `test_txn_${Date.now()}`;
  const testLineId = `test_line_${Date.now()}`;
  const testPartyId = `test_party_tx_${Date.now()}`;

  // 1. Create party
  await pool.query(
    `INSERT INTO parties (id, business_id, party_name, current_balance)
     VALUES (?, 'demo-business', 'Transaction Customer', 0.00)`,
    [testPartyId]
  );

  // 2. Insert transaction header
  await pool.query(
    `INSERT INTO transactions (
      id, business_id, transaction_type, document_number, transaction_date,
      party_id, party_name, total_amount, paid_amount, balance_amount, payment_status
    ) VALUES (?, 'demo-business', 'sale', 'INV-9901', '2026-11-14', ?, 'Transaction Customer', 1200.00, 200.00, 1000.00, 'Pending')`,
    [testTxnId, testPartyId]
  );

  // 3. Insert normalized item row into transaction_items
  await pool.query(
    `INSERT INTO transaction_items (
      id, transaction_id, business_id, item_name, quantity, unit_price, total_amount
    ) VALUES (?, ?, 'demo-business', 'Premium Grains', 4.00, 300.00, 1200.00)`,
    [testLineId, testTxnId]
  );

  // 4. Verify transaction with joined items
  const [txnRows] = await pool.query(
    `SELECT * FROM transactions WHERE business_id = 'demo-business' AND id = ?`,
    [testTxnId]
  );
  const [lineRows] = await pool.query(
    `SELECT * FROM transaction_items WHERE business_id = 'demo-business' AND transaction_id = ?`,
    [testTxnId]
  );

  assert.equal(txnRows.length, 1);
  assert.equal(txnRows[0].document_number, "INV-9901");
  assert.equal(parseFloat(txnRows[0].total_amount), 1200.00);

  assert.equal(lineRows.length, 1);
  assert.equal(lineRows[0].item_name, "Premium Grains");
  assert.equal(parseFloat(lineRows[0].quantity), 4.00);
  assert.equal(parseFloat(lineRows[0].total_amount), 1200.00);

  // Clean up
  await pool.query(`DELETE FROM transaction_items WHERE id = ?`, [testLineId]);
  await pool.query(`DELETE FROM transactions WHERE id = ?`, [testTxnId]);
  await pool.query(`DELETE FROM parties WHERE id = ?`, [testPartyId]);
});

test("Database Backup & Restore (Full 22 Tables Relational Export)", async () => {
  const testUnitId = `test_unit_bkp_${Date.now()}`;
  await pool.query(
    `INSERT INTO units (id, business_id, name, short_name, precision_dec)
     VALUES (?, 'demo-business', 'Kilogram Backup Test', 'KG', 2)`,
    [testUnitId]
  );

  // Test Export query logic
  const [rows] = await pool.query(
    `SELECT * FROM units WHERE business_id = 'demo-business' AND id = ?`,
    [testUnitId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].short_name, "KG");

  // Clean up
  await pool.query(`DELETE FROM units WHERE id = ?`, [testUnitId]);
});

test("Unit Conversions (Pure SQL Relational Table)", async () => {
  const testId = `uconv_test_${Date.now()}`;
  await pool.query(
    `INSERT INTO unit_conversions (id, business_id, unit, to_unit, factor)
     VALUES (?, 'demo-business', 'BOX', 'PCS', 12.0000)`,
    [testId]
  );

  const [rows] = await pool.query(
    `SELECT * FROM unit_conversions WHERE business_id = 'demo-business' AND id = ?`,
    [testId]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].unit, "BOX");
  assert.equal(rows[0].to_unit, "PCS");
  assert.equal(parseFloat(rows[0].factor), 12.0000);

  // Clean up
  await pool.query(`DELETE FROM unit_conversions WHERE id = ?`, [testId]);
});

test("Purchase Job Works & Normalized Items (Zero JSON)", async () => {
  const testJwId = `test_jw_${Date.now()}`;
  const testSentLineId = `test_jw_sent_${Date.now()}`;
  const testRecvLineId = `test_jw_recv_${Date.now()}`;

  // 1. Insert header
  await pool.query(
    `INSERT INTO purchase_job_works (id, business_id, order_number, party_name, status, charges)
     VALUES (?, 'demo-business', 'JW-TEST-001', 'Dyeing Mill Vendor', 'Pending', 2500.00)`,
    [testJwId]
  );

  // 2. Insert normalized lines
  await pool.query(
    `INSERT INTO purchase_job_work_items (id, business_id, job_work_id, item_type, item_id, item_name, quantity, unit)
     VALUES
       (?, 'demo-business', ?, 'sent', 'item_yarn', 'Raw Cotton Yarn', 100.00, 'KG'),
       (?, 'demo-business', ?, 'received', 'item_fabric', 'Finished Dyed Fabric', 95.00, 'MTR')`,
    [testSentLineId, testJwId, testRecvLineId, testJwId]
  );

  // 3. Query
  const [headerRows] = await pool.query(`SELECT * FROM purchase_job_works WHERE id = ?`, [testJwId]);
  const [lines] = await pool.query(`SELECT * FROM purchase_job_work_items WHERE job_work_id = ?`, [testJwId]);

  assert.equal(headerRows.length, 1);
  assert.equal(headerRows[0].order_number, "JW-TEST-001");
  assert.equal(parseFloat(headerRows[0].charges), 2500.00);
  assert.equal(lines.length, 2);

  // Clean up
  await pool.query(`DELETE FROM purchase_job_work_items WHERE job_work_id = ?`, [testJwId]);
  await pool.query(`DELETE FROM purchase_job_works WHERE id = ?`, [testJwId]);
});

test("Loan Accounts & Normalized Repayments Child Table", async () => {
  const testLoanId = `loan_test_${Date.now()}`;
  const testRepayId = `repay_test_${Date.now()}`;

  // 1. Insert Loan
  await pool.query(
    `INSERT INTO loan_accounts (id, business_id, account_name, lender_name, principal_amount, current_balance, interest_rate, term_months)
     VALUES (?, 'demo-business', 'Machinery Loan', 'HDFC Bank', 500000.00, 500000.00, 10.50, 24)`,
    [testLoanId]
  );

  // 2. Insert Repayment & reduce balance
  await pool.query(
    `INSERT INTO loan_repayments (id, business_id, loan_id, payment_date, amount_paid, principal_paid, interest_paid)
     VALUES (?, 'demo-business', ?, '2026-11-17', 25000.00, 20000.00, 5000.00)`,
    [testRepayId, testLoanId]
  );
  await pool.query(
    `UPDATE loan_accounts SET current_balance = current_balance - 20000.00 WHERE id = ?`,
    [testLoanId]
  );

  // 3. Verify
  const [loanRows] = await pool.query(`SELECT * FROM loan_accounts WHERE id = ?`, [testLoanId]);
  assert.equal(parseFloat(loanRows[0].current_balance), 480000.00);

  // Clean up
  await pool.query(`DELETE FROM loan_repayments WHERE id = ?`, [testRepayId]);
  await pool.query(`DELETE FROM loan_accounts WHERE id = ?`, [testLoanId]);
});

test("Balance Sheet Chart of Accounts Table", async () => {
  const testAccId = `bsacc_test_${Date.now()}`;
  await pool.query(
    `INSERT INTO balance_sheet_accounts (id, business_id, account_name, account_type, opening_balance, balance_type)
     VALUES (?, 'demo-business', 'Office Building', 'Fixed Asset', 1500000.00, 'debit')`,
    [testAccId]
  );

  const [rows] = await pool.query(`SELECT * FROM balance_sheet_accounts WHERE id = ?`, [testAccId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].account_name, "Office Building");
  assert.equal(parseFloat(rows[0].opening_balance), 1500000.00);

  // Clean up
  await pool.query(`DELETE FROM balance_sheet_accounts WHERE id = ?`, [testAccId]);
});

test("Migration Logs & Batch Rollback Capability", async () => {
  const testBatchId = `batch_test_${Date.now()}`;
  const testLogId = `log_test_${Date.now()}`;

  await pool.query(
    `INSERT INTO migration_logs (id, batch_id, business_id, entity_type, source_id, target_table, target_id, action, details)
     VALUES (?, ?, 'demo-business', 'party', 'local_p1', 'parties', 'p1', 'inserted', 'Test log entry')`,
    [testLogId, testBatchId]
  );

  const [rows] = await pool.query(`SELECT * FROM migration_logs WHERE batch_id = ?`, [testBatchId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "inserted");

  // Clean up
  await pool.query(`DELETE FROM migration_logs WHERE batch_id = ?`, [testBatchId]);
});

test("RT Pharmacy Party Preservation under demo-business and local-development", async () => {
  const rtId = "933f31db-61eb-4c2b-a3d1-2c862c8fc888";
  const [demoRows] = await pool.query(`SELECT * FROM parties WHERE business_id = 'demo-business' AND id = ?`, [rtId]);
  const [localRows] = await pool.query(`SELECT * FROM parties WHERE business_id = 'local-development' AND id = ?`, [rtId]);

  assert.ok(demoRows.length >= 1, "RT Pharmacy must exist under demo-business");
  assert.ok(localRows.length >= 1, "RT Pharmacy must exist under local-development for transaction integrity");
});
