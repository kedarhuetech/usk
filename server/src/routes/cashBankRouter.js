/**
 * Cash & Bank API Router (Cash In Hand, Cheques, Loan Accounts)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - cash_in_hand: Normalized ledger entries (in / out) with pure SQL columns.
 * - cheques: Cheques received / issued with life-cycle tracking (deposited, cleared, bounced).
 * - loan_accounts: Loan ledger tracking principal, interest, term, and EMI.
 */

import { Router } from "express";
import { pool, businessIdFromRequest, toSqlDate } from "../db/mysql.js";
import {
  resolveCashEntryDirection,
  isCashProducingTransactionType,
  isCancelledStatus,
  CASH_PROVENANCE,
} from "../utils/cashTransactionTypes.js";
import { getIstDateString } from "../utils/dateUtils.js";

const router = Router();

// ==================== CASH IN HAND ====================

/**
 * Synchronize cash transactions from transactions table into cash_in_hand ledger table
 */
export async function syncCashTransactions(businessId, queryable = pool) {
  try {
    const [cashTxns] = await queryable.query(
      `SELECT t.id, t.business_id, t.transaction_type, t.document_number, t.transaction_date,
              t.party_id, t.party_name, t.total_amount, t.paid_amount, t.payment_mode,
              t.payment_status, t.notes, t.created_at
       FROM transactions t
       WHERE t.business_id = ? AND LOWER(t.payment_mode) = 'cash'`,
      [businessId]
    );

    const validCashIds = [];
    for (const txn of cashTxns) {
      if (isCancelledStatus(txn.payment_status)) continue;
      if (!isCashProducingTransactionType(txn.transaction_type)) continue;

      const type = String(txn.transaction_type || "").toLowerCase();
      const entryType = resolveCashEntryDirection(type);
      const amount = parseFloat(txn.paid_amount) || 0;
      if (amount <= 0) continue;

      validCashIds.push(txn.id);
      const entryDate = toSqlDate(txn.transaction_date) || toSqlDate(txn.created_at) || getIstDateString();
      const desc = txn.notes || `${type.replace(/_/g, " ").toUpperCase()} #${txn.document_number || txn.id.slice(0, 8)}`;

      await queryable.query(
        `INSERT INTO cash_in_hand (
          id, business_id, entry_date, entry_type, amount,
          party_id, party_name, reference_type, reference_no, description, provenance, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          entry_date = VALUES(entry_date),
          entry_type = VALUES(entry_type),
          amount = VALUES(amount),
          party_id = VALUES(party_id),
          party_name = VALUES(party_name),
          reference_type = VALUES(reference_type),
          reference_no = VALUES(reference_no),
          description = VALUES(description),
          provenance = VALUES(provenance)`,
        [
          txn.id,
          businessId,
          entryDate,
          entryType,
          amount,
          txn.party_id || null,
          txn.party_name || "Cash",
          type,
          txn.document_number || "",
          desc,
          CASH_PROVENANCE.TRANSACTION,
          txn.created_at || new Date()
        ]
      );
    }

    // Clean up synced transaction-linked entries that are no longer cash, have zero paid_amount,
    // are cancelled, or were deleted, while preserving manual adjustments and restored history.
    if (validCashIds.length > 0) {
      await queryable.query(
        `DELETE FROM cash_in_hand 
         WHERE business_id = ? 
           AND provenance = ?
           AND (reference_type IS NULL OR LOWER(TRIM(reference_type)) != 'adjustment')
           AND id NOT IN (?)`,
        [businessId, CASH_PROVENANCE.TRANSACTION, validCashIds]
      );
    } else {
      await queryable.query(
        `DELETE FROM cash_in_hand 
         WHERE business_id = ? 
           AND provenance = ?
           AND (reference_type IS NULL OR LOWER(TRIM(reference_type)) != 'adjustment')`,
        [businessId, CASH_PROVENANCE.TRANSACTION]
      );
    }
  } catch (err) {
    console.error("[CashBank] Failed to sync cash transactions:", err);
    throw err;
  }
}

/**
 * GET /api/cash-bank/cash-in-hand
 */
router.get("/cash-in-hand", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await syncCashTransactions(businessId);

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
        entryDate: toSqlDate(r.entry_date) || (r.entry_date ? String(r.entry_date).slice(0, 10) : ""),
        entryType: r.entry_type,
        amount: parseFloat(r.amount) || 0,
        partyId: r.party_id,
        partyName: r.party_name || "",
        referenceType: r.reference_type || "",
        referenceNo: r.reference_no || "",
        description: r.description || "",
        provenance: r.provenance || CASH_PROVENANCE.TRANSACTION,
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
const saveCashHandler = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = req.params?.id || body.id || `cash_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entryDate = toSqlDate(body.entryDate || body.date) || getIstDateString();
    const entryType = (body.entryType || body.type || "in").toLowerCase();
    const amount = Math.abs(parseFloat(body.amount) || 0);
    const partyId = body.partyId || null;
    const partyName = body.partyName || null;
    const referenceType = body.referenceType || "adjustment";
    const referenceNo = body.referenceNo || "ADJUSTMENT";
    const description = body.description || body.reason || null;
    const provenance =
      String(referenceType).trim().toLowerCase() === "adjustment"
        ? CASH_PROVENANCE.MANUAL_ADJUSTMENT
        : CASH_PROVENANCE.TRANSACTION;

    await pool.query(
      `INSERT INTO cash_in_hand (
        id, business_id, entry_date, entry_type, amount,
        party_id, party_name, reference_type, reference_no, description, provenance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        entry_date = VALUES(entry_date),
        entry_type = VALUES(entry_type),
        amount = VALUES(amount),
        party_id = VALUES(party_id),
        party_name = VALUES(party_name),
        reference_type = VALUES(reference_type),
        reference_no = VALUES(reference_no),
        description = VALUES(description),
        provenance = VALUES(provenance)`,
      [id, businessId, entryDate, entryType, amount, partyId, partyName, referenceType, referenceNo, description, provenance]
    );

    return res.json({ success: true, message: "Cash entry recorded.", data: { id, amount, entryType } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post("/cash-in-hand", saveCashHandler);
router.put("/cash-in-hand/:id", saveCashHandler);

/**
 * DELETE /api/cash-bank/cash-in-hand/:id
 */
router.delete("/cash-in-hand/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const { id } = req.params;
    await pool.query(
      `DELETE FROM cash_in_hand WHERE id = ? AND business_id = ?`,
      [id, businessId]
    );
    return res.json({ success: true, message: "Cash entry deleted successfully." });
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
const saveChequeHandler = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = req.params?.id || body.id || `chq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const partyId = body.partyId || null;
    const partyName = (body.partyName || "Party").trim();
    const chequeNumber = (body.chequeNumber || body.number || "").trim();
    const bankName = (body.bankName || "Bank").trim();
    const amount = parseFloat(body.amount) || 0;
    const rawChequeDate = body.chequeDate || body.date || getIstDateString();
    const chequeDate = toSqlDate(rawChequeDate) || getIstDateString();
    const chequeType = (body.chequeType || "received").toLowerCase();
    const status = (body.status || "pending").toLowerCase();
    const isReceived = chequeType === "received";
    const depositDate = toSqlDate(body.depositDate || (isReceived ? body.expectedDate : null));
    const clearanceDate = toSqlDate(body.clearanceDate || (!isReceived ? body.expectedDate : null));
    const notes = body.notes || null;

    await pool.query(
      `INSERT INTO cheques (
        id, business_id, party_id, party_name, cheque_number, bank_name,
        amount, cheque_date, cheque_type, status, deposit_date, clearance_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        party_id = VALUES(party_id),
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

    return res.json({ success: true, message: "Cheque saved successfully.", data: { id, chequeNumber, amount, status } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post("/cheques", saveChequeHandler);
router.put("/cheques/:id", saveChequeHandler);

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

    const [repayRows] = await pool.query(
      `SELECT * FROM loan_repayments WHERE business_id = ? ORDER BY payment_date DESC, created_at DESC`,
      [businessId]
    );

    const repaymentsByLoan = {};
    for (const r of repayRows) {
      if (!repaymentsByLoan[r.loan_id]) repaymentsByLoan[r.loan_id] = [];
      const paymentDate = r.payment_date instanceof Date
        ? `${r.payment_date.getFullYear()}-${String(r.payment_date.getMonth() + 1).padStart(2, "0")}-${String(r.payment_date.getDate()).padStart(2, "0")}`
        : String(r.payment_date || "").slice(0, 10);

      repaymentsByLoan[r.loan_id].push({
        id: r.id,
        loanId: r.loan_id,
        paymentDate,
        amountPaid: parseFloat(r.amount_paid) || 0,
        principalPaid: parseFloat(r.principal_paid) || 0,
        interestPaid: parseFloat(r.interest_paid) || 0,
        paymentMode: r.payment_mode,
        reference: r.reference || "",
        notes: r.notes || "",
        createdAt: r.created_at,
      });
    }

    return res.json({
      success: true,
      data: rows.map((r) => {
        const loanRepayments = repaymentsByLoan[r.id] || [];
        const totalPrincipalPaid = loanRepayments.reduce((sum, item) => sum + item.principalPaid, 0);
        const principal = parseFloat(r.principal_amount) || 0;
        const currentBalance = Math.max(0, Math.round((principal - totalPrincipalPaid) * 100) / 100);

        return {
          id: r.id,
          accountName: r.account_name,
          lenderName: r.lender_name,
          accountNumber: r.account_number,
          loanType: r.loan_type,
          principalAmount: principal,
          currentBalance: currentBalance,
          interestRate: parseFloat(r.interest_rate) || 0,
          termMonths: parseInt(r.term_months, 10) || 12,
          emiAmount: parseFloat(r.emi_amount) || 0,
          startDate: r.start_date,
          status: r.status || "Active",
          closedDate: r.closed_date ? (toSqlDate(r.closed_date) || String(r.closed_date).slice(0, 10)) : null,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          repayments: loanRepayments,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/cash-bank/loan-accounts
 */
const saveLoanHandler = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = req.params?.id || body.id || `loan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const accountName = (body.accountName || body.name || "Loan Account").trim();
    const lenderName = (body.lenderName || body.lender || "Bank").trim();
    const accountNumber = (body.accountNumber || body.accountNo || "").trim();
    const loanType = body.loanType || "Monthly";
    const principalAmount = parseFloat(body.principalAmount ?? body.amount ?? 0) || 0;
    const interestRate = parseFloat(body.interestRate ?? 0) || 0;
    const termMonths = parseInt(body.termMonths, 10) || 12;

    // Calculate estimated EMI if no explicit override was entered
    const calculatedEmi = (() => {
      if (principalAmount <= 0 || termMonths <= 0) return 0;
      if (interestRate === 0) return Math.round((principalAmount / termMonths) * 100) / 100;
      const monthlyRate = interestRate / 1200;
      return Math.round((principalAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths))) * 100) / 100;
    })();

    const providedEmi = parseFloat(body.emiAmount ?? 0);
    const emiAmount = providedEmi > 0 ? providedEmi : calculatedEmi;

    let existingLoan = null;
    if (req.params?.id || body.id) {
      const [existingRows] = await pool.query(
        `SELECT current_balance, principal_amount FROM loan_accounts WHERE business_id = ? AND id = ? LIMIT 1`,
        [businessId, id]
      );
      existingLoan = existingRows[0] || null;
    }

    const hasCurrentBalance = body.currentBalance !== undefined || body.current_balance !== undefined;
    const currentBalance = hasCurrentBalance
      ? (parseFloat(body.currentBalance ?? body.current_balance) || 0)
      : (existingLoan ? (parseFloat(existingLoan.current_balance) || 0) : principalAmount);
    const startDate = body.startDate || null;
    const rawStatus = String(body.status || "").trim();
    const status = ["active", "closed"].includes(rawStatus.toLowerCase())
      ? (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase())
      : "Active";
    const closedDate = status === "Closed"
      ? (toSqlDate(body.closedDate || body.closed_date) || getIstDateString())
      : null;

    await pool.query(
      `INSERT INTO loan_accounts (
        id, business_id, account_name, lender_name, account_number, loan_type,
        principal_amount, current_balance, interest_rate, term_months, emi_amount, start_date,
        status, closed_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        status = VALUES(status),
        closed_date = VALUES(closed_date),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, accountName, lenderName, accountNumber, loanType,
        principalAmount, currentBalance, interestRate, termMonths, emiAmount, startDate,
        status, closedDate
      ]
    );

    return res.json({ success: true, message: "Loan account saved.", data: { id, accountName, currentBalance, emiAmount, status, closedDate } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post("/loan-accounts", saveLoanHandler);
router.put("/loan-accounts/:id", saveLoanHandler);

/**
 * DELETE /api/cash-bank/loan-accounts/:id
 */
router.delete("/loan-accounts/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    await conn.query(`DELETE FROM loan_repayments WHERE business_id = ? AND loan_id = ?`, [businessId, req.params.id]);
    await conn.query(`DELETE FROM loan_accounts WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    await conn.commit();
    return res.json({ success: true, message: "Loan account and associated repayments deleted." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ==================== LOAN REPAYMENTS ====================

/**
 * GET /api/cash-bank/loan-accounts/:id/repayments
 */
router.get("/loan-accounts/:id/repayments", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const loanId = req.params.id;

    const [rows] = await pool.query(
      `SELECT * FROM loan_repayments WHERE business_id = ? AND loan_id = ? ORDER BY payment_date DESC, created_at DESC`,
      [businessId, loanId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => {
        const paymentDate = r.payment_date instanceof Date
          ? `${r.payment_date.getFullYear()}-${String(r.payment_date.getMonth() + 1).padStart(2, "0")}-${String(r.payment_date.getDate()).padStart(2, "0")}`
          : String(r.payment_date || "").slice(0, 10);

        return {
          id: r.id,
          loanId: r.loan_id,
          paymentDate,
          amountPaid: parseFloat(r.amount_paid) || 0,
          principalPaid: parseFloat(r.principal_paid) || 0,
          interestPaid: parseFloat(r.interest_paid) || 0,
          paymentMode: r.payment_mode,
          reference: r.reference || "",
          notes: r.notes || "",
          createdAt: r.created_at,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/cash-bank/loan-accounts/:id/repayments
 */
router.post("/loan-accounts/:id/repayments", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const loanId = req.params.id;
    const body = req.body || {};

    const id = body.id || `repay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const paymentDate = body.paymentDate || body.date || new Date().toISOString().slice(0, 10);
    const amountPaid = parseFloat(body.amountPaid ?? body.amount ?? 0) || 0;
    const principalPaid = parseFloat(body.principalPaid ?? amountPaid) || 0;
    const interestPaid = parseFloat(body.interestPaid ?? (amountPaid - principalPaid)) || 0;
    const paymentMode = body.paymentMode || body.paymentType || "bank";
    const reference = body.reference || body.refNo || null;
    const notes = body.notes || body.description || null;

    if (amountPaid <= 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Repayment amount must be greater than zero." });
    }

    // Verify loan exists
    const [loanRows] = await conn.query(
      `SELECT id, current_balance FROM loan_accounts WHERE business_id = ? AND id = ?`,
      [businessId, loanId]
    );
    if (!loanRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Loan account not found." });
    }

    // Check if repayment already exists to handle differential balance accounting
    const [existingRepayRows] = await conn.query(
      `SELECT principal_paid FROM loan_repayments WHERE business_id = ? AND id = ?`,
      [businessId, id]
    );
    const existingPrincipalPaid = existingRepayRows.length ? (parseFloat(existingRepayRows[0].principal_paid) || 0) : 0;
    const netPrincipalDelta = principalPaid - existingPrincipalPaid;

    // Insert or update repayment
    await conn.query(
      `INSERT INTO loan_repayments (
        id, business_id, loan_id, payment_date, amount_paid,
        principal_paid, interest_paid, payment_mode, reference, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        amount_paid = VALUES(amount_paid),
        principal_paid = VALUES(principal_paid),
        interest_paid = VALUES(interest_paid),
        reference = VALUES(reference),
        notes = VALUES(notes)`,
      [id, businessId, loanId, paymentDate, amountPaid, principalPaid, interestPaid, paymentMode, reference, notes]
    );

    // Atomically adjust loan outstanding balance by net principal change
    if (netPrincipalDelta !== 0) {
      await conn.query(
        `UPDATE loan_accounts
         SET current_balance = GREATEST(0, current_balance - ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE business_id = ? AND id = ?`,
        [netPrincipalDelta, businessId, loanId]
      );
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Loan repayment recorded successfully.",
      data: { id, loanId, amountPaid, principalPaid, interestPaid },
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/cash-bank/loan-accounts/:id/repayments/:repayId
 */
router.delete("/loan-accounts/:id/repayments/:repayId", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const { id: loanId, repayId } = req.params;

    const [rows] = await conn.query(
      `SELECT principal_paid FROM loan_repayments WHERE business_id = ? AND loan_id = ? AND id = ?`,
      [businessId, loanId, repayId]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Repayment entry not found." });
    }

    const principalToRevert = parseFloat(rows[0].principal_paid) || 0;
    await conn.query(`DELETE FROM loan_repayments WHERE business_id = ? AND id = ?`, [businessId, repayId]);

    if (principalToRevert > 0) {
      await conn.query(
        `UPDATE loan_accounts SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE business_id = ? AND id = ?`,
        [principalToRevert, businessId, loanId]
      );
    }

    await conn.commit();
    return res.json({ success: true, message: "Loan repayment deleted and balance restored." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;

