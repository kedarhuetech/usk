/**
 * Balance Sheet Accounts API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Custom Chart of Accounts: balance_sheet_accounts
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/balance-sheet/accounts
 */
router.get("/accounts", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM balance_sheet_accounts WHERE business_id = ? ORDER BY account_type ASC, account_name ASC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.account_name,
        accountName: r.account_name,
        type: r.account_type,
        accountType: r.account_type,
        openingBalance: parseFloat(r.opening_balance) || 0,
        balanceType: r.balance_type,
        notes: r.notes || "",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/balance-sheet/accounts
 */
router.post("/accounts", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `bsacc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const accountName = String(body.name || body.accountName || "").trim();
    const accountType = String(body.type || body.accountType || "Asset").trim();
    const openingBalance = parseFloat(body.openingBalance ?? 0) || 0;
    const balanceType = body.balanceType || "debit";
    const notes = body.notes || null;

    if (!accountName) {
      return res.status(400).json({ success: false, message: "Account name is required." });
    }

    await pool.query(
      `INSERT INTO balance_sheet_accounts (id, business_id, account_name, account_type, opening_balance, balance_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         account_name = VALUES(account_name),
         account_type = VALUES(account_type),
         opening_balance = VALUES(opening_balance),
         balance_type = VALUES(balance_type),
         notes = VALUES(notes),
         updated_at = CURRENT_TIMESTAMP`,
      [id, businessId, accountName, accountType, openingBalance, balanceType, notes]
    );

    return res.json({
      success: true,
      message: "Balance sheet account saved successfully.",
      data: { id, accountName, accountType, openingBalance, balanceType },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/balance-sheet/accounts/:id
 */
router.delete("/accounts/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.query(
      `DELETE FROM balance_sheet_accounts WHERE business_id = ? AND id = ?`,
      [businessId, req.params.id]
    );
    return res.json({ success: true, message: "Account deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
