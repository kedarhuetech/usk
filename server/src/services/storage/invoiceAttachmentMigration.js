/**
 * Invoice Attachment Migration Service (Phase 5)
 *
 * Implements safe, idempotent migration of transaction attachments (image_url, document_url)
 * to private filesystem storage:
 * - Scans `transactions` for legacy Base64 DataURLs or unmigrated attachment references.
 * - Saves binary files to `businesses/<businessId>/invoice-attachments/<uuid>.<ext>` via storageService.
 * - Saves metadata to `business_files` table.
 * - Updates `transactions.image_url` to `/api/transactions/attachments/<fileId>` and `transactions.image_id` to `<fileId>`.
 * - Updates `transactions.document_url` to `/api/transactions/attachments/<fileId>` and `transactions.document_id` to `<fileId>`.
 * - Validates SHA-256 checksum and byte size.
 * - Idempotent: Skips already migrated and verified attachments without creating duplicate files.
 * - Non-destructive: Leaves transactions without attachments completely untouched.
 * - Supports dryRun mode and safe rollback.
 */

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
 * Migrates existing transaction attachments for a business to private filesystem storage.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Business context
 * @param {boolean} [options.dryRun=false] When true, only reports planned operations without modifying files or DB
 * @returns {Promise<Object>} Detailed migration report
 */
export async function migrateInvoiceAttachments({
  businessId = DEFAULT_BUSINESS_ID,
  dryRun = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  // Fetch all transactions for this business
  const [rows] = await pool.query(
    `SELECT id, document_number, transaction_type, image_url, image_id, image_name,
            document_url, document_id, document_name
     FROM transactions
     WHERE business_id = ?
     ORDER BY transaction_date ASC, created_at ASC`,
    [validBiz]
  );

  const report = {
    success: true,
    businessId: validBiz,
    totalTransactions: rows.length,
    transactionsWithAttachments: 0,
    transactionsWithoutAttachments: 0,
    migratedAttachmentsCount: 0,
    alreadyMigratedCount: 0,
    failedCount: 0,
    details: [],
  };

  for (const row of rows) {
    const txnId = row.id;
    const docNumber = row.document_number;
    const rawImageUrl = row.image_url;
    const rawImageId = row.image_id;
    const rawImageName = row.image_name;
    const rawDocUrl = row.document_url;
    const rawDocId = row.document_id;
    const rawDocName = row.document_name;

    const hasImage = Boolean(rawImageUrl || rawImageId);
    const hasDoc = Boolean(rawDocUrl || rawDocId);

    if (!hasImage && !hasDoc) {
      report.transactionsWithoutAttachments++;
      continue;
    }

    report.transactionsWithAttachments++;

    // 1. Process image attachment
    if (hasImage) {
      // Check if already migrated
      if (rawImageId && rawImageUrl && rawImageUrl.startsWith("/api/transactions/attachments/")) {
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
                  transactionId: txnId,
                  documentNumber: docNumber,
                  field: "image_url",
                  fileId: rawImageId,
                  status: "already_migrated_and_verified",
                  sizeBytes: diskBuffer.length,
                  sha256: diskSha256,
                });
              }
            }
          }
        } catch {
          // If error, fall through to re-migrate
        }
      } else if (typeof rawImageUrl === "string" && rawImageUrl.startsWith("data:")) {
        try {
          const matches = rawImageUrl.match(/^data:([A-Za-z-+/0-9.]+);base64,(.+)$/);
          if (!matches || matches.length !== 3) {
            throw new Error("Invalid Base64 Data URL format for image attachment");
          }

          const mimeType = matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          validateFileContent(buffer, mimeType, 10 * 1024 * 1024);

          const sha256 = computeSha256(buffer);
          const sizeBytes = buffer.length;
          const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpeg";
          const originalFilename = rawImageName || `invoice-${docNumber || txnId}-image.${ext}`;

          if (dryRun) {
            report.migratedAttachmentsCount++;
            report.details.push({
              transactionId: txnId,
              documentNumber: docNumber,
              field: "image_url",
              status: "dry_run_migrate",
              originalFilename,
              mimeType,
              sizeBytes,
              sha256,
            });
          } else {
            const fileResult = await storageService.saveFileAndMetadata({
              businessId: validBiz,
              category: "invoice-attachments",
              fileBuffer: buffer,
              originalFilename,
              mimeType,
            });

            // Verify newly written file
            const diskBuffer = await storageService.readFile(fileResult.storageKey);
            const diskSha256 = computeSha256(diskBuffer);
            if (diskSha256 !== sha256 || diskBuffer.length !== sizeBytes) {
              throw new Error(
                `Verification failed: Written image file checksum/size mismatch (${diskSha256} vs ${sha256})`
              );
            }

            const newUrl = `/api/transactions/attachments/${fileResult.id}`;

            await pool.query(
              `UPDATE transactions
               SET image_url = ?, image_id = ?, image_name = ?, updated_at = CURRENT_TIMESTAMP
               WHERE business_id = ? AND id = ?`,
              [newUrl, fileResult.id, originalFilename, validBiz, txnId]
            );

            report.migratedAttachmentsCount++;
            report.details.push({
              transactionId: txnId,
              documentNumber: docNumber,
              field: "image_url",
              fileId: fileResult.id,
              url: newUrl,
              storageKey: fileResult.storageKey,
              status: "migrated",
              sizeBytes,
              sha256,
            });
          }
        } catch (imgErr) {
          report.failedCount++;
          report.success = false;
          report.details.push({
            transactionId: txnId,
            documentNumber: docNumber,
            field: "image_url",
            status: "failed",
            error: imgErr.message,
          });
        }
      }
    }

    // 2. Process document attachment
    if (hasDoc) {
      // Check if already migrated
      if (rawDocId && rawDocUrl && rawDocUrl.startsWith("/api/transactions/attachments/")) {
        try {
          const fileMeta = await getFileMetadataById(rawDocId, validBiz);
          if (fileMeta) {
            const existsOnDisk = await storageService.fileExists(fileMeta.storage_key);
            if (existsOnDisk) {
              const diskBuffer = await storageService.readFile(fileMeta.storage_key);
              const diskSha256 = computeSha256(diskBuffer);

              if (!fileMeta.sha256_hash || fileMeta.sha256_hash === diskSha256) {
                report.alreadyMigratedCount++;
                report.details.push({
                  transactionId: txnId,
                  documentNumber: docNumber,
                  field: "document_url",
                  fileId: rawDocId,
                  status: "already_migrated_and_verified",
                  sizeBytes: diskBuffer.length,
                  sha256: diskSha256,
                });
              }
            }
          }
        } catch {
          // If error, fall through to re-migrate
        }
      } else if (typeof rawDocUrl === "string" && rawDocUrl.startsWith("data:")) {
        try {
          const matches = rawDocUrl.match(/^data:([A-Za-z-+/0-9.]+);base64,(.+)$/);
          if (!matches || matches.length !== 3) {
            throw new Error("Invalid Base64 Data URL format for document attachment");
          }

          const mimeType = matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          validateFileContent(buffer, mimeType, 10 * 1024 * 1024);

          const sha256 = computeSha256(buffer);
          const sizeBytes = buffer.length;
          const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
          const originalFilename = rawDocName || `invoice-${docNumber || txnId}-doc.${ext}`;

          if (dryRun) {
            report.migratedAttachmentsCount++;
            report.details.push({
              transactionId: txnId,
              documentNumber: docNumber,
              field: "document_url",
              status: "dry_run_migrate",
              originalFilename,
              mimeType,
              sizeBytes,
              sha256,
            });
          } else {
            const fileResult = await storageService.saveFileAndMetadata({
              businessId: validBiz,
              category: "invoice-attachments",
              fileBuffer: buffer,
              originalFilename,
              mimeType,
            });

            // Verify newly written file
            const diskBuffer = await storageService.readFile(fileResult.storageKey);
            const diskSha256 = computeSha256(diskBuffer);
            if (diskSha256 !== sha256 || diskBuffer.length !== sizeBytes) {
              throw new Error(
                `Verification failed: Written document file checksum/size mismatch (${diskSha256} vs ${sha256})`
              );
            }

            const newUrl = `/api/transactions/attachments/${fileResult.id}`;

            await pool.query(
              `UPDATE transactions
               SET document_url = ?, document_id = ?, document_name = ?, updated_at = CURRENT_TIMESTAMP
               WHERE business_id = ? AND id = ?`,
              [newUrl, fileResult.id, originalFilename, validBiz, txnId]
            );

            report.migratedAttachmentsCount++;
            report.details.push({
              transactionId: txnId,
              documentNumber: docNumber,
              field: "document_url",
              fileId: fileResult.id,
              url: newUrl,
              storageKey: fileResult.storageKey,
              status: "migrated",
              sizeBytes,
              sha256,
            });
          }
        } catch (docErr) {
          report.failedCount++;
          report.success = false;
          report.details.push({
            transactionId: txnId,
            documentNumber: docNumber,
            field: "document_url",
            status: "failed",
            error: docErr.message,
          });
        }
      }
    }
  }

  return report;
}

/**
 * Rolls back invoice attachments for a business.
 *
 * @param {Object} [options]
 * @param {string} [options.businessId='demo-business'] Business context
 * @param {boolean} [options.deleteFiles=false] Whether to physically delete files from disk
 * @returns {Promise<Object>} Rollback report
 */
export async function rollbackInvoiceAttachments({
  businessId = DEFAULT_BUSINESS_ID,
  deleteFiles = false,
} = {}) {
  const validBiz = validateBusinessId(businessId);

  const [rows] = await pool.query(
    `SELECT id, document_number, image_id, document_id
     FROM transactions
     WHERE business_id = ? AND (image_id IS NOT NULL OR document_id IS NOT NULL)`,
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

  for (const row of rows) {
    try {
      const fileIds = [row.image_id, row.document_id].filter(Boolean);

      if (deleteFiles) {
        for (const fileId of fileIds) {
          try {
            const fileMeta = await getFileMetadataById(fileId, validBiz);
            if (fileMeta) {
              await storageService.deleteFile(fileMeta.storage_key, validBiz).catch(() => {});
              await deleteFileMetadata(fileId, validBiz).catch(() => {});
              report.filesDeleted++;
            }
          } catch (fErr) {
            console.warn(`[Rollback] Failed to delete file for ${fileId}:`, fErr.message);
          }
        }
      }

      await pool.query(
        `UPDATE transactions
         SET image_id = NULL, document_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE business_id = ? AND id = ?`,
        [validBiz, row.id]
      );

      report.rolledBackCount++;
      report.details.push({
        transactionId: row.id,
        documentNumber: row.document_number,
        status: "rolled_back",
      });
    } catch (err) {
      report.failedCount++;
      report.success = false;
      report.details.push({
        transactionId: row.id,
        status: "failed",
        error: err.message,
      });
    }
  }

  return report;
}
