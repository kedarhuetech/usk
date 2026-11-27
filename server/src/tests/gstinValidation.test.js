/**
 * GSTIN Validation & Normalization Production Test Suite
 *
 * Verifies:
 * 1. Unit validation logic (regex format, state code resolution, PAN extraction, Luhn Modulo 36 checksum).
 * 2. Strict rejection of malformed or invalid GSTINs across Parties and Settings APIs (HTTP 400).
 * 3. Successful normalization and auto-population of PAN for valid GSTINs.
 * 4. Proper tolerance for unregistered entities / blank GSTINs.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../db/mysql.js";
import partiesRouter from "../routes/partiesRouter.js";
import settingsRouter from "../routes/settingsRouter.js";
import { initializeDatabaseSchema } from "../db/initSchema.js";
import {
  validateGstin,
  cleanGstin,
  isValidGstinFormat,
  isValidStateCode,
  getStateNameFromGstin,
  getPanFromGstin,
  verifyGstinChecksum,
  GST_STATE_MAP,
} from "../utils/gstinUtils.js";

let app;
let server;
let baseUrl;

const TEST_BIZ_ID = `gstin-biz-${Date.now()}`;

before(async () => {
  await initializeDatabaseSchema();

  app = express();
  app.use(express.json());

  // Attach businessId to every test request
  app.use((req, _res, next) => {
    req.businessId = TEST_BIZ_ID;
    req.headers["x-business-id"] = TEST_BIZ_ID;
    next();
  });

  app.use("/api/parties", partiesRouter);
  app.use("/api/settings", settingsRouter);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await pool.query("DELETE FROM parties WHERE business_id = ?", [TEST_BIZ_ID]);
    await pool.query("DELETE FROM company_profiles WHERE business_id = ?", [TEST_BIZ_ID]);
  } catch (_e) {
    // Cleanup best effort
  }
});

test("GSTIN Unit: cleanGstin trims, uppercases, and removes whitespace", () => {
  assert.equal(cleanGstin("  27aapfu0955l1zv  "), "27AAPFU0955L1ZV");
  assert.equal(cleanGstin("27 aapfu 0955 l1zv"), "27AAPFU0955L1ZV");
  assert.equal(cleanGstin(null), "");
  assert.equal(cleanGstin(undefined), "");
});

test("GSTIN Unit: State code derivation and validation", () => {
  assert.equal(isValidStateCode("27"), true);
  assert.equal(GST_STATE_MAP["27"], "Maharashtra");
  assert.equal(isValidStateCode("07"), true);
  assert.equal(GST_STATE_MAP["07"], "Delhi");
  assert.equal(isValidStateCode("99"), true);
  assert.equal(isValidStateCode("00"), false);
  assert.equal(isValidStateCode("96"), false);
  assert.equal(getStateNameFromGstin("27AAPFU0955L1ZV"), "Maharashtra");
  assert.equal(getStateNameFromGstin("29ABCDE1234F1Z5"), "Karnataka");
});

test("GSTIN Unit: PAN extraction", () => {
  assert.equal(getPanFromGstin("27AAPFU0955L1ZV"), "AAPFU0955L");
  assert.equal(getPanFromGstin("29ABCDE1234F1Z5"), "ABCDE1234F");
  assert.equal(getPanFromGstin("short"), "");
});

test("GSTIN Unit: validateGstin handles optional and required inputs", () => {
  const emptyOptional = validateGstin("", { required: false });
  assert.equal(emptyOptional.valid, true);

  const emptyRequired = validateGstin("", { required: true });
  assert.equal(emptyRequired.valid, false);
  assert.match(emptyRequired.error, /required/i);

  const tooShort = validateGstin("27AAPFU0955L1Z");
  assert.equal(tooShort.valid, false);
  assert.match(tooShort.error, /15 characters/i);

  const invalidRegex = validateGstin("27AAPFU0955L11V"); // 14th char should be Z
  assert.equal(invalidRegex.valid, false);
  assert.match(invalidRegex.error, /Invalid GSTIN format/i);

  const invalidState = validateGstin("00AAPFU0955L1ZV");
  assert.equal(invalidState.valid, false);
  assert.match(invalidState.error, /Invalid state code/i);

  const validGstin = validateGstin("27AAPFU0955L1ZV");
  assert.equal(validGstin.valid, true);
  assert.equal(validGstin.stateCode, "27");
  assert.equal(validGstin.stateName, "Maharashtra");
  assert.equal(validGstin.pan, "AAPFU0955L");
});

test("GSTIN Unit: Luhn Modulo 36 checksum calculation", () => {
  // Known valid GSTIN checksums
  assert.equal(verifyGstinChecksum("27AAPFU0939F1ZV"), true);
  assert.equal(verifyGstinChecksum("07AABCU9603R1ZP"), true);
  // Corrupted checksum char
  assert.equal(verifyGstinChecksum("27AAPFU0939F1ZX"), false);
});

test("Parties API: Reject party creation with invalid GSTIN", async () => {
  const res = await fetch(`${baseUrl}/api/parties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partyName: "Invalid GST Party",
      gstin: "27ABCDE1234F999", // Invalid format
      partyType: "customer",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.success, false);
  assert.match(data.message, /GSTIN/i);
});

test("Parties API: Accept party with valid GSTIN and auto-derive PAN", async () => {
  const res = await fetch(`${baseUrl}/api/parties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partyName: "Valid GST Customer",
      gstin: "27AAPFU0955L1ZV",
      partyType: "customer",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.data.gstin, "27AAPFU0955L1ZV");
  assert.equal(data.data.pan, "AAPFU0955L");
});

test("Parties API: Accept unregistered party without GSTIN", async () => {
  const res = await fetch(`${baseUrl}/api/parties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partyName: "Unregistered Consumer",
      gstin: "",
      partyType: "customer",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(!data.data.gstin);
});

test("Settings API: Reject company profile save with invalid GSTIN", async () => {
  const res = await fetch(`${baseUrl}/api/settings/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: "Test Company",
      gstin: "INVALID_GSTIN_123",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.success, false);
  assert.match(data.message, /GSTIN/i);
});

test("Settings API: Accept company profile with valid GSTIN and auto-derive PAN", async () => {
  const res = await fetch(`${baseUrl}/api/settings/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: "USK Enterprises",
      gstin: "27AAPFU0955L1ZV",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);

  const getRes = await fetch(`${baseUrl}/api/settings/company-profile`);
  const profile = await getRes.json();
  assert.equal(getRes.status, 200);
  assert.equal(profile.data.gstin, "27AAPFU0955L1ZV");
  assert.equal(profile.data.pan, "AAPFU0955L");
});
