import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDashboardSummary, loadLocalDashboardSummary } from "./dashboardSummary.js";
import { restoreBackupPayload } from "./backupToComputer.js";
import { createLocalStorageBackupRestoreRepository } from "./backupRestoreRepository.js";

test("empty saved collections correctly produce zero balances", () => {
  const summary = calculateDashboardSummary();
  assert.equal(summary.receivable, 0);
  assert.equal(summary.payable, 0);
});

test("uses settlement terms and received amount, not the tender method, for purchase payable", () => {
  const summary = calculateDashboardSummary({ purchases: [
    { id: "unpaid", saleType: "credit", form: { paymentType: "Cash" }, totals: { finalTotal: 100, received: 0 } },
    { id: "paid", saleType: "credit", form: { paymentType: "UPI" }, totals: { finalTotal: 250, received: 250 } },
    { id: "partial", saleType: "credit", form: { paymentType: "Cash" }, totals: { finalTotal: 400, received: 125 } },
    { id: "cash", saleType: "cash", totals: { finalTotal: 80, received: 0 } },
  ] });
  assert.equal(summary.payable, 375);
  assert.equal(summary.purchasesPayable, 375);
});

test("combines multiple supplier balances and opening balances without counting duplicate invoices twice", () => {
  const summary = calculateDashboardSummary({
    purchases: [
      { id: "bill-a", saleType: "credit", totals: { finalTotal: 200, received: 0 } },
      { id: "bill-a", saleType: "credit", totals: { finalTotal: 200, received: 0 } },
      { id: "bill-b", saleType: "credit", totals: { finalTotal: 500, received: 300 } },
    ],
    parties: [
      { id: "supplier-a", openingBalance: "75", openingBalanceType: "to-pay" },
      { id: "customer", openingBalance: "60", openingBalanceType: "to-receive" },
    ],
  });
  assert.equal(summary.purchasesPayable, 400);
  assert.equal(summary.partyPayable, 75);
  assert.equal(summary.payable, 475);
  assert.equal(summary.partyReceivable, 60);
});

test("excludes cancelled, deleted, void and return records from outstanding balances", () => {
  const summary = calculateDashboardSummary({ purchases: [
    { id: "cancelled", status: "Cancelled", totals: { finalTotal: 50 } },
    { id: "void", status: "void", totals: { finalTotal: 50 } },
    { id: "deleted", deleted: true, totals: { finalTotal: 50 } },
    { id: "return", isReturn: true, totals: { finalTotal: 50 } },
    { id: "active", saleType: "credit", totals: { finalTotal: 90, received: 10 } },
  ] });
  assert.equal(summary.payable, 80);
});

test("calculates sales totals, receivables, and excludes duplicate and cancelled sales", () => {
  const summary = calculateDashboardSummary({
    sales: [
      { id: "credit-partial", saleType: "credit", totals: { finalTotal: "1250", received: "250" } },
      { id: "credit-partial", saleType: "credit", totals: { finalTotal: "1250", received: "250" } },
      { id: "credit-paid", saleType: "credit", totals: { finalTotal: 500, received: "500" } },
      { id: "cancelled", status: "Cancelled", totals: { finalTotal: 300 } },
      { id: "return", isReturn: true, totals: { finalTotal: 400 } },
    ],
  });
  assert.equal(summary.receivable, 1000);
  assert.equal(summary.totalSales, 1750);
  assert.equal(summary.activeSales.length, 2);
});

test("reads saved localStorage records, updates after a refresh, and does not need the backend", async () => {
  const values = new Map([
    ["ledgerly:saleInvoices.v1", JSON.stringify([])],
    ["ledgerly:purchaseBills.v1", JSON.stringify([{ id: "bill-1", saleType: "credit", form: { paymentType: "Cash" }, totals: { finalTotal: 60, received: 10 } }])],
    ["ledgerly:parties.v1", JSON.stringify([])],
  ]);
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null } };
  globalThis.fetch = async () => assert.fail("local dashboard summary must not call the backend");
  assert.equal((await loadLocalDashboardSummary()).payable, 50);
  values.set("ledgerly:purchaseBills.v1", JSON.stringify([]));
  assert.equal((await loadLocalDashboardSummary()).payable, 0);
  values.set("ledgerly:saleInvoices.v1", "{broken");
  await assert.rejects(loadLocalDashboardSummary(), /Could not read ledgerly:saleInvoices\.v1/);
  assert.equal(values.get("ledgerly:saleInvoices.v1"), "{broken");
  delete globalThis.window;
  delete globalThis.fetch;
});

test("restored purchase records are reflected in the local dashboard summary", async () => {
  const values = new Map([
    ["ledgerly:saleInvoices.v1", "[]"],
    ["ledgerly:purchaseBills.v1", "[]"],
    ["ledgerly:parties.v1", "[]"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let notified = false;
  globalThis.window = { localStorage: storage, dispatchEvent: () => { notified = true; } };
  const payload = {
    format: "usv-backup",
    formatVersion: 1,
    createdAt: "2026-10-30T00:00:00.000Z",
    application: { name: "USV" },
    manifest: { included: [{ category: "Purchases", key: "ledgerly:purchaseBills.v1" }] },
    data: { "ledgerly:purchaseBills.v1": [{ id: "restored-bill", saleType: "credit", totals: { finalTotal: 100, received: 25 } }] },
  };
  restoreBackupPayload(payload, createLocalStorageBackupRestoreRepository(storage));
  assert.equal(notified, true);
  assert.equal((await loadLocalDashboardSummary()).payable, 75);
  delete globalThis.window;
});

test("missing localStorage collections are treated as empty without writes", async () => {
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => assert.fail("summary must not write storage") } };
  const summary = await loadLocalDashboardSummary();
  assert.equal(summary.receivable, 0);
  assert.equal(summary.payable, 0);
  delete globalThis.window;
});
