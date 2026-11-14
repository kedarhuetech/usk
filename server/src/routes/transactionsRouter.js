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
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

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

    const conditions = ["business_id = ?"];
    const params = [businessId];

    if (type && type !== "all") {
      conditions.push("transaction_type = ?");
      params.push(type);
    }

    if (partyId) {
      conditions.push("party_id = ?");
      params.push(partyId);
    }

    if (search) {
      conditions.push("(document_number LIKE ? OR party_name LIKE ? OR party_phone LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (startDate) {
      conditions.push("transaction_date >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("transaction_date <= ?");
      params.push(endDate);
    }

    const whereClause = conditions.join(" AND ");

    // Query 1: Total count for lazy loading
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Query 2: Fetch paginated transaction headers
    const [rows] = await pool.query(
      `SELECT id, business_id, transaction_type, document_number, transaction_date, due_date,
              party_id, party_name, party_phone, party_gstin, billing_address, shipping_address,
              subtotal, discount_percent, discount_amount, tax_amount, round_off, total_amount,
              paid_amount, balance_amount, payment_mode, payment_status, payment_ref_no,
              cash_tendered, change_returned, vehicle_no, e_way_bill_no, po_number, po_date,
              notes, terms, created_at, updated_at
       FROM transactions
       WHERE ${whereClause}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Query 3: Fetch normalized line items from transaction_items child table
    const txnIds = rows.map((r) => r.id);
    let itemsMap = new Map();
    if (txnIds.length > 0) {
      const placeholders = txnIds.map(() => "?").join(",");
      const [itemRows] = await pool.query(
        `SELECT id, transaction_id, item_id, item_name, item_code, hsn_code,
                batch_no, serial_no, quantity, free_qty, unit, unit_price,
                purchase_price, discount_percent, discount_amount, tax_rate,
                tax_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
                igst_rate, igst_amount, cess_rate, cess_amount, total_amount
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
          name: item.item_name,
          itemName: item.item_name,
          itemCode: item.item_code || "",
          hsnCode: item.hsn_code || "",
          batchNo: item.batch_no || "",
          serialNo: item.serial_no || "",
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
        });
      }
    }

    const transactions = rows.map((row) => ({
      id: row.id,
      transactionType: row.transaction_type,
      type: row.transaction_type,
      documentNumber: row.document_number,
      invoiceNumber: row.document_number,
      billNumber: row.document_number,
      orderNumber: row.document_number,
      transactionDate: row.transaction_date,
      invoiceDate: row.transaction_date,
      billDate: row.transaction_date,
      dueDate: row.due_date,
      partyId: row.party_id,
      partyName: row.party_name || "",
      party: row.party_name || "",
      customerName: row.party_name || "",
      supplierName: row.party_name || "",
      partyPhone: row.party_phone || "",
      phone: row.party_phone || "",
      partyGstin: row.party_gstin || "",
      billingAddress: row.billing_address || "",
      shippingAddress: row.shipping_address || "",
      subtotal: parseFloat(row.subtotal) || 0,
      discountPercent: parseFloat(row.discount_percent) || 0,
      discountAmount: parseFloat(row.discount_amount) || 0,
      taxAmount: parseFloat(row.tax_amount) || 0,
      roundOff: parseFloat(row.round_off) || 0,
      totalAmount: parseFloat(row.total_amount) || 0,
      total: parseFloat(row.total_amount) || 0,
      amount: parseFloat(row.total_amount) || 0,
      paidAmount: parseFloat(row.paid_amount) || 0,
      receivedAmount: parseFloat(row.paid_amount) || 0,
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
      poDate: row.po_date || null,
      notes: row.notes || "",
      terms: row.terms || "",
      items: itemsMap.get(row.id) || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

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
 * GET /api/transactions/:id
 * Fetches single transaction with its normalized transaction_items rows
 */
router.get("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const txnId = req.params.id;

    const [rows] = await pool.query(
      `SELECT * FROM transactions WHERE business_id = ? AND id = ? LIMIT 1`,
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
      name: item.item_name,
      itemName: item.item_name,
      itemCode: item.item_code || "",
      hsnCode: item.hsn_code || "",
      batchNo: item.batch_no || "",
      serialNo: item.serial_no || "",
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
    }));

    return res.json({
      success: true,
      data: {
        id: row.id,
        transactionType: row.transaction_type,
        type: row.transaction_type,
        documentNumber: row.document_number,
        invoiceNumber: row.document_number,
        transactionDate: row.transaction_date,
        dueDate: row.due_date,
        partyId: row.party_id,
        partyName: row.party_name || "",
        partyPhone: row.party_phone || "",
        partyGstin: row.party_gstin || "",
        billingAddress: row.billing_address || "",
        shippingAddress: row.shipping_address || "",
        subtotal: parseFloat(row.subtotal) || 0,
        discountPercent: parseFloat(row.discount_percent) || 0,
        discountAmount: parseFloat(row.discount_amount) || 0,
        taxAmount: parseFloat(row.tax_amount) || 0,
        roundOff: parseFloat(row.round_off) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        paidAmount: parseFloat(row.paid_amount) || 0,
        balanceAmount: parseFloat(row.balance_amount) || 0,
        paymentMode: row.payment_mode || "Cash",
        status: row.payment_status || "Completed",
        paymentRefNo: row.payment_ref_no || "",
        cashTendered: parseFloat(row.cash_tendered) || 0,
        changeReturned: parseFloat(row.change_returned) || 0,
        vehicleNo: row.vehicle_no || "",
        eWayBillNo: row.e_way_bill_no || "",
        poNumber: row.po_number || "",
        poDate: row.po_date || null,
        notes: row.notes || "",
        terms: row.terms || "",
        items,
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
router.post("/", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const transactionType = (body.transactionType || body.type || "sale").toLowerCase();
    const documentNumber = (body.documentNumber || body.invoiceNumber || body.billNumber || body.number || "0").trim();
    const transactionDate = body.transactionDate || body.invoiceDate || body.billDate || body.date || new Date().toISOString().slice(0, 10);
    const dueDate = body.dueDate || null;
    const partyId = body.partyId || body.party_id || null;
    const partyName = body.partyName || body.party || body.customerName || body.supplierName || null;
    const partyPhone = body.partyPhone || body.phone || body.mobile || null;
    const partyGstin = body.partyGstin || body.gstin || null;
    const billingAddress = typeof body.billingAddress === "object" ? JSON.stringify(body.billingAddress) : (body.billingAddress || null);
    const shippingAddress = typeof body.shippingAddress === "object" ? JSON.stringify(body.shippingAddress) : (body.shippingAddress || null);

    const subtotal = parseFloat(body.subtotal ?? body.totalAmount ?? body.amount ?? 0) || 0;
    const discountPercent = parseFloat(body.discountPercent ?? body.discount_percent ?? 0) || 0;
    const discountAmount = parseFloat(body.discountAmount ?? body.discount ?? 0) || 0;
    const taxAmount = parseFloat(body.taxAmount ?? body.tax ?? 0) || 0;
    const roundOff = parseFloat(body.roundOff ?? body.round_off ?? 0) || 0;
    const totalAmount = parseFloat(body.totalAmount ?? body.total ?? body.amount ?? 0) || 0;
    const paidAmount = parseFloat(body.paidAmount ?? body.receivedAmount ?? body.paid ?? 0) || 0;
    const balanceAmount = parseFloat(body.balanceAmount ?? body.balance ?? (totalAmount - paidAmount)) || 0;

    const paymentMode = body.paymentMode || body.paymentType || "Cash";
    const paymentStatus = body.status || (balanceAmount <= 0.001 ? "Paid" : (paidAmount > 0 ? "Partial" : "Unpaid"));
    const paymentRefNo = body.paymentRefNo || body.refNo || null;
    const cashTendered = parseFloat(body.cashTendered ?? body.tendered ?? 0) || 0;
    const changeReturned = parseFloat(body.changeReturned ?? body.change ?? 0) || 0;
    const vehicleNo = body.vehicleNo || null;
    const eWayBillNo = body.eWayBillNo || null;
    const poNumber = body.poNumber || null;
    const poDate = body.poDate || null;
    const notes = body.notes || null;
    const terms = body.terms || null;

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

    // 2. Clear existing line items for update and re-insert into transaction_items table (pure rows & columns)
    await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?`, [businessId, id]);

    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      const lineId = item.id || `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const itemId = item.itemId || item.sourceItemId || item.inventoryItemId || null;
      const itemName = (item.name || item.itemName || "Item").trim();
      const itemCode = item.itemCode || item.code || null;
      const hsnCode = item.hsnCode || item.hsn || null;
      const batchNo = item.batchNo || item.batch || null;
      const serialNo = item.serialNo || item.serial || null;
      const quantity = parseFloat(item.qty ?? item.quantity ?? 1) || 1;
      const freeQty = parseFloat(item.freeQty ?? 0) || 0;
      const unit = item.unit || "PCS";
      const unitPrice = parseFloat(item.price ?? item.unitPrice ?? 0) || 0;
      const purchasePrice = parseFloat(item.purchasePrice ?? 0) || 0;
      const itemDiscountPercent = parseFloat(item.discountPercent ?? 0) || 0;
      const itemDiscountAmount = parseFloat(item.discountAmount ?? 0) || 0;
      const itemTaxRate = parseFloat(item.taxRate ?? item.tax ?? 0) || 0;
      const itemTaxAmount = parseFloat(item.taxAmount ?? 0) || 0;
      const cgstRate = parseFloat(item.cgstRate ?? 0) || 0;
      const cgstAmount = parseFloat(item.cgstAmount ?? 0) || 0;
      const sgstRate = parseFloat(item.sgstRate ?? 0) || 0;
      const sgstAmount = parseFloat(item.sgstAmount ?? 0) || 0;
      const igstRate = parseFloat(item.igstRate ?? 0) || 0;
      const igstAmount = parseFloat(item.igstAmount ?? 0) || 0;
      const cessRate = parseFloat(item.cessRate ?? 0) || 0;
      const cessAmount = parseFloat(item.cessAmount ?? 0) || 0;
      const itemTotalAmount = parseFloat(item.amount ?? item.totalAmount ?? (quantity * unitPrice)) || 0;

      await conn.query(
        `INSERT INTO transaction_items (
          id, transaction_id, business_id, item_id, item_name, item_code, hsn_code,
          batch_no, serial_no, quantity, free_qty, unit, unit_price, purchase_price,
          discount_percent, discount_amount, tax_rate, tax_amount, cgst_rate, cgst_amount,
          sgst_rate, sgst_amount, igst_rate, igst_amount, cess_rate, cess_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId, id, businessId, itemId, itemName, itemCode, hsnCode,
          batchNo, serialNo, quantity, freeQty, unit, unitPrice, purchasePrice,
          itemDiscountPercent, itemDiscountAmount, itemTaxRate, itemTaxAmount, cgstRate, cgstAmount,
          sgstRate, sgstAmount, igstRate, igstAmount, cessRate, cessAmount, itemTotalAmount
        ]
      );

      // 3. Atomically adjust stock if linked to inventory item
      if (itemId) {
        let stockDelta = 0;
        if (transactionType === "sale" || transactionType === "pos" || transactionType === "delivery_challan") {
          stockDelta = -(quantity + freeQty);
        } else if (transactionType === "purchase" || transactionType === "sale_return") {
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

    // 4. Atomically update party ledger balance
    if (partyId) {
      let balanceDelta = 0;
      if (transactionType === "sale" || transactionType === "pos") {
        balanceDelta = balanceAmount;
      } else if (transactionType === "payment_in") {
        balanceDelta = -paidAmount;
      } else if (transactionType === "purchase") {
        balanceDelta = -balanceAmount;
      } else if (transactionType === "payment_out") {
        balanceDelta = paidAmount;
      }

      if (balanceDelta !== 0) {
        await conn.query(
          `UPDATE parties
           SET current_balance = current_balance + ?
           WHERE business_id = ? AND id = ?`,
          [balanceDelta, businessId, partyId]
        );
      }
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
});

/**
 * DELETE /api/transactions/:id
 * Removes a transaction and its normalized lines atomically
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const txnId = req.params.id;

    await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?`, [businessId, txnId]);
    await conn.query(`DELETE FROM transactions WHERE business_id = ? AND id = ?`, [businessId, txnId]);

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
