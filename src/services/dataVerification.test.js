// Tests read-only data verification rules and backend failures.
import test from "node:test";
import assert from "node:assert/strict";
import { runDataVerification, verifyBusinessData } from "./dataVerification.js";

const baseTransaction = (overrides = {}) => ({
  id: "sale-1",
  form: { invoiceNumber: "INV-1", customer: "Customer" },
  rows: [{ id: "line-1", item: "Widget", sourceItemId: "item-1", qty: "2", price: "50", taxRate: "10%" }],
  totals: { finalTotal: 110, received: 10, balance: 100, roundOffAmount: 0 },
  ...overrides,
});

test("accepts consistent totals and explicit references", () => {
  const result = verifyBusinessData({
    items: [{ id: "item-1" }],
    parties: [{ id: "party-1" }],
    salesInvoices: [baseTransaction()],
    purchaseBills: [],
  });
  assert.equal(result.recordsChecked, 3);
  assert.equal(result.issues.length, 0);
  assert.ok(result.incompleteChecks.some((entry) => entry.includes("Stock quantities")));
});

test("finds changed totals and missing item and party IDs", () => {
  const result = verifyBusinessData({
    items: [],
    parties: [],
    salesInvoices: [baseTransaction({
      totals: { finalTotal: 100, received: 10, balance: 90, roundOffAmount: 0 },
      form: { invoiceNumber: "INV-2", partyId: "missing-party" },
      rows: [{ id: "line-2", item: "Missing", sourceItemId: "missing-item", qty: "2", price: "50", taxRate: "10%" }],
    })],
    purchaseBills: [],
  });
  assert.equal(result.issues.length, 4);
  assert.ok(result.issues.some((issue) => issue.explanation.includes("recalculated")));
  assert.ok(result.issues.some((issue) => issue.explanation.includes("Saved remaining balance")));
  assert.ok(result.issues.some((issue) => issue.explanation.includes("missing-item")));
  assert.ok(result.issues.some((issue) => issue.explanation.includes("missing-party")));
});

test("handles empty data without inventing problems", () => {
  const result = verifyBusinessData({ items: [], parties: [], salesInvoices: [], purchaseBills: [] });
  assert.equal(result.recordsChecked, 0);
  assert.equal(result.issues.length, 0);
});

test("reports a transaction line with a missing quantity and incomplete saved totals", () => {
  const result = verifyBusinessData({
    items: [],
    parties: [],
    salesInvoices: [baseTransaction({ rows: [{ id: "line-empty", item: "Widget", qty: "", price: "50" }], totals: {} })],
    purchaseBills: [],
  });
  assert.ok(result.issues.some((issue) => issue.explanation.includes("quantity")));
  assert.ok(result.incompleteChecks.some((entry) => entry.includes("no saved rows or final total")));
});

test("reports API failure as incomplete and does not claim records were checked", async () => {
  const result = await runDataVerification({ list: async () => { throw new Error("HTTP 502"); } });
  assert.equal(result.failed, true);
  assert.equal(result.recordsChecked, 0);
  assert.equal(result.issues.length, 0);
  assert.match(result.incompleteChecks[0], /HTTP 502/);
});

test("reads all supported records using only list operations", async () => {
  const requested = [];
  const api = { list: async (resource) => { requested.push(resource); return []; }, save: () => assert.fail("Verification must not save records") };
  const result = await runDataVerification(api);
  assert.deepEqual(requested.sort(), ["items", "parties", "purchase-bills", "sales-invoices"]);
  assert.equal(result.recordsChecked, 0);
});
