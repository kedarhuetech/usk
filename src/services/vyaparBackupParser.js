import { unzipSync } from "fflate";

export const VYAPAR_BACKUP_MAX_BYTES = 100 * 1024 * 1024;
const MAX_DATABASE_BYTES = 256 * 1024 * 1024;
const SQLITE_HEADER = "SQLite format 3\0";
const REQUIRED_TABLES = ["kb_firms", "kb_items", "kb_names"];

function selectRows(database, sql) {
  const result = database.exec(sql)[0];
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, values[index]])));
}

function countRows(database, table) {
  const escaped = table.replaceAll('"', '""');
  return Number(selectRows(database, `SELECT COUNT(*) AS count FROM "${escaped}"`)[0]?.count || 0);
}

function tableNames(database) {
  return new Set(selectRows(database, "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
}

function assertTableColumns(database, table, columns) {
  const escaped = table.replaceAll('"', '""');
  const available = new Set(selectRows(database, `PRAGMA table_info("${escaped}")`).map((row) => row.name));
  const missing = columns.filter((column) => !available.has(column));
  if (missing.length) throw new Error(`Unsupported Vyapar database schema: ${table} is missing required columns.`);
}

function getTableColumns(database, table) {
  if (!tableNames(database).has(table)) return new Set();
  const escaped = table.replaceAll('"', '""');
  return new Set(selectRows(database, `PRAGMA table_info("${escaped}")`).map((row) => row.name));
}

function projectColumns(columns, tableAlias, names) {
  return names.map(([column, alias = column]) =>
    columns.has(column) ? `${tableAlias}."${column}" AS "${alias}"` : `NULL AS "${alias}"`).join(", ");
}

function selectTransactions(database, tables) {
  if (!tables.has("kb_transactions")) return { transactions: [], count: 0, schemaSupported: true };
  const count = countRows(database, "kb_transactions");
  const columns = getTableColumns(database, "kb_transactions");
  const required = ["txn_id", "txn_name_id", "txn_type", "txn_date", "txn_ref_number_char"];
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length) return { transactions: [], count, schemaSupported: false };

  const partyColumns = getTableColumns(database, "kb_names");
  const messageConfigAvailable = tables.has("kb_txn_message_config");
  const transactionProjection = projectColumns(columns, "t", [
    ["txn_id"], ["txn_name_id"], ["txn_type"], ["txn_sub_type"], ["txn_date"],
    ["txn_due_date"], ["txn_ref_number_char"], ["txn_invoice_prefix"],
    ["txn_cash_amount"], ["txn_balance_amount"], ["txn_tax_amount"],
    ["txn_discount_amount"], ["txn_round_off_amount"], ["txn_description"],
    ["txn_payment_status"], ["txn_payment_type_id"], ["txn_payment_reference"],
  ]);
  const partyProjection = projectColumns(partyColumns, "n", [
    ["full_name", "partyName"], ["name_type", "partyTypeCode"],
    ["phone_number", "partyPhone"], ["email", "partyEmail"],
    ["name_gstin_number", "partyGstin"], ["name_state", "partyState"],
    ["address", "partyAddress"], ["pincode", "partyPincode"],
    ["name_shipping_address", "partyShippingAddress"], ["name_shipping_pincode", "partyShippingPincode"],
  ]);
  const typeHeaderProjection = messageConfigAvailable ? "cfg.txn_field_value AS typeHeader" : "NULL AS typeHeader";
  const transactions = selectRows(database, `SELECT ${transactionProjection}, ${partyProjection}, ${typeHeaderProjection}
    FROM kb_transactions t
    LEFT JOIN kb_names n ON n.name_id = t.txn_name_id
    ${messageConfigAvailable ? "LEFT JOIN kb_txn_message_config cfg ON cfg.txn_type = t.txn_type AND cfg.txn_field_name = 'Header'" : ""}
    ORDER BY t.txn_id`);

  const lineItemColumns = getTableColumns(database, "kb_lineitems");
  const requiredLineColumns = ["lineitem_id", "lineitem_txn_id", "item_id", "quantity", "priceperunit", "total_amount"];
  const lineItemsAvailable = requiredLineColumns.every((column) => lineItemColumns.has(column));
  const itemColumns = getTableColumns(database, "kb_items");
  const unitColumns = getTableColumns(database, "kb_item_units");
  const taxColumns = getTableColumns(database, "kb_tax_code");
  const lineItems = lineItemsAvailable ? selectRows(database, `SELECT
      ${projectColumns(lineItemColumns, "l", [
    ["lineitem_id"], ["lineitem_txn_id"], ["item_id"], ["quantity"], ["priceperunit"], ["total_amount"],
    ["lineitem_tax_amount"], ["lineitem_discount_amount"], ["lineitem_discount_percent"],
    ["lineitem_tax_id"], ["lineitem_unit_id"], ["lineitem_description"],
  ])}, ${projectColumns(itemColumns, "i", [["item_name"], ["item_code"], ["item_hsn_sac_code"]])},
      ${projectColumns(unitColumns, "u", [["unit_name"], ["unit_short_name"], ["unit_full_name_editable"]])},
      ${projectColumns(taxColumns, "tax", [["tax_rate"], ["tax_code_name"]])}
    FROM kb_lineitems l
    LEFT JOIN kb_items i ON i.item_id = l.item_id
    ${unitColumns.size ? "LEFT JOIN kb_item_units u ON u.unit_id = l.lineitem_unit_id" : ""}
    ${taxColumns.size ? "LEFT JOIN kb_tax_code tax ON tax.tax_code_id = l.lineitem_tax_id" : ""}
    ORDER BY l.lineitem_txn_id, l.lineitem_id`) : [];
  const linesByTransaction = new Map();
  for (const line of lineItems) {
    const key = String(line.lineitem_txn_id);
    if (!linesByTransaction.has(key)) linesByTransaction.set(key, []);
    linesByTransaction.get(key).push(line);
  }

  const paymentColumns = getTableColumns(database, "txn_payment_mapping");
  const paymentTypeColumns = getTableColumns(database, "kb_paymentTypes");
  const paymentMappings = paymentColumns.has("txn_id")
    ? selectRows(database, `SELECT
        ${projectColumns(paymentColumns, "p", [["txn_id"], ["payment_id"], ["amount"], ["payment_reference"], ["cheque_id"], ["id"]])},
        ${projectColumns(paymentTypeColumns, "type", [["paymentType_name"], ["paymentType_type"]])}
      FROM txn_payment_mapping p
      ${paymentTypeColumns.size ? "LEFT JOIN kb_paymentTypes type ON type.paymentType_id = p.payment_id" : ""}
      ORDER BY p.txn_id, p.id`)
    : [];
  const paymentsByTransaction = new Map();
  for (const payment of paymentMappings) {
    const key = String(payment.txn_id);
    if (!paymentsByTransaction.has(key)) paymentsByTransaction.set(key, []);
    paymentsByTransaction.get(key).push(payment);
  }
  return {
    count,
    schemaSupported: true,
    lineItemsAvailable,
    transactions: transactions.map((transaction) => ({
      ...transaction,
      lineItems: linesByTransaction.get(String(transaction.txn_id)) || [],
      payments: paymentsByTransaction.get(String(transaction.txn_id)) || [],
    })),
  };
}

export async function parseVyaparBackup(bytes, { openDatabase }) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("The selected Vyapar backup is empty.");
  if (bytes.length > VYAPAR_BACKUP_MAX_BYTES) throw new Error("This Vyapar backup exceeds the 100 MB import limit.");
  if (typeof openDatabase !== "function") throw new Error("A SQLite reader is unavailable in this browser.");

  let archive;
  try {
    archive = unzipSync(bytes, { filter: (entry) => entry.name.toLowerCase().endsWith(".vyp") && entry.originalSize <= MAX_DATABASE_BYTES });
  } catch (error) {
    throw new Error(`This .vyb file is not a readable ZIP backup or is encrypted: ${error.message}`, { cause: error });
  }
  const databaseFiles = Object.entries(archive).filter(([name]) => name.toLowerCase().endsWith(".vyp"));
  if (!databaseFiles.length) throw new Error("The backup contains no supported .vyp database within the 256 MB expanded-size limit.");
  if (databaseFiles.length !== 1) throw new Error("The backup must contain exactly one .vyp database; this archive has an ambiguous structure.");

  const [, databaseBytes] = databaseFiles[0];
  const signature = new TextDecoder().decode(databaseBytes.subarray(0, SQLITE_HEADER.length));
  if (signature !== SQLITE_HEADER) throw new Error("The .vyp file is not a SQLite database. This Vyapar backup format is unsupported.");

  let database;
  try {
    database = await openDatabase(databaseBytes);
    const integrity = selectRows(database, "PRAGMA quick_check")[0]?.quick_check;
    if (integrity !== "ok") throw new Error("The SQLite database failed its integrity check and may be corrupted.");
    const tables = tableNames(database);
    for (const table of REQUIRED_TABLES) {
      if (!tables.has(table)) throw new Error(`Unsupported Vyapar database schema: required table ${table} is missing.`);
    }
    assertTableColumns(database, "kb_firms", ["firm_name", "firm_phone", "firm_email", "firm_gstin_number", "firm_state", "firm_pincode", "firm_address"]);
    assertTableColumns(database, "kb_items", ["item_id", "item_name", "item_sale_unit_price", "item_purchase_unit_price", "item_stock_quantity", "item_min_stock_quantity", "item_type", "item_code", "base_unit_id", "category_id", "item_hsn_sac_code", "item_description"]);
    assertTableColumns(database, "kb_names", ["name_id", "full_name", "phone_number", "email", "amount", "name_type", "name_gstin_number", "name_state", "address", "pincode"]);

    const firmColumns = getTableColumns(database, "kb_firms");
    const firms = selectRows(database, `SELECT ${projectColumns(firmColumns, "f", [
      ["firm_id"], ["firm_name"], ["firm_phone"], ["firm_email"], ["firm_gstin_number"],
      ["firm_state"], ["firm_pincode"], ["firm_address"], ["firm_business_type"], ["firm_business_category"],
      ["firm_description"], ["firm_phone_secondary"], ["firm_bank_name"], ["firm_bank_account_number"],
      ["firm_bank_ifsc_code"], ["firm_dispatch_address"], ["firm_dispatch_pincode"],
    ])} FROM kb_firms f ORDER BY firm_id`);
    const itemColumns = getTableColumns(database, "kb_items");
    const unitColumns = getTableColumns(database, "kb_item_units");
    const categoryColumns = getTableColumns(database, "kb_item_categories");
    const itemTaxColumns = getTableColumns(database, "kb_tax_code");
    const items = selectRows(database, `SELECT
      ${projectColumns(itemColumns, "i", [
      ["item_id"], ["item_name"], ["item_sale_unit_price"], ["item_purchase_unit_price"],
      ["item_stock_quantity"], ["item_min_stock_quantity"], ["item_type"], ["item_code"],
      ["base_unit_id"], ["category_id"], ["item_hsn_sac_code"], ["item_description"],
      ["item_is_active"], ["item_tax_id"], ["item_tax_type"], ["item_tax_type_purchase"],
      ["item_wholesale_price"], ["item_min_wholesale_qty"], ["item_date_created"],
    ])}, ${projectColumns(unitColumns, "u", [["unit_full_name_editable"], ["unit_name"], ["unit_short_name"]])},
      ${projectColumns(categoryColumns, "c", [["item_category_name"]])},
      ${projectColumns(itemTaxColumns, "tax", [["tax_rate", "item_tax_rate"], ["tax_code_name", "item_tax_name"]])}
      FROM kb_items i
      ${unitColumns.size ? "LEFT JOIN kb_item_units u ON u.unit_id = i.base_unit_id" : ""}
      ${categoryColumns.size ? "LEFT JOIN kb_item_categories c ON c.item_category_id = i.category_id" : ""}
      ${itemTaxColumns.size ? "LEFT JOIN kb_tax_code tax ON tax.tax_code_id = i.item_tax_id" : ""}
      ORDER BY i.item_id`);
    const nameColumns = getTableColumns(database, "kb_names");
    const parties = selectRows(database, `SELECT ${projectColumns(nameColumns, "n", [
      ["name_id"], ["full_name"], ["phone_number"], ["email"], ["amount"], ["name_type"],
      ["name_gstin_number"], ["name_state"], ["address"], ["pincode"], ["name_is_active"],
      ["name_tin_number"], ["name_shipping_address"], ["name_shipping_pincode"], ["name_country"],
      ["credit_limit"], ["credit_limit_enabled"], ["party_billing_name"],
    ])} FROM kb_names n ORDER BY name_id`);
    const transactionData = selectTransactions(database, tables);
    const extraCounts = {
      inventoryAdjustments: tables.has("kb_item_adjustments") ? countRows(database, "kb_item_adjustments") : 0,
      chequeStatuses: tables.has("kb_cheque_status") ? countRows(database, "kb_cheque_status") : 0,
      loanAccounts: tables.has("loan_accounts") ? countRows(database, "loan_accounts") : 0,
      loanTransactions: tables.has("loan_transactions") ? countRows(database, "loan_transactions") : 0,
    };
    const databaseSummary = {
      transactions: transactionData.count,
      transactionSchemaSupported: transactionData.schemaSupported,
      lineItemsAvailable: transactionData.lineItemsAvailable ?? false,
      extraCounts,
    };
    return {
      firm: firms[0] || null,
      extraFirms: Math.max(0, firms.length - 1),
      items,
      parties,
      transactions: transactionData.transactions,
      databaseSummary,
    };
  } catch (error) {
    if (/Unsupported Vyapar database schema|SQLite database failed/.test(error.message)) throw error;
    throw new Error(`Could not read the Vyapar SQLite database: ${error.message}`, { cause: error });
  } finally {
    database?.close();
  }
}
