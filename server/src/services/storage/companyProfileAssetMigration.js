/**
 * Company Profile Asset Migration Service (Phase 3)
 *
 * Implements safe, idempotent migration of Company Profile logo and signature binaries
 * from MySQL BLOB storage (`company_profile_assets.data`) to private filesystem storage.
 *
 * Safety guarantees:
 * 1. Business-isolated: Requires and strictly enforces businessId (defaults to 'demo-business').
 * 2. Non-destructive: NEVER deletes original BLOB data. Original BLOB data is preserved in MySQL.
 * 3. Idempotent: Repeated runs verify SHA-256 and byte size of existing on-disk files without duplicating files or metadata.
 * 4. Verifiable: Calculates SHA-256 and size of original BLOB vs on-disk saved file.
 * 5. Rollback-safe: Provides complete rollback mechanism restoring BLOB-backed retrieval.
 */

import path from "node:path";
import { pool } from "../../db/mysql.js";
import { DEFAULT_BUSINESS_ID } from "../../config/storageConfig.js";
import { storageService } from "./storageService.js";
import {
  validateBusinessId,
  validateFileContent,
  computeSha256,
} from "./storageValidation.js";
import {
  getFileMetadataById,
  saveFileMetadata,
  deleteFileMetadata,
} from "../../db/businessFilesRepository.js";

/**
 * Migrates existing Company Profile logo and signature BLOBs for a business to filesystem storage.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Target business context
 * @param {boolean} [options.dryRun=false] When true, only reports planned changes without writing files
 * @returns {Promise<Object>} Migration report
 */
export async function migrateCompanyProfileAssets({
  businessId = DEFAULT_BUSINESS_ID,
  dryRun = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  // Fetch all existing assets with BLOB data for this business
  const [rows] = await pool.query(
    `SELECT id, business_id, asset_type, original_filename, mime_type, size_bytes, storage_key, file_id, data
     FROM company_profile_assets
     WHERE business_id = ? AND data IS NOT NULL AND LENGTH(data) > 0
     ORDER BY created_at ASC`,
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

    // 1. Check if already migrated and verified
    if (row.storage_key) {
      try {
        const fileExistsOnDisk = await storageService.fileExists(row.storage_key);
        if (fileExistsOnDisk) {
          const diskBuffer = await storageService.readFile(row.storage_key);
          const diskSha256 = computeSha256(diskBuffer);

          if (diskSha256 === originalSha256 && diskBuffer.length === originalSize) {
            // Ensure business_files metadata consistency
            const existingMeta = await getFileMetadataById(assetId, validBiz);
            if (!existingMeta && !dryRun) {
              await saveFileMetadata({
                id: assetId,
                businessId: validBiz,
                module: "company-profile",
                category: "company-profile",
                originalFilename: row.original_filename || `${row.asset_type}-${assetId}.png`,
                storedFilename: path.basename(row.storage_key),
                storageDriver: "local",
                storageKey: row.storage_key,
                mimeType: row.mime_type,
                sizeBytes: originalSize,
                sha256Hash: originalSha256,
              });
            }

            report.alreadyMigratedCount++;
            report.details.push({
              id: assetId,
              assetType: row.asset_type,
              status: "already_migrated",
              storageKey: row.storage_key,
              sha256: originalSha256,
              sizeBytes: originalSize,
              verified: true,
            });
            continue;
          }
        }
      } catch (checkErr) {
        // File check failed, will proceed to migrate
      }
    }

    if (dryRun) {
      report.details.push({
        id: assetId,
        assetType: row.asset_type,
        status: "would_migrate",
        sizeBytes: originalSize,
        sha256: originalSha256,
      });
      report.migratedCount++;
      continue;
    }

    // 2. Validate file format before writing
    try {
      validateFileContent(blobBuffer, row.mime_type);
    } catch (vErr) {
      report.failedCount++;
      report.details.push({
        id: assetId,
        assetType: row.asset_type,
        status: "failed",
        error: `Content validation failed: ${vErr.message}`,
        originalBlobPreserved: true,
      });
      continue;
    }

    // 3. Save to filesystem storage & business_files metadata repository
    let savedMetadata = null;
    try {
      savedMetadata = await storageService.saveFileAndMetadata({
        businessId: validBiz,
        category: "company-profile",
        fileBuffer: blobBuffer,
        originalFilename: row.original_filename || `${row.asset_type}-${assetId}.png`,
        mimeType: row.mime_type,
        fileId: assetId,
      });

      // 4. Verify on-disk file integrity against original BLOB
      const writtenBuffer = await storageService.readFile(savedMetadata.storageKey);
      const writtenSha256 = computeSha256(writtenBuffer);

      if (writtenSha256 !== originalSha256 || writtenBuffer.length !== originalSize) {
        throw new Error(
          `Integrity mismatch: Expected SHA256 ${originalSha256} (${originalSize} bytes), got ${writtenSha256} (${writtenBuffer.length} bytes)`
        );
      }

      // 5. Update company_profile_assets with storage reference (STRICTLY PRESERVING BLOB IN DATA)
      await pool.query(
        `UPDATE company_profile_assets
         SET storage_key = ?, file_id = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND business_id = ?`,
        [savedMetadata.storageKey, savedMetadata.id, assetId, validBiz]
      );

      report.migratedCount++;
      report.details.push({
        id: assetId,
        assetType: row.asset_type,
        status: "migrated",
        storageKey: savedMetadata.storageKey,
        sha256: writtenSha256,
        sizeBytes: writtenBuffer.length,
        verified: true,
        originalBlobPreserved: true,
      });
    } catch (migrationErr) {
      // Rollback newly created file if integrity check or update failed
      if (savedMetadata?.storageKey) {
        try {
          await storageService.deleteFile(savedMetadata.storageKey, validBiz);
          await deleteFileMetadata(assetId, validBiz);
        } catch {}
      }

      report.failedCount++;
      report.details.push({
        id: assetId,
        assetType: row.asset_type,
        status: "failed",
        error: migrationErr.message,
        originalBlobPreserved: true,
      });
    }
  }

  report.success = report.failedCount === 0;
  return report;
}

/**
 * Rolls back filesystem migration for a business, restoring original MySQL BLOB retrieval.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Business context
 * @param {boolean} [options.deleteFiles=false] Whether to remove files from filesystem
 * @returns {Promise<Object>} Rollback report
 */
export async function rollbackCompanyProfileAssets({
  businessId = DEFAULT_BUSINESS_ID,
  deleteFiles = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  // Find all assets with storage_key and existing data BLOB
  const [rows] = await pool.query(
    `SELECT id, business_id, asset_type, storage_key, data
     FROM company_profile_assets
     WHERE business_id = ? AND storage_key IS NOT NULL AND data IS NOT NULL
     ORDER BY created_at ASC`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalEligible: rows.length,
    rolledBackCount: 0,
    details: [],
  };

  for (const row of rows) {
    try {
      // 1. Reset storage reference in company_profile_assets
      await pool.query(
        `UPDATE company_profile_assets
         SET storage_key = NULL, file_id = NULL, updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND business_id = ?`,
        [row.id, validBiz]
      );

      // 2. Remove metadata from business_files
      await deleteFileMetadata(row.id, validBiz);

      // 3. Optionally remove physical file
      if (deleteFiles && row.storage_key) {
        try {
          await storageService.deleteFile(row.storage_key, validBiz);
        } catch {}
      }

      report.rolledBackCount++;
      report.details.push({
        id: row.id,
        assetType: row.asset_type,
        status: "rolled_back",
        blobIntact: true,
      });
    } catch (err) {
      report.details.push({
        id: row.id,
        assetType: row.asset_type,
        status: "failed",
        error: err.message,
      });
    }
  }

  report.success = report.rolledBackCount === report.totalEligible;
  return report;
}
