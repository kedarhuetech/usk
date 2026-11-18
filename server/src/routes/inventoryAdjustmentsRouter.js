/**
 * Inventory Adjustments API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types)
 */

import { Router } from "express";
import { pool, businessIdFromRequest, toSqlDate } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/inventory-adjustments
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT a.*, COALESCE(NULLIF(a.item_name, 'Item'), i.name, a.item_name) AS resolved_item_name
       FROM inventory_adjustments a
       LEFT JOIN inventory_items i ON a.business_id = i.business_id AND a.item_id = i.id
       WHERE a.business_id = ? 
       ORDER BY a.adjustment_date DESC, a.created_at DESC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        itemName: r.resolved_item_name || r.item_name || "Item",
        adjustmentType: r.adjustment_type,
        quantity: parseFloat(r.quantity) || 0,
        unitPrice: parseFloat(r.unit_price) || 0,
        totalValue: parseFloat(r.total_value) || 0,
        reason: r.reason || "",
        adjustmentDate: r.adjustment_date,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/inventory-adjustments
 * Atomically records the adjustment and updates inventory item current_stock
 */
router.post("/", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const itemId = body.itemId || body.item_id;
    let itemName = (body.itemName || body.item_name || body.name || "").trim();

    if (!itemId) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Valid item ID is required." });
    }

    // Lookup actual item name from inventory_items if missing or placeholder "Item"
    if (!itemName || itemName.toLowerCase() === "item") {
      const [itemRows] = await conn.query(
        `SELECT name FROM inventory_items WHERE business_id = ? AND id = ?`,
        [businessId, itemId]
      );
      if (itemRows.length > 0 && itemRows[0].name) {
        itemName = itemRows[0].name.trim();
      }
    }
    if (!itemName) itemName = "Item";

    const adjustmentType = (body.adjustmentType || body.type || "add").toLowerCase();
    const quantity = parseFloat(body.quantity) || 0;
    const unitPrice = parseFloat(body.unitPrice ?? 0) || 0;
    const totalValue = parseFloat(body.totalValue ?? (quantity * unitPrice)) || 0;
    const reason = body.reason || null;
    const adjustmentDate = toSqlDate(body.adjustmentDate) || new Date().toISOString().slice(0, 10);

    if (quantity <= 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Positive quantity is required." });
    }

    // 1. Insert adjustment row
    await conn.query(
      `INSERT INTO inventory_adjustments (
        id, business_id, item_id, item_name, adjustment_type,
        quantity, unit_price, total_value, reason, adjustment_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        item_id = VALUES(item_id),
        item_name = VALUES(item_name),
        adjustment_type = VALUES(adjustment_type),
        quantity = VALUES(quantity),
        unit_price = VALUES(unit_price),
        total_value = VALUES(total_value),
        reason = VALUES(reason),
        adjustment_date = VALUES(adjustment_date)`,
      [id, businessId, itemId, itemName, adjustmentType, quantity, unitPrice, totalValue, reason, adjustmentDate]
    );

    // 2. Adjust inventory item current stock
    const stockDelta = adjustmentType === "add" ? quantity : -quantity;
    await conn.query(
      `UPDATE inventory_items
       SET current_stock = current_stock + ?
       WHERE business_id = ? AND id = ?`,
      [stockDelta, businessId, itemId]
    );

    await conn.commit();
    return res.json({ success: true, message: "Adjustment recorded and stock updated.", data: { id, stockDelta } });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;

