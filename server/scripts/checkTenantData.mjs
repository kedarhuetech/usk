import { pool } from "../src/db/mysql.js";

async function check() {
  const [bRows] = await pool.query("SELECT * FROM businesses WHERE id = ?", ['baba-kirana']);
  const [uRows] = await pool.query("SELECT id, email, business_id FROM users WHERE business_id = ?", ['baba-kirana']);
  const [cpRows] = await pool.query("SELECT business_id, company_name, email FROM company_profiles WHERE business_id = ?", ['baba-kirana']);
  const [tRows] = await pool.query("SELECT id, transaction_type, total_amount FROM transactions WHERE business_id = ?", ['baba-kirana']);
  const [pRows] = await pool.query("SELECT id, party_name FROM parties WHERE business_id = ?", ['baba-kirana']);
  const [iRows] = await pool.query("SELECT id, name FROM inventory_items WHERE business_id = ?", ['baba-kirana']);
  const [sRows] = await pool.query("SELECT setting_key, setting_value FROM app_settings WHERE business_id = ?", ['baba-kirana']);

  console.log({
    businesses: bRows,
    users: uRows,
    company_profiles: cpRows,
    transactions: tRows,
    parties: pRows,
    items: iRows,
    settings: sRows,
  });
  process.exit(0);
}

check().catch(console.error);
