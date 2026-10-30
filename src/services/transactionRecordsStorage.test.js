import test from "node:test";
import assert from "node:assert/strict";
import { getAllLocalTransactions, transactionTypes } from "./transactionRecordsStorage.js";

function setup(records = {}) {
  const data = new Map(Object.entries(records).map(([key, value]) => [`ledgerly:${key}.v1`, JSON.stringify(value)]));
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null } };
}

test("unified transactions map actual module storage and classify cancelled sales once", () => {
  setup({
    saleInvoices: [
      { id: "sale-1", invoiceNumber: "S-1", form: { customer: "Asha", invoiceDate: "2026-10-01" }, totals: { finalTotal: 100, received: 25 } },
      { id: "sale-2", invoiceNumber: "S-2", cancelled: true, totals: { finalTotal: 50, received: 0 } },
    ],
    paymentIns: [{ id: "pi-1", number: "PI-1", customer: "Asha", amount: 25 }],
    saleReturns: [{ id: "cn-1", type: "Credit Note", number: "CN-1", party: "Asha", total: 10, received: 0, adjustedAmount: 0, customerCreditAmount: 10 }],
    purchaseJobWorks: [{ id: "jw-1", type: "Purchase (Job Work)", number: "JW-1", party: "Vendor", status: "Pending" }],
  });
  const rows = getAllLocalTransactions();
  assert.equal(rows.length, 5);
  assert.equal(rows.find((row) => row.id === "sale-1").type, "Sale");
  assert.equal(rows.find((row) => row.id === "sale-2").type, "Sale (Cancelled)");
  assert.equal(rows.find((row) => row.id === "sale-1").balance, 75);
  assert.equal(rows.find((row) => row.id === "cn-1").balance, 10);
  assert.equal(rows.filter((row) => row.type === "Sale (Cancelled)").length, 1);
  assert.ok(transactionTypes.includes("Purchase (Job Work)"));
});

test("special transaction rows classify party transfers and fixed asset direction", () => {
  setup({
    partyToParty: [{ id: "move-in", direction: "received", amount: 30 }, { id: "move-out", direction: "paid", amount: 20 }],
    fixedAssetTransactions: [{ id: "fa-sale", direction: "sale", total: 40 }, { id: "fa-buy", direction: "purchase", total: 80 }],
  });
  const rows = getAllLocalTransactions();
  assert.deepEqual(rows.map((row) => row.type).sort(), ["Party to Party (Paid)", "Party to Party (Received)", "Purchase FA", "Sale FA"].sort());
});

test("corrupt transaction storage reports the exact source key", () => {
  setup();
  window.localStorage.getItem = (key) => key === "ledgerly:paymentIns.v1" ? "{" : null;
  assert.throws(() => getAllLocalTransactions(), /ledgerly:paymentIns\.v1\) is corrupted/);
});
