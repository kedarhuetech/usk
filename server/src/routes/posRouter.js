import express from "express";
import { createHash } from "node:crypto";
import { pool } from "../db/mysql.js";

const router = express.Router();
let tenantKeyCheck;

router.use(async (_req, res, next) => {
  try {
    if (!tenantKeyCheck) {
      tenantKeyCheck = (async () => {
        const [columns] = await pool.query(
          `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_drafts' AND CONSTRAINT_NAME = 'PRIMARY'
            ORDER BY ORDINAL_POSITION`
        );
        const key = columns.map((column) => column.COLUMN_NAME);
        if (key.length !== 2 || key[0] !== 'business_id' || key[1] !== 'id') {
          throw new Error('POS tenant-scoped draft schema upgrade is required.');
        }
        const [tenantColumn] = await pool.query(
          `SELECT IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_drafts' AND COLUMN_NAME = 'business_id'`
        );
        if (tenantColumn.length !== 1 || tenantColumn[0].IS_NULLABLE !== 'NO' || tenantColumn[0].COLUMN_DEFAULT !== null) {
          throw new Error('POS draft business_id must be required and have no default value.');
        }
      })();
    }
    await tenantKeyCheck;
    next();
  } catch (error) {
    return res.status(503).json({ success: false, code: 'POS_SCHEMA_UPGRADE_REQUIRED', message: error.message });
  }
});

function requirePosBusinessId(req) {
  const businessId = String(req.user?.businessId || "").trim();
  if (!businessId || businessId.length > 64 || businessId.toLowerCase() === "default") {
    throw Object.assign(new Error("An authenticated business identity is required for POS."), { status: 401 });
  }
  return businessId;
}

/**
 * Validates POS Draft payload structure
 */
function validateDraftPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Draft payload must be an object.";
  }
  if (!Array.isArray(payload.items)) {
    return "Draft items must be an array.";
  }
  return null;
}

/**
 * GET /api/pos/drafts
 * Lists all active (non-finalized) POS drafts for the authenticated business.
 */
router.get("/drafts", async (req, res) => {
  try {
    const businessId = requirePosBusinessId(req);
    const [rows] = await pool.query(
      `SELECT id, invoice_number, draft_name, payload, is_finalized, finalized_transaction_id, created_at, updated_at
       FROM pos_drafts
       WHERE business_id = ? AND is_finalized = 0
       ORDER BY updated_at DESC`,
      [businessId]
    );

    const drafts = rows.map((r) => {
      let parsed = r.payload;
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
      }
      return {
        invoiceNo: r.invoice_number || parsed?.invoiceNo || "",
        draftName: r.draft_name || parsed?.draftName || "",
        ...parsed,
        id: r.id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return res.json({ success: true, data: drafts });
  } catch (err) {
    console.error("[POS GET Drafts Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/pos/drafts/:id
 * Fetches a single POS draft by ID scoped to the authenticated business.
 */
router.get("/drafts/:id", async (req, res) => {
  try {
    const businessId = requirePosBusinessId(req);
    const draftId = String(req.params.id || "").trim();
    if (!draftId) {
      return res.status(400).json({ success: false, message: "Draft ID is required." });
    }

    const [rows] = await pool.query(
      `SELECT id, invoice_number, draft_name, payload, is_finalized, finalized_transaction_id, created_at, updated_at
       FROM pos_drafts
       WHERE business_id = ? AND id = ?`,
      [businessId, draftId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "POS draft not found." });
    }

    const r = rows[0];
    let parsed = r.payload;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
    }

    return res.json({
      success: true,
      data: {
        invoiceNo: r.invoice_number || parsed?.invoiceNo || "",
        draftName: r.draft_name || parsed?.draftName || "",
        isFinalized: Boolean(r.is_finalized),
        finalizedTransactionId: r.finalized_transaction_id,
        ...parsed,
        id: r.id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    });
  } catch (err) {
    console.error("[POS GET Draft By ID Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/pos/drafts/:id
 * Creates or updates a POS draft tab. Idempotent upsert.
 */
router.put("/drafts/:id", async (req, res) => {
  let conn;
  try {
    const businessId = requirePosBusinessId(req);
    const draftId = String(req.params.id || "").trim();
    if (!draftId) {
      return res.status(400).json({ success: false, message: "Draft ID is required." });
    }

    const payload = { ...(req.body || {}) };
    delete payload.businessId;
    delete payload.business_id;
    const validationError = validateDraftPayload(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const invoiceNumber = String(payload.invoiceNo || payload.invoiceNumber || "").trim() || null;
    const draftName = String(payload.draftName || payload.name || "").trim() || null;

    // Check if draft already exists and whether it was finalized
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [existing] = await conn.query(
      `SELECT id, is_finalized, finalized_transaction_id, updated_at FROM pos_drafts WHERE business_id = ? AND id = ? FOR UPDATE`,
      [businessId, draftId]
    );

    if (existing.length > 0 && existing[0].is_finalized) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        code: "DRAFT_ALREADY_FINALIZED",
        message: "This POS draft has already been finalized into a sale and cannot be updated.",
        finalizedTransactionId: existing[0].finalized_transaction_id,
      });
    }
    const expectedUpdatedAt = req.get("If-Match");
    if (existing.length > 0 && expectedUpdatedAt && String(existing[0].updated_at) !== expectedUpdatedAt) {
      await conn.rollback();
      return res.status(409).json({ success: false, code: "DRAFT_VERSION_CONFLICT", message: "This draft changed in another tab. Reload it before saving more changes." });
    }

    await conn.query(
      `INSERT INTO pos_drafts (id, business_id, invoice_number, draft_name, payload, is_finalized, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW(3))
       ON DUPLICATE KEY UPDATE
         invoice_number = VALUES(invoice_number),
         draft_name = VALUES(draft_name),
         payload = VALUES(payload),
         updated_at = NOW(3)`,
      [draftId, businessId, invoiceNumber, draftName, JSON.stringify(payload)]
    );
    const [savedRows] = await conn.query(
      `SELECT updated_at FROM pos_drafts WHERE business_id = ? AND id = ?`,
      [businessId, draftId]
    );
    await conn.commit();

    return res.json({
      success: true,
      message: "POS draft saved successfully.",
      data: { id: draftId, invoiceNo: invoiceNumber, draftName, updatedAt: savedRows[0]?.updated_at || null },
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("[POS PUT Draft Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn?.release();
  }
});

/**
 * DELETE /api/pos/drafts/:id
 * Deletes an open POS draft tab.
 */
router.delete("/drafts/:id", async (req, res) => {
  try {
    const businessId = requirePosBusinessId(req);
    const draftId = String(req.params.id || "").trim();
    if (!draftId) {
      return res.status(400).json({ success: false, message: "Draft ID is required." });
    }

    await pool.query(
      `DELETE FROM pos_drafts WHERE business_id = ? AND id = ?`,
      [businessId, draftId]
    );

    return res.json({ success: true, message: "POS draft deleted successfully." });
  } catch (err) {
    console.error("[POS DELETE Draft Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Helper to resolve item unit multiplier in MySQL
 */
async function resolveUnitMultiplier(conn, businessId, itemId, lineUnit) {
  if (!lineUnit || !itemId) return 1.0;
  const [items] = await conn.query(
    `SELECT unit FROM inventory_items WHERE business_id = ? AND id = ?`,
    [businessId, itemId]
  );
  if (!items.length) return 1.0;
  const baseUnit = (items[0].unit || "PCS").trim().toLowerCase();
  const givenUnit = String(lineUnit).trim().toLowerCase();
  if (baseUnit === givenUnit) return 1.0;

  const [convs] = await conn.query(
    `SELECT conversion_factor, base_unit, secondary_unit
     FROM unit_conversions
     WHERE business_id = ? AND (
       (LOWER(base_unit) = ? AND LOWER(secondary_unit) = ?) OR
       (LOWER(base_unit) = ? AND LOWER(secondary_unit) = ?)
     ) LIMIT 1`,
    [businessId, baseUnit, givenUnit, givenUnit, baseUnit]
  );

  if (convs.length > 0) {
    const factor = parseFloat(convs[0].conversion_factor) || 1.0;
    if (convs[0].base_unit.toLowerCase() === baseUnit) {
      return factor;
    }
    return factor !== 0 ? 1.0 / factor : 1.0;
  }
  return 1.0;
}

/**
 * POST /api/pos/drafts/:id/finalize
 * Atomically locks draft, validates stock with stopSaleOnNegativeStock policy,
 * writes sale transaction and line items, updates inventory & batches,
 * updates customer ledger balance, updates cash drawer, marks draft finalized,
 * and commits inside one MySQL transaction.
 *
 * Implements strict idempotency: if already finalized, returns existing sale.
 */
router.post("/drafts/:id/finalize", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = requirePosBusinessId(req);
    const draftId = String(req.params.id || "").trim();

    if (!draftId) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Draft ID is required." });
    }

    // 1. Lock and retrieve the draft
    const [draftRows] = await conn.query(
      `SELECT id, invoice_number, draft_name, payload, is_finalized, finalized_transaction_id
       FROM pos_drafts
       WHERE business_id = ? AND id = ?
       FOR UPDATE`,
      [businessId, draftId]
    );

    if (!draftRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "POS draft not found." });
    }

    const draftRecord = draftRows[0];

    // Idempotency: if draft is already finalized, return existing transaction cleanly
    if (draftRecord.is_finalized && draftRecord.finalized_transaction_id) {
      const [existingTxn] = await conn.query(
        `SELECT id, transaction_type, document_number, total_amount, paid_amount, balance_amount, payment_mode, payment_status
         FROM transactions
         WHERE business_id = ? AND id = ?`,
        [businessId, draftRecord.finalized_transaction_id]
      );
      if (!existingTxn.length || String(existingTxn[0].transaction_type).toLowerCase() !== "pos") {
        await conn.rollback();
        return res.status(409).json({ success: false, message: "The finalized POS transaction is missing; draft retained for review." });
      }
      await conn.commit();
      return res.json({
        success: true,
        isIdempotentReplay: true,
        message: "POS draft has already been finalized.",
        data: existingTxn[0],
      });
    }

    // Parse payload (accepts body overrides if client sent updated calculations/payment)
    let payload = draftRecord.payload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    const reqBody = (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0)
      ? req.body
      : {};
    const finalData = { ...payload, ...reqBody };
    delete finalData.businessId;
    delete finalData.business_id;

    const rawItems = Array.isArray(finalData.items) ? finalData.items : [];
    if (rawItems.length === 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Cannot finalize POS draft with zero items." });
    }

    // Target transaction ID
    const transactionId = `pos_${createHash("sha256").update(`${businessId}:${draftId}`).digest("hex").slice(0, 48)}`;

    // Check if target transaction already exists in MySQL (prevent duplicate execution)
    const [txnCheck] = await conn.query(
      `SELECT id, transaction_type, total_amount, paid_amount, balance_amount, payment_status
       FROM transactions
       WHERE business_id = ? AND id = ?
       FOR UPDATE`,
      [businessId, transactionId]
    );

    if (txnCheck.length > 0) {
      await conn.rollback();
      return res.status(409).json({ success: false, code: "TRANSACTION_ID_COLLISION", message: "A transaction already uses this POS idempotency key; the draft was preserved." });
    }

    // 2. Fetch business negative stock setting
    const [settingRows] = await conn.query(
      `SELECT setting_value FROM app_settings WHERE business_id = ? AND setting_key = 'stopSaleOnNegativeStock'`,
      [businessId]
    );
    let stopSaleOnNegativeStock = false;
    if (settingRows.length > 0) {
      const val = settingRows[0].setting_value;
      stopSaleOnNegativeStock = val === "true" || val === "1" || val === true;
    }

    // 3. Aggregate item quantities and lock inventory rows for update
    const itemDemands = new Map(); // itemId -> totalBaseQty
    for (const line of rawItems) {
      const itemId = line.itemId || line.productId || line.sourceItemId || line.inventoryItemId || null;
      const qty = Number(line.qty ?? line.quantity ?? 1);
      const freeQty = Number(line.freeQty ?? 0);
      const price = Number(line.price ?? line.unitPrice ?? 0);
      if (!itemId || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(freeQty) || freeQty < 0 || !Number.isFinite(price) || price < 0) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "Every POS line must have a valid item, positive quantity and non-negative price." });
      }
      const multiplier = await resolveUnitMultiplier(conn, businessId, itemId, line.unit);
      const baseQty = (qty + freeQty) * multiplier;
      itemDemands.set(itemId, (itemDemands.get(itemId) || 0) + baseQty);
    }

    const itemMap = new Map();
    if (itemDemands.size > 0) {
      const itemIds = Array.from(itemDemands.keys());
      const placeholders = itemIds.map(() => "?").join(",");
      const [lockedItems] = await conn.query(
        `SELECT id, name, item_code, current_stock, item_type
         FROM inventory_items
         WHERE business_id = ? AND id IN (${placeholders})
         FOR UPDATE`,
        [businessId, ...itemIds]
      );

      for (const item of lockedItems) itemMap.set(item.id, item);

      for (const [itemId, demandedQty] of itemDemands.entries()) {
        const itemMaster = itemMap.get(itemId);
        if (!itemMaster) {
          await conn.rollback();
          return res.status(400).json({ success: false, code: "ITEM_NOT_FOUND", message: `Inventory item ${itemId} is unavailable for this business.` });
        }
        const itemType = String(itemMaster.item_type || "product").toLowerCase();
        if (itemType === "service") continue; // services don't have stock constraints

        const currentStock = parseFloat(itemMaster.current_stock) || 0;
        if (stopSaleOnNegativeStock && demandedQty > currentStock) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            code: "INSUFFICIENT_STOCK",
            message: `Insufficient stock for "${itemMaster.name || itemId}". Available: ${currentStock}, Required: ${demandedQty}.`,
            itemId,
            availableStock: currentStock,
            requiredStock: demandedQty,
          });
        }
      }
    }

    // 4. Financial calculations
    const itemsSum = rawItems.reduce((s, it) => s + (parseFloat(it.total ?? it.totalAmount ?? it.amount ?? (parseFloat(it.qty ?? 1) * parseFloat(it.price ?? 0))) || 0), 0);
    const totalAmount = parseFloat(finalData.total ?? finalData.totalAmount ?? finalData.totals?.finalTotal ?? itemsSum) || itemsSum;
    const subtotal = parseFloat(finalData.subtotal ?? finalData.totals?.subTotal ?? totalAmount) || totalAmount;
    const discountAmount = parseFloat(finalData.itemDiscount ?? finalData.discount ?? finalData.discountAmount ?? 0) +
      parseFloat(finalData.billDiscount ?? 0) +
      parseFloat(finalData.loyaltyDiscount ?? 0);
    const taxAmount = parseFloat(finalData.tax ?? finalData.taxAmount ?? finalData.totals?.tax ?? 0) || 0;
    const roundOff = parseFloat(finalData.roundOff ?? finalData.roundOffValue ?? 0) || 0;

    const paymentMode = String(finalData.paymentMode || finalData.paymentType || "Cash");
    const validMethods = new Set(["cash", "upi", "bank", "bank transfer", "card", "credit"]);
    const components = Array.isArray(finalData.paymentComponents) ? finalData.paymentComponents.map((component) => ({
      method: String(component?.method || component?.paymentMethod || "").trim(),
      amount: Number(component?.amount),
      referenceNumber: component?.referenceNumber ? String(component.referenceNumber).slice(0, 100) : null,
    })) : [];
    if (components.some((component) => !validMethods.has(component.method.toLowerCase()) || !Number.isFinite(component.amount) || component.amount < 0)) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Payment components must use Cash, UPI, Bank or Credit with valid non-negative amounts." });
    }
    const componentSum = components.reduce((sum, component) => sum + component.amount, 0);
    if (components.length && (componentSum > totalAmount + 0.01 || components.some((component) => component.amount <= 0))) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Payment components must be positive and cannot exceed the bill total." });
    }
    let paidAmount = components.length
      ? components.filter((component) => component.method.toLowerCase() !== "credit").reduce((sum, component) => sum + component.amount, 0)
      : parseFloat(finalData.amountReceived ?? finalData.received ?? finalData.paidAmount ?? 0) || 0;
    if (paymentMode.toLowerCase() === "cash" && paidAmount === 0 && (finalData.due === 0 || finalData.due === undefined)) {
      paidAmount = totalAmount; // Default full cash payment
    }
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    const paymentStatus = balanceAmount <= 0.001
      ? "Paid"
      : (paidAmount > 0 ? "Partially Paid" : "Unpaid");

    const documentNumber = String(finalData.invoiceNo || finalData.invoiceNumber || draftRecord.invoice_number || `POS-${Date.now()}`);
    const transactionDate = finalData.date || new Date().toISOString().slice(0, 10);
    const partyId = finalData.customerId || finalData.partyId || null;
    const partyName = (finalData.customer || finalData.partyName || (paymentMode.toLowerCase() === "cash" && !partyId ? "Cash Sale" : "Walk-in Customer")).trim();
    const partyPhone = (finalData.customerPhone || finalData.phone || "").trim();

    if (!Number.isFinite(totalAmount) || totalAmount <= 0 || paidAmount < 0 || paidAmount > totalAmount + 0.01) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Bill total and received amount are invalid." });
    }
    if (balanceAmount > 0.01 && !partyId) {
      await conn.rollback();
      return res.status(400).json({ success: false, code: "CUSTOMER_REQUIRED_FOR_CREDIT", message: "Select a customer before completing a credit or partially paid bill." });
    }
    if (partyId) {
      const [partyRows] = await conn.query(
        `SELECT id FROM parties WHERE business_id = ? AND id = ? FOR UPDATE`,
        [businessId, partyId]
      );
      if (!partyRows.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, code: "CUSTOMER_NOT_FOUND", message: "The selected customer does not belong to this business." });
      }
    }

    // 5. Insert completed POS transaction
    await conn.query(
      `INSERT INTO transactions (
        id, business_id, transaction_type, document_number, transaction_date,
        party_id, party_name, party_phone,
        subtotal, discount_amount, tax_amount, round_off, total_amount,
        paid_amount, balance_amount, payment_mode, payment_status,
        cash_tendered, change_returned, notes, created_at, updated_at
      ) VALUES (
        ?, ?, 'pos', ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, NOW(3), NOW(3)
      )`,
      [
        transactionId, businessId, documentNumber, transactionDate,
        partyId, partyName, partyPhone,
        subtotal, discountAmount, taxAmount, roundOff, totalAmount,
        paidAmount, balanceAmount, paymentMode, paymentStatus,
        parseFloat(finalData.amountReceived || paidAmount) || 0,
        parseFloat(finalData.change || 0) || 0,
        finalData.remarks || null
      ]
    );

    // 6. Insert transaction line items & decrement stock
    let itemIdx = 0;
    for (const item of rawItems) {
      itemIdx++;
      const lineId = `${transactionId}_i${itemIdx}`;
      const itemId = item.productId || item.itemId || item.sourceItemId || null;
      const itemName = (item.name || item.itemName || item.item || "Item").trim();
      const itemCode = (item.code || item.itemCode || "").trim() || null;
      const barcode = (item.barcode || itemCode || "").trim() || null;
      const quantity = parseFloat(item.qty ?? item.quantity ?? 1) || 1;
      const freeQty = parseFloat(item.freeQty ?? 0) || 0;
      const unit = item.unit || "PCS";
      const unitPrice = parseFloat(item.price ?? item.unitPrice ?? 0) || 0;
      const lineDiscount = parseFloat(item.discount ?? item.discountAmount ?? 0) || 0;
      const taxRate = parseFloat(item.taxRate ?? item.tax_rate ?? 0) || 0;
      const lineTotal = parseFloat(item.total ?? item.totalAmount ?? item.amount ?? (quantity * unitPrice - lineDiscount)) || 0;
      const batchNo = item.batchNo || item.batch || null;
      const serialNo = Array.isArray(item.serialNumbers) ? item.serialNumbers.join(",") : (item.serialNo || null);

      await conn.query(
        `INSERT INTO transaction_items (
          id, transaction_id, business_id, item_id, item_name, item_code, barcode,
          batch_no, serial_no, quantity, free_qty, unit, unit_price,
          discount_amount, tax_rate, total_amount, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          lineId, transactionId, businessId, itemId, itemName, itemCode, barcode,
          batchNo, serialNo, quantity, freeQty, unit, unitPrice,
          lineDiscount, taxRate, lineTotal
        ]
      );

      // Decrement stock in MySQL
      if (itemId) {
        const multiplier = await resolveUnitMultiplier(conn, businessId, itemId, unit);
        const baseQty = (quantity + freeQty) * multiplier;
        const itemMaster = itemMap.get(itemId);
        if (String(itemMaster?.item_type || "product").toLowerCase() !== "service") {
          await conn.query(
            `UPDATE inventory_items SET current_stock = current_stock - ? WHERE business_id = ? AND id = ?`,
            [baseQty, businessId, itemId]
          );
        }

        if (batchNo && String(itemMaster?.item_type || "product").toLowerCase() !== "service") {
          const [batchRows] = await conn.query(
            `SELECT current_qty FROM item_batches WHERE business_id = ? AND item_id = ? AND batch_no = ? FOR UPDATE`,
            [businessId, itemId, batchNo]
          );
          if (!batchRows.length || (stopSaleOnNegativeStock && Number(batchRows[0].current_qty) < baseQty)) {
            await conn.rollback();
            return res.status(400).json({ success: false, code: "INSUFFICIENT_BATCH_STOCK", message: `Batch ${batchNo} does not have sufficient stock.` });
          }
          await conn.query(
            `UPDATE item_batches SET current_qty = current_qty - ? WHERE business_id = ? AND item_id = ? AND batch_no = ?`,
            [baseQty, businessId, itemId, batchNo]
          );
        }
      }
    }

    const normalizedComponents = components.length
      ? components.map((component) => ({ ...component }))
      : [{ method: paymentMode, amount: paidAmount, referenceNumber: finalData.paymentRefNo || null }].filter((component) => component.amount > 0);
    const allocatedTotal = normalizedComponents.reduce((sum, component) => sum + component.amount, 0);
    if (totalAmount - allocatedTotal > 0.01) {
      normalizedComponents.push({ method: "Credit", amount: Number((totalAmount - allocatedTotal).toFixed(2)), referenceNumber: null });
    }
    for (let index = 0; index < normalizedComponents.length; index++) {
      const component = normalizedComponents[index];
      await conn.query(
        `INSERT INTO transaction_payments (id, business_id, transaction_id, payment_method, amount, reference_number, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
        [`${transactionId}_p${index + 1}`, businessId, transactionId, component.method[0].toUpperCase() + component.method.slice(1).toLowerCase(), component.amount, component.referenceNumber]
      );
    }

    // 7. Update customer ledger balance if unpaid / credit balance exists
    if (partyId && balanceAmount > 0) {
      await conn.query(
        `UPDATE parties SET current_balance = current_balance + ? WHERE business_id = ? AND id = ?`,
        [balanceAmount, businessId, partyId]
      );
    }

    // 8. Update cash drawer (cash_in_hand) if cash received
    const isCash = paymentMode.toLowerCase() === "cash" || components.some((component) => component.method.toLowerCase() === "cash");
    const cashAmt = components.length
      ? components.filter((component) => component.method.toLowerCase() === "cash").reduce((sum, component) => sum + component.amount, 0)
      : Math.min(paidAmount, totalAmount);
    if (isCash && cashAmt > 0) {
      await conn.query(
        `INSERT INTO cash_in_hand (
          id, business_id, entry_date, entry_type, amount,
          party_id, party_name, reference_type, reference_no, description, provenance, created_at
        ) VALUES (?, ?, ?, 'in', ?, ?, ?, 'pos', ?, ?, 'transaction', NOW())
        ON DUPLICATE KEY UPDATE
          entry_date = VALUES(entry_date),
          amount = VALUES(amount),
          party_name = VALUES(party_name),
          reference_no = VALUES(reference_no)`,
        [
          transactionId, businessId, transactionDate, cashAmt,
          partyId || null, partyName, documentNumber,
          `POS Sale #${documentNumber}`
        ]
      );
    }

    // 9. Mark POS draft as finalized (keep record with finalized_transaction_id for audit & idempotency)
    await conn.query(
      `UPDATE pos_drafts
       SET is_finalized = 1, finalized_transaction_id = ?, updated_at = NOW(3)
       WHERE business_id = ? AND id = ?`,
      [transactionId, businessId, draftId]
    );

    // Commit all changes atomically!
    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "POS sale finalized and saved successfully in database.",
      data: {
        id: transactionId,
        invoiceNumber: documentNumber,
        documentNumber,
        transactionType: "pos",
        totalAmount,
        paidAmount,
        balanceAmount,
        paymentStatus,
        paymentMode,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[POS Finalize Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;
