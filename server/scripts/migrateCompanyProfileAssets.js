/**
 * CLI runner for Company Profile Asset Migration (Phase 3)
 *
 * Usage:
 *   node server/scripts/migrateCompanyProfileAssets.js [businessId] [--dry-run] [--rollback] [--delete-files]
 */

import {
  migrateCompanyProfileAssets,
  rollbackCompanyProfileAssets,
} from "../src/services/storage/companyProfileAssetMigration.js";
import { pool } from "../src/db/mysql.js";

async function main() {
  const args = process.argv.slice(2);
  const isRollback = args.includes("--rollback");
  const isDryRun = args.includes("--dry-run");
  const deleteFiles = args.includes("--delete-files");

  const businessIdArg = args.find((a) => !a.startsWith("--")) || "demo-business";

  console.log("==================================================");
  console.log(`USV Phase 3: Company Profile Asset Filesystem Migration`);
  console.log(`Business Context: ${businessIdArg}`);
  console.log(`Mode: ${isRollback ? "ROLLBACK" : isDryRun ? "DRY-RUN" : "MIGRATE"}`);
  console.log("==================================================");

  try {
    if (isRollback) {
      const result = await rollbackCompanyProfileAssets({
        businessId: businessIdArg,
        deleteFiles,
      });
      console.log("\n[Rollback Result]:", JSON.stringify(result, null, 2));
    } else {
      const result = await migrateCompanyProfileAssets({
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
