/**
 * Storage Configuration
 *
 * Provides centralized configuration for file storage in USV/Udyog:
 * - Driver selection (local filesystem by default, extensible to cloud drivers like S3/R2).
 * - Root storage directory path resolution for Windows dev and Linux VPS production.
 * - Standard business module / category naming conventions.
 * - Allowed MIME types, extensions, and file size limits.
 *
 * Current active business context: 'demo-business'
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard storage categories / modules
export const STORAGE_CATEGORIES = Object.freeze({
  COMPANY_PROFILE: "company-profile",
  ITEMS: "items",
  TRANSACTIONS: "transactions",
  DOCUMENTS: "documents",
  RECEIPTS: "receipts",
});

// Allowed file types and extensions
export const ALLOWED_FILE_TYPES = Object.freeze({
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/svg+xml": [".svg"],
  "application/pdf": [".pdf"],
});

// Default size limits
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Default active business context
export const DEFAULT_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || "demo-business";

/**
 * Returns the active storage driver name ('local', 's3', etc.)
 */
export function getStorageDriverName() {
  return String(process.env.STORAGE_DRIVER || "local").trim().toLowerCase();
}

/**
 * Resolves the absolute root directory for local file storage.
 * Works uniformly on Windows development and Linux VPS environments.
 * Defaults to `<workspaceRoot>/storage` outside frontend public directories.
 */
export function getStorageLocalRoot() {
  const envRoot = process.env.STORAGE_LOCAL_ROOT;
  if (envRoot && String(envRoot).trim() !== "") {
    return path.resolve(process.cwd(), String(envRoot).trim());
  }
  // Default to <workspaceRoot>/storage
  return path.resolve(__dirname, "../../../storage");
}
