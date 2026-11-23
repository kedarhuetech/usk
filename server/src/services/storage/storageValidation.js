/**
 * Storage Validation & Security Utilities
 *
 * Implements strict security validations for filesystem storage:
 * - Business ID sanitation (rejects path traversal, null bytes, special characters).
 * - Category / module sanitation.
 * - Deep file-content inspection via magic bytes (prevents extension spoofing).
 * - Safe path resolution preventing directory escapes.
 * - SHA-256 checksum calculation.
 * - Secure UUID-based stored filename generation.
 */

import crypto from "node:crypto";
import path from "node:path";
import { ALLOWED_FILE_TYPES, DEFAULT_MAX_FILE_SIZE } from "../../config/storageConfig.js";

// Business ID pattern: letters, numbers, hyphens, underscores (1 to 64 chars)
const BUSINESS_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

// Category pattern: letters, numbers, hyphens, underscores (1 to 32 chars)
const CATEGORY_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

/**
 * Validates and sanitizes a business identifier.
 * Ensures the business context adheres to strict naming and prevents traversal.
 *
 * @param {string} businessId
 * @returns {string} Sanitized business ID
 */
export function validateBusinessId(businessId) {
  if (!businessId || typeof businessId !== "string") {
    throw new Error("Invalid business ID: A non-empty string is required.");
  }

  const trimmed = businessId.trim();

  // Reject local-development to align with mysql.js businessIdFromRequest security policy
  if (trimmed === "local-development") {
    throw new Error("Access denied: 'local-development' is not permitted. Active business is demo-business.");
  }

  if (!BUSINESS_ID_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid business ID format: "${businessId}". Business IDs must contain only letters, numbers, hyphens, or underscores (max 64 chars).`
    );
  }

  // Explicit check against traversal sequences
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
    throw new Error("Security violation: Traversal characters detected in business ID.");
  }

  return trimmed;
}

/**
 * Validates and sanitizes a storage category / module name.
 *
 * @param {string} category
 * @returns {string} Sanitized category
 */
export function validateCategory(category) {
  if (!category || typeof category !== "string") {
    throw new Error("Invalid storage category: A non-empty string is required.");
  }

  const trimmed = category.trim().toLowerCase();

  if (!CATEGORY_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid category format: "${category}". Categories must contain only letters, numbers, hyphens, or underscores (max 32 chars).`
    );
  }

  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
    throw new Error("Security violation: Traversal characters detected in category name.");
  }

  return trimmed;
}

/**
 * Inspects a file buffer's magic bytes to detect true MIME type and extension.
 *
 * @param {Buffer} buffer
 * @returns {{ mimeType: string, ext: string } | null}
 */
export function detectMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", ext: ".jpg" };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: "image/png", ext: ".png" };
  }

  // 3. GIF: 'GIF87a' or 'GIF89a' (47 49 46 38)
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { mimeType: "image/gif", ext: ".gif" };
  }

  // 4. WEBP: 'RIFF' .... 'WEBP'
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", ext: ".webp" };
  }

  // 5. PDF: '%PDF' (25 50 44 46)
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return { mimeType: "application/pdf", ext: ".pdf" };
  }

  // 6. ZIP / Compressed Archives: 'PK\x03\x04' (50 4B 03 04)
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return { mimeType: "application/zip", ext: ".zip" };
  }

  // 7. SVG: Text starting with <?xml or <svg (within first 1024 bytes)
  const headerSample = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf8").trim().toLowerCase();
  if (headerSample.startsWith("<svg") || (headerSample.startsWith("<?xml") && headerSample.includes("<svg"))) {
    return { mimeType: "image/svg+xml", ext: ".svg" };
  }

  // 8. JSON: Valid text starting with '{' or '[' (within first 128 bytes)
  const jsonSample = buffer.subarray(0, Math.min(buffer.length, 128)).toString("utf8").trim();
  if (jsonSample.startsWith("{") || jsonSample.startsWith("[")) {
    try {
      JSON.parse(buffer.toString("utf8"));
      return { mimeType: "application/json", ext: ".json" };
    } catch {}
  }

  return null;
}

/**
 * Validates file buffer, size, and content consistency.
 * Rejects empty buffers and zero-byte files immediately before any disk operation.
 *
 * @param {Buffer} buffer
 * @param {string} [declaredMimeType]
 * @param {number} [maxSizeBytes]
 * @returns {{ valid: boolean, mimeType: string, ext: string, sizeBytes: number }}
 */
export function validateFileContent(buffer, declaredMimeType = "", maxSizeBytes = DEFAULT_MAX_FILE_SIZE) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("File content error: Buffer is empty or zero-byte. Empty files are not permitted.");
  }

  if (buffer.length > maxSizeBytes) {
    throw new Error(`File size limit exceeded: Maximum allowed size is ${maxSizeBytes} bytes, received ${buffer.length} bytes.`);
  }

  const cleanDeclared = String(declaredMimeType || "").trim().toLowerCase();
  const detected = detectMagicBytes(buffer);

  if (!detected) {
    if (cleanDeclared === "application/octet-stream" || cleanDeclared === "binary/octet-stream") {
      return {
        valid: true,
        mimeType: "application/octet-stream",
        ext: ".bin",
        sizeBytes: buffer.length,
      };
    }
    throw new Error("Unsupported or unrecognized file format. Only JPG, PNG, WEBP, GIF, SVG, and PDF are supported.");
  }

  if (!ALLOWED_FILE_TYPES[detected.mimeType]) {
    throw new Error(`Forbidden file format: ${detected.mimeType} is not an allowed file type.`);
  }

  // If a declared MIME type was provided, verify consistency (allowing generic fallbacks)
  if (
    cleanDeclared &&
    cleanDeclared !== "application/octet-stream" &&
    cleanDeclared !== "binary/octet-stream" &&
    cleanDeclared !== detected.mimeType
  ) {
    // Tolerant check for jpeg variants (image/jpg vs image/jpeg)
    const isJpegVariant =
      (cleanDeclared === "image/jpg" && detected.mimeType === "image/jpeg") ||
      (cleanDeclared === "image/jpeg" && detected.mimeType === "image/jpg");

    if (!isJpegVariant) {
      throw new Error(
        `File type mismatch: Declared type "${declaredMimeType}" does not match true file signature "${detected.mimeType}".`
      );
    }
  }

  return {
    valid: true,
    mimeType: detected.mimeType,
    ext: detected.ext,
    sizeBytes: buffer.length,
  };
}

/**
 * Safely resolves a relative path within a base directory, guaranteeing no path traversal.
 *
 * @param {string} baseDir Absolute base directory
 * @param {string} relativePath Relative path to resolve
 * @returns {string} Absolute normalized safe path
 */
export function resolveSafePath(baseDir, relativePath) {
  if (!baseDir || typeof baseDir !== "string") {
    throw new Error("Base directory is required for safe path resolution.");
  }
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Relative path is required for safe path resolution.");
  }

  const normalizedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(normalizedBase, relativePath);

  // Ensure target path is strictly inside or equal to normalizedBase
  // Appending path.sep prevents prefix collisions (e.g. /var/storage-evil vs /var/storage)
  if (
    resolvedTarget !== normalizedBase &&
    !resolvedTarget.startsWith(normalizedBase + path.sep)
  ) {
    throw new Error(`Security violation: Path traversal detected. "${relativePath}" escapes root boundary.`);
  }

  return resolvedTarget;
}

/**
 * Calculates SHA-256 hash of a buffer.
 *
 * @param {Buffer} buffer
 * @returns {string} Hexadecimal SHA-256 checksum
 */
export function computeSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generates a unique physical filename using crypto UUID and clean extension.
 * Never trusts the user-supplied filename on disk.
 *
 * @param {string} ext Extension (e.g. '.jpg' or 'jpg')
 * @returns {string} Unique physical filename (e.g. '3f8e12ac-....jpg')
 */
export function generateStoredFilename(ext = "") {
  const cleanExt = ext ? (ext.startsWith(".") ? ext.slice(1) : ext).toLowerCase() : "bin";
  return `${crypto.randomUUID()}.${cleanExt}`;
}

/**
 * Validates that a storage key is well-formed, non-traversing, and belongs strictly
 * to the specified business tenant.
 *
 * @param {string} storageKey Relative POSIX storage key (e.g. 'businesses/demo-business/category/file.png')
 * @param {string} businessId Business context
 * @param {string} [rootDir] Optional absolute storage root directory for boundary verification
 * @returns {string} Normalized POSIX storage key
 */
export function validateStorageKeyBelongsToBusiness(storageKey, businessId, rootDir = "") {
  if (!businessId || typeof businessId !== "string") {
    throw new Error("Business ID is required for storage key verification.");
  }
  const validBiz = validateBusinessId(businessId);

  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("A valid storage key string is required.");
  }

  const rawKey = storageKey.trim();
  if (!rawKey) {
    throw new Error("Storage key cannot be empty.");
  }

  // Reject traversal sequences or null bytes immediately
  if (rawKey.includes("\0") || rawKey.includes("..")) {
    throw new Error(`Security violation: Malformed storage key with traversal characters: "${storageKey}"`);
  }

  // Normalize slashes to POSIX
  const posixKey = rawKey.split("\\").join("/");

  // Must match the expected prefix structure: businesses/<businessId>/...
  const expectedPrefix = `businesses/${validBiz}/`;
  if (!posixKey.startsWith(expectedPrefix)) {
    // Check if it belongs to another business or is completely invalid
    if (posixKey.startsWith("businesses/")) {
      const parts = posixKey.split("/");
      const targetBiz = parts[1];
      throw new Error(
        `Security violation: Cross-business access denied. Storage key belongs to "${targetBiz}", but caller context is "${validBiz}".`
      );
    }
    throw new Error(
      `Security violation: Invalid storage key structure. Key "${storageKey}" must start with "${expectedPrefix}".`
    );
  }

  // Ensure root boundary verification if rootDir is provided
  if (rootDir) {
    const normalizedRoot = path.resolve(rootDir);
    const expectedBizDir = path.resolve(normalizedRoot, "businesses", validBiz);
    const relativePart = posixKey.split("/").join(path.sep);
    const resolvedPath = resolveSafePath(normalizedRoot, relativePart);

    if (resolvedPath !== expectedBizDir && !resolvedPath.startsWith(expectedBizDir + path.sep)) {
      throw new Error(`Security violation: Storage key escapes business directory boundary: "${storageKey}"`);
    }
  }

  return posixKey;
}

