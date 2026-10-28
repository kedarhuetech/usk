import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDashboardSummary, loadLocalDashboardSummary } from "./dashboardSummary.js";

test("calculates local receivables and payables with numeric strings and payment states", () => {
  const summary = calculateDashboardSummary({
    sales: [
      { id: "credit-partial", saleType: "credit", totals: { finalTotal: "1250", received: "250" } },
      { id: "credit-paid", saleType: "credit", totals: { finalTotal: 500, received: "500" } },
      { id: "cash", saleType: "cash", totals: { finalTotal: 900, received: 0 } },
    ],
    purchases: [
      { id: "supplier-open", saleType: "credit", totals: { finalTotal: "800", received: "300" } },
      { id: "supplier-paid", saleType: "credit", totals: { finalTotal: 450, received: 450 } },
      { id: "cash-purchase", saleType: "cash", totals: { finalTotal: 250, received: 0 } },
    ],
  });

  assert.deepEqual(summary, { receivable: 1000, payable: 500 });
});

test("handles empty records and excludes cancelled, deleted, returned, and duplicate sales", () => {
  assert.deepEqual(calculateDashboardSummary(), { receivable: 0, payable: 0 });
  const summary = calculateDashboardSummary({
    sales: [
      { id: "duplicate", totals: { finalTotal: 100 } },
      { id: "duplicate", totals: { finalTotal: 100 } },
      { id: "deleted", totals: { finalTotal: 200 } },
      { id: "cancelled", totals: { finalTotal: 300 } },
      { id: "returned", isReturn: true, totals: { finalTotal: 400 } },
    ],
    purchases: [{ id: "void-purchase", status: "Cancelled", totals: { finalTotal: 50 } }],
    saleUi: { deleted: ["deleted"], cancelled: { cancelled: true } },
  });
  assert.deepEqual(summary, { receivable: 100, payable: 0 });
});

test("reads existing local storage through repositories and rejects malformed JSON without overwriting it", async () => {
  const values = new Map([
    ["ledgerly:saleInvoices.v1", JSON.stringify([{ id: "sale-1", saleType: "credit", totals: { finalTotal: "75", received: "20" } }])],
    ["ledgerly:purchaseBills.v1", JSON.stringify([{ id: "bill-1", saleType: "credit", totals: { finalTotal: 60, received: 10 } }])],
  ]);
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } };

  assert.deepEqual(await loadLocalDashboardSummary(), { receivable: 55, payable: 50 });
  values.set("ledgerly:saleInvoices.v1", "{broken");
  await assert.rejects(loadLocalDashboardSummary(), /Could not read ledgerly:saleInvoices\.v1/);
  assert.equal(values.get("ledgerly:saleInvoices.v1"), "{broken");
  delete globalThis.window;
});

test("treats missing local storage collections as empty", async () => {
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => assert.fail("summary must not write storage") } };
  assert.deepEqual(await loadLocalDashboardSummary(), { receivable: 0, payable: 0 });
  delete globalThis.window;
});
