/**
 * Inventory Items API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Items Master: Stored in inventory_items with pure SQL columns (DECIMAL, VARCHAR, INT, TEXT).
 * - Batches: Normalized in the item_batches child table (one row per batch) with foreign indexing.
 * - Lazy Loading: Paginated SQL queries (LIMIT/OFFSET) with indexed COUNT(*) for high scalability.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/items
 * Retrieves paginated list of inventory items with normalized batches.
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const category = (req.query.category || "").trim();
    const lowStockOnly = req.query.lowStockOnly === "true";

    const conditions = ["business_id = ?"];
    const params = [businessId];

    if (search) {
      conditions.push("(name LIKE ? OR item_code LIKE ? OR barcode LIKE ? OR hsn_code LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (category && category !== "All") {
      conditions.push("category = ?");
      params.push(category);
    }

    if (lowStockOnly) {
      conditions.push("current_stock <= min_stock AND min_stock > 0");
    }

    const whereClause = conditions.join(" AND ");

    // Query 1: Total items count for pagination
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_items WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Query 2: Fetch paginated items slice
    const [rows] = await pool.query(
      `SELECT id, business_id, name, item_code, barcode, category, hsn_code, unit,
              item_type, sale_price, purchase_price, tax_rate, cess_rate,
              opening_stock, current_stock, min_stock, is_batch_tracked,
              is_serial_tracked, description, created_at, updated_at
       FROM inventory_items
       WHERE ${whereClause}
       ORDER BY name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Query 3: Fetch batches for these items from normalized item_batches table
    const itemIds = rows.map((r) => r.id);
    let batchesMap = new Map();
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => "?").join(",");
      const [batchRows] = await pool.query(
        `SELECT id, item_id, batch_no, mfg_date, exp_date, opening_qty,
                current_qty, sale_price, purchase_price, mrp
         FROM item_batches
         WHERE business_id = ? AND item_id IN (${placeholders})
         ORDER BY exp_date ASC, batch_no ASC`,
        [businessId, ...itemIds]
      );

      for (const b of batchRows) {
        if (!batchesMap.has(b.item_id)) {
          batchesMap.set(b.item_id, []);
        }
        batchesMap.get(b.item_id).push({
          id: b.id,
          batchNo: b.batch_no,
          mfgDate: b.mfg_date,
          expDate: b.exp_date,
          openingQty: parseFloat(b.opening_qty) || 0,
          currentQty: parseFloat(b.current_qty) || 0,
          salePrice: parseFloat(b.sale_price) || 0,
          purchasePrice: parseFloat(b.purchase_price) || 0,
          mrp: parseFloat(b.mrp) || 0,
        });
      }
    }

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      itemName: row.name,
      itemCode: row.item_code || "",
      barcode: row.barcode || "",
      category: row.category || "General",
      hsnCode: row.hsn_code || "",
      unit: row.unit || "PCS",
      itemType: row.item_type || "product",
      salePrice: parseFloat(row.sale_price) || 0,
      price: parseFloat(row.sale_price) || 0,
      purchasePrice: parseFloat(row.purchase_price) || 0,
      taxRate: parseFloat(row.tax_rate) || 0,
      cessRate: parseFloat(row.cess_rate) || 0,
      openingStock: parseFloat(row.opening_stock) || 0,
      currentStock: parseFloat(row.current_stock) || 0,
      stock: parseFloat(row.current_stock) || 0,
      minStock: parseFloat(row.min_stock) || 0,
      isBatchTracked: Boolean(row.is_batch_tracked),
      isSerialTracked: Boolean(row.is_serial_tracked),
      description: row.description || "",
      batches: batchesMap.get(row.id) || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    console.error("[Items GET Error]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to fetch items." });
  }
});

/**
 * GET /api/items/:id
 * Fetches single item by ID with its normalized batch rows
 */
router.get("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const itemId = req.params.id;

    const [rows] = await pool.query(
      `SELECT * FROM inventory_items WHERE business_id = ? AND id = ? LIMIT 1`,
      [businessId, itemId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Item not found." });
    }

    const row = rows[0];

    // Fetch batches from normalized child table
    const [batchRows] = await pool.query(
      `SELECT id, item_id, batch_no, mfg_date, exp_date, opening_qty,
              current_qty, sale_price, purchase_price, mrp
       FROM item_batches
       WHERE business_id = ? AND item_id = ?
       ORDER BY exp_date ASC`,
      [businessId, itemId]
    );

    const batches = batchRows.map((b) => ({
      id: b.id,
      batchNo: b.batch_no,
      mfgDate: b.mfg_date,
      expDate: b.exp_date,
      openingQty: parseFloat(b.opening_qty) || 0,
      currentQty: parseFloat(b.current_qty) || 0,
      salePrice: parseFloat(b.sale_price) || 0,
      purchasePrice: parseFloat(b.purchase_price) || 0,
      mrp: parseFloat(b.mrp) || 0,
    }));

    return res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        itemName: row.name,
        itemCode: row.item_code || "",
        barcode: row.barcode || "",
        category: row.category || "General",
        hsnCode: row.hsn_code || "",
        unit: row.unit || "PCS",
        itemType: row.item_type || "product",
        salePrice: parseFloat(row.sale_price) || 0,
        price: parseFloat(row.sale_price) || 0,
        purchasePrice: parseFloat(row.purchase_price) || 0,
        taxRate: parseFloat(row.tax_rate) || 0,
        cessRate: parseFloat(row.cess_rate) || 0,
        openingStock: parseFloat(row.opening_stock) || 0,
        currentStock: parseFloat(row.current_stock) || 0,
        stock: parseFloat(row.current_stock) || 0,
        minStock: parseFloat(row.min_stock) || 0,
        isBatchTracked: Boolean(row.is_batch_tracked),
        isSerialTracked: Boolean(row.is_serial_tracked),
        description: row.description || "",
        batches,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/items
 * Atomically saves an item and its batch rows in pure SQL columns
 */
router.post("/", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const name = (body.name || body.itemName || "").trim();
    if (!name) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Item name is required." });
    }

    const itemCode = body.itemCode || body.item_code || null;
    const barcode = body.barcode || null;
    const category = body.category || "General";
    const hsnCode = body.hsnCode || body.hsn_code || body.hsn || null;
    const unit = body.unit || "PCS";
    const itemType = body.itemType || body.type || "product";
    const salePrice = parseFloat(body.salePrice ?? body.sale_price ?? body.price ?? 0) || 0;
    const purchasePrice = parseFloat(body.purchasePrice ?? body.purchase_price ?? 0) || 0;
    const taxRate = parseFloat(body.taxRate ?? body.tax_rate ?? body.gst ?? 0) || 0;
    const cessRate = parseFloat(body.cessRate ?? body.cess_rate ?? 0) || 0;
    const openingStock = parseFloat(body.openingStock ?? body.opening_stock ?? 0) || 0;
    const currentStock = parseFloat(body.currentStock ?? body.current_stock ?? body.stock ?? openingStock) || 0;
    const minStock = parseFloat(body.minStock ?? body.min_stock ?? 0) || 0;
    const isBatchTracked = body.isBatchTracked || body.is_batch_tracked ? 1 : 0;
    const isSerialTracked = body.isSerialTracked || body.is_serial_tracked ? 1 : 0;
    const description = body.description || null;

    // 1. Upsert Item Header (Pure columns)
    await conn.query(
      `INSERT INTO inventory_items (
        id, business_id, name, item_code, barcode, category, hsn_code, unit,
        item_type, sale_price, purchase_price, tax_rate, cess_rate,
        opening_stock, current_stock, min_stock, is_batch_tracked,
        is_serial_tracked, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        item_code = VALUES(item_code),
        barcode = VALUES(barcode),
        category = VALUES(category),
        hsn_code = VALUES(hsn_code),
        unit = VALUES(unit),
        item_type = VALUES(item_type),
        sale_price = VALUES(sale_price),
        purchase_price = VALUES(purchase_price),
        tax_rate = VALUES(tax_rate),
        cess_rate = VALUES(cess_rate),
        current_stock = VALUES(current_stock),
        min_stock = VALUES(min_stock),
        is_batch_tracked = VALUES(is_batch_tracked),
        is_serial_tracked = VALUES(is_serial_tracked),
        description = VALUES(description),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, name, itemCode, barcode, category, hsnCode, unit,
        itemType, salePrice, purchasePrice, taxRate, cessRate,
        openingStock, currentStock, minStock, isBatchTracked,
        isSerialTracked, description
      ]
    );

    // 2. Normalize and insert batches into item_batches (pure rows & columns)
    if (Array.isArray(body.batches) && body.batches.length > 0) {
      // Clear existing batches for this item
      await conn.query(`DELETE FROM item_batches WHERE business_id = ? AND item_id = ?`, [businessId, id]);

      for (const batch of body.batches) {
        const batchNo = String(batch.batchNo || batch.batch_no || "").trim();
        if (!batchNo) continue;

        const batchId = batch.id || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const mfgDate = batch.mfgDate || batch.mfg_date || null;
        const expDate = batch.expDate || batch.exp_date || null;
        const openingQty = parseFloat(batch.openingQty ?? batch.opening_qty ?? batch.quantity ?? 0) || 0;
        const currentQty = parseFloat(batch.currentQty ?? batch.current_qty ?? openingQty) || 0;
        const bSalePrice = parseFloat(batch.salePrice ?? batch.sale_price ?? salePrice) || 0;
        const bPurchasePrice = parseFloat(batch.purchasePrice ?? batch.purchase_price ?? purchasePrice) || 0;
        const mrp = parseFloat(batch.mrp ?? 0) || 0;

        await conn.query(
          `INSERT INTO item_batches (
            id, item_id, business_id, batch_no, mfg_date, exp_date,
            opening_qty, current_qty, sale_price, purchase_price, mrp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            batchId, id, businessId, batchNo, mfgDate, expDate,
            openingQty, currentQty, bSalePrice, bPurchasePrice, mrp
          ]
        );
      }
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Item saved successfully in pure relational rows and columns.",
      data: {
        id,
        name,
        itemCode,
        category,
        hsnCode,
        unit,
        salePrice,
        purchasePrice,
        taxRate,
        currentStock,
        minStock,
        isBatchTracked: Boolean(isBatchTracked),
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[Items POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/items/:id
 * Removes an inventory item and all its related batch rows
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const itemId = req.params.id;

    await conn.query(`DELETE FROM item_batches WHERE business_id = ? AND item_id = ?`, [businessId, itemId]);
    await conn.query(`DELETE FROM inventory_items WHERE business_id = ? AND id = ?`, [businessId, itemId]);

    await conn.commit();
    return res.json({ success: true, message: "Item deleted successfully." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;
