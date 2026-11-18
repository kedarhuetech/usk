import { pool } from "./server/src/db/mysql.js";

async function run() {
  const [sample] = await pool.query('SELECT * FROM transaction_items WHERE transaction_id = "14e1eccb-1215-4d0e-a58a-7df85962bd34"');
  console.log("Items for 14e1eccb-1215-4d0e-a58a-7df85962bd34:", sample);

  const [bizCounts] = await pool.query('SELECT business_id, COUNT(*) as count FROM transaction_items GROUP BY business_id');
  console.log("Business ID distribution in transaction_items:", bizCounts);

  const [txBizCounts] = await pool.query('SELECT business_id, COUNT(*) as count FROM transactions GROUP BY business_id');
  console.log("Business ID distribution in transactions:", txBizCounts);

  process.exit(0);
}
run();
