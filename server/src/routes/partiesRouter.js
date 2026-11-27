/**
 * Parties API Router (Customers & Suppliers)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Normalized table parties with individual columns for all contact, address, balance, and GST details.
 * - Lazy Loading & Paginated Slices: B-Tree compound index on (business_id, party_name) and (business_id, phone).
 * - Full Statement Endpoint: Generates party ledger transactions dynamically via SQL.
 */

import { Router } from "express";
import { pool, businessIdFromRequest, toSqlDate } from "../db/mysql.js";
import { validateGstin } from "../utils/gstinUtils.js";

const router = Router();

export function normalizePartyName(raw = "") {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

export function normalizePartyNameKey(raw = "") {
  return normalizePartyName(raw).toLowerCase();
}

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
      channel: "sms",
      phone,
      message: "Verification code sent to mobile number.",
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
    const limitParam = req.query.limit;
    const isAll = limitParam === "all" || req.query.all === "true" || limitParam === "0";
    const limit = isAll
      ? 5000
      : Math.min(1000, Math.max(1, parseInt(limitParam, 10) || 50));
    const offset = isAll ? 0 : (page - 1) * limit;
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

    // Query 2: Fetch parties (pure columns)
    let querySql = `SELECT id, business_id, party_name, phone, email, gstin, pan,
              party_type, opening_balance, current_balance, balance_type,
              credit_limit, credit_limit_type, party_group, gst_type, as_of_date,
              additional_fields, billing_street, billing_city, billing_state,
              billing_pincode, shipping_street, shipping_city, shipping_state,
              shipping_pincode, is_active, created_at, updated_at
       FROM parties
       WHERE ${whereClause}
       ORDER BY party_name ASC`;
    let queryParams = [...params];

    if (!isAll) {
      querySql += " LIMIT ? OFFSET ?";
      queryParams.push(limit, offset);
    }

    const [rows] = await pool.query(querySql, queryParams);

    return res.json({
      success: true,
      data: rows.map(mapPartyRow),
      pagination: {
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        total,
        totalPages: isAll ? 1 : (Math.ceil(total / limit) || 1),
        hasMore: isAll ? false : (offset + rows.length < total),
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
         AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'canceled', 'void', 'deleted')
         AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'void', 'deleted')
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
const savePartyHandler = async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const rawPartyName = (body.partyName || body.name || body.party_name || "").trim();
    const partyName = normalizePartyName(rawPartyName);
    if (!partyName) {
      return res.status(400).json({ success: false, message: "Party name is required." });
    }

    const targetId = req.params?.id || body.id;
    const normKey = normalizePartyNameKey(partyName);

    // Strict uniqueness check: normalize case + internal whitespace across all parties in this business
    const [allBizParties] = await pool.query(
      `SELECT id, party_name FROM parties WHERE business_id = ?`,
      [businessId]
    );
    const duplicate = allBizParties.find(
      (p) =>
        (!targetId || String(targetId) !== String(p.id)) &&
        normalizePartyNameKey(p.party_name) === normKey
    );

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: `A party named "${duplicate.party_name}" already exists. Please choose a different party name.`,
        existingPartyId: duplicate.id,
      });
    }

    const id = targetId || `party_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let existingParty = null;
    if (targetId) {
      const [existingRows] = await pool.query(
        `SELECT *
         FROM parties
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, targetId]
      );
      existingParty = existingRows[0] || null;
    }

    const hasOwn = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const pickText = (aliases, existingVal) => {
      const present = aliases.filter((k) => hasOwn(k));
      if (present.length > 0) {
        for (const k of present) {
          const v = body[k];
          if (v !== undefined && v !== null && String(v).trim() !== "") {
            return String(v).trim();
          }
        }
        return null;
      }
      return existingVal ?? null;
    };

    const phone = pickText(["phone", "mobile", "phoneNumber"], existingParty?.phone);
    const email = pickText(["email"], existingParty?.email);
    const rawGstin = pickText(["gstin", "gstNumber"], existingParty?.gstin);
    let gstin = rawGstin;
    let pan = pickText(["pan"], existingParty?.pan);

    if (rawGstin) {
      const gstinValidation = validateGstin(rawGstin, { required: false });
      if (!gstinValidation.valid) {
        return res.status(400).json({ success: false, message: gstinValidation.error });
      }
      gstin = gstinValidation.clean;
      if (!pan && gstinValidation.pan) {
        pan = gstinValidation.pan;
      }
    }

    const rawPartyType = body.partyType ?? body.party_type;
    let partyType;
    if (rawPartyType !== undefined && rawPartyType !== null && String(rawPartyType).trim() !== "") {
      const normType = String(rawPartyType).trim().toLowerCase();
      if (!["customer", "supplier", "both"].includes(normType)) {
        return res.status(400).json({ success: false, message: "Party type must be customer, supplier, or both." });
      }
      partyType = normType;
    } else {
      partyType = existingParty?.party_type || "customer";
    }

    const hasOpeningBalance = body.openingBalance !== undefined || body.opening_balance !== undefined;
    const openingBalance = hasOpeningBalance
      ? (parseFloat(body.openingBalance ?? body.opening_balance) || 0)
      : (existingParty ? (parseFloat(existingParty.opening_balance) || 0) : 0);

    const hasCurrentBalance =
      body.currentBalance !== undefined ||
      body.balance !== undefined ||
      body.current_balance !== undefined;
    let currentBalance;
    if (hasCurrentBalance) {
      currentBalance = parseFloat(body.currentBalance ?? body.balance ?? body.current_balance) || 0;
    } else if (existingParty) {
      const prevOpening = parseFloat(existingParty.opening_balance) || 0;
      const prevCurrent = parseFloat(existingParty.current_balance) || 0;
      currentBalance = hasOpeningBalance ? prevCurrent + (openingBalance - prevOpening) : prevCurrent;
    } else {
      currentBalance = openingBalance;
    }

    const rawBalanceType = String(body.balanceType || body.balance_type || body.openingBalanceType || body.opening_balance_type || "").trim().toLowerCase().replace("-", "_");
    const balanceType = rawBalanceType === "to_pay" || rawBalanceType === "to_receive"
      ? rawBalanceType
      : (existingParty?.balance_type || (partyType === "supplier" ? "to_pay" : (currentBalance >= 0 ? "to_receive" : "to_pay")));
    const creditLimit = hasOwn("creditLimit") || hasOwn("credit_limit")
      ? (parseFloat(body.creditLimit ?? body.credit_limit ?? 0) || 0)
      : (existingParty ? (parseFloat(existingParty.credit_limit) || 0) : 0);

    const partyGroup = pickText(["group", "partyGroup", "party_group"], existingParty?.party_group) || "General";
    const gstType = pickText(["gstType", "gst_type"], existingParty?.gst_type) || "Unregistered / Consumer";
    const asOfDate = hasOwn("asOfDate") || hasOwn("as_of_date")
      ? toSqlDate(body.asOfDate ?? body.as_of_date)
      : (existingParty?.as_of_date ? toSqlDate(existingParty.as_of_date) : null);
    const creditLimitType = pickText(["creditLimitType", "credit_limit_type"], existingParty?.credit_limit_type) || "no-limit";

    let additionalFieldsJson = existingParty?.additional_fields ?? null;
    if (hasOwn("additionalFields") || hasOwn("additional_fields")) {
      const rawAf = body.additionalFields ?? body.additional_fields;
      if (Array.isArray(rawAf)) {
        additionalFieldsJson = JSON.stringify(rawAf);
      } else if (typeof rawAf === "string") {
        additionalFieldsJson = rawAf;
      } else if (rawAf == null) {
        additionalFieldsJson = null;
      }
    }

    const billingStreet = pickText(["billingStreet", "billingAddress", "address"], existingParty?.billing_street);
    const billingCity = pickText(["billingCity", "city"], existingParty?.billing_city);
    const billingState = pickText(["billingState", "state"], existingParty?.billing_state);
    const billingPincode = pickText(["billingPincode", "pincode"], existingParty?.billing_pincode);

    const shippingStreet = pickText(["shippingStreet", "shippingAddress"], existingParty?.shipping_street);
    const shippingCity = pickText(["shippingCity"], existingParty?.shipping_city);
    const shippingState = pickText(["shippingState"], existingParty?.shipping_state);
    const shippingPincode = pickText(["shippingPincode"], existingParty?.shipping_pincode);

    const rawActive = body.status !== undefined
      ? (String(body.status).toLowerCase() !== "inactive")
      : (body.isActive !== undefined ? Boolean(body.isActive) : (existingParty ? Boolean(existingParty.is_active) : true));
    const isActive = rawActive ? 1 : 0;

    // Pure SQL UPSERT
    await pool.query(
      `INSERT INTO parties (
        id, business_id, party_name, phone, email, gstin, pan, party_type,
        opening_balance, current_balance, balance_type, credit_limit,
        credit_limit_type, party_group, gst_type, as_of_date, additional_fields,
        billing_street, billing_city, billing_state, billing_pincode,
        shipping_street, shipping_city, shipping_state, shipping_pincode,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        party_name = VALUES(party_name),
        phone = VALUES(phone),
        email = VALUES(email),
        gstin = VALUES(gstin),
        pan = VALUES(pan),
        party_type = VALUES(party_type),
        opening_balance = VALUES(opening_balance),
        current_balance = VALUES(current_balance),
        balance_type = VALUES(balance_type),
        credit_limit = VALUES(credit_limit),
        credit_limit_type = VALUES(credit_limit_type),
        party_group = VALUES(party_group),
        gst_type = VALUES(gst_type),
        as_of_date = VALUES(as_of_date),
        additional_fields = VALUES(additional_fields),
        billing_street = VALUES(billing_street),
        billing_city = VALUES(billing_city),
        billing_state = VALUES(billing_state),
        billing_pincode = VALUES(billing_pincode),
        shipping_street = VALUES(shipping_street),
        shipping_city = VALUES(shipping_city),
        shipping_state = VALUES(shipping_state),
        shipping_pincode = VALUES(shipping_pincode),
        is_active = VALUES(is_active),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, partyName, phone, email, gstin, pan, partyType,
        openingBalance, currentBalance, balanceType, creditLimit,
        creditLimitType, partyGroup, gstType, asOfDate, additionalFieldsJson,
        billingStreet, billingCity, billingState, billingPincode,
        shippingStreet, shippingCity, shippingState, shippingPincode,
        isActive
      ]
    );

    const [savedRows] = await pool.query(
      `SELECT * FROM parties WHERE business_id = ? AND id = ? LIMIT 1`,
      [businessId, id]
    );
    const savedPartyData = savedRows.length > 0 ? mapPartyRow(savedRows[0]) : {
      id,
      partyName,
      phone,
      email,
      gstin,
      partyType,
      currentBalance,
      isActive: isActive === 1,
      status: isActive === 1 ? "active" : "inactive",
    };

    return res.json({
      success: true,
      message: "Party saved successfully in pure relational rows and columns.",
      data: savedPartyData,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      return res.status(400).json({
        success: false,
        message: `A party named "${(req.body?.partyName || req.body?.name || req.body?.party_name || '').trim()}" already exists. Please choose a different party name.`,
      });
    }
    console.error("[Parties POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post("/", savePartyHandler);
router.put("/:id", savePartyHandler);

export async function executePartyDeletionPolicy(conn, businessId, partyId) {
  const [partyRows] = await conn.query(
    `SELECT id, party_name, opening_balance, current_balance, is_active
     FROM parties
     WHERE business_id = ? AND id = ?
     LIMIT 1
     FOR UPDATE`,
    [businessId, partyId]
  );

  if (!partyRows.length) {
    return { notFound: true };
  }

  const party = partyRows[0];
  const dependentChecks = [
    { table: "transactions", label: "transactions" },
    { table: "cash_in_hand", label: "cash ledger entries" },
    { table: "cheques", label: "cheques" },
    { table: "service_reminders", label: "service reminders" },
    { table: "purchase_job_works", label: "purchase job works" },
  ];

  const referencedIn = [];
  for (const check of dependentChecks) {
    const [refRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM ${check.table} WHERE business_id = ? AND party_id = ?`,
      [businessId, partyId]
    );
    if ((Number(refRows[0]?.cnt) || 0) > 0) {
      referencedIn.push(check.label);
    }
  }

  const hasOutstandingBalance =
    Math.abs(parseFloat(party.current_balance) || 0) > 0.001 ||
    Math.abs(parseFloat(party.opening_balance) || 0) > 0.001;

  if (referencedIn.length > 0 || hasOutstandingBalance) {
    await conn.query(
      `UPDATE parties SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE business_id = ? AND id = ?`,
      [businessId, partyId]
    );
    const reason = referencedIn.length > 0
      ? `Party "${party.party_name}" has historical records (${referencedIn.join(", ")}) and has been marked inactive instead of being permanently deleted.`
      : `Party "${party.party_name}" has an outstanding balance and has been marked inactive instead of being permanently deleted.`;
    return {
      notFound: false,
      action: "deactivated",
      referencedIn,
      hasOutstandingBalance,
      message: reason,
    };
  }

  await conn.query(
    `DELETE FROM parties WHERE business_id = ? AND id = ?`,
    [businessId, partyId]
  );

  return {
    notFound: false,
    action: "deleted",
    referencedIn: [],
    hasOutstandingBalance: false,
    message: `Party "${party.party_name}" permanently deleted.`,
  };
}

/**
 * DELETE /api/parties/:id
 * Enforces safe party deletion policy: deactivates parties with references or non-zero balance,
 * permanently deletes only when confirmed unreferenced and zero-balance.
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const partyId = req.params.id;
    const outcome = await executePartyDeletionPolicy(conn, businessId, partyId);
    if (outcome.notFound) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Party not found." });
    }
    await conn.commit();
    return res.json({
      success: true,
      action: outcome.action,
      referencedIn: outcome.referencedIn,
      hasOutstandingBalance: outcome.hasOutstandingBalance,
      message: outcome.message,
    });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    return res.status(500).json({ success: false, message: err.message || "Failed to verify or delete party." });
  } finally {
    conn.release();
  }
});

function parseAdditionalFields(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

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
    group: row.party_group || "General",
    partyGroup: row.party_group || "General",
    gstType: row.gst_type || "Unregistered / Consumer",
    asOfDate: row.as_of_date ? String(row.as_of_date).slice(0, 10) : "",
    creditLimitType: row.credit_limit_type || "no-limit",
    additionalFields: parseAdditionalFields(row.additional_fields),
    openingBalance: parseFloat(row.opening_balance) || 0,
    openingBalanceType: (row.balance_type || (row.party_type === "supplier" ? "to_pay" : "to_receive")).replace("_", "-"),
    currentBalance: parseFloat(row.current_balance) || 0,
    balance: parseFloat(row.current_balance) || 0,
    balanceType: row.balance_type || (row.party_type === "supplier" ? "to_pay" : "to_receive"),
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
    isActive: row.is_active === null || row.is_active === undefined ? true : Boolean(row.is_active),
    status: (row.is_active === null || row.is_active === undefined || Boolean(row.is_active)) ? "active" : "inactive",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
