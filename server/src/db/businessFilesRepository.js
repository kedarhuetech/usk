/**
 * Business Files Database Repository
 *
 * Provides relational MySQL operations for file metadata stored in `business_files`:
 * - Zero BLOBs / binary data in MySQL. Stores file metadata only.
 * - Enforces business isolation with 'demo-business' as active development context.
 * - Idempotent, transaction-safe operations.
 */

import { pool } from "./mysql.js";
import { DEFAULT_BUSINESS_ID } from "../config/storageConfig.js";
import { validateBusinessId } from "../services/storage/storageValidation.js";

/**
 * Saves file metadata record to the `business_files` table.
 *
 * @param {Object} metadata
 * @param {string} metadata.id File UUID
 * @param {string} [metadata.businessId] Business context (defaults to 'demo-business')
 * @param {string} metadata.module Module / category name
 * @param {string} metadata.category Category name
 * @param {string} metadata.originalFilename Client original filename
 * @param {string} metadata.storedFilename On-disk physical filename ({id}.{ext})
 * @param {string} [metadata.storageDriver='local'] Storage driver name
 * @param {string} metadata.storageKey Relative POSIX key
 * @param {string} metadata.mimeType MIME type
 * @param {number} metadata.sizeBytes File size in bytes
 * @param {string} metadata.sha256Hash SHA-256 checksum
 * @param {import("mysql2/promise").Connection} [connection] Optional transaction connection
 * @returns {Promise<Object>} Persisted metadata object
 */
export async function saveFileMetadata(metadata, connection = null) {
  const conn = connection || pool;
  const businessId = metadata.businessId || DEFAULT_BUSINESS_ID;
  const id = metadata.id;
  const moduleName = metadata.module || metadata.category || "documents";
  const category = metadata.category || metadata.module || "documents";
  const originalFilename = String(metadata.originalFilename || "unnamed_file").slice(0, 255);
  const storedFilename = String(metadata.storedFilename || `${id}.bin`).slice(0, 255);
  const storageDriver = metadata.storageDriver || "local";
  const storageKey = String(metadata.storageKey || "").slice(0, 500);
  const mimeType = String(metadata.mimeType || "application/octet-stream").slice(0, 100);
  const sizeBytes = Number(metadata.sizeBytes || 0);
  const sha256Hash = String(metadata.sha256Hash || "").slice(0, 64);

  await conn.execute(
    `INSERT INTO business_files (
      id, business_id, module, category, original_filename, stored_filename,
      storage_driver, storage_key, mime_type, size_bytes, sha256_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      module = VALUES(module),
      category = VALUES(category),
      original_filename = VALUES(original_filename),
      stored_filename = VALUES(stored_filename),
      storage_driver = VALUES(storage_driver),
      storage_key = VALUES(storage_key),
      mime_type = VALUES(mime_type),
      size_bytes = VALUES(size_bytes),
      sha256_hash = VALUES(sha256_hash),
      is_deleted = 0,
      updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      businessId,
      moduleName,
      category,
      originalFilename,
      storedFilename,
      storageDriver,
      storageKey,
      mimeType,
      sizeBytes,
      sha256Hash,
    ]
  );

  return {
    id,
    businessId,
    module: moduleName,
    category,
    originalFilename,
    storedFilename,
    storageDriver,
    storageKey,
    mimeType,
    sizeBytes,
    sha256Hash,
  };
}

/**
 * Retrieves file metadata by file ID with strict business scoping.
 *
 * @param {string} id File UUID
 * @param {string} [businessId] Required business ID for tenant scoping (unless system bypass opted in)
 * @param {Object} [options]
 * @param {boolean} [options.allowAnyBusiness=false] Explicit system-only opt-in for internal maintenance
 * @returns {Promise<Object|null>} Metadata or null if not found
 */
export async function getFileMetadataById(id, businessId, { allowAnyBusiness = false } = {}) {
  if (!businessId && !allowAnyBusiness) {
    throw new Error("Business ID is required for file metadata lookup.");
  }

  let query = "SELECT * FROM business_files WHERE id = ? AND is_deleted = 0";
  const params = [id];

  if (businessId) {
    const validBiz = validateBusinessId(businessId);
    query += " AND business_id = ?";
    params.push(validBiz);
  }

  query += " LIMIT 1";

  const [rows] = await pool.query(query, params);
  return rows && rows.length ? rows[0] : null;
}

/**
 * Retrieves file metadata by storage key with strict business scoping.
 *
 * @param {string} storageKey Relative POSIX storage key
 * @param {string} [businessId] Required business ID for tenant scoping (unless system bypass opted in)
 * @param {Object} [options]
 * @param {boolean} [options.allowAnyBusiness=false] Explicit system-only opt-in for internal maintenance
 * @returns {Promise<Object|null>}
 */
export async function getFileMetadataByKey(storageKey, businessId, { allowAnyBusiness = false } = {}) {
  if (!businessId && !allowAnyBusiness) {
    throw new Error("Business ID is required for file metadata lookup.");
  }

  let query = "SELECT * FROM business_files WHERE storage_key = ? AND is_deleted = 0";
  const params = [storageKey];

  if (businessId) {
    const validBiz = validateBusinessId(businessId);
    query += " AND business_id = ?";
    params.push(validBiz);
  }

  query += " LIMIT 1";

  const [rows] = await pool.query(query, params);
  return rows && rows.length ? rows[0] : null;
}

/**
 * Lists files belonging to a business with optional filtering.
 *
 * @param {string} businessId Required business ID
 * @param {Object} [options]
 * @param {string} [options.module] Filter by module
 * @param {string} [options.category] Filter by category
 * @param {number} [options.limit=50] Limit
 * @param {number} [options.offset=0] Offset
 * @returns {Promise<Array<Object>>}
 */
export async function listFilesByBusiness(businessId, { module, category, limit = 50, offset = 0 } = {}) {
  if (!businessId) {
    throw new Error("Business ID is required for listing files.");
  }
  const validBiz = validateBusinessId(businessId);
  const conditions = ["business_id = ?", "is_deleted = 0"];
  const params = [validBiz];

  if (module) {
    conditions.push("module = ?");
    params.push(module);
  }

  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }

  const sql = `SELECT * FROM business_files WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit) || 50, Number(offset) || 0);

  const [rows] = await pool.query(sql, params);
  return rows || [];
}

/**
 * Soft-deletes a file metadata record with strict business scoping.
 *
 * @param {string} id File UUID
 * @param {string} businessId Required business ID
 * @returns {Promise<boolean>}
 */
export async function markFileDeleted(id, businessId) {
  if (!businessId) {
    throw new Error("Business ID is required to mark file deleted.");
  }
  const validBiz = validateBusinessId(businessId);
  const [result] = await pool.execute(
    "UPDATE business_files SET is_deleted = 1 WHERE id = ? AND business_id = ?",
    [id, validBiz]
  );
  return result.affectedRows > 0;
}

/**
 * Hard-deletes a file metadata record from MySQL with strict business scoping.
 *
 * @param {string} id File UUID
 * @param {string} businessId Required business ID
 * @returns {Promise<boolean>}
 */
export async function deleteFileMetadata(id, businessId) {
  if (!businessId) {
    throw new Error("Business ID is required for file metadata deletion.");
  }
  const validBiz = validateBusinessId(businessId);
  const [result] = await pool.execute(
    "DELETE FROM business_files WHERE id = ? AND business_id = ?",
    [id, validBiz]
  );
  return result.affectedRows > 0;
}
