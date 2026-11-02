import assert from "node:assert/strict";
import test from "node:test";
import { calculateInvoiceSettlement, calculatePartyBalances } from "./partyBalances.js";

const party = { id: "party-1", partyName: "rt fpharma", openingBalance: 0, openingBalanceType: "to-receive" };
const sale = (overrides = {}) => ({ id: "sale-1", partyId: party.id, form: { customer: party.partyName }, totals: { grandTotal: 135 }, saleType: "credit", ...overrides });
const purchase = (overrides = {}) => ({ id: "purchase-1", partyId: party.id, form: { customer: party.partyName }, totals: { finalTotal: 1000 }, saleType: "credit", ...overrides });

test("an unpaid ₹135 sale appears under To Receive, including grandTotal schema records", () => {
  const result = calculatePartyBalances({ parties: [party], sales: [sale()] }).parties[0];
  assert.equal(result.receivable, 135);
  assert.equal(result.payable, 0);
  assert.equal(result.sales[0].settlement.status, "Unpaid");
});

test("an unpaid ₹1,000 purchase appears under To Pay", () => {
  const result = calculatePartyBalances({ parties: [party], purchases: [purchase()] }).parties[0];
  assert.equal(result.receivable, 0);
  assert.equal(result.payable, 1000);
  assert.equal(result.purchases[0].settlement.status, "Unpaid");
});

test("editing a ₹288 sale to received in full persists a Paid settlement with zero To Receive", () => {
  const unpaid = calculatePartyBalances({ parties: [party], sales: [sale({ totals: { finalTotal: 288, received: 0 } })] }).parties[0];
  const fullyReceived = calculatePartyBalances({ parties: [party], sales: [sale({ totals: { finalTotal: 288, received: 288 } })] }).parties[0];
  const partial = calculatePartyBalances({ parties: [party], sales: [sale({ totals: { finalTotal: 288, received: 100 } })] }).parties[0];
  assert.equal(unpaid.sales[0].settlement.status, "Unpaid");
  assert.equal(unpaid.receivable, 288);
  assert.equal(fullyReceived.sales[0].settlement.status, "Paid");
  assert.equal(fullyReceived.sales[0].settlement.outstanding, 0);
  assert.equal(fullyReceived.receivable, 0);
  assert.equal(partial.sales[0].settlement.status, "Partially Paid");
  assert.equal(partial.sales[0].settlement.outstanding, 188);
  assert.equal(partial.receivable, 188);
});

test("purchase bill payment edits recalculate Paid and partial supplier balances", () => {
  const unpaid = calculatePartyBalances({ parties: [party], purchases: [purchase({ totals: { finalTotal: 288, received: 0 } })] }).parties[0];
  const fullyPaid = calculatePartyBalances({ parties: [party], purchases: [purchase({ totals: { finalTotal: 288, received: 288 } })] }).parties[0];
  const partial = calculatePartyBalances({ parties: [party], purchases: [purchase({ totals: { finalTotal: 288, received: 100 } })] }).parties[0];
  assert.equal(unpaid.purchases[0].settlement.status, "Unpaid");
  assert.equal(unpaid.payable, 288);
  assert.equal(fullyPaid.purchases[0].settlement.status, "Paid");
  assert.equal(fullyPaid.payable, 0);
  assert.equal(partial.purchases[0].settlement.status, "Partially Paid");
  assert.equal(partial.payable, 188);
});

test("a linked Payment-In of ₹50 leaves ₹85 and marks the sale Partially Paid", () => {
  const result = calculatePartyBalances({ parties: [party], sales: [sale()], paymentIns: [{ id: "receipt-1", partyId: party.id, linkedInvoiceId: "sale-1", amount: 50 }] }).parties[0];
  assert.equal(result.receivable, 85);
  assert.equal(result.sales[0].settlement.status, "Partially Paid");
});

test("linked receipts of ₹50 and ₹85 fully settle the ₹135 sale", () => {
  const result = calculatePartyBalances({ parties: [party], sales: [sale()], paymentIns: [
    { id: "receipt-1", partyId: party.id, linkedInvoiceId: "sale-1", amount: 50 },
    { id: "receipt-2", partyId: party.id, linkedInvoiceId: "sale-1", amount: 85 },
  ] }).parties[0];
  assert.equal(result.receivable, 0);
  assert.equal(result.sales[0].settlement.status, "Paid");
});

test("Payment-Out of ₹400 leaves ₹600 payable on a ₹1,000 purchase", () => {
  const result = calculatePartyBalances({ parties: [party], purchases: [purchase()], paymentOuts: [{ id: "payment-1", partyId: party.id, linkedInvoiceId: "purchase-1", amount: 400 }] }).parties[0];
  assert.equal(result.payable, 600);
  assert.equal(result.purchases[0].settlement.status, "Partially Paid");
});

test("linked payments of ₹400 and ₹600 fully settle the purchase", () => {
  const result = calculatePartyBalances({ parties: [party], purchases: [purchase()], paymentOuts: [
    { id: "payment-1", partyId: party.id, linkedInvoiceId: "purchase-1", amount: 400 },
    { id: "payment-2", partyId: party.id, linkedInvoiceId: "purchase-1", amount: 600 },
  ] }).parties[0];
  assert.equal(result.payable, 0);
  assert.equal(result.purchases[0].settlement.status, "Paid");
});

test("a party with sales and purchases keeps receivable and payable balances separate", () => {
  const result = calculatePartyBalances({ parties: [party], sales: [sale()], purchases: [purchase()] }).parties[0];
  assert.equal(result.receivable, 135);
  assert.equal(result.payable, 1000);
  assert.equal(result.net, -865);
});

test("editing and deleting a transaction recalculates balances from source records", () => {
  const before = calculatePartyBalances({ parties: [party], sales: [sale()] }).parties[0];
  const edited = calculatePartyBalances({ parties: [party], sales: [sale({ totals: { grandTotal: 200 } })] }).parties[0];
  const deleted = calculatePartyBalances({ parties: [party], sales: [] }).parties[0];
  assert.equal(before.receivable, 135);
  assert.equal(edited.receivable, 200);
  assert.equal(deleted.receivable, 0);
});

test("reloading the same stored records produces the same balances without adding allocations", () => {
  const data = { parties: [party], sales: [sale()], paymentIns: [{ id: "receipt-1", partyId: party.id, linkedInvoiceId: "sale-1", amount: 50 }] };
  const first = calculatePartyBalances(data).parties[0].receivable;
  const refreshed = calculatePartyBalances(data).parties[0].receivable;
  assert.equal(first, 85);
  assert.equal(refreshed, first);
  assert.equal(data.paymentIns.length, 1);
});

test("calculation leaves existing records untouched", () => {
  const record = Object.freeze({ ...sale(), totals: Object.freeze({ grandTotal: 135 }) });
  const data = Object.freeze({ parties: Object.freeze([Object.freeze(party)]), sales: Object.freeze([record]) });
  assert.equal(calculatePartyBalances(data).parties[0].receivable, 135);
  assert.equal(record.totals.grandTotal, 135);
  assert.equal(data.sales.length, 1);
});

test("invoice balances ignore stale status and stored balance fields and cap adjustments at the outstanding amount", () => {
  const result = calculateInvoiceSettlement({ id: "sale-1", totals: { grandTotal: 135, received: 50, balance: 0 }, status: "Paid", creditNoteAppliedAmount: 200 }, { kind: "sale" });
  assert.equal(result.outstanding, 0);
  assert.equal(result.adjustments, 85);
  assert.equal(result.status, "Paid");
});
