/**
 * MySQL Database Backup & Restore API Router
 * 
 * Provides full server-side database backup export and restore:
 * - Exports all 22 normalized relational tables directly from MySQL.
 * - Imports and restores database snapshots atomically within an ACID transaction.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";
import { restoreUsvToDatabase } from "../services/backupRestoreService.js";

const router = Router();

export const BACKUP_TABLES = [
  "company_profiles",
  "company_profile_assets",
  "app_settings",
  "parties",
  "units",
  "unit_conversions",
  "inventory_items",
  "item_batches",
  "inventory_adjustments",
  "transactions",
  "transaction_items",
  "service_reminders",
  "service_reminder_history",
  "bank_accounts",
  "bank_transactions",
  "cash_in_hand",
  "cheques",
  "loan_accounts",
  "loan_repayments",
  "expense_categories",
  "expense_items",
  "purchase_job_works",
  "purchase_job_work_items",
  "balance_sheet_accounts",
  "online_store_settings",
  "online_store_orders",
  "online_store_order_items",
  "smart_ads",
  "audit_trails",
  "business_files",
  "tally_import_batches",
  "migration_logs",
  "business_growth_assets",
  "business_growth_records",
  "business_growth_record_fields",
];

/**
 * GET /api/backup/export
 * Dumps all tenant-scoped tables for the authenticated business only.
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
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'business_id'`,
          [table]
        );

        if (!(hasBiz[0]?.c > 0)) {
          // Never export global tables without business_id
          continue;
        }

        const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE business_id = ?`, [businessId]);
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

    const backupTableSet = new Set(BACKUP_TABLES);
    for (const key of Object.keys(payload.tables)) {
      if (!backupTableSet.has(key)) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: `Unsupported or disallowed table in backup: ${key}` });
      }
    }

    const tablesToRestore = BACKUP_TABLES.filter(
      (table) => Array.isArray(payload.tables[table]) && payload.tables[table].length > 0
    );

    const allowedColumnsByTable = new Map();
    for (const table of tablesToRestore) {
      const [colRows] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      );
      const colSet = new Set(colRows.map((c) => c.COLUMN_NAME));
      if (!colSet.has("business_id")) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: `Table '${table}' is not tenant-scoped and cannot be restored.` });
      }
      allowedColumnsByTable.set(table, colSet);
    }

    // Delete in reverse topological order to respect child -> parent relationships
    for (const table of [...tablesToRestore].reverse()) {
      await conn.query(`DELETE FROM \`${table}\` WHERE business_id = ?`, [businessId]);
    }

    let restoredStats = {};

    // Insert in forward topological order
    for (const table of tablesToRestore) {
      const rows = payload.tables[table];
      const allowedCols = allowedColumnsByTable.get(table);
      let insertedCount = 0;

      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        // Force authenticated business_id and filter strictly to schema-verified columns
        const scopedRow = { ...row, business_id: businessId };
        const validKeys = Object.keys(scopedRow).filter((k) => allowedCols.has(k));
        if (validKeys.length === 0) {
          throw Object.assign(new Error(`No valid schema columns found for table '${table}'.`), { status: 400 });
        }

        const escapedKeys = validKeys.map((k) => `\`${k}\``);
        const values = validKeys.map((k) => {
          const v = scopedRow[k];
          if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
            return Buffer.from(v.data);
          }
          return v;
        });
        const placeholders = escapedKeys.map(() => "?").join(",");

        await conn.query(
          `INSERT INTO \`${table}\` (${escapedKeys.join(",")}) VALUES (${placeholders})`,
          values
        );
        insertedCount += 1;
      }

      // Verify restored count matches inserted count
      const [countRows] = await conn.query(
        `SELECT COUNT(*) AS c FROM \`${table}\` WHERE business_id = ?`,
        [businessId]
      );
      const actualCount = Number(countRows[0]?.c || 0);
      if (actualCount !== insertedCount) {
        throw new Error(`Verification failed for '${table}': expected ${insertedCount} rows, found ${actualCount}.`);
      }

      restoredStats[table] = insertedCount;
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
 * POST /api/backup/restore-payload
 * Restores a native USV backup payload (.usvbackup) atomically into MySQL
 */
router.post("/restore-payload", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const payload = req.body || {};

    const result = await restoreUsvToDatabase(conn, businessId, payload);
    await conn.commit();
    return res.json(result);
  } catch (err) {
    await conn.rollback();
    console.error("[Backup Restore Payload Error]", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to restore backup payload to database.",
    });
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
       WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE = 'json'`
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

