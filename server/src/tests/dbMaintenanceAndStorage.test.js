import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db/mysql.js";
import {
  runDatabaseMaintenance,
  getDatabaseMaintenanceStatus,
  pruneAuditTrails,
  getDatabaseStorageSizes,
} from "../services/dbMaintenanceService.js";
import {
  migrateBusinessGrowthAssets,
  zeroVerifiedCompanyProfileBlobs,
} from "../services/storage/businessGrowthAssetMigration.js";

test("Database Maintenance & Storage Suite", async (t) => {
  await t.test("1. Zero BLOBs in MySQL: business_growth_assets and company_profile_assets have null data", async () => {
    // Run migration/zeroing routines
    await migrateBusinessGrowthAssets({ businessId: "demo-business" });
    await zeroVerifiedCompanyProfileBlobs({ businessId: "demo-business" });

    const [bga] = await pool.query("SELECT COUNT(*) AS c FROM business_growth_assets WHERE data IS NOT NULL AND LENGTH(data) > 0");
    const [cpa] = await pool.query("SELECT COUNT(*) AS c FROM company_profile_assets WHERE data IS NOT NULL AND LENGTH(data) > 0");

    assert.equal(bga[0].c, 0, "All business_growth_assets must have NULL data in MySQL");
    assert.equal(cpa[0].c, 0, "All company_profile_assets must have NULL data in MySQL");
  });

  await t.test("2. getDatabaseStorageSizes reports valid table breakdown and summary", async () => {
    const report = await getDatabaseStorageSizes();
    assert.ok(report.summary, "Report should contain summary");
    assert.ok(Array.isArray(report.tables), "Report should contain tables array");
    assert.ok(report.tables.length > 0, "Tables array should not be empty");
    assert.ok(parseFloat(report.summary.totalMb) > 0, "Total MB should be greater than 0");
  });

  await t.test("3. Audit trail pruning and compaction handles duplicates cleanly", async () => {
    // Insert a test audit trail record
    const testId1 = `test_audit_1_${Date.now()}`;
    const testId2 = `test_audit_2_${Date.now()}`;
    const details = "Test compaction detail";

    await pool.query(
      `INSERT INTO audit_trails (id, business_id, action_type, entity_type, entity_id, user_name, details, created_at)
       VALUES (?, 'demo-business', 'TEST_ACTION', 'TEST_ENTITY', 'e1', 'Tester', ?, '2026-11-01 10:00:00'),
              (?, 'demo-business', 'TEST_ACTION', 'TEST_ENTITY', 'e1', 'Tester', ?, '2026-11-01 10:05:00')`,
      [testId1, details, testId2, details]
    );

    // Prune entries older than 5 days
    const pruneResult = await pruneAuditTrails({
      businessId: "demo-business",
      retentionDays: 5,
      compactDuplicates: true,
    });

    assert.ok(pruneResult.agedRowsPruned >= 2, "Aged test rows should be pruned");

    const [check] = await pool.query("SELECT COUNT(*) AS c FROM audit_trails WHERE id IN (?, ?)", [testId1, testId2]);
    assert.equal(check[0].c, 0, "Test rows should no longer exist in audit_trails");
  });

  await t.test("4. Full database maintenance routine runs successfully", async () => {
    const report = await runDatabaseMaintenance({
      businessId: "all",
      retentionDays: 30,
      compactDuplicates: true,
      optimize: true,
      dryRun: false,
    });

    assert.equal(report.success, true, "Maintenance routine should succeed");
    assert.ok(typeof report.durationMs === "number", "Duration should be numeric");
    assert.ok(report.storage, "Should include storage metrics");
    assert.ok(report.tableOptimization, "Should include table optimization results");
  });

  await t.test("5. getDatabaseMaintenanceStatus reports zero active BLOB records and recent execution", async () => {
    const status = await getDatabaseMaintenanceStatus();
    assert.equal(status.success, true);
    assert.equal(status.diagnostics.activeBlobRecords, 0, "Active BLOB count must be 0");
    assert.ok(status.diagnostics.auditRowCount < 2000, "Audit trails row count should be compacted");
    assert.ok(status.diagnostics.lastMaintenance, "Last maintenance timestamp should exist");
  });

  t.after(async () => {
    await pool.end();
  });
});
