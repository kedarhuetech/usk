import test from "node:test";
import assert from "node:assert/strict";
import { cancelSaleReturn, saveSaleReturn, getSaleReturns } from "./saleReturnsStorage.js";

const keys = {
  returns: "ledgerly:saleReturns.v1",
  invoices: "ledgerly:saleInvoices.v1",
  items: "ledgerly:inventoryItems.v1",
  history: "ledgerly:inventoryAdjustments.v1",
  payments: "ledgerly:paymentOuts.v1",
};

function setup() {
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
    },
    dispatchEvent: () => true,
  };
  globalThis.Event ||= class Event {};
  const invoice = {
    id: "invoice-1", transactionType: "sale", invoiceNumber: "S-1",
    form: { customer: "Asha" }, totals: { finalTotal: 47.2, received: 47.2 },
    rows: [{ id: "line-1", item: "Tea", sourceItemId: "item-1", qty: "2", price: "20", priceMode: "Without Tax", discountPercent: "0", taxRate: "18%", calculated: { discount: 0 } }],
  };
  window.localStorage.setItem(keys.invoices, JSON.stringify([invoice]));
  window.localStorage.setItem(keys.items, JSON.stringify([{ id: "item-1", itemName: "Tea", openingQuantity: "0", stock: "0" }]));
  const makeReturn = (qty, extras = {}) => {
    const value = {
      id: "", type: "Credit Note", number: String(getSaleReturns().length + 1), invoiceId: "invoice-1",
      invoiceNumber: "S-1", party: "Asha", date: "2026-10-30", received: 23.6,
      paymentType: "Cash", rows: [{ sourceRowId: "line-1", sourceItemId: "item-1", item: "Tea", qty: String(qty), price: "20", priceMode: "Without Tax", discount: "0", discountPercent: "0", tax: "18", taxRate: "18%", restockable: true }],
      ...extras,
    };
    const total = Number(qty) * 23.6;
    return { ...value, total, adjustedAmount: value.adjustedAmount || 0, customerCreditAmount: value.customerCreditAmount ?? Math.max(total - Number(value.received || 0) - Number(value.adjustedAmount || 0), 0) };
  };
  return { data, makeReturn };
}

test("partial credit notes enforce quantities, restock only once, and record refund", () => {
  const { makeReturn } = setup();
  const first = saveSaleReturn(makeReturn(1));
  assert.equal(first.total, 23.6);
  assert.throws(() => saveSaleReturn(makeReturn(2)), /exceeds the remaining returnable quantity/);
  assert.equal(JSON.parse(window.localStorage.getItem(keys.items))[0].stock, "1");
  assert.equal(JSON.parse(window.localStorage.getItem(keys.history)).length, 1);
  assert.equal(JSON.parse(window.localStorage.getItem(keys.history))[0].direction, "add");
  assert.equal(JSON.parse(window.localStorage.getItem(keys.payments)).length, 1);
  assert.equal(JSON.parse(window.localStorage.getItem(keys.invoices))[0].creditNoteReturnedQuantities["line-1"], 1);
  const secondInput = makeReturn(1, { received: 0, number: "2" });
  const second = saveSaleReturn(secondInput);
  assert.equal(getSaleReturns().length, 2);
  assert.equal(second.total, 23.6);
  assert.equal(JSON.parse(window.localStorage.getItem(keys.items))[0].stock, "2");
  assert.equal(JSON.parse(window.localStorage.getItem(keys.history)).length, 2);
});

test("non-restockable return does not increase inventory and refund is capped", () => {
  const { makeReturn } = setup();
  saveSaleReturn(makeReturn(1, { received: 0, rows: [{ ...makeReturn(1).rows[0], restockable: false }] }));
  assert.equal(JSON.parse(window.localStorage.getItem(keys.items))[0].stock, "0");
  assert.equal(window.localStorage.getItem(keys.history), null);

  setup();
  const unpaidInvoices = JSON.parse(window.localStorage.getItem(keys.invoices));
  unpaidInvoices[0].totals.received = 0;
  window.localStorage.setItem(keys.invoices, JSON.stringify(unpaidInvoices));
  assert.throws(() => saveSaleReturn(makeReturn(1, { received: 10 })), /Maximum refundable/);
});

test("editing reconciles stock deltas and cancellation reverses them", () => {
  const { makeReturn } = setup();
  const saved = saveSaleReturn(makeReturn(1, { received: 0 }));
  const updated = saveSaleReturn({ ...saved, customerCreditAmount: 11.8, rows: saved.rows.map((row) => ({ ...row, qty: "0.5" })) });
  assert.equal(updated.total, 11.8);
  assert.equal(JSON.parse(window.localStorage.getItem(keys.items))[0].stock, "0.5");
  const cancelled = cancelSaleReturn(saved.id);
  assert.equal(cancelled.cancelled, true);
  assert.equal(JSON.parse(window.localStorage.getItem(keys.items))[0].stock, "0");
  assert.equal(getSaleReturns()[0].status, "Cancelled");
  assert.equal(JSON.parse(window.localStorage.getItem(keys.history)).at(-1).direction, "reduce");
  assert.deepEqual(JSON.parse(window.localStorage.getItem(keys.invoices))[0].creditNoteReturnedQuantities, {});
});

test("a Credit Note with a recorded refund cannot be cancelled", () => {
  const { makeReturn } = setup();
  const saved = saveSaleReturn(makeReturn(1));
  assert.throws(() => cancelSaleReturn(saved.id), /Reverse the refund/);
  assert.equal(getSaleReturns()[0].cancelled, undefined);
});

test("applied credit updates the linked invoice balance summary", () => {
  const { makeReturn } = setup();
  const invoices = JSON.parse(window.localStorage.getItem(keys.invoices));
  invoices[0].totals.received = 0;
  window.localStorage.setItem(keys.invoices, JSON.stringify(invoices));
  const saved = saveSaleReturn(makeReturn(1, { received: 0, adjustedAmount: 20, customerCreditAmount: 3.6 }));
  assert.equal(saved.adjustedAmount, 20);
  const updatedInvoice = JSON.parse(window.localStorage.getItem(keys.invoices))[0];
  assert.equal(updatedInvoice.creditNoteAppliedAmount, 20);
  assert.deepEqual(updatedInvoice.creditNoteIds, [saved.id]);
});
