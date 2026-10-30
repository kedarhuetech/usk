import test from "node:test";
import assert from "node:assert/strict";
import { ensureLocalTestData } from "./localTransactionTestData.js";
import { getAllLocalTransactions, transactionTypes } from "./transactionRecordsStorage.js";

function setupInMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
  };
  return store;
}

test("ensureLocalTestData seeds all missing transaction types and getAllLocalTransactions fetches them", () => {
  const store = setupInMemoryStorage();

  // Run initial seed
  ensureLocalTestData();

  const allTransactions = getAllLocalTransactions();
  const typesFound = new Set(allTransactions.map((t) => t.type));

  const expectedTypes = [
    "Sale",
    "Purchase",
    "Payment-In",
    "Payment-Out",
    "Credit Note",
    "Debit Note",
    "Sale Order",
    "Purchase Order",
    "Estimate",
    "Proforma Invoice",
    "Delivery Challan",
    "Expense",
    "Party to Party (Received)",
    "Party to Party (Paid)",
    "Manufacture",
    "Sale FA",
    "Purchase FA",
    "Sale (Cancelled)",
    "Journal Entry",
    "Purchase (Job Work)",
  ];

  for (const expected of expectedTypes) {
    assert.ok(
      typesFound.has(expected),
      `Expected transaction type "${expected}" to be fetched, but found: ${[...typesFound].join(", ")}`
    );

    const match = allTransactions.find((t) => t.type === expected);
    assert.ok(match, `Record for ${expected} must exist`);
    assert.ok(match.date, `${expected} must have a valid date (got: ${match.date})`);
    assert.ok(match.number && match.number !== "—", `${expected} must have a reference number (got: ${match.number})`);
    assert.ok(match.party && match.party !== "—", `${expected} must have a party name (got: ${match.party})`);
    assert.ok(Number.isFinite(match.total) && match.total > 0, `${expected} must have a positive total amount (got: ${match.total})`);
    assert.ok(Number.isFinite(match.received), `${expected} must have a numeric received amount (got: ${match.received})`);
    assert.ok(Number.isFinite(match.balance), `${expected} must have a numeric balance (got: ${match.balance})`);
    assert.ok(match.status, `${expected} must have a status (got: ${match.status})`);
  }

  // Idempotency check: Running ensureLocalTestData again must NOT create duplicates
  const initialCount = allTransactions.length;
  ensureLocalTestData();
  const secondRunTransactions = getAllLocalTransactions();
  assert.equal(secondRunTransactions.length, initialCount, "Duplicate records were created on subsequent run!");
});

test("existing business records are never overwritten or deleted by test data seeder", () => {
  const customSale = {
    id: "real-user-sale-999",
    invoiceNumber: "INV-REAL-999",
    saleType: "cash",
    transactionType: "sale",
    form: { customer: "Real Business Client", invoiceNumber: "INV-REAL-999", invoiceDate: "2026-10-15" },
    totals: { finalTotal: 50000, received: 50000, balance: 0 },
    rows: [],
  };

  setupInMemoryStorage({
    "ledgerly:saleInvoices.v1": JSON.stringify([customSale]),
  });

  ensureLocalTestData();

  const all = getAllLocalTransactions();
  const realSale = all.find((t) => t.id === "real-user-sale-999");
  assert.ok(realSale, "Real business sale invoice must be preserved");
  assert.equal(realSale.party, "Real Business Client");
  assert.equal(realSale.total, 50000);
});

test("All Transaction filter correctly searches and does not duplicate records", () => {
  setupInMemoryStorage();
  ensureLocalTestData();

  const all = getAllLocalTransactions();
  const ids = all.map((t) => t.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, "Duplicate IDs found in All Transaction listing!");

  // Search filter check
  const searchFilter = (query) =>
    all.filter((row) =>
      `${row.party} ${row.number} ${row.type} ${row.status}`.toLowerCase().includes(query.toLowerCase())
    );

  assert.ok(searchFilter("TEST").length >= 19, "Search for 'TEST' should return all test records");
  assert.ok(searchFilter("Job Work").length >= 1, "Search for 'Job Work' should return job work");
  assert.ok(searchFilter("Customer").length >= 1, "Search for 'Customer' should return customer records");
});
