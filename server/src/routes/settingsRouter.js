/**
 * Settings & Company Profile API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - App Settings: Key-Value pairs stored with pure TEXT values.
 * - Company Profile: Stored with pure SQL columns for bank info, contact, address, and legal tax identifiers.
 */

import { Router } from "express";
import crypto from "node:crypto";
import multer from "multer";
import { pool, businessIdFromRequest } from "../db/mysql.js";
import { storageService } from "../services/storage/storageService.js";
import { getFileMetadataById } from "../db/businessFilesRepository.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      done(null, true);
    } else {
      done(new Error("Only JPG, PNG, WEBP, and GIF images are accepted."));
    }
  },
});

/**
 * Safely persists a Base64 data URL into filesystem storage and company_profile_assets
 * without storing binary BLOB in MySQL, and returns the persistent asset reference URL.
 * Automatically de-duplicates identical assets sharing the same content hash.
 */
async function persistBase64Asset(val, entityType, businessId) {
  if (!val || typeof val !== "string" || !val.startsWith("data:image/")) {
    return val || null;
  }
  try {
    const matches = val.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return null;
    const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
    const filename = `${entityType}-${Date.now()}.${ext}`;

    // De-duplication check: if a file with identical SHA-256 hash already exists for this business
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const [existingFiles] = await pool.query(
      `SELECT id, storage_key FROM business_files WHERE business_id = ? AND sha256_hash = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 5`,
      [businessId, sha256]
    );

    let fileId;
    let storageKey;

    for (const file of existingFiles) {
      if (await storageService.fileExists(file.storage_key)) {
        fileId = file.id;
        storageKey = file.storage_key;
        break;
      }
    }

    if (!fileId) {
      // 1. Save to filesystem storage foundation (saves file to disk + business_files metadata)
      const fileResult = await storageService.saveFileAndMetadata({
        businessId,
        category: "company-profile",
        fileBuffer: buffer,
        originalFilename: filename,
        mimeType,
      });
      fileId = fileResult.id;
      storageKey = fileResult.storageKey;
    }

    // 2. Insert or update into company_profile_assets with storage reference and NULL BLOB data
    await pool.execute(
      `INSERT INTO company_profile_assets (id, business_id, asset_type, original_filename, mime_type, size_bytes, storage_key, file_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE
         storage_key = VALUES(storage_key),
         file_id = VALUES(file_id),
         updated_at = CURRENT_TIMESTAMP`,
      [fileId, businessId, entityType, filename, mimeType, buffer.length, storageKey, fileId]
    );

    return `/api/settings/company-profile/assets/${fileId}?businessId=${encodeURIComponent(businessId)}`;
  } catch (err) {
    console.error(`Failed to persist Base64 asset (${entityType}):`, err.message);
    return null;
  }
}

/**
 * GET /api/settings and GET /api/settings/app
 * Retrieves all app settings for active business
 */
const getAppSettings = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT setting_key, setting_value FROM app_settings WHERE business_id = ?`,
      [businessId]
    );

    const settings = {};
    for (const row of rows) {
      try {
        settings[row.setting_key] = typeof row.setting_value === "string" ? JSON.parse(row.setting_value) : row.setting_value;
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    }

    return res.json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.get("/", getAppSettings);
router.get("/app", getAppSettings);

/**
 * POST /api/settings
 * Batch updates settings keys, automatically persisting Base64 images to filesystem storage
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    for (const [key, val] of Object.entries(body)) {
      if (val === undefined) continue;
      let textVal;
      if (typeof val === "string" && val.startsWith("data:image/")) {
        const assetType = key === "companyLogo" ? "company-logo" : (key === "signatureImage" ? "company-signature" : "app-setting");
        const persistedUrl = await persistBase64Asset(val, assetType, businessId);
        textVal = persistedUrl || "";
      } else {
        textVal = JSON.stringify(val);
      }

      await pool.query(
        `INSERT INTO app_settings (business_id, setting_key, setting_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           updated_at = CURRENT_TIMESTAMP`,
        [businessId, key, textVal]
      );
    }

    return res.json({ success: true, message: "Settings saved successfully in pure relational table." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/settings/company-profile/assets
 * Uploads a company logo or signature image directly into filesystem storage
 * with metadata in business_files and reference in company_profile_assets (NULL BLOB data).
 */
router.post(
  "/company-profile/assets",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, message: "Image must be 10 MB or smaller." });
        }
        return res.status(400).json({ success: false, message: err.message || "File upload error." });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const businessId = businessIdFromRequest(req);
      if (!req.file) {
        return res.status(400).json({ success: false, message: "A JPG, PNG, WEBP, or GIF image is required." });
      }
      const assetType = String(req.body.assetType || req.body.entityType || "company-logo").slice(0, 32);
      const originalFilename = (req.file.originalname || "").slice(0, 255);
      const mimeType = req.file.mimetype || "application/octet-stream";
      const sizeBytes = req.file.size;
      const fileBuffer = req.file.buffer;

      // 1. Save to filesystem storage foundation (saves file to disk + business_files metadata)
      const fileResult = await storageService.saveFileAndMetadata({
        businessId,
        category: "company-profile",
        fileBuffer,
        originalFilename,
        mimeType,
      });

      // 2. Insert into company_profile_assets with storage reference and NULL BLOB data
      await pool.execute(
        `INSERT INTO company_profile_assets (id, business_id, asset_type, original_filename, mime_type, size_bytes, storage_key, file_id, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [fileResult.id, businessId, assetType, originalFilename, mimeType, sizeBytes, fileResult.storageKey, fileResult.id]
      );

      return res.status(201).json({
        success: true,
        data: {
          id: fileResult.id,
          name: originalFilename,
          mimeType: fileResult.mimeType || mimeType,
          size: fileResult.sizeBytes || sizeBytes,
          url: `/api/settings/company-profile/assets/${fileResult.id}`,
        },
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || "Failed to upload company profile asset.",
      });
    }
  }
);

/**
 * GET /api/settings/company-profile/assets/:id
 * Streams image binary from private filesystem storage with graceful BLOB read fallback
 */
router.get("/company-profile/assets/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    if (!businessId) {
      return res.status(401).json({ success: false, message: "Unauthorized access: business ID required." });
    }

    // 1. Look up in company_profile_assets with strict business_id check
    const [rows] = await pool.execute(
      "SELECT id, business_id, asset_type, original_filename, mime_type, size_bytes, storage_key, file_id, data FROM company_profile_assets WHERE id = ? AND business_id = ?",
      [req.params.id, businessId]
    );

    const asset = rows && rows.length ? rows[0] : null;

    // If company_profile_assets record found:
    if (asset) {
      // Check if file is stored on filesystem
      if (asset.storage_key) {
        const exists = await storageService.fileExists(asset.storage_key);
        if (exists) {
          const stream = storageService.createReadStream(asset.storage_key);
          res.type(asset.mime_type || "application/octet-stream");
          if (asset.size_bytes) {
            res.set("Content-Length", String(asset.size_bytes));
          }
          res.set("Cache-Control", "private, max-age=86400");
          return stream.pipe(res);
        }
      }

      // If not on filesystem or file missing, check for original BLOB fallback
      if (asset.data && asset.data.length > 0) {
        return res
          .type(asset.mime_type || "application/octet-stream")
          .set("Content-Length", String(asset.size_bytes || asset.data.length))
          .set("Cache-Control", "private, max-age=86400")
          .send(asset.data);
      }
    }

    // 2. Direct business_files lookup fallback
    try {
      const meta = await getFileMetadataById(req.params.id, businessId, { allowAnyBusiness: !businessId });
      if (meta && meta.storage_key) {
        const exists = await storageService.fileExists(meta.storage_key);
        if (exists) {
          const stream = storageService.createReadStream(meta.storage_key);
          res.type(meta.mime_type || "application/octet-stream");
          if (meta.size_bytes) {
            res.set("Content-Length", String(meta.size_bytes));
          }
          res.set("Cache-Control", "private, max-age=86400");
          return stream.pipe(res);
        }
      }
    } catch {}

    // 3. Backward-compatibility: If asset not found, read-only fallback to business_growth_assets
    let bgRows;
    try {
      [bgRows] = await pool.execute(
        "SELECT mime_type, original_filename, size_bytes, data FROM business_growth_assets WHERE id = ? AND business_id = ?",
        [req.params.id, businessId]
      );
    } catch {}

    if (bgRows && bgRows.length && bgRows[0].data) {
      const bgAsset = bgRows[0];
      return res
        .type(bgAsset.mime_type || "application/octet-stream")
        .set("Content-Length", String(bgAsset.size_bytes || bgAsset.data?.length || 0))
        .set("Cache-Control", "private, max-age=86400")
        .send(bgAsset.data);
    }

    return res.status(404).json({ success: false, message: "Asset not found." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/settings/company-profile
 * Fetches company profile with pure relational columns
 */
router.get("/company-profile", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM company_profiles WHERE business_id = ? LIMIT 1`,
      [businessId]
    );

    if (!rows.length) {
      return res.json({
        success: true,
        data: {
          businessId,
          companyName: "",
          businessName: "",
          tradeName: "",
          businessType: "",
          businessCategory: "",
          phone: "",
          phoneNumber: "",
          email: "",
          emailId: "",
          gstin: "",
          pan: "",
          streetAddress: "",
          businessAddress: "",
          address: "",
          city: "",
          state: "",
          pincode: "",
          country: "India",
          bankName: "",
          accountNumber: "",
          ifscCode: "",
          branchName: "",
          upiId: "",
          signatureUrl: "",
          signature: "",
          logoUrl: "",
          logo: "",
          termsAndConditions: "",
          bankDetails: {
            bankName: "",
            accountNumber: "",
            ifscCode: "",
            branchName: "",
            upiId: "",
          },
        },
      });
    }

    const row = rows[0];
    const normalizeUrl = (url) => {
      if (!url || typeof url !== "string") return "";
      let res = url.replace(/([?&]businessId=)local-development\b/g, `$1${encodeURIComponent(businessId)}`);
      res = res.replace(/\/api\/business-growth\/assets\//g, "/api/settings/company-profile/assets/");
      return res;
    };

    return res.json({
      success: true,
      data: {
        businessId: row.business_id,
        companyName: row.company_name || "",
        businessName: row.company_name || "",
        tradeName: row.trade_name || "",
        businessType: row.business_type || "",
        businessCategory: row.business_category || "",
        phone: row.phone || "",
        phoneNumber: row.phone || "",

        email: row.email || "",
        emailId: row.email || "",
        gstin: row.gstin || "",
        pan: row.pan || "",
        streetAddress: row.street_address || "",
        businessAddress: row.street_address || "",
        address: row.street_address || "",
        city: row.city || "",
        state: row.state || "",
        pincode: row.pincode || "",
        country: row.country || "India",
        bankName: row.bank_name || "",
        accountNumber: row.account_number || "",
        ifscCode: row.ifsc_code || "",
        branchName: row.branch_name || "",
        upiId: row.upi_id || "",
        signatureUrl: normalizeUrl(row.signature_url),
        signature: normalizeUrl(row.signature_url),

        logoUrl: normalizeUrl(row.logo_url),
        logo: normalizeUrl(row.logo_url),
        termsAndConditions: row.terms_and_conditions || "",
        bankDetails: {
          bankName: row.bank_name || "",
          accountNumber: row.account_number || "",
          ifscCode: row.ifsc_code || "",
          branchName: row.branch_name || "",
          upiId: row.upi_id || "",
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/settings/company-profile
 * Saves company profile in pure SQL columns with partial-update data preservation
 */
router.post("/company-profile", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    if (businessId === "local-development") {
      return res.status(400).json({
        success: false,
        message: "The tenant 'local-development' is prohibited in this environment.",
      });
    }

    const body = req.body || {};
    const clearFields = new Set(Array.isArray(body.clearFields) ? body.clearFields : []);
    const isExplicitClear = Boolean(body._isExplicitClear);

    // 1. Fetch existing profile for this business to preserve omitted properties
    const [existingRows] = await pool.query(
      `SELECT * FROM company_profiles WHERE business_id = ? LIMIT 1`,
      [businessId]
    );
    const existing = existingRows && existingRows.length ? existingRows[0] : null;

    const hasOwn = (obj, key) => Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

    // Helper to resolve string fields with aliases while distinguishing omitted from explicitly cleared
    const resolveField = (aliases, existingValue) => {
      const isCleared = isExplicitClear || aliases.some((a) => clearFields.has(a));
      if (isCleared) return null;

      const presentAliases = aliases.filter((key) => hasOwn(body, key));
      if (presentAliases.length > 0) {
        // If any present alias has a non-empty string, prioritize it
        for (const key of presentAliases) {
          const val = body[key];
          if (val != null) {
            const str = String(val).trim();
            if (str !== "") return str;
          }
        }
        // All present aliases were explicitly null, empty, or whitespace
        return null;
      }
      return existingValue ?? null;
    };

    // Helper for bank details supporting root and nested bankDetails object
    const resolveBankField = (fieldName, existingValue) => {
      const isCleared = isExplicitClear || clearFields.has(fieldName) || clearFields.has("bankDetails");
      if (isCleared) return null;

      const bankDetails = body.bankDetails;
      const hasRoot = hasOwn(body, fieldName);
      const hasNested = Boolean(bankDetails && typeof bankDetails === "object" && hasOwn(bankDetails, fieldName));

      if (hasRoot) {
        const raw = body[fieldName];
        if (raw == null) return null;
        const str = String(raw).trim();
        return str === "" ? null : str;
      }
      if (hasNested) {
        const raw = bankDetails[fieldName];
        if (raw == null) return null;
        const str = String(raw).trim();
        return str === "" ? null : str;
      }
      return existingValue ?? null;
    };

    // Business Name / Company Name (NOT NULL)
    let companyName;
    const hasCompanyName = hasOwn(body, "companyName") || hasOwn(body, "businessName");
    if (hasCompanyName) {
      const raw = (hasOwn(body, "companyName") && body.companyName !== undefined)
        ? body.companyName
        : body.businessName;
      const trimmed = raw != null ? String(raw).trim() : "";
      companyName = trimmed || (existing?.company_name || "");
    } else {
      companyName = existing?.company_name || "";
    }

    const tradeName = resolveField(["tradeName"], existing?.trade_name);
    const businessType = resolveField(["businessType"], existing?.business_type);
    const businessCategory = resolveField(["businessCategory"], existing?.business_category);

    const phone = resolveField(["phone", "phoneNumber"], existing?.phone);
    const email = resolveField(["email", "emailId"], existing?.email);
    const gstin = resolveField(["gstin"], existing?.gstin);
    const pan = resolveField(["pan"], existing?.pan);

    const streetAddress = resolveField(["streetAddress", "businessAddress", "address"], existing?.street_address);
    const city = resolveField(["city"], existing?.city);
    const state = resolveField(["state"], existing?.state);
    const pincode = resolveField(["pincode"], existing?.pincode);

    let country;
    if (hasOwn(body, "country")) {
      country = body.country != null && String(body.country).trim() !== "" ? String(body.country).trim() : "India";
    } else {
      country = existing?.country || "India";
    }

    const bankName = resolveBankField("bankName", existing?.bank_name);
    const accountNumber = resolveBankField("accountNumber", existing?.account_number);
    const ifscCode = resolveBankField("ifscCode", existing?.ifsc_code);
    const branchName = resolveBankField("branchName", existing?.branch_name);
    const upiId = resolveBankField("upiId", existing?.upi_id);

    // Signature resolution (supports aliases, explicit clear, Base64 persistence, or omission preservation)
    let signatureUrl;
    const hasSignature = hasOwn(body, "signatureUrl") || hasOwn(body, "signature");
    const isSignatureCleared = isExplicitClear || clearFields.has("signature") || clearFields.has("signatureUrl");
    if (isSignatureCleared) {
      signatureUrl = null;
    } else if (hasSignature) {
      const rawSig = (hasOwn(body, "signatureUrl") && body.signatureUrl !== undefined)
        ? body.signatureUrl
        : body.signature;
      if (rawSig == null || String(rawSig).trim() === "") {
        signatureUrl = null;
      } else if (typeof rawSig === "string" && rawSig.startsWith("data:image/")) {
        signatureUrl = await persistBase64Asset(rawSig, "company-signature", businessId);
      } else {
        signatureUrl = String(rawSig).trim();
      }
    } else {
      signatureUrl = existing ? existing.signature_url : null;
    }
    if (signatureUrl && typeof signatureUrl === "string") {
      signatureUrl = signatureUrl.replace(/([?&]businessId=)local-development\b/g, `$1${encodeURIComponent(businessId)}`);
      signatureUrl = signatureUrl.replace(/\/api\/business-growth\/assets\//g, "/api/settings/company-profile/assets/");
    }

    // Logo resolution (supports aliases, explicit clear, Base64 persistence, or omission preservation)
    let logoUrl;
    const hasLogo = hasOwn(body, "logoUrl") || hasOwn(body, "logo");
    const isLogoCleared = isExplicitClear || clearFields.has("logo") || clearFields.has("logoUrl");
    if (isLogoCleared) {
      logoUrl = null;
    } else if (hasLogo) {
      const rawLogo = (hasOwn(body, "logoUrl") && body.logoUrl !== undefined)
        ? body.logoUrl
        : body.logo;
      if (rawLogo == null || String(rawLogo).trim() === "") {
        logoUrl = null;
      } else if (typeof rawLogo === "string" && rawLogo.startsWith("data:image/")) {
        logoUrl = await persistBase64Asset(rawLogo, "company-logo", businessId);
      } else {
        logoUrl = String(rawLogo).trim();
      }
    } else {
      logoUrl = existing ? existing.logo_url : null;
    }
    if (logoUrl && typeof logoUrl === "string") {
      logoUrl = logoUrl.replace(/([?&]businessId=)local-development\b/g, `$1${encodeURIComponent(businessId)}`);
      logoUrl = logoUrl.replace(/\/api\/business-growth\/assets\//g, "/api/settings/company-profile/assets/");
    }

    const termsAndConditions = resolveField(["termsAndConditions"], existing?.terms_and_conditions);

    await pool.query(
      `INSERT INTO company_profiles (
        business_id, company_name, trade_name, business_type, business_category,
        phone, email, gstin, pan,
        street_address, city, state, pincode, country,
        bank_name, account_number, ifsc_code, branch_name, upi_id,
        signature_url, logo_url, terms_and_conditions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        company_name = VALUES(company_name),
        trade_name = VALUES(trade_name),
        business_type = VALUES(business_type),
        business_category = VALUES(business_category),
        phone = VALUES(phone),
        email = VALUES(email),
        gstin = VALUES(gstin),
        pan = VALUES(pan),
        street_address = VALUES(street_address),
        city = VALUES(city),
        state = VALUES(state),
        pincode = VALUES(pincode),
        country = VALUES(country),
        bank_name = VALUES(bank_name),
        account_number = VALUES(account_number),
        ifsc_code = VALUES(ifsc_code),
        branch_name = VALUES(branch_name),
        upi_id = VALUES(upi_id),
        signature_url = VALUES(signature_url),
        logo_url = VALUES(logo_url),
        terms_and_conditions = VALUES(terms_and_conditions),
        updated_at = CURRENT_TIMESTAMP`,
      [
        businessId, companyName, tradeName, businessType, businessCategory,
        phone, email, gstin, pan,
        streetAddress, city, state, pincode, country,
        bankName, accountNumber, ifscCode, branchName, upiId,
        signatureUrl, logoUrl, termsAndConditions
      ]
    );

    return res.json({
      success: true,
      message: "Company profile saved successfully in pure relational rows and columns.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
