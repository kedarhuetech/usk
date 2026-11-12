#!/usr/bin/env node
/* global process */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pool } from "../src/db/mysql.js";
import { parseHsnData, batchUpsertHsnCodes } from "../src/services/hsnService.js";

async function runCli() {
  const filePathArg = process.argv[2];

  if (!filePathArg) {
    console.error("❌ Error: Please provide the path to an HSN/SAC master Excel or CSV file.");
    console.log("Usage: node scripts/importHsnMaster.js <path-to-file.xlsx|xls|csv>");
    console.log("   or: npm run import:hsn -- <path-to-file.xlsx>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Error: File not found at path: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`🚀 Starting HSN/SAC Master Import from: ${resolvedPath}`);
  const startTime = performance.now();

  try {
    console.log("⏳ Parsing spreadsheet / CSV file...");
    const records = parseHsnData(resolvedPath);
    console.log(`✅ Parsed ${records.length} valid HSN/SAC records.`);

    if (records.length === 0) {
      console.warn("⚠️ No valid records found to import. Please check file headers.");
      process.exit(0);
    }

    console.log("⏳ Batch inserting/updating records in MySQL database...");
    const upsertedCount = await batchUpsertHsnCodes(records, 1000);

    const endTime = performance.now();
    const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`✨ Successfully imported/upserted ${upsertedCount} HSN/SAC codes in ${durationSeconds} seconds.`);
  } catch (error) {
    console.error("❌ Import failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runCli();

