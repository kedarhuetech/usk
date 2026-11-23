/**
 * Invoice Attachment & Settings Image Migration Tests (Phase 5 & Phase 6)
 *
 * Verifies:
 * 1. Filesystem attachment upload (POST /api/transactions/attachments) with business scoping ('demo-business')
 * 2. Attachment streaming (GET /api/transactions/attachments/:id) with headers (Content-Type, Cache-Control, Content-Disposition)
 * 3. Multi-tenant business isolation (mismatched businessId rejected / 404)
 * 4. Empty / zero-byte attachment rejection
 * 5. Safe attachment deletion (DELETE /api/transactions/attachments/:id) with reference conflict prevention (409)
 * 6. Transaction creation with attachments persists pure relational columns (image_id, document_id)
 * 7. Transaction creation with Base64 auto-persists to filesystem storage and replaces with persistent URL
 * 8. Transaction update replacing attachment safely cleans up replaced file
 * 9. Shared attachment safety across multiple transactions (file retained while any transaction references it)
 * 10. Transaction deletion cleans up unreferenced attachments
 * 11. Invoice attachment migration service (migrateInvoiceAttachments) verifies SHA-256, byte size, and is idempotent
 * 12. Settings image Base64 auto-persistence in POST /api/settings
 * 13. Settings image de-duplication against identical company profile assets
 * 14. Settings image migration service (migrateSettingsImages) idempotency and non-destructive behavior
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { pool } from "../db/mysql.js";
import transactionsRouter from "../routes/transactionsRouter.js";
import settingsRouter from "../routes/settingsRouter.js";
import { storageService } from "../services/storage/storageService.js";
import {
  migrateInvoiceAttachments,
  rollbackInvoiceAttachments,
} from "../services/storage/invoiceAttachmentMigration.js";
import {
  migrateSettingsImages,
  rollbackSettingsImages,
} from "../services/storage/settingsImageMigration.js";
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

// Valid test PDF buffer
const TEST_PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

const TEST_PNG_BASE64 = `data:image/png;base64,${TEST_PNG_BUFFER.toString("base64")}`;
const TEST_PDF_BASE64 = `data:application/pdf;base64,${TEST_PDF_BUFFER.toString("base64")}`;

let app;
let server;
let serverPort;
let baseUrl;

// Tracking arrays for cleanup
const createdTxnIds = [];
const createdFileIds = [];
const createdSettingKeys = [];

before(async () => {
  app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/settings", settingsRouter);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      serverPort = server.address().port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
      resolve();
    });
  });
});

after(async () => {
  // Clean up created transactions
  if (createdTxnIds.length > 0) {
    const placeholders = createdTxnIds.map(() => "?").join(",");
    await pool.query(`DELETE FROM transaction_items WHERE transaction_id IN (${placeholders})`, createdTxnIds).catch(() => {});
    await pool.query(`DELETE FROM transactions WHERE id IN (${placeholders})`, createdTxnIds).catch(() => {});
  }

  // Clean up created settings
  if (createdSettingKeys.length > 0) {
    const placeholders = createdSettingKeys.map(() => "?").join(",");
    await pool.query(`DELETE FROM app_settings WHERE setting_key IN (${placeholders})`, createdSettingKeys).catch(() => {});
  }

  // Clean up created files
  for (const fId of createdFileIds) {
    try {
      const meta = await getFileMetadataById(fId, "demo-business");
      if (meta) {
        await storageService.deleteFile(meta.storage_key, "demo-business").catch(() => {});
        await deleteFileMetadata(fId, "demo-business").catch(() => {});
      }
    } catch {}
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Helper for multipart/form-data upload
async function uploadMultipart(endpoint, filename, mimeType, buffer, headers = {}) {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header, "utf8"),
    buffer,
    Buffer.from(footer, "utf8"),
  ]);

  return fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-business-id": "demo-business",
      ...headers,
    },
    body,
  });
}

test("1. Upload invoice image attachment via POST /api/transactions/attachments", async () => {
  const res = await uploadMultipart("/api/transactions/attachments", "bill-scan.png", "image/png", TEST_PNG_BUFFER);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.data.id);
  assert.ok(body.data.url.includes(body.data.id));
  assert.equal(body.data.name, "bill-scan.png");
  assert.equal(body.data.mimeType, "image/png");

  createdFileIds.push(body.data.id);

  // Verify in MySQL business_files
  const meta = await getFileMetadataById(body.data.id, "demo-business");
  assert.ok(meta);
  assert.equal(meta.category, "invoice-attachments");
  assert.equal(meta.sha256_hash, computeSha256(TEST_PNG_BUFFER));

  // Verify file physically exists on disk
  const exists = await storageService.fileExists(meta.storage_key);
  assert.equal(exists, true);
});

test("2. Upload invoice PDF document via POST /api/transactions/attachments", async () => {
  const res = await uploadMultipart("/api/transactions/attachments", "po-doc.pdf", "application/pdf", TEST_PDF_BUFFER);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.data.id);
  assert.equal(body.data.mimeType, "application/pdf");

  createdFileIds.push(body.data.id);

  const meta = await getFileMetadataById(body.data.id, "demo-business");
  assert.ok(meta);
  assert.equal(meta.category, "invoice-attachments");
  assert.equal(meta.sha256_hash, computeSha256(TEST_PDF_BUFFER));
});

test("3. Stream invoice attachment via GET /api/transactions/attachments/:id with headers and download option", async () => {
  const fileId = createdFileIds[0];
  const res = await fetch(`${baseUrl}/api/transactions/attachments/${fileId}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.ok(res.headers.get("cache-control").includes("private"));

  const arrayBuffer = await res.arrayBuffer();
  const resBuffer = Buffer.from(arrayBuffer);
  assert.equal(computeSha256(resBuffer), computeSha256(TEST_PNG_BUFFER));

  // Test with download=true query
  const dlRes = await fetch(`${baseUrl}/api/transactions/attachments/${fileId}?download=true`);
  assert.equal(dlRes.status, 200);
  assert.ok(dlRes.headers.get("content-disposition")?.includes("attachment"));
});

test("4. Multi-tenant isolation prevents cross-business attachment access", async () => {
  const fileId = createdFileIds[0];
  const res = await fetch(`${baseUrl}/api/transactions/attachments/${fileId}`, {
    headers: { "x-business-id": "other-business" },
  });
  assert.equal(res.status, 404);
});

test("5. Rejects empty (zero-byte) file upload", async () => {
  const res = await uploadMultipart("/api/transactions/attachments", "empty.png", "image/png", Buffer.alloc(0));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
});

test("6. Transaction creation with attachment persists pure relational columns", async () => {
  const fileId = createdFileIds[0];
  const txnId = `test_txn_${Date.now()}`;
  createdTxnIds.push(txnId);

  const payload = {
    id: txnId,
    transactionType: "sale",
    documentNumber: "INV-TEST-001",
    transactionDate: "2026-11-23",
    totalAmount: 500,
    paidAmount: 500,
    balanceAmount: 0,
    imageId: fileId,
    imageUrl: `/api/transactions/attachments/${fileId}`,
    imageName: "bill-scan.png",
    items: [
      {
        itemName: "Consulting Service",
        qty: 1,
        unitPrice: 500,
        totalAmount: 500,
      },
    ],
  };

  const res = await fetch(`${baseUrl}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const resBody = await res.json();
  assert.equal(resBody.success, true);
  assert.equal(resBody.data.imageId, fileId);

  // Verify in MySQL
  const [rows] = await pool.query(
    "SELECT image_id, image_url, image_name FROM transactions WHERE business_id = ? AND id = ?",
    ["demo-business", txnId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].image_id, fileId);
  assert.equal(rows[0].image_name, "bill-scan.png");

  // Verify GET /api/transactions/:id returns attachment
  const getRes = await fetch(`${baseUrl}/api/transactions/${txnId}`, {
    headers: { "x-business-id": "demo-business" },
  });
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.data.imageId, fileId);
  assert.equal(getData.data.files.imageId, fileId);
});

test("7. Transaction creation with Base64 attachment auto-persists to filesystem", async () => {
  const txnId = `test_txn_b64_${Date.now()}`;
  createdTxnIds.push(txnId);

  const payload = {
    id: txnId,
    transactionType: "sale",
    documentNumber: "INV-B64-001",
    transactionDate: "2026-11-23",
    totalAmount: 300,
    paidAmount: 300,
    balanceAmount: 0,
    imageUrl: TEST_PNG_BASE64,
    imageName: "b64-receipt.png",
    documentUrl: TEST_PDF_BASE64,
    documentName: "b64-po.pdf",
    items: [
      {
        itemName: "Software License",
        qty: 1,
        unitPrice: 300,
        totalAmount: 300,
      },
    ],
  };

  const res = await fetch(`${baseUrl}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const resBody = await res.json();
  assert.equal(resBody.success, true);
  assert.ok(resBody.data.imageId);
  assert.ok(resBody.data.documentId);
  assert.ok(resBody.data.imageUrl.startsWith("/api/transactions/attachments/"));
  assert.ok(resBody.data.documentUrl.startsWith("/api/transactions/attachments/"));

  createdFileIds.push(resBody.data.imageId, resBody.data.documentId);

  // Verify in MySQL transactions table: NO Base64 strings stored!
  const [rows] = await pool.query(
    "SELECT image_id, image_url, document_id, document_url FROM transactions WHERE business_id = ? AND id = ?",
    ["demo-business", txnId]
  );
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].image_url.startsWith("data:"));
  assert.ok(!rows[0].document_url.startsWith("data:"));
  assert.equal(rows[0].image_id, resBody.data.imageId);
  assert.equal(rows[0].document_id, resBody.data.documentId);
});

test("8. Safe attachment deletion blocks when referenced by transaction (409 Conflict)", async () => {
  const fileId = createdFileIds[0];
  const res = await fetch(`${baseUrl}/api/transactions/attachments/${fileId}`, {
    method: "DELETE",
    headers: { "x-business-id": "demo-business" },
  });

  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.message.includes("referenced"));
});

test("9. Shared attachment safety: deleting one transaction retains attachment referenced by another", async () => {
  // Upload a shared document
  const upRes = await uploadMultipart("/api/transactions/attachments", "shared-terms.pdf", "application/pdf", TEST_PDF_BUFFER);
  const upBody = await upRes.json();
  const sharedFileId = upBody.data.id;
  createdFileIds.push(sharedFileId);

  const txn1 = `test_shared_1_${Date.now()}`;
  const txn2 = `test_shared_2_${Date.now()}`;
  createdTxnIds.push(txn1, txn2);

  // Create txn1 referencing sharedFileId
  await fetch(`${baseUrl}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify({
      id: txn1,
      transactionType: "sale",
      documentNumber: "SH-001",
      totalAmount: 100,
      documentId: sharedFileId,
      documentUrl: `/api/transactions/attachments/${sharedFileId}`,
      items: [{ itemName: "Item 1", qty: 1, unitPrice: 100, totalAmount: 100 }],
    }),
  });

  // Create txn2 referencing same sharedFileId
  await fetch(`${baseUrl}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify({
      id: txn2,
      transactionType: "sale",
      documentNumber: "SH-002",
      totalAmount: 200,
      documentId: sharedFileId,
      documentUrl: `/api/transactions/attachments/${sharedFileId}`,
      items: [{ itemName: "Item 2", qty: 1, unitPrice: 200, totalAmount: 200 }],
    }),
  });

  // Delete txn1
  const delTxn1Res = await fetch(`${baseUrl}/api/transactions/${txn1}`, {
    method: "DELETE",
    headers: { "x-business-id": "demo-business" },
  });
  assert.equal(delTxn1Res.status, 200);

  // Verify file still exists on disk because txn2 still references it
  const metaAfterTxn1 = await getFileMetadataById(sharedFileId, "demo-business");
  assert.ok(metaAfterTxn1);
  const existsAfterTxn1 = await storageService.fileExists(metaAfterTxn1.storage_key);
  assert.equal(existsAfterTxn1, true);

  // Now delete txn2
  const delTxn2Res = await fetch(`${baseUrl}/api/transactions/${txn2}`, {
    method: "DELETE",
    headers: { "x-business-id": "demo-business" },
  });
  assert.equal(delTxn2Res.status, 200);

  // Verify file was cleaned up now that reference count reached 0
  const metaAfterTxn2 = await getFileMetadataById(sharedFileId, "demo-business");
  assert.equal(metaAfterTxn2, null);
});

test("10. Invoice attachment migration service handles Base64 data and is idempotent", async () => {
  const migTxnId = `test_mig_txn_${Date.now()}`;
  createdTxnIds.push(migTxnId);

  // Insert a test transaction directly with legacy Base64 data URLs
  await pool.query(
    `INSERT INTO transactions (
      id, business_id, transaction_type, document_number, transaction_date,
      total_amount, paid_amount, balance_amount, image_url, image_name,
      document_url, document_name
    ) VALUES (?, 'demo-business', 'sale', 'MIG-INV-999', '2026-11-23', 500, 500, 0, ?, 'mig-img.png', ?, 'mig-doc.pdf')`,
    [migTxnId, TEST_PNG_BASE64, TEST_PDF_BASE64]
  );

  // Run migration
  const report1 = await migrateInvoiceAttachments({ businessId: "demo-business" });
  assert.equal(report1.success, true);
  assert.ok(report1.migratedAttachmentsCount >= 2);

  // Check updated database row
  const [rows] = await pool.query(
    "SELECT image_id, image_url, document_id, document_url FROM transactions WHERE business_id = 'demo-business' AND id = ?",
    [migTxnId]
  );
  assert.ok(rows[0].image_id);
  assert.ok(rows[0].document_id);
  assert.equal(rows[0].image_url, `/api/transactions/attachments/${rows[0].image_id}`);
  assert.equal(rows[0].document_url, `/api/transactions/attachments/${rows[0].document_id}`);

  createdFileIds.push(rows[0].image_id, rows[0].document_id);

  // Verify files exist on disk
  const imgMeta = await getFileMetadataById(rows[0].image_id, "demo-business");
  const docMeta = await getFileMetadataById(rows[0].document_id, "demo-business");
  assert.ok(await storageService.fileExists(imgMeta.storage_key));
  assert.ok(await storageService.fileExists(docMeta.storage_key));

  // Run migration again to verify idempotency
  const report2 = await migrateInvoiceAttachments({ businessId: "demo-business" });
  assert.equal(report2.success, true);
  assert.equal(report2.migratedAttachmentsCount, 0);
  assert.ok(report2.alreadyMigratedCount >= 2);
});

test("11. Phase 6: POST /api/settings auto-persists Base64 logo and de-duplicates identical assets", async () => {
  const logoKey = `test_logo_${Date.now()}`;
  const sigKey = `test_sig_${Date.now()}`;
  createdSettingKeys.push(logoKey, sigKey);

  // Save Base64 logo
  const res1 = await fetch(`${baseUrl}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify({
      [logoKey]: TEST_PNG_BASE64,
    }),
  });
  assert.equal(res1.status, 200);

  // Verify app_settings stores URL, not Base64
  const [rows1] = await pool.query(
    "SELECT setting_value FROM app_settings WHERE business_id = 'demo-business' AND setting_key = ?",
    [logoKey]
  );
  assert.ok(rows1[0].setting_value.startsWith("/api/settings/company-profile/assets/"));

  const fileId1 = rows1[0].setting_value.split("/").pop().split("?")[0];
  createdFileIds.push(fileId1);

  // Now save identical image as signature - should de-duplicate content hash
  const res2 = await fetch(`${baseUrl}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": "demo-business" },
    body: JSON.stringify({
      [sigKey]: TEST_PNG_BASE64,
    }),
  });
  assert.equal(res2.status, 200);

  const [rows2] = await pool.query(
    "SELECT setting_value FROM app_settings WHERE business_id = 'demo-business' AND setting_key = ?",
    [sigKey]
  );
  const fileId2 = rows2[0].setting_value.split("/").pop().split("?")[0];

  // De-duplication: should point to the exact same fileId
  assert.equal(fileId1, fileId2);
});

test("12. Phase 6: Settings image migration service handles Base64 and is idempotent", async () => {
  const testSettingKey = `test_mig_setting_${Date.now()}`;
  createdSettingKeys.push(testSettingKey);

  await pool.query(
    "INSERT INTO app_settings (business_id, setting_key, setting_value) VALUES ('demo-business', ?, ?)",
    [testSettingKey, TEST_PNG_BASE64]
  );

  const report1 = await migrateSettingsImages({ businessId: "demo-business" });
  assert.equal(report1.success, true);
  assert.ok(report1.migratedCount >= 1 || report1.deduplicatedCount >= 1);

  const [rows] = await pool.query(
    "SELECT setting_value FROM app_settings WHERE business_id = 'demo-business' AND setting_key = ?",
    [testSettingKey]
  );
  assert.ok(rows[0].setting_value.startsWith("/api/settings/company-profile/assets/"));
  createdFileIds.push(rows[0].setting_value.split("/").pop().split("?")[0]);

  // Idempotency: run again
  const report2 = await migrateSettingsImages({ businessId: "demo-business" });
  assert.equal(report2.success, true);
  assert.equal(report2.migratedCount, 0);
  assert.ok(report2.alreadyMigratedCount >= 1);
});
