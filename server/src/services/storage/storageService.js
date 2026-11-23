/**
 * Centralized Storage Service
 *
 * Facade providing unified file storage operations across USV:
 * - Driver-agnostic interface (defaults to LocalStorageDriver).
 * - Multi-tenant isolation with 'demo-business' as active development context.
 * - Prevents exposing absolute filesystem paths to frontend / API consumers.
 */

import { getStorageDriverName, getStorageLocalRoot, DEFAULT_BUSINESS_ID } from "../../config/storageConfig.js";
import { LocalStorageDriver } from "./LocalStorageDriver.js";
import { saveFileMetadata } from "../../db/businessFilesRepository.js";

export class StorageService {
  /**
   * @param {Object} [options]
   * @param {string} [options.driverName] Driver name ('local')
   * @param {string} [options.localRoot] Root directory for local storage
   */
  constructor({ driverName, localRoot } = {}) {
    this.driverName = driverName || getStorageDriverName();
    this.localRoot = localRoot || getStorageLocalRoot();

    if (this.driverName === "local") {
      this.driver = new LocalStorageDriver(this.localRoot);
    } else {
      // Fallback or extensible to cloud drivers
      this.driver = new LocalStorageDriver(this.localRoot);
    }
  }

  /**
   * Saves a file buffer to storage under the given business context and category.
   *
   * @param {Object} params
   * @param {string} [params.businessId] Business context (defaults to 'demo-business')
   * @param {string} params.category Category/module (e.g. 'company-profile', 'items')
   * @param {Buffer} params.fileBuffer File binary buffer
   * @param {string} params.originalFilename Original filename
   * @param {string} [params.mimeType] Declared MIME type
   * @param {number} [params.maxSizeBytes] Optional max file size in bytes
   * @returns {Promise<Object>} Metadata object containing storageKey, size, hash, etc.
   */
  async saveFile(params) {
    const businessId = params.businessId || DEFAULT_BUSINESS_ID;
    return await this.driver.save({ ...params, businessId });
  }

  /**
   * Reads a file buffer from storage by storage key.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @returns {Promise<Buffer>}
   */
  async readFile(storageKey) {
    return await this.driver.read(storageKey);
  }

  /**
   * Returns a readable stream for high-performance HTTP responses.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @param {Object} [options]
   * @returns {import("node:fs").ReadStream}
   */
  createReadStream(storageKey, options) {
    return this.driver.createReadStream(storageKey, options);
  }

  /**
   * Checks if a file exists in storage.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @returns {Promise<boolean>}
   */
  async fileExists(storageKey) {
    return await this.driver.exists(storageKey);
  }

  /**
   * Retrieves filesystem stats (size, timestamps).
   *
   * @param {string} storageKey Relative POSIX storage key
   * @returns {Promise<{ size: number, mtime: Date, birthtime: Date }>}
   */
  async getFileStats(storageKey) {
    return await this.driver.getStats(storageKey);
  }

  /**
   * Coordinated operation: saves physical file to disk first, then saves its metadata in MySQL.
   * If MySQL metadata insert fails, immediately rolls back and cleans up the newly written physical file.
   * Preserves and re-throws the original database error. If cleanup also fails, reports both errors clearly.
   *
   * @param {Object} params File save parameters
   * @param {import("mysql2/promise").Connection} [connection] Optional transaction connection
   * @returns {Promise<Object>} Persisted metadata object
   */
  async saveFileAndMetadata(params, connection = null) {
    const businessId = params.businessId || DEFAULT_BUSINESS_ID;
    const fileResult = await this.saveFile({ ...params, businessId });

    try {
      const metadata = await saveFileMetadata(fileResult, connection);
      return metadata;
    } catch (dbErr) {
      // Coordinated rollback: Clean up newly created physical file
      let cleanupErr = null;
      try {
        await this.driver.delete(fileResult.storageKey, fileResult.businessId);
      } catch (err) {
        cleanupErr = err;
        console.error(
          `[StorageService] Failed to clean up orphan physical file "${fileResult.storageKey}" after DB metadata insert failure:`,
          err
        );
      }

      if (cleanupErr) {
        const compositeError = new Error(
          `Database metadata insert failed: "${dbErr.message}". Physical file cleanup also failed: "${cleanupErr.message}". Storage key: ${fileResult.storageKey}`
        );
        compositeError.dbError = dbErr;
        compositeError.cleanupError = cleanupErr;
        compositeError.storageKey = fileResult.storageKey;
        throw compositeError;
      }

      // Re-throw original database error
      throw dbErr;
    }
  }

  /**
   * Deletes a file from storage with strict business scoping.
   *
   * @param {string} storageKey Relative POSIX storage key
   * @param {string} businessId Business context requesting deletion
   * @returns {Promise<boolean>}
   */
  async deleteFile(storageKey, businessId) {
    if (!businessId || typeof businessId !== "string") {
      throw new Error("Business ID is required for file deletion.");
    }
    return await this.driver.delete(storageKey, businessId);
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
    return this.driver.resolveStorageKey(businessId, category, storedFilename);
  }

  /**
   * Returns active storage driver name.
   */
  getDriverName() {
    return this.driverName;
  }

  /**
   * Returns configured storage root path.
   */
  getStorageRoot() {
    return this.localRoot;
  }
}

// Singleton storage service instance for the application
export const storageService = new StorageService();
export default storageService;
