import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePartyStatement,
  collectPartyTransactions,
  recordMatchesParty,
  formatRunningBalance,
  formatDateDMY,
  getDateRangeForPeriod,
} from "./partyStatementService.js";

// Helper factories
const makeParty = (id, name, overrides = {}) => ({
  id,
  partyName: name,
  phone: "9876543210",
  email: `${id}@test.com`,
  openingBalance: 0,
  openingBalanceType: "to-receive",
  partyType: "customer",
  ...overrides,
});

test("Scenario A: Customer with one sales invoice", () => {
  const party = makeParty("cust-1", "Alpha Traders");
  const sales = [
    {
      id: "sale-1",
      partyId: "cust-1",
      form: { invoiceNumber: "INV-001", invoiceDate: "2026-11-02" },
      totals: { grandTotal: 5000 },
    },
  ];

  const statement = generatePartyStatement({ party, sales });

  assert.equal(statement.openingBalance, 0);
  assert.equal(statement.totalDebit, 5000);
  assert.equal(statement.totalCredit, 0);
  assert.equal(statement.closingBalance, 5000);
  assert.equal(statement.closingBalanceType, "to-receive");
  assert.equal(statement.transactions.length, 1);
  assert.equal(statement.transactions[0].debit, 5000);
  assert.equal(statement.transactions[0].runningBalance, 5000);
  assert.equal(statement.transactions[0].runningBalanceFormatted, "₹ 5,000.00 Dr");
});

test("Scenario B: Customer with multiple sales invoices", () => {
  const party = makeParty("cust-1", "Alpha Traders");
  const sales = [
    { id: "sale-1", partyId: "cust-1", date: "2026-11-01", totals: { grandTotal: 2000 } },
    { id: "sale-2", partyId: "cust-1", date: "2026-11-03", totals: { grandTotal: 3500 } },
  ];

  const statement = generatePartyStatement({ party, sales });

  assert.equal(statement.totalDebit, 5500);
  assert.equal(statement.totalCredit, 0);
  assert.equal(statement.closingBalance, 5500);
  assert.equal(statement.closingBalanceType, "to-receive");
  assert.equal(statement.transactions.length, 2);
  assert.equal(statement.transactions[0].runningBalance, 2000);
  assert.equal(statement.transactions[1].runningBalance, 5500);
});

test("Scenario C: Supplier with multiple purchase bills", () => {
  const supplier = makeParty("supp-1", "Beta Mills", { partyType: "supplier" });
  const purchases = [
    { id: "bill-1", partyId: "supp-1", date: "2026-11-02", totals: { finalTotal: 10000 } },
    { id: "bill-2", partyId: "supp-1", date: "2026-11-04", totals: { finalTotal: 4000 } },
  ];

  const statement = generatePartyStatement({ party: supplier, purchases });

  assert.equal(statement.totalDebit, 0);
  assert.equal(statement.totalCredit, 14000);
  assert.equal(statement.closingBalance, 14000);
  assert.equal(statement.closingBalanceType, "to-pay");
  assert.equal(statement.transactions.length, 2);
  assert.equal(statement.transactions[0].credit, 10000);
  assert.equal(statement.transactions[0].runningBalanceFormatted, "₹ 10,000.00 Cr");
  assert.equal(statement.transactions[1].credit, 4000);
  assert.equal(statement.transactions[1].runningBalanceFormatted, "₹ 14,000.00 Cr");
});

test("Scenario D: Customer with payment received", () => {
  const party = makeParty("cust-1", "Alpha Traders");
  const sales = [
    { id: "sale-1", partyId: "cust-1", date: "2026-11-01", totals: { grandTotal: 5000 } },
  ];
  const paymentIns = [
    { id: "rec-1", partyId: "cust-1", date: "2026-11-05", amount: 2000 },
  ];

  const statement = generatePartyStatement({ party, sales, paymentIns });

  assert.equal(statement.totalDebit, 5000);
  assert.equal(statement.totalCredit, 2000);
  assert.equal(statement.closingBalance, 3000);
  assert.equal(statement.closingBalanceType, "to-receive");
  assert.equal(statement.transactions[1].credit, 2000);
  assert.equal(statement.transactions[1].runningBalanceFormatted, "₹ 3,000.00 Dr");
});

test("Scenario E: Supplier with payment made", () => {
  const supplier = makeParty("supp-1", "Beta Mills", { partyType: "supplier" });
  const purchases = [
    { id: "bill-1", partyId: "supp-1", date: "2026-11-01", totals: { finalTotal: 8000 } },
  ];
  const paymentOuts = [
    { id: "pay-1", partyId: "supp-1", date: "2026-11-03", amount: 5000 },
  ];

  const statement = generatePartyStatement({ party: supplier, purchases, paymentOuts });

  assert.equal(statement.totalDebit, 5000);
  assert.equal(statement.totalCredit, 8000);
  assert.equal(statement.closingBalance, 3000);
  assert.equal(statement.closingBalanceType, "to-pay");
  assert.equal(statement.transactions[1].debit, 5000);
  assert.equal(statement.transactions[1].runningBalanceFormatted, "₹ 3,000.00 Cr");
});

test("Scenario F: Party with both sales and purchase transactions", () => {
  const party = makeParty("party-both", "Universal Trading Co.");
  const sales = [
    { id: "sale-1", partyId: "party-both", date: "2026-11-01", totals: { grandTotal: 10000 } },
  ];
  const purchases = [
    { id: "bill-1", partyId: "party-both", date: "2026-11-02", totals: { finalTotal: 6000 } },
  ];

  const statement = generatePartyStatement({ party, sales, purchases });

  assert.equal(statement.totalDebit, 10000);
  assert.equal(statement.totalCredit, 6000);
  assert.equal(statement.closingBalance, 4000);
  assert.equal(statement.closingBalanceType, "to-receive");
  assert.equal(statement.transactions.length, 2);
  assert.equal(statement.transactions[0].runningBalanceFormatted, "₹ 10,000.00 Dr");
  assert.equal(statement.transactions[1].runningBalanceFormatted, "₹ 4,000.00 Dr");
});

test("Scenario G: Party with credit notes (sales return)", () => {
  const party = makeParty("cust-1", "Alpha Traders");
  const sales = [
    { id: "sale-1", partyId: "cust-1", date: "2026-11-01", totals: { grandTotal: 5000 } },
  ];
  const creditNotes = [
    { id: "cn-1", partyId: "cust-1", date: "2026-11-03", total: 800 },
  ];

  const statement = generatePartyStatement({ party, sales, creditNotes });

  assert.equal(statement.totalDebit, 5000);
  assert.equal(statement.totalCredit, 800);
  assert.equal(statement.closingBalance, 4200);
  assert.equal(statement.closingBalanceType, "to-receive");
  assert.equal(statement.transactions[1].credit, 800);
  assert.equal(statement.transactions[1].runningBalanceFormatted, "₹ 4,200.00 Dr");
});

test("Scenario H: Party with debit notes (purchase return)", () => {
  const supplier = makeParty("supp-1", "Beta Mills", { partyType: "supplier" });
  const purchases = [
    { id: "bill-1", partyId: "supp-1", date: "2026-11-01", totals: { finalTotal: 7000 } },
  ];
  const debitNotes = [
    { id: "dn-1", partyId: "supp-1", date: "2026-11-03", total: 1000 },
  ];

  const statement = generatePartyStatement({ party: supplier, purchases, debitNotes });

  assert.equal(statement.totalDebit, 1000);
  assert.equal(statement.totalCredit, 7000);
  assert.equal(statement.closingBalance, 6000);
  assert.equal(statement.closingBalanceType, "to-pay");
  assert.equal(statement.transactions[1].debit, 1000);
  assert.equal(statement.transactions[1].runningBalanceFormatted, "₹ 6,000.00 Cr");
});

test("Scenario I: Party with initial opening balance", () => {
  const party = makeParty("cust-1", "Alpha Traders", {
    openingBalance: 1500,
    openingBalanceType: "to-receive",
  });
  const sales = [
    { id: "sale-1", partyId: "cust-1", date: "2026-11-01", totals: { grandTotal: 3000 } },
  ];

  const statement = generatePartyStatement({ party, sales });

  assert.equal(statement.openingBalance, 1500);
  assert.equal(statement.openingBalanceType, "to-receive");
  assert.equal(statement.totalDebit, 3000);
  assert.equal(statement.closingBalance, 4500);
  assert.equal(statement.closingBalanceType, "to-receive");
  assert.equal(statement.transactions[0].runningBalance, 4500);
});

test("Scenario J: Party with no transactions", () => {
  const party = makeParty("empty-party", "Idle Customer", {
    openingBalance: 500,
    openingBalanceType: "to-pay",
  });

  const statement = generatePartyStatement({ party });

  assert.equal(statement.openingBalance, 500);
  assert.equal(statement.openingBalanceType, "to-pay");
  assert.equal(statement.totalDebit, 0);
  assert.equal(statement.totalCredit, 0);
  assert.equal(statement.closingBalance, 500);
  assert.equal(statement.closingBalanceType, "to-pay");
  assert.equal(statement.transactions.length, 0);
});

test("Scenario K: Multiple transactions on the same date sort deterministically", () => {
  const party = makeParty("cust-1", "Alpha Traders");
  const sales = [
    { id: "sale-1", partyId: "cust-1", date: "2026-11-02", totals: { grandTotal: 5000 } },
  ];
  const paymentIns = [
    { id: "rec-1", partyId: "cust-1", date: "2026-11-02", amount: 1000 },
  ];

  const statement = generatePartyStatement({ party, sales, paymentIns });

  assert.equal(statement.transactions.length, 2);
  assert.equal(statement.transactions[0].type, "Sale");
  assert.equal(statement.transactions[1].type, "Payment-In");
  assert.equal(statement.transactions[0].runningBalance, 5000);
  assert.equal(statement.transactions[1].runningBalance, 4000);
});

test("Scenario L: Custom date range with previous transactions contributing to opening balance", () => {
  const party = makeParty("cust-1", "Alpha Traders", {
    openingBalance: 1000,
    openingBalanceType: "to-receive",
  });
  const sales = [
    { id: "sale-oct", partyId: "cust-1", date: "2026-10-15", totals: { grandTotal: 4000 } },
    { id: "sale-nov", partyId: "cust-1", date: "2026-11-05", totals: { grandTotal: 2500 } },
  ];
  const paymentIns = [
    { id: "rec-oct", partyId: "cust-1", date: "2026-10-20", amount: 2000 },
  ];

  // Filter for November only
  const statement = generatePartyStatement({
    party,
    sales,
    paymentIns,
    from: "2026-11-01",
    to: "2026-11-30",
  });

  // Prior balance as of 2026-11-01 = 1000 (initial) + 4000 (Oct sale) - 2000 (Oct receipt) = 3000
  assert.equal(statement.openingBalance, 3000);
  assert.equal(statement.openingBalanceType, "to-receive");

  // Only Nov sale appears in ledger
  assert.equal(statement.transactions.length, 1);
  assert.equal(statement.transactions[0].id, "sale:sale-nov");
  assert.equal(statement.transactions[0].runningBalance, 5500);

  // Closing balance = 3000 + 2500 = 5500
  assert.equal(statement.totalDebit, 2500);
  assert.equal(statement.totalCredit, 0);
  assert.equal(statement.closingBalance, 5500);
  assert.equal(statement.closingBalanceType, "to-receive");

  // Reconciliation check
  assert.equal(
    statement.openingBalanceSigned + statement.totalDebit - statement.totalCredit,
    statement.closingBalanceSigned
  );
});

test("Scenario M: Older transactions without partyId match registered party by name", () => {
  const party = makeParty("p-cjp", "cjp");
  const sales = [
    { id: "sale-legacy", form: { customer: "cjp" }, date: "2026-11-02", totals: { grandTotal: 6402 } },
  ];

  const statement = generatePartyStatement({ party, sales });

  assert.equal(statement.transactions.length, 1);
  assert.equal(statement.closingBalance, 6402);
  assert.equal(statement.closingBalanceType, "to-receive");
});

test("Scenario N: Two different parties with identical names match by partyId strictly", () => {
  const party1 = makeParty("p-1", "Ramesh Kumar");
  const party2 = makeParty("p-2", "Ramesh Kumar");

  const sales = [
    { id: "sale-p1", partyId: "p-1", form: { customer: "Ramesh Kumar" }, date: "2026-11-01", totals: { grandTotal: 1000 } },
    { id: "sale-p2", partyId: "p-2", form: { customer: "Ramesh Kumar" }, date: "2026-11-02", totals: { grandTotal: 2500 } },
  ];

  const stmt1 = generatePartyStatement({ party: party1, sales });
  const stmt2 = generatePartyStatement({ party: party2, sales });

  assert.equal(stmt1.transactions.length, 1);
  assert.equal(stmt1.transactions[0].id, "sale:sale-p1");
  assert.equal(stmt1.closingBalance, 1000);

  assert.equal(stmt2.transactions.length, 1);
  assert.equal(stmt2.transactions[0].id, "sale:sale-p2");
  assert.equal(stmt2.closingBalance, 2500);
});

test("Scenario O: Cancelled or deleted transactions are safely excluded", () => {
  const party = makeParty("cust-1", "Alpha Traders");
  const sales = [
    { id: "sale-active", partyId: "cust-1", date: "2026-11-01", totals: { grandTotal: 3000 } },
    { id: "sale-cancelled", partyId: "cust-1", date: "2026-11-02", totals: { grandTotal: 1500 }, cancelled: true },
    { id: "sale-deleted", partyId: "cust-1", date: "2026-11-03", totals: { grandTotal: 2000 }, deleted: true },
  ];

  const statement = generatePartyStatement({ party, sales });

  assert.equal(statement.transactions.length, 1);
  assert.equal(statement.transactions[0].id, "sale:sale-active");
  assert.equal(statement.totalDebit, 3000);
  assert.equal(statement.closingBalance, 3000);
});

test("Reconciliation Formula: Opening Balance + Total Debit - Total Credit === Closing Balance", () => {
  const party = makeParty("p-rec", "Reconciled Party", {
    openingBalance: 2000,
    openingBalanceType: "to-pay",
  });
  const sales = [
    { id: "s-1", partyId: "p-rec", date: "2026-11-02", totals: { grandTotal: 8500 } },
  ];
  const purchases = [
    { id: "b-1", partyId: "p-rec", date: "2026-11-03", totals: { finalTotal: 3200 } },
  ];
  const paymentIns = [
    { id: "p-1", partyId: "p-rec", date: "2026-11-04", amount: 1500 },
  ];
  const creditNotes = [
    { id: "c-1", partyId: "p-rec", date: "2026-11-05", total: 400 },
  ];

  const stmt = generatePartyStatement({ party, sales, purchases, paymentIns, creditNotes });

  // Initial: -2000
  // Sale: +8500 Dr
  // Purchase: +3200 Cr (-3200)
  // PaymentIn: +1500 Cr (-1500)
  // CreditNote: +400 Cr (-400)
  // Net Movement = 8500 (Dr) - (3200 + 1500 + 400) (Cr) = 8500 - 5100 = +3400
  // Closing = -2000 + 3400 = +1400 (To Receive)
  assert.equal(stmt.openingBalanceSigned, -2000);
  assert.equal(stmt.totalDebit, 8500);
  assert.equal(stmt.totalCredit, 5100);
  assert.equal(stmt.netMovement, 3400);
  assert.equal(stmt.closingBalanceSigned, 1400);
  assert.equal(stmt.closingBalance, 1400);
  assert.equal(stmt.closingBalanceType, "to-receive");

  assert.equal(
    stmt.openingBalanceSigned + stmt.totalDebit - stmt.totalCredit,
    stmt.closingBalanceSigned
  );
});

test("Reconciliation with calculatePartyBalances from partyBalances.js", async () => {
  const { calculatePartyBalances } = await import("./partyBalances.js");
  const party = makeParty("p-cross", "Cross-Check Enterprises", {
    openingBalance: 1200,
    openingBalanceType: "to-receive",
  });
  const sales = [
    { id: "sale-c1", partyId: "p-cross", date: "2026-11-01", totals: { grandTotal: 6400 } },
  ];
  const purchases = [
    { id: "bill-c1", partyId: "p-cross", date: "2026-11-02", totals: { finalTotal: 3000 } },
  ];
  const paymentIns = [
    { id: "rec-c1", partyId: "p-cross", date: "2026-11-03", amount: 2000 },
  ];
  const paymentOuts = [
    { id: "pay-c1", partyId: "p-cross", date: "2026-11-04", amount: 1000 },
  ];

  const statement = generatePartyStatement({ party, sales, purchases, paymentIns, paymentOuts });
  const balancesResult = calculatePartyBalances({
    parties: [party],
    sales,
    purchases,
    paymentIns,
    paymentOuts,
  });

  const partyBal = balancesResult.parties[0];

  // PartyDetails / partyBalances net: receivable - payable
  // Here: Opening (1200 Dr) + Sale (6400 Dr) - PaymentIn (2000 Cr) - Purchase (3000 Cr) + PaymentOut (1000 Dr)
  // Net = 1200 + 6400 - 2000 - 3000 + 1000 = 3600 Dr
  assert.equal(statement.closingBalanceSigned, partyBal.net);
  assert.equal(statement.closingBalance, partyBal.receivable - partyBal.payable);
});
