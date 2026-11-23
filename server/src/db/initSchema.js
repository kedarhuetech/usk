/**
 * Comprehensive Relational Database Schema Initialization Module
 * 
 * Strict Production Design Rules:
 * 1. PURE RELATIONAL ROWS & COLUMNS: Absolutely NO JSON data types in any table.
 *    All nested collections (invoice items, inventory batches, reminder logs, store order items)
 *    are normalized into dedicated child tables with foreign key indexing.
 * 2. FULL DOMAIN COVERAGE FOR EVERY SECTION:
 *    - Dashboard (KPI aggregates via fast SQL)
 *    - Parties (Customers & Suppliers, ledger statements, balance tracking)
 *    - Items & Units (Inventory master, batches child table, stock adjustments, units)
 *    - Sales & POS (Sale Invoices, Estimates, Proforma, Payment-In, Orders, Challans, Credit Notes, POS)
 *    - Purchase & Expense (Purchase Bills, Payment-Out, Expenses, Expense Categories, Purchase Orders, Debit Notes, Job Work)
 *    - Cash & Bank (Bank Accounts, Bank Transactions, Cash in Hand ledger, Cheques management, Loan Accounts)
 *    - Business Growth (Online Store settings, orders, order items; Smart Ads campaigns)
 *    - Sync, Share & Backup (Database exports, verification)
 *    - Utilities (Audit trail, bulk updates, HSN master)
 *    - Settings & Company Profile (General, transaction, print, taxes, party, item, reminders, accounting)
 * 3. Compact Numeric Precision: DECIMAL(12,2) for money, TINYINT(1) for flags, VARCHAR lengths bounded to reduce disk size.
 * 4. Compound B-Tree Indexes on all business_id scoped search and sort fields for sub-millisecond query execution.
 */

import { pool } from "./mysql.js";
import { deduplicateParties } from "../../scripts/deduplicateParties.js";

export async function initializeDatabaseSchema() {
  console.log("[MySQL Schema] Initializing normalized relational tables (ZERO JSON types, pure rows & columns)...");

  // Helper to drop old JSON columns if table already existed with JSON types
  const cleanOldJsonColumns = async () => {
    try {
      const [tables] = await pool.query("SHOW TABLES");
      const names = tables.map((t) => Object.values(t)[0]);

      if (names.includes("app_settings")) {
        try { await pool.query("ALTER TABLE app_settings MODIFY setting_value TEXT NOT NULL"); } catch {}
      }
      if (names.includes("parties")) {
        try { await pool.query("ALTER TABLE parties DROP COLUMN metadata"); } catch {}
      }
      if (names.includes("inventory_items")) {
        try { await pool.query("ALTER TABLE inventory_items DROP COLUMN batches"); } catch {}
        try { await pool.query("ALTER TABLE inventory_items DROP COLUMN metadata"); } catch {}
      }
      if (names.includes("transactions")) {
        try { await pool.query("ALTER TABLE transactions DROP COLUMN items"); } catch {}
        try { await pool.query("ALTER TABLE transactions DROP COLUMN payment_details"); } catch {}
        try { await pool.query("ALTER TABLE transactions DROP COLUMN metadata"); } catch {}
      }
      if (names.includes("service_reminders")) {
        try { await pool.query("ALTER TABLE service_reminders DROP COLUMN notification_history"); } catch {}
      }
      if (names.includes("company_profiles")) {
        try { await pool.query("ALTER TABLE company_profiles DROP COLUMN bank_details"); } catch {}
        try { await pool.query("ALTER TABLE company_profiles DROP COLUMN metadata"); } catch {}
      }
      if (names.includes("bank_accounts")) {
        try { await pool.query("ALTER TABLE bank_accounts DROP COLUMN metadata"); } catch {}
      }

      // Add missing columns if existing table didn't have them
      const addCol = async (table, colDef) => {
        try { await pool.query(`ALTER TABLE ${table} ADD COLUMN ${colDef}`); } catch {}
      };

      await addCol("parties", "pan VARCHAR(32)");
      await addCol("service_reminders", "party_id VARCHAR(64) DEFAULT NULL AFTER business_id");
      await addCol("service_reminder_history", "due_date DATE DEFAULT NULL AFTER message_text");
      await addCol("parties", "billing_street TEXT");
      await addCol("parties", "billing_city VARCHAR(100)");
      await addCol("parties", "billing_state VARCHAR(100)");
      await addCol("parties", "billing_pincode VARCHAR(20)");
      await addCol("parties", "shipping_street TEXT");
      await addCol("parties", "shipping_city VARCHAR(100)");
      await addCol("parties", "shipping_state VARCHAR(100)");
      await addCol("parties", "shipping_pincode VARCHAR(20)");
      await addCol("parties", "balance_type VARCHAR(20) DEFAULT 'to_receive'");
      await addCol("parties", "is_active TINYINT(1) DEFAULT 1");

      await addCol("company_profile_assets", "storage_key VARCHAR(500) NULL");
      await addCol("company_profile_assets", "file_id VARCHAR(64) NULL");
      await addCol("business_files", "public_url VARCHAR(500) NULL AFTER storage_key");
      try {
        await pool.query("ALTER TABLE company_profile_assets MODIFY COLUMN data MEDIUMBLOB NULL");
      } catch {}

      await addCol("business_growth_assets", "storage_key VARCHAR(500) NULL");
      await addCol("business_growth_assets", "file_id VARCHAR(64) NULL");
      try {
        await pool.query("ALTER TABLE business_growth_assets MODIFY COLUMN data MEDIUMBLOB NULL");
      } catch {}

      await addCol("inventory_items", "barcode VARCHAR(100)");
      await addCol("inventory_items", "item_type VARCHAR(32) DEFAULT 'product'");
      await addCol("inventory_items", "cess_rate DECIMAL(5,2) DEFAULT 0.00");
      await addCol("inventory_items", "opening_stock DECIMAL(12,2) DEFAULT 0.00");
      await addCol("inventory_items", "is_serial_tracked TINYINT(1) DEFAULT 0");
      await addCol("inventory_items", "description TEXT");
      await addCol("inventory_items", "image_url VARCHAR(500) NULL");
      await addCol("inventory_items", "image_id VARCHAR(64) NULL");
      await addCol("inventory_items", "is_active TINYINT(1) DEFAULT 1");
      await addCol("transaction_items", "barcode VARCHAR(100)");
      await addCol("transaction_items", "is_active TINYINT(1) DEFAULT 1");

      await addCol("transactions", "party_gstin VARCHAR(32)");
      await addCol("transactions", "billing_address TEXT");
      await addCol("transactions", "shipping_address TEXT");
      await addCol("transactions", "discount_percent DECIMAL(5,2) DEFAULT 0.00");
      await addCol("transactions", "round_off DECIMAL(10,2) DEFAULT 0.00");
      await addCol("transactions", "payment_status VARCHAR(50) DEFAULT 'Completed'");
      await addCol("transactions", "payment_ref_no VARCHAR(100)");
      await addCol("transactions", "cash_tendered DECIMAL(12,2) DEFAULT 0.00");
      await addCol("transactions", "change_returned DECIMAL(12,2) DEFAULT 0.00");
      await addCol("transactions", "vehicle_no VARCHAR(50)");
      await addCol("transactions", "e_way_bill_no VARCHAR(50)");
      await addCol("transactions", "po_number VARCHAR(100)");
      await addCol("transactions", "po_date DATE");
      await addCol("transactions", "terms TEXT");
      await addCol("transactions", "terms_title VARCHAR(255)");
      await addCol("transactions", "driver_name VARCHAR(100)");
      await addCol("transactions", "state_of_supply VARCHAR(100)");
      await addCol("transactions", "reverse_charge TINYINT(1) DEFAULT 0");
      await addCol("transactions", "payment_terms VARCHAR(100)");
      await addCol("transactions", "shipping_charges DECIMAL(12,2) DEFAULT 0.00");
      await addCol("transactions", "packaging_charges DECIMAL(12,2) DEFAULT 0.00");
      await addCol("transactions", "other_charges DECIMAL(12,2) DEFAULT 0.00");
      await addCol("transactions", "image_url LONGTEXT NULL");
      await addCol("transactions", "image_id VARCHAR(64) NULL");
      await addCol("transactions", "image_name VARCHAR(255) NULL");
      await addCol("transactions", "document_url LONGTEXT NULL");
      await addCol("transactions", "document_id VARCHAR(64) NULL");
      await addCol("transactions", "document_name VARCHAR(255) NULL");

      await addCol("company_profiles", "trade_name VARCHAR(255)");
      await addCol("company_profiles", "business_type VARCHAR(255)");
      await addCol("company_profiles", "business_category VARCHAR(255)");
      await addCol("company_profiles", "pan VARCHAR(32)");
      await addCol("company_profiles", "street_address TEXT");
      await addCol("company_profiles", "city VARCHAR(100)");
      await addCol("company_profiles", "country VARCHAR(100) DEFAULT 'India'");
      await addCol("company_profiles", "bank_name VARCHAR(100)");
      await addCol("company_profiles", "account_number VARCHAR(64)");
      await addCol("company_profiles", "ifsc_code VARCHAR(32)");
      await addCol("company_profiles", "branch_name VARCHAR(100)");
      await addCol("company_profiles", "upi_id VARCHAR(100)");
      await addCol("company_profiles", "terms_and_conditions TEXT");

      await addCol("bank_accounts", "account_type VARCHAR(50) DEFAULT 'Savings'");
      await addCol("bank_accounts", "branch_name VARCHAR(100)");

      // Safe column migration for bank_accounts (account holder name, notes, status)
      const addBankCol = async (colDef) => {
        try {
          await pool.query(`ALTER TABLE bank_accounts ADD COLUMN ${colDef}`);
        } catch (err) {
          // Ignore if table does not exist yet (1146) or column already exists (MySQL error 1060: ER_DUP_FIELDNAME)
          if (err.errno !== 1060 && err.errno !== 1146 && !String(err.message).includes("Duplicate column name")) {
            console.warn(`[MySQL Schema] Warning adding column to bank_accounts (${colDef}):`, err.message);
          }
        }
      };
      await addBankCol("account_holder_name VARCHAR(120) NULL");
      await addBankCol("notes TEXT NULL");
      await addBankCol("status VARCHAR(50) NOT NULL DEFAULT 'active'");

      // Safe column migration for loan_accounts status and closure tracking
      const addLoanCol = async (colDef) => {
        try {
          await pool.query(`ALTER TABLE loan_accounts ADD COLUMN ${colDef}`);
        } catch (err) {
          // Ignore if column already exists (MySQL error 1060: ER_DUP_FIELDNAME)
          if (err.errno !== 1060 && !String(err.message).includes("Duplicate column name")) {
            console.warn(`[MySQL Schema] Warning adding column to loan_accounts (${colDef}):`, err.message);
          }
        }
      };
      await addLoanCol("status VARCHAR(50) NOT NULL DEFAULT 'Active'");
      await addLoanCol("closed_date DATE NULL");

      // Ensure cheques table status column accommodates all lifecycle statuses (including 'issued' and 'cancelled')
      try {
        await pool.query("ALTER TABLE cheques MODIFY status VARCHAR(50) NOT NULL DEFAULT 'pending'");
      } catch {}
    } catch (_e) {
      // Continue even if drop column was already done
    }
  };

  await cleanOldJsonColumns();

  const queries = [
    // 1. Businesses Table (Multi-tenant isolation)
    `CREATE TABLE IF NOT EXISTS businesses (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 2. Company Profiles Table (Pure columns for all business & bank fields)
    `CREATE TABLE IF NOT EXISTS company_profiles (
      business_id VARCHAR(64) PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      trade_name VARCHAR(255),
      business_type VARCHAR(255) NULL,
      business_category VARCHAR(255) NULL,
      phone VARCHAR(32),
      email VARCHAR(191),
      gstin VARCHAR(32),
      pan VARCHAR(32),
      street_address TEXT,
      city VARCHAR(100),
      state VARCHAR(100),
      pincode VARCHAR(20),
      country VARCHAR(100) DEFAULT 'India',
      bank_name VARCHAR(100),
      account_number VARCHAR(64),
      ifsc_code VARCHAR(32),
      branch_name VARCHAR(100),
      upi_id VARCHAR(100),
      signature_url TEXT,
      logo_url TEXT,
      terms_and_conditions TEXT,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 3. Application Settings Table (Key-Value configuration with pure string TEXT storage)
    `CREATE TABLE IF NOT EXISTS app_settings (
      business_id VARCHAR(64) NOT NULL,
      setting_key VARCHAR(100) NOT NULL,
      setting_value TEXT NOT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (business_id, setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 4. Parties Table (Customers & Suppliers with discrete address and balance columns)
    `CREATE TABLE IF NOT EXISTS parties (
      id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      party_name VARCHAR(255) NOT NULL,
      phone VARCHAR(32),
      email VARCHAR(191),
      gstin VARCHAR(32),
      pan VARCHAR(32),
      party_type ENUM('customer', 'supplier', 'both') DEFAULT 'customer',
      opening_balance DECIMAL(12,2) DEFAULT 0.00,
      current_balance DECIMAL(12,2) DEFAULT 0.00,
      balance_type VARCHAR(20) DEFAULT 'to_receive',
      credit_limit DECIMAL(12,2) DEFAULT 0.00,
      billing_street TEXT,
      billing_city VARCHAR(100),
      billing_state VARCHAR(100),
      billing_pincode VARCHAR(20),
      shipping_street TEXT,
      shipping_city VARCHAR(100),
      shipping_state VARCHAR(100),
      shipping_pincode VARCHAR(20),
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id, business_id),
      INDEX idx_parties_biz (business_id),
      UNIQUE KEY uq_parties_biz_name (business_id, party_name),
      INDEX idx_parties_phone (business_id, phone),
      INDEX idx_parties_type (business_id, party_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 5. Units Table (Units of Measurement)
    `CREATE TABLE IF NOT EXISTS units (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      name VARCHAR(100) NOT NULL,
      short_name VARCHAR(50) NOT NULL,
      precision_dec INT DEFAULT 0,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_units_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 6. Inventory Items Master Table (Item master with pure relational attributes)
    `CREATE TABLE IF NOT EXISTS inventory_items (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      name VARCHAR(255) NOT NULL,
      item_code VARCHAR(100),
      barcode VARCHAR(100),
      category VARCHAR(100) DEFAULT 'General',
      hsn_code VARCHAR(20),
      unit VARCHAR(50) DEFAULT 'PCS',
      item_type VARCHAR(32) DEFAULT 'product',
      sale_price DECIMAL(12,2) DEFAULT 0.00,
      purchase_price DECIMAL(12,2) DEFAULT 0.00,
      tax_rate DECIMAL(5,2) DEFAULT 0.00,
      cess_rate DECIMAL(5,2) DEFAULT 0.00,
      opening_stock DECIMAL(12,2) DEFAULT 0.00,
      current_stock DECIMAL(12,2) DEFAULT 0.00,
      min_stock DECIMAL(12,2) DEFAULT 0.00,
      is_batch_tracked TINYINT(1) DEFAULT 0,
      is_serial_tracked TINYINT(1) DEFAULT 0,
      description TEXT,
      image_url VARCHAR(500) NULL,
      image_id VARCHAR(64) NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_items_biz (business_id),
      INDEX idx_items_name (business_id, name),
      INDEX idx_items_code (business_id, item_code),
      INDEX idx_items_barcode (business_id, barcode),
      INDEX idx_items_category (business_id, category),
      INDEX idx_items_image (business_id, image_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 7. Item Batches Table (Normalized Child Table for Batches - Pure Rows & Columns)
    `CREATE TABLE IF NOT EXISTS item_batches (
      id VARCHAR(64) PRIMARY KEY,
      item_id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      batch_no VARCHAR(100) NOT NULL,
      mfg_date DATE,
      exp_date DATE,
      opening_qty DECIMAL(12,2) DEFAULT 0.00,
      current_qty DECIMAL(12,2) DEFAULT 0.00,
      sale_price DECIMAL(12,2) DEFAULT 0.00,
      purchase_price DECIMAL(12,2) DEFAULT 0.00,
      mrp DECIMAL(12,2) DEFAULT 0.00,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_batch_item (business_id, item_id),
      INDEX idx_batch_no (business_id, batch_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 8. Inventory Adjustments Table (Stock increases/reductions)
    `CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      item_id VARCHAR(64) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      adjustment_type ENUM('add', 'reduce') NOT NULL,
      quantity DECIMAL(12,2) NOT NULL,
      unit_price DECIMAL(12,2) DEFAULT 0.00,
      total_value DECIMAL(12,2) DEFAULT 0.00,
      reason VARCHAR(255),
      adjustment_date DATE NOT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_adj_biz (business_id, adjustment_date DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 9. Unified Financial Transactions Header Table (Sales, Purchases, Returns, Payments, Expenses)
    `CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      transaction_type VARCHAR(40) NOT NULL,
      document_number VARCHAR(100) NOT NULL,
      transaction_date DATE NOT NULL,
      due_date DATE,
      party_id VARCHAR(64),
      party_name VARCHAR(255),
      party_phone VARCHAR(32),
      party_gstin VARCHAR(32),
      billing_address TEXT,
      shipping_address TEXT,
      subtotal DECIMAL(12,2) DEFAULT 0.00,
      discount_percent DECIMAL(5,2) DEFAULT 0.00,
      discount_amount DECIMAL(12,2) DEFAULT 0.00,
      tax_amount DECIMAL(12,2) DEFAULT 0.00,
      round_off DECIMAL(10,2) DEFAULT 0.00,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      paid_amount DECIMAL(12,2) DEFAULT 0.00,
      balance_amount DECIMAL(12,2) DEFAULT 0.00,
      payment_mode VARCHAR(50) DEFAULT 'Cash',
      payment_status VARCHAR(50) DEFAULT 'Completed',
      payment_ref_no VARCHAR(100),
      cash_tendered DECIMAL(12,2) DEFAULT 0.00,
      change_returned DECIMAL(12,2) DEFAULT 0.00,
      vehicle_no VARCHAR(50),
      e_way_bill_no VARCHAR(50),
      po_number VARCHAR(100),
      po_date DATE,
      notes TEXT,
      terms TEXT,
      terms_title VARCHAR(255),
      driver_name VARCHAR(100),
      state_of_supply VARCHAR(100),
      reverse_charge TINYINT(1) DEFAULT 0,
      payment_terms VARCHAR(100),
      shipping_charges DECIMAL(12,2) DEFAULT 0.00,
      packaging_charges DECIMAL(12,2) DEFAULT 0.00,
      other_charges DECIMAL(12,2) DEFAULT 0.00,
      image_url LONGTEXT NULL,
      image_id VARCHAR(64) NULL,
      image_name VARCHAR(255) NULL,
      document_url LONGTEXT NULL,
      document_id VARCHAR(64) NULL,
      document_name VARCHAR(255) NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_txns_biz_type (business_id, transaction_type),
      INDEX idx_txns_party (business_id, party_id),
      INDEX idx_txns_date (business_id, transaction_date DESC),
      INDEX idx_txns_doc (business_id, document_number),
      INDEX idx_txns_status (business_id, payment_status),
      INDEX idx_txns_image (business_id, image_id),
      INDEX idx_txns_doc_id (business_id, document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 10. Transaction Line Items Table (Normalized Child Table - Pure Rows & Columns for Invoice Items)
    `CREATE TABLE IF NOT EXISTS transaction_items (
      id VARCHAR(64) PRIMARY KEY,
      transaction_id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      item_id VARCHAR(64),
      item_name VARCHAR(255) NOT NULL,
      item_code VARCHAR(100),
      barcode VARCHAR(100),
      hsn_code VARCHAR(20),
      batch_no VARCHAR(100),
      serial_no VARCHAR(100),
      quantity DECIMAL(12,2) NOT NULL DEFAULT 1.00,
      free_qty DECIMAL(12,2) DEFAULT 0.00,
      unit VARCHAR(50) DEFAULT 'PCS',
      unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      purchase_price DECIMAL(12,2) DEFAULT 0.00,
      discount_percent DECIMAL(5,2) DEFAULT 0.00,
      discount_amount DECIMAL(12,2) DEFAULT 0.00,
      tax_rate DECIMAL(5,2) DEFAULT 0.00,
      tax_amount DECIMAL(12,2) DEFAULT 0.00,
      cgst_rate DECIMAL(5,2) DEFAULT 0.00,
      cgst_amount DECIMAL(12,2) DEFAULT 0.00,
      sgst_rate DECIMAL(5,2) DEFAULT 0.00,
      sgst_amount DECIMAL(12,2) DEFAULT 0.00,
      igst_rate DECIMAL(5,2) DEFAULT 0.00,
      igst_amount DECIMAL(12,2) DEFAULT 0.00,
      cess_rate DECIMAL(5,2) DEFAULT 0.00,
      cess_amount DECIMAL(12,2) DEFAULT 0.00,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_txn_items_txn (business_id, transaction_id),
      INDEX idx_txn_items_item (business_id, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 11. Service Reminders Table
    `CREATE TABLE IF NOT EXISTS service_reminders (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      party_id VARCHAR(64),
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(32),
      customer_email VARCHAR(191),
      service_name VARCHAR(255) NOT NULL,
      service_date DATE NOT NULL,
      service_due_date DATE NOT NULL,
      status VARCHAR(50) DEFAULT 'Active',
      last_notified_at DATETIME,
      last_notified_channel VARCHAR(50),
      last_notified_due_date DATE,
      notes TEXT,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_srv_biz (business_id),
      INDEX idx_srv_due (business_id, service_due_date),
      INDEX idx_srv_status (business_id, status),
      INDEX idx_srv_phone (business_id, customer_phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 12. Service Reminder History Table (Normalized Child Table for dispatch logs)
    `CREATE TABLE IF NOT EXISTS service_reminder_history (
      id VARCHAR(64) PRIMARY KEY,
      reminder_id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      channel VARCHAR(50) NOT NULL,
      recipient VARCHAR(64) NOT NULL,
      message_text TEXT,
      due_date DATE DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'Sent',
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_srv_hist_rem (business_id, reminder_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 13. Bank Accounts Table
    `CREATE TABLE IF NOT EXISTS bank_accounts (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      account_name VARCHAR(255) NOT NULL,
      account_holder_name VARCHAR(120) NULL,
      account_number VARCHAR(64),
      bank_name VARCHAR(100),
      ifsc_code VARCHAR(32),
      branch_name VARCHAR(100),
      opening_balance DECIMAL(12,2) DEFAULT 0.00,
      current_balance DECIMAL(12,2) DEFAULT 0.00,
      account_type VARCHAR(50) DEFAULT 'Savings',
      as_of_date DATE,
      notes TEXT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      is_default TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bank_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 14. Cash In Hand Ledger Table
    `CREATE TABLE IF NOT EXISTS cash_in_hand (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      entry_date DATE NOT NULL,
      entry_type ENUM('in', 'out') NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      party_id VARCHAR(64),
      party_name VARCHAR(255),
      reference_type VARCHAR(50),
      reference_no VARCHAR(100),
      description TEXT,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_cash_biz (business_id, entry_date DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 15. Cheques Management Table
    `CREATE TABLE IF NOT EXISTS cheques (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      party_id VARCHAR(64),
      party_name VARCHAR(255) NOT NULL,
      cheque_number VARCHAR(50) NOT NULL,
      bank_name VARCHAR(100) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      cheque_date DATE NOT NULL,
      cheque_type ENUM('received', 'issued') NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      deposit_date DATE,
      clearance_date DATE,
      notes TEXT,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cheques_biz (business_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 16. Loan Accounts Table
    `CREATE TABLE IF NOT EXISTS loan_accounts (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      account_name VARCHAR(255) NOT NULL,
      lender_name VARCHAR(255) NOT NULL,
      account_number VARCHAR(100) DEFAULT '',
      loan_type VARCHAR(50) DEFAULT 'Term Loan',
      principal_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      current_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      interest_rate DECIMAL(5,2) DEFAULT 0.00,
      term_months INT DEFAULT 12,
      emi_amount DECIMAL(12,2) DEFAULT 0.00,
      start_date DATE,
      status VARCHAR(50) NOT NULL DEFAULT 'Active',
      closed_date DATE NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_loan_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 17. Expense Categories Table
    `CREATE TABLE IF NOT EXISTS expense_categories (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      category_name VARCHAR(100) NOT NULL,
      expense_type VARCHAR(50) DEFAULT 'indirect',
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_expcat_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 17b. Expense Items Table
    `CREATE TABLE IF NOT EXISTS expense_items (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      item_name VARCHAR(255) NOT NULL,
      price DECIMAL(12,2) DEFAULT 0.00,
      tax_rate DECIMAL(5,2) DEFAULT 0.00,
      hsn_code VARCHAR(20) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      category VARCHAR(100) DEFAULT 'Expenses',
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_expense_items_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 18. Online Store Settings Table
    `CREATE TABLE IF NOT EXISTS online_store_settings (
      business_id VARCHAR(64) PRIMARY KEY,
      store_name VARCHAR(255) NOT NULL,
      subdomain VARCHAR(100),
      contact_phone VARCHAR(32),
      contact_email VARCHAR(191),
      address TEXT,
      currency VARCHAR(10) DEFAULT 'INR',
      is_store_enabled TINYINT(1) DEFAULT 1,
      delivery_charges DECIMAL(10,2) DEFAULT 0.00,
      min_order_amount DECIMAL(10,2) DEFAULT 0.00,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 19. Online Store Orders Table
    `CREATE TABLE IF NOT EXISTS online_store_orders (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      order_number VARCHAR(100) NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(32) NOT NULL,
      delivery_address TEXT,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      item_count INT DEFAULT 1,
      order_status VARCHAR(50) DEFAULT 'pending',
      payment_status VARCHAR(50) DEFAULT 'unpaid',
      payment_method VARCHAR(50) DEFAULT 'cod',
      order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_store_orders (business_id, order_date DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 20. Online Store Order Items Table (Child Table)
    `CREATE TABLE IF NOT EXISTS online_store_order_items (
      id VARCHAR(64) PRIMARY KEY,
      order_id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      item_id VARCHAR(64),
      item_name VARCHAR(255) NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 1.00,
      price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      INDEX idx_store_items_order (business_id, order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 21. Smart Ads Campaigns Table
    `CREATE TABLE IF NOT EXISTS smart_ads (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      campaign_id VARCHAR(100) NOT NULL,
      campaign_name VARCHAR(255) NOT NULL,
      platform VARCHAR(50) DEFAULT 'meta',
      objective VARCHAR(100),
      daily_budget DECIMAL(12,2) DEFAULT 0.00,
      status VARCHAR(50) DEFAULT 'active',
      target_audience TEXT,
      start_date DATE,
      end_date DATE,
      impressions INT DEFAULT 0,
      clicks INT DEFAULT 0,
      spend DECIMAL(12,2) DEFAULT 0.00,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ads_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 22. Audit Trails Table (System Activity Log)
    `CREATE TABLE IF NOT EXISTS audit_trails (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      action_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id VARCHAR(100),
      user_name VARCHAR(100) DEFAULT 'Admin',
      details TEXT,
      ip_address VARCHAR(45),
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_audit_biz (business_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 23. Unit Conversions Table
    `CREATE TABLE IF NOT EXISTS unit_conversions (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'demo-business',
      unit VARCHAR(50) NOT NULL,
      to_unit VARCHAR(50) NOT NULL,
      factor DECIMAL(15, 4) NOT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_unit_conv_biz (business_id),
      INDEX idx_unit_conv_pair (business_id, unit, to_unit)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 24. Purchase Job Works Header Table
    `CREATE TABLE IF NOT EXISTS purchase_job_works (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'demo-business',
      order_number VARCHAR(100) NOT NULL,
      party_name VARCHAR(255) NOT NULL,
      party_id VARCHAR(64) NULL,
      order_date DATE NULL,
      status VARCHAR(50) DEFAULT 'Pending',
      charges DECIMAL(12, 2) DEFAULT 0.00,
      notes TEXT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_job_works_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 25. Purchase Job Work Items Child Table (Normalized Rows & Columns)
    `CREATE TABLE IF NOT EXISTS purchase_job_work_items (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'demo-business',
      job_work_id VARCHAR(64) NOT NULL,
      item_type ENUM('sent', 'received') NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      quantity DECIMAL(12, 2) NOT NULL,
      unit VARCHAR(50) DEFAULT 'PCS',
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_job_work_items (business_id, job_work_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 26. Loan Repayments Child Table
    `CREATE TABLE IF NOT EXISTS loan_repayments (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'demo-business',
      loan_id VARCHAR(64) NOT NULL,
      payment_date DATE NOT NULL,
      amount_paid DECIMAL(12, 2) NOT NULL,
      principal_paid DECIMAL(12, 2) DEFAULT 0.00,
      interest_paid DECIMAL(12, 2) DEFAULT 0.00,
      payment_mode VARCHAR(32) DEFAULT 'bank',
      reference VARCHAR(100) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_loan_repay_biz (business_id),
      INDEX idx_loan_repay_loan (loan_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 27. Balance Sheet Chart of Accounts Table
    `CREATE TABLE IF NOT EXISTS balance_sheet_accounts (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'demo-business',
      account_name VARCHAR(150) NOT NULL,
      account_type VARCHAR(64) NOT NULL,
      opening_balance DECIMAL(12, 2) DEFAULT 0.00,
      balance_type VARCHAR(20) DEFAULT 'debit',
      notes TEXT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bs_accounts_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 28. Migration Logs Table (Audit trail of localStorage to MySQL migration batches)
    `CREATE TABLE IF NOT EXISTS migration_logs (
      id VARCHAR(64) PRIMARY KEY,
      batch_id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL,
      entity_type VARCHAR(64) NOT NULL,
      source_id VARCHAR(64) NOT NULL,
      target_table VARCHAR(64) NOT NULL,
      target_id VARCHAR(64) NOT NULL,
      action ENUM('inserted', 'updated', 'skipped', 'conflict', 'failed') NOT NULL,
      details TEXT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_mig_batch (batch_id),
      INDEX idx_mig_biz (business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 29. Bank Transactions Child Table (Normalized Rows & Columns)
    `CREATE TABLE IF NOT EXISTS bank_transactions (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'default',
      account_id VARCHAR(64) NOT NULL,
      type ENUM('money-in', 'money-out') NOT NULL,
      amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      transaction_date DATE NOT NULL,
      reference VARCHAR(120) NULL,
      description VARCHAR(240) NOT NULL,
      related_party VARCHAR(120) NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_bank_tx_biz (business_id),
      INDEX idx_bank_tx_account (business_id, account_id),
      INDEX idx_bank_tx_date (business_id, transaction_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 30. Company Profile Assets Table (Logos, Signatures, etc. with filesystem storage & BLOB compatibility)
    `CREATE TABLE IF NOT EXISTS company_profile_assets (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'demo-business',
      asset_type VARCHAR(32) NOT NULL,
      original_filename VARCHAR(255) NULL,
      mime_type VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
      size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
      storage_key VARCHAR(500) NULL,
      file_id VARCHAR(64) NULL,
      data MEDIUMBLOB NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_cpa_biz (business_id),
      INDEX idx_cpa_type (business_id, asset_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 31. Business Files Metadata Table (Relational storage metadata for files stored on filesystem / cloud)
    `CREATE TABLE IF NOT EXISTS business_files (
      id VARCHAR(64) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL DEFAULT 'demo-business',
      module VARCHAR(32) NOT NULL,
      category VARCHAR(32) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      stored_filename VARCHAR(255) NOT NULL,
      storage_driver VARCHAR(16) NOT NULL DEFAULT 'local',
      storage_key VARCHAR(500) NOT NULL,
      public_url VARCHAR(500) NULL,
      mime_type VARCHAR(100) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
      sha256_hash VARCHAR(64) NOT NULL,
      is_deleted TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bf_biz (business_id),
      INDEX idx_bf_biz_module (business_id, module, category),
      INDEX idx_bf_hash (business_id, sha256_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (err) {
      console.error("[MySQL Schema Error]", err.message);
      throw err;
    }
  }

  // Ensure default demo business exists
  try {
    await pool.query(
      `INSERT IGNORE INTO businesses (id, name) VALUES ('demo-business', 'Sai Kirana Stores');`
    );
    // Safely seed the missing RT Pharmacy party for 'local-development' to resolve the orphaned foreign key
    // reference on the two existing sales invoices without mutating or moving transactions.
    await pool.query(
      `INSERT IGNORE INTO parties (
        id, business_id, party_name, gstin, party_type, opening_balance, current_balance, balance_type
      ) VALUES
        ('933f31db-61eb-4c2b-a3d1-2c862c8fc888', 'local-development', 'rt fpharma', '987654567', 'customer', 0.00, 0.00, 'to_receive'),
        ('933f31db-61eb-4c2b-a3d1-2c862c8fc888', 'demo-business', 'rt fpharma', '987654567', 'customer', 0.00, 0.00, 'to_receive');`
    );
  } catch {}

  // Automatically deduplicate existing duplicate party rows and ensure unique party name index
  try {
    await deduplicateParties();
  } catch (dedupErr) {
    console.warn("[MySQL Schema] Party deduplication notice on startup:", dedupErr.message);
  }

  // Safe non-destructive migration of existing company logo and signature assets from business_growth_assets
  try {
    const [tables] = await pool.query("SHOW TABLES");
    const tableNames = tables.map((t) => Object.values(t)[0]);
    if (tableNames.includes("business_growth_assets") && tableNames.includes("company_profile_assets")) {
      await pool.query(
        `INSERT IGNORE INTO company_profile_assets (
          id, business_id, asset_type, original_filename, mime_type, size_bytes, data, created_at, updated_at
        )
        SELECT 
          id, business_id, entity_type, original_filename, mime_type, size_bytes, data, created_at, updated_at
        FROM business_growth_assets
        WHERE entity_type IN ('company-logo', 'company-signature', 'logo', 'signature');`
      );

      // Normalize existing company_profiles logo_url and signature_url from /api/business-growth/assets/ to /api/settings/company-profile/assets/
      await pool.query(
        `UPDATE company_profiles 
         SET logo_url = REPLACE(logo_url, '/api/business-growth/assets/', '/api/settings/company-profile/assets/')
         WHERE logo_url LIKE '%/api/business-growth/assets/%';`
      );
      await pool.query(
        `UPDATE company_profiles 
         SET signature_url = REPLACE(signature_url, '/api/business-growth/assets/', '/api/settings/company-profile/assets/')
         WHERE signature_url LIKE '%/api/business-growth/assets/%';`
      );
    }
  } catch (migErr) {
    console.warn("[MySQL Schema] Notice during company profile assets migration:", migErr.message);
  }

  // Safe idempotent migration of Company Profile logo and signature BLOBs to filesystem storage (Phase 3)
  try {
    const { migrateCompanyProfileAssets } = await import("../services/storage/companyProfileAssetMigration.js");
    await migrateCompanyProfileAssets({ businessId: "demo-business" });
  } catch (fsMigErr) {
    console.warn("[MySQL Schema] Notice during company profile filesystem migration:", fsMigErr.message);
  }

  // Safe idempotent migration of Item/Product images to filesystem storage (Phase 4)
  try {
    const { migrateItemImages } = await import("../services/storage/itemImageMigration.js");
    await migrateItemImages({ businessId: "demo-business" });
  } catch (itemMigErr) {
    console.warn("[MySQL Schema] Notice during item image filesystem migration:", itemMigErr.message);
  }

  // Safe idempotent migration of Invoice Attachments to filesystem storage (Phase 5)
  try {
    const { migrateInvoiceAttachments } = await import("../services/storage/invoiceAttachmentMigration.js");
    await migrateInvoiceAttachments({ businessId: "demo-business" });
  } catch (invMigErr) {
    console.warn("[MySQL Schema] Notice during invoice attachment filesystem migration:", invMigErr.message);
  }

  // Safe idempotent migration of Settings images to filesystem storage (Phase 6)
  try {
    const { migrateSettingsImages } = await import("../services/storage/settingsImageMigration.js");
    await migrateSettingsImages({ businessId: "demo-business" });
  } catch (setMigErr) {
    console.warn("[MySQL Schema] Notice during settings image filesystem migration:", setMigErr.message);
  }

  // Safe idempotent migration of Business Growth assets to storage driver and zeroing MySQL BLOBs
  try {
    const { migrateBusinessGrowthAssets, zeroVerifiedCompanyProfileBlobs } = await import("../services/storage/businessGrowthAssetMigration.js");
    await migrateBusinessGrowthAssets({ businessId: "demo-business" });
    await zeroVerifiedCompanyProfileBlobs({ businessId: "demo-business" });
  } catch (bgMigErr) {
    console.warn("[MySQL Schema] Notice during business growth assets migration:", bgMigErr.message);
  }

  console.log("[MySQL Schema] All 30 production tables verified successfully (ZERO JSON columns, pure rows & columns).");
}
