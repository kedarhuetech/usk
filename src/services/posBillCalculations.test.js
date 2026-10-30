import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePosBill } from "./posBillCalculations.js";

test("calculates subtotal, item discount and GST across multiple lines", () => {
  const result = calculatePosBill({
    items: [
      { qty: 2, price: 100, discount: 10, taxRate: 5 },
      { qty: 1, price: 50, discount: 0, taxRate: 0 },
    ],
  });
  assert.equal(result.subtotal, 250);
  assert.equal(result.itemDiscount, 10);
  assert.equal(result.tax, 9.5);
  assert.equal(result.total, 249.5);
});

test("caps bill and loyalty discounts and includes additional charges before final rounding", () => {
  const result = calculatePosBill({
    items: [{ qty: 1, price: 100, discount: 10, taxRate: 10 }],
    billDiscount: 500,
    loyaltyPointsRedeemed: 100,
    additionalCharges: 5.125,
  });
  assert.equal(result.billDiscount, 99);
  assert.equal(result.loyaltyDiscount, 0);
  assert.equal(result.charges, 5.125);
  assert.equal(result.total, 5.13);
});

test("defaults credit payments to unpaid and calculates partial payment due/change", () => {
  const credit = calculatePosBill({ paymentMode: "Credit", items: [{ qty: 1, price: 80 }] });
  assert.equal(credit.received, 0);
  assert.equal(credit.due, 80);
  const partial = calculatePosBill({ paymentMode: "Cash", amountReceived: "30", items: [{ qty: 1, price: 80 }] });
  assert.equal(partial.received, 30);
  assert.equal(partial.due, 50);
  const excess = calculatePosBill({ amountReceived: "100", items: [{ qty: 1, price: 80 }] });
  assert.equal(excess.received, 100);
  assert.equal(excess.change, 20);
});

test("treats invalid and negative numeric inputs safely without inventing quantities", () => {
  const result = calculatePosBill({
    items: [{ qty: "bad", price: -5, discount: 10, taxRate: 5 }],
    billDiscount: -10,
    additionalCharges: "bad",
  });
  assert.equal(result.lines[0].qty, 0);
  assert.equal(result.subtotal, 0);
  assert.equal(result.total, 0);
});
