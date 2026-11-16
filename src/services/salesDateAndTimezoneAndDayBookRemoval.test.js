import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYMD, formatDateDMY, generatePartyStatement } from "./partyStatementService.js";
import { normalizeInvoice } from "./salesStorage.js";
import { dashboardData } from "../constants/dashboardData.js";
import fs from "node:fs";
import path from "node:path";

function setupMockEnvironment(initialStorage = {}) {
  const store = new Map(Object.entries(initialStorage));
  const sessionStore = new Map();
  const eventListeners = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
    },
    sessionStorage: {
      getItem: (key) => sessionStore.get(key) ?? null,
      setItem: (key, val) => sessionStore.set(key, String(val)),
      removeItem: (key) => sessionStore.delete(key),
    },
    addEventListener: (event, handler) => {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      const list = eventListeners.get(event) || [];
      eventListeners.set(event, list.filter((h) => h !== handler));
    },
    dispatchEvent: () => true,
  };

  return { store, sessionStore };
}

test("Issue A1: parseYMD and formatDateDMY accurately handle 16/11/2026 and YYYY-MM-DD strings without shifting", () => {
  assert.equal(parseYMD("2026-11-16"), "2026-11-16");
  assert.equal(formatDateDMY("2026-11-16"), "16/11/2026");

  assert.equal(parseYMD("16/11/2026"), "2026-11-16");
  assert.equal(formatDateDMY("16/11/2026"), "16/11/2026");

  assert.equal(parseYMD("16-11-2026"), "2026-11-16");
  assert.equal(formatDateDMY("16-11-2026"), "16/11/2026");
});

test("Issue A2: Timezone immunity - ISO timestamps ending in Z or with time resolve to local calendar date", () => {
  // 2026-11-15T18:30:00.000Z corresponds to 2026-11-16 00:00:00 IST (UTC+05:30)
  // In an IST environment, it must resolve to 2026-11-16, not 2026-11-15.
  const tzOffsetMinutes = new Date().getTimezoneOffset(); // in IST: -330
  if (tzOffsetMinutes === -330) {
    const isoUtc = "2026-11-15T18:30:00.000Z";
    const parsed = parseYMD(isoUtc);
    assert.equal(parsed, "2026-11-16", `Expected 2026-11-16 in IST timezone, got ${parsed}`);
    assert.equal(formatDateDMY(isoUtc), "16/11/2026");
  }

  // Pure calendar dates like 2026-11-16 must NEVER shift regardless of timezone
  assert.equal(parseYMD("2026-11-16"), "2026-11-16");
  assert.equal(formatDateDMY("2026-11-16"), "16/11/2026");
});

test("Issue A3: normalizeInvoice preserves exact invoiceDate and date as 2026-11-16", () => {
  const invoice = normalizeInvoice({
    id: "sale-date-test-1",
    invoiceNumber: "INV-100",
    invoiceDate: "2026-11-16",
    partyName: "Test Party",
  });

  assert.equal(invoice.invoiceDate, "2026-11-16");
  assert.equal(invoice.transactionDate, "2026-11-16");
  assert.equal(invoice.date, "2026-11-16");
  assert.equal(invoice.form.invoiceDate, "2026-11-16");
});

test("Issue A4: Party Statement displays 16/11/2026 for sale created on 16/11/2026", () => {
  setupMockEnvironment();

  const party = {
    id: "party-date-test",
    partyName: "Rahul Sharma",
    openingBalance: 0,
  };

  const sale = {
    id: "sale-rahul-1",
    invoiceNumber: "INV-001",
    partyId: "party-date-test",
    partyName: "Rahul Sharma",
    date: "2026-11-16",
    invoiceDate: "2026-11-16",
    totalAmount: 1500,
    paidAmount: 0,
    saleType: "credit",
  };

  const statement = generatePartyStatement({
    party,
    from: "2026-11-01",
    to: "2026-11-30",
    sales: [sale],
    purchases: [],
    paymentIns: [],
    paymentOuts: [],
  });

  assert.equal(statement.transactions.length, 1);
  const txn = statement.transactions[0];
  assert.equal(txn.date, "2026-11-16");
  assert.equal(formatDateDMY(txn.date), "16/11/2026");
});

test("Issue B1: Day Book is completely removed from dashboardData.reports", () => {
  assert.ok(!dashboardData.reports.includes("Daybook Report"), "Daybook Report must not be in dashboardData.reports");
  assert.ok(!dashboardData.reports.includes("Day Book"), "Day Book must not be in dashboardData.reports");
  assert.ok(dashboardData.reports.includes("All Transactions"), "All Transactions must remain in dashboardData.reports");
  assert.ok(dashboardData.reports.includes("Sale Report"), "Sale Report must remain in dashboardData.reports");
  assert.ok(dashboardData.reports.includes("Party Statement"), "Party Statement must remain in dashboardData.reports");
});

test("Issue B2: Day Book is removed from Reports.jsx and Topbar.jsx files, while All Transactions is retained", () => {
  const reportsFile = fs.readFileSync(path.resolve(process.cwd(), "src/pages/Reports/Reports.jsx"), "utf-8");
  const topbarFile = fs.readFileSync(path.resolve(process.cwd(), "src/components/Topbar/Topbar.jsx"), "utf-8");

  // Verify Day Book is NOT in Reports.jsx
  assert.ok(!reportsFile.includes('"Day book"'), 'Reports.jsx must not contain "Day book"');
  assert.ok(!reportsFile.includes('"Day Book"'), 'Reports.jsx must not contain "Day Book"');
  assert.ok(!reportsFile.includes("isDayBook"), 'Reports.jsx must not contain isDayBook');

  // Verify All Transactions IS in Reports.jsx
  assert.ok(reportsFile.includes('"All Transactions"'), 'Reports.jsx must contain "All Transactions"');
  assert.ok(reportsFile.includes("isAllTransactions"), 'Reports.jsx must contain isAllTransactions');

  // Verify Day Book is NOT in Topbar.jsx
  assert.ok(!topbarFile.includes('"Day Book"'), 'Topbar.jsx must not contain "Day Book"');
  assert.ok(!topbarFile.includes('"Day book"'), 'Topbar.jsx must not contain "Day book"');

  // Verify All Transactions IS in Topbar.jsx
  assert.ok(topbarFile.includes('"All Transactions"'), 'Topbar.jsx must contain "All Transactions"');
});
