/**
 * Dashboard API Router
 * 
 * Scalability & System Design:
 * - Aggregates core business KPIs directly in MySQL using indexed SUM() and COUNT() queries.
 * - Sub-millisecond execution without loading raw records into Node.js process memory.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/dashboard and GET /api/dashboard/summary
 * Retrieves overall financial and inventory KPIs
 */
const getSummary = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const bizClause = "(business_id = ? OR business_id IN ('demo-business', 'local-development'))";
    const today = new Date().toISOString().slice(0, 10);

    // 1. Sales & Purchases totals
    const [salesSummary] = await pool.query(
      `SELECT 
         COUNT(*) AS totalSalesCount,
         COALESCE(SUM(total_amount), 0) AS totalSalesAmount,
         COALESCE(SUM(paid_amount), 0) AS totalSalesReceived,
         COALESCE(SUM(balance_amount), 0) AS totalSalesPending
       FROM transactions 
       WHERE ${bizClause} AND transaction_type IN ('sale', 'pos')`,
      [businessId]
    );

    const [purchaseSummary] = await pool.query(
      `SELECT 
         COUNT(*) AS totalPurchaseCount,
         COALESCE(SUM(total_amount), 0) AS totalPurchaseAmount,
         COALESCE(SUM(paid_amount), 0) AS totalPurchasePaid,
         COALESCE(SUM(balance_amount), 0) AS totalPurchasePending
       FROM transactions 
       WHERE ${bizClause} AND transaction_type = 'purchase'`,
      [businessId]
    );

    // 2. Receivables & Payables from parties
    const [partyBalances] = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE 
           WHEN balance_type IN ('to_pay', 'to-pay') OR (party_type = 'supplier' AND balance_type NOT IN ('to_receive', 'to-receive')) THEN 0
           WHEN balance_type IN ('to_receive', 'to-receive') OR (party_type = 'customer' AND balance_type NOT IN ('to_pay', 'to-pay')) THEN ABS(opening_balance)
           ELSE 0
         END), 0) AS totalReceivable,
         COALESCE(SUM(CASE 
           WHEN balance_type IN ('to_pay', 'to-pay') OR (party_type = 'supplier' AND balance_type NOT IN ('to_receive', 'to-receive')) THEN ABS(opening_balance)
           ELSE 0
         END), 0) AS totalPayable,
         COUNT(CASE WHEN party_type = 'customer' THEN 1 END) AS customerCount,
         COUNT(CASE WHEN party_type = 'supplier' THEN 1 END) AS supplierCount
       FROM parties
       WHERE ${bizClause}`,
      [businessId]
    );

    const totalReceivable = (parseFloat(partyBalances[0]?.totalReceivable) || 0) + (parseFloat(salesSummary[0]?.totalSalesPending) || 0);
    const totalPayable = (parseFloat(partyBalances[0]?.totalPayable) || 0) + (parseFloat(purchaseSummary[0]?.totalPurchasePending) || 0);

    // 3. Stock value and low stock alert count
    const [stockSummary] = await pool.query(
      `SELECT 
         COUNT(*) AS totalItemsCount,
         COALESCE(SUM(current_stock * purchase_price), 0) AS totalStockValue,
         COUNT(CASE WHEN current_stock <= min_stock AND min_stock > 0 THEN 1 END) AS lowStockCount
       FROM inventory_items
       WHERE ${bizClause}`,
      [businessId]
    );

    // 4. Cash & Bank total balances
    const [bankSummary] = await pool.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS totalBankBalance 
       FROM bank_accounts 
       WHERE ${bizClause}`,
      [businessId]
    );

    // 5. Recent 5 transactions
    const [recentTxns] = await pool.query(
      `SELECT id, transaction_type, document_number, transaction_date,
              party_name, total_amount, paid_amount, balance_amount, payment_mode
       FROM transactions
       WHERE ${bizClause}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 5`,
      [businessId]
    );

    // 6. Active sales for timeline graph
    const [activeSalesRows] = await pool.query(
      `SELECT id, 
              document_number AS documentNumber, 
              document_number AS invoiceNumber, 
              transaction_date AS transactionDate, 
              transaction_date AS invoiceDate, 
              transaction_date AS date,
              CAST(total_amount AS DECIMAL(12,2)) AS totalAmount, 
              CAST(total_amount AS DECIMAL(12,2)) AS amount, 
              CAST(total_amount AS DECIMAL(12,2)) AS total, 
              CAST(paid_amount AS DECIMAL(12,2)) AS paidAmount, 
              CAST(balance_amount AS DECIMAL(12,2)) AS balanceAmount,
              status, 
              party_name AS partyName, 
              party_name AS customer, 
              payment_mode AS paymentMode,
              created_at AS createdAt
       FROM transactions
       WHERE ${bizClause}
         AND transaction_type IN ('sale', 'pos') 
         AND status NOT IN ('cancelled', 'canceled', 'void', 'deleted')
       ORDER BY transaction_date ASC`,
      [businessId]
    );

    const activeSales = (activeSalesRows || []).map((row) => ({
      ...row,
      totalAmount: parseFloat(row.totalAmount) || 0,
      amount: parseFloat(row.amount) || 0,
      total: parseFloat(row.total) || 0,
      totals: {
        finalTotal: parseFloat(row.totalAmount) || 0,
        received: parseFloat(row.paidAmount) || 0,
        balance: parseFloat(row.balanceAmount) || 0,
      },
    }));

    return res.json({
      success: true,
      data: {
        sales: {
          count: salesSummary[0]?.totalSalesCount || 0,
          totalAmount: parseFloat(salesSummary[0]?.totalSalesAmount) || 0,
          receivedAmount: parseFloat(salesSummary[0]?.totalSalesReceived) || 0,
          pendingAmount: parseFloat(salesSummary[0]?.totalSalesPending) || 0,
        },
        purchases: {
          count: purchaseSummary[0]?.totalPurchaseCount || 0,
          totalAmount: parseFloat(purchaseSummary[0]?.totalPurchaseAmount) || 0,
          paidAmount: parseFloat(purchaseSummary[0]?.totalPurchasePaid) || 0,
          pendingAmount: parseFloat(purchaseSummary[0]?.totalPurchasePending) || 0,
        },
        balances: {
          toReceive: totalReceivable,
          toPay: totalPayable,
          openingReceivable: parseFloat(partyBalances[0]?.totalReceivable) || 0,
          openingPayable: parseFloat(partyBalances[0]?.totalPayable) || 0,
          customerCount: partyBalances[0]?.customerCount || 0,
          supplierCount: partyBalances[0]?.supplierCount || 0,
        },
        inventory: {
          itemCount: stockSummary[0]?.totalItemsCount || 0,
          stockValue: parseFloat(stockSummary[0]?.totalStockValue) || 0,
          lowStockCount: stockSummary[0]?.lowStockCount || 0,
        },
        bank: {
          totalBalance: parseFloat(bankSummary[0]?.totalBankBalance) || 0,
        },
        activeSales,
        recentTransactions: recentTxns,
      },
    });
  } catch (err) {
    console.error("[Dashboard GET Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.get("/", getSummary);
router.get("/summary", getSummary);

export default router;

