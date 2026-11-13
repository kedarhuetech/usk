import test from "node:test";
import assert from "node:assert/strict";
import {
  compileGstData,
  filterGstLines,
  compileGstSummary,
  groupLinesByTransaction,
  round2,
} from "../../utils/gstRateCalculations.js";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";

test("1. Sales GST Summary and Purchase GST Summary Calculations", () => {
  const sales = [
    // Intra-state sale (Maharashtra to Maharashtra): Taxable 2000, 18% -> CGST 180, SGST 180, Tax 360
    {
      id: "sale-01",
      invoiceNumber: "INV-001",
      invoiceDate: "2026-11-04",
      party: "Customer Mumbai",
      stateOfSupply: "Maharashtra",
      rows: [{ item: "Item A", qty: 2, price: 1000, taxRate: "GST 18%" }],
    },
    // Inter-state sale (Maharashtra to Gujarat): Taxable 1000, 12% -> IGST 120, Tax 120
    {
      id: "sale-02",
      invoiceNumber: "INV-002",
      invoiceDate: "2026-11-05",
      party: "Customer Surat",
      stateOfSupply: "Gujarat",
      rows: [{ item: "Item B", qty: 1, price: 1000, taxRate: "GST 12%" }],
    },
  ];

  const purchases = [
    // Intra-state purchase: Taxable 1500, 18% -> CGST 135, SGST 135, Tax 270
    {
      id: "purch-01",
      billNumber: "BILL-001",
      billDate: "2026-11-06",
      party: "Supplier Pune",
      stateOfSupply: "Maharashtra",
      rows: [{ item: "Raw Mat X", qty: 3, price: 500, taxRate: "GST 18%" }],
    },
    // Inter-state purchase: Taxable 500, 5% -> IGST 25, Tax 25
    {
      id: "purch-02",
      billNumber: "BILL-002",
      billDate: "2026-11-07",
      party: "Supplier Delhi",
      stateOfSupply: "Delhi",
      rows: [{ item: "Raw Mat Y", qty: 1, price: 500, taxRate: "GST 5%" }],
    },
  ];

  const lines = compileGstData({ sales, purchases, homeState: "Maharashtra" });
  assert.equal(lines.length, 4);

  const summary = compileGstSummary(lines);

  // Sales GST Summary Verification
  assert.equal(summary.sales.taxable, 3000, "Taxable sales: 2000 + 1000 = 3000");
  assert.equal(summary.sales.cgst, 180, "CGST collected: 180");
  assert.equal(summary.sales.sgst, 180, "SGST collected: 180");
  assert.equal(summary.sales.igst, 120, "IGST collected: 120");
  assert.equal(summary.sales.tax, 480, "Total GST on sales: 360 + 120 = 480");
  assert.equal(summary.sales.count, 2, "Sales invoices count: 2");
  assert.equal(
    round2(summary.sales.cgst + summary.sales.sgst + summary.sales.igst),
    summary.sales.tax,
    "Sales taxes must reconcile"
  );

  // Purchase GST Summary Verification
  assert.equal(summary.purchases.taxable, 2000, "Taxable purchases: 1500 + 500 = 2000");
  assert.equal(summary.purchases.cgst, 135, "CGST paid: 135");
  assert.equal(summary.purchases.sgst, 135, "SGST paid: 135");
  assert.equal(summary.purchases.igst, 25, "IGST paid: 25");
  assert.equal(summary.purchases.tax, 295, "Total GST on purchases: 270 + 25 = 295");
  assert.equal(summary.purchases.count, 2, "Purchase bills count: 2");
  assert.equal(
    round2(summary.purchases.cgst + summary.purchases.sgst + summary.purchases.igst),
    summary.purchases.tax,
    "Purchase taxes must reconcile"
  );

  // Overall Summary Verification
  assert.equal(summary.overall.totalSalesGst, 480);
  assert.equal(summary.overall.totalPurchaseGst, 295);
  // Difference = 480 - 295 = 185
  assert.equal(summary.overall.netDifference, 185, "Net difference = 480 - 295 = 185");
  assert.equal(summary.overall.totalTaxable, 5000);
  assert.equal(summary.overall.totalTransactions, 4);
});

test("2. Transaction-Level Voucher Grouping", () => {
  const sales = [
    {
      id: "inv-multi",
      invoiceNumber: "INV-99",
      invoiceDate: "2026-11-05",
      party: "Mega Store",
      stateOfSupply: "Maharashtra",
      rows: [
        { item: "Item 1", qty: 1, price: 1000, taxRate: "GST 18%" }, // Taxable 1000, CGST 90, SGST 90
        { item: "Item 2", qty: 2, price: 500, taxRate: "GST 12%" },  // Taxable 1000, CGST 60, SGST 60
      ],
    },
  ];

  const lines = compileGstData({ sales, homeState: "Maharashtra" });
  assert.equal(lines.length, 2, "2 item lines");

  const vouchers = groupLinesByTransaction(lines);
  assert.equal(vouchers.length, 1, "Must be consolidated into 1 voucher");

  const v = vouchers[0];
  assert.equal(v.transactionNumber, "INV-99");
  assert.equal(v.party, "Mega Store");
  assert.equal(v.taxable, 2000, "Voucher taxable = 1000 + 1000 = 2000");
  assert.equal(v.cgst, 150, "Voucher CGST = 90 + 60 = 150");
  assert.equal(v.sgst, 150, "Voucher SGST = 90 + 60 = 150");
  assert.equal(v.igst, 0);
  assert.equal(v.tax, 300, "Voucher Total GST = 180 + 120 = 300");
  assert.ok(v.ratesLabel.includes("18%"));
  assert.ok(v.ratesLabel.includes("12%"));
});

test("3. Credit Notes (Sale Returns) and Debit Notes (Purchase Returns) Impact", () => {
  const sales = [
    {
      id: "sale-1",
      invoiceNumber: "INV-10",
      invoiceDate: "2026-11-02",
      rows: [{ item: "Apparel", qty: 10, price: 500, taxRate: "GST 5%" }], // Taxable 5000, Tax 250
    },
  ];

  const saleReturns = [
    {
      id: "return-1",
      returnNumber: "CN-1",
      date: "2026-11-03",
      rows: [{ item: "Apparel", qty: 2, price: 500, taxRate: "GST 5%" }],  // Taxable 1000, Tax 50
    },
  ];

  const lines = compileGstData({ sales, saleReturns, homeState: "Maharashtra" });
  const summary = compileGstSummary(lines);

  // Net Sales Taxable = 5000 - 1000 = 4000
  // Net Sales GST = 250 - 50 = 200
  assert.equal(summary.sales.taxable, 4000);
  assert.equal(summary.sales.tax, 200);
  assert.equal(summary.sales.cgst, 100);
  assert.equal(summary.sales.sgst, 100);
});

test("4. Cancelled Transactions Exclusion", () => {
  const sales = [
    {
      id: "s-ok",
      invoiceNumber: "INV-OK",
      invoiceDate: "2026-11-02",
      status: "Paid",
      rows: [{ item: "Tool", qty: 1, price: 1000, taxRate: "GST 18%" }],
    },
    {
      id: "s-cancelled",
      invoiceNumber: "INV-CANCELLED",
      invoiceDate: "2026-11-02",
      status: "Cancelled",
      cancelled: true,
      rows: [{ item: "Tool", qty: 1, price: 5000, taxRate: "GST 18%" }],
    },
  ];

  const lines = compileGstData({ sales, homeState: "Maharashtra" });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].transactionNumber, "INV-OK");

  const summary = compileGstSummary(lines);
  assert.equal(summary.sales.taxable, 1000);
  assert.equal(summary.sales.tax, 180);
});

test("5. Filtering by Transaction Type (Sales vs Purchases)", () => {
  const sales = [
    {
      id: "s1",
      invoiceDate: "2026-11-05",
      rows: [{ item: "Product", qty: 1, price: 1000, taxRate: "GST 18%" }],
    },
  ];
  const purchases = [
    {
      id: "p1",
      billDate: "2026-11-06",
      rows: [{ item: "Stock", qty: 1, price: 800, taxRate: "GST 18%" }],
    },
  ];

  const allLines = compileGstData({ sales, purchases });

  // Filter Sales
  const saleLines = filterGstLines(allLines, { transactionType: "Sale" });
  const saleSummary = compileGstSummary(saleLines);
  assert.equal(saleSummary.sales.taxable, 1000);
  assert.equal(saleSummary.purchases.taxable, 0);

  // Filter Purchases
  const purchLines = filterGstLines(allLines, { transactionType: "Purchase" });
  const purchSummary = compileGstSummary(purchLines);
  assert.equal(purchSummary.purchases.taxable, 800);
  assert.equal(purchSummary.sales.taxable, 0);
});

test("6. GST Report Print Document Generation", () => {
  const sales = [
    {
      id: "s1",
      invoiceNumber: "INV-100",
      invoiceDate: "2026-11-05",
      party: "Customer A",
      rows: [{ item: "Goods", qty: 1, price: 2000, taxRate: "GST 18%" }],
    },
  ];

  const lines = compileGstData({ sales, homeState: "Maharashtra" });
  const summary = compileGstSummary(lines);
  const vouchers = groupLinesByTransaction(lines);

  const rows = vouchers.map((v, idx) => ({
    index: idx + 1,
    date: v.date,
    type: v.transactionType,
    number: v.transactionNumber,
    party: v.party,
    taxable: v.taxable,
    cgst: v.cgst,
    sgst: v.sgst,
    igst: v.igst,
    tax: v.tax,
  }));

  const html = buildUnifiedDocumentHtml({
    title: "GST Report",
    documentNumber: "GST-REP-202611",
    date: "13/11/2026",
    status: "1 Transactions",
    partyName: "All Parties",
    columns: [
      { key: "index", label: "#", align: "center" },
      { key: "date", label: "Date", align: "center" },
      { key: "type", label: "Type", align: "center" },
      { key: "number", label: "Doc No.", align: "left" },
      { key: "party", label: "Party", align: "left" },
      { key: "taxable", label: "Taxable", align: "right", formatMoney: true },
      { key: "tax", label: "Total GST", align: "right", formatMoney: true },
    ],
    rows,
    totals: {
      subtotal: summary.overall.totalTaxable,
      total: summary.overall.totalTax,
    },
    notes: `Sales GST: ₹${summary.sales.tax.toFixed(2)} | Purchase GST: ₹${summary.purchases.tax.toFixed(2)} | Difference: ₹${summary.overall.netDifference.toFixed(2)}`,
  });

  assert.ok(html.includes("GST Report"), "Document must contain title");
  assert.ok(html.includes("INV-100"), "Document must contain invoice number");
  assert.ok(html.includes("2,000"), "Document must contain taxable amount");
  assert.ok(html.includes("360"), "Document must contain total tax");
});
