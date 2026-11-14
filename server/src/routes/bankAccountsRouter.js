/**
 * Bank Accounts API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Stored in bank_accounts table with pure SQL columns (DECIMAL, VARCHAR, DATE, TINYINT).
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/bank-accounts
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT id, business_id, account_name, account_number, bank_name,
              ifsc_code, branch_name, opening_balance, current_balance,
              account_type, as_of_date, is_default, created_at, updated_at
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
 * POST /api/bank-accounts
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `bank_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const accountName = (body.accountName || body.name || "").trim();
    if (!accountName) {
      return res.status(400).json({ success: false, message: "Account name is required." });
    }

    const accountNumber = body.accountNumber || body.accountNo || null;
    const bankName = body.bankName || null;
    const ifscCode = body.ifscCode || null;
    const branchName = body.branchName || null;
    const openingBalance = parseFloat(body.openingBalance ?? 0) || 0;
    const currentBalance = parseFloat(body.currentBalance ?? body.balance ?? openingBalance) || 0;
    const accountType = body.accountType || "Savings";
    const asOfDate = body.asOfDate || null;
    const isDefault = body.isDefault ? 1 : 0;

    await pool.query(
      `INSERT INTO bank_accounts (
        id, business_id, account_name, account_number, bank_name, ifsc_code,
        branch_name, opening_balance, current_balance, account_type, as_of_date, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        account_name = VALUES(account_name),
        account_number = VALUES(account_number),
        bank_name = VALUES(bank_name),
        ifsc_code = VALUES(ifsc_code),
        branch_name = VALUES(branch_name),
        current_balance = VALUES(current_balance),
        account_type = VALUES(account_type),
        as_of_date = VALUES(as_of_date),
        is_default = VALUES(is_default),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, accountName, accountNumber, bankName, ifscCode,
        branchName, openingBalance, currentBalance, accountType, asOfDate, isDefault
      ]
    );

    return res.json({
      success: true,
      message: "Bank account saved successfully in pure relational rows and columns.",
      data: { id, accountName, currentBalance }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/bank-accounts/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.query(`DELETE FROM bank_accounts WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    return res.json({ success: true, message: "Bank account deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

function mapBankRow(row) {
  return {
    id: row.id,
    accountName: row.account_name,
    name: row.account_name,
    accountNumber: row.account_number || "",
    bankName: row.bank_name || "",
    ifscCode: row.ifsc_code || "",
    branchName: row.branch_name || "",
    openingBalance: parseFloat(row.opening_balance) || 0,
    currentBalance: parseFloat(row.current_balance) || 0,
    balance: parseFloat(row.current_balance) || 0,
    accountType: row.account_type || "Savings",
    asOfDate: row.as_of_date,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
