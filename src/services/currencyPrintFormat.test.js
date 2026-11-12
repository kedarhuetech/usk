import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUnifiedDocumentHtml,
  buildUnifiedStatementHtml,
  getEffectiveCompanyInfo,
} from "./unifiedPrintService.js";
import {
  getAppSettings,
  saveAppSettings,
  formatCurrency,
  APP_SETTINGS_KEY,
} from "./appSettingsStorage.js";

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
    dispatchEvent: () => true,
  };
}

test("Currency Fix: buildUnifiedStatementHtml strictly displays Indian Rupee (₹) and never dollar ($)", () => {
  // Simulate appSettings with multiCurrency disabled
  saveAppSettings({
    multiCurrencyEnabled: false,
    currencySymbol: "₹",
    currency: "INR",
  });

  const html = buildUnifiedStatementHtml({
    party: { partyName: "TEST Supplier Mills", phone: "9876543211" },
    rows: [
      {
        date: "30/10/2026",
        source: "Debit Note",
        number: "TEST-DN-601",
        status: "Paid",
        total: 700,
        received: 0,
        balance: 700,
        receivableBalance: 700,
        payableBalance: 0,
      },
      {
        date: "30/10/2026",
        source: "Payment-Out",
        number: "TEST-POUT-401",
        status: "Paid",
        total: 2000,
        received: 0,
        balance: 2700,
        receivableBalance: 2700,
        payableBalance: 0,
      },
    ],
    totals: {
      totalAmount: 2700,
      totalReceived: 0,
      totalBalance: 2700,
      totalReceivable: 2700,
      totalPayable: 0,
    },
  });

  // Must contain ₹ and not $
  assert.ok(html.includes("₹ 700.00"), "Row total must have ₹");
  assert.ok(html.includes("₹ 2,000.00"), "Row total must have ₹");
  assert.ok(html.includes("₹ 2,700.00"), "Grand total must have ₹");
  assert.ok(!html.includes("$ 700.00"), "Must NOT contain $ 700.00");
  assert.ok(!html.includes("$ 2,000.00"), "Must NOT contain $ 2,000.00");
  assert.ok(!html.includes("$ 2,700.00"), "Must NOT contain $ 2,700.00");
});

test("Currency Fix: buildUnifiedDocumentHtml normalizes stray dollar to ₹ when multiCurrency is disabled", () => {
  const html = buildUnifiedDocumentHtml({
    title: "Tax Invoice",
    documentNumber: "INV-999",
    totalAmount: 5000,
    items: [
      { key: "index", val: 1 },
      { key: "item", val: "Office Chairs" },
      { key: "price", val: 5000 },
      { key: "amount", val: 5000 },
    ],
    columns: [
      { key: "item", label: "Item" },
      { key: "price", label: "Rate", formatMoney: true },
      { key: "amount", label: "Amount", formatMoney: true },
    ],
    company: {
      name: "BluePeak Office Supplies",
      currencySymbol: "$", // stray dollar passed
      appSettings: { multiCurrencyEnabled: false },
    },
  });

  assert.ok(html.includes("₹ 5,000.00"), "Normalized to Indian Rupee");
  assert.ok(!html.includes("$ 5,000.00"), "No dollar symbol in print document");
});

test("Currency Fix: Multi-currency enabled correctly respects designated foreign currency when active", () => {
  saveAppSettings({
    multiCurrencyEnabled: true,
    baseCurrency: { code: "USD", symbol: "$", name: "US Dollar", exchangeRate: 1 },
    currencySymbol: "$",
  });

  const info = getEffectiveCompanyInfo();
  assert.equal(info.currencySymbol, "$", "When multiCurrencyEnabled is true, custom baseCurrency is honored");

  // Reset back to INR defaults
  saveAppSettings({
    multiCurrencyEnabled: false,
    baseCurrency: null,
    currencySymbol: "₹",
    currency: "INR",
  });
});
