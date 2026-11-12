import test, { after } from "node:test";
import assert from "node:assert/strict";
import * as xlsxModule from "xlsx";
import { pool } from "../db/mysql.js";
import {
  normalizeHsnCode,
  determineCodeType,
  cleanRate,
  parseHsnData,
  batchUpsertHsnCodes,
  lookupHsnCode,
  searchHsnCodes,
  seedDefaultHsnCodes,
  calculateHsnTax,
  resolveEffectiveRate,
  syncInheritedRates,
} from "./hsnService.js";

const xlsx = xlsxModule.default || xlsxModule;

test("HSN Service - Code Normalization & Leading Zero Padding", () => {
  assert.equal(normalizeHsnCode(" 84.71 "), "8471");
  assert.equal(normalizeHsnCode("99.83.14"), "998314");
  assert.equal(normalizeHsnCode("6109-10"), "610910");
  // Leading zero padding for odd numeric lengths from Excel
  assert.equal(normalizeHsnCode("202"), "0202");
  assert.equal(normalizeHsnCode(202), "0202");
  assert.equal(normalizeHsnCode("1"), "01");
  assert.equal(normalizeHsnCode("101"), "0101");
  // Non-numeric text headers or footnotes are safely excluded
  assert.equal(normalizeHsnCode("motor"), "");
  assert.equal(normalizeHsnCode("(v)"), "");
  assert.equal(normalizeHsnCode(null), "");
});

test("HSN Service - Type Determination", () => {
  assert.equal(determineCodeType("998314"), "SAC");
  assert.equal(determineCodeType("99"), "SAC");
  assert.equal(determineCodeType("8471"), "HSN");
  assert.equal(determineCodeType("0202"), "HSN");
  assert.equal(determineCodeType("1234", "SAC"), "SAC");
});

test("HSN Service - Flexible GST & Cess Rate Parsing", () => {
  assert.equal(cleanRate("5%"), 5.0);
  assert.equal(cleanRate("18%"), 18.0);
  assert.equal(cleanRate("2.5% + Cess"), 2.5);
  assert.equal(cleanRate("Nil"), 0.0);
  assert.equal(cleanRate("nil"), 0.0);
  assert.equal(cleanRate("-"), 0.0);
  assert.equal(cleanRate("0"), 0.0);
  assert.equal(cleanRate(0), 0.0);
  // Excel percentage ratio cells
  assert.equal(cleanRate(0.05), 5.0);
  assert.equal(cleanRate(0.18), 18.0);
  assert.equal(cleanRate(0.0025), 0.25);
  assert.equal(cleanRate(18), 18.0);
  // Year numbers or footnote numbers (> 300) should be safely rejected
  assert.equal(cleanRate(2017), null);
  assert.equal(cleanRate(2020), null);
});

test("HSN Service - Multi-sheet & CBIC Column Parsing", () => {
  // Test SAC Code column header and CGST+SGST sum fallback
  const wsData = [
    ["SAC Code", "Description of Service", "CGST", "SGST", "Cess"],
    ["998313", "IT Consulting Services", "9%", "9%", "0%"],
    ["996511", "Road Freight Transportation", "2.5%", "2.5%", "0%"],
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, "SAC_RATES");
  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  const parsed = parseHsnData(buffer);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].code, "998313");
  assert.equal(parsed[0].type, "SAC");
  assert.equal(parsed[0].gst_rate, 18.0); // 9 + 9 = 18%
  assert.equal(parsed[1].code, "996511");
  assert.equal(parsed[1].type, "SAC");
  assert.equal(parsed[1].gst_rate, 5.0);  // 2.5 + 2.5 = 5%
});

test("HSN Service - Longest-Prefix Rate Inheritance", async () => {
  await seedDefaultHsnCodes(true);

  // 1. Exact match (0202 exists in CBIC with 5%)
  const exactRes = await resolveEffectiveRate("0202");
  assert.equal(exactRes.gstRate, 5.0);
  assert.equal(exactRes.rateSource, "exact");

  // 2. 4-digit heading fallback (querying 02029999 inherits from 0202)
  const headingRes = await resolveEffectiveRate("02029999");
  assert.equal(headingRes.gstRate, 5.0);
  assert.equal(headingRes.rateSource, "4-digit-heading");
  assert.equal(headingRes.inheritedFrom, "0202");

  // 3. Fallback to 18% default when no prefix exists in DB
  const unknownRes = await resolveEffectiveRate("77777777");
  assert.equal(unknownRes.gstRate, 18.0);
  assert.equal(unknownRes.rateSource, "default");
});

test("HSN Service - Intra-state vs Inter-state Tax Calculation", async () => {
  // Test Intra-state calculation on 8471 (amount 10,000, 18% GST -> 9% CGST + 9% SGST)
  const intra = await calculateHsnTax({
    code: "8471",
    amount: 10000,
    isInterState: false,
  });
  assert.equal(intra.success, true);
  assert.equal(intra.gstRate, 18.0);
  assert.equal(intra.cgstRate, 9.0);
  assert.equal(intra.cgstAmount, 900.0);
  assert.equal(intra.sgstRate, 9.0);
  assert.equal(intra.sgstAmount, 900.0);
  assert.equal(intra.igstRate, 0.0);
  assert.equal(intra.igstAmount, 0.0);
  assert.equal(intra.totalTax, 1800.0);
  assert.equal(intra.totalAmount, 11800.0);

  // Test Inter-state calculation on 8471 (amount 10,000, 18% GST -> 18% IGST)
  const inter = await calculateHsnTax({
    code: "8471",
    amount: 10000,
    isInterState: true,
  });
  assert.equal(inter.success, true);
  assert.equal(inter.gstRate, 18.0);
  assert.equal(inter.cgstAmount, 0.0);
  assert.equal(inter.sgstAmount, 0.0);
  assert.equal(inter.igstRate, 18.0);
  assert.equal(inter.igstAmount, 1800.0);
  assert.equal(inter.totalTax, 1800.0);
  assert.equal(inter.totalAmount, 11800.0);

  // Test State string comparison (Maharashtra vs Gujarat -> Inter-state)
  const statesTax = await calculateHsnTax({
    code: "8471",
    amount: 5000,
    partyState: "Gujarat",
    businessState: "Maharashtra",
  });
  assert.equal(statesTax.isInterState, true);
  assert.equal(statesTax.igstAmount, 900.0);
});

after(async () => {
  await pool.end();
});
