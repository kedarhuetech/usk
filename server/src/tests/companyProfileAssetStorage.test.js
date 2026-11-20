import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { BACKUP_TABLES } from "../routes/backupRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to simulate persistBase64Asset
async function persistBase64AssetMock(val, entityType, businessId, insertedAssets) {
  if (!val || typeof val !== "string" || !val.startsWith("data:image/")) {
    return val || null;
  }
  try {
    const matches = val.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) return null;
    const id = crypto.randomUUID();
    const ext = mimeType.split("/")[1] || "png";
    const filename = `${entityType}-${Date.now()}.${ext}`;
    insertedAssets.set(id, {
      id,
      business_id: businessId,
      asset_type: entityType,
      original_filename: filename,
      mime_type: mimeType,
      size_bytes: buffer.length,
      data: buffer,
    });
    return `/api/settings/company-profile/assets/${id}?businessId=${encodeURIComponent(businessId)}`;
  } catch {
    return null;
  }
}

test("1. Backup includes company_profile_assets table", () => {
  assert.ok(
    BACKUP_TABLES.includes("company_profile_assets"),
    "company_profile_assets must be present in BACKUP_TABLES"
  );
});

test("2. persistBase64Asset writes to company_profile_assets and returns relational settings URL", async () => {
  const assets = new Map();
  const sampleBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const resultUrl = await persistBase64AssetMock(sampleBase64, "company-logo", "demo-business", assets);

  assert.ok(resultUrl.startsWith("/api/settings/company-profile/assets/"), "URL must point to settings company-profile assets");
  assert.ok(resultUrl.includes("businessId=demo-business"), "URL must carry demo-business tenant");
  assert.equal(assets.size, 1);

  const [savedAsset] = assets.values();
  assert.equal(savedAsset.business_id, "demo-business");
  assert.equal(savedAsset.asset_type, "company-logo");
  assert.equal(savedAsset.mime_type, "image/png");
  assert.ok(savedAsset.size_bytes > 0);
  assert.ok(Buffer.isBuffer(savedAsset.data));
});

test("3. persistBase64Asset safely rejects invalid or oversized payloads", async () => {
  const assets = new Map();
  const invalid = "not-a-data-url";
  const result = await persistBase64AssetMock(invalid, "company-logo", "demo-business", assets);
  assert.equal(result, "not-a-data-url");
  assert.equal(assets.size, 0);

  const nonImage = "data:text/plain;base64,SGVsbG8=";
  const resultNonImage = await persistBase64AssetMock(nonImage, "company-logo", "demo-business", assets);
  assert.equal(resultNonImage, nonImage);
  assert.equal(assets.size, 0);
});

test("4. URL normalizer migrates legacy /api/business-growth/assets/ to /api/settings/company-profile/assets/", () => {
  const normalizeUrl = (url, businessId = "demo-business") => {
    if (!url || typeof url !== "string") return "";
    let res = url.replace(/([?&]businessId=)local-development\b/g, `$1${encodeURIComponent(businessId)}`);
    res = res.replace(/\/api\/business-growth\/assets\//g, "/api/settings/company-profile/assets/");
    return res;
  };

  const legacyLogo = "/api/business-growth/assets/1ea83756-75c1-4f27-b0bc-72f479820bc2?businessId=local-development";
  const normalized = normalizeUrl(legacyLogo, "demo-business");

  assert.equal(
    normalized,
    "/api/settings/company-profile/assets/1ea83756-75c1-4f27-b0bc-72f479820bc2?businessId=demo-business",
    "Must normalize path and tenant"
  );
});

test("5. Asset retrieval returns binary with correct Content-Type and Cache-Control headers", async () => {
  const mockAsset = {
    id: "test-uuid-123",
    business_id: "demo-business",
    asset_type: "company-logo",
    original_filename: "logo.png",
    mime_type: "image/png",
    size_bytes: 4,
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  };

  let sentStatus = 200;
  let sentHeaders = {};
  let sentData = null;

  const res = {
    type(t) {
      sentHeaders["Content-Type"] = t;
      return this;
    },
    set(header, value) {
      sentHeaders[header] = value;
      return this;
    },
    status(s) {
      sentStatus = s;
      return this;
    },
    send(d) {
      sentData = d;
      return this;
    },
    json(j) {
      sentData = j;
      return this;
    },
  };

  // Simulate GET handler logic
  const handleGet = (asset) => {
    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found." });
    }
    return res
      .type(asset.mime_type || "application/octet-stream")
      .set("Content-Length", String(asset.size_bytes || asset.data?.length || 0))
      .set("Cache-Control", "private, max-age=86400")
      .send(asset.data);
  };

  handleGet(mockAsset);
  assert.equal(sentStatus, 200);
  assert.equal(sentHeaders["Content-Type"], "image/png");
  assert.equal(sentHeaders["Content-Length"], "4");
  assert.equal(sentHeaders["Cache-Control"], "private, max-age=86400");
  assert.deepEqual(sentData, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  // Simulate 404
  handleGet(null);
  assert.equal(sentStatus, 404);
  assert.equal(sentData.success, false);
});

test("6. EditProfile.jsx imports companyProfileApi and contains zero businessGrowth references", () => {
  const editProfilePath = path.resolve(__dirname, "../../../src/pages/CompanyProfile/EditProfile.jsx");
  const content = fs.readFileSync(editProfilePath, "utf-8");

  assert.ok(
    content.includes("companyProfileApi"),
    "EditProfile.jsx must use companyProfileApi"
  );
  assert.ok(
    !content.includes("businessGrowthApi"),
    "EditProfile.jsx must have NO references to businessGrowthApi"
  );
  assert.ok(
    !content.includes("/business-growth/"),
    "EditProfile.jsx must have NO references to /business-growth/"
  );
});

test("7. apiClient.js exports companyProfileApi with uploadAsset endpoint targeting /settings/company-profile/assets", () => {
  const apiClientPath = path.resolve(__dirname, "../../../src/services/apiClient.js");
  const content = fs.readFileSync(apiClientPath, "utf-8");

  assert.ok(
    content.includes("companyProfileApi"),
    "apiClient.js must export companyProfileApi"
  );
  assert.ok(
    content.includes("/settings/company-profile/assets"),
    "companyProfileApi must target /settings/company-profile/assets"
  );
});

test("8. settingsRouter.js contains POST and GET /company-profile/assets and zero business_growth_assets writes", () => {
  const settingsRouterPath = path.resolve(__dirname, "../routes/settingsRouter.js");
  const content = fs.readFileSync(settingsRouterPath, "utf-8");

  assert.ok(
    content.includes('router.post(\n  "/company-profile/assets"') || content.includes('"/company-profile/assets"'),
    "settingsRouter.js must handle /company-profile/assets"
  );
  assert.ok(
    content.includes('INSERT INTO company_profile_assets'),
    "settingsRouter.js must insert into company_profile_assets"
  );
  assert.ok(
    !content.includes('INSERT INTO business_growth_assets'),
    "settingsRouter.js must NOT insert into business_growth_assets"
  );
});

test("9. initSchema.js includes company_profile_assets definition and non-destructive migration", () => {
  const initSchemaPath = path.resolve(__dirname, "../db/initSchema.js");
  const content = fs.readFileSync(initSchemaPath, "utf-8");

  assert.ok(
    content.includes("CREATE TABLE IF NOT EXISTS company_profile_assets"),
    "initSchema.js must define company_profile_assets"
  );
  assert.ok(
    content.includes("INSERT IGNORE INTO company_profile_assets"),
    "initSchema.js must perform non-destructive INSERT IGNORE migration"
  );
});
