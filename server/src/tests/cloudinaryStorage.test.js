/**
 * Automated Cloudinary Storage Integration Tests
 *
 * Verifies:
 * 1. Cloudinary configuration inspection and credential safety.
 * 2. Multi-provider driver resolution in storageService.
 * 3. Live upload, stream retrieval, byte/hash verification, and cleanup.
 * 4. Verification that migrated assets (Company Logo & Authenticated Signature)
 *    stream successfully from Cloudinary across computers without local filesystem files.
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isCloudinaryConfigured, getSafeCloudinaryConfig } from "../config/cloudinaryConfig.js";
import { storageService } from "../services/storage/storageService.js";
import { CloudinaryStorageDriver } from "../services/storage/CloudinaryStorageDriver.js";

// 1x1 valid test PNG
const SAMPLE_IMAGE_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

test("1. Cloudinary Configuration & Safe Status Inspection", () => {
  assert.equal(isCloudinaryConfigured(), true, "Cloudinary must be configured in server/.env");
  const safe = getSafeCloudinaryConfig();
  assert.equal(safe.configured, true);
  assert.equal(safe.cloudName, "ateplecm");
  assert.equal(safe.folder, "usk");
  assert.ok(safe.apiKeyLength > 0, "API key length must be reported");
  assert.equal(safe.apiSecret, undefined, "API secret must NEVER be exposed in safe config");
});

test("2. Storage Service Driver Selection & Cloudinary Key Auto-Detection", () => {
  const driver = storageService.getDriverForStorageKey("usk/demo-business/items/abc");
  assert.ok(driver instanceof CloudinaryStorageDriver, "Must resolve Cloudinary driver for usk/ keys");

  const localDriver = storageService.getDriverForStorageKey("businesses/demo-business/items/abc");
  assert.equal(localDriver.driverName, "local", "Must resolve Local driver for businesses/ keys");
});

test("3. Live Cloudinary Upload, Streaming Read, Hash Match, and Clean Deletion", async () => {
  const testFileId = `ci-test-${Date.now()}`;
  const originalHash = crypto.createHash("sha256").update(SAMPLE_IMAGE_BUFFER).digest("hex");

  // Save via storageService to Cloudinary
  const result = await storageService.saveFile({
    businessId: "demo-business",
    category: "items",
    fileBuffer: SAMPLE_IMAGE_BUFFER,
    originalFilename: "test-product.png",
    mimeType: "image/png",
    fileId: testFileId,
    driver: "cloudinary",
  });

  assert.equal(result.id, testFileId);
  assert.equal(result.storageDriver, "cloudinary");
  assert.ok(result.storageKey.startsWith("usk/demo-business/items/"));
  assert.ok(result.publicUrl.startsWith("https://res.cloudinary.com/"));
  assert.equal(result.sha256Hash, originalHash);

  // Verify fileExists
  const exists = await storageService.fileExists(result.storageKey);
  assert.equal(exists, true, "Asset must exist in Cloudinary");

  // Read via streaming and verify content integrity
  const readBuffer = await new Promise((resolve, reject) => {
    const stream = storageService.createReadStream(result.storageKey);
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

  const readHash = crypto.createHash("sha256").update(readBuffer).digest("hex");
  assert.equal(readHash, originalHash, "Streamed asset content from Cloudinary must match original SHA-256");

  // Delete test asset
  const deleted = await storageService.deleteFile(result.storageKey, "demo-business");
  assert.equal(deleted, true, "Test asset must be deleted successfully");

  // Verify non-existence
  const afterDeleteExists = await storageService.fileExists(result.storageKey);
  assert.equal(afterDeleteExists, false, "Deleted asset must no longer exist in Cloudinary");
});

test("4. Cross-PC Retrieval: Migrated Company Logo streams directly from Cloudinary", async () => {
  const logoKey = "usk/demo-business/company-profile/4bed7a31-bc32-4483-a9a9-bf31f4c9aed7";

  const exists = await storageService.fileExists(logoKey);
  assert.equal(exists, true, "Migrated logo must exist in Cloudinary");

  const stream = storageService.createReadStream(logoKey);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  assert.ok(buffer.length > 10000, "Must successfully stream logo bytes from Cloudinary");
});

test("5. Cross-PC Retrieval: Migrated Signature streams securely from Cloudinary", async () => {
  const sigKey = "usk/demo-business/company-profile/de4a37e9-34b3-4b55-bb72-68a47ef7aa16";

  const exists = await storageService.fileExists(sigKey);
  assert.equal(exists, true, "Migrated signature must exist in Cloudinary");

  const stream = storageService.createReadStream(sigKey);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  assert.ok(buffer.length > 50000, "Must successfully stream signature bytes from Cloudinary");
});
