/**
 * Units API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types)
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/units
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM units WHERE business_id = ? ORDER BY name ASC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        shortName: r.short_name,
        precisionDec: r.precision_dec,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/units
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `unit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const name = (body.name || "").trim();
    const shortName = (body.shortName || body.short_name || name).trim();
    const precisionDec = parseInt(body.precisionDec ?? body.precision ?? 0, 10) || 0;

    if (!name) {
      return res.status(400).json({ success: false, message: "Unit name is required." });
    }

    await pool.query(
      `INSERT INTO units (id, business_id, name, short_name, precision_dec)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         short_name = VALUES(short_name),
         precision_dec = VALUES(precision_dec),
         updated_at = CURRENT_TIMESTAMP`,
      [id, businessId, name, shortName, precisionDec]
    );

    return res.json({ success: true, message: "Unit saved.", data: { id, name, shortName } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/units/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.query(`DELETE FROM units WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    return res.json({ success: true, message: "Unit deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== UNIT CONVERSIONS ====================

/**
 * GET /api/units/conversions
 */
router.get("/conversions", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const unit = (req.query.unit || "").trim();

    let query = `SELECT * FROM unit_conversions WHERE business_id = ?`;
    const params = [businessId];

    if (unit) {
      query += ` AND unit = ?`;
      params.push(unit);
    }
    query += ` ORDER BY created_at DESC`;

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        unit: r.unit,
        toUnit: r.to_unit,
        factor: parseFloat(r.factor) || 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/units/conversions
 */
router.post("/conversions", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `uconv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const unit = String(body.unit || "").trim().toUpperCase();
    const toUnit = String(body.toUnit || body.to_unit || "").trim().toUpperCase();
    const factor = parseFloat(body.factor) || 1;

    if (!unit || !toUnit) {
      return res.status(400).json({ success: false, message: "Both base unit and target conversion unit are required." });
    }

    await pool.query(
      `INSERT INTO unit_conversions (id, business_id, unit, to_unit, factor)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         factor = VALUES(factor),
         updated_at = CURRENT_TIMESTAMP`,
      [id, businessId, unit, toUnit, factor]
    );

    return res.json({
      success: true,
      message: "Unit conversion saved.",
      data: { id, unit, toUnit, factor },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/units/conversions/:id
 */
router.delete("/conversions/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.query(`DELETE FROM unit_conversions WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    return res.json({ success: true, message: "Unit conversion deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

