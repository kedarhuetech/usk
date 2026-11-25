/**
 * USV MySQL Backup & Restore Service
 * 
 * Provides atomic, database-backed restoration of USV backup (.usvbackup) payloads.
 * Operates strictly within a MySQL ACID transaction and scopes all writes to the active businessId.
 */

import crypto from "node:crypto";
import { toSqlDate } from "../db/mysql.js";
import { CASH_PROVENANCE } from "../utils/cashTransactionTypes.js";

export const SUPPORTED_BACKUP_FORMAT = "usv-backup";
export const SUPPORTED_BACKUP_VERSION = 1;

/**
 * Queries the database to find which candidate IDs already exist in tableName.
 * Because all records for the target business have already been deleted in the active transaction,
 * any matching ID belongs to another business and would cause a primary-key collision.
 */
async function getConflictingIds(conn, tableName, candidateIds) {
  const conflicting = new Set();
  const validIds = candidateIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (validIds.length === 0) return conflicting;

  for (let i = 0; i < validIds.length; i += 500) {
    const chunk = validIds.slice(i, i + 500);
    const placeholders = chunk.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT id FROM \`${tableName}\` WHERE id IN (${placeholders})`,
      chunk
    );
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r && r.id) conflicting.add(String(r.id));
      }
    }
  }
  return conflicting;
}

/**
 * Allocates a unique ID for a record. If rawId is absent, or collides with another business's
 * record (present in conflictSet), generates a fresh UUID and registers rawId -> newId in idMap.
 * Otherwise, preserves rawId.
 */
function allocateRecordId(rawId, conflictSet, idMap) {
  const strId = String(rawId || "").trim();
  if (!strId || (conflictSet && conflictSet.has(strId))) {
    let newId = crypto.randomUUID();
    while (conflictSet && conflictSet.has(newId)) {
      newId = crypto.randomUUID();
    }
    if (conflictSet) conflictSet.add(newId);
    if (strId && idMap) {
      idMap.set(strId, newId);
    }
    return newId;
  }
  if (conflictSet) conflictSet.add(strId);
  return strId;
}

function toSqlTimestamp(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    return val.toISOString().slice(0, 23).replace("T", " ");
  }
  const str = String(val).trim();
  if (!str) return null;
  const sqlMatch = str.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/);
  if (sqlMatch) {
    return `${sqlMatch[1]} ${sqlMatch[2]}`;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 23).replace("T", " ");
  }
  return null;
}

function makeValidationError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeExpenseCategories(rawCategories) {
  if (rawCategories === undefined || rawCategories === null) {
    return null;
  }
  if (!Array.isArray(rawCategories)) {
    throw makeValidationError("Invalid expense categories dataset: expected an array.");
  }

  const normalized = [];
  const seenNames = new Set();

  for (let i = 0; i < rawCategories.length; i += 1) {
    const ec = rawCategories[i];
    if (!ec || typeof ec !== "object" || Array.isArray(ec)) {
      throw makeValidationError(`Invalid expense category at index ${i}: expected an object.`);
    }

    const rawId = ec.id != null ? String(ec.id).trim() : "";
    const idLabel = rawId ? ` (id: ${rawId})` : "";
    const rawName = ec.categoryName ?? ec.name;
    const name = rawName != null ? String(rawName).trim() : "";
    if (!name) {
      throw makeValidationError(`Invalid expense category at index ${i}${idLabel}: category name is required.`);
    }
    if (name.length > 100) {
      throw makeValidationError(`Invalid expense category at index ${i}${idLabel}: category name exceeds 100 characters.`);
    }

    const dedupeKey = name.toLowerCase();
    if (seenNames.has(dedupeKey)) {
      continue;
    }
    seenNames.add(dedupeKey);

    const expenseType = String(ec.expenseType ?? ec.type ?? "indirect").trim() || "indirect";
    const createdAt = toSqlTimestamp(ec.createdAt ?? ec.created_at);

    normalized.push({
      rawId,
      name,
      expenseType: expenseType.slice(0, 50),
      createdAt,
    });
  }

  return normalized;
}

function normalizeExpenseItems(rawItems) {
  if (rawItems === undefined || rawItems === null) {
    return null;
  }
  if (!Array.isArray(rawItems)) {
    throw makeValidationError("Invalid expense items dataset: expected an array.");
  }

  const normalized = [];

  for (let i = 0; i < rawItems.length; i += 1) {
    const ei = rawItems[i];
    if (!ei || typeof ei !== "object" || Array.isArray(ei)) {
      throw makeValidationError(`Invalid expense item at index ${i}: expected an object.`);
    }

    const rawId = ei.id != null ? String(ei.id).trim() : "";
    const idLabel = rawId ? ` (id: ${rawId})` : "";
    const rawName = ei.itemName ?? ei.item ?? ei.name;
    const itemName = rawName != null ? String(rawName).trim() : "";
    if (!itemName) {
      throw makeValidationError(`Invalid expense item at index ${i}${idLabel}: item name is required.`);
    }
    if (itemName.length > 255) {
      throw makeValidationError(`Invalid expense item at index ${i}${idLabel}: item name exceeds 255 characters.`);
    }

    const rawPrice = ei.price ?? ei.unitPrice;
    let price = 0;
    if (rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== "") {
      const parsedPrice = Number(rawPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        throw makeValidationError(`Invalid expense item at index ${i}${idLabel}: price must be a non-negative number.`);
      }
      price = parsedPrice;
    }

    const rawTax = ei.taxRate ?? ei.tax;
    let taxRate = 0;
    if (rawTax !== undefined && rawTax !== null && String(rawTax).trim() !== "") {
      const parsedTax = Number(rawTax);
      if (!Number.isFinite(parsedTax) || parsedTax < 0) {
        throw makeValidationError(`Invalid expense item at index ${i}${idLabel}: tax rate must be a non-negative number.`);
      }
      taxRate = parsedTax;
    }

    const rawHsn = ei.hsnCode ?? ei.hsn;
    const hsnCode = rawHsn != null && String(rawHsn).trim() !== "" ? String(rawHsn).trim().slice(0, 20) : null;
    const rawDesc = ei.description;
    const description = rawDesc != null && String(rawDesc).trim() !== "" ? String(rawDesc).trim() : null;
    const rawCat = ei.category;
    const category = rawCat != null && String(rawCat).trim() !== "" ? String(rawCat).trim().slice(0, 100) : "Expenses";
    const createdAt = toSqlTimestamp(ei.createdAt ?? ei.created_at);
    const updatedAt = toSqlTimestamp(ei.updatedAt ?? ei.updated_at);

    normalized.push({
      rawId,
      itemName,
      price,
      taxRate,
      hsnCode,
      description,
      category,
      createdAt,
      updatedAt,
    });
  }

  return normalized;
}

/**
 * Validates the core structure of a USV backup payload.
 */
export function validateUsvPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("Invalid backup format: payload must be a JSON object."), { status: 400 });
  }
  if (payload.format !== SUPPORTED_BACKUP_FORMAT) {
    throw Object.assign(new Error(`Unsupported backup format: expected "${SUPPORTED_BACKUP_FORMAT}", received "${payload.format}".`), { status: 400 });
  }
  if (Number(payload.formatVersion) !== SUPPORTED_BACKUP_VERSION) {
    throw Object.assign(new Error(`Unsupported backup version: version ${payload.formatVersion} is not supported.`), { status: 400 });
  }
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw Object.assign(new Error("Backup payload is missing the required data object."), { status: 400 });
  }
  return true;
}

/**
 * Restores a USV backup payload atomically to MySQL for the given business.
 * Replaces only datasets included in the backup, preserving omitted datasets.
 * 
 * @param {import("mysql2/promise").PoolConnection} conn Active transaction connection
 * @param {string} businessId Active business ID
 * @param {object} payload Validated USV backup payload
 * @returns {Promise<object>} Restoration execution report with record counts
 */
export async function restoreUsvToDatabase(conn, businessId, payload) {
  validateUsvPayload(payload);

  if (!businessId || typeof businessId !== "string" || businessId.trim().length === 0) {
    throw Object.assign(new Error("A valid business ID is required for restoration."), { status: 400 });
  }

  const data = payload.data;
  const normalizedExpenseCategories = normalizeExpenseCategories(data["ledgerly:expenseCategories.v1"]);
  const normalizedExpenseItems = normalizeExpenseItems(data["ledgerly:expenseItems.v1"]);

  const stats = {
    parties: 0,
    items: 0,
    batches: 0,
    transactions: 0,
    transactionItems: 0,
    inventoryAdjustments: 0,
    units: 0,
    unitConversions: 0,
    bankAccounts: 0,
    bankTransactions: 0,
    cashAdjustments: 0,
    cheques: 0,
    loanAccounts: 0,
    loanRepayments: 0,
    serviceReminders: 0,
    serviceReminderHistory: 0,
    companyProfile: 0,
    appSettings: 0,
    expenseCategories: 0,
    expenseItems: 0,
    onlineStoreSettings: 0,
    onlineStoreOrders: 0,
  };
  const replacedStores = [];
  const partyIdMap = new Map();
  const itemIdMap = new Map();
  const txnIdMap = new Map();
  const bankAccIdMap = new Map();
  const loanIdMap = new Map();
  const reminderIdMap = new Map();

  // ==========================================================================
  // 1. COMPANY PROFILE (ledgerly:companyProfile.v1 or scoped key)
  // ==========================================================================
  const cpKey = Object.keys(data).find((k) => k === "ledgerly:companyProfile.v1" || k.startsWith("ledgerly:companyProfile.v1:"));
  if (cpKey && data[cpKey] && typeof data[cpKey] === "object" && !Array.isArray(data[cpKey])) {
    const cp = data[cpKey];
    const companyName = String(cp.companyName || cp.businessName || "My Business").trim();
    const tradeName = cp.tradeName || null;
    const businessType = cp.businessType || null;
    const businessCategory = cp.businessCategory || null;
    const phone = cp.phone || cp.phoneNumber || null;
    const email = cp.email || cp.emailId || null;
    const gstin = cp.gstin || null;
    const pan = cp.pan || null;
    const streetAddress = cp.businessAddress || cp.streetAddress || cp.address || null;
    const city = cp.city || null;
    const state = cp.state || null;
    const pincode = cp.pincode || null;
    const country = cp.country || "India";
    const bankName = cp.bankName || null;
    const accountNumber = cp.bankAccountNumber || cp.accountNumber || null;
    const ifscCode = cp.bankIfscCode || cp.ifscCode || null;
    const branchName = cp.branchName || null;
    const upiId = cp.upiId || null;
    const signatureUrl = cp.signatureUrl || cp.signature || null;
    const logoUrl = cp.logoUrl || cp.logo || null;
    const termsAndConditions = cp.termsAndConditions || cp.terms_and_conditions || null;

    await conn.query(
      `INSERT INTO company_profiles (
        business_id, company_name, trade_name, business_type, business_category,
        phone, email, gstin, pan, street_address, city, state, pincode, country,
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
        terms_and_conditions = VALUES(terms_and_conditions)`,
      [
        businessId, companyName, tradeName, businessType, businessCategory,
        phone, email, gstin, pan, streetAddress, city, state, pincode, country,
        bankName, accountNumber, ifscCode, branchName, upiId,
        signatureUrl, logoUrl, termsAndConditions,
      ]
    );

    // Also update businesses table name if exists
    await conn.query(
      `INSERT INTO businesses (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [businessId, companyName]
    );

    stats.companyProfile = 1;
    replacedStores.push("Company profile");
  }

  // ==========================================================================
  // 2. PARTIES (ledgerly:parties.v1)
  // ==========================================================================
  if (Array.isArray(data["ledgerly:parties.v1"])) {
    // Delete existing parties for this business
    await conn.query("DELETE FROM parties WHERE business_id = ?", [businessId]);

    const parties = data["ledgerly:parties.v1"];
    const partyConflicts = await getConflictingIds(conn, "parties", parties.map((p) => p?.id));
    for (const p of parties) {
      if (!p || (!p.id && !p.partyName && !p.name)) continue;
      const id = allocateRecordId(p.id, partyConflicts, partyIdMap);
      const partyName = String(p.partyName || p.name || "Unnamed Party").trim();
      const phone = p.phone || p.mobile || null;
      const email = p.email || null;
      const gstin = p.gstin || p.taxNumber || null;
      const pan = p.pan || null;
      const rawType = String(p.partyType || p.party_type || "customer").toLowerCase();
      const partyType = rawType === "supplier" ? "supplier" : (rawType === "both" ? "both" : "customer");
      const openingBalance = parseFloat(p.openingBalance ?? 0) || 0;
      const currentBalance = parseFloat(p.currentBalance ?? p.balance ?? openingBalance) || 0;
      const balanceType = p.balanceType || (currentBalance < 0 ? "to_pay" : "to_receive");
      const creditLimit = parseFloat(p.creditLimit ?? 0) || 0;
      const billingStreet = p.billingStreet || (typeof p.billingAddress === "string" ? p.billingAddress : (p.address || null));
      const billingCity = p.billingCity || p.city || null;
      const billingState = p.billingState || p.state || null;
      const billingPincode = p.billingPincode || p.pincode || null;
      const shippingStreet = p.shippingStreet || (typeof p.shippingAddress === "string" ? p.shippingAddress : null);
      const shippingCity = p.shippingCity || null;
      const shippingState = p.shippingState || null;
      const shippingPincode = p.shippingPincode || null;
      const isActive = p.isActive !== false ? 1 : 0;
      const partyGroup = p.group || p.partyGroup || p.party_group || "General";
      const gstType = p.gstType || p.gst_type || "Unregistered / Consumer";
      const asOfDate = toSqlDate(p.asOfDate || p.as_of_date);
      const creditLimitType = p.creditLimitType || p.credit_limit_type || "no-limit";
      const additionalFields = Array.isArray(p.additionalFields)
        ? JSON.stringify(p.additionalFields)
        : (typeof p.additionalFields === "string" ? p.additionalFields : null);

      await conn.query(
        `INSERT INTO parties (
          id, business_id, party_name, phone, email, gstin, pan, party_type,
          opening_balance, current_balance, balance_type, credit_limit,
          credit_limit_type, party_group, gst_type, as_of_date, additional_fields,
          billing_street, billing_city, billing_state, billing_pincode,
          shipping_street, shipping_city, shipping_state, shipping_pincode, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, businessId, partyName, phone, email, gstin, pan, partyType,
          openingBalance, currentBalance, balanceType, creditLimit,
          creditLimitType, partyGroup, gstType, asOfDate, additionalFields,
          billingStreet, billingCity, billingState, billingPincode,
          shippingStreet, shippingCity, shippingState, shippingPincode, isActive,
        ]
      );
      stats.parties += 1;
    }
    replacedStores.push("Parties");
  }

  // ==========================================================================
  // 3. INVENTORY ITEMS & BATCHES (ledgerly:inventoryItems.v1)
  // ==========================================================================
  if (Array.isArray(data["ledgerly:inventoryItems.v1"])) {
    // Delete existing item_batches then inventory_items for this business
    await conn.query("DELETE FROM item_batches WHERE business_id = ?", [businessId]);
    await conn.query("DELETE FROM inventory_items WHERE business_id = ?", [businessId]);

    const items = data["ledgerly:inventoryItems.v1"];
    const itemConflicts = await getConflictingIds(conn, "inventory_items", items.map((i) => i?.id));
    const allBatchIds = [];
    for (const item of items) {
      if (Array.isArray(item?.batches)) {
        for (const b of item.batches) {
          if (b?.id) allBatchIds.push(b.id);
        }
      }
    }
    const batchConflicts = await getConflictingIds(conn, "item_batches", allBatchIds);

    for (const item of items) {
      if (!item || (!item.id && !item.name && !item.itemName)) continue;
      const id = allocateRecordId(item.id, itemConflicts, itemIdMap);
      const name = String(item.itemName || item.name || "Item").trim();
      const itemCode = item.itemCode || item.code || null;
      const barcode = item.barcode || null;
      const category = item.category || "General";
      const hsnCode = item.hsnCode || item.hsn || null;
      const unit = item.unit || "PCS";
      const itemType = String(item.type || item.item_type || "product").toLowerCase() === "service" ? "service" : "product";
      const salePrice = parseFloat(item.salePrice ?? item.price ?? 0) || 0;
      const purchasePrice = parseFloat(item.purchasePrice ?? 0) || 0;
      const taxRate = parseFloat(item.taxRate ?? 0) || 0;
      const cessRate = parseFloat(item.cessRate ?? item.cess ?? 0) || 0;
      const openingStock = parseFloat(item.openingQuantity ?? item.openingStock ?? 0) || 0;
      const currentStock = parseFloat(item.currentStock ?? item.openingQuantity ?? openingStock) || 0;
      const minStock = parseFloat(item.minimumStock ?? item.minStock ?? 0) || 0;
      const isBatchTracked = item.isBatchTracked ? 1 : 0;
      const isSerialTracked = item.isSerialTracked ? 1 : 0;
      const description = item.description || null;
      const imageUrl = item.imageUrl || item.image_url || (typeof item.image === "string" && !item.image.startsWith("data:") ? item.image : null);
      const imageId = item.imageId || item.image_id || null;
      const isActive = item.isActive !== false ? 1 : 0;

      await conn.query(
        `INSERT INTO inventory_items (
          id, business_id, name, item_code, barcode, category, hsn_code, unit,
          item_type, sale_price, purchase_price, tax_rate, cess_rate,
          opening_stock, current_stock, min_stock, is_batch_tracked, is_serial_tracked,
          description, image_url, image_id, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, businessId, name, itemCode, barcode, category, hsnCode, unit,
          itemType, salePrice, purchasePrice, taxRate, cessRate,
          openingStock, currentStock, minStock, isBatchTracked, isSerialTracked,
          description, imageUrl, imageId, isActive,
        ]
      );
      stats.items += 1;

      // Restore nested batches if present
      if (Array.isArray(item.batches)) {
        for (const b of item.batches) {
          if (!b || !b.batchNo) continue;
          const batchId = allocateRecordId(b.id, batchConflicts);
          const batchNo = String(b.batchNo).trim();
          const mfgDate = toSqlDate(b.mfgDate);
          const expDate = toSqlDate(b.expDate);
          const openingQty = parseFloat(b.openingQty ?? b.quantity ?? 0) || 0;
          const currentQty = parseFloat(b.currentQty ?? b.quantity ?? openingQty) || 0;
          const bSalePrice = parseFloat(b.salePrice ?? salePrice) || 0;
          const bPurchasePrice = parseFloat(b.purchasePrice ?? purchasePrice) || 0;
          const mrp = parseFloat(b.mrp ?? 0) || 0;

          await conn.query(
            `INSERT INTO item_batches (
              id, item_id, business_id, batch_no, mfg_date, exp_date,
              opening_qty, current_qty, sale_price, purchase_price, mrp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [batchId, id, businessId, batchNo, mfgDate, expDate, openingQty, currentQty, bSalePrice, bPurchasePrice, mrp]
          );
          stats.batches += 1;
        }
      }
    }
    replacedStores.push("Items");
  }

  // ==========================================================================
  // 4. INVENTORY ADJUSTMENTS (ledgerly:inventoryAdjustments.v1)
  // ==========================================================================
  if (Array.isArray(data["ledgerly:inventoryAdjustments.v1"])) {
    await conn.query("DELETE FROM inventory_adjustments WHERE business_id = ?", [businessId]);
    const adjustments = data["ledgerly:inventoryAdjustments.v1"];
    const adjConflicts = await getConflictingIds(conn, "inventory_adjustments", adjustments.map((a) => a?.id));

    for (const adj of adjustments) {
      if (!adj) continue;
      const id = allocateRecordId(adj.id, adjConflicts);
      const rawItemId = String(adj.itemId || adj.item_id || "");
      const itemId = itemIdMap.get(rawItemId) || rawItemId;
      const itemName = String(adj.itemName || adj.item || "Adjustment").trim();
      const adjustmentType = String(adj.adjustmentType || adj.type || "add").toLowerCase() === "reduce" ? "reduce" : "add";
      const quantity = parseFloat(adj.quantity ?? adj.qty ?? 0) || 0;
      const unitPrice = parseFloat(adj.unitPrice ?? adj.price ?? 0) || 0;
      const totalValue = parseFloat(adj.totalValue ?? (quantity * unitPrice)) || 0;
      const reason = adj.reason || null;
      const adjustmentDate = toSqlDate(adj.adjustmentDate || adj.date) || new Date().toISOString().slice(0, 10);

      await conn.query(
        `INSERT INTO inventory_adjustments (
          id, business_id, item_id, item_name, adjustment_type,
          quantity, unit_price, total_value, reason, adjustment_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, itemId, itemName, adjustmentType, quantity, unitPrice, totalValue, reason, adjustmentDate]
      );
      stats.inventoryAdjustments += 1;
    }
    replacedStores.push("Inventory adjustments");
  }

  // ==========================================================================
  // 5. UNITS & CONVERSIONS
  // ==========================================================================
  if (Array.isArray(data["ledgerly:customUnits.v1"])) {
    await conn.query("DELETE FROM units WHERE business_id = ?", [businessId]);
    const units = data["ledgerly:customUnits.v1"];
    const unitConflicts = await getConflictingIds(conn, "units", units.map((u) => u?.id));
    for (const u of units) {
      if (!u || !u.name) continue;
      const id = allocateRecordId(u.id, unitConflicts);
      const name = String(u.name).trim();
      const shortName = String(u.shortName || u.short_name || name).trim();
      const precisionDec = parseInt(u.precisionDec ?? u.precision ?? 0, 10) || 0;

      await conn.query(
        `INSERT INTO units (id, business_id, name, short_name, precision_dec) VALUES (?, ?, ?, ?, ?)`,
        [id, businessId, name, shortName, precisionDec]
      );
      stats.units += 1;
    }
    replacedStores.push("Units");
  }

  if (Array.isArray(data["ledgerly:unitConversions.v1"])) {
    await conn.query("DELETE FROM unit_conversions WHERE business_id = ?", [businessId]);
    const conversions = data["ledgerly:unitConversions.v1"];
    const ucConflicts = await getConflictingIds(conn, "unit_conversions", conversions.map((uc) => uc?.id));
    for (const uc of conversions) {
      if (!uc || !uc.unit || !uc.toUnit) continue;
      const id = allocateRecordId(uc.id, ucConflicts);
      const unit = String(uc.unit).trim();
      const toUnit = String(uc.toUnit).trim();
      const factor = parseFloat(uc.conversionFactor ?? uc.factor ?? 1) || 1;

      await conn.query(
        `INSERT INTO unit_conversions (id, business_id, unit, to_unit, factor) VALUES (?, ?, ?, ?, ?)`,
        [id, businessId, unit, toUnit, factor]
      );
      stats.unitConversions += 1;
    }
    replacedStores.push("Unit conversions");
  }

  // ==========================================================================
  // 6. FINANCIAL TRANSACTIONS (Sales, Purchases, Payments, Expenses, Orders, Challans)
  // ==========================================================================
  const TXN_STORE_MAPPINGS = [
    { key: "ledgerly:saleInvoices.v1", defaultType: "sale", deleteTypes: ["sale", "pos"], label: "Sales" },
    { key: "ledgerly:purchaseBills.v1", defaultType: "purchase", deleteTypes: ["purchase"], label: "Purchases" },
    { key: "ledgerly:paymentIns.v1", defaultType: "payment_in", deleteTypes: ["payment_in", "payment-in"], label: "Payment In" },
    { key: "ledgerly:paymentOuts.v1", defaultType: "payment_out", deleteTypes: ["payment_out", "payment-out"], label: "Payment Out" },
    { key: "ledgerly:estimateQuotations.v1", defaultType: "estimate", deleteTypes: ["estimate"], label: "Estimates" },
    { key: "ledgerly:proformaInvoices.v1", defaultType: "proforma", deleteTypes: ["proforma"], label: "Proforma" },
    { key: "ledgerly:deliveryChallans.v1", defaultType: "delivery_challan", deleteTypes: ["delivery_challan"], label: "Delivery challans" },
    { key: "ledgerly:expenses.v1", defaultType: "expense", deleteTypes: ["expense"], label: "Expenses" },
    { key: "ledgerly:saleReturns.v1", defaultType: "sale_return", deleteTypes: ["sale_return", "credit_note", "credit note"], label: "Sale returns" },
    { key: "ledgerly:purchaseReturns.v1", defaultType: "purchase_return", deleteTypes: ["purchase_return", "debit_note", "debit note"], label: "Purchase returns" },
    { key: "ledgerly:saleOrders.v1", defaultType: "sale_order", deleteTypes: ["sale_order"], label: "Sale orders" },
    { key: "ledgerly:purchaseOrders.v1", defaultType: "purchase_order", deleteTypes: ["purchase_order"], label: "Purchase orders" },
  ];

  const includedTxnTypes = [];
  const transactionsToInsert = [];
  const restoredTxnIds = new Set();

  for (const mapping of TXN_STORE_MAPPINGS) {
    if (Array.isArray(data[mapping.key])) {
      for (const dt of mapping.deleteTypes) {
        if (!includedTxnTypes.includes(dt)) includedTxnTypes.push(dt);
      }
      if (!replacedStores.includes(mapping.label)) replacedStores.push(mapping.label);
      for (const t of data[mapping.key]) {
        transactionsToInsert.push({ ...t, effectiveType: t.transactionType || t.type || mapping.defaultType });
      }
    }
  }

  if (includedTxnTypes.length > 0) {
    // Delete child items then headers for matching transaction types
    const placeholders = includedTxnTypes.map(() => "?").join(",");
    await conn.query(
      `DELETE ti FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id AND ti.business_id = t.business_id
       WHERE t.business_id = ? AND t.transaction_type IN (${placeholders})`,
      [businessId, ...includedTxnTypes]
    );

    await conn.query(
      `DELETE FROM transactions WHERE business_id = ? AND transaction_type IN (${placeholders})`,
      [businessId, ...includedTxnTypes]
    );

    const txnConflicts = await getConflictingIds(conn, "transactions", transactionsToInsert.map((t) => t?.id));
    const allLineIds = [];
    for (const t of transactionsToInsert) {
      const rawRows = Array.isArray(t?.rows) && t.rows.length ? t.rows : (Array.isArray(t?.items) ? t.items : []);
      for (const r of rawRows) {
        if (r?.id) allLineIds.push(r.id);
      }
    }
    const lineConflicts = await getConflictingIds(conn, "transaction_items", allLineIds);

    for (const t of transactionsToInsert) {
      if (!t) continue;
      const id = allocateRecordId(t.id, txnConflicts, txnIdMap);
      const transactionType = String(t.effectiveType).toLowerCase();
      const documentNumber = String(
        t.documentNumber ??
        t.invoiceNumber ??
        t.billNumber ??
        t.form?.invoiceNumber ??
        t.form?.billNumber ??
        t.number ??
        t.id
      ).trim();

      const rawTxnDate = t.transactionDate || t.invoiceDate || t.billDate || t.form?.invoiceDate || t.date || new Date().toISOString().slice(0, 10);
      const transactionDate = toSqlDate(rawTxnDate) || new Date().toISOString().slice(0, 10);
      const dueDate = toSqlDate(t.dueDate || t.form?.dueDate);
      const rawPartyId = t.partyId || t.form?.partyId || t.form?.customerId || t.customerId || null;
      const partyId = (rawPartyId && partyIdMap.has(rawPartyId)) ? partyIdMap.get(rawPartyId) : rawPartyId;
      const partyName = t.partyName || t.customer || t.supplier || t.party || t.form?.customer || t.form?.supplier || null;
      const partyPhone = t.partyPhone || t.phone || t.form?.phone || null;
      const partyGstin = t.partyGstin || t.gstin || t.form?.gstin || null;
      const billingAddress = t.billingAddress || t.address || t.form?.billingAddress || null;
      const shippingAddress = t.shippingAddress || t.form?.shippingAddress || null;
      const subtotal = parseFloat(t.subtotal ?? t.totals?.taxable ?? t.totals?.subTotal ?? t.totalAmount ?? 0) || 0;
      const discountPercent = parseFloat(t.discountPercent ?? t.totals?.discountPercent ?? 0) || 0;
      const discountAmount = parseFloat(t.discountAmount ?? t.totals?.discount ?? 0) || 0;
      const taxAmount = parseFloat(t.taxAmount ?? t.totals?.tax ?? 0) || 0;
      const roundOff = parseFloat(t.roundOff ?? t.totals?.roundOffAmount ?? 0) || 0;
      const totalAmount = parseFloat(t.totalAmount ?? t.totals?.finalTotal ?? t.total ?? t.amount ?? 0) || 0;
      const paidAmount = parseFloat(t.paidAmount ?? t.totals?.received ?? t.receivedAmount ?? (transactionType === "payment_in" || transactionType === "payment_out" ? totalAmount : 0)) || 0;
      const balanceAmount = parseFloat(t.balanceAmount ?? t.totals?.balance ?? Math.max(0, totalAmount - paidAmount)) || 0;
      const paymentMode = t.paymentMode || t.form?.paymentType || "Cash";
      const isCancelled =
        String(t.paymentStatus || t.status || "").trim().toLowerCase() === "cancelled";
      const paymentStatus = isCancelled
        ? "Cancelled"
        : (t.paymentStatus || (balanceAmount <= 0 ? "Completed" : "Pending"));
      const paymentRefNo = t.paymentRefNo || t.form?.paymentReference || null;
      const notes = t.notes || t.form?.description || null;
      const terms = t.terms || t.form?.terms || null;
      const termsTitle = t.termsTitle || t.form?.termsTitle || null;
      const imageUrl = t.imageUrl || t.image_url || null;
      const imageId = t.imageId || t.image_id || null;
      const documentUrl = t.documentUrl || t.document_url || null;
      const documentId = t.documentId || t.document_id || null;

      await conn.query(
        `INSERT INTO transactions (
          id, business_id, transaction_type, document_number, transaction_date, due_date,
          party_id, party_name, party_phone, party_gstin, billing_address, shipping_address,
          subtotal, discount_percent, discount_amount, tax_amount, round_off,
          total_amount, paid_amount, balance_amount, payment_mode, payment_status, payment_ref_no,
          notes, terms, terms_title, image_url, image_id, document_url, document_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, businessId, transactionType, documentNumber, transactionDate, dueDate,
          partyId, partyName, partyPhone, partyGstin, billingAddress, shippingAddress,
          subtotal, discountPercent, discountAmount, taxAmount, roundOff,
          totalAmount, paidAmount, balanceAmount, paymentMode, paymentStatus, paymentRefNo,
          notes, terms, termsTitle, imageUrl, imageId, documentUrl, documentId,
        ]
      );
      stats.transactions += 1;
      restoredTxnIds.add(id);

      // Restore transaction line items
      const rawRows = Array.isArray(t.rows) && t.rows.length ? t.rows : (Array.isArray(t.items) ? t.items : []);
      for (const row of rawRows) {
        if (!row) continue;
        const lineId = allocateRecordId(row.id, lineConflicts);
        const rawItemId = row.itemId || row.sourceItemId || null;
        const itemId = (rawItemId && itemIdMap.has(rawItemId)) ? itemIdMap.get(rawItemId) : rawItemId;
        const itemName = String(row.item || row.itemName || row.name || "Item").trim();
        const itemCode = row.itemCode || row.code || null;
        const barcode = row.barcode || null;
        const hsnCode = row.hsnCode || row.hsn || null;
        const batchNo = row.batchNo || null;
        const serialNo = row.serialNo || null;
        const quantity = parseFloat(row.qty ?? row.quantity ?? 1) || 1;
        const freeQty = parseFloat(row.freeQty ?? 0) || 0;
        const unit = row.unit || "PCS";
        const unitPrice = parseFloat(row.price ?? row.unitPrice ?? 0) || 0;
        const purchasePrice = parseFloat(row.purchasePrice ?? 0) || 0;
        const rDiscountPercent = parseFloat(row.discountPercent ?? 0) || 0;
        const rDiscountAmount = parseFloat(row.discountAmount ?? 0) || 0;
        const rTaxRate = parseFloat(String(row.taxRate || "").replace(/[^0-9.]/g, "") || 0) || 0;
        const rTaxAmount = parseFloat(row.taxAmount ?? row.sourceTaxAmount ?? 0) || 0;
        const rTotalAmount = parseFloat(row.totalAmount ?? row.amount ?? row.sourceTotalAmount ?? (quantity * unitPrice)) || 0;

        await conn.query(
          `INSERT INTO transaction_items (
            id, transaction_id, business_id, item_id, item_name, item_code, barcode,
            hsn_code, batch_no, serial_no, quantity, free_qty, unit, unit_price,
            purchase_price, discount_percent, discount_amount, tax_rate, tax_amount,
            total_amount, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lineId, id, businessId, itemId, itemName, itemCode, barcode,
            hsnCode, batchNo, serialNo, quantity, freeQty, unit, unitPrice,
            purchasePrice, rDiscountPercent, rDiscountAmount, rTaxRate, rTaxAmount,
            rTotalAmount, 1,
          ]
        );
        stats.transactionItems += 1;
      }
    }
  }

  // ==========================================================================
  // 7. CASH & BANK (bank_accounts, bank_transactions, cash_in_hand, cheques)
  // ==========================================================================
  const bankAccountsPresent = Array.isArray(data["ledgerly:bankAccounts.v1"]);
  const bankTxnsPresent = Array.isArray(data["ledgerly:bankTransactions.v1"]);

  if (bankTxnsPresent) {
    await conn.query("DELETE FROM bank_transactions WHERE business_id = ?", [businessId]);
  }
  if (bankAccountsPresent) {
    await conn.query("DELETE FROM bank_accounts WHERE business_id = ?", [businessId]);

    const bankAccounts = data["ledgerly:bankAccounts.v1"];
    const bankConflicts = await getConflictingIds(conn, "bank_accounts", bankAccounts.map((b) => b?.id));

    for (const b of bankAccounts) {
      if (!b) continue;
      const id = allocateRecordId(b.id, bankConflicts, bankAccIdMap);
      const accountName = String(b.accountName || b.bankName || "Bank Account").trim();
      const accountHolderName = b.accountHolderName || null;
      const accountNumber = b.accountNumber || null;
      const bankName = b.bankName || null;
      const ifscCode = b.ifscCode || null;
      const branchName = b.branchName || null;
      const openingBalance = parseFloat(b.openingBalance ?? 0) || 0;
      const currentBalance = parseFloat(b.currentBalance ?? openingBalance) || 0;
      const accountType = b.accountType || "Savings";
      const asOfDate = toSqlDate(b.asOfDate) || new Date().toISOString().slice(0, 10);
      const notes = b.notes || null;
      const status = b.status || "active";
      const isDefault = b.isDefault ? 1 : 0;

      await conn.query(
        `INSERT INTO bank_accounts (
          id, business_id, account_name, account_holder_name, account_number,
          bank_name, ifsc_code, branch_name, opening_balance, current_balance,
          account_type, as_of_date, notes, status, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, businessId, accountName, accountHolderName, accountNumber,
          bankName, ifscCode, branchName, openingBalance, currentBalance,
          accountType, asOfDate, notes, status, isDefault,
        ]
      );
      stats.bankAccounts += 1;
    }
    replacedStores.push("Bank accounts");
  }

  if (bankTxnsPresent) {
    const bankTxns = data["ledgerly:bankTransactions.v1"];
    const txConflicts = await getConflictingIds(conn, "bank_transactions", bankTxns.map((tx) => tx?.id));

    for (const tx of bankTxns) {
      if (!tx) continue;
      const id = allocateRecordId(tx.id, txConflicts);
      const rawAccountId = String(tx.accountId || tx.account_id || "").trim();
      const accountId = (rawAccountId && bankAccIdMap.has(rawAccountId)) ? bankAccIdMap.get(rawAccountId) : rawAccountId;
      const rawType = String(tx.type || "money-in").toLowerCase();
      const type = (rawType === "money-out" || rawType === "out" || rawType === "debit") ? "money-out" : "money-in";
      const amount = parseFloat(tx.amount ?? 0) || 0;
      const transactionDate = toSqlDate(tx.transactionDate || tx.date) || new Date().toISOString().slice(0, 10);
      const reference = tx.reference ? String(tx.reference).slice(0, 120) : null;
      const description = String(tx.description || tx.desc || "Bank Transaction").slice(0, 240);
      const relatedParty = (tx.relatedParty || tx.partyName || tx.party) ? String(tx.relatedParty || tx.partyName || tx.party).slice(0, 120) : null;
      const createdAt = toSqlDate(tx.createdAt) ? new Date(tx.createdAt) : new Date();

      await conn.query(
        `INSERT INTO bank_transactions (
          id, business_id, account_id, type, amount,
          transaction_date, reference, description, related_party, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, accountId, type, amount, transactionDate, reference, description, relatedParty, createdAt]
      );
      stats.bankTransactions += 1;
    }

    // Recalculate account current balances to match restored transactions
    await conn.query(
      `UPDATE bank_accounts
       SET current_balance = opening_balance + COALESCE((
         SELECT SUM(CASE WHEN type = 'money-in' THEN amount WHEN type = 'money-out' THEN -amount ELSE 0 END)
         FROM bank_transactions
         WHERE business_id = ? AND account_id = bank_accounts.id
       ), 0)
       WHERE business_id = ?`,
      [businessId, businessId]
    );
    replacedStores.push("Bank transactions");
  }

  if (Array.isArray(data["ledgerly:cashAdjustments.v1"])) {
    await conn.query("DELETE FROM cash_in_hand WHERE business_id = ?", [businessId]);
    const cashAdjustments = data["ledgerly:cashAdjustments.v1"];
    const cashConflicts = await getConflictingIds(conn, "cash_in_hand", cashAdjustments.map((c) => c?.id));

    for (const c of cashAdjustments) {
      if (!c) continue;
      const rawId = c.id != null ? String(c.id).trim() : "";
      const referenceType = c.referenceType || c.reference_type || null;
      const isManualAdjustment = String(referenceType || "").trim().toLowerCase() === "adjustment";
      const mappedTxnId = !isManualAdjustment && rawId && txnIdMap.has(rawId) ? txnIdMap.get(rawId) : null;

      let id;
      if (mappedTxnId && !cashConflicts.has(mappedTxnId)) {
        id = mappedTxnId;
        cashConflicts.add(id);
      } else if (!isManualAdjustment && rawId && restoredTxnIds.has(rawId) && !cashConflicts.has(rawId)) {
        id = rawId;
        cashConflicts.add(id);
      } else {
        id = allocateRecordId(c.id, cashConflicts);
      }

      const hasRestoredParent = !isManualAdjustment && restoredTxnIds.has(id);
      const provenance = isManualAdjustment
        ? CASH_PROVENANCE.MANUAL_ADJUSTMENT
        : hasRestoredParent
          ? CASH_PROVENANCE.TRANSACTION
          : CASH_PROVENANCE.RESTORED_HISTORY;

      const entryDate = toSqlDate(c.entryDate || c.date) || new Date().toISOString().slice(0, 10);
      const entryType = String(c.entryType || c.type || "in").toLowerCase() === "out" ? "out" : "in";
      const amount = parseFloat(c.amount ?? 0) || 0;
      const rawPartyId = c.partyId || null;
      const partyId = (rawPartyId && partyIdMap.has(rawPartyId)) ? partyIdMap.get(rawPartyId) : rawPartyId;
      const partyName = c.partyName || null;
      const referenceNo = c.referenceNo || c.reference_no || null;
      const description = c.description || null;

      await conn.query(
        `INSERT INTO cash_in_hand (
          id, business_id, entry_date, entry_type, amount,
          party_id, party_name, reference_type, reference_no, description, provenance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, entryDate, entryType, amount, partyId, partyName, referenceType, referenceNo, description, provenance]
      );
      stats.cashAdjustments += 1;
    }
    replacedStores.push("Cash in hand");
  }

  const chequeKey = Object.keys(data).find((k) =>
    k === "usv.cheques.v1" || k.startsWith("usv.cheques.v1:") ||
    k === "ledgerly:cheques.v1" || k.startsWith("ledgerly:cheques.v1:")
  );
  if (chequeKey && Array.isArray(data[chequeKey])) {
    await conn.query("DELETE FROM cheques WHERE business_id = ?", [businessId]);
    const cheques = data[chequeKey];
    const chqConflicts = await getConflictingIds(conn, "cheques", cheques.map((chq) => chq?.id));

    for (const chq of cheques) {
      if (!chq) continue;
      const id = allocateRecordId(chq.id, chqConflicts);
      const rawPartyId = chq.partyId || null;
      const partyId = (rawPartyId && partyIdMap.has(rawPartyId)) ? partyIdMap.get(rawPartyId) : rawPartyId;
      const partyName = String(chq.partyName || chq.party || "Party").trim();
      const chequeNumber = String(chq.chequeNumber || chq.number || "000000").trim();
      const bankName = String(chq.bankName || "Bank").trim();
      const amount = parseFloat(chq.amount ?? 0) || 0;
      const chequeDate = toSqlDate(chq.chequeDate || chq.date) || new Date().toISOString().slice(0, 10);
      const chequeType = String(chq.chequeType || chq.type || "received").toLowerCase() === "issued" ? "issued" : "received";
      const status = String(chq.status || "pending").toLowerCase();
      const depositDate = toSqlDate(chq.depositDate);
      const clearanceDate = toSqlDate(chq.clearanceDate);
      const notes = chq.notes || null;

      await conn.query(
        `INSERT INTO cheques (
          id, business_id, party_id, party_name, cheque_number, bank_name,
          amount, cheque_date, cheque_type, status, deposit_date, clearance_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, partyId, partyName, chequeNumber, bankName, amount, chequeDate, chequeType, status, depositDate, clearanceDate, notes]
      );
      stats.cheques += 1;
    }
    replacedStores.push("Cheques");
  }

  // ==========================================================================
  // 8. LOANS & LOAN REPAYMENTS (usv.loanAccounts.v1 or scoped key)
  // ==========================================================================
  const loanKey = Object.keys(data).find((k) =>
    k === "usv.loanAccounts.v1" || k.startsWith("usv.loanAccounts.v1:") ||
    k === "ledgerly:loanAccounts.v1" || k.startsWith("ledgerly:loanAccounts.v1:")
  );
  if (loanKey && Array.isArray(data[loanKey])) {
    // Delete child repayments first, then loan accounts
    await conn.query("DELETE FROM loan_repayments WHERE business_id = ?", [businessId]);
    await conn.query("DELETE FROM loan_accounts WHERE business_id = ?", [businessId]);

    const loans = data[loanKey];
    const loanConflicts = await getConflictingIds(conn, "loan_accounts", loans.map((l) => l?.id));
    const allRepayIds = [];
    for (const l of loans) {
      if (Array.isArray(l?.repayments)) {
        for (const r of l.repayments) {
          if (r?.id) allRepayIds.push(r.id);
        }
      }
    }
    const repayConflicts = await getConflictingIds(conn, "loan_repayments", allRepayIds);

    for (const l of loans) {
      if (!l) continue;
      const id = allocateRecordId(l.id, loanConflicts, loanIdMap);
      const accountName = String(l.accountName || l.name || "Loan Account").trim();
      const lenderName = String(l.lenderName || l.lender || "Lender").trim();
      const accountNumber = l.accountNumber || "";
      const loanType = l.loanType || "Term Loan";
      const principalAmount = parseFloat(l.principalAmount ?? l.amount ?? 0) || 0;
      const currentBalance = parseFloat(l.currentBalance ?? principalAmount) || 0;
      const interestRate = parseFloat(l.interestRate ?? 0) || 0;
      const termMonths = parseInt(l.termMonths ?? 12, 10) || 12;
      const emiAmount = parseFloat(l.emiAmount ?? 0) || 0;
      const startDate = toSqlDate(l.startDate || l.date);
      const status = l.status || "Active";
      const closedDate = toSqlDate(l.closedDate);

      await conn.query(
        `INSERT INTO loan_accounts (
          id, business_id, account_name, lender_name, account_number, loan_type,
          principal_amount, current_balance, interest_rate, term_months, emi_amount,
          start_date, status, closed_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, accountName, lenderName, accountNumber, loanType, principalAmount, currentBalance, interestRate, termMonths, emiAmount, startDate, status, closedDate]
      );
      stats.loanAccounts += 1;

      // Restore child loan repayments if present
      const repayments = Array.isArray(l.repayments) ? l.repayments : [];
      for (const r of repayments) {
        if (!r) continue;
        const repayId = allocateRecordId(r.id, repayConflicts);
        const paymentDate = toSqlDate(r.paymentDate || r.date) || new Date().toISOString().slice(0, 10);
        const amountPaid = parseFloat(r.amountPaid ?? r.amount ?? 0) || 0;
        const principalPaid = parseFloat(r.principalPaid ?? 0) || 0;
        const interestPaid = parseFloat(r.interestPaid ?? 0) || 0;
        const paymentMode = String(r.paymentMode || "bank").slice(0, 32);
        const reference = r.reference ? String(r.reference).slice(0, 100) : null;
        const notes = r.notes || null;

        await conn.query(
          `INSERT INTO loan_repayments (
            id, business_id, loan_id, payment_date, amount_paid,
            principal_paid, interest_paid, payment_mode, reference, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [repayId, businessId, id, paymentDate, amountPaid, principalPaid, interestPaid, paymentMode, reference, notes]
        );
        stats.loanRepayments += 1;
      }
    }
    replacedStores.push("Loans");
  }

  // ==========================================================================
  // 9. SERVICE REMINDERS & HISTORY (serviceReminderRecords or scoped key)
  // ==========================================================================
  const reminderKey = Object.keys(data).find((k) =>
    k === "ledgerly:serviceReminderRecords.v1" || k.startsWith("ledgerly:serviceReminderRecords.v1:") ||
    k === "ledgerly:serviceReminders.v1" || k.startsWith("ledgerly:serviceReminders.v1:")
  );
  if (reminderKey && Array.isArray(data[reminderKey])) {
    // Delete child history first, then reminders
    await conn.query("DELETE FROM service_reminder_history WHERE business_id = ?", [businessId]);
    await conn.query("DELETE FROM service_reminders WHERE business_id = ?", [businessId]);

    const reminders = data[reminderKey];
    const remConflicts = await getConflictingIds(conn, "service_reminders", reminders.map((r) => r?.id));
    const allHistIds = [];
    for (const r of reminders) {
      const historyItems = Array.isArray(r?.notificationHistory) ? r.notificationHistory
        : (Array.isArray(r?.history) ? r.history : []);
      for (const h of historyItems) {
        if (h?.id) allHistIds.push(h.id);
      }
    }
    const histConflicts = await getConflictingIds(conn, "service_reminder_history", allHistIds);

    for (const r of reminders) {
      if (!r) continue;
      const id = allocateRecordId(r.id, remConflicts, reminderIdMap);
      const rawPartyId = r.partyId || r.customerId || null;
      const partyId = (rawPartyId && partyIdMap.has(rawPartyId)) ? partyIdMap.get(rawPartyId) : rawPartyId;
      const customerName = String(r.customerName || r.customer || r.partyName || "Customer").trim();
      const customerPhone = r.customerPhone || r.phone || null;
      const customerEmail = r.customerEmail || r.email || null;
      const serviceName = String(r.serviceName || r.service || "Service").trim();
      const serviceDate = toSqlDate(r.serviceDate || r.date) || new Date().toISOString().slice(0, 10);
      const serviceDueDate = toSqlDate(r.serviceDueDate || r.dueDate) || new Date().toISOString().slice(0, 10);
      const status = r.status || "Active";
      const lastNotifiedAt = toSqlDate(r.lastNotifiedAt);
      const lastNotifiedChannel = r.lastNotifiedChannel || null;
      const lastNotifiedDueDate = toSqlDate(r.lastNotifiedDueDate);
      const notes = r.notes || null;

      await conn.query(
        `INSERT INTO service_reminders (
          id, business_id, party_id, customer_name, customer_phone, customer_email,
          service_name, service_date, service_due_date, status,
          last_notified_at, last_notified_channel, last_notified_due_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, partyId, customerName, customerPhone, customerEmail, serviceName, serviceDate, serviceDueDate, status, lastNotifiedAt, lastNotifiedChannel, lastNotifiedDueDate, notes]
      );
      stats.serviceReminders += 1;

      // Restore child history if present
      const historyItems = Array.isArray(r.notificationHistory) ? r.notificationHistory
        : (Array.isArray(r.history) ? r.history : []);
      for (const h of historyItems) {
        if (!h) continue;
        const histId = allocateRecordId(h.id, histConflicts);
        const channel = String(h.channel || "whatsapp").slice(0, 50);
        const recipient = String(h.recipient || customerPhone || "recipient").slice(0, 64);
        const messageText = h.messageText || h.message || null;
        const dueDate = toSqlDate(h.dueDate);
        const hStatus = String(h.status || "Sent").slice(0, 50);
        const sentAt = toSqlDate(h.sentAt || h.at || h.timestamp) || new Date().toISOString().slice(0, 19).replace("T", " ");

        await conn.query(
          `INSERT INTO service_reminder_history (
            id, reminder_id, business_id, channel, recipient,
            message_text, due_date, status, sent_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [histId, id, businessId, channel, recipient, messageText, dueDate, hStatus, sentAt]
        );
        stats.serviceReminderHistory += 1;
      }
    }
    replacedStores.push("Service reminders");
  }

  // ==========================================================================
  // 10. APP SETTINGS & PRINT SETTINGS (ledgerly:appSettings.v1)
  // ==========================================================================
  if (data["ledgerly:appSettings.v1"] && typeof data["ledgerly:appSettings.v1"] === "object" && !Array.isArray(data["ledgerly:appSettings.v1"])) {
    const settings = data["ledgerly:appSettings.v1"];
    for (const [key, val] of Object.entries(settings)) {
      const settingVal = typeof val === "string" ? val : JSON.stringify(val);
      await conn.query(
        `INSERT INTO app_settings (business_id, setting_key, setting_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [businessId, key, settingVal]
      );
      stats.appSettings += 1;
    }
    replacedStores.push("Settings");
  }

  if (data["ledgerly:printSettings.v1"] && typeof data["ledgerly:printSettings.v1"] === "object") {
    await conn.query(
      `INSERT INTO app_settings (business_id, setting_key, setting_value)
       VALUES (?, 'print_settings', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [businessId, JSON.stringify(data["ledgerly:printSettings.v1"])]
    );
  }

  // ==========================================================================
  // 11. EXPENSE CATEGORIES & ITEMS
  // ==========================================================================
  if (normalizedExpenseCategories !== null) {
    await conn.query("DELETE FROM expense_categories WHERE business_id = ?", [businessId]);
    const ecConflicts = await getConflictingIds(
      conn,
      "expense_categories",
      normalizedExpenseCategories.map((ec) => ec.rawId)
    );
    for (const ec of normalizedExpenseCategories) {
      const id = allocateRecordId(ec.rawId, ecConflicts);
      await conn.query(
        `INSERT INTO expense_categories (id, business_id, category_name, expense_type, created_at)
         VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP(3)))`,
        [id, businessId, ec.name, ec.expenseType, ec.createdAt]
      );
      stats.expenseCategories += 1;
    }
    replacedStores.push("Expense categories");
  }

  if (normalizedExpenseItems !== null) {
    await conn.query("DELETE FROM expense_items WHERE business_id = ?", [businessId]);
    const eiConflicts = await getConflictingIds(
      conn,
      "expense_items",
      normalizedExpenseItems.map((ei) => ei.rawId)
    );
    for (const ei of normalizedExpenseItems) {
      const id = allocateRecordId(ei.rawId, eiConflicts);
      await conn.query(
        `INSERT INTO expense_items (
          id, business_id, item_name, price, tax_rate, hsn_code, description, category, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP(3)), COALESCE(?, CURRENT_TIMESTAMP(3)))`,
        [
          id,
          businessId,
          ei.itemName,
          ei.price,
          ei.taxRate,
          ei.hsnCode,
          ei.description,
          ei.category,
          ei.createdAt,
          ei.updatedAt,
        ]
      );
      stats.expenseItems += 1;
    }
    replacedStores.push("Expense items");
  }

  // ==========================================================================
  // 12. ONLINE STORE SETTINGS & ORDERS
  // ==========================================================================
  if (data["ledgerly:onlineStoreSettings.v1"] && typeof data["ledgerly:onlineStoreSettings.v1"] === "object" && !Array.isArray(data["ledgerly:onlineStoreSettings.v1"])) {
    const oss = data["ledgerly:onlineStoreSettings.v1"];
    await conn.query(
      `INSERT INTO online_store_settings (
        business_id, store_name, subdomain, contact_phone, contact_email, address,
        currency, is_store_enabled, delivery_charges, min_order_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        store_name = VALUES(store_name),
        subdomain = VALUES(subdomain),
        contact_phone = VALUES(contact_phone),
        contact_email = VALUES(contact_email),
        address = VALUES(address),
        currency = VALUES(currency),
        is_store_enabled = VALUES(is_store_enabled),
        delivery_charges = VALUES(delivery_charges),
        min_order_amount = VALUES(min_order_amount)`,
      [
        businessId,
        oss.storeName || "My Store",
        oss.subdomain || null,
        oss.contactPhone || null,
        oss.contactEmail || null,
        oss.address || null,
        oss.currency || "INR",
        oss.isStoreEnabled !== false ? 1 : 0,
        parseFloat(oss.deliveryCharges ?? 0) || 0,
        parseFloat(oss.minOrderAmount ?? 0) || 0,
      ]
    );
    stats.onlineStoreSettings = 1;
  }

  if (Array.isArray(data["ledgerly:onlineStoreOrders.v1"])) {
    await conn.query("DELETE FROM online_store_order_items WHERE business_id = ?", [businessId]);
    await conn.query("DELETE FROM online_store_orders WHERE business_id = ?", [businessId]);
    for (const ord of data["ledgerly:onlineStoreOrders.v1"]) {
      if (!ord) continue;
      const id = String(ord.id || crypto.randomUUID());
      const orderNumber = String(ord.orderNumber || ord.id).trim();
      const customerName = String(ord.customerName || "Customer").trim();
      const customerPhone = String(ord.customerPhone || "").trim();
      const deliveryAddress = ord.deliveryAddress || null;
      const totalAmount = parseFloat(ord.totalAmount ?? 0) || 0;
      const itemCount = parseInt(ord.itemCount ?? 1, 10) || 1;
      const orderStatus = ord.orderStatus || "pending";
      const paymentStatus = ord.paymentStatus || "unpaid";
      const paymentMethod = ord.paymentMethod || "cod";

      await conn.query(
        `INSERT INTO online_store_orders (
          id, business_id, order_number, customer_name, customer_phone,
          delivery_address, total_amount, item_count, order_status,
          payment_status, payment_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, orderNumber, customerName, customerPhone, deliveryAddress, totalAmount, itemCount, orderStatus, paymentStatus, paymentMethod]
      );
      stats.onlineStoreOrders += 1;
    }
  }

  const totalRestoredCount = Object.values(stats).reduce((sum, count) => sum + count, 0);

  return {
    success: true,
    message: `USV backup restored successfully to MySQL (${totalRestoredCount} records across ${replacedStores.length} stores).`,
    businessId,
    stats,
    totalRestoredCount,
    replacedStores,
  };
}
