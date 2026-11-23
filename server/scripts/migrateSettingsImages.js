/**
 * CLI runner for Settings Image Migration (Phase 6)
 *
 * Usage:
 *   node server/scripts/migrateSettingsImages.js [businessId] [--dry-run] [--rollback]
 */

import {
  migrateSettingsImages,
  rollbackSettingsImages,
} from "../src/services/storage/settingsImageMigration.js";
import { pool } from "../src/db/mysql.js";

async function main() {
  const args = process.argv.slice(2);
  const isRollback = args.includes("--rollback");
  const isDryRun = args.includes("--dry-run");

  const businessIdArg = args.find((a) => !a.startsWith("--")) || "demo-business";

  console.log("==================================================");
  console.log(`USV Phase 6: Settings Image Filesystem Migration`);
  console.log(`Business Context: ${businessIdArg}`);
  console.log(`Mode: ${isRollback ? "ROLLBACK" : isDryRun ? "DRY-RUN" : "MIGRATE"}`);
  console.log("==================================================");

  try {
    if (isRollback) {
      const result = await rollbackSettingsImages({
        businessId: businessIdArg,
      });
      console.log("\n[Rollback Result]:", JSON.stringify(result, null, 2));
    } else {
      const result = await migrateSettingsImages({
        businessId: businessIdArg,
        dryRun: isDryRun,
      });
      console.log("\n[Migration Result]:", JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error("\n[Migration Error]:", err.message);
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {}
  }
}

main();
