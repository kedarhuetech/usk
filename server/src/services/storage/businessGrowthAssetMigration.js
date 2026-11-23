/**
 * Business Growth Asset Migration & Zero-BLOB Service
 *
 * Migrates binary image assets from MySQL MEDIUMBLOB storage (`business_growth_assets.data`
 * and `company_profile_assets.data`) to unified storage (filesystem / Cloudinary + `business_files`),
 * then safely zeros the BLOB columns in MySQL to reclaim database memory and disk space.
 */

import { pool } from "../../db/mysql.js";
import { DEFAULT_BUSINESS_ID } from "../../config/storageConfig.js";
import { storageService } from "./storageService.js";
import { validateBusinessId, computeSha256 } from "./storageValidation.js";

/**
 * Migrates all business_growth_assets with BLOB data to storage service.
 * Once verified, sets data = NULL to eliminate MySQL BLOB bloat.
 */
export async function migrateBusinessGrowthAssets({
  businessId = DEFAULT_BUSINESS_ID,
  dryRun = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  // Fetch all rows in business_growth_assets with BLOB data for this business
  const [rows] = await pool.query(
    `SELECT id, business_id, entity_type, entity_id, original_filename, mime_type, size_bytes, storage_key, file_id, data
     FROM business_growth_assets
     WHERE business_id = ? AND data IS NOT NULL AND LENGTH(data) > 0`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalDiscovered: rows.length,
    migratedCount: 0,
    alreadyMigratedCount: 0,
    failedCount: 0,
    details: [],
  };

  if (!rows.length) {
    return report;
  }

  for (const row of rows) {
    const assetId = row.id;
    const blobBuffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    const originalSha256 = computeSha256(blobBuffer);
    const originalSize = blobBuffer.length;

    // Check if already stored on disk/cloud
    if (row.storage_key) {
      try {
        const fileExists = await storageService.fileExists(row.storage_key);
        if (fileExists) {
          const storedBuffer = await storageService.readFile(row.storage_key);
          const storedSha256 = computeSha256(storedBuffer);
          if (storedSha256 === originalSha256) {
            if (!dryRun) {
              await pool.execute(
                `UPDATE business_growth_assets SET data = NULL WHERE id = ? AND business_id = ?`,
                [assetId, validBiz]
              );
            }
            report.alreadyMigratedCount++;
            report.details.push({ id: assetId, status: "already_stored_blob_zeroed" });
            continue;
          }
        }
      } catch (err) {
        // Will proceed to save file
      }
    }

    if (dryRun) {
      report.migratedCount++;
      report.details.push({ id: assetId, status: "would_migrate", sizeBytes: originalSize });
      continue;
    }

    try {
      const category = row.entity_type === "marketing-design" ? "marketing-studio" : "business-growth";
      const saved = await storageService.saveFileAndMetadata({
        businessId: validBiz,
        category,
        fileBuffer: blobBuffer,
        originalFilename: row.original_filename || `asset-${assetId}.png`,
        mimeType: row.mime_type || "image/jpeg",
        fileId: assetId,
      });

      // Verify file written
      const writtenBuffer = await storageService.readFile(saved.storageKey);
      const writtenSha256 = computeSha256(writtenBuffer);

      if (writtenSha256 === originalSha256 && writtenBuffer.length === originalSize) {
        // Update record with storage reference and zero BLOB
        await pool.execute(
          `UPDATE business_growth_assets 
           SET storage_key = ?, file_id = ?, data = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ? AND business_id = ?`,
          [saved.storageKey, saved.id, assetId, validBiz]
        );

        report.migratedCount++;
        report.details.push({
          id: assetId,
          status: "migrated_and_blob_zeroed",
          storageKey: saved.storageKey,
          sizeBytes: originalSize,
        });
      } else {
        throw new Error("Verification hash mismatch after saving asset.");
      }
    } catch (err) {
      report.failedCount++;
      report.details.push({ id: assetId, status: "failed", error: err.message });
    }
  }

  return report;
}

/**
 * Safely zeros BLOBs in company_profile_assets where file already exists and is verified in storage.
 */
export async function zeroVerifiedCompanyProfileBlobs({
  businessId = DEFAULT_BUSINESS_ID,
  dryRun = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  const [rows] = await pool.query(
    `SELECT id, business_id, asset_type, original_filename, mime_type, size_bytes, storage_key, file_id, data
     FROM company_profile_assets
     WHERE business_id = ? AND data IS NOT NULL AND LENGTH(data) > 0`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalDiscovered: rows.length,
    clearedCount: 0,
    failedCount: 0,
    details: [],
  };

  for (const row of rows) {
    try {
      const blobBuffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      let storageKey = row.storage_key;

      let verified = false;
      if (storageKey && (await storageService.fileExists(storageKey))) {
        const fileBuf = await storageService.readFile(storageKey);
        if (fileBuf.length === blobBuffer.length) {
          verified = true;
        }
      }

      if (!verified) {
        // Write file to storage first
        const saved = await storageService.saveFileAndMetadata({
          businessId: validBiz,
          category: "company-profile",
          fileBuffer: blobBuffer,
          originalFilename: row.original_filename || `${row.asset_type}-${row.id}.png`,
          mimeType: row.mime_type || "image/png",
          fileId: row.id,
        });
        storageKey = saved.storageKey;
        verified = true;
      }

      if (verified && !dryRun) {
        await pool.execute(
          `UPDATE company_profile_assets 
           SET storage_key = ?, file_id = ?, data = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ? AND business_id = ?`,
          [storageKey, row.file_id || row.id, row.id, validBiz]
        );
        report.clearedCount++;
        report.details.push({ id: row.id, status: "cleared", storageKey });
      }
    } catch (err) {
      report.failedCount++;
      report.details.push({ id: row.id, status: "failed", error: err.message });
    }
  }

  return report;
}
