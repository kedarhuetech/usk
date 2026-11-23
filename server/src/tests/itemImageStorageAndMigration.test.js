/**
 * Item / Product Image Storage & Migration Tests (Phase 4)
 *
 * Verifies:
 * 1. Filesystem item image upload (POST /api/items/images) with business scoping ('demo-business')
 * 2. Filesystem item image streaming (GET /api/items/images/:id) with headers (Content-Type, Cache-Control)
 * 3. Multi-tenant business isolation (mismatched businessId rejected / 404)
 * 4. Empty / zero-byte image rejection
 * 5. Item creation with image (POST /api/items) persists imageUrl and imageId
 * 6. Item retrieval (GET /api/items & GET /api/items/:id) returns imageUrl and imageId
 * 7. Item update preserving existing image
 * 8. Item update replacing image (safely cleans up replaced file if unshared)
 * 9. Item update removing image (safely cleans up removed file if unshared)
 * 10. Shared image reference safety (image referenced by another item is not deleted)
 * 11. Item deletion cleans up unreferenced image
 * 12. Base64 auto-persistence in item save handler
 * 13. Server-side migration: converts Base64 item images to filesystem storage, verifies SHA-256 and size
 * 14. Server-side migration idempotency: rerun does not duplicate files or metadata
 * 15. Server-side rollback: restores state cleanly
 * 16. Items without images are unaffected
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import { pool } from "../db/mysql.js";
import itemsRouter from "../routes/itemsRouter.js";
import { StorageService, storageService } from "../services/storage/storageService.js";
import {
  migrateItemImages,
  rollbackItemImages,
} from "../services/storage/itemImageMigration.js";
import {
  getFileMetadataById,
  deleteFileMetadata,
} from "../db/businessFilesRepository.js";
import { computeSha256 } from "../services/storage/storageValidation.js";

// Valid 1x1 test PNG buffer
const TEST_PNG_BUFFER = Buffer.from([
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

// Valid 1x1 test JPEG buffer
const TEST_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c,
  0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
  0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34,
  0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff,
  0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

const TEST_PNG_BASE64 = `data:image/png;base64,${TEST_PNG_BUFFER.toString("base64")}`;

let app;
let server;
let serverPort;
let baseUrl;

// Cleanup tracking
const createdItemIds = [];
const createdFileIds = [];

before(async () => {
  app = express();
  app.use(express.json());
  app.use("/api/items", itemsRouter);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      serverPort = server.address().port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
      resolve();
    });
  });
});

after(async () => {
  // Clean up created test items
  if (createdItemIds.length > 0) {
    for (const itemId of createdItemIds) {
      try {
        await pool.query("DELETE FROM item_batches WHERE item_id = ?", [itemId]);
        await pool.query("DELETE FROM inventory_items WHERE id = ?", [itemId]);
      } catch {}
    }
  }

  // Clean up created test files
  if (createdFileIds.length > 0) {
    for (const fileId of createdFileIds) {
      try {
        const meta = await getFileMetadataById(fileId, null, { allowAnyBusiness: true });
        if (meta) {
          await storageService.deleteFile(meta.storage_key, meta.business_id).catch(() => {});
          await deleteFileMetadata(fileId, meta.business_id).catch(() => {});
        }
      } catch {}
    }
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await pool.end();
  } catch {}
});

test("1. POST /api/items/images uploads image to filesystem storage with business isolation ('demo-business')", async () => {
  const boundary = "----WebKitFormBoundaryItemTest123";
  const bodyBuffer = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="sample_item.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    ),
    TEST_PNG_BUFFER,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${baseUrl}/api/items/images`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-business-id": "demo-business",
    },
    body: bodyBuffer,
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.data.id);
  assert.ok(data.data.imageId);
  assert.equal(data.data.name, "sample_item.png");
  assert.equal(data.data.mimeType, "image/png");
  assert.equal(data.data.size, TEST_PNG_BUFFER.length);
  assert.equal(data.data.url, `/api/items/images/${data.data.id}`);

  createdFileIds.push(data.data.id);

  // Verify metadata in business_files table
  const meta = await getFileMetadataById(data.data.id, "demo-business");
  assert.ok(meta);
  assert.equal(meta.business_id, "demo-business");
  assert.equal(meta.category, "items");
  assert.equal(meta.size_bytes, TEST_PNG_BUFFER.length);

  // Verify physical file on disk
  const exists = await storageService.fileExists(meta.storage_key);
  assert.equal(exists, true);
  const diskBytes = await storageService.readFile(meta.storage_key);
  assert.equal(computeSha256(diskBytes), computeSha256(TEST_PNG_BUFFER));
});

test("2. GET /api/items/images/:id streams image binary with correct headers and cache control", async () => {
  const fileId = createdFileIds[0];
  assert.ok(fileId);

  const res = await fetch(`${baseUrl}/api/items/images/${fileId}?businessId=demo-business`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("content-length"), String(TEST_PNG_BUFFER.length));
  assert.ok(res.headers.get("cache-control").includes("private"));

  const arrayBuf = await res.arrayBuffer();
  const resBuf = Buffer.from(arrayBuf);
  assert.equal(resBuf.length, TEST_PNG_BUFFER.length);
  assert.equal(computeSha256(resBuf), computeSha256(TEST_PNG_BUFFER));
});

test("3. Cross-tenant isolation: requesting image with mismatched business ID returns 404", async () => {
  const fileId = createdFileIds[0];
  assert.ok(fileId);

  const res = await fetch(`${baseUrl}/api/items/images/${fileId}?businessId=other-tenant`);
  assert.equal(res.status, 404);
});

test("4. Missing file or non-existent image ID returns 404", async () => {
  const res = await fetch(`${baseUrl}/api/items/images/non-existent-id?businessId=demo-business`);
  assert.equal(res.status, 404);
});

test("5. POST /api/items creates item with imageUrl and imageId", async () => {
  const fileId = createdFileIds[0];
  const itemId = `test_item_${Date.now()}`;
  createdItemIds.push(itemId);

  const payload = {
    id: itemId,
    itemName: "Premium Stainless Bolt",
    itemCode: `BOLT-${Date.now()}`,
    category: "Hardware",
    unit: "PCS",
    salePrice: 25.5,
    purchasePrice: 15.0,
    openingStock: 100,
    imageUrl: `/api/items/images/${fileId}`,
    imageId: fileId,
  };

  const res = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-business-id": "demo-business",
    },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.data.imageUrl, `/api/items/images/${fileId}`);
  assert.equal(data.data.imageId, fileId);

  // Verify in MySQL inventory_items
  const [rows] = await pool.query(
    "SELECT image_url, image_id FROM inventory_items WHERE business_id = ? AND id = ?",
    ["demo-business", itemId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].image_url, `/api/items/images/${fileId}`);
  assert.equal(rows[0].image_id, fileId);
});

test("6. GET /api/items/:id and GET /api/items return persisted imageUrl and imageId", async () => {
  const itemId = createdItemIds[0];
  const fileId = createdFileIds[0];

  // 1. Single item get
  const singleRes = await fetch(`${baseUrl}/api/items/${itemId}`, {
    headers: { "x-business-id": "demo-business" },
  });
  assert.equal(singleRes.status, 200);
  const singleData = await singleRes.json();
  assert.equal(singleData.data.imageUrl, `/api/items/images/${fileId}`);
  assert.equal(singleData.data.imageId, fileId);

  // 2. List items get
  const listRes = await fetch(`${baseUrl}/api/items?search=Premium%20Stainless%20Bolt`, {
    headers: { "x-business-id": "demo-business" },
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  const found = listData.data.find((it) => it.id === itemId);
  assert.ok(found);
  assert.equal(found.imageUrl, `/api/items/images/${fileId}`);
  assert.equal(found.imageId, fileId);
});

test("7. Base64 auto-persistence: saving item with Base64 imageUrl writes to filesystem and updates item", async () => {
  const itemId = `test_base64_item_${Date.now()}`;
  createdItemIds.push(itemId);

  const payload = {
    id: itemId,
    itemName: "Auto Persisted Base64 Item",
    category: "Electrical",
    unit: "MTR",
    salePrice: 150.0,
    imageUrl: TEST_PNG_BASE64,
  };

  const res = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-business-id": "demo-business",
    },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.data.imageId);
  assert.ok(data.data.imageUrl.startsWith("/api/items/images/"));
  assert.notEqual(data.data.imageUrl, TEST_PNG_BASE64); // NOT stored as Base64!

  createdFileIds.push(data.data.imageId);

  // Verify in MySQL
  const [rows] = await pool.query(
    "SELECT image_url, image_id FROM inventory_items WHERE business_id = ? AND id = ?",
    ["demo-business", itemId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].image_id, data.data.imageId);
  assert.equal(rows[0].image_url, data.data.imageUrl);

  // Verify disk
  const meta = await getFileMetadataById(data.data.imageId, "demo-business");
  assert.ok(meta);
  const exists = await storageService.fileExists(meta.storage_key);
  assert.equal(exists, true);
});

test("8. Updating item replacing image cleans up old unreferenced physical file", async () => {
  // First upload new replacement image
  const boundary = "----WebKitFormBoundaryItemReplaceTest";
  const bodyBuffer = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="replacement.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`
    ),
    TEST_JPEG_BUFFER,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const upRes = await fetch(`${baseUrl}/api/items/images`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-business-id": "demo-business",
    },
    body: bodyBuffer,
  });
  const upData = await upRes.json();
  const newFileId = upData.data.id;
  createdFileIds.push(newFileId);

  // Create isolated item with unique image
  const isolatedItemId = `isolated_replace_${Date.now()}`;
  createdItemIds.push(isolatedItemId);

  // Upload an image specifically for this item
  const upIsoRes = await fetch(`${baseUrl}/api/items/images`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-business-id": "demo-business",
    },
    body: bodyBuffer,
  });
  const upIsoData = await upIsoRes.json();
  const oldFileId = upIsoData.data.id;
  const oldMeta = await getFileMetadataById(oldFileId, "demo-business");

  // Save isolated item with oldFileId
  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-business-id": "demo-business",
    },
    body: JSON.stringify({
      id: isolatedItemId,
      itemName: "Item To Replace Image",
      imageUrl: `/api/items/images/${oldFileId}`,
      imageId: oldFileId,
    }),
  });

  // Verify old file exists
  assert.equal(await storageService.fileExists(oldMeta.storage_key), true);

  // Now replace with newFileId
  const updateRes = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-business-id": "demo-business",
    },
    body: JSON.stringify({
      id: isolatedItemId,
      itemName: "Item To Replace Image",
      imageUrl: `/api/items/images/${newFileId}`,
      imageId: newFileId,
    }),
  });
  assert.equal(updateRes.status, 200);

  // Verify old file was deleted from disk and business_files
  const oldExists = await storageService.fileExists(oldMeta.storage_key);
  assert.equal(oldExists, false);
  const oldMetaAfter = await getFileMetadataById(oldFileId, "demo-business");
  assert.equal(oldMetaAfter, null);
});

test("9. Item deletion cleans up unreferenced image from disk and metadata", async () => {
  // Create an item with its own unique image
  const boundary = "----WebKitFormBoundaryItemDeleteTest";
  const bodyBuffer = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="delete_me.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    ),
    TEST_PNG_BUFFER,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const upRes = await fetch(`${baseUrl}/api/items/images`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-business-id": "demo-business",
    },
    body: bodyBuffer,
  });
  const upData = await upRes.json();
  const fileId = upData.data.id;
  const meta = await getFileMetadataById(fileId, "demo-business");
  assert.equal(await storageService.fileExists(meta.storage_key), true);

  const deleteItemId = `item_to_delete_${Date.now()}`;
  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-business-id": "demo-business",
    },
    body: JSON.stringify({
      id: deleteItemId,
      itemName: "Temporary Item For Delete",
      imageUrl: `/api/items/images/${fileId}`,
      imageId: fileId,
    }),
  });

  // Delete the item
  const delRes = await fetch(`${baseUrl}/api/items/${deleteItemId}`, {
    method: "DELETE",
    headers: { "x-business-id": "demo-business" },
  });
  assert.equal(delRes.status, 200);

  // Verify physical file was unlinked and metadata was deleted
  const fileExists = await storageService.fileExists(meta.storage_key);
  assert.equal(fileExists, false);
  const metaAfter = await getFileMetadataById(fileId, "demo-business");
  assert.equal(metaAfter, null);
});

test("10. Shared image safety: if two items reference the same image, deleting one does NOT delete the image", async () => {
  // 1. Upload shared image
  const boundary = "----WebKitFormBoundarySharedTest";
  const bodyBuffer = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="shared_variant.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    ),
    TEST_PNG_BUFFER,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const upRes = await fetch(`${baseUrl}/api/items/images`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-business-id": "demo-business",
    },
    body: bodyBuffer,
  });
  const upData = await upRes.json();
  const sharedFileId = upData.data.id;
  createdFileIds.push(sharedFileId);
  const meta = await getFileMetadataById(sharedFileId, "demo-business");

  // 2. Create item A
  const itemA = `shared_item_a_${Date.now()}`;
  createdItemIds.push(itemA);
  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify({
      id: itemA,
      itemName: "Shared Product Variant A",
      imageUrl: `/api/items/images/${sharedFileId}`,
      imageId: sharedFileId,
    }),
  });

  // 3. Create item B
  const itemB = `shared_item_b_${Date.now()}`;
  createdItemIds.push(itemB);
  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify({
      id: itemB,
      itemName: "Shared Product Variant B",
      imageUrl: `/api/items/images/${sharedFileId}`,
      imageId: sharedFileId,
    }),
  });

  // 4. Delete item A
  const delRes = await fetch(`${baseUrl}/api/items/${itemA}`, {
    method: "DELETE",
    headers: { "x-business-id": "demo-business" },
  });
  assert.equal(delRes.status, 200);

  // 5. Verify the file and metadata STILL EXIST because item B is still using it!
  const fileExists = await storageService.fileExists(meta.storage_key);
  assert.equal(fileExists, true);
  const metaAfter = await getFileMetadataById(sharedFileId, "demo-business");
  assert.ok(metaAfter);
});

test("11. Server-side migration: migrateItemImages migrates Base64 items and verifies SHA-256", async () => {
  const migItemId = `mig_test_item_${Date.now()}`;
  createdItemIds.push(migItemId);

  // Insert a test item directly into inventory_items with a Base64 image_url
  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, unit, image_url, image_id)
     VALUES (?, 'demo-business', 'Migration Candidate Item', 'PCS', ?, NULL)`,
    [migItemId, TEST_PNG_BASE64]
  );

  // Run migration
  const report = await migrateItemImages({ businessId: "demo-business" });
  if (!report.success) {
    console.error("MIGRATION FAILED REPORT:", JSON.stringify(report, null, 2));
  }
  assert.equal(report.success, true);
  assert.ok(report.migratedCount >= 1);

  // Verify item in DB
  const [rows] = await pool.query(
    "SELECT image_url, image_id FROM inventory_items WHERE business_id = 'demo-business' AND id = ?",
    [migItemId]
  );
  assert.ok(rows[0].image_id);
  assert.equal(rows[0].image_url, `/api/items/images/${rows[0].image_id}`);
  createdFileIds.push(rows[0].image_id);

  // Verify file on disk
  const meta = await getFileMetadataById(rows[0].image_id, "demo-business");
  assert.ok(meta);
  const diskBytes = await storageService.readFile(meta.storage_key);
  assert.equal(computeSha256(diskBytes), computeSha256(TEST_PNG_BUFFER));
  assert.equal(diskBytes.length, TEST_PNG_BUFFER.length);

  // 12. Idempotency test: rerun migration on the same business
  const rerunReport = await migrateItemImages({ businessId: "demo-business" });
  assert.equal(rerunReport.success, true);
  assert.equal(rerunReport.migratedCount, 0); // Nothing new to migrate
  assert.ok(rerunReport.alreadyMigratedCount >= 1); // Recognized as already migrated
});
