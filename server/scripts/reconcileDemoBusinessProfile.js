import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pool } from "../src/db/mysql.js";

async function runReconciliation() {
  console.log("=== USV Company Profile Database Reconciliation ===");
  const connection = await pool.getConnection();

  try {
    // 1. Verify exactly one demo-business row exists
    console.log("\n[Step 1] Verifying existing demo-business row...");
    const [existingDemoRows] = await connection.query(
      "SELECT * FROM company_profiles WHERE business_id = ?",
      ["demo-business"]
    );
    if (existingDemoRows.length !== 1) {
      throw new Error(`Expected exactly 1 demo-business row in company_profiles, but found ${existingDemoRows.length}`);
    }
    const preUpdateDemo = existingDemoRows[0];
    console.log("✓ Found exactly 1 demo-business row.");
    console.log("  Current company_name:", preUpdateDemo.company_name);
    console.log("  Current updated_at:  ", preUpdateDemo.updated_at);

    // 2. Back up the complete existing demo-business row before modifying it
    console.log("\n[Step 2] Backing up demo-business row before modification...");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFilename = `demo_business_profile_backup_${timestamp}.json`;
    const backupPath = path.resolve(process.cwd(), backupFilename);
    fs.writeFileSync(backupPath, JSON.stringify(preUpdateDemo, null, 2), "utf8");
    console.log(`✓ Backup saved successfully to: ${backupPath}`);

    // Verify baseline for local-development row
    const [baselineLocalRows] = await connection.query(
      "SELECT * FROM company_profiles WHERE business_id = ?",
      ["local-development"]
    );
    if (baselineLocalRows.length !== 1) {
      throw new Error(`Expected 1 local-development row, found ${baselineLocalRows.length}`);
    }
    const baselineLocal = baselineLocalRows[0];
    console.log("✓ Recorded local-development baseline (updated_at:", baselineLocal.updated_at, ")");

    // 3. Begin MySQL Transaction
    console.log("\n[Step 3] Starting MySQL transaction...");
    await connection.beginTransaction();
    console.log("✓ Transaction started.");

    // 4. Execute the update inside the transaction (ONLY WHERE business_id = 'demo-business')
    console.log("\n[Step 4] Executing targeted UPDATE on demo-business...");
    const updateSql = `
      UPDATE company_profiles
      SET
        company_name          = ?,
        trade_name            = ?,
        business_type         = ?,
        business_category     = ?,
        phone                 = NULL,
        email                 = NULL,
        gstin                 = NULL,
        pan                   = NULL,
        street_address        = ?,
        city                  = ?,
        state                 = ?,
        pincode               = ?,
        country               = ?,
        bank_name             = NULL,
        account_number        = NULL,
        ifsc_code             = NULL,
        branch_name           = NULL,
        upi_id                = NULL,
        terms_and_conditions  = ?,
        logo_url              = ?,
        signature_url         = ?,
        updated_at            = CURRENT_TIMESTAMP
      WHERE business_id = 'demo-business'
    `;

    const params = [
      "USV Test Trade",
      "nn trades",
      "Distributor",
      "Pharmacy & Medical",
      "usk , manor road , kanchan business hub",
      "palghar",
      "Maharashtra",
      "396165",
      "India",
      "Test terms and conditions",
      "/api/business-growth/assets/1ea83756-75c1-4f27-b0bc-72f479820bc2?businessId=demo-business",
      "/api/business-growth/assets/c394d5fa-adff-441b-9caf-de42c49b4c94?businessId=demo-business",
    ];

    const [updateResult] = await connection.query(updateSql, params);
    console.log(`✓ UPDATE query executed. Affected rows: ${updateResult.affectedRows}, Changed rows: ${updateResult.changedRows}`);
    if (updateResult.affectedRows !== 1) {
      throw new Error(`Expected affectedRows === 1, got ${updateResult.affectedRows}. Rolling back!`);
    }

    // 5. Pre-commit Verification: Verify all transferred and NULL fields on demo-business
    console.log("\n[Step 5] Verifying updated fields within transaction...");
    const [verifyDemoRows] = await connection.query(
      "SELECT * FROM company_profiles WHERE business_id = ?",
      ["demo-business"]
    );
    const updated = verifyDemoRows[0];

    // Assert transferred fields
    assert.equal(updated.company_name, "USV Test Trade", "company_name mismatch");
    assert.equal(updated.trade_name, "nn trades", "trade_name mismatch");
    assert.equal(updated.business_type, "Distributor", "business_type mismatch");
    assert.equal(updated.business_category, "Pharmacy & Medical", "business_category mismatch");
    assert.equal(updated.street_address, "usk , manor road , kanchan business hub", "street_address mismatch");
    assert.equal(updated.city, "palghar", "city mismatch");
    assert.equal(updated.state, "Maharashtra", "state mismatch");
    assert.equal(updated.pincode, "396165", "pincode mismatch");
    assert.equal(updated.country, "India", "country mismatch");
    assert.equal(updated.terms_and_conditions, "Test terms and conditions", "terms_and_conditions mismatch");
    assert.equal(
      updated.logo_url,
      "/api/business-growth/assets/1ea83756-75c1-4f27-b0bc-72f479820bc2?businessId=demo-business",
      "logo_url mismatch"
    );
    assert.equal(
      updated.signature_url,
      "/api/business-growth/assets/c394d5fa-adff-441b-9caf-de42c49b4c94?businessId=demo-business",
      "signature_url mismatch"
    );

    // Assert NULL fields
    assert.equal(updated.phone, null, "phone must be NULL");
    assert.equal(updated.email, null, "email must be NULL");
    assert.equal(updated.gstin, null, "gstin must be NULL");
    assert.equal(updated.pan, null, "pan must be NULL");
    assert.equal(updated.bank_name, null, "bank_name must be NULL");
    assert.equal(updated.account_number, null, "account_number must be NULL");
    assert.equal(updated.ifsc_code, null, "ifsc_code must be NULL");
    assert.equal(updated.branch_name, null, "branch_name must be NULL");
    assert.equal(updated.upi_id, null, "upi_id must be NULL");
    console.log("✓ All 12 transferred fields and 9 NULL fields verified accurately.");

    // 6. Pre-commit Verification: Confirm local-development row was NOT modified or deleted
    console.log("\n[Step 6] Confirming local-development row is untouched...");
    const [currentLocalRows] = await connection.query(
      "SELECT * FROM company_profiles WHERE business_id = ?",
      ["local-development"]
    );
    assert.equal(currentLocalRows.length, 1, "local-development row must remain intact");
    assert.equal(currentLocalRows[0].updated_at, baselineLocal.updated_at, "local-development updated_at must match baseline");
    assert.equal(currentLocalRows[0].company_name, baselineLocal.company_name, "local-development company_name must match");
    console.log("✓ local-development row is strictly unmodified.");

    // 7. Pre-commit Verification: Confirm image BLOB assets are intact and owned by demo-business
    console.log("\n[Step 7] Confirming image BLOB assets in business_growth_assets...");
    const [assetRows] = await connection.query(
      "SELECT id, business_id, entity_type, entity_id, mime_type, size_bytes, LENGTH(data) as blob_len FROM business_growth_assets WHERE id IN (?, ?)",
      ["1ea83756-75c1-4f27-b0bc-72f479820bc2", "c394d5fa-adff-441b-9caf-de42c49b4c94"]
    );
    assert.equal(assetRows.length, 2, "Both assets must exist");
    for (const a of assetRows) {
      assert.equal(a.business_id, "demo-business", `Asset ${a.id} must belong to demo-business`);
      assert(a.blob_len > 0, `Asset ${a.id} BLOB data must not be empty`);
    }
    console.log("✓ Both image BLOB assets verified intact under demo-business.");

    // 8. Commit Transaction
    console.log("\n[Step 8] All verifications passed. Committing transaction...");
    await connection.commit();
    console.log("✓ Transaction successfully committed to MySQL!");

    console.log("\n=== RECONCILIATION RESULT SUMMARY ===");
    console.log("Tenant: demo-business");
    console.log("Company Name:       ", updated.company_name);
    console.log("Trade Name:         ", updated.trade_name);
    console.log("Business Type:      ", updated.business_type);
    console.log("Business Category:  ", updated.business_category);
    console.log("Street Address:     ", updated.street_address);
    console.log("City/State/Pincode: ", `${updated.city}, ${updated.state} - ${updated.pincode}`);
    console.log("Terms & Conditions: ", updated.terms_and_conditions);
    console.log("Logo URL:           ", updated.logo_url);
    console.log("Signature URL:      ", updated.signature_url);
    console.log("NULL Fields:         phone, email, gstin, pan, bank_name, account_number, ifsc_code, branch_name, upi_id");
    console.log("Backup Location:    ", backupPath);

  } catch (err) {
    console.error("\n❌ Error encountered during reconciliation. Rolling back transaction!", err);
    await connection.rollback();
    console.error("✓ Transaction safely rolled back. No changes made.");
    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

runReconciliation().catch((err) => {
  console.error("Reconciliation script exited with error:", err.message);
  process.exit(1);
});
