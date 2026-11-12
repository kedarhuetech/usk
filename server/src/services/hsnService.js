// Service for HSN and SAC Code lookup, searching, parsing, bulk importing, and tax calculation.
import fs from "node:fs";
import path from "node:path";
import * as xlsxModule from "xlsx";
import { pool } from "../db/mysql.js";

const xlsx = xlsxModule.default || xlsxModule;

/**
 * Normalizes an HSN or SAC code by removing dots, spaces, dashes, leading/trailing whitespace,
 * and pads stripped leading zeroes (e.g., 202 -> 0202, 1 -> 01).
 */
export function normalizeHsnCode(rawCode) {
  if (rawCode === null || rawCode === undefined) return "";
  let codeStr = String(rawCode).trim().replace(/[\s.\-_/]/g, "");
  if (!codeStr) return "";

  // If bracketed like [050790] or [1404
  const match = codeStr.match(/([0-9]{2,8})/);
  if (match) {
    codeStr = match[1];
  }

  // If entirely numeric, pad odd lengths caused by Excel numeric stripping
  if (/^[0-9]+$/.test(codeStr)) {
    if (codeStr.length === 1) codeStr = codeStr.padStart(2, "0");
    else if (codeStr.length === 3) codeStr = codeStr.padStart(4, "0");
    else if (codeStr.length === 5) codeStr = codeStr.padStart(6, "0");
    else if (codeStr.length === 7) codeStr = codeStr.padStart(8, "0");
  }

  // Valid HSN/SAC codes in GST are numeric between 2 and 8 digits
  if (!/^[0-9]{2,8}$/.test(codeStr)) return "";

  return codeStr;
}

/**
 * Determines code type: SAC if code starts with '99' or explicitly specified, otherwise HSN.
 */
export function determineCodeType(code, explicitType = "") {
  const normalizedType = String(explicitType || "").trim().toUpperCase();
  if (normalizedType === "SAC" || normalizedType === "HSN") return normalizedType;
  return code.startsWith("99") ? "SAC" : "HSN";
}

/**
 * Parses and cleans rate strings and numeric fractions safely into decimal percentages.
 */
export function cleanRate(val) {
  if (val === null || val === undefined || val === "") return null;

  if (typeof val === "number") {
    if (val === 0) return 0.0;
    // Excel percent cells formatted as ratio (e.g. 0.05 for 5%, 0.18 for 18%, 0.0025 for 0.25%)
    if (val > 0 && val < 1) return Number((val * 100).toFixed(4));
    if (val > 300) return null; // Filter out years like 2017/2020 or notification numbers
    return Number(val.toFixed(2));
  }

  const str = String(val).trim();
  if (!str) return null;

  // Handle Nil, exempt, zero, dashes
  if (/^(nil|zero|-|exempt|none|n\.?a\.?)$/i.test(str)) return 0.0;

  // Handle explicit percentage patterns like "5%", "18%", "2.5% + Cess"
  const percentMatch = str.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (percentMatch) {
    const num = Number.parseFloat(percentMatch[1]);
    if (num > 300) return null;
    return num;
  }

  // Handle leading numeric string (e.g. "18", "5", "0.05")
  const numMatch = str.match(/^[0-9]+(?:\.[0-9]+)?/);
  if (numMatch) {
    const num = Number.parseFloat(numMatch[0]);
    if (num > 0 && num < 1) return Number((num * 100).toFixed(4));
    if (num > 300) return null;
    return Number(num.toFixed(2));
  }

  return null;
}

export const parseGstRate = cleanRate;
export const parseCessRate = cleanRate;

/**
 * Robust RFC-compliant CSV parser handling quoted multiline cells.
 */
export function parseCsvText(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (c === "," && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
    } else if ((c === "\r" || c === "\n") && !insideQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += c;
    }
  }

  if (currentCell || currentRow.length) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parses an Excel or CSV file buffer / filepath into structured HSN records.
 */
export function parseHsnData(input, explicitDefaultType = "") {
  let isCsv = false;
  let csvText = "";

  if (typeof input === "string") {
    if (input.toLowerCase().endsWith(".csv")) {
      isCsv = true;
      csvText = fs.readFileSync(input, "utf8");
    }
  } else if (Buffer.isBuffer(input)) {
    const sample = input.subarray(0, 1024).toString("utf8");
    if (sample.includes(",") && !sample.includes("PK\x03\x04")) {
      isCsv = true;
      csvText = input.toString("utf8");
    }
  }

  if (isCsv) {
    const rawRows = parseCsvText(csvText);
    return processRaw2dRows(rawRows, explicitDefaultType);
  }

  // Otherwise parse with xlsx (Excel spreadsheets)
  let workbook;
  if (Buffer.isBuffer(input)) {
    workbook = xlsx.read(input, { type: "buffer" });
  } else if (typeof input === "string") {
    workbook = xlsx.readFile(input);
  } else {
    throw new Error("Invalid input: Expected Buffer or file path string.");
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) throw new Error("Spreadsheet contains no sheets.");

  const allRecords = [];
  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const sheetType = /sac/i.test(sheetName) ? "SAC" : explicitDefaultType;
    const recs = processRaw2dRows(rawRows, sheetType);
    allRecords.push(...recs);
  }

  return allRecords;
}

function processRaw2dRows(rawRows, defaultType = "") {
  if (!rawRows || rawRows.length < 2) return [];

  // Header detection
  let headerIndex = -1;
  let codeColIdx = -1;
  let descColIdx = -1;
  let rateColIdx = -1;
  let cgstColIdx = -1;
  let sgstColIdx = -1;
  let cessColIdx = -1;
  let typeColIdx = -1;

  for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;

    const rowStrings = row.map((cell) => String(cell || "").trim().toLowerCase());

    const cIdx = rowStrings.findIndex((c) =>
      /^(hsn|sac|hsn\/sac|hsn[\s_]?code|sac[\s_]?code|hsn[\s_]?cd|sac[\s_]?cd|code|tariff[\s_]?item|chapter|heading)$/.test(c) ||
      c.includes("hsn code") ||
      c.includes("sac code") ||
      c.includes("hsn_cd") ||
      c.includes("sac_cd")
    );

    const dIdx = rowStrings.findIndex((c) =>
      /^(description|desc|description[\s_]?of[\s_]?goods|description[\s_]?of[\s_]?service|description[\s_]?of[\s_]?services|hsn[\s_]?description|sac[\s_]?description|product[\s_]?description|service[\s_]?description|details|commodity|item[\s_]?description)$/.test(c) ||
      c.includes("description")
    );

    if (cIdx !== -1 && dIdx !== -1) {
      headerIndex = i;
      codeColIdx = cIdx;
      descColIdx = dIdx;

      rateColIdx = rowStrings.findIndex((c) =>
        /^(igst|igst[\s_]?rate|igst[\s_]?rate\s*\(%\)|gst|gst[\s_]?rate|tax|tax[\s_]?rate|rate|rate\s*\(%\)|gst%)$/.test(c) ||
        c.includes("gst rate") ||
        c.includes("igst rate") ||
        c.includes("tax rate")
      );

      cgstColIdx = rowStrings.findIndex((c) => /^(cgst|cgst[\s_]?rate|cgst\s*\(%\))$/.test(c));
      sgstColIdx = rowStrings.findIndex((c) => /^(sgst|sgst[\s_]?rate|sgst\s*\(%\))$/.test(c));

      cessColIdx = rowStrings.findIndex((c) =>
        /^(cess|compensation[\s_]?cess|cess[\s_]?rate|cess\s*\(%\))$/.test(c) ||
        c.includes("compensation cess")
      );

      typeColIdx = rowStrings.findIndex((c) => /^(type|category|hsn[\s_/]sac)$/.test(c));
      break;
    }
  }

  if (headerIndex === -1) {
    headerIndex = 0;
    codeColIdx = 0;
    descColIdx = 1;
    rateColIdx = 2;
  }

  const records = [];
  const seen = new Set();

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawCode = row[codeColIdx];
    const rawDesc = row[descColIdx];
    const rawRate = rateColIdx !== -1 ? row[rateColIdx] : null;
    const rawCgst = cgstColIdx !== -1 ? row[cgstColIdx] : null;
    const rawSgst = sgstColIdx !== -1 ? row[sgstColIdx] : null;
    const rawCess = cessColIdx !== -1 ? row[cessColIdx] : null;
    const rawType = typeColIdx !== -1 ? row[typeColIdx] : defaultType;

    const code = normalizeHsnCode(rawCode);
    const description = String(rawDesc || "").trim().replace(/\s+/g, " ");

    if (!code || !description || description.toLowerCase() === "description") continue;

    let gstRate = cleanRate(rawRate);
    if (gstRate === null && rawCgst && rawSgst) {
      const cgst = cleanRate(rawCgst);
      const sgst = cleanRate(rawSgst);
      if (cgst !== null && sgst !== null) {
        gstRate = Number((cgst + sgst).toFixed(2));
      }
    }

    const cessRate = cleanRate(rawCess) || 0.0;
    const type = determineCodeType(code, rawType);

    const dedupKey = `${code}|${description.slice(0, 100)}|${gstRate}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    records.push({
      code,
      description,
      type,
      gst_rate: gstRate,
      cess_rate: cessRate,
    });
  }

  return records;
}

/**
 * Fast batch insert of HSN records in chunks.
 */
export async function batchUpsertHsnCodes(records, batchSize = 1000) {
  if (!records || records.length === 0) return 0;

  let totalInserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const values = batch.map((r) => [
      r.code,
      r.description,
      r.type,
      r.gst_rate !== null && r.gst_rate !== undefined ? r.gst_rate : null,
      r.cess_rate !== null && r.cess_rate !== undefined ? r.cess_rate : 0.0,
    ]);

    const sql = `
      INSERT INTO hsn_codes (code, description, type, gst_rate, cess_rate)
      VALUES ?
    `;

    await pool.query(sql, [values]);
    totalInserted += batch.length;
  }

  // Automatically backfill child rows after upserting parent rates
  await syncInheritedRates();

  return totalInserted;
}

/**
 * Imports ONLY the two official CBIC files (services + goods) into the database.
 * Replaces any existing data so the database contains strictly CBIC data.
 */
export async function importCbicFilesOnly() {
  const downloadDir = "C:/Users/pp102/Downloads";
  const repoDataDir = path.resolve(process.cwd(), "server/data");

  // Determine paths for both files
  const servicesFile = fs.existsSync(path.join(repoDataDir, "cbic_services_rates.csv"))
    ? path.join(repoDataDir, "cbic_services_rates.csv")
    : path.join(downloadDir, "cbic_services_rates.csv");

  const goodsFile = fs.existsSync(path.join(repoDataDir, "cbic_gst_rates.csv"))
    ? path.join(repoDataDir, "cbic_gst_rates.csv")
    : path.join(downloadDir, "cbic_gst_rates.csv");

  if (!fs.existsSync(servicesFile) || !fs.existsSync(goodsFile)) {
    throw new Error(`CBIC files missing. Expected ${servicesFile} and ${goodsFile}`);
  }

  console.log("Loading CBIC services rates from:", servicesFile);
  const servicesRecords = parseHsnData(servicesFile, "SAC");

  console.log("Loading CBIC goods rates from:", goodsFile);
  const goodsRecords = parseHsnData(goodsFile, "HSN");

  const allRecords = [...servicesRecords, ...goodsRecords];

  // Truncate table to ensure only CBIC data is present
  await pool.query("TRUNCATE TABLE hsn_codes");

  const count = await batchUpsertHsnCodes(allRecords, 1000);
  console.log(`Successfully stored ${count} CBIC records in MySQL (Services: ${servicesRecords.length}, Goods: ${goodsRecords.length})`);

  return {
    success: true,
    totalCount: count,
    servicesCount: servicesRecords.length,
    goodsCount: goodsRecords.length,
  };
}

/**
 * Post-import sync step:
 * Automatically backfills gst_rate and cess_rate onto child rows
 * from 4-digit heading or 2-digit chapter parents when child gst_rate is NULL.
 */
export async function syncInheritedRates() {
  try {
    const [headingResult] = await pool.query(`
      UPDATE hsn_codes child
      JOIN hsn_codes parent ON parent.code = LEFT(child.code, 4) AND parent.gst_rate IS NOT NULL
      SET child.gst_rate = parent.gst_rate,
          child.cess_rate = IF(child.cess_rate IS NULL OR child.cess_rate = 0, COALESCE(parent.cess_rate, 0), child.cess_rate)
      WHERE LENGTH(child.code) > 4 AND child.gst_rate IS NULL
    `);

    const [chapterResult] = await pool.query(`
      UPDATE hsn_codes child
      JOIN hsn_codes parent ON parent.code = LEFT(child.code, 2) AND parent.gst_rate IS NOT NULL
      SET child.gst_rate = parent.gst_rate,
          child.cess_rate = IF(child.cess_rate IS NULL OR child.cess_rate = 0, COALESCE(parent.cess_rate, 0), child.cess_rate)
      WHERE LENGTH(child.code) > 2 AND child.gst_rate IS NULL
    `);

    const updatedTotal = (headingResult?.affectedRows || 0) + (chapterResult?.affectedRows || 0);
    return { success: true, updatedChildRows: updatedTotal };
  } catch (error) {
    console.warn("syncInheritedRates warning:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Longest-prefix rate resolver:
 * 1. Check exact code match
 * 2. Check 6-digit prefix
 * 3. Check 4-digit heading
 * 4. Check 2-digit chapter
 * 5. Default to 18.0% GST / 0.0% Cess if no prefix match exists.
 */
export async function resolveEffectiveRate(code) {
  const normalized = normalizeHsnCode(code);
  if (!normalized) {
    return {
      gstRate: 18.0,
      cessRate: 0.0,
      rateSource: "default",
      inheritedFrom: null,
      matchedRecord: null,
    };
  }

  const candidates = [normalized];
  if (normalized.length > 6) candidates.push(normalized.slice(0, 6));
  if (normalized.length > 4) candidates.push(normalized.slice(0, 4));
  if (normalized.length > 2) candidates.push(normalized.slice(0, 2));

  const [rows] = await pool.query(
    "SELECT id, code, description, type, gst_rate, cess_rate FROM hsn_codes WHERE code IN (?) ORDER BY LENGTH(code) DESC, id ASC",
    [candidates]
  );

  const exactRow = (rows || []).find((r) => r.code === normalized);

  if (exactRow && exactRow.gst_rate !== null && exactRow.gst_rate !== undefined) {
    return {
      gstRate: Number(exactRow.gst_rate),
      cessRate: Number(exactRow.cess_rate || 0.0),
      rateSource: "exact",
      inheritedFrom: exactRow.code,
      matchedRecord: exactRow,
    };
  }

  for (const prefix of candidates.slice(1)) {
    const parentRow = (rows || []).find((r) => r.code === prefix && r.gst_rate !== null && r.gst_rate !== undefined);
    if (parentRow) {
      let sourceLabel = "parent";
      if (prefix.length === 6) sourceLabel = "6-digit-prefix";
      else if (prefix.length === 4) sourceLabel = "4-digit-heading";
      else if (prefix.length === 2) sourceLabel = "2-digit-chapter";

      return {
        gstRate: Number(parentRow.gst_rate),
        cessRate: Number(parentRow.cess_rate || 0.0),
        rateSource: sourceLabel,
        inheritedFrom: parentRow.code,
        matchedRecord: exactRow || parentRow,
      };
    }
  }

  return {
    gstRate: 18.0,
    cessRate: 0.0,
    rateSource: "default",
    inheritedFrom: null,
    matchedRecord: exactRow || null,
  };
}

/**
 * Look up HSN/SAC code with parent chapter/heading context and longest-prefix fallback rate.
 */
export async function lookupHsnCode(code) {
  const normalized = normalizeHsnCode(code);
  if (!normalized) return null;

  const resolution = await resolveEffectiveRate(normalized);
  const data = resolution.matchedRecord;

  if (!data) return null;

  let chapterContext = null;
  if (normalized.length > 2) {
    const chapterCode = normalized.slice(0, 2);
    const headingCode = normalized.length > 4 ? normalized.slice(0, 4) : (normalized.length === 4 ? normalized : null);

    const lookupCodes = [chapterCode];
    if (headingCode && headingCode !== chapterCode) lookupCodes.push(headingCode);

    const [parentRows] = await pool.query(
      "SELECT code, description FROM hsn_codes WHERE code IN (?)",
      [lookupCodes]
    );

    const parentsMap = new Map();
    (parentRows || []).forEach((p) => parentsMap.set(p.code, p.description));

    chapterContext = {
      chapterCode,
      chapterDescription: parentsMap.get(chapterCode) || null,
      headingCode: headingCode || null,
      headingDescription: headingCode ? (parentsMap.get(headingCode) || null) : null,
    };
  }

  return {
    code: data.code,
    description: data.description,
    type: data.type || determineCodeType(data.code),
    gst_rate: resolution.gstRate,
    cess_rate: resolution.cessRate,
    rateSource: resolution.rateSource,
    inheritedFrom: resolution.inheritedFrom,
    updated_at: data.updated_at,
    chapterContext,
  };
}

/**
 * Calculates GST & Cess tax amounts for intra-state (CGST + SGST) vs inter-state (IGST).
 */
export async function calculateHsnTax({
  code,
  amount = 0,
  isInterState = null,
  partyState = "",
  businessState = "",
}) {
  const taxableAmount = Math.max(0, Number(amount) || 0);
  const resolution = await resolveEffectiveRate(code);

  const gstRate = Number(resolution.gstRate);
  const cessRate = Number(resolution.cessRate || 0.0);

  let interstate = false;
  if (typeof isInterState === "boolean") {
    interstate = isInterState;
  } else if (partyState && businessState) {
    interstate = partyState.trim().toLowerCase() !== businessState.trim().toLowerCase();
  }

  let cgstRate = 0.0;
  let cgstAmount = 0.0;
  let sgstRate = 0.0;
  let sgstAmount = 0.0;
  let igstRate = 0.0;
  let igstAmount = 0.0;

  if (interstate) {
    igstRate = gstRate;
    igstAmount = Number(((taxableAmount * igstRate) / 100).toFixed(2));
  } else {
    cgstRate = Number((gstRate / 2).toFixed(2));
    sgstRate = Number((gstRate / 2).toFixed(2));
    cgstAmount = Number(((taxableAmount * cgstRate) / 100).toFixed(2));
    sgstAmount = Number(((taxableAmount * sgstRate) / 100).toFixed(2));
  }

  const cessAmount = Number(((taxableAmount * cessRate) / 100).toFixed(2));
  const totalTax = Number((cgstAmount + sgstAmount + igstAmount + cessAmount).toFixed(2));
  const totalAmount = Number((taxableAmount + totalTax).toFixed(2));

  return {
    success: true,
    code: normalizeHsnCode(code),
    type: determineCodeType(code),
    description: resolution.matchedRecord?.description || "GST Item",
    rateSource: resolution.rateSource,
    inheritedFrom: resolution.inheritedFrom,
    taxableAmount,
    gstRate,
    cessRate,
    isInterState: interstate,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    cessAmount,
    totalTax,
    totalAmount,
  };
}

/**
 * Fast search by code prefix (q%) or description keyword (%q%).
 */
export async function searchHsnCodes(query, type = null, limit = 20) {
  const q = String(query || "").trim();
  const maxLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

  if (!q) {
    const params = [];
    let sql = "SELECT code, description, type, gst_rate, cess_rate FROM hsn_codes";
    if (type && (type.toUpperCase() === "HSN" || type.toUpperCase() === "SAC")) {
      sql += " WHERE type = ?";
      params.push(type.toUpperCase());
    }
    sql += " ORDER BY code ASC LIMIT ?";
    params.push(maxLimit);

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  const cleanPrefix = normalizeHsnCode(q);
  const isNumericQuery = /^[0-9]+$/.test(cleanPrefix);

  const conditions = [];
  const params = [];

  if (type && (type.toUpperCase() === "HSN" || type.toUpperCase() === "SAC")) {
    conditions.push("type = ?");
    params.push(type.toUpperCase());
  }

  if (isNumericQuery) {
    conditions.push("(code LIKE ? OR description LIKE ?)");
    params.push(`${cleanPrefix}%`, `%${q}%`);
  } else {
    conditions.push("(code LIKE ? OR description LIKE ?)");
    params.push(`${q}%`, `%${q}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT code, description, type, gst_rate, cess_rate,
      CASE
        WHEN code = ? THEN 1
        WHEN code LIKE ? THEN 2
        WHEN description LIKE ? THEN 3
        ELSE 4
      END as relevance
    FROM hsn_codes
    ${whereClause}
    ORDER BY relevance ASC, LENGTH(code) ASC, code ASC
    LIMIT ?
  `;

  const finalParams = [
    cleanPrefix || q,
    `${cleanPrefix || q}%`,
    `%${q}%`,
    ...params,
    maxLimit,
  ];

  const [rows] = await pool.query(sql, finalParams);
  return rows.map(({ relevance, ...r }) => r);
}

/**
 * Seeds default HSN codes from CBIC files on startup if table is empty.
 */
export async function seedDefaultHsnCodes(force = false) {
  const [countRows] = await pool.query("SELECT COUNT(*) as count FROM hsn_codes");
  const count = countRows[0]?.count || 0;

  if (count === 0 || force) {
    return await importCbicFilesOnly();
  }
  return { seeded: false, count };
}
