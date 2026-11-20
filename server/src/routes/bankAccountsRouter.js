/**
 * Bank Accounts & Transactions Relational API Router
 * 
 * Strict Production Relational Architecture (ZERO JSON Data Types):
 * - Bank accounts stored in normalized `bank_accounts` table.
 * - Append-only transactions stored in normalized `bank_transactions` child table.
 * - Atomic transactional balance reconciliation and deletion protection.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

function isValidIsoDate(value) {
  const dateStr = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateStr;
}

function mapBankRow(row) {
  const openingBal = parseFloat(row.opening_balance) || 0;
  const currentBal = parseFloat(row.current_balance) || 0;
  return {
    id: row.id,
    businessId: row.business_id,
    accountName: row.account_name,
    name: row.account_name,
    accountHolderName: row.account_holder_name || "",
    accountNumber: row.account_number || "",
    bankName: row.bank_name || "",
    ifsc: row.ifsc_code || "",
    ifscCode: row.ifsc_code || "",
    branch: row.branch_name || "",
    branchName: row.branch_name || "",
    openingBalance: openingBal,
    openingBalanceDate: row.as_of_date || "",
    asOfDate: row.as_of_date || "",
    currentBalance: currentBal,
    balance: currentBal,
    accountType: row.account_type || "Savings",
    notes: row.notes || "",
    status: row.status || "active",
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransactionRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    accountId: row.account_id,
    type: row.type,
    amount: parseFloat(row.amount) || 0,
    date: row.transaction_date,
    transactionDate: row.transaction_date,
    reference: row.reference || "",
    description: row.description || "",
    relatedParty: row.related_party || "",
    createdAt: row.created_at,
  };
}

// ============================================================================
// 1. BANK ACCOUNTS CRUD
// ============================================================================

/**
 * GET /api/bank-accounts
 * Lists all bank accounts for the active business context.
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT id, business_id, account_name, account_holder_name, account_number, bank_name,
              ifsc_code, branch_name, opening_balance, current_balance,
              account_type, as_of_date, notes, status, is_default, created_at, updated_at
       FROM bank_accounts
       WHERE business_id = ?
       ORDER BY is_default DESC, account_name ASC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map(mapBankRow),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/bank-accounts/transactions
 * Lists all bank transactions for the active business, with optional account filter.
 * NOTE: Defined before /:id routes so "transactions" is not treated as an account id.
 */
router.get("/transactions", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const accountId = req.query.accountId ? String(req.query.accountId).trim() : null;

    let sql = `SELECT id, business_id, account_id, type, amount, transaction_date, reference, description, related_party, created_at
               FROM bank_transactions
               WHERE business_id = ?`;
    const params = [businessId];

    if (accountId) {
      sql += " AND account_id = ?";
      params.push(accountId);
    }

    sql += " ORDER BY transaction_date DESC, created_at DESC";

    const [rows] = await pool.query(sql, params);
    return res.json({
      success: true,
      data: rows.map(mapTransactionRow),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/bank-accounts/transactions
 * Atomically records a money-in / money-out transaction and recalculates the account's book balance.
 */
router.post("/transactions", async (req, res) => {
  let connection;
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const accountId = String(body.accountId || "").trim();
    if (!accountId) {
      return res.status(400).json({ success: false, message: "Bank account is required." });
    }

    const type = body.type;
    if (!["money-in", "money-out"].includes(type)) {
      return res.status(400).json({ success: false, message: "Transaction type must be money-in or money-out." });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Transaction amount must be greater than zero." });
    }

    const date = body.date || body.transactionDate;
    if (!isValidIsoDate(date)) {
      return res.status(400).json({ success: false, message: "A valid transaction date (YYYY-MM-DD) is required." });
    }

    const description = String(body.description || "").trim();
    if (!description) {
      return res.status(400).json({ success: false, message: "Transaction description is required." });
    }
    if (description.length > 240) {
      return res.status(400).json({ success: false, message: "Description cannot exceed 240 characters." });
    }

    const reference = String(body.reference || "").trim() || null;
    const relatedParty = String(body.relatedParty || "").trim() || null;
    const id = body.id || `btx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Verify target account exists, belongs to business, and is active
    const [accountRows] = await connection.query(
      `SELECT id, status, opening_balance, current_balance 
       FROM bank_accounts 
       WHERE business_id = ? AND id = ? 
       FOR UPDATE`,
      [businessId, accountId]
    );

    if (!accountRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "The selected bank account was not found for this company." });
    }

    if (accountRows[0].status === "inactive") {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Reactivate this bank account before recording a transaction." });
    }

    // 2. Prevent duplicate transaction ID
    const [dupTxn] = await connection.query(
      "SELECT id FROM bank_transactions WHERE business_id = ? AND id = ? LIMIT 1",
      [businessId, id]
    );
    if (dupTxn.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "A bank transaction with this ID already exists." });
    }

    // 3. Insert transaction
    await connection.query(
      `INSERT INTO bank_transactions (
        id, business_id, account_id, type, amount,
        transaction_date, reference, description, related_party, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
      [id, businessId, accountId, type, amount, date, reference, description, relatedParty]
    );

    // 4. Atomically recalculate account current_balance from opening_balance and all valid transactions
    await connection.query(
      `UPDATE bank_accounts
       SET current_balance = opening_balance + COALESCE((
         SELECT SUM(CASE WHEN type = 'money-in' THEN amount WHEN type = 'money-out' THEN -amount ELSE 0 END)
         FROM bank_transactions
         WHERE business_id = ? AND account_id = ?
       ), 0),
       updated_at = CURRENT_TIMESTAMP
       WHERE business_id = ? AND id = ?`,
      [businessId, accountId, businessId, accountId]
    );

    // 5. Fetch updated balance
    const [updatedAccRows] = await connection.query(
      "SELECT current_balance FROM bank_accounts WHERE business_id = ? AND id = ?",
      [businessId, accountId]
    );
    const updatedBalance = parseFloat(updatedAccRows[0]?.current_balance) || 0;

    await connection.commit();

    const savedRecord = {
      id,
      businessId,
      accountId,
      type,
      amount,
      date,
      transactionDate: date,
      reference: reference || "",
      description,
      relatedParty: relatedParty || "",
      createdAt: new Date().toISOString(),
    };

    return res.json({
      success: true,
      message: "Bank transaction recorded successfully.",
      data: savedRecord,
      updatedAccountBalance: updatedBalance,
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * Rejection handlers for transaction editing/deletion (transactions are strictly immutable)
 */
router.put("/transactions/:id", (_req, res) => {
  return res.status(409).json({ success: false, message: "Bank transactions are immutable. Record a separate correcting transaction instead." });
});
router.delete("/transactions/:id", (_req, res) => {
  return res.status(409).json({ success: false, message: "Bank transactions cannot be deleted. Transaction history is retained." });
});

/**
 * POST /api/bank-accounts & PUT /api/bank-accounts/:id
 * Creates or updates a bank account. Preserves opening and current balances on edit.
 */
const saveBankAccountHandler = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = req.params?.id || body.id || `bank_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const accountName = (body.accountName || body.accountDisplayName || body.name || "").trim();
    if (!accountName) {
      return res.status(400).json({ success: false, message: "Account name is required." });
    }
    if (accountName.length > 120) {
      return res.status(400).json({ success: false, message: "Account name cannot exceed 120 characters." });
    }

    const bankName = (body.bankName || "").trim();
    if (!bankName) {
      return res.status(400).json({ success: false, message: "Bank name is required." });
    }
    if (bankName.length > 120) {
      return res.status(400).json({ success: false, message: "Bank name cannot exceed 120 characters." });
    }

    const accountHolderName = (body.accountHolderName || "").trim() || null;
    if (accountHolderName && accountHolderName.length > 120) {
      return res.status(400).json({ success: false, message: "Account holder name cannot exceed 120 characters." });
    }

    const accountNumber = String(body.accountNumber || body.accountNo || "").replace(/\s/g, "");
    if (!accountNumber) {
      return res.status(400).json({ success: false, message: "Account number is required." });
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      return res.status(400).json({ success: false, message: "Account number must contain 6 to 20 digits." });
    }

    // Check duplicate account number for different account
    const [dup] = await pool.query(
      "SELECT id FROM bank_accounts WHERE business_id = ? AND account_number = ? AND id <> ? LIMIT 1",
      [businessId, accountNumber, id]
    );
    if (dup.length) {
      return res.status(409).json({ success: false, message: "An account with this account number already exists." });
    }

    const ifscCode = String(body.ifsc || body.ifscCode || "").trim().toUpperCase() || null;
    if (ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      return res.status(400).json({ success: false, message: "Enter a valid 11-character IFSC code." });
    }

    const branchName = (body.branch || body.branchName || "").trim() || null;
    if (branchName && branchName.length > 120) {
      return res.status(400).json({ success: false, message: "Branch name cannot exceed 120 characters." });
    }

    const openingBalance = parseFloat(body.openingBalance ?? 0) || 0;
    if (openingBalance < 0) {
      return res.status(400).json({ success: false, message: "Opening balance must be zero or greater." });
    }

    const asOfDate = body.openingBalanceDate || body.asOfDate || null;
    if (asOfDate && !isValidIsoDate(asOfDate)) {
      return res.status(400).json({ success: false, message: "Opening balance date must use YYYY-MM-DD format." });
    }

    const accountType = body.accountType || "Savings";
    const notes = (body.notes || "").trim() || null;
    const status = body.status === "inactive" ? "inactive" : "active";
    const isDefault = body.isDefault ? 1 : 0;

    // Check if account already exists to safely preserve balance
    const [existing] = await pool.query(
      "SELECT id, opening_balance, current_balance, as_of_date FROM bank_accounts WHERE business_id = ? AND id = ?",
      [businessId, id]
    );

    const isExisting = existing.length > 0;
    const currentBalance = isExisting ? parseFloat(existing[0].current_balance) : openingBalance;
    const finalOpeningBalance = isExisting ? parseFloat(existing[0].opening_balance) : openingBalance;
    const finalAsOfDate = isExisting ? existing[0].as_of_date : asOfDate;

    await pool.query(
      `INSERT INTO bank_accounts (
        id, business_id, account_name, account_holder_name, account_number, bank_name,
        ifsc_code, branch_name, opening_balance, current_balance, account_type,
        as_of_date, notes, status, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        account_name = VALUES(account_name),
        account_holder_name = VALUES(account_holder_name),
        account_number = VALUES(account_number),
        bank_name = VALUES(bank_name),
        ifsc_code = VALUES(ifsc_code),
        branch_name = VALUES(branch_name),
        account_type = VALUES(account_type),
        notes = VALUES(notes),
        status = VALUES(status),
        is_default = VALUES(is_default),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, accountName, accountHolderName, accountNumber, bankName,
        ifscCode, branchName, finalOpeningBalance, currentBalance, accountType,
        finalAsOfDate, notes, status, isDefault
      ]
    );

    const [rows] = await pool.query(
      `SELECT id, business_id, account_name, account_holder_name, account_number, bank_name,
              ifsc_code, branch_name, opening_balance, current_balance,
              account_type, as_of_date, notes, status, is_default, created_at, updated_at
       FROM bank_accounts
       WHERE business_id = ? AND id = ?`,
      [businessId, id]
    );

    return res.json({
      success: true,
      message: isExisting ? "Bank account details updated." : "Bank account added.",
      data: mapBankRow(rows[0]),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post("/", saveBankAccountHandler);
router.put("/:id", saveBankAccountHandler);

/**
 * DELETE /api/bank-accounts/:id
 * Prevents deleting accounts with transaction history to protect financial auditability.
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const id = req.params.id;

    // Check if transactions exist for this account
    const [txRows] = await pool.query(
      "SELECT id FROM bank_transactions WHERE business_id = ? AND account_id = ? LIMIT 1",
      [businessId, id]
    );

    if (txRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete bank account with existing transaction history. Deactivate the account instead.",
      });
    }

    const [result] = await pool.query("DELETE FROM bank_accounts WHERE business_id = ? AND id = ?", [businessId, id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }

    return res.json({ success: true, message: "Bank account deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
