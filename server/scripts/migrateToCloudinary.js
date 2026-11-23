/**
 * CLI Runner: Migrate Business Filesystem Images to Cloudinary
 *
 * Usage:
 *   node server/scripts/migrateToCloudinary.js [businessId] [--dry-run]
 *
 * Example:
 *   node server/scripts/migrateToCloudinary.js demo-business --dry-run
 *   node server/scripts/migrateToCloudinary.js demo-business
 */

import { migrateBusinessImagesToCloudinary } from "../src/services/storage/cloudinaryImageMigration.js";
import { pool } from "../src/db/mysql.js";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const businessId = args.find((a) => !a.startsWith("--")) || "demo-business";

console.log("==================================================");
console.log(`USV Cloudinary Migration CLI [${isDryRun ? "DRY RUN" : "LIVE"}]`);
console.log(`Target Business Context: ${businessId}`);
console.log("==================================================");

migrateBusinessImagesToCloudinary({ businessId, dryRun: isDryRun })
  .then((summary) => {
    console.log("\n==================================================");
    console.log("MIGRATION SUMMARY:");
    console.log(`  Total Scanned:         ${summary.totalScanned}`);
    console.log(`  Already in Cloudinary: ${summary.alreadyInCloudinary}`);
    console.log(`  Migrated:              ${summary.migrated}`);
    console.log(`  Skipped (Missing):     ${summary.skippedMissingFiles}`);
    console.log(`  Errors:                ${summary.errors.length}`);
    if (summary.errors.length > 0) {
      console.log("  Error Details:", summary.errors);
    }
    console.log("  Migrated Assets:", summary.migratedAssets.map((a) => ({
      id: a.id,
      category: a.category,
      filename: a.original_filename,
      key: a.cloudinaryPublicId || a.publicId,
    })));
    console.log("==================================================");
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration fatal error:", err);
    process.exit(1);
  });
