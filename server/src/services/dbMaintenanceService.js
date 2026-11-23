/**
 * Database Routine & Maintenance Service
 *
 * Automated maintenance engine providing:
 * 1. Audit trail retention pruning (> 30 days) and spam log compaction.
 * 2. Media & Image zero-BLOB enforcement (ensuring images are in storage driver and BLOBs in MySQL are NULL).
 * 3. Soft-deleted file metadata and physical file purging.
 * 4. Automated table defragmentation and space reclamation (OPTIMIZE TABLE).
 * 5. Space reclamation metrics (before and after table storage sizes).
 */

import { pool } from "../db/mysql.js";
import { DEFAULT_BUSINESS_ID } from "../config/storageConfig.js";
import { storageService } from "./storage/storageService.js";
import {
  migrateBusinessGrowthAssets,
  zeroVerifiedCompanyProfileBlobs,
} from "./storage/businessGrowthAssetMigration.js";

/**
 * Gets storage size breakdown for the database tables.
 */
export async function getDatabaseStorageSizes(dbName) {
  const [dbRes] = await pool.query("SELECT DATABASE() as db");
  const activeDb = dbName || process.env.DB_NAME || dbRes[0]?.db || "vyapaar";

  const [rows] = await pool.query(
    `SELECT 
       table_name AS tableName,
       table_rows AS approxRows,
       ROUND(data_length / 1024, 2) AS dataKb,
       ROUND(index_length / 1024, 2) AS indexKb,
       ROUND((data_length + index_length) / 1024, 2) AS totalKb,
       ROUND((data_length + index_length) / (1024 * 1024), 4) AS totalMb
     FROM information_schema.TABLES
     WHERE table_schema = ?
     ORDER BY (data_length + index_length) DESC`,
    [activeDb]
  );

  const [summary] = await pool.query(
    `SELECT 
       COUNT(*) AS tableCount,
       ROUND(SUM(data_length) / 1024, 2) AS totalDataKb,
       ROUND(SUM(index_length) / 1024, 2) AS totalIndexKb,
       ROUND(SUM(data_length + index_length) / 1024, 2) AS totalKb,
       ROUND(SUM(data_length + index_length) / (1024 * 1024), 3) AS totalMb
     FROM information_schema.TABLES
     WHERE table_schema = ?`,
    [activeDb]
  );

  return {
    summary: summary[0] || {},
    tables: rows || [],
  };
}

/**
 * Prunes audit trail records older than retention period and compacts identical duplicates.
 */
export async function pruneAuditTrails({
  businessId = DEFAULT_BUSINESS_ID,
  retentionDays = 30,
  compactDuplicates = true,
  dryRun = false,
} = {}) {
  const result = {
    agedRowsPruned: 0,
    duplicateRowsCompacted: 0,
    totalRemoved: 0,
  };

  // 1. Delete aged logs older than retentionDays
  if (retentionDays > 0) {
    if (dryRun) {
      const [cnt] = await pool.query(
        `SELECT COUNT(*) AS c FROM audit_trails 
         WHERE (business_id = ? OR ? = 'all') AND created_at < NOW() - INTERVAL ? DAY`,
        [businessId, businessId, retentionDays]
      );
      result.agedRowsPruned = cnt[0]?.c || 0;
    } else {
      const [delRes] = await pool.query(
        `DELETE FROM audit_trails 
         WHERE (business_id = ? OR ? = 'all') AND created_at < NOW() - INTERVAL ? DAY`,
        [businessId, businessId, retentionDays]
      );
      result.agedRowsPruned = delRes.affectedRows || 0;
    }
  }

  // 2. Compact runaway duplicate entries
  if (compactDuplicates) {
    const [dups] = await pool.query(
      `SELECT a.id
       FROM audit_trails a
       INNER JOIN (
         SELECT business_id, action_type, entity_type, details, DATE(created_at) as log_date, MAX(created_at) as max_created
         FROM audit_trails
         WHERE (business_id = ? OR ? = 'all')
         GROUP BY business_id, action_type, entity_type, details, DATE(created_at)
         HAVING COUNT(*) > 1
       ) keep ON a.business_id = keep.business_id 
             AND a.action_type = keep.action_type 
             AND a.entity_type = keep.entity_type 
             AND a.details = keep.details 
             AND DATE(a.created_at) = keep.log_date 
             AND a.created_at < keep.max_created`,
      [businessId, businessId]
    );

    if (dryRun) {
      result.duplicateRowsCompacted = dups.length;
    } else if (dups.length > 0) {
      const dupIds = dups.map((d) => d.id);
      for (let i = 0; i < dupIds.length; i += 5000) {
        const chunk = dupIds.slice(i, i + 5000);
        const [compactRes] = await pool.query(
          `DELETE FROM audit_trails WHERE id IN (?)`,
          [chunk]
        );
        result.duplicateRowsCompacted += compactRes.affectedRows || 0;
      }
    }
  }

  result.totalRemoved = result.agedRowsPruned + result.duplicateRowsCompacted;
  return result;
}

/**
 * Cleans up soft-deleted files older than purgeDays.
 */
export async function purgeSoftDeletedFiles({
  businessId = DEFAULT_BUSINESS_ID,
  purgeDays = 30,
  dryRun = false,
} = {}) {
  const [rows] = await pool.query(
    `SELECT id, business_id, storage_key 
     FROM business_files 
     WHERE (business_id = ? OR ? = 'all') 
       AND is_deleted = 1 
       AND updated_at < NOW() - INTERVAL ? DAY`,
    [businessId, businessId, purgeDays]
  );

  let deletedCount = 0;
  for (const row of rows) {
    if (!dryRun) {
      try {
        if (row.storage_key) {
          await storageService.deleteFile(row.storage_key);
        }
        await pool.query(`DELETE FROM business_files WHERE id = ?`, [row.id]);
        deletedCount++;
      } catch (err) {
        console.warn(`[Maintenance] Could not purge deleted file ${row.id}:`, err.message);
      }
    } else {
      deletedCount++;
    }
  }

  return { purgedFiles: deletedCount };
}

/**
 * Runs OPTIMIZE TABLE on target tables to defragment and reclaim disk space.
 */
export async function optimizeTargetTables(tables = [
  "audit_trails",
  "business_growth_assets",
  "company_profile_assets",
  "business_files",
]) {
  const results = {};
  for (const table of tables) {
    try {
      const [res] = await pool.query(`OPTIMIZE TABLE \`${table}\``);
      results[table] = res[0]?.Msg_text || "OK";
    } catch (err) {
      results[table] = `Error: ${err.message}`;
    }
  }
  return results;
}

/**
 * Executes full database routine maintenance.
 */
export async function runDatabaseMaintenance({
  businessId = "all",
  retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || "30", 10),
  compactDuplicates = true,
  optimize = true,
  dryRun = false,
} = {}) {
  const startTime = Date.now();
  const [dbRes] = await pool.query("SELECT DATABASE() as db");
  const dbName = process.env.DB_NAME || dbRes[0]?.db || "vyapaar";

  // Capture metrics before
  const beforeSizes = await getDatabaseStorageSizes(dbName);

  // 1. Audit trail pruning
  const auditReport = await pruneAuditTrails({
    businessId,
    retentionDays,
    compactDuplicates,
    dryRun,
  });

  // 2. Media zero-BLOB migration
  let assetReport = { businessGrowth: null, companyProfile: null };
  if (!dryRun) {
    try {
      assetReport.businessGrowth = await migrateBusinessGrowthAssets({ businessId: DEFAULT_BUSINESS_ID });
      assetReport.companyProfile = await zeroVerifiedCompanyProfileBlobs({ businessId: DEFAULT_BUSINESS_ID });
    } catch (assetErr) {
      console.warn("[Maintenance] Asset zero-BLOB warning:", assetErr.message);
    }
  }

  // 3. Purge soft-deleted files
  const filePurgeReport = await purgeSoftDeletedFiles({
    businessId,
    purgeDays: retentionDays,
    dryRun,
  });

  // 4. Optimize tables to reclaim space
  let tableOptimization = {};
  if (optimize && !dryRun) {
    tableOptimization = await optimizeTargetTables();
  }

  // Capture metrics after
  const afterSizes = await getDatabaseStorageSizes(dbName);

  const reclaimedKb = Math.max(
    0,
    parseFloat(beforeSizes.summary.totalKb || 0) - parseFloat(afterSizes.summary.totalKb || 0)
  ).toFixed(2);

  const reclaimedMb = (parseFloat(reclaimedKb) / 1024).toFixed(3);

  const summary = {
    success: true,
    dryRun,
    executedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    auditTrails: auditReport,
    assetBlobs: assetReport,
    filesPurged: filePurgeReport,
    tableOptimization,
    storage: {
      beforeTotalKb: beforeSizes.summary.totalKb,
      beforeTotalMb: beforeSizes.summary.totalMb,
      afterTotalKb: afterSizes.summary.totalKb,
      afterTotalMb: afterSizes.summary.totalMb,
      reclaimedKb,
      reclaimedMb,
    },
  };

  // Record maintenance execution in migration_logs
  if (!dryRun) {
    try {
      const logId = `maint_${Date.now()}`;
      await pool.query(
        `INSERT INTO migration_logs (id, batch_id, business_id, entity_type, source_id, target_table, target_id, action, details)
         VALUES (?, ?, ?, 'DATABASE_MAINTENANCE', 'system', 'database', ?, 'inserted', ?)`,
        [logId, logId, DEFAULT_BUSINESS_ID, dbName, JSON.stringify({
          auditRemoved: auditReport.totalRemoved,
          reclaimedKb,
          durationMs: summary.durationMs,
        })]
      );
    } catch {}
  }

  return summary;
}

/**
 * Gets current maintenance status and health diagnostics.
 */
export async function getDatabaseMaintenanceStatus() {
  const [dbRes] = await pool.query("SELECT DATABASE() as db");
  const dbName = process.env.DB_NAME || dbRes[0]?.db || "vyapaar";
  const sizes = await getDatabaseStorageSizes(dbName);

  const [lastMaint] = await pool.query(
    `SELECT created_at, details FROM migration_logs 
     WHERE entity_type = 'DATABASE_MAINTENANCE' 
     ORDER BY created_at DESC LIMIT 1`
  );

  const [blobCounts] = await pool.query(
    `SELECT 
       (SELECT COUNT(*) FROM business_growth_assets WHERE data IS NOT NULL AND LENGTH(data) > 0) AS bgaBlobs,
       (SELECT COUNT(*) FROM company_profile_assets WHERE data IS NOT NULL AND LENGTH(data) > 0) AS cpaBlobs,
       (SELECT COUNT(*) FROM audit_trails) AS auditCount`
  );

  return {
    success: true,
    database: dbName,
    storageSummary: sizes.summary,
    topTables: sizes.tables.slice(0, 5),
    diagnostics: {
      auditRowCount: blobCounts[0]?.auditCount || 0,
      activeBlobRecords: (blobCounts[0]?.bgaBlobs || 0) + (blobCounts[0]?.cpaBlobs || 0),
      lastMaintenance: lastMaint[0]?.created_at || null,
      lastMaintenanceDetails: lastMaint[0]?.details ? JSON.parse(lastMaint[0].details) : null,
    },
  };
}
