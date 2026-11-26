/**
 * Reports API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Generates high-speed financial and tax reports directly from normalized relational tables.
 * - Computes Profit & Loss, Balance Sheet, Stock Summary, and GST Ledgers using indexed SQL aggregation.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";
import { getIstDateString } from "../utils/dateUtils.js";

const router = Router();

const ACTIVE_TXN_FILTER = `LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'canceled', 'void', 'deleted')
  AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'void', 'deleted')`;

function toSqlDate(val, fallback = null) {
  if (!val || typeof val !== "string") return fallback;
  const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return fallback;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * GET /api/reports/profit-and-loss
 */
router.get("/profit-and-loss", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const startDate = toSqlDate(req.query.startDate, "2000-01-01");
    const endDate = toSqlDate(req.query.endDate, "2099-12-31");

    // 1. Net Sales Revenue (Sales + POS - Sale Returns / Credit Notes)
    const [salesRows] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN LOWER(transaction_type) IN ('sale', 'pos') THEN total_amount ELSE 0 END), 0) AS grossSales,
              COALESCE(SUM(CASE WHEN LOWER(transaction_type) IN ('sale_return', 'sale return', 'credit_note', 'credit note') THEN total_amount ELSE 0 END), 0) AS saleReturns,
              COALESCE(SUM(CASE WHEN LOWER(transaction_type) IN ('sale', 'pos') THEN tax_amount ELSE -tax_amount END), 0) AS netSalesTax
       FROM transactions
       WHERE business_id = ?
         AND LOWER(transaction_type) IN ('sale', 'pos', 'sale_return', 'sale return', 'credit_note', 'credit note')
         AND ${ACTIVE_TXN_FILTER}
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    // 2. Net Purchase Cost (Purchases - Purchase Returns / Debit Notes)
    const [purchaseRows] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN LOWER(transaction_type) = 'purchase' THEN total_amount ELSE 0 END), 0) AS grossPurchases,
              COALESCE(SUM(CASE WHEN LOWER(transaction_type) IN ('purchase_return', 'purchase return', 'debit_note', 'debit note') THEN total_amount ELSE 0 END), 0) AS purchaseReturns,
              COALESCE(SUM(CASE WHEN LOWER(transaction_type) = 'purchase' THEN tax_amount ELSE -tax_amount END), 0) AS netPurchaseTax
       FROM transactions
       WHERE business_id = ?
         AND LOWER(transaction_type) IN ('purchase', 'purchase_return', 'purchase return', 'debit_note', 'debit note')
         AND ${ACTIVE_TXN_FILTER}
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    // 3. Total Direct & Indirect Expenses
    const [expenseRows] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS totalExpenses
       FROM transactions
       WHERE business_id = ? AND LOWER(transaction_type) = 'expense'
         AND ${ACTIVE_TXN_FILTER}
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    const totalSales = (parseFloat(salesRows[0]?.grossSales) || 0) - (parseFloat(salesRows[0]?.saleReturns) || 0);
    const totalPurchases = (parseFloat(purchaseRows[0]?.grossPurchases) || 0) - (parseFloat(purchaseRows[0]?.purchaseReturns) || 0);
    const totalExpenses = parseFloat(expenseRows[0]?.totalExpenses) || 0;
    const grossProfit = totalSales - totalPurchases;
    const netProfit = grossProfit - totalExpenses;

    return res.json({
      success: true,
      data: {
        totalSales,
        totalPurchases,
        totalExpenses,
        grossProfit,
        netProfit,
        startDate,
        endDate,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/reports/balance-sheet
 */
router.get("/balance-sheet", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);

    // Assets: Cash + Bank + Accounts Receivable + Inventory Stock Value
    const [cashRows] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN LOWER(entry_type) = 'in' THEN amount ELSE -amount END), 0) AS cashBalance
       FROM cash_in_hand WHERE business_id = ?`,
      [businessId]
    );
    const [bankRows] = await pool.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS bankBalance FROM bank_accounts WHERE business_id = ?`,
      [businessId]
    );
    const [partyRows] = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END), 0) AS accountsReceivable,
         COALESCE(SUM(CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END), 0) AS accountsPayable
       FROM parties WHERE business_id = ?`,
      [businessId]
    );
    const [stockRows] = await pool.query(
      `SELECT COALESCE(SUM(current_stock * purchase_price), 0) AS stockValue FROM inventory_items WHERE business_id = ?`,
      [businessId]
    );
    const [loanRows] = await pool.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS loansPayable FROM loan_accounts WHERE business_id = ?`,
      [businessId]
    );

    const cashBalance = parseFloat(cashRows[0]?.cashBalance) || 0;
    const bankBalance = parseFloat(bankRows[0]?.bankBalance) || 0;
    const accountsReceivable = parseFloat(partyRows[0]?.accountsReceivable) || 0;
    const accountsPayable = parseFloat(partyRows[0]?.accountsPayable) || 0;
    const stockValue = parseFloat(stockRows[0]?.stockValue) || 0;
    const loansPayable = parseFloat(loanRows[0]?.loansPayable) || 0;

    const totalAssets = cashBalance + bankBalance + accountsReceivable + stockValue;
    const totalLiabilities = accountsPayable + loansPayable;
    const netWorth = totalAssets - totalLiabilities;

    return res.json({
      success: true,
      data: {
        assets: {
          cashBalance,
          bankBalance,
          accountsReceivable,
          stockValue,
          totalAssets,
        },
        liabilities: {
          accountsPayable,
          loansPayable,
          totalLiabilities,
        },
        equity: {
          netWorth,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/reports/stock-summary
 */
router.get("/stock-summary", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT id, name, item_code, category, unit, current_stock,
              purchase_price, sale_price, (current_stock * purchase_price) AS stockValue
       FROM inventory_items
       WHERE business_id = ?
       ORDER BY name ASC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        itemCode: r.item_code || "",
        category: r.category || "General",
        unit: r.unit || "PCS",
        currentStock: parseFloat(r.current_stock) || 0,
        purchasePrice: parseFloat(r.purchase_price) || 0,
        salePrice: parseFloat(r.sale_price) || 0,
        stockValue: parseFloat(r.stockValue) || 0,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/reports/daybook
 * Daily register of all incoming and outgoing transactions
 */
router.get("/daybook", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const date = toSqlDate(req.query.date, getIstDateString());
    const [rows] = await pool.query(
      `SELECT id, transaction_type, document_number, transaction_date, party_name,
              total_amount, paid_amount, balance_amount, payment_mode
       FROM transactions
       WHERE business_id = ? AND transaction_date = ? AND ${ACTIVE_TXN_FILTER}
       ORDER BY created_at ASC`,
      [businessId, date]
    );

    return res.json({ success: true, date, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/reports/cash-flow
 * Inflow vs Outflow statement
 */
router.get("/cash-flow", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const startDate = toSqlDate(req.query.startDate, "2000-01-01");
    const endDate = toSqlDate(req.query.endDate, "2099-12-31");

    const [inflows] = await pool.query(
      `SELECT COALESCE(SUM(paid_amount), 0) AS totalInflow
       FROM transactions
       WHERE business_id = ?
         AND LOWER(transaction_type) IN ('sale', 'payment_in', 'pos', 'purchase_return', 'purchase return', 'debit_note', 'debit note')
         AND ${ACTIVE_TXN_FILTER}
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    const [outflows] = await pool.query(
      `SELECT COALESCE(SUM(paid_amount), 0) AS totalOutflow
       FROM transactions
       WHERE business_id = ?
         AND LOWER(transaction_type) IN ('purchase', 'payment_out', 'expense', 'sale_return', 'sale return', 'credit_note', 'credit note')
         AND ${ACTIVE_TXN_FILTER}
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    const totalInflow = parseFloat(inflows[0]?.totalInflow) || 0;
    const totalOutflow = parseFloat(outflows[0]?.totalOutflow) || 0;

    return res.json({
      success: true,
      data: {
        totalInflow,
        totalOutflow,
        netCashFlow: totalInflow - totalOutflow,
        startDate,
        endDate,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/reports/all-transactions
 * Master audit of all business transactions
 */
router.get("/all-transactions", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const limitParam = req.query.limit;
    const isAll = limitParam === "all" || req.query.all === "true" || !limitParam;
    const limit = isAll
      ? 5000
      : Math.min(1000, Math.max(1, parseInt(limitParam, 10) || 100));

    const startDate = toSqlDate(req.query.startDate, null);
    const endDate = toSqlDate(req.query.endDate, null);
    const type = (req.query.type || "").trim();

    const conditions = ["business_id = ?"];
    const params = [businessId];

    if (startDate) {
      conditions.push("transaction_date >= ?");
      params.push(startDate);
    }
    if (endDate) {
      conditions.push("transaction_date <= ?");
      params.push(endDate);
    }
    if (type && type !== "all") {
      conditions.push("transaction_type = ?");
      params.push(type);
    }

    let sql = `SELECT id, transaction_type, document_number, transaction_date, party_name,
              total_amount, paid_amount, balance_amount, payment_mode, payment_status
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       ORDER BY transaction_date DESC, created_at DESC`;

    if (!isAll) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const [rows] = await pool.query(sql, params);

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

