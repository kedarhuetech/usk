/**
 * Settings & Company Profile API Router
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/settings
 * Retrieves all app settings for the active business
 */
router.get("/", async (req, res) => {
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
});

/**
 * POST /api/settings
 * Updates settings keys in batch
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    for (const [key, val] of Object.entries(body)) {
      const jsonVal = JSON.stringify(val);
      await pool.query(
        `INSERT INTO app_settings (business_id, setting_key, setting_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           updated_at = CURRENT_TIMESTAMP`,
        [businessId, key, jsonVal]
      );
    }

    return res.json({ success: true, message: "Settings saved successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/settings/company-profile
 * Fetches company profile
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
        },
      });
    }

    const row = rows[0];
    let bankDetails = {};
    let metadata = {};
    try {
      bankDetails = typeof row.bank_details === "string" ? JSON.parse(row.bank_details) : row.bank_details || {};
      metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {};
    } catch {}

    return res.json({
      success: true,
      data: {
        businessId: row.business_id,
        companyName: row.company_name,
        businessName: row.company_name,
        phone: row.phone || "",
        email: row.email || "",
        gstin: row.gstin || "",
        address: row.address || "",
        state: row.state || "",
        pincode: row.pincode || "",
        signatureUrl: row.signature_url || "",
        logoUrl: row.logo_url || "",
        bankDetails,
        metadata,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/settings/company-profile
 * Updates company profile
 */
router.post("/company-profile", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const companyName = (body.companyName || body.businessName || "Sai Kirana Stores").trim();
    const phone = body.phone || null;
    const email = body.email || null;
    const gstin = body.gstin || null;
    const address = body.address || null;
    const state = body.state || null;
    const pincode = body.pincode || null;
    const signatureUrl = body.signatureUrl || body.signature_url || null;
    const logoUrl = body.logoUrl || body.logo_url || null;
    const bankDetails = JSON.stringify(body.bankDetails || {});
    const metadata = JSON.stringify(body.metadata || {});

    await pool.query(
      `INSERT INTO company_profiles (
        business_id, company_name, phone, email, gstin, address,
        state, pincode, signature_url, logo_url, bank_details, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        company_name = VALUES(company_name),
        phone = VALUES(phone),
        email = VALUES(email),
        gstin = VALUES(gstin),
        address = VALUES(address),
        state = VALUES(state),
        pincode = VALUES(pincode),
        signature_url = VALUES(signature_url),
        logo_url = VALUES(logo_url),
        bank_details = VALUES(bank_details),
        metadata = VALUES(metadata),
        updated_at = CURRENT_TIMESTAMP`,
      [
        businessId, companyName, phone, email, gstin, address,
        state, pincode, signatureUrl, logoUrl, bankDetails, metadata
      ]
    );

    return res.json({ success: true, message: "Company profile updated successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
