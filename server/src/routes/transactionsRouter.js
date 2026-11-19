/**
 * Transactions API Router (Sales, Purchases, Payments, Expenses, Returns, Orders, POS)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Header: Stored in transactions table with pure SQL columns (DECIMAL, VARCHAR, DATE, TEXT).
 * - Line Items: Normalized into transaction_items child table with pure rows and columns.
 * - Atomic Multi-Table Consistency: ACID transactions (beginTransaction/commit/rollback)
 *   ensuring stock updates, party balance adjustments, and invoice lines commit or abort together.
 * - Lazy Loading: Indexed pagination (transaction_date DESC) with sub-millisecond execution.
 */

import { Router } from "express";
import { pool, businessIdFromRequest, toSqlDate } from "../db/mysql.js";

const router = Router();

function formatSqlDate(val) {
  return toSqlDate(val);
}

/**
 * Calculates signed party balance impact for a transaction.
 * Positive = party current_balance increases
 * Negative = party current_balance decreases
 */
function getPartyBalanceImpact(type, balAmt, pdAmt) {
  const normType = String(type || "").toLowerCase();
  if (normType === "sale" || normType === "pos") {
    return Number(balAmt) || 0;
  }
  if (normType === "payment_in") {
    return -(Number(pdAmt) || 0);
  }
  if (normType === "purchase") {
    return -(Number(balAmt) || 0);
  }
  if (normType === "payment_out") {
    return Number(pdAmt) || 0;
  }
  if (normType === "sale_return" || normType === "credit note" || normType === "credit_note") {
    return -(Number(balAmt) || 0);
  }
  if (normType === "purchase_return" || normType === "debit note" || normType === "debit_note") {
    return Number(balAmt) || 0;
  }
  return 0;
}

/**
 * GET /api/transactions
 * Retrieves paginated list of transactions with normalized line items.
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const type = (req.query.type || "").trim().toLowerCase();
    const partyId = (req.query.partyId || "").trim();
    const search = (req.query.search || "").trim();
    const startDate = (req.query.startDate || "").trim();
    const endDate = (req.query.endDate || "").trim();

    const conditions = ["t.business_id = ?"];
    const params = [businessId];

    if (type && type !== "all") {
      conditions.push("t.transaction_type = ?");
      params.push(type);
    }

    if (partyId) {
      conditions.push("t.party_id = ?");
      params.push(partyId);
    }

    if (search) {
      conditions.push("(t.document_number LIKE ? OR t.party_name LIKE ? OR p.party_name LIKE ? OR t.party_phone LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (startDate) {
      conditions.push("t.transaction_date >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("t.transaction_date <= ?");
      params.push(endDate);
    }

    const whereClause = conditions.join(" AND ");

    // Query 1: Total count for lazy loading
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions t LEFT JOIN parties p ON t.party_id = p.id WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Query 2: Fetch paginated transaction headers with resolved party fields
    const [rows] = await pool.query(
      `SELECT t.id, t.business_id, t.transaction_type, t.document_number, t.transaction_date, t.due_date,
              t.party_id,
              COALESCE(NULLIF(TRIM(t.party_name), ''), p.party_name, IF(t.payment_mode = 'Cash' OR t.transaction_type = 'pos', 'Cash Sale', '')) AS party_name,
              COALESCE(NULLIF(TRIM(t.party_phone), ''), p.phone, '') AS party_phone,
              COALESCE(NULLIF(TRIM(t.party_gstin), ''), p.gstin, '') AS party_gstin,
              COALESCE(NULLIF(TRIM(t.billing_address), ''), p.billing_address, '') AS billing_address,
              COALESCE(NULLIF(TRIM(t.shipping_address), ''), p.shipping_address, '') AS shipping_address,
              t.subtotal, t.discount_percent, t.discount_amount, t.tax_amount, t.round_off, t.total_amount,
              t.paid_amount, t.balance_amount, t.payment_mode, t.payment_status, t.payment_ref_no,
              t.cash_tendered, t.change_returned, t.vehicle_no, t.e_way_bill_no, t.po_number, t.po_date,
              t.notes, t.terms, t.created_at, t.updated_at
       FROM transactions t
       LEFT JOIN parties p ON t.party_id = p.id
       WHERE ${whereClause}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Query 3: Fetch normalized line items from transaction_items child table
    const txnIds = rows.map((r) => r.id);
    let itemsMap = new Map();
    if (txnIds.length > 0) {
      const placeholders = txnIds.map(() => "?").join(",");
      const [itemRows] = await pool.query(
        `SELECT id, transaction_id, item_id, item_name, item_code, barcode, hsn_code,
                batch_no, serial_no, quantity, free_qty, unit, unit_price,
                purchase_price, discount_percent, discount_amount, tax_rate,
                tax_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
                igst_rate, igst_amount, cess_rate, cess_amount, total_amount, is_active
         FROM transaction_items
         WHERE business_id = ? AND transaction_id IN (${placeholders})
         ORDER BY id ASC`,
        [businessId, ...txnIds]
      );

      for (const item of itemRows) {
        if (!itemsMap.has(item.transaction_id)) {
          itemsMap.set(item.transaction_id, []);
        }
        itemsMap.get(item.transaction_id).push({
          id: item.id,
          itemId: item.item_id,
          sourceItemId: item.item_id,
          item: item.item_name,
          name: item.item_name,
          itemName: item.item_name,
          itemCode: item.item_code || "",
          barcode: item.barcode || item.item_code || "",
          size: item.item_code || "",
          hsn: item.hsn_code || "",
          hsnCode: item.hsn_code || "",
          batchNo: item.batch_no || "",
          serialNo: item.serial_no || "",
          description: item.serial_no || "",
          qty: parseFloat(item.quantity) || 0,
          quantity: parseFloat(item.quantity) || 0,
          freeQty: parseFloat(item.free_qty) || 0,
          unit: item.unit || "PCS",
          price: parseFloat(item.unit_price) || 0,
          unitPrice: parseFloat(item.unit_price) || 0,
          purchasePrice: parseFloat(item.purchase_price) || 0,
          discountPercent: parseFloat(item.discount_percent) || 0,
          discountAmount: parseFloat(item.discount_amount) || 0,
          taxRate: parseFloat(item.tax_rate) || 0,
          taxAmount: parseFloat(item.tax_amount) || 0,
          cgstAmount: parseFloat(item.cgst_amount) || 0,
          sgstAmount: parseFloat(item.sgst_amount) || 0,
          igstAmount: parseFloat(item.igst_amount) || 0,
          cessAmount: parseFloat(item.cess_amount) || 0,
          amount: parseFloat(item.total_amount) || 0,
          totalAmount: parseFloat(item.total_amount) || 0,
          isActive: item.is_active !== 0,
          is_active: item.is_active,
        });
      }
    }

    const transactions = rows.map((row) => {
      const txnDate = formatSqlDate(row.transaction_date);
      const dueDate = formatSqlDate(row.due_date);
      const items = itemsMap.get(row.id) || [];
      const itemsTotal = items.reduce((s, it) => s + (parseFloat(it.totalAmount || it.amount) || 0), 0);
      const rawTotal = parseFloat(row.total_amount) || 0;
      const effectiveTotal = rawTotal > 0 ? rawTotal : itemsTotal;
      const party = row.party_name || (row.payment_mode === "Cash" || row.transaction_type === "pos" ? "Cash Sale" : "");
      const payments = items.length > 0
        ? items.map((it) => ({
            id: it.id,
            type: it.itemName || it.item || "Cash",
            amount: String(it.totalAmount || it.amount || 0),
            reference: it.itemCode || it.reference || "",
            chequeDate: it.serialNo || it.chequeDate || "",
          }))
        : [
            {
              id: `pay-${row.id}`,
              type: row.payment_mode || "Cash",
              amount: String(row.paid_amount || effectiveTotal),
              reference: row.payment_ref_no || "",
              chequeDate: "",
            },
          ];

      return {
        id: row.id,
        transactionType: row.transaction_type,
        type: row.transaction_type,
        documentNumber: row.document_number,
        number: row.document_number,
        invoiceNumber: row.document_number,
        billNumber: row.document_number,
        orderNumber: row.document_number,
        transactionDate: toSqlDate(row.transaction_date),
        invoiceDate: toSqlDate(row.transaction_date),
        billDate: toSqlDate(row.transaction_date),
        dueDate: toSqlDate(row.due_date),
        partyId: row.party_id,
        partyName: party,
        party: party,
        customer: party,
        customerName: party,
        supplierName: party,
        supplier: party,
        partyPhone: row.party_phone || "",
        phone: row.party_phone || "",
        partyGstin: row.party_gstin || "",
        billingAddress: row.billing_address || "",
        shippingAddress: row.shipping_address || "",
        subtotal: parseFloat(row.subtotal) || effectiveTotal,
        discountPercent: parseFloat(row.discount_percent) || 0,
        discountAmount: parseFloat(row.discount_amount) || 0,
        taxAmount: parseFloat(row.tax_amount) || 0,
        roundOff: parseFloat(row.round_off) || 0,
        roundOffValue: String(row.round_off ?? ""),
        totalAmount: effectiveTotal,
        total: effectiveTotal,
        amount: effectiveTotal,
        paidAmount: parseFloat(row.paid_amount) || 0,
        receivedAmount: parseFloat(row.paid_amount) || 0,
        received: parseFloat(row.paid_amount) || 0,
        balanceAmount: parseFloat(row.balance_amount) || 0,
        balance: parseFloat(row.balance_amount) || 0,
        paymentMode: row.payment_mode || "Cash",
        paymentType: row.payment_mode || "Cash",
        status: row.payment_status || "Completed",
        paymentRefNo: row.payment_ref_no || "",
        cashTendered: parseFloat(row.cash_tendered) || 0,
        changeReturned: parseFloat(row.change_returned) || 0,
        vehicleNo: row.vehicle_no || "",
        eWayBillNo: row.e_way_bill_no || "",
        poNumber: row.po_number || "",
        linkedInvoiceId: row.po_number || "",
        poDate: toSqlDate(row.po_date),
        notes: row.notes || "",
        description: row.notes || "",
        terms: row.terms || "",
        payments,
        items,
        rows: items.map((it) => ({
          ...it,
          item: it.itemName,
          name: it.itemName,
          sourceItemId: it.itemId,
        })),
        form: {
          customer: party,
          partyName: party,
          partyId: row.party_id,
          phone: row.party_phone || "",
          invoiceNumber: row.document_number,
          invoiceDate: txnDate,
          dueDate: dueDate,
          billingAddress: row.billing_address || "",
          shippingAddress: row.shipping_address || "",
          paymentType: row.payment_mode || "Cash",
        },
        totals: {
          subtotal: parseFloat(row.subtotal) || effectiveTotal,
          discount: parseFloat(row.discount_amount) || 0,
          tax: parseFloat(row.tax_amount) || 0,
          roundOffAmount: parseFloat(row.round_off) || 0,
          finalTotal: effectiveTotal,
          received: parseFloat(row.paid_amount) || 0,
          balance: parseFloat(row.balance_amount) || 0,
        },
        customerPhone: row.party_phone || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    console.error("[Transactions GET Error]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to fetch transactions." });
  }
});

/**
 * GET /api/transactions/stats
 * Aggregates summary statistics by transaction type
 */
router.get("/stats", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [stats] = await pool.query(
      `SELECT transaction_type,
              COUNT(*) AS count,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COALESCE(SUM(paid_amount), 0) AS paid_amount,
              COALESCE(SUM(balance_amount), 0) AS balance_amount
       FROM transactions
       WHERE business_id = ?
       GROUP BY transaction_type`,
      [businessId]
    );

    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error("[Transactions Stats Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/transactions/:id
 * Fetches single transaction with its normalized transaction_items rows
 */
router.get("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const txnId = req.params.id;

    const [rows] = await pool.query(
      `SELECT t.*,
              COALESCE(NULLIF(TRIM(t.party_name), ''), p.party_name, IF(t.payment_mode = 'Cash' OR t.transaction_type = 'pos', 'Cash Sale', '')) AS resolved_party_name,
              COALESCE(NULLIF(TRIM(t.party_phone), ''), p.phone, '') AS resolved_party_phone,
              COALESCE(NULLIF(TRIM(t.party_gstin), ''), p.gstin, '') AS resolved_party_gstin,
              COALESCE(NULLIF(TRIM(t.billing_address), ''), p.billing_address, '') AS resolved_billing_address,
              COALESCE(NULLIF(TRIM(t.shipping_address), ''), p.shipping_address, '') AS resolved_shipping_address
       FROM transactions t
       LEFT JOIN parties p ON t.party_id = p.id
       WHERE t.business_id = ? AND t.id = ?
       LIMIT 1`,
      [businessId, txnId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }

    const row = rows[0];

    // Fetch line items from normalized transaction_items table
    const [itemRows] = await pool.query(
      `SELECT * FROM transaction_items WHERE business_id = ? AND transaction_id = ? ORDER BY id ASC`,
      [businessId, txnId]
    );

    const items = itemRows.map((item) => ({
      id: item.id,
      itemId: item.item_id,
      sourceItemId: item.item_id,
      item: item.item_name,
      name: item.item_name,
      itemName: item.item_name,
      itemCode: item.item_code || "",
      barcode: item.barcode || item.item_code || "",
      size: item.item_code || "",
      hsn: item.hsn_code || "",
      hsnCode: item.hsn_code || "",
      batchNo: item.batch_no || "",
      serialNo: item.serial_no || "",
      description: item.serial_no || "",
      qty: parseFloat(item.quantity) || 0,
      quantity: parseFloat(item.quantity) || 0,
      freeQty: parseFloat(item.free_qty) || 0,
      unit: item.unit || "PCS",
      price: parseFloat(item.unit_price) || 0,
      unitPrice: parseFloat(item.unit_price) || 0,
      purchasePrice: parseFloat(item.purchase_price) || 0,
      discountPercent: parseFloat(item.discount_percent) || 0,
      discountAmount: parseFloat(item.discount_amount) || 0,
      taxRate: parseFloat(item.tax_rate) || 0,
      taxAmount: parseFloat(item.tax_amount) || 0,
      cgstAmount: parseFloat(item.cgst_amount) || 0,
      sgstAmount: parseFloat(item.sgst_amount) || 0,
      igstAmount: parseFloat(item.igst_amount) || 0,
      cessAmount: parseFloat(item.cess_amount) || 0,
      amount: parseFloat(item.total_amount) || 0,
      totalAmount: parseFloat(item.total_amount) || 0,
      isActive: item.is_active !== 0,
      is_active: item.is_active,
    }));

    const txnDate = formatSqlDate(row.transaction_date);
    const dueDate = formatSqlDate(row.due_date);
    const itemsTotal = items.reduce((s, it) => s + (parseFloat(it.totalAmount || it.amount) || 0), 0);
    const rawTotal = parseFloat(row.total_amount) || 0;
    const effectiveTotal = rawTotal > 0 ? rawTotal : itemsTotal;
    const party = row.resolved_party_name || row.party_name || (row.payment_mode === "Cash" || row.transaction_type === "pos" ? "Cash Sale" : "");
    const phone = row.resolved_party_phone || row.party_phone || "";
    const billingAddress = row.resolved_billing_address || row.billing_address || "";
    const shippingAddress = row.resolved_shipping_address || row.shipping_address || billingAddress || "";

    const payments = items.length > 0
      ? items.map((it) => ({
          id: it.id,
          type: it.itemName || it.item || "Cash",
          amount: String(it.totalAmount || it.amount || 0),
          reference: it.itemCode || it.reference || "",
          chequeDate: it.serialNo || it.chequeDate || "",
        }))
      : [
          {
            id: `pay-${row.id}`,
            type: row.payment_mode || "Cash",
            amount: String(row.paid_amount || effectiveTotal),
            reference: row.payment_ref_no || "",
            chequeDate: "",
          },
        ];

    return res.json({
      success: true,
      data: {
        id: row.id,
        transactionType: row.transaction_type,
        type: row.transaction_type,
        documentNumber: row.document_number,
        number: row.document_number,
        invoiceNumber: row.document_number,
        transactionDate: toSqlDate(row.transaction_date),
        dueDate: toSqlDate(row.due_date),
        partyId: row.party_id,
        partyName: party,
        party,
        customer: party,
        customerName: party,
        supplierName: party,
        supplier: party,
        partyPhone: phone,
        phone,
        partyGstin: row.resolved_party_gstin || row.party_gstin || "",
        billingAddress,
        shippingAddress,
        subtotal: parseFloat(row.subtotal) || effectiveTotal,
        discountPercent: parseFloat(row.discount_percent) || 0,
        discountAmount: parseFloat(row.discount_amount) || 0,
        taxAmount: parseFloat(row.tax_amount) || 0,
        roundOff: parseFloat(row.round_off) || 0,
        roundOffValue: String(row.round_off ?? ""),
        totalAmount: effectiveTotal,
        paidAmount: parseFloat(row.paid_amount) || 0,
        receivedAmount: parseFloat(row.paid_amount) || 0,
        received: parseFloat(row.paid_amount) || 0,
        balanceAmount: parseFloat(row.balance_amount) || 0,
        paymentMode: row.payment_mode || "Cash",
        paymentType: row.payment_mode || "Cash",
        status: row.payment_status || "Completed",
        paymentRefNo: row.payment_ref_no || "",
        cashTendered: parseFloat(row.cash_tendered) || 0,
        changeReturned: parseFloat(row.change_returned) || 0,
        vehicleNo: row.vehicle_no || "",
        eWayBillNo: row.e_way_bill_no || "",
        poNumber: row.po_number || "",
        linkedInvoiceId: row.po_number || "",
        poDate: toSqlDate(row.po_date),
        notes: row.notes || "",
        description: row.notes || "",
        terms: row.terms || "",
        payments,
        items,
        rows: items.map((it) => ({
          ...it,
          item: it.itemName,
          name: it.itemName,
          sourceItemId: it.itemId,
        })),
        form: {
          customer: party,
          partyName: party,
          partyId: row.party_id,
          phone,
          invoiceNumber: row.document_number,
          invoiceDate: txnDate,
          dueDate: dueDate,
          billingAddress,
          shippingAddress,
          paymentType: row.payment_mode || "Cash",
        },
        totals: {
          subtotal: parseFloat(row.subtotal) || effectiveTotal,
          discount: parseFloat(row.discount_amount) || 0,
          tax: parseFloat(row.tax_amount) || 0,
          roundOffAmount: parseFloat(row.round_off) || 0,
          finalTotal: effectiveTotal,
          received: parseFloat(row.paid_amount) || 0,
          balance: parseFloat(row.balance_amount) || 0,
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/transactions
 * Atomically saves transaction header and all transaction_items child rows in pure SQL columns
 */
const saveTransactionHandler = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = req.params?.id || body.id || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const transactionType = (body.transactionType || body.type || "sale").toLowerCase();
    const documentNumber = String(
      body.documentNumber ||
      body.invoiceNumber ||
      body.billNumber ||
      body.number ||
      body.form?.invoiceNumber ||
      body.form?.billNumber ||
      "0"
    ).trim();
    const rawTxnDate = body.transactionDate || body.invoiceDate || body.billDate || body.date || body.form?.invoiceDate || new Date();
    const transactionDate = formatSqlDate(rawTxnDate) || new Date().toISOString().slice(0, 10);
    const dueDate = formatSqlDate(body.dueDate || body.form?.dueDate);
    const rawPartyId = body.partyId || body.party_id || body.form?.partyId || body.customerId || null;
    const partyId = (rawPartyId && rawPartyId !== "null" && rawPartyId !== "undefined" && String(rawPartyId).trim()) ? String(rawPartyId).trim() : null;
    const partyName = (body.partyName || body.party || body.customerName || body.customer || body.supplierName || body.supplier || body.form?.customer || body.form?.supplier || body.form?.partyName || body.form?.party || "").trim() ||
      ((body.paymentMode === "Cash" || body.paymentType === "Cash" || body.form?.paymentType === "Cash" || transactionType === "pos") ? "Cash Sale" : null);
    const partyPhone = body.partyPhone || body.phone || body.mobile || body.customerPhone || body.form?.phone || null;
    const partyGstin = body.partyGstin || body.gstin || body.form?.gstin || null;
    const billingAddress = typeof (body.billingAddress || body.billing_address) === "object"
      ? JSON.stringify(body.billingAddress || body.billing_address)
      : (body.billingAddress || body.form?.billingAddress || body.billing_address || null);
    const shippingAddress = typeof (body.shippingAddress || body.shipping_address) === "object"
      ? JSON.stringify(body.shippingAddress || body.shipping_address)
      : (body.shippingAddress || body.form?.shippingAddress || body.shipping_address || billingAddress || null);

    // Party integrity validation: verify party exists under this business if partyId is provided
    if (partyId) {
      const [partyCheck] = await conn.query(
        `SELECT id, party_name FROM parties WHERE business_id = ? AND id = ? LIMIT 1`,
        [businessId, partyId]
      );
      if (!partyCheck.length) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Party validation failed: Party '${partyName || partyId}' (ID: ${partyId}) does not exist under business '${businessId}'.`,
        });
      }
    }

    const rawPayments = Array.isArray(body.payments) && body.payments.length > 0 ? body.payments : [];
    let rawItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : (Array.isArray(body.rows) && body.rows.length
          ? body.rows
          : (Array.isArray(body.lineItems) && body.lineItems.length ? body.lineItems : []));

    if ((transactionType === "payment_in" || transactionType === "payment_out") && rawItems.length === 0) {
      if (rawPayments.length > 0) {
        rawItems = rawPayments.map((p, idx) => ({
          id: p.id || `${id}_pay_${idx + 1}`,
          itemName: p.type || "Cash",
          item: p.type || "Cash",
          unit: "TXN",
          quantity: 1,
          qty: 1,
          unitPrice: parseFloat(p.amount) || 0,
          price: parseFloat(p.amount) || 0,
          totalAmount: parseFloat(p.amount) || 0,
          amount: parseFloat(p.amount) || 0,
          itemCode: p.reference || "",
          serialNo: p.chequeDate || "",
        }));
      }
    }

    const itemsSum = rawItems.reduce((s, it) => s + (parseFloat(it.totalAmount ?? it.amount ?? (parseFloat(it.qty ?? it.quantity ?? 1) * parseFloat(it.price ?? it.unitPrice ?? 0))) || 0), 0);
    const parsedTotal = parseFloat(body.totalAmount ?? body.total ?? body.amount ?? body.totals?.finalTotal ?? body.totals?.grandTotal ?? 0) || 0;
    const totalAmount = parsedTotal > 0 ? parsedTotal : itemsSum;
    const parsedSubtotal = parseFloat(body.subtotal ?? body.totals?.subtotal ?? body.totals?.taxableAmount ?? 0) || 0;
    const subtotal = parsedSubtotal > 0 ? parsedSubtotal : (totalAmount > 0 ? totalAmount : itemsSum);
    const discountPercent = parseFloat(body.discountPercent ?? body.discount_percent ?? body.totals?.discountPercent ?? 0) || 0;
    const discountAmount = parseFloat(body.discountAmount ?? body.discount ?? body.totals?.discount ?? 0) || 0;
    const taxAmount = parseFloat(body.taxAmount ?? body.tax ?? body.totals?.totalTax ?? body.totals?.tax ?? 0) || 0;
    const roundOff = parseFloat(body.roundOffValue ?? (typeof body.roundOff === 'number' ? body.roundOff : null) ?? body.round_off ?? body.totals?.roundOffAmount ?? 0) || 0;
    const paidAmount = parseFloat(body.paidAmount ?? body.receivedAmount ?? body.received ?? body.paid ?? body.totals?.received ?? (transactionType === "payment_in" || transactionType === "payment_out" ? totalAmount : 0)) || 0;
    const balanceAmount = parseFloat(body.balanceAmount ?? body.balance ?? body.totals?.balance ?? (transactionType === "payment_in" || transactionType === "payment_out" ? 0 : (totalAmount - paidAmount))) || 0;

    const paymentMode = body.paymentMode || body.paymentType || body.form?.paymentType || "Cash";
    const paymentStatus = body.status || body.paymentStatus || (balanceAmount <= 0.001 ? "Paid" : (paidAmount > 0 ? "Partial" : "Unpaid"));
    const paymentRefNo = body.paymentRefNo || body.refNo || null;
    const cashTendered = parseFloat(body.cashTendered ?? body.tendered ?? 0) || 0;
    const changeReturned = parseFloat(body.changeReturned ?? body.change ?? 0) || 0;
    const vehicleNo = body.vehicleNo || null;
    const eWayBillNo = body.eWayBillNo || null;
    const poNumber = body.poNumber || body.linkedInvoiceId || null;
    const poDate = toSqlDate(body.poDate || body.po_date || body.form?.poDate);
    const notes = body.notes || body.description || null;
    const terms = body.terms || null;

    if ((transactionType === "payment_in" || transactionType === "payment_out") && rawItems.length === 0) {
      rawItems = [{
        id: `${id}_pay_1`,
        itemName: paymentMode || "Cash",
        item: paymentMode || "Cash",
        unit: "TXN",
        quantity: 1,
        qty: 1,
        unitPrice: totalAmount,
        price: totalAmount,
        totalAmount: totalAmount,
        amount: totalAmount,
        itemCode: paymentRefNo || "",
        serialNo: "",
      }];
    }

    // Check if transaction already exists in MySQL for safe differential accounting
    const [existingRows] = await conn.query(
      `SELECT id, transaction_type, party_id, total_amount, paid_amount, balance_amount
       FROM transactions
       WHERE business_id = ? AND id = ?
       FOR UPDATE`,
      [businessId, id]
    );
    const existingTxn = existingRows[0] || null;

    // Inactive items validation: prevent inactive items from being added to new transactions (or as new lines)
    if (transactionType !== "payment_in" && transactionType !== "payment_out") {
      let existingItemIds = new Set();
      let existingItemNames = new Set();
      if (existingTxn) {
        const [existingLines] = await conn.query(
          `SELECT item_id, item_name FROM transaction_items WHERE business_id = ? AND transaction_id = ?`,
          [businessId, id]
        );
        for (const line of existingLines) {
          if (line.item_id) existingItemIds.add(String(line.item_id));
          if (line.item_name) existingItemNames.add(String(line.item_name).trim().toLowerCase());
        }
      }

      for (const item of rawItems) {
        const itemId = item.itemId || item.sourceItemId || item.inventoryItemId || item.item_id || null;
        const itemName = (item.item || item.itemName || item.name || "").trim();

        // Allow existing line items on already-persisted transactions
        if (existingTxn) {
          if (itemId && existingItemIds.has(String(itemId))) continue;
          if (itemName && existingItemNames.has(itemName.toLowerCase())) continue;
        }

        let inactiveCheck = [];
        if (itemId) {
          [inactiveCheck] = await conn.query(
            `SELECT id, name, is_active FROM inventory_items WHERE business_id = ? AND id = ? AND is_active = 0 LIMIT 1`,
            [businessId, itemId]
          );
        }
        if (!inactiveCheck.length && itemName) {
          [inactiveCheck] = await conn.query(
            `SELECT id, name, is_active FROM inventory_items WHERE business_id = ? AND LOWER(TRIM(name)) = LOWER(?) AND is_active = 0 LIMIT 1`,
            [businessId, itemName]
          );
        }

        if (inactiveCheck.length > 0) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            code: "INACTIVE_ITEM_REJECTED",
            message: `Item '${inactiveCheck[0].name || itemName}' is inactive and cannot be added to a transaction.`,
          });
        }
      }
    }

    // 1. Upsert Transaction Header (Pure SQL columns)
    await conn.query(
      `INSERT INTO transactions (
        id, business_id, transaction_type, document_number, transaction_date, due_date,
        party_id, party_name, party_phone, party_gstin, billing_address, shipping_address,
        subtotal, discount_percent, discount_amount, tax_amount, round_off, total_amount,
        paid_amount, balance_amount, payment_mode, payment_status, payment_ref_no,
        cash_tendered, change_returned, vehicle_no, e_way_bill_no, po_number, po_date,
        notes, terms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        transaction_type = VALUES(transaction_type),
        document_number = VALUES(document_number),
        transaction_date = VALUES(transaction_date),
        due_date = VALUES(due_date),
        party_id = VALUES(party_id),
        party_name = VALUES(party_name),
        party_phone = VALUES(party_phone),
        party_gstin = VALUES(party_gstin),
        billing_address = VALUES(billing_address),
        shipping_address = VALUES(shipping_address),
        subtotal = VALUES(subtotal),
        discount_percent = VALUES(discount_percent),
        discount_amount = VALUES(discount_amount),
        tax_amount = VALUES(tax_amount),
        round_off = VALUES(round_off),
        total_amount = VALUES(total_amount),
        paid_amount = VALUES(paid_amount),
        balance_amount = VALUES(balance_amount),
        payment_mode = VALUES(payment_mode),
        payment_status = VALUES(payment_status),
        payment_ref_no = VALUES(payment_ref_no),
        cash_tendered = VALUES(cash_tendered),
        change_returned = VALUES(change_returned),
        vehicle_no = VALUES(vehicle_no),
        e_way_bill_no = VALUES(e_way_bill_no),
        po_number = VALUES(po_number),
        po_date = VALUES(po_date),
        notes = VALUES(notes),
        terms = VALUES(terms),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, transactionType, documentNumber, transactionDate, dueDate,
        partyId, partyName, partyPhone, partyGstin, billingAddress, shippingAddress,
        subtotal, discountPercent, discountAmount, taxAmount, roundOff, totalAmount,
        paidAmount, balanceAmount, paymentMode, paymentStatus, paymentRefNo,
        cashTendered, changeReturned, vehicleNo, eWayBillNo, poNumber, poDate,
        notes, terms
      ]
    );

    // 2. Revert previous inventory movements if this is an update, then re-insert fresh lines
    if (existingTxn) {
      const [oldLines] = await conn.query(
        `SELECT item_id, batch_no, quantity, free_qty FROM transaction_items WHERE business_id = ? AND transaction_id = ?`,
        [businessId, id]
      );
      for (const line of oldLines) {
        if (line.item_id) {
          const qty = (parseFloat(line.quantity) || 0) + (parseFloat(line.free_qty) || 0);
          let revertStock = 0;
          const oldType = String(existingTxn.transaction_type || "").toLowerCase();
          if (oldType === "sale" || oldType === "pos" || oldType === "delivery_challan" || oldType === "purchase_return" || oldType === "debit note" || oldType === "debit_note") {
            revertStock = +qty;
          } else if (oldType === "purchase" || oldType === "sale_return" || oldType === "credit note" || oldType === "credit_note") {
            revertStock = -qty;
          }
          if (revertStock !== 0) {
            await conn.query(
              `UPDATE inventory_items SET current_stock = current_stock + ? WHERE business_id = ? AND id = ?`,
              [revertStock, businessId, line.item_id]
            );
            if (line.batch_no) {
              await conn.query(
                `UPDATE item_batches SET current_qty = current_qty + ? WHERE business_id = ? AND item_id = ? AND batch_no = ?`,
                [revertStock, businessId, line.item_id, line.batch_no]
              );
            }
          }
        }
      }
    }

    await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?`, [businessId, id]);

    let itemIdx = 0;
    for (const item of rawItems) {
      itemIdx++;
      const lineId = item.id || `${id}_item_${itemIdx}_${Math.random().toString(36).substring(2, 6)}`;
      const itemId = item.itemId || item.sourceItemId || item.inventoryItemId || item.item_id || null;
      const itemName = (item.item || item.itemName || item.name || "Item").trim();
      const itemCode = (item.itemCode || item.code || item.size || item.item_code || "").trim() || null;
      const barcode = (item.barcode || item.barCode || item.itemBarcode || itemCode || "").trim() || null;
      const hsnCode = item.hsnCode || item.hsn || item.hsn_code || null;
      const batchNo = item.batchNo || item.batch || item.batch_no || null;
      const serialNo = Array.isArray(item.serialNumbers)
        ? item.serialNumbers.join(",")
        : (item.serialNo || item.serial || item.description || null);
      const quantity = parseFloat(item.qty ?? item.quantity ?? 1) || 1;
      const freeQty = parseFloat(item.freeQty ?? 0) || 0;
      const unit = item.unit || "PCS";
      const unitPrice = parseFloat(item.price ?? item.unitPrice ?? item.rate ?? 0) || 0;
      const purchasePrice = parseFloat(item.purchasePrice ?? item.purchase_price ?? 0) || 0;
      const itemDiscountPercent = parseFloat(item.discountPercent ?? item.discount_percent ?? (item.discountMode !== "amount" && item.discountType !== "amount" ? item.discount : 0) ?? 0) || 0;
      const itemDiscountAmount = parseFloat(item.discountAmount ?? item.discount_amount ?? (item.discountMode === "amount" || item.discountType === "amount" ? item.discount : 0) ?? 0) || 0;
      const itemTaxRate = parseFloat(item.taxRate ?? item.tax_rate ?? (item.tax && item.tax !== "NONE" ? String(item.tax).replace(/[^0-9.]/g, "") : 0) ?? 0) || 0;
      const itemTaxAmount = parseFloat(item.taxAmount ?? item.tax_amount ?? 0) || 0;
      const cgstRate = parseFloat(item.cgstRate ?? (itemTaxRate / 2)) || 0;
      const cgstAmount = parseFloat(item.cgstAmount ?? (itemTaxAmount / 2)) || 0;
      const sgstRate = parseFloat(item.sgstRate ?? (itemTaxRate / 2)) || 0;
      const sgstAmount = parseFloat(item.sgstAmount ?? (itemTaxAmount / 2)) || 0;
      const igstRate = parseFloat(item.igstRate ?? 0) || 0;
      const igstAmount = parseFloat(item.igstAmount ?? 0) || 0;
      const cessRate = parseFloat(item.cessRate ?? item.cessPercent ?? 0) || 0;
      const cessAmount = parseFloat(item.cessAmount ?? item.cess ?? 0) || 0;
      const itemTotalAmount = parseFloat(item.calculated?.amount ?? item.amount ?? item.totalAmount ?? (quantity * unitPrice - itemDiscountAmount)) || 0;
      const itemIsActive = item.isActive !== undefined ? (item.isActive ? 1 : 0) : (item.is_active !== undefined ? (item.is_active ? 1 : 0) : 1);

      await conn.query(
        `INSERT INTO transaction_items (
          id, transaction_id, business_id, item_id, item_name, item_code, barcode, hsn_code,
          batch_no, serial_no, quantity, free_qty, unit, unit_price, purchase_price,
          discount_percent, discount_amount, tax_rate, tax_amount, cgst_rate, cgst_amount,
          sgst_rate, sgst_amount, igst_rate, igst_amount, cess_rate, cess_amount, total_amount, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId, id, businessId, itemId, itemName, itemCode, barcode, hsnCode,
          batchNo, serialNo, quantity, freeQty, unit, unitPrice, purchasePrice,
          itemDiscountPercent, itemDiscountAmount, itemTaxRate, itemTaxAmount, cgstRate, cgstAmount,
          sgstRate, sgstAmount, igstRate, igstAmount, cessRate, cessAmount, itemTotalAmount, itemIsActive
        ]
      );

      // 3. Atomically adjust stock if linked to inventory item
      if (itemId) {
        let stockDelta = 0;
        const normTxnType = String(transactionType || "").toLowerCase();
        if (normTxnType === "sale" || normTxnType === "pos" || normTxnType === "delivery_challan" || normTxnType === "purchase_return" || normTxnType === "debit note" || normTxnType === "debit_note") {
          stockDelta = -(quantity + freeQty);
        } else if (normTxnType === "purchase" || normTxnType === "sale_return" || normTxnType === "credit note" || normTxnType === "credit_note") {
          stockDelta = (quantity + freeQty);
        }

        if (stockDelta !== 0) {
          await conn.query(
            `UPDATE inventory_items
             SET current_stock = current_stock + ?
             WHERE business_id = ? AND id = ?`,
            [stockDelta, businessId, itemId]
          );

          if (batchNo) {
            await conn.query(
              `UPDATE item_batches
               SET current_qty = current_qty + ?
               WHERE business_id = ? AND item_id = ? AND batch_no = ?`,
              [stockDelta, businessId, itemId, batchNo]
            );
          }
        }
      }
    }

    // 4. Atomically update party ledger balance with strict differential accounting
    const newImpact = getPartyBalanceImpact(transactionType, balanceAmount, paidAmount);

    if (existingTxn) {
      const oldImpact = getPartyBalanceImpact(
        existingTxn.transaction_type,
        parseFloat(existingTxn.balance_amount) || 0,
        parseFloat(existingTxn.paid_amount) || 0
      );
      const oldPartyId = existingTxn.party_id;

      if (oldPartyId === partyId) {
        // Same party: apply only the difference between new impact and old impact
        const netDelta = newImpact - oldImpact;
        if (netDelta !== 0 && partyId) {
          await conn.query(
            `UPDATE parties SET current_balance = current_balance + ? WHERE business_id = ? AND id = ?`,
            [netDelta, businessId, partyId]
          );
        }
      } else {
        // Party changed: revert old impact from old party, apply new impact to new party
        if (oldPartyId && oldImpact !== 0) {
          await conn.query(
            `UPDATE parties SET current_balance = current_balance - ? WHERE business_id = ? AND id = ?`,
            [oldImpact, businessId, oldPartyId]
          );
        }
        if (partyId && newImpact !== 0) {
          await conn.query(
            `UPDATE parties SET current_balance = current_balance + ? WHERE business_id = ? AND id = ?`,
            [newImpact, businessId, partyId]
          );
        }
      }
    } else {
      // Brand new transaction: apply full impact
      if (partyId && newImpact !== 0) {
        await conn.query(
          `UPDATE parties SET current_balance = current_balance + ? WHERE business_id = ? AND id = ?`,
          [newImpact, businessId, partyId]
        );
      }
    }

    // Sync cash movement into cash_in_hand table
    const normPayMode = String(paymentMode || "").toLowerCase();
    if (normPayMode === "cash") {
      let entryType = "in";
      let cashAmt = parseFloat(paidAmount) || 0;
      if (cashAmt <= 0) cashAmt = parseFloat(totalAmount) || 0;
      if (["purchase", "expense", "payment_out", "payment-out", "sale_return", "credit note", "credit_note"].includes(transactionType.toLowerCase())) {
        entryType = "out";
      }
      if (cashAmt > 0) {
        await conn.query(
          `INSERT INTO cash_in_hand (
            id, business_id, entry_date, entry_type, amount,
            party_id, party_name, reference_type, reference_no, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            entry_date = VALUES(entry_date),
            entry_type = VALUES(entry_type),
            amount = VALUES(amount),
            party_id = VALUES(party_id),
            party_name = VALUES(party_name),
            reference_type = VALUES(reference_type),
            reference_no = VALUES(reference_no),
            description = VALUES(description)`,
          [
            id,
            businessId,
            toSqlDate(transactionDate) || new Date().toISOString().slice(0, 10),
            entryType,
            cashAmt,
            partyId || null,
            partyName || "Cash",
            transactionType,
            documentNumber || "",
            notes || `${transactionType.toUpperCase()} #${documentNumber || id.slice(0, 8)}`
          ]
        );
      }
    } else {
      await conn.query(
        `DELETE FROM cash_in_hand WHERE business_id = ? AND id = ? AND (reference_type IS NULL OR reference_type != 'adjustment')`,
        [businessId, id]
      );
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Transaction and line items saved successfully in pure relational rows and columns.",
      data: {
        id,
        transactionType,
        documentNumber,
        transactionDate,
        totalAmount,
        paidAmount,
        balanceAmount,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[Transactions POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

router.post("/", saveTransactionHandler);
router.put("/:id", saveTransactionHandler);

/**
 * DELETE /api/transactions/:id
 * Removes a transaction and its normalized lines atomically, safely reverting party balance and inventory movements
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const txnId = req.params.id;

    const [existingRows] = await conn.query(
      `SELECT id, transaction_type, party_id, total_amount, paid_amount, balance_amount
       FROM transactions
       WHERE business_id = ? AND id = ?
       FOR UPDATE`,
      [businessId, txnId]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      const impact = getPartyBalanceImpact(
        existing.transaction_type,
        parseFloat(existing.balance_amount) || 0,
        parseFloat(existing.paid_amount) || 0
      );

      // Revert party balance adjustment
      if (existing.party_id && impact !== 0) {
        await conn.query(
          `UPDATE parties SET current_balance = current_balance - ? WHERE business_id = ? AND id = ?`,
          [impact, businessId, existing.party_id]
        );
      }

      // Revert inventory stock adjustments
      const [oldLines] = await conn.query(
        `SELECT item_id, batch_no, quantity, free_qty FROM transaction_items WHERE business_id = ? AND transaction_id = ?`,
        [businessId, txnId]
      );
      for (const line of oldLines) {
        if (line.item_id) {
          const qty = (parseFloat(line.quantity) || 0) + (parseFloat(line.free_qty) || 0);
          let revertStock = 0;
          const delType = String(existing.transaction_type || "").toLowerCase();
          if (delType === "sale" || delType === "pos" || delType === "delivery_challan" || delType === "purchase_return" || delType === "debit note" || delType === "debit_note") {
            revertStock = +qty;
          } else if (delType === "purchase" || delType === "sale_return" || delType === "credit note" || delType === "credit_note") {
            revertStock = -qty;
          }
          if (revertStock !== 0) {
            await conn.query(
              `UPDATE inventory_items SET current_stock = current_stock + ? WHERE business_id = ? AND id = ?`,
              [revertStock, businessId, line.item_id]
            );
            if (line.batch_no) {
              await conn.query(
                `UPDATE item_batches SET current_qty = current_qty + ? WHERE business_id = ? AND item_id = ? AND batch_no = ?`,
                [revertStock, businessId, line.item_id, line.batch_no]
              );
            }
          }
        }
      }

      await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?`, [businessId, txnId]);
      await conn.query(`DELETE FROM cash_in_hand WHERE business_id = ? AND id = ? AND (reference_type IS NULL OR reference_type != 'adjustment')`, [businessId, txnId]);
      await conn.query(`DELETE FROM transactions WHERE business_id = ? AND id = ?`, [businessId, txnId]);
    }

    await conn.commit();
    return res.json({ success: true, message: "Transaction deleted successfully." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;
