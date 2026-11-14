/**
 * Reports API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Generates high-speed financial and tax reports directly from normalized relational tables.
 * - Computes Profit & Loss, Balance Sheet, Stock Summary, and GST Ledgers using indexed SQL aggregation.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/reports/profit-and-loss
 */
router.get("/profit-and-loss", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const startDate = req.query.startDate || "2000-01-01";
    const endDate = req.query.endDate || "2099-12-31";

    // 1. Total Sales Revenue
    const [salesRows] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS totalSales,
              COALESCE(SUM(tax_amount), 0) AS totalSalesTax
       FROM transactions
       WHERE business_id = ? AND transaction_type IN ('sale', 'pos')
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    // 2. Total Purchase Cost
    const [purchaseRows] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS totalPurchases,
              COALESCE(SUM(tax_amount), 0) AS totalPurchaseTax
       FROM transactions
       WHERE business_id = ? AND transaction_type = 'purchase'
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    // 3. Total Direct & Indirect Expenses
    const [expenseRows] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS totalExpenses
       FROM transactions
       WHERE business_id = ? AND transaction_type = 'expense'
         AND transaction_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );

    const totalSales = parseFloat(salesRows[0]?.totalSales) || 0;
    const totalPurchases = parseFloat(purchaseRows[0]?.totalPurchases) || 0;
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

    const bankBalance = parseFloat(bankRows[0]?.bankBalance) || 0;
    const accountsReceivable = parseFloat(partyRows[0]?.accountsReceivable) || 0;
    const accountsPayable = parseFloat(partyRows[0]?.accountsPayable) || 0;
    const stockValue = parseFloat(stockRows[0]?.stockValue) || 0;
    const loansPayable = parseFloat(loanRows[0]?.loansPayable) || 0;

    const totalAssets = bankBalance + accountsReceivable + stockValue;
    const totalLiabilities = accountsPayable + loansPayable;
    const netWorth = totalAssets - totalLiabilities;

    return res.json({
      success: true,
      data: {
        assets: {
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

export default router;
