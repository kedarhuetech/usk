import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSalesInvoices } from "./businessRecords.js";

test("locally saved POS invoices remain listed when the backend is unavailable", async () => {
  const values = new Map([
    ["ledgerly:saleInvoices.v1", JSON.stringify([{ id: "pos-sale-1", transactionType: "sale", saleType: "credit", invoiceNumber: "POS-1", totals: { finalTotal: 100, received: 25 } }])],
  ]);
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null } };
  globalThis.fetch = async () => { throw new TypeError("backend unavailable"); };
  try {
    const rows = await loadSalesInvoices();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "pos-sale-1");
    assert.equal(rows[0].totals.finalTotal, 100);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    globalThis.fetch = priorFetch;
  }
});
