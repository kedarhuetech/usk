/**
 * Audit Trail API Router
 * 
 * Strict Relational Architecture with Throttling & Automated Pruning
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/audit-trail/summary
 * Returns overview statistics of the audit log storage
 */
router.get("/summary", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [stats] = await pool.query(
      `SELECT 
         COUNT(*) AS totalLogs,
         MIN(created_at) AS earliestLog,
         MAX(created_at) AS latestLog
       FROM audit_trails
       WHERE business_id = ?`,
      [businessId]
    );

    const [actionBreakdown] = await pool.query(
      `SELECT action_type AS actionType, COUNT(*) AS count
       FROM audit_trails
       WHERE business_id = ?
       GROUP BY action_type
       ORDER BY count DESC
       LIMIT 10`,
      [businessId]
    );

    return res.json({
      success: true,
      data: {
        totalLogs: stats[0]?.totalLogs || 0,
        earliestLog: stats[0]?.earliestLog || null,
        latestLog: stats[0]?.latestLog || null,
        topActions: actionBreakdown,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/audit-trail
 * Retrieves audit trail logs with optional pagination
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const limitParam = req.query.limit;
    const isAll = limitParam === "all" || req.query.all === "true";
    const limit = isAll
      ? 50000
      : Math.min(5000, Math.max(1, parseInt(limitParam, 10) || 100));

    let sql = `SELECT * FROM audit_trails WHERE business_id = ? ORDER BY created_at DESC`;
    const params = [businessId];

    if (!isAll) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const [rows] = await pool.query(sql, params);

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
 * Records an audit log with 15-second deduplication throttling
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
    const ipAddress = req.ip || req.connection?.remoteAddress || null;

    // 15-second throttling: if identical action was recorded within 15 seconds, update rather than insert duplicate
    const [recent] = await pool.query(
      `SELECT id FROM audit_trails 
       WHERE business_id = ? AND action_type = ? AND entity_type = ? 
         AND (entity_id = ? OR (entity_id IS NULL AND ? IS NULL))
         AND created_at >= NOW() - INTERVAL 15 SECOND
       ORDER BY created_at DESC LIMIT 1`,
      [businessId, actionType, entityType, entityId, entityId]
    );

    if (recent.length > 0) {
      await pool.query(
        `UPDATE audit_trails SET details = ?, created_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [details, recent[0].id]
      );
      return res.json({ success: true, message: "Audit log updated (throttled).", id: recent[0].id });
    }

    await pool.query(
      `INSERT INTO audit_trails (
        id, business_id, action_type, entity_type, entity_id, user_name, details, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, businessId, actionType, entityType, entityId, userName, details, ipAddress]
    );

    return res.json({ success: true, message: "Audit log recorded.", id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/audit-trail/purge and DELETE /api/audit-trail/purge
 * Prunes logs older than retention days and optionally compacts duplicate identical entries
 */
const handlePurge = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const days = Math.max(1, parseInt(req.query.days || req.body?.days || process.env.AUDIT_RETENTION_DAYS || "30", 10));
    const compactDuplicates = req.query.compactDuplicates === "true" || req.body?.compactDuplicates !== false;

    let prunedCount = 0;
    let compactedCount = 0;

    // 1. Delete logs older than retention period
    const [deleteResult] = await pool.query(
      `DELETE FROM audit_trails 
       WHERE business_id = ? AND created_at < NOW() - INTERVAL ? DAY`,
      [businessId, days]
    );
    prunedCount = deleteResult.affectedRows || 0;

    // 2. Compact runaway duplicate entries (e.g. rapid repetitive saves from older sessions)
    if (compactDuplicates) {
      // Find IDs of duplicate entries keeping only the latest per (business_id, action_type, entity_type, details, DATE(created_at))
      const [dups] = await pool.query(
        `SELECT a.id
         FROM audit_trails a
         INNER JOIN (
           SELECT business_id, action_type, entity_type, details, DATE(created_at) as log_date, MAX(created_at) as max_created
           FROM audit_trails
           WHERE business_id = ?
           GROUP BY business_id, action_type, entity_type, details, DATE(created_at)
           HAVING COUNT(*) > 1
         ) keep ON a.business_id = keep.business_id 
               AND a.action_type = keep.action_type 
               AND a.entity_type = keep.entity_type 
               AND a.details = keep.details 
               AND DATE(a.created_at) = keep.log_date 
               AND a.created_at < keep.max_created`,
        [businessId]
      );

      if (dups.length > 0) {
        const dupIds = dups.map((d) => d.id);
        // Batch delete duplicates in chunks of 5000
        for (let i = 0; i < dupIds.length; i += 5000) {
          const chunk = dupIds.slice(i, i + 5000);
          const [compactRes] = await pool.query(
            `DELETE FROM audit_trails WHERE id IN (?)`,
            [chunk]
          );
          compactedCount += compactRes.affectedRows || 0;
        }
      }
    }

    return res.json({
      success: true,
      message: `Audit trails maintenance complete: ${prunedCount} aged logs pruned (> ${days} days), ${compactedCount} duplicate logs compacted.`,
      prunedCount,
      compactedCount,
      totalRemoved: prunedCount + compactedCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post("/purge", handlePurge);
router.delete("/purge", handlePurge);

/**
 * DELETE /api/audit-trail
 * Clears all audit trails for current business
 */
router.delete("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [result] = await pool.query(`DELETE FROM audit_trails WHERE business_id = ?`, [businessId]);
    return res.json({
      success: true,
      message: `All audit logs cleared (${result.affectedRows || 0} removed).`,
      deletedCount: result.affectedRows || 0,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
