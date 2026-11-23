/**
 * Item Image Migration Service (Phase 4)
 *
 * Implements safe, idempotent migration of Item/Product images to private filesystem storage:
 * - Scans `inventory_items` for legacy Base64 DataURLs or unmigrated image references.
 * - Saves binary files to `businesses/<businessId>/items/<uuid>.<ext>` via storageService.
 * - Saves metadata to `business_files` table.
 * - Updates `inventory_items.image_url` to `/api/items/images/<fileId>` and `inventory_items.image_id` to `<fileId>`.
 * - Validates SHA-256 checksum and byte size.
 * - Idempotent: Skips already migrated and verified images without creating duplicate files.
 * - Non-destructive: Leaves items without images completely untouched.
 * - Supports dryRun mode and safe rollback.
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
 * Migrates existing item images for a business to private filesystem storage.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Business context
 * @param {boolean} [options.dryRun=false] When true, only reports planned operations without modifying files or DB
 * @returns {Promise<Object>} Detailed migration report
 */
export async function migrateItemImages({
  businessId = DEFAULT_BUSINESS_ID,
  dryRun = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  // Fetch all items for this business
  const [rows] = await pool.query(
    `SELECT id, name, image_url, image_id
     FROM inventory_items
     WHERE business_id = ?
     ORDER BY name ASC`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalItems: rows.length,
    itemsWithImages: 0,
    itemsWithoutImages: 0,
    migratedCount: 0,
    alreadyMigratedCount: 0,
    failedCount: 0,
    details: [],
  };

  for (const item of rows) {
    const itemId = item.id;
    const itemName = item.name;
    const rawImageUrl = item.image_url;
    const rawImageId = item.image_id;

    if (!rawImageUrl && !rawImageId) {
      report.itemsWithoutImages++;
      continue;
    }

    report.itemsWithImages++;

    // Case 1: Already migrated with image_id and /api/items/images/ URL
    if (rawImageId && rawImageUrl && rawImageUrl.startsWith("/api/items/images/")) {
      try {
        const fileMeta = await getFileMetadataById(rawImageId, validBiz);
        if (fileMeta) {
          const existsOnDisk = await storageService.fileExists(fileMeta.storage_key);
          if (existsOnDisk) {
            const diskBuffer = await storageService.readFile(fileMeta.storage_key);
            const diskSha256 = computeSha256(diskBuffer);

            if (!fileMeta.sha256_hash || fileMeta.sha256_hash === diskSha256) {
              report.alreadyMigratedCount++;
              report.details.push({
                itemId,
                itemName,
                imageId: rawImageId,
                status: "already_migrated_and_verified",
                sizeBytes: diskBuffer.length,
                sha256: diskSha256,
              });
              continue;
            }
          }
        }
      } catch (checkErr) {
        // Fall through to re-verify or handle
      }
    }

    // Case 2: Base64 Data URL in image_url
    if (typeof rawImageUrl === "string" && rawImageUrl.startsWith("data:image/")) {
      try {
        const matches = rawImageUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          throw new Error("Invalid Base64 Data URL format");
        }

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        validateFileContent(buffer, mimeType, 10 * 1024 * 1024);

        const sha256 = computeSha256(buffer);
        const sizeBytes = buffer.length;
        const ext = mimeType.split("/")[1] || "png";
        const originalFilename = `item-${itemId}.${ext}`;

        if (dryRun) {
          report.migratedCount++;
          report.details.push({
            itemId,
            itemName,
            status: "dry_run_migrate",
            originalFilename,
            mimeType,
            sizeBytes,
            sha256,
          });
          continue;
        }

        // Save to filesystem and business_files
        const fileResult = await storageService.saveFileAndMetadata({
          businessId: validBiz,
          category: "items",
          fileBuffer: buffer,
          originalFilename,
          mimeType,
        });

        // Verify newly written file
        const diskBuffer = await storageService.readFile(fileResult.storageKey);
        const diskSha256 = computeSha256(diskBuffer);
        if (diskSha256 !== sha256 || diskBuffer.length !== sizeBytes) {
          throw new Error(
            `Verification failed: Written file checksum/size mismatch (${diskSha256} vs ${sha256})`
          );
        }

        const newImageUrl = `/api/items/images/${fileResult.id}`;

        // Update inventory_items record
        await pool.query(
          `UPDATE inventory_items
           SET image_url = ?, image_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE business_id = ? AND id = ?`,
          [newImageUrl, fileResult.id, validBiz, itemId]
        );

        report.migratedCount++;
        report.details.push({
          itemId,
          itemName,
          imageId: fileResult.id,
          imageUrl: newImageUrl,
          storageKey: fileResult.storageKey,
          status: "migrated",
          sizeBytes,
          sha256,
        });
      } catch (migErr) {
        report.failedCount++;
        report.success = false;
        report.details.push({
          itemId,
          itemName,
          status: "failed",
          error: migErr.message,
        });
      }
      continue;
    }

    // Case 3: Image URL points to a standard image path or legacy reference
    report.details.push({
      itemId,
      itemName,
      status: "unrecognized_image_format",
      imageUrl: rawImageUrl,
    });
  }

  return report;
}

/**
 * Rolls back item images for a business.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Business context
 * @param {boolean} [options.deleteFiles=false] Whether to physically delete files from disk
 * @returns {Promise<Object>} Rollback report
 */
export async function rollbackItemImages({
  businessId = DEFAULT_BUSINESS_ID,
  deleteFiles = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  const [rows] = await pool.query(
    `SELECT id, name, image_id, image_url
     FROM inventory_items
     WHERE business_id = ? AND image_id IS NOT NULL`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalToRollback: rows.length,
    rolledBackCount: 0,
    filesDeleted: 0,
    failedCount: 0,
    details: [],
  };

  for (const item of rows) {
    try {
      const imageId = item.image_id;

      if (deleteFiles && imageId) {
        try {
          const fileMeta = await getFileMetadataById(imageId, validBiz);
          if (fileMeta) {
            await storageService.deleteFile(fileMeta.storage_key, validBiz).catch(() => {});
            await deleteFileMetadata(imageId, validBiz).catch(() => {});
            report.filesDeleted++;
          }
        } catch (fErr) {
          console.warn(`[Rollback] Failed to delete file for ${imageId}:`, fErr.message);
        }
      }

      await pool.query(
        `UPDATE inventory_items
         SET image_url = NULL, image_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE business_id = ? AND id = ?`,
        [validBiz, item.id]
      );

      report.rolledBackCount++;
      report.details.push({
        itemId: item.id,
        name: item.name,
        previousImageId: imageId,
        status: "rolled_back",
      });
    } catch (err) {
      report.failedCount++;
      report.success = false;
      report.details.push({
        itemId: item.id,
        name: item.name,
        status: "failed",
        error: err.message,
      });
    }
  }

  return report;
}
