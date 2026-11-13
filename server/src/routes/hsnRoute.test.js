import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import * as xlsx from "xlsx";
import hsnRoutes from "./hsn.js";
import { pool } from "../db/mysql.js";
import { seedDefaultHsnCodes } from "../services/hsnService.js";

let server;
let baseUrl;

test.before(async () => {
  await seedDefaultHsnCodes().catch(() => {});
  const app = express();
  app.use(express.json());
  app.use("/api/hsn", hsnRoutes);

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api/hsn`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((res) => server.close(res));
  await pool.end();
});

test("API Endpoint: GET /api/hsn/:code - Exact Lookup", async () => {
  const res = await fetch(`${baseUrl}/0202`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.valid, true);
  assert.equal(json.data.code, "0202");
  assert.equal(json.data.type, "HSN");
  assert.equal(Number(json.data.gst_rate), 5.0);
  assert.ok(json.chapterContext);
  assert.equal(json.chapterContext.chapterCode, "02");
});

test("API Endpoint: GET /api/hsn/:code - Not Found 404", async () => {
  const res = await fetch(`${baseUrl}/777777777`);
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.valid, false);
  assert.equal(json.message, "Code not found");
});

test("API Endpoint: GET /api/hsn/search - Prefix and Keyword Search", async () => {
  // Search by code prefix
  const res1 = await fetch(`${baseUrl}/search?q=0202`);
  assert.equal(res1.status, 200);
  const json1 = await res1.json();
  assert.ok(json1.success);
  assert.ok(json1.data.some((item) => item.code === "0202"));

  // Search by keyword in description (e.g. apartment in services or milk in goods)
  const res2 = await fetch(`${baseUrl}/search?q=apartment`);
  assert.equal(res2.status, 200);
  const json2 = await res2.json();
  assert.ok(json2.success);
  assert.ok(json2.data.some((item) => item.code === "9954"));

  // Search SAC type filter
  const res3 = await fetch(`${baseUrl}/search?type=SAC&limit=5`);
  assert.equal(res3.status, 200);
  const json3 = await res3.json();
  assert.ok(json3.success);
  assert.ok(json3.data.every((item) => item.type === "SAC"));
});

test("API Endpoint: POST /api/hsn/import - Multipart Upload", async () => {
  // Generate sample XLSX in memory with 2 new codes
  const wsData = [
    ["Tariff Item", "Description of goods", "Rate (%)"],
    ["84733020", "Motherboards for automatic data processing units", "18.0"],
    ["998313", "Information technology consulting and support services", "18.0"],
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, "TariffMaster");
  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  const formData = new FormData();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  formData.append("file", blob, "gst_master_test.xlsx");

  const importRes = await fetch(`${baseUrl}/import`, {
    method: "POST",
    body: formData,
  });

  assert.equal(importRes.status, 200);
  const importJson = await importRes.json();
  assert.equal(importJson.success, true);
  assert.equal(importJson.count, 2);

  // Verify newly imported code is now searchable and lookable
  const lookupRes = await fetch(`${baseUrl}/84733020`);
  assert.equal(lookupRes.status, 200);
  const lookupJson = await lookupRes.json();
  assert.equal(lookupJson.valid, true);
  assert.equal(lookupJson.data.code, "84733020");
  assert.equal(lookupJson.data.type, "HSN");
});

test("API Endpoint: POST /api/hsn/calculate-tax - Tax Calculation with Prefix Inheritance", async () => {
  // Test intra-state on parent 8471
  const intraRes = await fetch(`${baseUrl}/calculate-tax`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "8471", amount: 20000, isInterState: false }),
  });
  assert.equal(intraRes.status, 200);
  const intraJson = await intraRes.json();
  assert.equal(intraJson.success, true);
  assert.equal(intraJson.gstRate, 18.0);
  assert.equal(intraJson.cgstAmount, 1800.0);
  assert.equal(intraJson.sgstAmount, 1800.0);
  assert.equal(intraJson.igstAmount, 0.0);
  assert.equal(intraJson.totalTax, 3600.0);
  assert.equal(intraJson.totalAmount, 23600.0);

  // Test inter-state on child 84713010 inheriting from 8471
  const interRes = await fetch(`${baseUrl}/calculate-tax`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "84713010", amount: 10000, isInterState: true }),
  });
  assert.equal(interRes.status, 200);
  const interJson = await interRes.json();
  assert.equal(interJson.success, true);
  assert.equal(interJson.gstRate, 18.0);
  assert.equal(interJson.igstAmount, 1800.0);
  assert.equal(interJson.cgstAmount, 0.0);
  assert.equal(interJson.sgstAmount, 0.0);
  assert.equal(interJson.totalAmount, 11800.0);
});

