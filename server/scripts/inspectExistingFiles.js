import { pool } from "../src/db/mysql.js";

async function main() {
  const [bfRows] = await pool.query(
    "SELECT id, business_id, category, storage_driver, storage_key, mime_type, size_bytes FROM business_files WHERE business_id = ?",
    ["demo-business"]
  );
  console.log("=== business_files for demo-business ===");
  console.log(`Count: ${bfRows.length}`);
  console.log(JSON.stringify(bfRows, null, 2));

  const [cpaRows] = await pool.query(
    "SELECT id, business_id, asset_type, storage_key, file_id FROM company_profile_assets WHERE business_id = ?",
    ["demo-business"]
  );
  console.log("=== company_profile_assets for demo-business ===");
  console.log(`Count: ${cpaRows.length}`);
  console.log(JSON.stringify(cpaRows, null, 2));

  const [cpRows] = await pool.query(
    "SELECT business_id, company_name, logo_url, signature_url FROM company_profiles WHERE business_id = ?",
    ["demo-business"]
  );
  console.log("=== company_profiles for demo-business ===");
  console.log(JSON.stringify(cpRows, null, 2));

  const [itemRows] = await pool.query(
    "SELECT id, name, image_id, image_url FROM inventory_items WHERE business_id = ? AND (image_id IS NOT NULL OR image_url IS NOT NULL)",
    ["demo-business"]
  );
  console.log("=== inventory_items with images for demo-business ===");
  console.log(`Count: ${itemRows.length}`);
  console.log(JSON.stringify(itemRows, null, 2));

  const [txnRows] = await pool.query(
    "SELECT id, document_number, image_id, image_url, document_id, document_url FROM transactions WHERE business_id = ? AND (image_id IS NOT NULL OR document_id IS NOT NULL)",
    ["demo-business"]
  );
  console.log("=== transactions with attachments for demo-business ===");
  console.log(`Count: ${txnRows.length}`);
  console.log(JSON.stringify(txnRows, null, 2));

  const [setRows] = await pool.query(
    "SELECT setting_key, setting_value FROM app_settings WHERE business_id = ? AND (setting_key IN ('companyLogo', 'signatureImage') OR setting_value LIKE '%/assets/%')",
    ["demo-business"]
  );
  console.log("=== app_settings for demo-business ===");
  console.log(JSON.stringify(setRows, null, 2));

  await pool.end();
}

main().catch(console.error);
