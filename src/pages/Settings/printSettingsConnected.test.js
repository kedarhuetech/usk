import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveCompanyInfo,
  buildUnifiedDocumentHtml,
} from "../../services/unifiedPrintService.js";

test("getEffectiveCompanyInfo respects print override inputs", () => {
  const customSettings = {
    printCompanyName: true,
    companyNamePrint: "USK Enterprises Custom",
    printPhoneNumber: true,
    phoneNumberPrint: "+91 99999 88888",
    printAddress: true,
    addressPrint: "Suite 404, Tech Park, Pune",
    printEmail: true,
    emailPrint: "billing@usktech.in",
    printSignatureText: "Managing Director",
  };

  const info = getEffectiveCompanyInfo(customSettings);
  assert.equal(info.name, "USK Enterprises Custom");
  assert.equal(info.phone, "+91 99999 88888");
  assert.equal(info.address, "Suite 404, Tech Park, Pune");
  assert.equal(info.email, "billing@usktech.in");
  assert.equal(info.signatureText, "Managing Director");
});

test("buildUnifiedDocumentHtml respects paperSize, orientation, and extraSpaceTopPdf", () => {
  const html = buildUnifiedDocumentHtml({
    title: "Tax Invoice",
    documentNumber: "INV-2026-001",
    company: {
      appSettings: {
        paperSize: "A5",
        orientation: "landscape",
        extraSpaceTopPdf: 20,
      },
    },
    rows: [{ item: "Test Item", qty: 2, price: 100, amount: 200 }],
  });

  assert.ok(html.includes("size: A5 landscape"), "Should apply A5 landscape page size");
  assert.ok(html.includes("margin: 20mm 10mm 12mm 10mm"), "Should apply extra top margin for letterhead");
  assert.ok(html.includes("padding-top:20mm"), "Should apply top padding on container");
});

test("buildUnifiedDocumentHtml respects itemTableColumns customization", () => {
  const htmlWithoutTaxAndPrice = buildUnifiedDocumentHtml({
    title: "Delivery Challan",
    company: {
      appSettings: {
        itemTableColumns: {
          item: true,
          hsn: false,
          qty: true,
          freeQty: false,
          price: false,
          discount: false,
          tax: false,
          amount: true,
        },
      },
    },
    rows: [{ item: "Steel Rods", hsn: "7214", qty: 50, price: 500, tax: 90, amount: 25000 }],
  });

  assert.ok(htmlWithoutTaxAndPrice.includes("Item Description"), "Item column should be included");
  assert.ok(htmlWithoutTaxAndPrice.includes("Steel Rods"), "Item name should be included");
  assert.ok(!htmlWithoutTaxAndPrice.includes("HSN/SAC"), "HSN column should be hidden");
  assert.ok(!htmlWithoutTaxAndPrice.includes("Rate"), "Rate/Price column should be hidden");
  assert.ok(!htmlWithoutTaxAndPrice.includes("Tax"), "Tax column should be hidden");
  assert.ok(htmlWithoutTaxAndPrice.includes("Amount"), "Amount column should be present");
});

test("buildUnifiedDocumentHtml respects decimal toggle, party balance, savings, signoffs, and acknowledgement", () => {
  const html = buildUnifiedDocumentHtml({
    title: "Tax Invoice",
    documentNumber: "INV-999",
    partyName: "Mahindra Logistics",
    partyCurrentBalance: 14500,
    paymentMode: "UPI / Bank Transfer",
    totals: {
      subtotal: 1000,
      discount: 100,
      tax: 180,
      finalTotal: 1080,
    },
    company: {
      appSettings: {
        printAmountWithDecimal: false,
        printCurrentBalanceParty: true,
        printYouSaved: true,
        printPaymentMode: true,
        printReceivedByDetails: true,
        printDeliveredByDetails: true,
        printAcknowledgement: true,
        printSignatureText: "Proprietor / Partner",
      },
    },
    rows: [{ item: "Gear Box", qty: 1, price: 1000, discount: 100, tax: 180, amount: 1080 }],
  });

  assert.ok(html.includes("Current Balance of Party: ₹ 14,500"), "Party balance should render without decimals");
  assert.ok(html.includes("🎉 You Saved: ₹ 100"), "You saved banner should render");
  assert.ok(html.includes("Payment Mode:</b> UPI / Bank Transfer"), "Payment mode should render");
  assert.ok(html.includes("Received by: ____________________"), "Received by signoff should render");
  assert.ok(html.includes("Delivered by: ____________________"), "Delivered by signoff should render");
  assert.ok(html.includes("--- ACKNOWLEDGEMENT SLIP (Customer Copy) ---"), "Acknowledgement slip should render");
  assert.ok(html.includes("Proprietor / Partner"), "Custom signature text should render");
});
