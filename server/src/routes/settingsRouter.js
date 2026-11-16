/**
 * Settings & Company Profile API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - App Settings: Key-Value pairs stored with pure TEXT values.
 * - Company Profile: Stored with pure SQL columns for bank info, contact, address, and legal tax identifiers.
 */

import { Router } from "express";
import crypto from "node:crypto";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * Safely persists a Base64 data URL into business_growth_assets
 * and returns the persistent asset reference URL.
 */
async function persistBase64Asset(val, entityType, businessId) {
  if (!val || typeof val !== "string" || !val.startsWith("data:image/")) {
    return val || null;
  }
  try {
    const matches = val.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) return null;
    const id = crypto.randomUUID();
    const ext = mimeType.split("/")[1] || "png";
    const filename = `${entityType}-${Date.now()}.${ext}`;
    await pool.execute(
      `INSERT INTO business_growth_assets (id, business_id, entity_type, entity_id, original_filename, mime_type, size_bytes, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, businessId, entityType, entityType, filename, mimeType, buffer.length, buffer]
    );
    return `/api/business-growth/assets/${id}?businessId=${encodeURIComponent(businessId)}`;
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
 * Batch updates settings keys
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    for (const [key, val] of Object.entries(body)) {
      const textVal = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
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
          companyName: "Sai Kirana Stores",
          businessName: "Sai Kirana Stores",
          businessType: "",
          businessCategory: "",
        },
      });
    }

    const row = rows[0];
    return res.json({
      success: true,
      data: {
        businessId: row.business_id,
        companyName: row.company_name,
        businessName: row.company_name,
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
        signatureUrl: row.signature_url || "",
        signature: row.signature_url || "",

        logoUrl: row.logo_url || "",
        logo: row.logo_url || "",
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
    const body = req.body || {};

    // 1. Fetch existing profile for this business to preserve omitted properties
    const [existingRows] = await pool.query(
      `SELECT * FROM company_profiles WHERE business_id = ? LIMIT 1`,
      [businessId]
    );
    const existing = existingRows && existingRows.length ? existingRows[0] : null;

    const hasOwn = (obj, key) => Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

    // Helper to resolve string fields with aliases while distinguishing omitted from explicitly cleared
    const resolveField = (aliases, existingValue) => {
      const presentAlias = aliases.find((key) => hasOwn(body, key));
      if (presentAlias !== undefined) {
        const definedAlias = aliases.find((key) => hasOwn(body, key) && body[key] !== undefined) ?? presentAlias;
        const raw = body[definedAlias];
        if (raw == null) return null;
        const str = String(raw).trim();
        return str === "" ? null : str;
      }
      return existingValue ?? null;
    };

    // Helper for bank details supporting root and nested bankDetails object
    const resolveBankField = (fieldName, existingValue) => {
      const bankDetails = body.bankDetails;
      const hasRoot = hasOwn(body, fieldName);
      const hasNested = Boolean(bankDetails && typeof bankDetails === "object" && hasOwn(bankDetails, fieldName));

      if (hasRoot || hasNested) {
        let raw;
        if (hasRoot && body[fieldName] !== undefined) {
          raw = body[fieldName];
        } else if (hasNested && bankDetails[fieldName] !== undefined) {
          raw = bankDetails[fieldName];
        } else if (hasRoot) {
          raw = body[fieldName];
        } else {
          raw = bankDetails[fieldName];
        }
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
      companyName = trimmed || (existing?.company_name || "Sai Kirana Stores");
    } else {
      companyName = existing?.company_name || "Sai Kirana Stores";
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
    if (hasSignature) {
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

    // Logo resolution (supports aliases, explicit clear, Base64 persistence, or omission preservation)
    let logoUrl;
    const hasLogo = hasOwn(body, "logoUrl") || hasOwn(body, "logo");
    if (hasLogo) {
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
