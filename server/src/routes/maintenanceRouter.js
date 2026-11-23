/**
 * Database Maintenance API Router
 *
 * Endpoints for running database routines, monitoring table sizes,
 * and reclaiming MySQL disk space.
 */

import { Router } from "express";
import {
  runDatabaseMaintenance,
  getDatabaseMaintenanceStatus,
  pruneAuditTrails,
  optimizeTargetTables,
} from "../services/dbMaintenanceService.js";
import { businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/maintenance/status
 * Returns storage size breakdown, audit trail counts, and last maintenance timestamp
 */
router.get("/status", async (_req, res) => {
  try {
    const status = await getDatabaseMaintenanceStatus();
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/maintenance/run
 * Executes full database routine maintenance
 */
router.post("/run", async (req, res) => {
  try {
    const businessId = req.query.businessId || req.body?.businessId || businessIdFromRequest(req);
    const retentionDays = parseInt(req.query.retentionDays || req.body?.retentionDays || process.env.AUDIT_RETENTION_DAYS || "30", 10);
    const compactDuplicates = req.query.compactDuplicates !== "false" && req.body?.compactDuplicates !== false;
    const optimize = req.query.optimize !== "false" && req.body?.optimize !== false;
    const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;

    const report = await runDatabaseMaintenance({
      businessId,
      retentionDays,
      compactDuplicates,
      optimize,
      dryRun,
    });

    return res.json(report);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/maintenance/optimize
 * Runs OPTIMIZE TABLE on fragmentation-prone tables
 */
router.post("/optimize", async (_req, res) => {
  try {
    const results = await optimizeTargetTables();
    return res.json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
