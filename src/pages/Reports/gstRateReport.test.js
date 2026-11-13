import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTaxRateNumber,
  formatTaxRateLabel,
  resolveRowGst,
  extractTransactionTaxLines,
  compileGstData,
  filterGstLines,
  calculateGstRateMetrics,
  isTransactionCancelled,
  round2,
} from "../../utils/gstRateCalculations.js";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";

test("1. Tax Rate Extraction and Label Formatting", () => {
  assert.equal(extractTaxRateNumber("GST 18%"), 18);
  assert.equal(extractTaxRateNumber("IGST 12%"), 12);
  assert.equal(extractTaxRateNumber("GST 5%"), 5);
  assert.equal(extractTaxRateNumber("GST 28%"), 28);
  assert.equal(extractTaxRateNumber("GST 0.25%"), 0.25);
  assert.equal(extractTaxRateNumber("GST 3%"), 3);
  assert.equal(extractTaxRateNumber("GST 0%"), 0);
  assert.equal(extractTaxRateNumber("Exempt"), 0);
  assert.equal(extractTaxRateNumber("NONE"), 0);
  assert.equal(extractTaxRateNumber(18), 18);
  assert.equal(extractTaxRateNumber(null), 0);

  assert.equal(formatTaxRateLabel(18), "18%");
  assert.equal(formatTaxRateLabel(12), "12%");
  assert.equal(formatTaxRateLabel(5), "5%");
  assert.equal(formatTaxRateLabel(0), "0% (Exempt / Nil)");
});

test("2. Intra-State vs Inter-State Tax Split and Reconciliation", () => {
  // 2a. Intra-state supply (e.g. Maharashtra to Maharashtra) -> CGST + SGST, 0 IGST
  const intraRow = {
    qty: 2,
    price: 500,
    priceMode: "Without Tax",
    taxRate: "GST 18%",
  };
  const intraGst = resolveRowGst(intraRow, false);
  assert.equal(intraGst.taxable, 1000, "Taxable must be 1000");
  assert.equal(intraGst.tax, 180, "Total tax must be 180");
  assert.equal(intraGst.cgst, 90, "CGST must be 90");
  assert.equal(intraGst.sgst, 90, "SGST must be 90");
  assert.equal(intraGst.igst, 0, "IGST must be 0");
  assert.equal(
    round2(intraGst.cgst + intraGst.sgst + intraGst.igst),
    intraGst.tax,
    "CGST + SGST + IGST must equal total tax"
  );

  // 2b. Inter-state supply (e.g. Maharashtra to Karnataka) -> IGST, 0 CGST/SGST
  const interRow = {
    qty: 2,
    price: 500,
    priceMode: "Without Tax",
    taxRate: "GST 18%",
  };
  const interGst = resolveRowGst(interRow, true);
  assert.equal(interGst.taxable, 1000);
  assert.equal(interGst.tax, 180);
  assert.equal(interGst.cgst, 0);
  assert.equal(interGst.sgst, 0);
  assert.equal(interGst.igst, 180);
  assert.equal(
    round2(interGst.cgst + interGst.sgst + interGst.igst),
    interGst.tax
  );

  // 2c. Odd amount precision test: taxable 105.55 at 5% = 5.28 tax
  const oddRow = {
    qty: 1,
    price: 105.55,
    priceMode: "Without Tax",
    taxRate: "GST 5%",
  };
  const oddGst = resolveRowGst(oddRow, false);
  assert.equal(oddGst.taxable, 105.55);
  assert.equal(oddGst.tax, 5.28);
  assert.equal(oddGst.cgst, 2.64);
  assert.equal(oddGst.sgst, 2.64);
  assert.equal(oddGst.igst, 0);
  assert.equal(round2(oddGst.cgst + oddGst.sgst), oddGst.tax);
});

test("3. Tax-Inclusive Pricing (With Tax) Mode Calculation", () => {
  // Gross = 1180 with 18% tax included -> taxable = 1000, tax = 180
  const incRow = {
    qty: 1,
    price: 1180,
    priceMode: "With Tax",
    taxRate: "GST 18%",
  };
  const incGst = resolveRowGst(incRow, false);
  assert.equal(incGst.taxable, 1000);
  assert.equal(incGst.tax, 180);
  assert.equal(incGst.cgst, 90);
  assert.equal(incGst.sgst, 90);
});

test("4. Multi-Item Invoice with Different GST Rates", () => {
  const multiInvoice = {
    id: "inv-multi-01",
    invoiceNumber: "INV-101",
    invoiceDate: "2026-11-04",
    party: "Ace Retail",
    stateOfSupply: "Maharashtra",
    rows: [
      { item: "Item 18%", qty: 1, price: 1000, priceMode: "Without Tax", taxRate: "GST 18%" },
      { item: "Item 12%", qty: 2, price: 500, priceMode: "Without Tax", taxRate: "GST 12%" },
      { item: "Item 5%", qty: 4, price: 250, priceMode: "Without Tax", taxRate: "GST 5%" },
      { item: "Exempt Item", qty: 1, price: 300, priceMode: "Without Tax", taxRate: "Exempt" },
    ],
  };

  const lines = extractTransactionTaxLines(multiInvoice, "Sale", { homeState: "Maharashtra" });
  assert.equal(lines.length, 4, "Must produce 4 line items");

  const metrics = calculateGstRateMetrics(lines);
  assert.equal(metrics.totalTransactions, 1, "Single transaction");
  assert.equal(metrics.rateBreakdown.length, 4, "Must break down into 4 rates: 18%, 12%, 5%, 0%");

  // Check 18% rate
  const r18 = metrics.rateBreakdown.find((r) => r.rate === 18);
  assert.ok(r18);
  assert.equal(r18.taxable, 1000);
  assert.equal(r18.tax, 180);
  assert.equal(r18.cgst, 90);
  assert.equal(r18.sgst, 90);

  // Check 12% rate (2 * 500 = 1000 taxable -> 120 tax)
  const r12 = metrics.rateBreakdown.find((r) => r.rate === 12);
  assert.ok(r12);
  assert.equal(r12.taxable, 1000);
  assert.equal(r12.tax, 120);
  assert.equal(r12.cgst, 60);
  assert.equal(r12.sgst, 60);

  // Check 5% rate (4 * 250 = 1000 taxable -> 50 tax)
  const r5 = metrics.rateBreakdown.find((r) => r.rate === 5);
  assert.ok(r5);
  assert.equal(r5.taxable, 1000);
  assert.equal(r5.tax, 50);
  assert.equal(r5.cgst, 25);
  assert.equal(r5.sgst, 25);

  // Check 0% rate (300 taxable -> 0 tax)
  const r0 = metrics.rateBreakdown.find((r) => r.rate === 0);
  assert.ok(r0);
  assert.equal(r0.taxable, 300);
  assert.equal(r0.tax, 0);

  // Total reconciliations
  assert.equal(metrics.totalTaxable, 3300); // 1000 + 1000 + 1000 + 300
  assert.equal(metrics.totalTax, 350);      // 180 + 120 + 50 + 0
  assert.equal(metrics.totalCgst, 175);     // 90 + 60 + 25
  assert.equal(metrics.totalSgst, 175);     // 90 + 60 + 25
  assert.equal(round2(metrics.totalCgst + metrics.totalSgst + metrics.totalIgst), metrics.totalTax);
});

test("5. Separate Sales and Purchase Aggregation and Filtering", () => {
  const sales = [
    {
      id: "sale-1",
      invoiceNumber: "INV-1",
      invoiceDate: "2026-11-05",
      party: "Customer A",
      stateOfSupply: "Maharashtra",
      rows: [{ item: "Product X", qty: 2, price: 1000, taxRate: "GST 18%" }],
    },
  ];

  const purchases = [
    {
      id: "purch-1",
      billNumber: "BILL-1",
      billDate: "2026-11-06",
      party: "Supplier B",
      stateOfSupply: "Maharashtra",
      rows: [{ item: "Raw Material", qty: 1, price: 1000, taxRate: "GST 18%" }],
    },
  ];

  const allLines = compileGstData({ sales, purchases, homeState: "Maharashtra" });
  assert.equal(allLines.length, 2);

  // Filter Sales Only
  const saleOnly = filterGstLines(allLines, { transactionType: "Sale" });
  assert.equal(saleOnly.length, 1);
  const saleMetrics = calculateGstRateMetrics(saleOnly);
  assert.equal(saleMetrics.totalTaxable, 2000);
  assert.equal(saleMetrics.totalTax, 360);

  // Filter Purchases Only
  const purchOnly = filterGstLines(allLines, { transactionType: "Purchase" });
  assert.equal(purchOnly.length, 1);
  const purchMetrics = calculateGstRateMetrics(purchOnly);
  assert.equal(purchMetrics.totalTaxable, 1000);
  assert.equal(purchMetrics.totalTax, 180);

  // Combined (All)
  const allMetrics = calculateGstRateMetrics(allLines);
  assert.equal(allMetrics.totalTaxable, 3000);
  assert.equal(allMetrics.totalTax, 540);
  assert.equal(allMetrics.totalTransactions, 2);
});

test("6. Credit Notes and Debit Notes Offset Turnover and Taxes", () => {
  const sales = [
    {
      id: "sale-1",
      invoiceNumber: "INV-1",
      invoiceDate: "2026-11-02",
      rows: [{ item: "Widgets", qty: 10, price: 100, taxRate: "GST 18%" }], // Taxable: 1000, Tax: 180
    },
  ];

  const saleReturns = [
    {
      id: "return-1",
      returnNumber: "CN-1",
      date: "2026-11-05",
      rows: [{ item: "Widgets", qty: 2, price: 100, taxRate: "GST 18%" }], // Taxable: 200, Tax: 36
    },
  ];

  const compiled = compileGstData({ sales, saleReturns });
  assert.equal(compiled.length, 2);

  const metrics = calculateGstRateMetrics(compiled);
  // Net Taxable = 1000 - 200 = 800
  // Net Tax = 180 - 36 = 144
  assert.equal(metrics.totalTaxable, 800);
  assert.equal(metrics.totalTax, 144);
  assert.equal(metrics.totalCgst, 72);
  assert.equal(metrics.totalSgst, 72);
});

test("7. Cancelled Transactions Exclusion and Deduplication", () => {
  const sales = [
    {
      id: "s1",
      invoiceNumber: "INV-VALID",
      invoiceDate: "2026-11-01",
      status: "Paid",
      rows: [{ item: "Item A", qty: 1, price: 500, taxRate: "GST 12%" }],
    },
    {
      id: "s2",
      invoiceNumber: "INV-CANCELLED",
      invoiceDate: "2026-11-02",
      status: "Cancelled",
      cancelled: true,
      rows: [{ item: "Item B", qty: 1, price: 1500, taxRate: "GST 18%" }],
    },
    // Duplicate ID test (simulating repeated record)
    {
      id: "s1",
      invoiceNumber: "INV-VALID",
      invoiceDate: "2026-11-01",
      status: "Paid",
      rows: [{ item: "Item A", qty: 1, price: 500, taxRate: "GST 12%" }],
    },
  ];

  const saleUiActions = {
    cancelled: { "s-ui-cancelled": true },
  };

  const compiled = compileGstData({ sales, saleUiActions });
  assert.equal(compiled.length, 1, "Only 1 valid, non-duplicate, non-cancelled transaction should be included");
  assert.equal(compiled[0].transactionNumber, "INV-VALID");
  assert.equal(compiled[0].taxable, 500);
  assert.equal(compiled[0].tax, 60);
});

test("8. Date Range Filtering and Boundary Precision", () => {
  const sales = [
    {
      id: "s1",
      invoiceDate: "2026-10-31", // Previous month
      rows: [{ item: "Oct item", qty: 1, price: 100, taxRate: "GST 18%" }],
    },
    {
      id: "s2",
      invoiceDate: "2026-11-01", // First day of Nov
      rows: [{ item: "Nov start", qty: 1, price: 200, taxRate: "GST 18%" }],
    },
    {
      id: "s3",
      invoiceDate: "2026-11-30", // Last day of Nov
      rows: [{ item: "Nov end", qty: 1, price: 300, taxRate: "GST 18%" }],
    },
    {
      id: "s4",
      invoiceDate: "2026-12-01", // Next month
      rows: [{ item: "Dec item", qty: 1, price: 400, taxRate: "GST 18%" }],
    },
  ];

  const compiled = compileGstData({ sales });

  // Filter November only: 2026-11-01 to 2026-11-30
  const novLines = filterGstLines(compiled, { from: "2026-11-01", to: "2026-11-30" });
  assert.equal(novLines.length, 2, "Both Nov 1 and Nov 30 must be included");
  const novMetrics = calculateGstRateMetrics(novLines);
  assert.equal(novMetrics.totalTaxable, 500); // 200 + 300
  assert.equal(novMetrics.totalTax, 90);     // 36 + 54
});

test("9. GST Rate Filter and Drill-Down View Isolation", () => {
  const sales = [
    {
      id: "s1",
      invoiceNumber: "INV-18",
      invoiceDate: "2026-11-05",
      party: "Alpha Corp",
      rows: [{ item: "Motor", qty: 1, price: 1000, taxRate: "GST 18%" }],
    },
    {
      id: "s2",
      invoiceNumber: "INV-12",
      invoiceDate: "2026-11-06",
      party: "Beta Ltd",
      rows: [{ item: "Cable", qty: 1, price: 500, taxRate: "GST 12%" }],
    },
  ];

  const compiled = compileGstData({ sales });

  // User filters by 18% rate (simulates clicking 'View Transactions' on 18% row)
  const filtered18 = filterGstLines(compiled, { rate: "18%" });
  assert.equal(filtered18.length, 1);
  assert.equal(filtered18[0].transactionNumber, "INV-18");
  assert.equal(filtered18[0].taxRate, 18);

  const metrics18 = calculateGstRateMetrics(filtered18);
  assert.equal(metrics18.totalTaxable, 1000);
  assert.equal(metrics18.totalTax, 180);
  assert.equal(metrics18.rateBreakdown.length, 1);
});

test("10. Rate Summary Print Document Generation", () => {
  const sales = [
    {
      id: "s1",
      invoiceNumber: "INV-001",
      invoiceDate: "2026-11-05",
      rows: [
        { item: "Electronics", qty: 1, price: 2000, taxRate: "GST 18%" },
        { item: "Food Grain", qty: 1, price: 500, taxRate: "GST 0%" },
      ],
    },
  ];

  const lines = compileGstData({ sales, homeState: "Maharashtra" });
  const metrics = calculateGstRateMetrics(lines);

  const rows = metrics.rateBreakdown.map((r, idx) => ({
    index: idx + 1,
    rate: r.rateLabel,
    count: r.transactionCount,
    taxable: r.taxable,
    cgst: r.cgst,
    sgst: r.sgst,
    igst: r.igst,
    tax: r.tax,
  }));

  const html = buildUnifiedDocumentHtml({
    title: "GST Rate Report",
    documentNumber: "GST-RATE-202611",
    date: "13/11/2026",
    status: `${metrics.rateBreakdown.length} Tax Rates`,
    partyName: "All Parties / General",
    columns: [
      { key: "index", label: "#", align: "center", width: "40px" },
      { key: "rate", label: "GST Rate", align: "left" },
      { key: "count", label: "Transactions", align: "center" },
      { key: "taxable", label: "Taxable", align: "right", formatMoney: true },
      { key: "cgst", label: "CGST", align: "right", formatMoney: true },
      { key: "sgst", label: "SGST", align: "right", formatMoney: true },
      { key: "igst", label: "IGST", align: "right", formatMoney: true },
      { key: "tax", label: "Total GST", align: "right", formatMoney: true },
    ],
    rows,
    totals: {
      subtotal: metrics.totalTaxable,
      total: metrics.totalTax,
    },
    notes: "Total Taxable: ₹2,500.00 | Total GST: ₹360.00",
  });

  assert.ok(html.includes("GST Rate Report"), "Document must contain title");
  assert.ok(html.includes("18%"), "Document must contain 18%");
  assert.ok(html.includes("0% (Exempt / Nil)"), "Document must contain 0% rate");
  assert.ok(html.includes("2,500"), "Document must contain subtotal 2500");
  assert.ok(html.includes("360"), "Document must contain total tax 360");
});
