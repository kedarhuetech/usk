/**
 * Cash & Bank API Router (Cash In Hand, Cheques, Loan Accounts)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - cash_in_hand: Normalized ledger entries (in / out) with pure SQL columns.
 * - cheques: Cheques received / issued with life-cycle tracking (deposited, cleared, bounced).
 * - loan_accounts: Loan ledger tracking principal, interest, term, and EMI.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

// ==================== CASH IN HAND ====================

/**
 * GET /api/cash-bank/cash-in-hand
 */
router.get("/cash-in-hand", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM cash_in_hand WHERE business_id = ? ORDER BY entry_date DESC, created_at DESC`,
      [businessId]
    );

    // Calculate total net cash
    const totalCash = rows.reduce((acc, row) => {
      const amt = parseFloat(row.amount) || 0;
      return row.entry_type === "in" ? acc + amt : acc - amt;
    }, 0);

    return res.json({
      success: true,
      totalCash,
      data: rows.map((r) => ({
        id: r.id,
        entryDate: r.entry_date,
        entryType: r.entry_type,
        amount: parseFloat(r.amount) || 0,
        partyId: r.party_id,
        partyName: r.party_name || "",
        referenceType: r.reference_type || "",
        referenceNo: r.reference_no || "",
        description: r.description || "",
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/cash-bank/cash-in-hand
 */
router.post("/cash-in-hand", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `cash_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entryDate = body.entryDate || body.date || new Date().toISOString().slice(0, 10);
    const entryType = (body.entryType || body.type || "in").toLowerCase();
    const amount = parseFloat(body.amount) || 0;
    const partyId = body.partyId || null;
    const partyName = body.partyName || null;
    const referenceType = body.referenceType || null;
    const referenceNo = body.referenceNo || null;
    const description = body.description || null;

    await pool.query(
      `INSERT INTO cash_in_hand (
        id, business_id, entry_date, entry_type, amount,
        party_id, party_name, reference_type, reference_no, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, businessId, entryDate, entryType, amount, partyId, partyName, referenceType, referenceNo, description]
    );

    return res.json({ success: true, message: "Cash entry recorded.", data: { id, amount, entryType } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== CHEQUES ====================

/**
 * GET /api/cash-bank/cheques
 */
router.get("/cheques", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM cheques WHERE business_id = ? ORDER BY cheque_date DESC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        partyId: r.party_id,
        partyName: r.party_name,
        chequeNumber: r.cheque_number,
        bankName: r.bank_name,
        amount: parseFloat(r.amount) || 0,
        chequeDate: r.cheque_date,
        chequeType: r.cheque_type,
        status: r.status,
        depositDate: r.deposit_date,
        clearanceDate: r.clearance_date,
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
 * POST /api/cash-bank/cheques
 */
router.post("/cheques", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `chq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const partyId = body.partyId || null;
    const partyName = (body.partyName || "Party").trim();
    const chequeNumber = (body.chequeNumber || body.number || "").trim();
    const bankName = (body.bankName || "Bank").trim();
    const amount = parseFloat(body.amount) || 0;
    const chequeDate = body.chequeDate || body.date || new Date().toISOString().slice(0, 10);
    const chequeType = body.chequeType || "received";
    const status = body.status || "pending";
    const depositDate = body.depositDate || null;
    const clearanceDate = body.clearanceDate || null;
    const notes = body.notes || null;

    await pool.query(
      `INSERT INTO cheques (
        id, business_id, party_id, party_name, cheque_number, bank_name,
        amount, cheque_date, cheque_type, status, deposit_date, clearance_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        party_name = VALUES(party_name),
        cheque_number = VALUES(cheque_number),
        bank_name = VALUES(bank_name),
        amount = VALUES(amount),
        cheque_date = VALUES(cheque_date),
        cheque_type = VALUES(cheque_type),
        status = VALUES(status),
        deposit_date = VALUES(deposit_date),
        clearance_date = VALUES(clearance_date),
        notes = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, partyId, partyName, chequeNumber, bankName,
        amount, chequeDate, chequeType, status, depositDate, clearanceDate, notes
      ]
    );

    return res.json({ success: true, message: "Cheque saved successfully.", data: { id, chequeNumber, amount } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/cash-bank/cheques/:id
 */
router.delete("/cheques/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.query(`DELETE FROM cheques WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    return res.json({ success: true, message: "Cheque deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== LOAN ACCOUNTS ====================

/**
 * GET /api/cash-bank/loan-accounts
 */
router.get("/loan-accounts", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM loan_accounts WHERE business_id = ? ORDER BY created_at DESC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        accountName: r.account_name,
        lenderName: r.lender_name,
        accountNumber: r.account_number,
        loanType: r.loan_type,
        principalAmount: parseFloat(r.principal_amount) || 0,
        currentBalance: parseFloat(r.current_balance) || 0,
        interestRate: parseFloat(r.interest_rate) || 0,
        termMonths: parseInt(r.term_months, 10) || 12,
        emiAmount: parseFloat(r.emi_amount) || 0,
        startDate: r.start_date,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/cash-bank/loan-accounts
 */
router.post("/loan-accounts", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `loan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const accountName = (body.accountName || body.name || "Loan Account").trim();
    const lenderName = (body.lenderName || body.lender || "Bank").trim();
    const accountNumber = (body.accountNumber || body.accountNo || "").trim();
    const loanType = body.loanType || "Term Loan";
    const principalAmount = parseFloat(body.principalAmount ?? body.amount ?? 0) || 0;
    const currentBalance = parseFloat(body.currentBalance ?? principalAmount) || 0;
    const interestRate = parseFloat(body.interestRate ?? 0) || 0;
    const termMonths = parseInt(body.termMonths, 10) || 12;
    const emiAmount = parseFloat(body.emiAmount ?? 0) || 0;
    const startDate = body.startDate || null;

    await pool.query(
      `INSERT INTO loan_accounts (
        id, business_id, account_name, lender_name, account_number, loan_type,
        principal_amount, current_balance, interest_rate, term_months, emi_amount, start_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        account_name = VALUES(account_name),
        lender_name = VALUES(lender_name),
        account_number = VALUES(account_number),
        loan_type = VALUES(loan_type),
        principal_amount = VALUES(principal_amount),
        current_balance = VALUES(current_balance),
        interest_rate = VALUES(interest_rate),
        term_months = VALUES(term_months),
        emi_amount = VALUES(emi_amount),
        start_date = VALUES(start_date),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, accountName, lenderName, accountNumber, loanType,
        principalAmount, currentBalance, interestRate, termMonths, emiAmount, startDate
      ]
    );

    return res.json({ success: true, message: "Loan account saved.", data: { id, accountName, currentBalance } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/cash-bank/loan-accounts/:id
 */
router.delete("/loan-accounts/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.query(`DELETE FROM loan_accounts WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    return res.json({ success: true, message: "Loan account deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
