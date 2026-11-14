/**
 * Inventory Items API Router
 * 
 * System Design & Scalability:
 * - Lazy Loading & Paginated Slices: Loads items in compact pages (e.g. 50 items/page)
 *   so large product catalogs (50,000+ SKUs) load quickly without client-side lag.
 * - Search & Low Stock Filters: Fast indexed queries for low stock items (current_stock <= min_stock),
 *   categories, and barcode/item_code scanning.
 * - Compact Batches: Stores batch variations in native compact JSON.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/items
 * Retrieves paginated list of inventory items.
 * Query parameters:
 *  - page (number, default: 1)
 *  - limit (number, default: 50, max: 200) - Lazy loading limit
 *  - search (string) - Matches item name or item code / barcode
 *  - category (string) - Filters by item category
 *  - lowStockOnly (boolean: 'true'/'false') - Finds items needing re-order
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
      conditions.push("(name LIKE ? OR item_code LIKE ? OR hsn_code LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (category && category !== "All") {
      conditions.push("category = ?");
      params.push(category);
    }

    if (lowStockOnly) {
      conditions.push("current_stock <= min_stock AND min_stock > 0");
    }

    const whereClause = conditions.join(" AND ");

    // Query 1: Total count for lazy loading pagination metadata
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_items WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Query 2: Fetch paginated items slice
    const [rows] = await pool.query(
      `SELECT id, business_id, name, item_code, category, hsn_code, unit,
              sale_price, purchase_price, tax_rate, current_stock, min_stock,
              is_batch_tracked, batches, metadata, created_at, updated_at
       FROM inventory_items
       WHERE ${whereClause}
       ORDER BY name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: rows.map(mapItemRow),
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
 * Fetches single item by ID
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

    return res.json({ success: true, data: mapItemRow(rows[0]) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/items
 * Creates or updates an inventory item
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const name = (body.name || body.itemName || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Item name is required." });
    }

    const itemCode = body.itemCode || body.item_code || body.barcode || null;
    const category = body.category || "General";
    const hsnCode = body.hsnCode || body.hsn_code || body.hsn || null;
    const unit = body.unit || "PCS";
    const salePrice = parseFloat(body.salePrice ?? body.sale_price ?? body.price ?? 0) || 0;
    const purchasePrice = parseFloat(body.purchasePrice ?? body.purchase_price ?? 0) || 0;
    const taxRate = parseFloat(body.taxRate ?? body.tax_rate ?? body.gst ?? 0) || 0;
    const currentStock = parseFloat(body.currentStock ?? body.current_stock ?? body.openingStock ?? body.stock ?? 0) || 0;
    const minStock = parseFloat(body.minStock ?? body.min_stock ?? 0) || 0;
    const isBatchTracked = body.isBatchTracked || body.is_batch_tracked ? 1 : 0;
    const batches = JSON.stringify(body.batches || []);
    const metadata = JSON.stringify(body.metadata || {});

    // Perform MySQL UPSERT
    await pool.query(
      `INSERT INTO inventory_items (
        id, business_id, name, item_code, category, hsn_code, unit,
        sale_price, purchase_price, tax_rate, current_stock, min_stock,
        is_batch_tracked, batches, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        item_code = VALUES(item_code),
        category = VALUES(category),
        hsn_code = VALUES(hsn_code),
        unit = VALUES(unit),
        sale_price = VALUES(sale_price),
        purchase_price = VALUES(purchase_price),
        tax_rate = VALUES(tax_rate),
        current_stock = VALUES(current_stock),
        min_stock = VALUES(min_stock),
        is_batch_tracked = VALUES(is_batch_tracked),
        batches = VALUES(batches),
        metadata = VALUES(metadata),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, name, itemCode, category, hsnCode, unit,
        salePrice, purchasePrice, taxRate, currentStock, minStock,
        isBatchTracked, batches, metadata
      ]
    );

    return res.json({
      success: true,
      message: "Item saved successfully.",
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
    console.error("[Items POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/items/:id
 * Removes an inventory item
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const itemId = req.params.id;

    await pool.query(
      `DELETE FROM inventory_items WHERE business_id = ? AND id = ?`,
      [businessId, itemId]
    );

    return res.json({ success: true, message: "Item deleted successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

function mapItemRow(row) {
  let batches = [];
  let meta = {};
  try {
    batches = typeof row.batches === "string" ? JSON.parse(row.batches) : row.batches || [];
    meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {};
  } catch {}

  return {
    id: row.id,
    name: row.name,
    itemName: row.name,
    itemCode: row.item_code || "",
    category: row.category || "General",
    hsnCode: row.hsn_code || "",
    unit: row.unit || "PCS",
    salePrice: parseFloat(row.sale_price) || 0,
    price: parseFloat(row.sale_price) || 0,
    purchasePrice: parseFloat(row.purchase_price) || 0,
    taxRate: parseFloat(row.tax_rate) || 0,
    currentStock: parseFloat(row.current_stock) || 0,
    stock: parseFloat(row.current_stock) || 0,
    minStock: parseFloat(row.min_stock) || 0,
    isBatchTracked: Boolean(row.is_batch_tracked),
    batches,
    metadata: meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
