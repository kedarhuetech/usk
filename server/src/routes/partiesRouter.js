/**
 * Parties API Router (Customers & Suppliers)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Normalized table parties with individual columns for all contact, address, balance, and GST details.
 * - Lazy Loading & Paginated Slices: B-Tree compound index on (business_id, party_name) and (business_id, phone).
 * - Full Statement Endpoint: Generates party ledger transactions dynamically via SQL.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

// In-memory OTP store for phone verification with 5 min TTL
const otpStore = new Map();

function cleanPhone(raw = "") {
  return String(raw || "").replace(/\D/g, "").slice(-10);
}

/**
 * POST /api/parties/send-otp
 */
router.post("/send-otp", async (req, res) => {
  try {
    const rawPhone = req.body?.phone || "";
    const phone = cleanPhone(rawPhone);

    if (phone.length !== 10) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit mobile number." });
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(phone, { otp: generatedOtp, expiresAt, attempts: 0 });

    return res.json({
      success: true,
      channel: "local_dev",
      phone,
      otp: generatedOtp,
      message: "OTP generated for instant verification.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/parties/verify-otp
 */
router.post("/verify-otp", (req, res) => {
  const rawPhone = req.body?.phone || "";
  const phone = cleanPhone(rawPhone);
  const enteredOtp = String(req.body?.otp || "").trim();

  if (!phone || !enteredOtp) {
    return res.status(400).json({ success: false, message: "Phone number and OTP are required." });
  }

  const record = otpStore.get(phone);
  if (!record) {
    return res.status(400).json({ success: false, message: "No OTP was requested for this phone number." });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
  }

  if (record.otp !== enteredOtp) {
    record.attempts += 1;
    if (record.attempts >= 5) {
      otpStore.delete(phone);
      return res.status(400).json({ success: false, message: "Too many incorrect attempts. Please request a new OTP." });
    }
    return res.status(400).json({ success: false, message: "Incorrect OTP. Please enter the code received." });
  }

  otpStore.delete(phone);
  return res.json({ success: true, verified: true, message: "Mobile number verified successfully." });
});

/**
 * GET /api/parties
 * Retrieves paginated list of parties with pure relational columns
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const type = (req.query.type || "").trim().toLowerCase();
    const search = (req.query.search || "").trim();

    const conditions = ["business_id = ?"];
    const params = [businessId];

    if (type && type !== "all") {
      conditions.push("party_type = ?");
      params.push(type);
    }

    if (search) {
      conditions.push("(party_name LIKE ? OR phone LIKE ? OR gstin LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(" AND ");

    // Query 1: Total count for lazy loading
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM parties WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Query 2: Fetch paginated slice of parties (pure columns)
    const [rows] = await pool.query(
      `SELECT id, business_id, party_name, phone, email, gstin, pan,
              party_type, opening_balance, current_balance, balance_type,
              credit_limit, billing_street, billing_city, billing_state,
              billing_pincode, shipping_street, shipping_city, shipping_state,
              shipping_pincode, is_active, created_at, updated_at
       FROM parties
       WHERE ${whereClause}
       ORDER BY party_name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: rows.map(mapPartyRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    console.error("[Parties GET Error]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to fetch parties." });
  }
});

/**
 * GET /api/parties/:id
 * Fetches a single party by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const partyId = req.params.id;

    const [rows] = await pool.query(
      `SELECT * FROM parties WHERE business_id = ? AND id = ? LIMIT 1`,
      [businessId, partyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Party not found." });
    }

    return res.json({ success: true, data: mapPartyRow(rows[0]) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/parties/:id/statement
 * Retrieves dynamic statement of transactions for a party
 */
router.get("/:id/statement", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const partyId = req.params.id;

    const [rows] = await pool.query(
      `SELECT id, transaction_type, document_number, transaction_date,
              total_amount, paid_amount, balance_amount, payment_mode
       FROM transactions
       WHERE business_id = ? AND party_id = ?
       ORDER BY transaction_date ASC, created_at ASC`,
      [businessId, partyId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/parties
 * Creates or updates a party record in pure SQL columns
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `party_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const partyName = (body.partyName || body.name || body.party_name || "").trim();
    if (!partyName) {
      return res.status(400).json({ success: false, message: "Party name is required." });
    }

    const phone = body.phone || body.mobile || null;
    const email = body.email || null;
    const gstin = body.gstin || body.gstNumber || null;
    const pan = body.pan || null;
    const partyType = (body.partyType || body.party_type || "customer").toLowerCase();
    const openingBalance = parseFloat(body.openingBalance ?? body.opening_balance ?? 0) || 0;
    const currentBalance = parseFloat(body.currentBalance ?? body.balance ?? body.current_balance ?? openingBalance) || 0;
    const balanceType = body.balanceType || (currentBalance >= 0 ? "to_receive" : "to_pay");
    const creditLimit = parseFloat(body.creditLimit ?? body.credit_limit ?? 0) || 0;

    const billingStreet = body.billingStreet || (typeof body.billingAddress === "string" ? body.billingAddress : (body.address || null));
    const billingCity = body.billingCity || body.city || null;
    const billingState = body.billingState || body.state || null;
    const billingPincode = body.billingPincode || body.pincode || null;

    const shippingStreet = body.shippingStreet || (typeof body.shippingAddress === "string" ? body.shippingAddress : null);
    const shippingCity = body.shippingCity || null;
    const shippingState = body.shippingState || null;
    const shippingPincode = body.shippingPincode || null;

    // Pure SQL UPSERT
    await pool.query(
      `INSERT INTO parties (
        id, business_id, party_name, phone, email, gstin, pan, party_type,
        opening_balance, current_balance, balance_type, credit_limit,
        billing_street, billing_city, billing_state, billing_pincode,
        shipping_street, shipping_city, shipping_state, shipping_pincode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        party_name = VALUES(party_name),
        phone = VALUES(phone),
        email = VALUES(email),
        gstin = VALUES(gstin),
        pan = VALUES(pan),
        party_type = VALUES(party_type),
        current_balance = VALUES(current_balance),
        balance_type = VALUES(balance_type),
        credit_limit = VALUES(credit_limit),
        billing_street = VALUES(billing_street),
        billing_city = VALUES(billing_city),
        billing_state = VALUES(billing_state),
        billing_pincode = VALUES(billing_pincode),
        shipping_street = VALUES(shipping_street),
        shipping_city = VALUES(shipping_city),
        shipping_state = VALUES(shipping_state),
        shipping_pincode = VALUES(shipping_pincode),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, partyName, phone, email, gstin, pan, partyType,
        openingBalance, currentBalance, balanceType, creditLimit,
        billingStreet, billingCity, billingState, billingPincode,
        shippingStreet, shippingCity, shippingState, shippingPincode
      ]
    );

    return res.json({
      success: true,
      message: "Party saved successfully in pure relational rows and columns.",
      data: {
        id,
        partyName,
        phone,
        email,
        gstin,
        partyType,
        currentBalance,
      },
    });
  } catch (err) {
    console.error("[Parties POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/parties/:id
 * Removes a party
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const partyId = req.params.id;

    await pool.query(
      `DELETE FROM parties WHERE business_id = ? AND id = ?`,
      [businessId, partyId]
    );

    return res.json({ success: true, message: "Party deleted successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

function mapPartyRow(row) {
  return {
    id: row.id,
    partyName: row.party_name,
    name: row.party_name,
    phone: row.phone || "",
    mobile: row.phone || "",
    email: row.email || "",
    gstin: row.gstin || "",
    gstNumber: row.gstin || "",
    pan: row.pan || "",
    partyType: row.party_type || "customer",
    openingBalance: parseFloat(row.opening_balance) || 0,
    currentBalance: parseFloat(row.current_balance) || 0,
    balance: parseFloat(row.current_balance) || 0,
    balanceType: row.balance_type || "to_receive",
    creditLimit: parseFloat(row.credit_limit) || 0,
    billingAddress: row.billing_street || "",
    address: row.billing_street || "",
    city: row.billing_city || "",
    state: row.billing_state || "",
    pincode: row.billing_pincode || "",
    shippingAddress: row.shipping_street || "",
    billingStreet: row.billing_street || "",
    billingCity: row.billing_city || "",
    billingState: row.billing_state || "",
    billingPincode: row.billing_pincode || "",
    shippingStreet: row.shipping_street || "",
    shippingCity: row.shipping_city || "",
    shippingState: row.shipping_state || "",
    shippingPincode: row.shipping_pincode || "",
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
