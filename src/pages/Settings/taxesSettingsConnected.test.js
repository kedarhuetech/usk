import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";

test("unifiedPrintService handles composite scheme with Bill of Supply and statutory notice", () => {
  const html = buildUnifiedDocumentHtml({
    company: {
      appSettings: {
        compositeScheme: true,
      },
    },
    rows: [
      { item: "Service Item", qty: 1, price: 500, amount: 500, tax: 90 },
    ],
  });

  assert.ok(html.includes("Bill of Supply"), "Title should automatically default to Bill of Supply for composite dealers");
  assert.ok(html.includes("Composition taxable person, not eligible to collect tax on supplies"), "Statutory notice must be displayed");
  assert.ok(!html.includes("Tax (% / ₹)"), "Tax column should be omitted when composite scheme is active");
});

test("unifiedPrintService renders Reverse Charge Mechanism (RCM) notice when isRcm is true", () => {
  const html = buildUnifiedDocumentHtml({
    isRcm: true,
    rows: [
      { item: "Imported Service", qty: 1, price: 1000, amount: 1000 },
    ],
  });

  assert.ok(html.includes("Tax Payable on Reverse Charge: YES"), "Should render RCM badge");
});

test("unifiedPrintService renders Place of Supply when enablePlaceOfSupply is true or not false", () => {
  const htmlEnabled = buildUnifiedDocumentHtml({
    stateOfSupply: "Maharashtra",
    company: {
      appSettings: {
        enablePlaceOfSupply: true,
      },
    },
    rows: [{ item: "Item A", qty: 1, price: 100, amount: 100 }],
  });
  assert.ok(htmlEnabled.includes("<b>Place of Supply:</b> Maharashtra"), "Should show Place of Supply when enabled");

  const htmlDisabled = buildUnifiedDocumentHtml({
    stateOfSupply: "Maharashtra",
    company: {
      appSettings: {
        enablePlaceOfSupply: false,
      },
    },
    rows: [{ item: "Item A", qty: 1, price: 100, amount: 100 }],
  });
  assert.ok(!htmlDisabled.includes("<b>Place of Supply:</b>"), "Should omit Place of Supply when disabled");
});

test("unifiedPrintService renders TCS and TDS in totals breakdown", () => {
  const html = buildUnifiedDocumentHtml({
    tcsAmount: 75.50,
    tdsAmount: 120.00,
    rows: [{ item: "Industrial Machinery", qty: 1, price: 50000, amount: 50000 }],
  });

  assert.ok(html.includes("TCS (+):"), "Should render TCS row");
  assert.ok(html.includes("+₹ 75.50") || html.includes("+75.50") || html.includes("75.50"), "Should format TCS amount");
  assert.ok(html.includes("TDS Deductible (-):"), "Should render TDS row");
  assert.ok(html.includes("-₹ 120.00") || html.includes("-120.00") || html.includes("120.00"), "Should format TDS amount");
});

test("unifiedPrintService omits tax column when enableGst is false", () => {
  const html = buildUnifiedDocumentHtml({
    company: {
      appSettings: {
        enableGst: false,
      },
    },
    rows: [{ item: "Exempt Item", qty: 1, price: 100, amount: 100, tax: 18 }],
  });

  assert.ok(!html.includes("Tax (% / ₹)"), "Tax column should not appear when GST is disabled");
});
