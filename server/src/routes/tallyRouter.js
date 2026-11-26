import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

let tallyTableReady = null;
async function ensureTallyBatchesTable() {
  if (!tallyTableReady) {
    tallyTableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS tally_import_batches (
        id VARCHAR(64) PRIMARY KEY,
        business_id VARCHAR(64) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_hash VARCHAR(64) NULL,
        tally_company_name VARCHAR(255) NULL,
        total_detected INT DEFAULT 0,
        imported_count INT DEFAULT 0,
        updated_count INT DEFAULT 0,
        skipped_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        unsupported_count INT DEFAULT 0,
        status VARCHAR(32) DEFAULT 'completed',
        summary_notes TEXT NULL,
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_tally_batches_biz (business_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`
    ).catch((err) => {
      tallyTableReady = null;
      throw err;
    });
  }
  return tallyTableReady;
}

/**
 * GET /api/utilities/tally/batches
 * Lists recent Tally import audit batches for the active business.
 */
router.get("/batches", async (req, res) => {
  try {
    await ensureTallyBatchesTable();
    const businessId = businessIdFromRequest(req);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [rows] = await pool.query(
      `SELECT id, business_id, file_name, file_hash, tally_company_name,
              total_detected, imported_count, updated_count, skipped_count,
              failed_count, unsupported_count, status, summary_notes, created_at
       FROM tally_import_batches
       WHERE business_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [businessId, limit]
    );
    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        businessId: r.business_id,
        fileName: r.file_name,
        fileHash: r.file_hash || "",
        tallyCompanyName: r.tally_company_name || "",
        totalDetected: Number(r.total_detected || 0),
        importedCount: Number(r.imported_count || 0),
        updatedCount: Number(r.updated_count || 0),
        skippedCount: Number(r.skipped_count || 0),
        failedCount: Number(r.failed_count || 0),
        unsupportedCount: Number(r.unsupported_count || 0),
        status: r.status || "completed",
        summaryNotes: r.summary_notes || "",
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Failed to load Tally import history." });
  }
});

/**
 * GET /api/utilities/tally/batches/check-hash?hash=...
 * Checks if an XML file with the same SHA-256 hash was already imported.
 */
router.get("/batches/check-hash", async (req, res) => {
  try {
    await ensureTallyBatchesTable();
    const businessId = businessIdFromRequest(req);
    const hash = String(req.query.hash || "").trim();
    if (!hash) {
      return res.json({ success: true, alreadyImported: false, match: null });
    }
    const [rows] = await pool.query(
      `SELECT id, file_name, imported_count, updated_count, created_at
       FROM tally_import_batches
       WHERE business_id = ? AND file_hash = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [businessId, hash]
    );
    const match = rows[0] || null;
    return res.json({
      success: true,
      alreadyImported: Boolean(match),
      match: match ? {
        id: match.id,
        fileName: match.file_name,
        importedCount: Number(match.imported_count || 0),
        updatedCount: Number(match.updated_count || 0),
        createdAt: match.created_at,
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Failed to check file hash." });
  }
});

/**
 * POST /api/utilities/tally/batches
 * Records a Tally import batch audit summary in MySQL.
 */
router.post("/batches", async (req, res) => {
  try {
    await ensureTallyBatchesTable();
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};
    const id = String(body.id || `tally_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const fileName = String(body.fileName || "tally-export.xml").trim().slice(0, 255);
    const fileHash = body.fileHash ? String(body.fileHash).trim().slice(0, 64) : null;
    const tallyCompanyName = body.tallyCompanyName ? String(body.tallyCompanyName).trim().slice(0, 255) : null;
    const totalDetected = Math.max(0, parseInt(body.totalDetected, 10) || 0);
    const importedCount = Math.max(0, parseInt(body.importedCount, 10) || 0);
    const updatedCount = Math.max(0, parseInt(body.updatedCount, 10) || 0);
    const skippedCount = Math.max(0, parseInt(body.skippedCount, 10) || 0);
    const failedCount = Math.max(0, parseInt(body.failedCount, 10) || 0);
    const unsupportedCount = Math.max(0, parseInt(body.unsupportedCount, 10) || 0);
    const status = String(body.status || (failedCount > 0 ? "partial" : "completed")).slice(0, 32);
    const summaryNotes = body.summaryNotes ? String(body.summaryNotes).slice(0, 2000) : null;

    await pool.query(
      `INSERT INTO tally_import_batches (
        id, business_id, file_name, file_hash, tally_company_name,
        total_detected, imported_count, updated_count, skipped_count,
        failed_count, unsupported_count, status, summary_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, businessId, fileName, fileHash, tallyCompanyName,
        totalDetected, importedCount, updatedCount, skippedCount,
        failedCount, unsupportedCount, status, summaryNotes,
      ]
    );

    return res.json({
      success: true,
      data: {
        id,
        businessId,
        fileName,
        fileHash,
        tallyCompanyName,
        totalDetected,
        importedCount,
        updatedCount,
        skippedCount,
        failedCount,
        unsupportedCount,
        status,
        summaryNotes,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Failed to record Tally import batch." });
  }
});

export default router;
