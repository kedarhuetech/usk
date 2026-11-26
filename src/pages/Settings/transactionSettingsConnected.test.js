import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvoiceTotals, calculateRow } from "../../utils/saleInvoice.js";
import { getLast5PricesForItem } from "../../services/salesStorage.js";

// Mock localStorage for node test runner
if (typeof window === "undefined") {
  global.window = {
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
      clear() { this._store = {}; },
    },
  };
}

test("1. Transaction wise Discount & Tax in calculateInvoiceTotals", () => {
  const rows = [
    { qty: 2, price: 100, priceMode: "Without Tax", taxRate: "NONE" },
    { qty: 1, price: 50, priceMode: "Without Tax", taxRate: "NONE" },
  ];
  // Subtotal = 250.
  // With txnDiscount = 50:
  const withDiscount = calculateInvoiceTotals(rows, false, 0, 0, {}, 50, 0);
  assert.equal(withDiscount.amount, 250);
  assert.equal(withDiscount.txnDiscount, 50);
  assert.equal(withDiscount.finalTotal, 200);

  // With txnDiscount = 50 and txnTaxRate = 10%:
  // (250 - 50) * 10% = 20 tax -> final = 220
  const withTax = calculateInvoiceTotals(rows, false, 0, 0, {}, 50, 10);
  assert.equal(withTax.txnDiscount, 50);
  assert.equal(withTax.txnTax, 20);
  assert.equal(withTax.finalTotal, 220);
});

test("2. Free Item Quantity calculation & row aggregation", () => {
  const rows = [
    { qty: 10, freeQty: 2, price: 50, priceMode: "Without Tax", taxRate: "NONE" },
    { qty: 5, freeQty: 1, price: 100, priceMode: "Without Tax", taxRate: "NONE" },
  ];
  const totals = calculateInvoiceTotals(rows, false, 0, 0);
  assert.equal(totals.qty, 15);
  assert.equal(totals.freeQty, 3);
  // Amount charged is ONLY on billable qty (10*50 + 5*100 = 1000)
  assert.equal(totals.amount, 1000);
  assert.equal(totals.finalTotal, 1000);
});

test("3. getLast5PricesForItem queries and returns distinct prices", () => {
  window.localStorage.setItem("ledgerly:saleInvoices.v1:demo-business", JSON.stringify([
    {
      invoiceDate: "2026-11-20",
      rows: [{ item: "Wireless Mouse", price: 500 }],
    },
    {
      invoiceDate: "2026-11-21",
      rows: [{ item: "Wireless Mouse", price: 520 }],
    },
    {
      invoiceDate: "2026-11-22",
      rows: [{ item: "Wireless Mouse", price: 520 }], // duplicate rate
    },
    {
      invoiceDate: "2026-11-23",
      rows: [{ item: "Wireless Mouse", price: 490 }],
    },
    {
      invoiceDate: "2026-11-24",
      rows: [{ item: "Wireless Mouse", price: 510 }],
    },
  ]));

  const mousePrices = getLast5PricesForItem("Wireless Mouse", false);
  // Should return latest distinct prices: [510, 490, 520, 500]
  assert.deepEqual(mousePrices, [510, 490, 520, 500]);
});
