import test from "node:test";
import assert from "node:assert/strict";
import {
  numberToWords,
  getEffectiveCompanyInfo,
  buildUnifiedDocumentHtml,
  buildUnifiedStatementHtml,
} from "./unifiedPrintService.js";

// Mock localStorage for node test runner
if (typeof globalThis.window === "undefined") {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  };
}

test("numberToWords converts integers and decimals to Indian currency words", () => {
  assert.equal(numberToWords(0), "Zero Rupees Only");
  assert.equal(numberToWords(792), "Seven Hundred Ninety Two Rupees Only");
  assert.equal(numberToWords(1500.5), "One Thousand Five Hundred Rupees and Fifty Paise Only");
  assert.equal(numberToWords(100000), "One Lakh Rupees Only");
  assert.equal(numberToWords(10000000), "One Crore Rupees Only");
});

test("getEffectiveCompanyInfo falls back gracefully when storage is empty", () => {
  const info = getEffectiveCompanyInfo();
  assert.ok(info.name);
  assert.ok(info.themeColor);
  assert.ok(info.currencySymbol);
});

test("buildUnifiedDocumentHtml outputs complete HTML with theme color, items, and totals", () => {
  const html = buildUnifiedDocumentHtml({
    docType: "Sales Order",
    docNumber: "SO-101",
    docDate: "2026-11-07",
    partyName: "Rahul Enterprises",
    partyPhone: "9876543210",
    billToAddress: "Shop 12, Main Market, Mumbai",
    shipToAddress: "Warehouse 4, Bhiwandi",
    status: "Confirmed",
    items: [
      { name: "Basmati Rice 25kg", qty: 2, price: 1500, amount: 3000 },
      { name: "Sugar 50kg", qty: 1, price: 2100, amount: 2100 },
    ],
    columns: [
      { label: "Item", key: "name" },
      { label: "Qty", key: "qty", align: "center" },
      { label: "Price", align: "right", render: (r) => `₹ ${r.price}` },
      { label: "Amount", align: "right", render: (r) => `₹ ${r.amount}` },
    ],
    totals: [
      { label: "Sub Total", value: "₹ 5,100.00" },
      { label: "Total Order Amount", value: "₹ 5,100.00", isGrand: true },
    ],
    totalAmount: 5100,
    company: {
      name: "Sai Kirana Stores",
      phone: "8369501991",
      themeColor: "#881337",
      currencySymbol: "₹",
      termsAndConditions: "Goods once sold will not be taken back.",
    },
    autoPrint: false,
  });

  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes("Sales Order"));
  assert.ok(html.includes("SO-101"));
  assert.ok(html.includes("Rahul Enterprises"));
  assert.ok(html.includes("Basmati Rice 25kg"));
  assert.ok(html.includes("#881337"));
  assert.ok(html.includes("Five Thousand One Hundred Rupees Only"));
});

test("buildUnifiedStatementHtml outputs complete Party Statement with matching theme", () => {
  const html = buildUnifiedStatementHtml({
    party: {
      partyName: "Amit Traders",
      phone: "9123456780",
      billingAddress: "Pune",
      shippingAddress: "Pune Hub",
    },
    rows: [
      {
        date: "01/11/2026",
        source: "Sale Invoice",
        number: "INV-001",
        status: "Paid",
        total: 10000,
        received: 10000,
        balance: 0,
        receivableBalance: 0,
        payableBalance: 0,
      },
    ],
    totals: {
      amount: 10000,
      received: 10000,
      balance: 0,
      receivable: 0,
      payable: 0,
    },
    printShipping: true,
    autoPrint: true,
  });

  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes("Party Statement"));
  assert.ok(html.includes("Amit Traders"));
  assert.ok(html.includes("INV-001"));
  assert.ok(html.includes("window.print()"));
});
