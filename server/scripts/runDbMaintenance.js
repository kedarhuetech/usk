/**
 * Standalone Database Maintenance CLI Script
 *
 * Usage:
 *   npm run db:maintenance
 *   node scripts/runDbMaintenance.js [--dry-run] [--days=30]
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { runDatabaseMaintenance, getDatabaseMaintenanceStatus } from "../src/services/dbMaintenanceService.js";
import { pool } from "../src/db/mysql.js";

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const retentionDays = daysArg ? parseInt(daysArg.split("=")[1], 10) : 30;

  console.log("=================================================");
  console.log("🚀 Starting MySQL Database Maintenance Routine...");
  console.log(`Mode: ${isDryRun ? "DRY RUN (no changes)" : "LIVE EXECUTION"}`);
  console.log(`Audit Retention: ${retentionDays} days`);
  console.log("=================================================\n");

  const statusBefore = await getDatabaseMaintenanceStatus();
  console.log("📊 Status Before Maintenance:");
  console.log(`   Total Database Size: ${statusBefore.storageSummary.totalMb} MB (${statusBefore.storageSummary.totalKb} KB)`);
  console.log(`   Audit Trails Rows:   ${statusBefore.diagnostics.auditRowCount}`);
  console.log(`   Active BLOB Records: ${statusBefore.diagnostics.activeBlobRecords}\n`);

  console.log("⚙️  Running maintenance tasks...");
  const report = await runDatabaseMaintenance({
    businessId: "all",
    retentionDays,
    compactDuplicates: true,
    optimize: true,
    dryRun: isDryRun,
  });

  console.log("\n✅ Maintenance Completed Successfully!");
  console.log(`   Duration:            ${report.durationMs} ms`);
  console.log(`   Audit Rows Removed:  ${report.auditTrails.totalRemoved} (${report.auditTrails.agedRowsPruned} aged, ${report.auditTrails.duplicateRowsCompacted} duplicates)`);
  console.log(`   Soft-Deleted Files:  ${report.filesPurged.purgedFiles}`);
  console.log(`   Storage Reclaimed:   ${report.storage.reclaimedKb} KB (${report.storage.reclaimedMb} MB)`);
  console.log(`   New Database Size:   ${report.storage.afterTotalMb} MB (${report.storage.afterTotalKb} KB)`);

  console.log("\n📑 Table Optimization Results:");
  for (const [table, msg] of Object.entries(report.tableOptimization)) {
    console.log(`   - ${table}: ${msg}`);
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Maintenance Failed:", err);
  process.exit(1);
});
