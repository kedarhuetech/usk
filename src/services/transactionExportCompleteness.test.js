import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTransactionTypeKey,
  partitionTransactionsByStore,
} from "./databaseRepository.js";

test("normalizeTransactionTypeKey normalizes spaces, hyphens, underscores, and casing", () => {
  assert.equal(normalizeTransactionTypeKey("Credit Note"), "credit_note");
  assert.equal(normalizeTransactionTypeKey("debit note"), "debit_note");
  assert.equal(normalizeTransactionTypeKey("payment-in"), "payment_in");
  assert.equal(normalizeTransactionTypeKey("payment-out"), "payment_out");
  assert.equal(normalizeTransactionTypeKey(" delivery_challan "), "delivery_challan");
});

test("partitionTransactionsByStore includes all supported types and space/underscore aliases without duplicates", () => {
  const input = [
    { id: "t-sale", transactionType: "sale" },
    { id: "t-pos", transactionType: "pos" },
    { id: "t-purch", transactionType: "purchase" },
    { id: "t-pin", transactionType: "payment-in" },
    { id: "t-pout", transactionType: "payment-out" },
    { id: "t-exp", transactionType: "expense" },
    { id: "t-est", transactionType: "estimate" },
    { id: "t-prof", transactionType: "proforma" },
    { id: "t-dc", transactionType: "delivery_challan" },
    { id: "t-dn-space", transactionType: "debit note" },
    { id: "t-dn-under", transactionType: "debit_note" },
    { id: "t-pr", transactionType: "purchase_return" },
    { id: "t-cn-space", transactionType: "credit note" },
    { id: "t-cn-under", transactionType: "credit_note" },
    { id: "t-sr", transactionType: "sale_return" },
    { id: "t-so", transactionType: "sale_order" },
    { id: "t-po", transactionType: "purchase_order" },
    // Duplicate ID should not produce duplicate export entries
    { id: "t-cn-space", transactionType: "credit_note" },
    // Unrelated type should not be misclassified as sale or purchase
    { id: "t-unknown", transactionType: "inventory_transfer" },
  ];

  const buckets = partitionTransactionsByStore(input);
  assert.deepEqual(buckets.sales.map((t) => t.id), ["t-sale", "t-pos"]);
  assert.deepEqual(buckets.purchases.map((t) => t.id), ["t-purch"]);
  assert.deepEqual(buckets.paymentIns.map((t) => t.id), ["t-pin"]);
  assert.deepEqual(buckets.paymentOuts.map((t) => t.id), ["t-pout"]);
  assert.deepEqual(buckets.expenses.map((t) => t.id), ["t-exp"]);
  assert.deepEqual(buckets.estimates.map((t) => t.id), ["t-est"]);
  assert.deepEqual(buckets.proformas.map((t) => t.id), ["t-prof"]);
  assert.deepEqual(buckets.challans.map((t) => t.id), ["t-dc"]);
  assert.deepEqual(buckets.debitNotes.map((t) => t.id), ["t-dn-space", "t-dn-under", "t-pr"]);
  assert.deepEqual(buckets.creditNotes.map((t) => t.id), ["t-cn-space", "t-cn-under", "t-sr"]);
  assert.deepEqual(buckets.saleOrders.map((t) => t.id), ["t-so"]);
  assert.deepEqual(buckets.purchaseOrders.map((t) => t.id), ["t-po"]);
});
