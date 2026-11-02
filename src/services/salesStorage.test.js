import assert from "node:assert/strict";
import test from "node:test";
import { getSaleInvoices, saveSaleInvoice, saleInvoicesStorageKey } from "./salesStorage.js";
import { calculateInvoiceSettlement } from "./partyBalances.js";

test("editing a received amount updates the canonical saved sale and survives reload", () => {
  const previousWindow = globalThis.window;
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.has(key) ? data.get(key) : null,
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
    },
    dispatchEvent: () => true,
  };
  try {
    const invoice = { id: "regression-sale-288", transactionType: "sale", saleType: "credit", totals: { finalTotal: 288, received: 0 }, stockAdjustedAt: "already-adjusted" };
    saveSaleInvoice(invoice);
    assert.equal(calculateInvoiceSettlement(getSaleInvoices()[0], { kind: "sale" }).status, "Unpaid");

    saveSaleInvoice({ ...getSaleInvoices()[0], totals: { finalTotal: 288, received: 288 } });
    const refreshed = getSaleInvoices().find((record) => record.id === invoice.id);
    assert.equal(calculateInvoiceSettlement(refreshed, { kind: "sale" }).status, "Paid");
    assert.equal(calculateInvoiceSettlement(refreshed, { kind: "sale" }).outstanding, 0);
    assert.equal(JSON.parse(data.get(saleInvoicesStorageKey)).filter((record) => record.id === invoice.id).length, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
