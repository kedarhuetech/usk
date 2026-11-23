/**
 * Cloudinary Storage Driver
 *
 * Implements cloud storage driver interface using the official Cloudinary Node.js SDK:
 * - Centralized asset storage shared across multiple development PCs and VPS environments.
 * - Multi-tenant isolation: `${rootFolder}/${businessId}/${category}/${fileId}`.
 * - Supports public assets (e.g. logos, product images) and authenticated assets (e.g. sensitive signatures).
 * - Generates secure HTTPS delivery URLs.
 * - Enforces business-scoped deletion and validation.
 */

import { Readable, PassThrough } from "node:stream";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import {
  cloudinary,
  isCloudinaryConfigured,
  resolveCloudinaryFolder,
  rootFolder,
} from "../../config/cloudinaryConfig.js";
import {
  validateBusinessId,
  validateCategory,
  validateFileContent,
  computeSha256,
  generateStoredFilename,
} from "./storageValidation.js";
import { DEFAULT_BUSINESS_ID, DEFAULT_MAX_FILE_SIZE } from "../../config/storageConfig.js";

export class CloudinaryStorageDriver {
  constructor() {
    this.driverName = "cloudinary";
    this.rootFolder = rootFolder;
  }

  /**
   * Ensures Cloudinary is properly configured before performing operations.
   * @private
   */
  _ensureConfigured() {
    if (!isCloudinaryConfigured()) {
      throw new Error(
        "Cloudinary storage driver is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env."
      );
    }
  }

  /**
   * Saves a file buffer to Cloudinary under the business folder structure.
   *
   * @param {Object} params
   * @param {string} [params.businessId] Business context (defaults to DEFAULT_BUSINESS_ID: 'demo-business')
   * @param {string} params.category Category name (e.g. 'company-profile', 'items', 'invoice-attachments')
   * @param {Buffer} params.fileBuffer File binary buffer
   * @param {string} [params.originalFilename] Original name of uploaded file
   * @param {string} [params.mimeType] Declared MIME type
   * @param {number} [params.maxSizeBytes] Optional max file size
   * @param {string} [params.fileId] Optional custom file ID / public ID
   * @param {boolean} [params.isSensitive=false] Whether asset requires authenticated access (e.g. signatures)
   * @returns {Promise<Object>} File metadata object matching driver contract
   */
  async save({
    businessId = DEFAULT_BUSINESS_ID,
    category,
    fileBuffer,
    originalFilename = "unnamed_file",
    mimeType = "",
    maxSizeBytes = DEFAULT_MAX_FILE_SIZE,
    fileId = null,
    isSensitive = false,
  }) {
    this._ensureConfigured();

    const validBiz = validateBusinessId(businessId);
    const validCat = validateCategory(category);
    const { mimeType: validatedMime, ext, sizeBytes } = validateFileContent(fileBuffer, mimeType, maxSizeBytes);

    let fileUuid;
    if (fileId) {
      if (typeof fileId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(fileId) || fileId.includes("..")) {
        throw new Error(
          `Invalid custom fileId: "${fileId}". Must contain only alphanumeric characters, hyphens, or underscores (max 64 chars).`
        );
      }
      fileUuid = fileId;
    } else {
      const generated = generateStoredFilename(ext);
      fileUuid = generated.split(".")[0];
    }

    const cleanExt = ext ? (ext.startsWith(".") ? ext.slice(1) : ext).toLowerCase() : "bin";
    const folder = resolveCloudinaryFolder(validBiz, validCat);
    const publicId = fileUuid;

    // Determine sensitivity: company signatures require authenticated delivery
    const sensitive = Boolean(
      isSensitive ||
      (validCat === "company-profile" && originalFilename.toLowerCase().includes("signature"))
    );

    const uploadType = sensitive ? "authenticated" : "upload";

    // Upload buffer to Cloudinary via upload_stream
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: "auto",
          type: uploadType,
          overwrite: true,
          tags: [validBiz, validCat, "usv_storage"],
        },
        (error, result) => {
          if (error) {
            return reject(new Error(`Cloudinary upload failed: ${error.message || JSON.stringify(error)}`));
          }
          resolve(result);
        }
      );
      stream.end(fileBuffer);
    });

    const sha256Hash = computeSha256(fileBuffer);
    const cleanOriginalName = path.basename(String(originalFilename || "file").slice(0, 255));

    // For authenticated assets, generate signed delivery URL
    let deliveryUrl = uploadResult.secure_url;
    if (sensitive) {
      deliveryUrl = cloudinary.url(uploadResult.public_id, {
        type: "authenticated",
        sign_url: true,
        secure: true,
      });
    }

    return {
      id: fileUuid,
      businessId: validBiz,
      module: validCat,
      category: validCat,
      originalFilename: cleanOriginalName,
      storedFilename: `${fileUuid}.${cleanExt}`,
      storageDriver: "cloudinary",
      storageKey: uploadResult.public_id,
      publicUrl: deliveryUrl,
      cloudinaryPublicId: uploadResult.public_id,
      cloudinaryAssetId: uploadResult.asset_id,
      mimeType: validatedMime,
      sizeBytes: uploadResult.bytes || sizeBytes,
      sha256Hash,
      ext,
      uploadType,
      isSensitive: sensitive,
    };
  }

  /**
   * Generates secure delivery URL for a Cloudinary storage key / public ID.
   *
   * @param {string} storageKey Cloudinary public ID
   * @param {Object} [options]
   * @param {boolean} [options.isSensitive=false]
   * @returns {string}
   */
  getSecureUrl(storageKey, { isSensitive = false, resourceType = "image" } = {}) {
    this._ensureConfigured();
    if (isSensitive) {
      return cloudinary.url(storageKey, {
        type: "authenticated",
        sign_url: true,
        secure: true,
        resource_type: resourceType,
      });
    }
    return cloudinary.url(storageKey, {
      secure: true,
      resource_type: resourceType,
    });
  }

  /**
   * Reads file buffer from Cloudinary by storage key / public ID.
   *
   * @param {string} storageKey Cloudinary public ID
   * @returns {Promise<Buffer>}
   */
  async read(storageKey) {
    this._ensureConfigured();
    const url = this.getSecureUrl(storageKey);

    return new Promise((resolve, reject) => {
      const getWithRedirect = (targetUrl, depth = 0) => {
        if (depth > 3) return reject(new Error("Too many redirects"));
        const client = targetUrl.startsWith("https://") ? https : http;
        client.get(targetUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return getWithRedirect(res.headers.location, depth + 1);
          }
          if (res.statusCode >= 400) {
            return reject(new Error(`Failed to read asset from Cloudinary: HTTP ${res.statusCode}`));
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        }).on("error", reject);
      };
      getWithRedirect(url);
    });
  }

  /**
   * Returns a readable stream for high-performance HTTP responses.
   *
   * @param {string} storageKey Cloudinary public ID
   * @param {Object} [options]
   * @returns {import("node:stream").Readable}
   */
  createReadStream(storageKey, options = {}) {
    this._ensureConfigured();
    const url = this.getSecureUrl(storageKey, options);
    const passThrough = new PassThrough();

    const streamWithRedirect = (targetUrl, depth = 0) => {
      if (depth > 3) {
        passThrough.destroy(new Error("Too many redirects"));
        return;
      }
      const client = targetUrl.startsWith("https://") ? https : http;
      client.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return streamWithRedirect(res.headers.location, depth + 1);
        }
        if (res.statusCode >= 400) {
          passThrough.destroy(new Error(`Cloudinary stream error: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(passThrough);
      }).on("error", (err) => {
        passThrough.destroy(err);
      });
    };
    streamWithRedirect(url);

    return passThrough;
  }

  /**
   * Checks if an asset exists in Cloudinary.
   *
   * @param {string} storageKey Cloudinary public ID
   * @returns {Promise<boolean>}
   */
  async exists(storageKey) {
    this._ensureConfigured();
    try {
      await cloudinary.api.resource(storageKey);
      return true;
    } catch (err) {
      if (err.error?.http_code === 404 || err.http_code === 404 || err.message?.includes("404") || err.message?.includes("not found")) {
        return false;
      }
      // Check if it exists as raw or authenticated resource
      try {
        await cloudinary.api.resource(storageKey, { resource_type: "raw" });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Retrieves asset stats (size, timestamps).
   *
   * @param {string} storageKey Cloudinary public ID
   * @returns {Promise<{ size: number, mtime: Date, birthtime: Date }>}
   */
  async getStats(storageKey) {
    this._ensureConfigured();
    const res = await cloudinary.api.resource(storageKey);
    return {
      size: res.bytes || 0,
      mtime: new Date(res.created_at || Date.now()),
      birthtime: new Date(res.created_at || Date.now()),
    };
  }

  /**
   * Deletes an asset from Cloudinary with strict business scoping.
   * Prevents cross-business asset deletion by verifying the key path.
   *
   * @param {string} storageKey Cloudinary public ID
   * @param {string} businessId Business context requesting deletion
   * @returns {Promise<boolean>}
   */
  async delete(storageKey, businessId) {
    this._ensureConfigured();
    const validBiz = validateBusinessId(businessId);

    // Business isolation: verify storageKey belongs to this business
    // Example valid key: usk/demo-business/items/uuid
    const expectedSegment = `/${validBiz}/`;
    if (!storageKey.includes(expectedSegment) && !storageKey.startsWith(`${validBiz}/`)) {
      throw new Error(
        `Security violation: Storage key "${storageKey}" does not belong to business "${validBiz}". Deletion blocked.`
      );
    }

    try {
      const res = await cloudinary.uploader.destroy(storageKey, { invalidate: true });
      return res.result === "ok" || res.result === "not found";
    } catch (err) {
      console.warn(`[CloudinaryStorageDriver] Destroy notice for "${storageKey}":`, err.message);
      return false;
    }
  }

  /**
   * Returns a standard relative Cloudinary storage key / public ID.
   *
   * @param {string} businessId
   * @param {string} category
   * @param {string} storedFilename
   * @returns {string}
   */
  resolveStorageKey(businessId, category, storedFilename) {
    const validBiz = validateBusinessId(businessId);
    const validCat = validateCategory(category);
    const id = storedFilename.split(".")[0];
    return `${this.rootFolder}/${validBiz}/${validCat}/${id}`;
  }
}

export default CloudinaryStorageDriver;
