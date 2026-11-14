/**
 * Audit Trail API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types)
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/audit-trail
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);

    const [rows] = await pool.query(
      `SELECT * FROM audit_trails WHERE business_id = ? ORDER BY created_at DESC LIMIT ?`,
      [businessId, limit]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        actionType: r.action_type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        userName: r.user_name,
        details: r.details,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/audit-trail
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const actionType = body.actionType || body.action || "UPDATE";
    const entityType = body.entityType || body.entity || "SYSTEM";
    const entityId = body.entityId || null;
    const userName = body.userName || "Admin";
    const details = typeof body.details === "object" ? JSON.stringify(body.details) : (body.details || "");
    const ipAddress = req.ip || req.connection.remoteAddress || null;

    await pool.query(
      `INSERT INTO audit_trails (
        id, business_id, action_type, entity_type, entity_id, user_name, details, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, businessId, actionType, entityType, entityId, userName, details, ipAddress]
    );

    return res.json({ success: true, message: "Audit log recorded." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
