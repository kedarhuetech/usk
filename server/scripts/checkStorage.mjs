import { pool } from "../src/db/mysql.js";

async function main() {
  const sql = `
    SELECT 
      table_name AS 'Table',
      table_rows AS 'Estimated Rows',
      CONCAT(ROUND(data_length / 1024, 2), ' KB') AS 'Data Size',
      CONCAT(ROUND(index_length / 1024, 2), ' KB') AS 'Index Size',
      CONCAT(ROUND((data_length + index_length) / 1024, 2), ' KB') AS 'Total Size (KB)',
      CONCAT(ROUND((data_length + index_length) / (1024 * 1024), 3), ' MB') AS 'Total Size (MB)'
    FROM information_schema.TABLES
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
    ORDER BY (data_length + index_length) DESC;
  `;

  const [rows] = await pool.query(sql);
  console.table(rows);

  const [dbTotal] = await pool.query(`
    SELECT 
      table_schema AS 'Database',
      CONCAT(ROUND(SUM(data_length + index_length) / (1024 * 1024), 2), ' MB') AS 'Total Size'
    FROM information_schema.TABLES
    WHERE table_schema = DATABASE()
    GROUP BY table_schema;
  `);
  console.log("\nDatabase Total:");
  console.table(dbTotal);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
