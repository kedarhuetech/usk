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
    const limitParam = req.query.limit;
    const limit = (limitParam === "all" || req.query.all === "true")
      ? 10000
      : Math.min(1000, Math.max(1, parseInt(limitParam, 10) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const category = (req.query.category || "").trim();
    const itemType = (req.query.type || req.query.item_type || "").trim();
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

    if (itemType && itemType !== "all") {
      conditions.push("item_type = ?");
      params.push(itemType);
    }

    if (req.query.isActive !== undefined || req.query.is_active !== undefined) {
      const activeVal = req.query.isActive !== undefined ? req.query.isActive : req.query.is_active;
      conditions.push("is_active = ?");
      params.push(activeVal === "true" || activeVal === "1" ? 1 : 0);
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
              is_serial_tracked, description, is_active, created_at, updated_at
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
      type: row.item_type || "product",
      itemType: row.item_type || "product",
      itemCode: row.item_code || "",
      barcode: row.barcode || row.item_code || "",
      category: row.category || "General",
      hsnCode: row.hsn_code || "",
      unit: row.unit || "PCS",
      type: row.item_type || "product",
      itemType: row.item_type || "product",
      isActive: row.is_active !== 0,
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
        barcode: row.barcode || row.item_code || "",
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
        isActive: row.is_active !== 0,
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
const saveItemHandler = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = req.params?.id || body.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const name = (body.name || body.itemName || "").trim();
    if (!name) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Item name is required." });
    }

    const itemCode = (body.itemCode || body.item_code || body.code || "").trim() || null;
    const barcode = (body.barcode || body.barCode || body.itemBarcode || itemCode || "").trim() || null;
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
    const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : (body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1);

    // 1. Upsert Item Header (Pure columns)
    await conn.query(
      `INSERT INTO inventory_items (
        id, business_id, name, item_code, barcode, category, hsn_code, unit,
        item_type, sale_price, purchase_price, tax_rate, cess_rate,
        opening_stock, current_stock, min_stock, is_batch_tracked,
        is_serial_tracked, description, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        is_active = VALUES(is_active),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, name, itemCode, barcode, category, hsnCode, unit,
        itemType, salePrice, purchasePrice, taxRate, cessRate,
        openingStock, currentStock, minStock, isBatchTracked,
        isSerialTracked, description, isActive
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
        itemName: name,
        itemCode,
        category,
        hsnCode,
        unit,
        type: itemType,
        itemType,
        isActive: Boolean(isActive),
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
};

router.post("/", saveItemHandler);
router.put("/:id", saveItemHandler);

/**
 * DELETE /api/items/:id
 * Removes an inventory item and all its related batch rows if unreferenced.
 * If historical transactions or adjustments reference the item, deletion is blocked
 * with a 409 Conflict status and an option to deactivate the item instead.
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const businessId = businessIdFromRequest(req);
    const itemId = req.params.id;

    // 1. Verify item exists and belongs to this business
    const [existing] = await conn.query(
      `SELECT id, name, is_active FROM inventory_items WHERE business_id = ? AND id = ?`,
      [businessId, itemId]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found in the current business context."
      });
    }

    const itemName = existing[0].name;

    // 2. Check for historical transaction and inventory references
    const [txRows] = await conn.query(
      `SELECT COUNT(*) AS count FROM transaction_items WHERE business_id = ? AND item_id = ?`,
      [businessId, itemId]
    );
    const txCount = txRows[0]?.count || 0;

    const [adjRows] = await conn.query(
      `SELECT COUNT(*) AS count FROM inventory_adjustments WHERE business_id = ? AND item_id = ?`,
      [businessId, itemId]
    );
    const adjCount = adjRows[0]?.count || 0;

    let jobWorkCount = 0;
    try {
      const [jwRows] = await conn.query(
        `SELECT COUNT(*) AS count FROM purchase_job_work_items WHERE business_id = ? AND item_id = ?`,
        [businessId, itemId]
      );
      jobWorkCount = jwRows[0]?.count || 0;
    } catch {}

    let storeOrderCount = 0;
    try {
      const [soRows] = await conn.query(
        `SELECT COUNT(*) AS count FROM online_store_order_items WHERE business_id = ? AND item_id = ?`,
        [businessId, itemId]
      );
      storeOrderCount = soRows[0]?.count || 0;
    } catch {}

    const totalReferences = txCount + adjCount + jobWorkCount + storeOrderCount;

    if (totalReferences > 0) {
      // Check if client requested deactivation instead of physical deletion
      if (req.query.deactivate === "true") {
        await conn.query(
          `UPDATE inventory_items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE business_id = ? AND id = ?`,
          [businessId, itemId]
        );
        return res.json({
          success: true,
          action: "deactivated",
          message: `Item "${itemName}" is referenced in historical records and has been deactivated instead of deleted.`
        });
      }

      return res.status(409).json({
        success: false,
        code: "ITEM_REFERENCED",
        canDeactivate: true,
        references: {
          transactions: txCount,
          adjustments: adjCount,
          jobWorks: jobWorkCount,
          storeOrders: storeOrderCount,
          total: totalReferences
        },
        message: `Cannot delete "${itemName}" because it is referenced in ${totalReferences} historical business record(s). Historical invoices and adjustments must be preserved. You can mark this item inactive instead.`
      });
    }

    // 3. No references exist: Proceed with physical deletion in a transaction
    await conn.beginTransaction();

    await conn.query(`DELETE FROM item_batches WHERE business_id = ? AND item_id = ?`, [businessId, itemId]);
    await conn.query(`DELETE FROM inventory_items WHERE business_id = ? AND id = ?`, [businessId, itemId]);

    await conn.commit();
    return res.json({
      success: true,
      action: "deleted",
      message: `Item "${itemName}" permanently deleted.`
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * PATCH /api/items/:id/deactivate
 * Marks an item as inactive
 */
router.patch("/:id/deactivate", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const itemId = req.params.id;
    const [result] = await pool.query(
      `UPDATE inventory_items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE business_id = ? AND id = ?`,
      [businessId, itemId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Item not found in current business context." });
    }
    return res.json({ success: true, message: "Item deactivated successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/items/:id/reactivate
 * Marks an item as active
 */
router.patch("/:id/reactivate", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const itemId = req.params.id;
    const [result] = await pool.query(
      `UPDATE inventory_items SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE business_id = ? AND id = ?`,
      [businessId, itemId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Item not found in current business context." });
    }
    return res.json({ success: true, message: "Item reactivated successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
