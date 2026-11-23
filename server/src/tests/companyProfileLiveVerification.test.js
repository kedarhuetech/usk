import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../db/mysql.js";
import settingsRouter from "../routes/settingsRouter.js";

let server;
let baseUrl;
const BUSINESS_ID = "demo-business";
let originalDbRow = null;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/settings", settingsRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api/settings`;

  // Backup original row
  const [rows] = await pool.query(
    "SELECT * FROM company_profiles WHERE business_id = ? LIMIT 1",
    [BUSINESS_ID]
  );
  if (rows && rows.length > 0) {
    originalDbRow = { ...rows[0] };
  }
});

after(async () => {
  // Restore original DB row
  if (originalDbRow) {
    await pool.query(
      `UPDATE company_profiles SET
        company_name = ?, trade_name = ?, business_type = ?, business_category = ?,
        phone = ?, email = ?, gstin = ?, pan = ?,
        street_address = ?, city = ?, state = ?, pincode = ?, country = ?,
        bank_name = ?, account_number = ?, ifsc_code = ?, branch_name = ?, upi_id = ?,
        signature_url = ?, logo_url = ?, terms_and_conditions = ?
       WHERE business_id = ?`,
      [
        originalDbRow.company_name, originalDbRow.trade_name, originalDbRow.business_type, originalDbRow.business_category,
        originalDbRow.phone, originalDbRow.email, originalDbRow.gstin, originalDbRow.pan,
        originalDbRow.street_address, originalDbRow.city, originalDbRow.state, originalDbRow.pincode, originalDbRow.country,
        originalDbRow.bank_name, originalDbRow.account_number, originalDbRow.ifsc_code, originalDbRow.branch_name, originalDbRow.upi_id,
        originalDbRow.signature_url, originalDbRow.logo_url, originalDbRow.terms_and_conditions,
        BUSINESS_ID,
      ]
    );
  }
  if (server) server.close();
  await pool.end();
});

test("Test A — Clear a single field (Business Address)", async () => {
  // 1. Record original value
  const [beforeRows] = await pool.query(
    "SELECT street_address FROM company_profiles WHERE business_id = ?",
    [BUSINESS_ID]
  );
  assert.ok(beforeRows.length > 0);

  // 2. Clear business address via API
  const getRes1 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const currentData = (await getRes1.json()).data;

  const saveRes = await fetch(`${baseUrl}/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID },
    body: JSON.stringify({
      ...currentData,
      businessAddress: "",
      streetAddress: "",
      address: "",
    }),
  });

  // 4. Verify backend response
  const saveJson = await saveRes.json();
  assert.equal(saveJson.success, true, "Save response must be successful");

  // 5. Verify actual MySQL value is NULL
  const [afterRows] = await pool.query(
    "SELECT street_address FROM company_profiles WHERE business_id = ?",
    [BUSINESS_ID]
  );
  assert.equal(afterRows[0].street_address, null, "MySQL street_address must be NULL after save");

  // 6. Refresh the page (GET /company-profile)
  const getRes2 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const refreshedData = (await getRes2.json()).data;

  // 7. Confirm address remains empty
  assert.equal(refreshedData.streetAddress, "", "Refreshed streetAddress must be empty string");
  assert.equal(refreshedData.businessAddress, "", "Refreshed businessAddress must be empty string");
});

test("Test B — Clear GSTIN", async () => {
  const getRes1 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const currentData = (await getRes1.json()).data;

  // 1 & 2. Clear GSTIN and save
  const saveRes = await fetch(`${baseUrl}/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID },
    body: JSON.stringify({
      ...currentData,
      gstin: "",
    }),
  });
  const saveJson = await saveRes.json();
  assert.equal(saveJson.success, true);

  // 3. Check actual database value
  const [afterRows] = await pool.query(
    "SELECT gstin FROM company_profiles WHERE business_id = ?",
    [BUSINESS_ID]
  );
  assert.equal(afterRows[0].gstin, null, "MySQL gstin must be NULL");

  // 4 & 5. Refresh and confirm it remains empty
  const getRes2 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const refreshedData = (await getRes2.json()).data;
  assert.equal(refreshedData.gstin, "", "Refreshed gstin must be empty string");
});

test("Test C — Clear multiple fields simultaneously (PAN, Phone, Email, Trade Name)", async () => {
  const getRes1 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const currentData = (await getRes1.json()).data;

  const saveRes = await fetch(`${baseUrl}/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID },
    body: JSON.stringify({
      ...currentData,
      pan: "",
      phone: "",
      phoneNumber: "",
      email: "",
      emailId: "",
      tradeName: "",
    }),
  });
  const saveJson = await saveRes.json();
  assert.equal(saveJson.success, true);

  // Check database
  const [afterRows] = await pool.query(
    "SELECT pan, phone, email, trade_name FROM company_profiles WHERE business_id = ?",
    [BUSINESS_ID]
  );
  assert.equal(afterRows[0].pan, null, "MySQL pan must be NULL");
  assert.equal(afterRows[0].phone, null, "MySQL phone must be NULL");
  assert.equal(afterRows[0].email, null, "MySQL email must be NULL");
  assert.equal(afterRows[0].trade_name, null, "MySQL trade_name must be NULL");

  // Check refresh
  const getRes2 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const refreshedData = (await getRes2.json()).data;
  assert.equal(refreshedData.pan, "");
  assert.equal(refreshedData.phone, "");
  assert.equal(refreshedData.phoneNumber, "");
  assert.equal(refreshedData.email, "");
  assert.equal(refreshedData.emailId, "");
  assert.equal(refreshedData.tradeName, "");
});

test("Test D — Restore values into previously empty fields", async () => {
  const getRes1 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const currentData = (await getRes1.json()).data;

  const restoredValues = {
    ...currentData,
    pan: "ABCDE9999F",
    phoneNumber: "9876543210",
    phone: "9876543210",
    emailId: "restored@test.com",
    email: "restored@test.com",
    tradeName: "Restored Traders",
    gstin: "27ABCDE1234F1Z5",
    streetAddress: "123 Restored Street, Palghar",
    businessAddress: "123 Restored Street, Palghar",
  };

  const saveRes = await fetch(`${baseUrl}/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID },
    body: JSON.stringify(restoredValues),
  });
  const saveJson = await saveRes.json();
  assert.equal(saveJson.success, true);

  // Check database
  const [afterRows] = await pool.query(
    "SELECT pan, phone, email, trade_name, gstin, street_address FROM company_profiles WHERE business_id = ?",
    [BUSINESS_ID]
  );
  assert.equal(afterRows[0].pan, "ABCDE9999F");
  assert.equal(afterRows[0].phone, "9876543210");
  assert.equal(afterRows[0].email, "restored@test.com");
  assert.equal(afterRows[0].trade_name, "Restored Traders");
  assert.equal(afterRows[0].gstin, "27ABCDE1234F1Z5");
  assert.equal(afterRows[0].street_address, "123 Restored Street, Palghar");

  // Check refresh
  const getRes2 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const refreshedData = (await getRes2.json()).data;
  assert.equal(refreshedData.pan, "ABCDE9999F");
  assert.equal(refreshedData.phone, "9876543210");
  assert.equal(refreshedData.email, "restored@test.com");
  assert.equal(refreshedData.tradeName, "Restored Traders");
  assert.equal(refreshedData.gstin, "27ABCDE1234F1Z5");
  assert.equal(refreshedData.streetAddress, "123 Restored Street, Palghar");
});

test("Test E — Bank details: Clear IFSC and Account Number while preserving bankName", async () => {
  const getRes1 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const currentData = (await getRes1.json()).data;

  // Clear ifscCode and accountNumber, keep bankName
  const saveRes = await fetch(`${baseUrl}/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID },
    body: JSON.stringify({
      ...currentData,
      bankName: "HDFC Bank",
      accountNumber: "",
      ifscCode: "",
      branchName: "Palghar Branch",
      upiId: "",
    }),
  });
  const saveJson = await saveRes.json();
  assert.equal(saveJson.success, true);

  // Verify database
  const [afterRows] = await pool.query(
    "SELECT bank_name, account_number, ifsc_code, branch_name, upi_id FROM company_profiles WHERE business_id = ?",
    [BUSINESS_ID]
  );
  assert.equal(afterRows[0].bank_name, "HDFC Bank", "bank_name must be preserved");
  assert.equal(afterRows[0].account_number, null, "account_number must be NULL");
  assert.equal(afterRows[0].ifsc_code, null, "ifsc_code must be NULL");
  assert.equal(afterRows[0].branch_name, "Palghar Branch", "branch_name must be preserved");
  assert.equal(afterRows[0].upi_id, null, "upi_id must be NULL");

  // Verify refresh
  const getRes2 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const refreshedData = (await getRes2.json()).data;
  assert.equal(refreshedData.bankName, "HDFC Bank");
  assert.equal(refreshedData.accountNumber, "");
  assert.equal(refreshedData.ifscCode, "");
  assert.equal(refreshedData.branchName, "Palghar Branch");
  assert.equal(refreshedData.upiId, "");
});

test("Test F — Preserve unaffected fields when clearing one field", async () => {
  // Set known baseline
  await fetch(`${baseUrl}/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID },
    body: JSON.stringify({
      companyName: "Patil And Mane Pvt Ltd",
      tradeName: "Trade Co",
      businessType: "Retail",
      businessCategory: "Services",
      city: "Palghar",
      state: "Maharashtra",
      pincode: "401404",
      termsAndConditions: "Standard 30 day return policy",
      logoUrl: "/api/settings/company-profile/assets/baseline-logo?businessId=demo-business",
      signatureUrl: "/api/settings/company-profile/assets/baseline-sig?businessId=demo-business",
      bankName: "Axis Bank",
      branchName: "West Branch",
      accountNumber: "987654321012",
      ifscCode: "UTIB0001234",
      upiId: "patil@axis",
    }),
  });

  // Now ONLY clear termsAndConditions
  const getRes1 = await fetch(`${baseUrl}/company-profile`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  const baseline = (await getRes1.json()).data;

  const saveRes = await fetch(`${baseUrl}/company-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID },
    body: JSON.stringify({
      ...baseline,
      termsAndConditions: "",
    }),
  });
  assert.equal((await saveRes.json()).success, true);

  // Check MySQL
  const [afterRows] = await pool.query(
    "SELECT * FROM company_profiles WHERE business_id = ?",
    [BUSINESS_ID]
  );
  const row = afterRows[0];
  assert.equal(row.terms_and_conditions, null, "terms_and_conditions must be cleared to NULL");
  assert.equal(row.company_name, "Patil And Mane Pvt Ltd", "company_name must be unaffected");
  assert.equal(row.business_type, "Retail", "business_type must be unaffected");
  assert.equal(row.business_category, "Services", "business_category must be unaffected");
  assert.equal(row.city, "Palghar", "city must be unaffected");
  assert.equal(row.state, "Maharashtra", "state must be unaffected");
  assert.equal(row.pincode, "401404", "pincode must be unaffected");
  assert.equal(row.bank_name, "Axis Bank", "bank_name must be unaffected");
  assert.equal(row.account_number, "987654321012", "account_number must be unaffected");
  assert.equal(row.ifsc_code, "UTIB0001234", "ifsc_code must be unaffected");
  assert.equal(row.branch_name, "West Branch", "branch_name must be unaffected");
  assert.equal(row.upi_id, "patil@axis", "upi_id must be unaffected");
  assert.ok(row.logo_url && row.logo_url.includes("baseline-logo"), "logo must be unaffected");
  assert.ok(row.signature_url && row.signature_url.includes("baseline-sig"), "signature must be unaffected");
});
