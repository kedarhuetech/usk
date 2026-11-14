/**
 * Settings & Company Profile API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - App Settings: Key-Value pairs stored with pure TEXT values.
 * - Company Profile: Stored with pure SQL columns for bank info, contact, address, and legal tax identifiers.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/settings
 * Retrieves all app settings for active business
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
        phone: row.phone || "",
        email: row.email || "",
        gstin: row.gstin || "",
        pan: row.pan || "",
        streetAddress: row.street_address || "",
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
        logoUrl: row.logo_url || "",
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
 * Saves company profile in pure SQL columns
 */
router.post("/company-profile", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const companyName = (body.companyName || body.businessName || "Sai Kirana Stores").trim();
    const tradeName = body.tradeName || null;
    const phone = body.phone || null;
    const email = body.email || null;
    const gstin = body.gstin || null;
    const pan = body.pan || null;
    const streetAddress = body.streetAddress || body.address || null;
    const city = body.city || null;
    const state = body.state || null;
    const pincode = body.pincode || null;
    const country = body.country || "India";

    // Extract bank columns
    const bankDetails = body.bankDetails || {};
    const bankName = body.bankName || bankDetails.bankName || null;
    const accountNumber = body.accountNumber || bankDetails.accountNumber || null;
    const ifscCode = body.ifscCode || bankDetails.ifscCode || null;
    const branchName = body.branchName || bankDetails.branchName || null;
    const upiId = body.upiId || bankDetails.upiId || null;

    const signatureUrl = body.signatureUrl || null;
    const logoUrl = body.logoUrl || null;
    const termsAndConditions = body.termsAndConditions || null;

    await pool.query(
      `INSERT INTO company_profiles (
        business_id, company_name, trade_name, phone, email, gstin, pan,
        street_address, city, state, pincode, country,
        bank_name, account_number, ifsc_code, branch_name, upi_id,
        signature_url, logo_url, terms_and_conditions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        company_name = VALUES(company_name),
        trade_name = VALUES(trade_name),
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
        businessId, companyName, tradeName, phone, email, gstin, pan,
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
