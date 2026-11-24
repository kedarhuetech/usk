import { pool } from "../src/db/mysql.js";

async function checkAndFixCollations() {
  const [dbInfo] = await pool.query(
    "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()"
  );
  console.log("Database default:", dbInfo[0]);
  const targetCollation = dbInfo[0].DEFAULT_COLLATION_NAME || "utf8mb4_0900_ai_ci";
  const targetCharset = dbInfo[0].DEFAULT_CHARACTER_SET_NAME || "utf8mb4";

  const [cols] = await pool.query(`
    SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND COLLATION_NAME IS NOT NULL 
      AND COLLATION_NAME != ?
  `, [targetCollation]);

  console.log(`Found ${cols.length} columns with mismatching collation (not ${targetCollation}):`);
  const mismatchTables = [...new Set(cols.map(c => c.TABLE_NAME))];
  console.log("Tables needing collation alignment:", mismatchTables);

  for (const table of mismatchTables) {
    console.log(`Converting table ${table} to ${targetCharset} / ${targetCollation}...`);
    try {
      await pool.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET ${targetCharset} COLLATE ${targetCollation}`);
      console.log(`✓ Converted ${table}`);
    } catch (err) {
      console.warn(`Could not convert ${table}:`, err.message);
    }
  }

  // Also test the exact login query
  console.log("\nTesting login query execution...");
  const [testRows] = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.business_id, u.role, u.is_verified,
            b.name as business_name, cp.company_name
     FROM users u
     LEFT JOIN businesses b ON u.business_id = b.id
     LEFT JOIN company_profiles cp ON u.business_id = cp.business_id
     WHERE LOWER(u.email) = ?
     LIMIT 1`,
    ['prasad.huetech@gmail.com']
  );
  console.log("✓ Login query succeeded without collation error!", testRows);
  process.exit(0);
}

checkAndFixCollations().catch(err => {
  console.error("Error fixing collations:", err);
  process.exit(1);
});
