/**
 * MySQL Database Backup & Restore API Router
 * 
 * Provides full server-side database backup export and restore:
 * - Exports all 22 normalized relational tables directly from MySQL.
 * - Imports and restores database snapshots atomically within an ACID transaction.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

const BACKUP_TABLES = [
  "businesses", "company_profiles", "app_settings", "parties",
  "units", "inventory_items", "item_batches", "inventory_adjustments",
  "transactions", "transaction_items", "service_reminders", "service_reminder_history",
  "bank_accounts", "cash_in_hand", "cheques", "loan_accounts",
  "expense_categories", "online_store_settings", "online_store_orders",
  "online_store_order_items", "smart_ads", "audit_trails"
];

/**
 * GET /api/backup/export
 * Dumps all tables for the current business
 */
router.get("/export", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const dump = {
      format: "vyapaar-mysql-backup",
      version: 2,
      createdAt: new Date().toISOString(),
      businessId,
      tables: {},
      summary: {},
    };

    for (const table of BACKUP_TABLES) {
      try {
        const [hasBiz] = await pool.query(
          `SELECT COUNT(*) AS c FROM information_schema.COLUMNS 
           WHERE TABLE_SCHEMA = 'vyapaar' AND TABLE_NAME = ? AND COLUMN_NAME = 'business_id'`,
          [table]
        );

        let rows = [];
        if (hasBiz[0]?.c > 0) {
          const [result] = await pool.query(`SELECT * FROM \`${table}\` WHERE business_id = ?`, [businessId]);
          rows = result;
        } else {
          const [result] = await pool.query(`SELECT * FROM \`${table}\``);
          rows = result;
        }

        dump.tables[table] = rows;
        dump.summary[table] = rows.length;
      } catch (err) {
        dump.tables[table] = [];
        dump.summary[table] = 0;
      }
    }

    res.setHeader("Content-Disposition", `attachment; filename="vyapaar_db_backup_${Date.now()}.json"`);
    res.setHeader("Content-Type", "application/json");
    return res.json(dump);
  } catch (err) {
    console.error("[Backup Export Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/backup/restore
 * Restores database from a vyapaar-mysql-backup snapshot atomically
 */
router.post("/restore", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const payload = req.body || {};

    if (!payload.tables || typeof payload.tables !== "object") {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Invalid backup format. Missing tables object." });
    }

    let restoredStats = {};

    for (const table of BACKUP_TABLES) {
      const rows = payload.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      // Clean existing rows for this business
      try {
        await conn.query(`DELETE FROM \`${table}\` WHERE business_id = ?`, [businessId]);
      } catch {}

      for (const row of rows) {
        const keys = Object.keys(row).map((k) => `\`${k}\``);
        const values = Object.values(row);
        const placeholders = keys.map(() => "?").join(",");

        await conn.query(
          `INSERT INTO \`${table}\` (${keys.join(",")}) VALUES (${placeholders})`,
          values
        );
      }
      restoredStats[table] = rows.length;
    }

    await conn.commit();
    return res.json({
      success: true,
      message: "Database restored successfully from backup snapshot.",
      restored: restoredStats,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[Backup Restore Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/backup/verify
 * Validates database integrity and ensures 0 JSON columns across all 22 production tables
 */
router.get("/verify", async (_req, res) => {
  try {
    const [jsonCols] = await pool.query(
      `SELECT TABLE_NAME, COLUMN_NAME 
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = 'vyapaar' AND DATA_TYPE = 'json'`
    );

    const [tables] = await pool.query("SHOW TABLES");
    const existingTableNames = tables.map((t) => Object.values(t)[0]);

    const tableStatuses = {};
    for (const tbl of BACKUP_TABLES) {
      if (existingTableNames.includes(tbl)) {
        const [cnt] = await pool.query(`SELECT COUNT(*) AS c FROM \`${tbl}\``);
        tableStatuses[tbl] = { exists: true, rowCount: cnt[0]?.c || 0 };
      } else {
        tableStatuses[tbl] = { exists: false, rowCount: 0 };
      }
    }

    return res.json({
      success: true,
      zeroJsonEnforced: jsonCols.length === 0,
      jsonColumnsFound: jsonCols.length,
      tablesCount: existingTableNames.length,
      expectedTablesCount: BACKUP_TABLES.length,
      tableStatuses,
    });
  } catch (err) {
    console.error("[Backup Verify Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

