import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { pool } from "../src/db/mysql.js";
import migrationRoutes from "../src/routes/migrationRouter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main() {
  console.log("=== USV BROWSER TO MYSQL DATA MIGRATION ===");
  console.log("Starting Express app with migration router...");

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/migration", migrationRoutes);

  const server = app.listen(0);
  const port = await new Promise((resolve) => {
    server.on("listening", () => resolve(server.address().port));
  });
  console.log(`Migration server listening on ephemeral port ${port}.`);

  try {
    // 1. Load Current Chrome Storage and Backup Storage
    const current = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../current_browser_storage.json"), "utf8"));
    let backupData = {};
    const backupPath = path.resolve(__dirname, "../../USV-backup-20261102T102526Z-GSTR3B-TEST.usvbackup");
    if (fs.existsSync(backupPath)) {
      const backupJson = JSON.parse(fs.readFileSync(backupPath, "utf8"));
      backupData = backupJson.data || backupJson;
    }

    // 2. Prepare Payload
    const businessId = "demo-business";

    // Parties: Union current + backup (excluding RT Pharmacy which is local-development)
    const partiesMap = new Map();
    (backupData["ledgerly:parties.v1"] || []).forEach((p) => {
      if (p && p.id && p.id !== "933f31db-61eb-4c2b-a3d1-2c862c8fc888") {
        partiesMap.set(p.id, p);
      }
    });
    (current["ledgerly:parties.v1"] || []).forEach((p) => {
      if (p && p.id && p.id !== "933f31db-61eb-4c2b-a3d1-2c862c8fc888") {
        partiesMap.set(p.id, p);
      }
    });
    const parties = Array.from(partiesMap.values());

    // Items: Union current + backup
    const itemsMap = new Map();
    (backupData["ledgerly:inventoryItems.v1"] || []).forEach((i) => i && i.id && itemsMap.set(i.id, i));
    (backupData["ledgerly:items.v1"] || []).forEach((i) => i && i.id && itemsMap.set(i.id, i));
    (current["ledgerly:inventoryItems.v1"] || []).forEach((i) => i && i.id && itemsMap.set(i.id, i));
    (current["ledgerly:items.v1"] || []).forEach((i) => i && i.id && itemsMap.set(i.id, i));
    const items = Array.from(itemsMap.values());

    // Unit Conversions
    const unitConversions = [];
    const customUnits = current["ledgerly:customUnits.v1"] || [];
    customUnits.forEach((u) => {
      unitConversions.push({ unit: u, toUnit: "PCS", conversionFactor: 1 });
    });

    // Transactions: Union current + backup
    const txKeys = [
      "ledgerly:saleInvoices.v1", "ledgerly:purchaseBills.v1",
      "ledgerly:paymentIns.v1", "ledgerly:paymentOuts.v1",
      "ledgerly:saleOrders.v1", "ledgerly:purchaseOrders.v1",
      "ledgerly:estimates.v1", "ledgerly:estimateQuotations.v1",
      "ledgerly:proformaInvoices.v1", "ledgerly:deliveryChallans.v1",
      "ledgerly:saleReturns.v1", "ledgerly:purchaseReturns.v1",
      "ledgerly:expenses.v1",
    ];

    const txMap = new Map();
    for (const k of txKeys) {
      (backupData[k] || []).forEach((t) => t && t.id && !txMap.has(t.id) && txMap.set(t.id, t));
      (current[k] || []).forEach((t) => t && t.id && txMap.set(t.id, t));
    }
    const transactions = Array.from(txMap.values());

    // Job Works
    const jobWorks = current["ledgerly:purchaseJobWorks.v1"] || [];

    // Cheques & Loans for demo-business (scoped strictly to demo-business; local-dev kept untouched)
    const cheques = current["usv.cheques.v1:demo-business"] || [];
    const loans = current["usv.loanAccounts.v1:demo-business"] || [];

    // Balance Sheet Accounts
    const balanceSheetAccounts = current["usv.balanceSheetAccounts.v1"] || [];

    const payload = {
      businessId,
      parties,
      items,
      unitConversions,
      transactions,
      cheques,
      loans,
      jobWorks,
      balanceSheetAccounts,
    };

    console.log(`\nPayload prepared for '${businessId}':`);
    console.log(`  Parties to process: ${parties.length}`);
    console.log(`  Items to process: ${items.length}`);
    console.log(`  Unit conversions: ${unitConversions.length}`);
    console.log(`  Transactions to process: ${transactions.length}`);
    console.log(`  Job works to process: ${jobWorks.length}`);
    console.log(`  Cheques for demo-business: ${cheques.length}`);
    console.log(`  Loans for demo-business: ${loans.length}`);

    // 3. Send HTTP Request to POST /api/migration/migrate-local-data
    console.log(`\nSending POST /api/migration/migrate-local-data to port ${port}...`);
    const response = await fetch(`http://127.0.0.1:${port}/api/migration/migrate-local-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-business-id": businessId,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("\nMigration API Response status:", response.status);
    console.log("Migration Result:", JSON.stringify(result, null, 2));

    if (!response.ok || !result.success) {
      throw new Error(`Migration failed with status ${response.status}: ${result.message}`);
    }

    // 4. Save Migration Report to disk
    const reportPath = path.resolve(__dirname, "../../latest_migration_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`\nSaved migration report to ${reportPath}`);

    // 5. Independently verify database counts
    console.log("\n--- MySQL Persistence Read-Back Verification ---");
    const [dbParties] = await pool.query("SELECT COUNT(*) as count FROM parties WHERE business_id = ?", [businessId]);
    const [dbItems] = await pool.query("SELECT COUNT(*) as count FROM inventory_items WHERE business_id = ?", [businessId]);
    const [dbTxns] = await pool.query("SELECT COUNT(*) as count FROM transactions WHERE business_id = ?", [businessId]);
    const [dbLines] = await pool.query("SELECT COUNT(*) as count FROM transaction_items WHERE business_id = ?", [businessId]);
    const [dbUnits] = await pool.query("SELECT COUNT(*) as count FROM unit_conversions WHERE business_id = ?", [businessId]);
    const [dbJobWorks] = await pool.query("SELECT COUNT(*) as count FROM purchase_job_works WHERE business_id = ?", [businessId]);
    const [dbLogs] = await pool.query("SELECT COUNT(*) as count FROM migration_logs WHERE business_id = ? AND batch_id = ?", [businessId, result.report.batchId]);

    console.log(`Database verification for '${businessId}':`);
    console.log(`  Parties in MySQL: ${dbParties[0].count}`);
    console.log(`  Inventory Items in MySQL: ${dbItems[0].count}`);
    console.log(`  Transactions in MySQL: ${dbTxns[0].count}`);
    console.log(`  Transaction Items in MySQL: ${dbLines[0].count}`);
    console.log(`  Unit Conversions in MySQL: ${dbUnits[0].count}`);
    console.log(`  Purchase Job Works in MySQL: ${dbJobWorks[0].count}`);
    console.log(`  Migration Logs for batch ${result.report.batchId}: ${dbLogs[0].count}`);

    // 6. Verify local-development records remained 100% untouched
    console.log("\n--- local-development Isolation Verification ---");
    const [localParties] = await pool.query("SELECT id, party_name FROM parties WHERE business_id = 'local-development'");
    const [localTxns] = await pool.query("SELECT id, transaction_type, document_number FROM transactions WHERE business_id = 'local-development'");
    console.log(`local-development parties count: ${localParties.length}`);
    console.log(localParties);
    console.log(`local-development transactions count: ${localTxns.length}`);
    console.log(localTxns);

  } catch (err) {
    console.error("Migration execution error:", err);
  } finally {
    server.close();
    process.exit(0);
  }
}

main();
