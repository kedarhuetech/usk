/**
 * Centralized Storage Service
 *
 * Facade providing unified file storage operations across USV:
 * - Multi-provider architecture: Supports both Local Filesystem and Cloudinary.
 * - Multi-tenant isolation with 'demo-business' as active development context.
 * - Prevents exposing absolute filesystem paths to frontend / API consumers.
 * - Seamless cross-PC compatibility: When Cloudinary is active, assets are stored centrally in the cloud.
 */

import { getStorageDriverName, getStorageLocalRoot, DEFAULT_BUSINESS_ID } from "../../config/storageConfig.js";
import { isCloudinaryConfigured, rootFolder } from "../../config/cloudinaryConfig.js";
import { LocalStorageDriver } from "./LocalStorageDriver.js";
import { CloudinaryStorageDriver } from "./CloudinaryStorageDriver.js";
import { saveFileMetadata } from "../../db/businessFilesRepository.js";

export class StorageService {
  /**
   * @param {Object} [options]
   * @param {string} [options.driverName] Driver name ('local' | 'cloudinary')
   * @param {string} [options.localRoot] Root directory for local storage
   */
  constructor({ driverName, localRoot } = {}) {
    this.driverName = driverName || getStorageDriverName();
    this.localRoot = localRoot || getStorageLocalRoot();

    this.localDriver = new LocalStorageDriver(this.localRoot);
    this.cloudinaryDriver = new CloudinaryStorageDriver();

    // Default primary driver
    if (this.driverName === "cloudinary" && isCloudinaryConfigured()) {
      this.driver = this.cloudinaryDriver;
    } else {
      this.driver = this.localDriver;
    }
  }

  /**
   * Resolves the appropriate driver for a given storage key or explicit driver name.
   * Auto-detects Cloudinary storage keys (starts with rootFolder + '/' e.g. 'usk/').
   *
   * @param {string} [storageKey]
   * @param {string} [explicitDriver]
   * @returns {LocalStorageDriver|CloudinaryStorageDriver}
   */
  getDriverForStorageKey(storageKey, explicitDriver = null) {
    if (explicitDriver === "cloudinary") return this.cloudinaryDriver;
    if (explicitDriver === "local") return this.localDriver;

    if (storageKey && typeof storageKey === "string") {
      if (storageKey.startsWith(rootFolder + "/") || storageKey.startsWith("usk/")) {
        return this.cloudinaryDriver;
      }
    }
    return this.localDriver;
  }

  /**
   * Checks if a storage key belongs to Cloudinary.
   * @param {string} storageKey
   * @returns {boolean}
   */
  isCloudinaryKey(storageKey) {
    if (!storageKey || typeof storageKey !== "string") return false;
    return storageKey.startsWith(rootFolder + "/") || storageKey.startsWith("usk/");
  }

  /**
   * Saves a file buffer to storage under the given business context and category.
   * Supports explicit driver override via `params.driver` ('cloudinary' | 'local').
   *
   * @param {Object} params
   * @param {string} [params.businessId] Business context (defaults to 'demo-business')
   * @param {string} params.category Category/module (e.g. 'company-profile', 'items')
   * @param {Buffer} params.fileBuffer File binary buffer
   * @param {string} params.originalFilename Original filename
   * @param {string} [params.mimeType] Declared MIME type
   * @param {number} [params.maxSizeBytes] Optional max file size in bytes
   * @param {string} [params.driver] Optional driver override ('cloudinary' | 'local')
   * @param {boolean} [params.isSensitive] Whether asset is sensitive
   * @returns {Promise<Object>} Metadata object containing storageKey, size, hash, etc.
   */
  async saveFile(params) {
    const businessId = params.businessId || DEFAULT_BUSINESS_ID;
    const targetDriverName = params.driver || this.driverName;

    if (targetDriverName === "cloudinary" && isCloudinaryConfigured()) {
      return await this.cloudinaryDriver.save({ ...params, businessId });
    }
    return await this.localDriver.save({ ...params, businessId });
  }

  /**
   * Reads a file buffer from storage by storage key.
   *
   * @param {string} storageKey Storage key
   * @returns {Promise<Buffer>}
   */
  async readFile(storageKey) {
    return await this.getDriverForStorageKey(storageKey).read(storageKey);
  }

  /**
   * Returns a readable stream for high-performance HTTP responses.
   *
   * @param {string} storageKey Storage key
   * @param {Object} [options]
   * @returns {import("node:stream").Readable}
   */
  createReadStream(storageKey, options = {}) {
    return this.getDriverForStorageKey(storageKey).createReadStream(storageKey, options);
  }

  /**
   * Checks if a file exists in storage.
   *
   * @param {string} storageKey Storage key
   * @returns {Promise<boolean>}
   */
  async fileExists(storageKey) {
    return await this.getDriverForStorageKey(storageKey).exists(storageKey);
  }

  /**
   * Retrieves asset stats (size, timestamps).
   *
   * @param {string} storageKey Storage key
   * @returns {Promise<{ size: number, mtime: Date, birthtime: Date }>}
   */
  async getFileStats(storageKey) {
    return await this.getDriverForStorageKey(storageKey).getStats(storageKey);
  }

  /**
   * Generates secure delivery URL for Cloudinary assets.
   * Returns null if key is local filesystem based.
   *
   * @param {string} storageKey
   * @param {Object} [options]
   * @returns {string|null}
   */
  getSecureUrl(storageKey, options = {}) {
    if (this.isCloudinaryKey(storageKey) && isCloudinaryConfigured()) {
      return this.cloudinaryDriver.getSecureUrl(storageKey, options);
    }
    return null;
  }

  /**
   * Coordinated operation: saves physical/cloud file first, then saves its metadata in MySQL.
   * If MySQL metadata insert fails, immediately rolls back and cleans up the newly written file.
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
      // Coordinated rollback: Clean up newly created file from storage provider
      let cleanupErr = null;
      try {
        await this.deleteFile(fileResult.storageKey, fileResult.businessId);
      } catch (err) {
        cleanupErr = err;
        console.error(
          `[StorageService] Failed to clean up orphan file "${fileResult.storageKey}" after DB metadata insert failure:`,
          err
        );
      }

      if (cleanupErr) {
        const compositeError = new Error(
          `Database metadata insert failed: "${dbErr.message}". Physical file cleanup also failed: "${cleanupErr.message}". Storage file cleanup also failed: "${cleanupErr.message}". Storage key: ${fileResult.storageKey}`
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
   * @param {string} storageKey Storage key
   * @param {string} businessId Business context requesting deletion
   * @returns {Promise<boolean>}
   */
  async deleteFile(storageKey, businessId) {
    if (!businessId || typeof businessId !== "string") {
      throw new Error("Business ID is required for file deletion.");
    }
    return await this.getDriverForStorageKey(storageKey).delete(storageKey, businessId);
  }

  /**
   * Returns a standard relative storage key.
   *
   * @param {string} businessId
   * @param {string} category
   * @param {string} storedFilename
   * @param {string} [driver]
   * @returns {string}
   */
  resolveStorageKey(businessId, category, storedFilename, driver = null) {
    const targetDriver = driver || this.driverName;
    if (targetDriver === "cloudinary") {
      return this.cloudinaryDriver.resolveStorageKey(businessId, category, storedFilename);
    }
    return this.localDriver.resolveStorageKey(businessId, category, storedFilename);
  }

  /**
   * Returns active primary storage driver name.
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
