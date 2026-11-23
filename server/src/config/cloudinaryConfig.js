/**
 * Cloudinary Backend Configuration
 *
 * Configures the official Cloudinary SDK using backend environment variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * - CLOUDINARY_FOLDER (defaults to 'usk')
 *
 * Security & Isolation:
 * - Backend-only credentials; never exposed to React/Vite or logged.
 * - Enforces secure HTTPS URL delivery.
 * - Handles missing or unconfigured credentials gracefully without crashing the server.
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cloudinaryPkg from "cloudinary";

const { v2: cloudinary } = cloudinaryPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure backend .env is loaded
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
const rootFolder = String(process.env.CLOUDINARY_FOLDER || "usk").trim().replace(/^\/+|\/+$/g, "");

const isConfigured = Boolean(cloudName && apiKey && apiSecret);

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/**
 * Returns true if Cloudinary credentials are fully configured.
 * @returns {boolean}
 */
export function isCloudinaryConfigured() {
  return isConfigured;
}

/**
 * Returns safe Cloudinary configuration status without exposing sensitive secrets.
 * @returns {{ configured: boolean, cloudName: string, folder: string, apiKeyLength: number }}
 */
export function getSafeCloudinaryConfig() {
  return {
    configured: isConfigured,
    cloudName: cloudName || null,
    folder: rootFolder,
    apiKeyLength: apiKey ? apiKey.length : 0,
  };
}

/**
 * Resolves standard Cloudinary folder path for a given business and category.
 * Example: `usk/demo-business/company-profile` or `usk/demo-business/items`
 *
 * @param {string} businessId
 * @param {string} [category]
 * @returns {string}
 */
export function resolveCloudinaryFolder(businessId, category = "") {
  const cleanBiz = String(businessId || "demo-business").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanCat = String(category || "").replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  if (cleanCat) {
    return `${rootFolder}/${cleanBiz}/${cleanCat}`;
  }
  return `${rootFolder}/${cleanBiz}`;
}

export { cloudinary, rootFolder };
export default cloudinary;
