/**
 * Settings Image Migration Service (Phase 6)
 *
 * Implements safe, idempotent migration of app_settings images (companyLogo, signatureImage)
 * to private filesystem storage:
 * - Scans `app_settings` for legacy Base64 DataURLs in `companyLogo` or `signatureImage`.
 * - De-duplicates against existing Company Profile assets to avoid redundant storage files.
 * - Saves binary files to `businesses/<businessId>/company-profile/<uuid>.<ext>` via storageService.
 * - Saves metadata to `business_files` and references in `company_profile_assets`.
 * - Updates `app_settings.setting_value` to `/api/settings/company-profile/assets/<fileId>?businessId=<businessId>`.
 * - Validates SHA-256 checksum and byte size.
 * - Idempotent: Skips already migrated and verified assets.
 * - Non-destructive: Leaves empty or non-image settings untouched.
 * - Supports dryRun mode and safe rollback.
 */

import crypto from "node:crypto";
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
  deleteFileMetadata,
} from "../../db/businessFilesRepository.js";

/**
 * Migrates existing settings images for a business to private filesystem storage.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Business context
 * @param {boolean} [options.dryRun=false] When true, only reports planned operations without modifying files or DB
 * @returns {Promise<Object>} Detailed migration report
 */
export async function migrateSettingsImages({
  businessId = DEFAULT_BUSINESS_ID,
  dryRun = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  // Fetch candidate settings for this business
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value
     FROM app_settings
     WHERE business_id = ? AND (
       setting_key IN ('companyLogo', 'signatureImage')
       OR setting_value LIKE 'data:image/%'
       OR setting_value LIKE '/api/settings/company-profile/assets/%'
     )`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalCandidateSettings: rows.length,
    settingsWithImages: 0,
    migratedCount: 0,
    alreadyMigratedCount: 0,
    deduplicatedCount: 0,
    failedCount: 0,
    details: [],
  };

  for (const row of rows) {
    const key = row.setting_key;
    const val = row.setting_value;

    if (!val || typeof val !== "string" || val.trim() === "" || val === '""') {
      continue;
    }

    report.settingsWithImages++;

    // Case 1: Already migrated to asset endpoint
    if (val.startsWith("/api/settings/company-profile/assets/")) {
      try {
        const fileId = val.split("/").pop().split("?")[0];
        const fileMeta = await getFileMetadataById(fileId, validBiz);
        if (fileMeta) {
          const existsOnDisk = await storageService.fileExists(fileMeta.storage_key);
          if (existsOnDisk) {
            const diskBuffer = await storageService.readFile(fileMeta.storage_key);
            const diskSha256 = computeSha256(diskBuffer);

            if (!fileMeta.sha256_hash || fileMeta.sha256_hash === diskSha256) {
              report.alreadyMigratedCount++;
              report.details.push({
                settingKey: key,
                fileId,
                status: "already_migrated_and_verified",
                sizeBytes: diskBuffer.length,
                sha256: diskSha256,
              });
              continue;
            }
          }
        }
      } catch {
        // Fall through to re-migrate
      }
    }

    // Case 2: Base64 Data URL
    if (val.startsWith("data:image/")) {
      try {
        const matches = val.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          throw new Error(`Invalid Base64 Data URL format for setting '${key}'`);
        }

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        validateFileContent(buffer, mimeType, 10 * 1024 * 1024);

        const sha256 = computeSha256(buffer);
        const sizeBytes = buffer.length;
        const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
        const assetType = key === "companyLogo" ? "company-logo" : (key === "signatureImage" ? "company-signature" : "app-setting");
        const filename = `${assetType}-${Date.now()}.${ext}`;

        // De-duplication check: see if identical file already exists in business_files
        const [existingFiles] = await pool.query(
          `SELECT id, storage_key FROM business_files WHERE business_id = ? AND sha256_hash = ? AND is_deleted = 0 LIMIT 1`,
          [validBiz, sha256]
        );

        let fileId;
        let storageKey;
        let isDeduplicated = false;

        if (existingFiles.length > 0 && (await storageService.fileExists(existingFiles[0].storage_key))) {
          fileId = existingFiles[0].id;
          storageKey = existingFiles[0].storage_key;
          isDeduplicated = true;
          report.deduplicatedCount++;
        }

        if (dryRun) {
          report.migratedCount++;
          report.details.push({
            settingKey: key,
            status: "dry_run_migrate",
            isDeduplicated,
            assetType,
            sizeBytes,
            sha256,
          });
          continue;
        }

        if (!isDeduplicated) {
          const fileResult = await storageService.saveFileAndMetadata({
            businessId: validBiz,
            category: "company-profile",
            fileBuffer: buffer,
            originalFilename: filename,
            mimeType,
          });
          fileId = fileResult.id;
          storageKey = fileResult.storageKey;

          // Verify newly written file
          const diskBuffer = await storageService.readFile(storageKey);
          const diskSha256 = computeSha256(diskBuffer);
          if (diskSha256 !== sha256 || diskBuffer.length !== sizeBytes) {
            throw new Error(
              `Verification failed: Written settings image file checksum/size mismatch (${diskSha256} vs ${sha256})`
            );
          }
        }

        // Link in company_profile_assets
        await pool.execute(
          `INSERT INTO company_profile_assets (id, business_id, asset_type, original_filename, mime_type, size_bytes, storage_key, file_id, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE
             storage_key = VALUES(storage_key),
             file_id = VALUES(file_id),
             updated_at = CURRENT_TIMESTAMP`,
          [fileId, validBiz, assetType, filename, mimeType, sizeBytes, storageKey, fileId]
        );

        const newUrl = `/api/settings/company-profile/assets/${fileId}?businessId=${encodeURIComponent(validBiz)}`;

        // Update app_settings
        await pool.query(
          `UPDATE app_settings
           SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
           WHERE business_id = ? AND setting_key = ?`,
          [newUrl, validBiz, key]
        );

        report.migratedCount++;
        report.details.push({
          settingKey: key,
          fileId,
          url: newUrl,
          storageKey,
          isDeduplicated,
          status: "migrated",
          sizeBytes,
          sha256,
        });
      } catch (migErr) {
        report.failedCount++;
        report.success = false;
        report.details.push({
          settingKey: key,
          status: "failed",
          error: migErr.message,
        });
      }
    }
  }

  return report;
}

/**
 * Rolls back settings images for a business.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Business context
 * @returns {Promise<Object>} Rollback report
 */
export async function rollbackSettingsImages({
  businessId = DEFAULT_BUSINESS_ID,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  const [rows] = await pool.query(
    `SELECT setting_key, setting_value
     FROM app_settings
     WHERE business_id = ? AND setting_key IN ('companyLogo', 'signatureImage')
       AND setting_value LIKE '/api/settings/company-profile/assets/%'`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalToRollback: rows.length,
    rolledBackCount: 0,
    failedCount: 0,
    details: [],
  };

  for (const row of rows) {
    try {
      await pool.query(
        `UPDATE app_settings
         SET setting_value = '', updated_at = CURRENT_TIMESTAMP
         WHERE business_id = ? AND setting_key = ?`,
        [validBiz, row.setting_key]
      );

      report.rolledBackCount++;
      report.details.push({
        settingKey: row.setting_key,
        status: "rolled_back",
      });
    } catch (err) {
      report.failedCount++;
      report.success = false;
      report.details.push({
        settingKey: row.setting_key,
        status: "failed",
        error: err.message,
      });
    }
  }

  return report;
}
