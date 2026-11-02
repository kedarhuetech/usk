import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMonthYear,
  getPeriodDateRange,
  resolveLineGst,
  calculateGSTR3BData,
} from "./gstr3bService.js";

test("parseMonthYear correctly parses MM/YYYY, YYYY-MM and date strings", () => {
  assert.deepEqual(parseMonthYear("11/2026"), { year: 2026, month: 11 });
  assert.deepEqual(parseMonthYear("2026-11"), { year: 2026, month: 11 });
  assert.deepEqual(parseMonthYear("04-2026"), { year: 2026, month: 4 });
});

test("getPeriodDateRange returns exact start and end dates for month range", () => {
  const range = getPeriodDateRange("11/2026", "11/2026");
  assert.equal(range.fromDate, "2026-11-01");
  assert.equal(range.toDate, "2026-11-30");

  const quarter = getPeriodDateRange("10/2026", "12/2026");
  assert.equal(quarter.fromDate, "2026-10-01");
  assert.equal(quarter.toDate, "2026-12-31");
});

test("resolveLineGst splits intra-state tax into equal CGST and SGST", () => {
  const row = {
    qty: "2",
    price: "500",
    taxRate: "GST 18%",
    calculated: { taxable: 1000, tax: 180, amount: 1180 },
  };
  const gst = resolveLineGst(row, false);
  assert.equal(gst.taxable, 1000);
  assert.equal(gst.tax, 180);
  assert.equal(gst.cgst, 90);
  assert.equal(gst.sgst, 90);
  assert.equal(gst.igst, 0);
  assert.equal(gst.isInterstate, false);
});

test("resolveLineGst assigns 100% tax to IGST for interstate supplies", () => {
  const row = {
    qty: "1",
    price: "1000",
    taxRate: "IGST 18%",
    calculated: { taxable: 1000, tax: 180, amount: 1180 },
  };
  const gst = resolveLineGst(row, true);
  assert.equal(gst.taxable, 1000);
  assert.equal(gst.tax, 180);
  assert.equal(gst.cgst, 0);
  assert.equal(gst.sgst, 0);
  assert.equal(gst.igst, 180);
  assert.equal(gst.isInterstate, true);
});

test("calculateGSTR3BData correctly aggregates Table 1, Table 2, Table 3, Table 4", () => {
  const sales = [
    {
      id: "s1",
      form: { customer: "Cust Local", invoiceDate: "2026-11-05", stateOfSupply: "Maharashtra" },
      rows: [
        { item: "Item 18", qty: 10, price: 100, taxRate: "GST 18%", calculated: { taxable: 1000, tax: 180, amount: 1180 } },
      ],
    },
    {
      id: "s2",
      form: { customer: "Cust Unreg Interstate", invoiceDate: "2026-11-10", stateOfSupply: "Goa" },
      rows: [
        { item: "Item 18", qty: 5, price: 100, taxRate: "IGST 18%", calculated: { taxable: 500, tax: 90, amount: 590 } },
      ],
    },
    {
      id: "s3",
      form: { customer: "Cust Local", invoiceDate: "2026-11-15", stateOfSupply: "Maharashtra" },
      rows: [
        { item: "Item Exempt", qty: 2, price: 100, taxRate: "NONE", calculated: { taxable: 200, tax: 0, amount: 200 } },
      ],
    },
  ];

  const purchases = [
    {
      id: "p1",
      form: { customer: "Supp Local", invoiceDate: "2026-11-06", stateOfSupply: "Maharashtra" },
      rows: [
        { item: "Raw Material", qty: 4, price: 100, taxRate: "GST 18%", calculated: { taxable: 400, tax: 72, amount: 472 } },
      ],
    },
    {
      id: "p2",
      isReverseCharge: true,
      form: { customer: "Supp RCM", invoiceDate: "2026-11-12", stateOfSupply: "Maharashtra" },
      rows: [
        { item: "Freight Service", qty: 1, price: 300, taxRate: "GST 18%", calculated: { taxable: 300, tax: 54, amount: 354 } },
      ],
    },
  ];

  const parties = [
    { partyName: "Cust Local", state: "Maharashtra", gstType: "Registered Regular", gstin: "27AAAAA0000A1Z5" },
    { partyName: "Cust Unreg Interstate", state: "Goa", gstType: "Unregistered / Consumer", gstin: "" },
    { partyName: "Supp Local", state: "Maharashtra", gstType: "Registered Regular", gstin: "27BBBBB1111B1Z2" },
    { partyName: "Supp RCM", state: "Maharashtra", gstType: "Unregistered / Consumer", gstin: "" },
  ];

  const res = calculateGSTR3BData({
    sales,
    purchases,
    saleReturns: [],
    parties,
    companyProfile: { state: "Maharashtra" },
    fromMonthYear: "11/2026",
    toMonthYear: "11/2026",
  });

  // Table 1 Outward
  assert.equal(res.table1.outwardTaxable.taxable, 1500);
  assert.equal(res.table1.outwardTaxable.cgst, 90);
  assert.equal(res.table1.outwardTaxable.sgst, 90);
  assert.equal(res.table1.outwardTaxable.igst, 90);

  // Table 1 Exempt
  assert.equal(res.table1.nilExempt.taxable, 200);

  // Table 1 Inward RCM
  assert.equal(res.table1.inwardRcm.taxable, 300);
  assert.equal(res.table1.inwardRcm.cgst, 27);
  assert.equal(res.table1.inwardRcm.sgst, 27);

  // Table 2 Interstate to Unregistered
  assert.equal(res.table2.length, 1);
  assert.equal(res.table2[0].state, "Goa");
  assert.equal(res.table2[0].unregisteredTaxable, 500);
  assert.equal(res.table2[0].unregisteredIgst, 90);

  // Table 3 Eligible ITC
  assert.equal(res.table3.available.allOther.cgst, 36);
  assert.equal(res.table3.available.allOther.sgst, 36);
  assert.equal(res.table3.available.rcm.cgst, 27);
  assert.equal(res.table3.available.rcm.sgst, 27);

  // Net Tax: (Outward Tax 270) - (ITC 72 + 54 = 126) + (RCM Tax 54) = 198
  assert.equal(res.summary.totalOutwardTax, 270);
  assert.equal(res.summary.totalEligibleItc, 126);
  assert.equal(res.summary.totalRcmTax, 54);
  assert.equal(res.summary.netTaxPayable, 198);
});
