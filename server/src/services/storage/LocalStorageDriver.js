/**
 * Local Filesystem Storage Driver
 *
 * Implements driver interface for saving, reading, streaming, and deleting
 * files on the local filesystem (Windows development and Linux VPS production):
 * - Strict business directory isolation: `<storageRoot>/businesses/<businessId>/<category>/<storedFilename>`.
 * - POSIX-compliant relative storage keys: `businesses/<businessId>/<category>/<storedFilename>`.
 * - Path traversal defense at every step.
 * - Atomic metadata calculation (size, SHA-256, true MIME).
 */

import fs from "node:fs";
import path from "node:path";
import {
  validateBusinessId,
  validateCategory,
  validateFileContent,
  resolveSafePath,
  computeSha256,
  generateStoredFilename,
  validateStorageKeyBelongsToBusiness,
} from "./storageValidation.js";
import { DEFAULT_BUSINESS_ID, DEFAULT_MAX_FILE_SIZE } from "../../config/storageConfig.js";

export class LocalStorageDriver {
  /**
   * @param {string} rootDirectory Absolute root directory for storage
   */
  constructor(rootDirectory) {
    if (!rootDirectory || typeof rootDirectory !== "string") {
      throw new Error("LocalStorageDriver requires a valid rootDirectory path.");
    }
    this.root = path.resolve(rootDirectory);
    this.driverName = "local";
  }

  /**
   * Saves a file buffer to the isolated business directory.
   *
   * @param {Object} params
   * @param {string} [params.businessId] Business context (defaults to DEFAULT_BUSINESS_ID: 'demo-business')
   * @param {string} params.category Category/module name (e.g. 'company-profile', 'items')
   * @param {Buffer} params.fileBuffer File binary buffer
   * @param {string} params.originalFilename Original name of uploaded file
   * @param {string} [params.mimeType] Declared MIME type
   * @param {number} [params.maxSizeBytes] Optional max file size
   * @param {string} [params.fileId] Optional custom file ID (e.g. for deterministic migration)
   * @returns {Promise<Object>} File metadata object
   */
  async save({
    businessId = DEFAULT_BUSINESS_ID,
    category,
    fileBuffer,
    originalFilename = "unnamed_file",
    mimeType = "",
    maxSizeBytes = DEFAULT_MAX_FILE_SIZE,
    fileId = null,
  }) {
    const validBiz = validateBusinessId(businessId);
    const validCat = validateCategory(category);
    const { mimeType: validatedMime, ext, sizeBytes } = validateFileContent(fileBuffer, mimeType, maxSizeBytes);

    let storedFilename;
    let fileUuid;
    if (fileId) {
      if (typeof fileId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(fileId) || fileId.includes("..")) {
        throw new Error(`Invalid custom fileId: "${fileId}". Must contain only alphanumeric characters, hyphens, or underscores (max 64 chars).`);
      }
      fileUuid = fileId;
      const cleanExt = ext ? (ext.startsWith(".") ? ext.slice(1) : ext).toLowerCase() : "bin";
      storedFilename = `${fileId}.${cleanExt}`;
    } else {
      storedFilename = generateStoredFilename(ext);
      fileUuid = storedFilename.split(".")[0];
    }

    // Target folder: <root>/businesses/<businessId>/<category>/
    const targetDirRelative = path.join("businesses", validBiz, validCat);
    const targetDirAbsolute = resolveSafePath(this.root, targetDirRelative);

    // Target file absolute path
    const targetFileAbsolute = resolveSafePath(targetDirAbsolute, storedFilename);

    // Ensure target directory exists
    await fs.promises.mkdir(targetDirAbsolute, { recursive: true });

    // Write file to disk
    await fs.promises.writeFile(targetFileAbsolute, fileBuffer);

    // Calculate SHA-256 checksum
    const sha256Hash = computeSha256(fileBuffer);

    // Always store POSIX relative path with forward slashes
    const storageKey = `businesses/${validBiz}/${validCat}/${storedFilename}`;

    const cleanOriginalName = path.basename(String(originalFilename || "file").slice(0, 255));

    return {
      id: fileUuid,
      businessId: validBiz,
      module: validCat,
      category: validCat,
      originalFilename: cleanOriginalName,
      storedFilename,
      storageDriver: this.driverName,
      storageKey,
      mimeType: validatedMime,
      sizeBytes,
      sha256Hash,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Reads a file buffer from disk given its storage key.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @returns {Promise<Buffer>}
   */
  async read(storageKey) {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    try {
      return await fs.promises.readFile(absolutePath);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new Error(`File not found: "${storageKey}" does not exist in storage.`);
      }
      throw err;
    }
  }

  /**
   * Creates a readable stream for high-performance streaming.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @param {Object} [options] fs.createReadStream options
   * @returns {fs.ReadStream}
   */
  createReadStream(storageKey, options = {}) {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    return fs.createReadStream(absolutePath, options);
  }

  /**
   * Checks if a file exists on disk.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @returns {Promise<boolean>}
   */
  async exists(storageKey) {
    try {
      const absolutePath = this.resolveAbsolutePath(storageKey);
      await fs.promises.access(absolutePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns filesystem stats for a stored file.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @returns {Promise<{ size: number, mtime: Date, birthtime: Date }>}
   */
  async getStats(storageKey) {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    try {
      const stats = await fs.promises.stat(absolutePath);
      return {
        size: stats.size,
        mtime: stats.mtime,
        birthtime: stats.birthtime,
      };
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new Error(`File not found: "${storageKey}" does not exist in storage.`);
      }
      throw err;
    }
  }

  /**
   * Deletes a stored file from disk with strict business scoping.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @param {string} businessId Business context requesting deletion
   * @returns {Promise<boolean>} True if file was deleted, false if file did not exist
   */
  async delete(storageKey, businessId) {
    if (!businessId || typeof businessId !== "string") {
      throw new Error("Business ID is required for file deletion.");
    }
    validateStorageKeyBelongsToBusiness(storageKey, businessId, this.root);
    const absolutePath = this.resolveAbsolutePath(storageKey);
    try {
      await fs.promises.unlink(absolutePath);
      return true;
    } catch (err) {
      if (err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
  }

  /**
   * Resolves the storage key to an absolute path within this.root, guaranteeing no path traversal.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @returns {string} Absolute validated filesystem path
   */
  resolveAbsolutePath(storageKey) {
    if (!storageKey || typeof storageKey !== "string") {
      throw new Error("A valid storageKey string is required.");
    }
    // Normalize forward/back slashes
    const normalizedRelative = storageKey.split("/").join(path.sep);
    return resolveSafePath(this.root, normalizedRelative);
  }

  /**
   * Returns a standard relative POSIX storage key.
   *
   * @param {string} businessId
   * @param {string} category
   * @param {string} storedFilename
   * @returns {string}
   */
  resolveStorageKey(businessId, category, storedFilename) {
    const validBiz = validateBusinessId(businessId);
    const validCat = validateCategory(category);
    const cleanFilename = path.basename(storedFilename);
    return `businesses/${validBiz}/${validCat}/${cleanFilename}`;
  }
}
