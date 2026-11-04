import assert from "node:assert/strict";
import test from "node:test";
import { getSaleInvoices, saveSaleInvoice, saleInvoicesStorageKey, setSaleInvoiceLifecycle } from "./salesStorage.js";
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

test("cancelled invoice lifecycle and payment status persist independently", () => {
  const previousWindow = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }, dispatchEvent: () => true };
  try {
    const initial = saveSaleInvoice({ id: "cancelled-sale-1", transactionType: "sale", totals: { finalTotal: 120, received: 0 }, stockAdjustedAt: "already-adjusted" });
    setSaleInvoiceLifecycle(initial.id, "Cancelled");
    saveSaleInvoice({ ...getSaleInvoices()[0], totals: { finalTotal: 120, received: 120 } });

    const reloaded = getSaleInvoices().find((entry) => entry.id === initial.id);
    const settlement = calculateInvoiceSettlement(reloaded, { kind: "sale" });
    assert.equal(reloaded.invoiceStatus, "Cancelled");
    assert.equal(reloaded.cancelled, true);
    assert.equal(settlement.invoiceStatus, "Cancelled");
    assert.equal(settlement.paymentStatus, "Paid");
    assert.equal(settlement.paid, 120);
    assert.equal(settlement.outstanding, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
