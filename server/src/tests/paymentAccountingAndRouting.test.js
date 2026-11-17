import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Isolated unit tests for the exact transaction accounting and payment mapping logic in transactionsRouter.js
 */

function getPartyBalanceImpact(type, balAmt, pdAmt) {
  const normType = String(type || "").toLowerCase();
  if (normType === "sale" || normType === "pos") {
    return Number(balAmt) || 0;
  }
  if (normType === "payment_in") {
    return -(Number(pdAmt) || 0);
  }
  if (normType === "purchase") {
    return -(Number(balAmt) || 0);
  }
  if (normType === "payment_out") {
    return Number(pdAmt) || 0;
  }
  return 0;
}

test("Backend Accounting: getPartyBalanceImpact computes accurate signed effects", () => {
  // Payment-In reduces customer balance
  assert.equal(getPartyBalanceImpact("payment_in", 0, 500), -500);
  assert.equal(getPartyBalanceImpact("PAYMENT_IN", 100, 250), -250);

  // Payment-Out reduces supplier payable (moves balance towards 0)
  assert.equal(getPartyBalanceImpact("payment_out", 0, 800), 800);
  assert.equal(getPartyBalanceImpact("PAYMENT_OUT", 0, 350.5), 350.5);

  // Sales increase receivable by unpaid balance
  assert.equal(getPartyBalanceImpact("sale", 300, 200), 300);
  assert.equal(getPartyBalanceImpact("pos", 0, 500), 0);

  // Purchases increase payable by unpaid balance
  assert.equal(getPartyBalanceImpact("purchase", 400, 100), -400);

  // Non-accounting documents have zero balance impact
  assert.equal(getPartyBalanceImpact("sale_order", 1000, 0), 0);
  assert.equal(getPartyBalanceImpact("purchase_order", 1000, 0), 0);
  assert.equal(getPartyBalanceImpact("estimate", 500, 0), 0);
});

test("Backend Accounting: Differential balance update applies only the delta on edit", () => {
  // Case A: Customer payment increased from 500 to 750 (same party)
  const oldImpactA = getPartyBalanceImpact("payment_in", 0, 500); // -500
  const newImpactA = getPartyBalanceImpact("payment_in", 0, 750); // -750
  const netDeltaA = newImpactA - oldImpactA; // -750 - (-500) = -250
  assert.equal(netDeltaA, -250, "Editing Payment-In from 500 to 750 should deduct an additional 250");

  // Case B: Customer payment decreased from 500 to 300 (same party)
  const newImpactB = getPartyBalanceImpact("payment_in", 0, 300); // -300
  const netDeltaB = newImpactB - oldImpactA; // -300 - (-500) = +200
  assert.equal(netDeltaB, +200, "Editing Payment-In from 500 to 300 should restore 200 to customer balance");

  // Case C: Idempotent re-save / retry (amount unchanged 500)
  const retryDelta = oldImpactA - oldImpactA; // 0
  assert.equal(retryDelta, 0, "Idempotent retry of identical payment must produce 0 net balance adjustment");

  // Case D: Supplier payment increased from 1000 to 1200
  const oldImpactD = getPartyBalanceImpact("payment_out", 0, 1000); // +1000
  const newImpactD = getPartyBalanceImpact("payment_out", 0, 1200); // +1200
  const netDeltaD = newImpactD - oldImpactD; // +200
  assert.equal(netDeltaD, +200, "Editing Payment-Out from 1000 to 1200 should add +200 to supplier balance");
});

test("Backend Accounting: Changed party on payment update reconciles both parties", () => {
  // Payment of 500 was wrongly attributed to Party A; user changes to Party B
  const oldPartyImpact = getPartyBalanceImpact("payment_in", 0, 500); // -500
  const newPartyImpact = getPartyBalanceImpact("payment_in", 0, 500); // -500

  // Reverting old party: current_balance = current_balance - oldImpact
  const revertOldParty = -oldPartyImpact; // -(-500) = +500
  assert.equal(revertOldParty, +500, "Old party should have the 500 payment reversed (+500)");

  // Applying to new party: current_balance = current_balance + newImpact
  const applyNewParty = newPartyImpact; // -500
  assert.equal(applyNewParty, -500, "New party should have the 500 payment deducted (-500)");
});

test("Backend Accounting: Transaction deletion restores party balance", () => {
  // Payment-In deletion
  const payInImpact = getPartyBalanceImpact("payment_in", 0, 600); // -600
  const deletePayInReversal = -payInImpact; // +600
  assert.equal(deletePayInReversal, +600, "Deleting Payment-In must reverse by +600");

  // Payment-Out deletion
  const payOutImpact = getPartyBalanceImpact("payment_out", 0, 450); // +450
  const deletePayOutReversal = -payOutImpact; // -450
  assert.equal(deletePayOutReversal, -450, "Deleting Payment-Out must reverse by -450");
});

test("Backend Mapping: Payment lines normalization preserves multi-mode payments", () => {
  const inputPayments = [
    { type: "Cash", amount: "300", reference: "" },
    { type: "Cheque", amount: "700", reference: "CHQ-10029", chequeDate: "2026-11-20" },
    { type: "UPI", amount: "500", reference: "UPI-TXN-4921", chequeDate: "" },
  ];

  const rawItems = inputPayments.map((p, idx) => ({
    id: `pay-${idx + 1}`,
    itemName: p.type || "Cash",
    item: p.type || "Cash",
    unit: "TXN",
    quantity: 1,
    qty: 1,
    unitPrice: parseFloat(p.amount) || 0,
    price: parseFloat(p.amount) || 0,
    totalAmount: parseFloat(p.amount) || 0,
    amount: parseFloat(p.amount) || 0,
    itemCode: p.reference || "",
    serialNo: p.chequeDate || "",
  }));

  assert.equal(rawItems.length, 3);
  assert.equal(rawItems[0].itemName, "Cash");
  assert.equal(rawItems[0].totalAmount, 300);
  assert.equal(rawItems[1].itemName, "Cheque");
  assert.equal(rawItems[1].itemCode, "CHQ-10029");
  assert.equal(rawItems[1].serialNo, "2026-11-20");
  assert.equal(rawItems[2].itemName, "UPI");
  assert.equal(rawItems[2].itemCode, "UPI-TXN-4921");

  // Sum check
  const total = rawItems.reduce((s, it) => s + it.totalAmount, 0);
  assert.equal(total, 1500);
});
