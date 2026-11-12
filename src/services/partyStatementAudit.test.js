import test from "node:test";
import assert from "node:assert/strict";
import {
  collectPartyTransactions,
  generatePartyStatement,
  getDateRangeForPeriod,
} from "./partyStatementService.js";
import { buildUnifiedStatementHtml } from "./unifiedPrintService.js";

// Mock localStorage for node test runner
if (typeof globalThis.window === "undefined") {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
  };
}

// -------------------------------------------------------------
// Core Verification: rt fpharma
// -------------------------------------------------------------
test("Audit rt fpharma: Sale 135, Purchase 180, Payment-In 135, Payment-Out 180", () => {
  const party = {
    id: "party-rt-fpharma",
    partyName: "rt fpharma",
    openingBalance: 0,
    openingBalanceType: "to-receive",
  };

  const sales = [
    {
      id: "sale-1",
      customer: "rt fpharma",
      form: { invoiceNumber: "INV-7", invoiceDate: "2026-11-02", paymentType: "Cash" },
      totals: { finalTotal: 135, received: 135, balance: 0 },
    },
  ];

  const purchases = [
    {
      id: "purch-1",
      customer: "rt fpharma",
      form: { invoiceNumber: "BILL-7", invoiceDate: "2026-11-02", paymentType: "Cash" },
      totals: { finalTotal: 180, received: 180, balance: 0 },
    },
  ];

  const statement = generatePartyStatement({
    party,
    sales,
    purchases,
    paymentIns: [],
    paymentOuts: [],
    creditNotes: [],
    debitNotes: [],
    from: "2026-11-01",
    to: "2026-11-30",
  });

  // Check 1: 4 transactions generated
  assert.equal(statement.transactions.length, 4, "Should have Sale, Payment-In, Purchase, Payment-Out");

  const saleTx = statement.transactions.find((t) => t.type === "Sale");
  const payInTx = statement.transactions.find((t) => t.type === "Payment-In");
  const purchTx = statement.transactions.find((t) => t.type === "Purchase");
  const payOutTx = statement.transactions.find((t) => t.type === "Payment-Out");

  assert.ok(saleTx);
  assert.ok(payInTx);
  assert.ok(purchTx);
  assert.ok(payOutTx);

  // Check 2: Debit and Credit classification
  assert.equal(saleTx.debit, 135);
  assert.equal(saleTx.credit, 0);

  assert.equal(payInTx.debit, 0);
  assert.equal(payInTx.credit, 135);

  assert.equal(purchTx.debit, 0);
  assert.equal(purchTx.credit, 180);

  assert.equal(payOutTx.debit, 180);
  assert.equal(payOutTx.credit, 0);

  // Check 3: Reconciled Totals & Closing Balance
  assert.equal(statement.totalDebit, 315);
  assert.equal(statement.totalCredit, 315);
  assert.equal(statement.closingBalance, 0);

  // Check 4: Payment Attribution in Printed Statement
  const statementRows = statement.transactions.map((t) => {
    const isPayment = t.type === "Payment-In" || t.type === "Payment-Out";
    const receivedAmount = isPayment ? Number(t.total || 0) : Number(t.received || 0);
    return {
      id: t.id,
      date: t.date,
      source: t.type,
      number: t.number,
      status: t.status,
      total: t.total,
      received: receivedAmount,
      balance: t.runningBalance,
      receivableBalance: t.runningBalanceSigned > 0 ? t.runningBalance : 0,
      payableBalance: t.runningBalanceSigned < 0 ? t.runningBalance : 0,
    };
  });

  const rowSale = statementRows.find((r) => r.source === "Sale");
  const rowPayIn = statementRows.find((r) => r.source === "Payment-In");
  const rowPurch = statementRows.find((r) => r.source === "Purchase");
  const rowPayOut = statementRows.find((r) => r.source === "Payment-Out");

  assert.equal(rowPurch.total, 180);
  assert.equal(rowPurch.received, 0, "Purchase must show ₹0 directly paid to avoid double counting");

  assert.equal(rowPayOut.total, 180);
  assert.equal(rowPayOut.received, 180, "Payment-Out must show ₹180 paid");

  assert.equal(rowSale.total, 135);
  assert.equal(rowSale.received, 0, "Sale must show ₹0 directly received to avoid double counting");

  assert.equal(rowPayIn.total, 135);
  assert.equal(rowPayIn.received, 135, "Payment-In must show ₹135 received");

  // Sum of received/paid
  const totalReceivedPaid = statementRows.reduce((sum, r) => sum + r.received, 0);
  assert.equal(totalReceivedPaid, 315, "Total received/paid should be 135 + 180 = 315 (not 630)");

  // Build HTML and verify content
  const html = buildUnifiedStatementHtml({
    party,
    company: { currencySymbol: "₹" },
    rows: statementRows,
    totals: {
      totalAmount: statement.totalDebit + statement.totalCredit,
      totalReceived: totalReceivedPaid,
      totalBalance: statement.closingBalance,
      totalReceivable: 0,
      totalPayable: 0,
    },
  });

  assert.ok(html.includes("₹ 180.00"));
  assert.ok(html.includes("₹ 135.00"));
  assert.ok(html.includes("₹ 315.00"));
  assert.ok(!html.includes("$"));
});

// -------------------------------------------------------------
// Scenario 1: Full Payment
// -------------------------------------------------------------
test("Scenario 1: Full payment settles invoice completely", () => {
  const party = { id: "p1", partyName: "Customer Full Pay" };
  const sales = [
    {
      id: "sale-fp",
      customer: "Customer Full Pay",
      form: { invoiceNumber: "INV-101", invoiceDate: "2026-11-05" },
      totals: { finalTotal: 500 },
    },
  ];
  const paymentIns = [
    {
      id: "pay-fp",
      customer: "Customer Full Pay",
      linkedInvoiceId: "sale-fp",
      amount: 500,
      date: "2026-11-06",
    },
  ];

  const stmt = generatePartyStatement({ party, sales, paymentIns });
  assert.equal(stmt.totalDebit, 500);
  assert.equal(stmt.totalCredit, 500);
  assert.equal(stmt.closingBalance, 0);
  assert.equal(stmt.closingBalanceType, "settled");
  assert.equal(stmt.transactions[0].status, "Paid");
});

// -------------------------------------------------------------
// Scenario 2: Partial Payment
// -------------------------------------------------------------
test("Scenario 2: Partial payment leaves outstanding balance", () => {
  const party = { id: "p2", partyName: "Customer Partial Pay" };
  const sales = [
    {
      id: "sale-pp",
      customer: "Customer Partial Pay",
      form: { invoiceNumber: "INV-102", invoiceDate: "2026-11-05" },
      totals: { finalTotal: 1000 },
    },
  ];
  const paymentIns = [
    {
      id: "pay-pp",
      customer: "Customer Partial Pay",
      linkedInvoiceId: "sale-pp",
      amount: 400,
      date: "2026-11-06",
    },
  ];

  const stmt = generatePartyStatement({ party, sales, paymentIns });
  assert.equal(stmt.totalDebit, 1000);
  assert.equal(stmt.totalCredit, 400);
  assert.equal(stmt.closingBalance, 600);
  assert.equal(stmt.closingBalanceType, "to-receive");
  assert.equal(stmt.transactions[0].status, "Partially Paid");
});

// -------------------------------------------------------------
// Scenario 3: Multiple sales and multiple receipts
// -------------------------------------------------------------
test("Scenario 3: Multiple sales and multiple receipts", () => {
  const party = { id: "p3", partyName: "Customer Multi" };
  const sales = [
    { id: "s1", customer: "Customer Multi", form: { invoiceNumber: "INV-1", invoiceDate: "2026-11-01" }, totals: { finalTotal: 1000 } },
    { id: "s2", customer: "Customer Multi", form: { invoiceNumber: "INV-2", invoiceDate: "2026-11-03" }, totals: { finalTotal: 2000 } },
  ];
  const paymentIns = [
    { id: "p1", customer: "Customer Multi", amount: 500, date: "2026-11-02" },
    { id: "p2", customer: "Customer Multi", amount: 1500, date: "2026-11-04" },
  ];

  const stmt = generatePartyStatement({ party, sales, paymentIns });
  assert.equal(stmt.totalDebit, 3000);
  assert.equal(stmt.totalCredit, 2000);
  assert.equal(stmt.closingBalance, 1000);
  assert.equal(stmt.closingBalanceType, "to-receive");
  assert.equal(stmt.transactions.length, 4);
});

// -------------------------------------------------------------
// Scenario 4: Multiple purchases and multiple payments
// -------------------------------------------------------------
test("Scenario 4: Multiple purchases and multiple payments", () => {
  const party = { id: "p4", partyName: "Supplier Multi" };
  const purchases = [
    { id: "b1", supplier: "Supplier Multi", form: { invoiceNumber: "BILL-1", invoiceDate: "2026-11-01" }, totals: { finalTotal: 800 } },
    { id: "b2", supplier: "Supplier Multi", form: { invoiceNumber: "BILL-2", invoiceDate: "2026-11-03" }, totals: { finalTotal: 1200 } },
  ];
  const paymentOuts = [
    { id: "po1", supplier: "Supplier Multi", amount: 400, date: "2026-11-02" },
    { id: "po2", supplier: "Supplier Multi", amount: 1600, date: "2026-11-04" },
  ];

  const stmt = generatePartyStatement({ party, purchases, paymentOuts });
  assert.equal(stmt.totalDebit, 2000);
  assert.equal(stmt.totalCredit, 2000);
  assert.equal(stmt.closingBalance, 0);
  assert.equal(stmt.closingBalanceType, "settled");
});

// -------------------------------------------------------------
// Scenario 5: Customer-only party
// -------------------------------------------------------------
test("Scenario 5: Customer-only party with sales and payment", () => {
  const party = { id: "p5", partyName: "Pure Customer", partyType: "customer" };
  const sales = [
    { id: "s-cust", customer: "Pure Customer", form: { invoiceNumber: "INV-C", invoiceDate: "2026-11-01" }, totals: { finalTotal: 2500 } },
  ];
  const paymentIns = [
    { id: "pi-cust", customer: "Pure Customer", amount: 1000, date: "2026-11-05" },
  ];

  const stmt = generatePartyStatement({ party, sales, paymentIns });
  assert.equal(stmt.totalDebit, 2500);
  assert.equal(stmt.totalCredit, 1000);
  assert.equal(stmt.closingBalance, 1500);
  assert.equal(stmt.closingBalanceType, "to-receive");
});

// -------------------------------------------------------------
// Scenario 6: Supplier-only party
// -------------------------------------------------------------
test("Scenario 6: Supplier-only party with purchases and payment", () => {
  const party = { id: "p6", partyName: "Pure Supplier", partyType: "supplier" };
  const purchases = [
    { id: "b-supp", supplier: "Pure Supplier", form: { invoiceNumber: "BILL-S", invoiceDate: "2026-11-01" }, totals: { finalTotal: 3000 } },
  ];
  const paymentOuts = [
    { id: "po-supp", supplier: "Pure Supplier", amount: 1200, date: "2026-11-05" },
  ];

  const stmt = generatePartyStatement({ party, purchases, paymentOuts });
  assert.equal(stmt.totalDebit, 1200);
  assert.equal(stmt.totalCredit, 3000);
  assert.equal(stmt.closingBalance, 1800);
  assert.equal(stmt.closingBalanceType, "to-pay");
});

// -------------------------------------------------------------
// Scenario 7: Party acting as both customer and supplier (Dual-role)
// -------------------------------------------------------------
test("Scenario 7: Party acting as both customer and supplier", () => {
  const party = { id: "p7", partyName: "Dual Role Entity" };
  const sales = [
    { id: "s-dual", customer: "Dual Role Entity", form: { invoiceNumber: "INV-D1", invoiceDate: "2026-11-01" }, totals: { finalTotal: 1500 } },
  ];
  const purchases = [
    { id: "b-dual", supplier: "Dual Role Entity", form: { invoiceNumber: "BILL-D1", invoiceDate: "2026-11-02" }, totals: { finalTotal: 2000 } },
  ];
  const paymentIns = [
    { id: "pi-dual", customer: "Dual Role Entity", amount: 1000, date: "2026-11-03" },
  ];
  const paymentOuts = [
    { id: "po-dual", supplier: "Dual Role Entity", amount: 1000, date: "2026-11-04" },
  ];

  const stmt = generatePartyStatement({ party, sales, purchases, paymentIns, paymentOuts });
  // Debit = Sale (1500) + Payment-Out (1000) = 2500
  // Credit = Purchase (2000) + Payment-In (1000) = 3000
  // Net = Debit (2500) - Credit (3000) = -500 (Payable / Cr)
  assert.equal(stmt.totalDebit, 2500);
  assert.equal(stmt.totalCredit, 3000);
  assert.equal(stmt.closingBalance, 500);
  assert.equal(stmt.closingBalanceType, "to-pay");
});

// -------------------------------------------------------------
// Scenario 8: Opening balance handling
// -------------------------------------------------------------
test("Scenario 8a: Customer with opening balance (To Receive / Dr)", () => {
  const party = {
    id: "p8a",
    partyName: "Opening Dr Party",
    openingBalance: 2500,
    openingBalanceType: "to-receive",
  };
  const paymentIns = [
    { id: "pi-ob", customer: "Opening Dr Party", amount: 500, date: "2026-11-05" },
  ];

  const stmt = generatePartyStatement({ party, paymentIns });
  assert.equal(stmt.openingBalance, 2500);
  assert.equal(stmt.openingBalanceType, "to-receive");
  assert.equal(stmt.totalCredit, 500);
  assert.equal(stmt.closingBalance, 2000);
  assert.equal(stmt.closingBalanceType, "to-receive");
});

test("Scenario 8b: Supplier with opening balance (To Pay / Cr)", () => {
  const party = {
    id: "p8b",
    partyName: "Opening Cr Party",
    openingBalance: 1500,
    openingBalanceType: "to-pay",
  };
  const paymentOuts = [
    { id: "po-ob", supplier: "Opening Cr Party", amount: 1000, date: "2026-11-05" },
  ];

  const stmt = generatePartyStatement({ party, paymentOuts });
  assert.equal(stmt.openingBalance, 1500);
  assert.equal(stmt.openingBalanceType, "to-pay");
  assert.equal(stmt.totalDebit, 1000);
  assert.equal(stmt.closingBalance, 500);
  assert.equal(stmt.closingBalanceType, "to-pay");
});

// -------------------------------------------------------------
// Scenario 9: Outstanding receivable
// -------------------------------------------------------------
test("Scenario 9: Outstanding receivable from unpaid sale", () => {
  const party = { id: "p9", partyName: "Unpaid Customer" };
  const sales = [
    { id: "s-unpaid", customer: "Unpaid Customer", form: { invoiceNumber: "INV-U", invoiceDate: "2026-11-01" }, totals: { finalTotal: 10000 } },
  ];

  const stmt = generatePartyStatement({ party, sales });
  assert.equal(stmt.totalDebit, 10000);
  assert.equal(stmt.totalCredit, 0);
  assert.equal(stmt.closingBalance, 10000);
  assert.equal(stmt.closingBalanceType, "to-receive");
  assert.equal(stmt.transactions[0].status, "Unpaid");
});

// -------------------------------------------------------------
// Scenario 10: Outstanding payable
// -------------------------------------------------------------
test("Scenario 10: Outstanding payable from unpaid purchase", () => {
  const party = { id: "p10", partyName: "Unpaid Supplier" };
  const purchases = [
    { id: "b-unpaid", supplier: "Unpaid Supplier", form: { invoiceNumber: "BILL-U", invoiceDate: "2026-11-01" }, totals: { finalTotal: 15000 } },
  ];

  const stmt = generatePartyStatement({ party, purchases });
  assert.equal(stmt.totalDebit, 0);
  assert.equal(stmt.totalCredit, 15000);
  assert.equal(stmt.closingBalance, 15000);
  assert.equal(stmt.closingBalanceType, "to-pay");
  assert.equal(stmt.transactions[0].status, "Unpaid");
});

// -------------------------------------------------------------
// Scenario 11: Unallocated / advance payments
// -------------------------------------------------------------
test("Scenario 11: Unallocated advance payment from customer", () => {
  const party = { id: "p11", partyName: "Advance Customer" };
  const paymentIns = [
    { id: "pi-adv", customer: "Advance Customer", amount: 5000, date: "2026-11-01" },
  ];

  const stmt = generatePartyStatement({ party, paymentIns });
  assert.equal(stmt.totalDebit, 0);
  assert.equal(stmt.totalCredit, 5000);
  assert.equal(stmt.closingBalance, 5000);
  assert.equal(stmt.closingBalanceType, "to-pay"); // Entity holds customer's advance money (liability)
});

// -------------------------------------------------------------
// Scenario 12: Cancelled transactions are safely excluded
// -------------------------------------------------------------
test("Scenario 12: Cancelled sales and voided payments are excluded", () => {
  const party = { id: "p12", partyName: "Cancelled Txn Party" };
  const sales = [
    { id: "s-valid", customer: "Cancelled Txn Party", form: { invoiceNumber: "INV-V", invoiceDate: "2026-11-01" }, totals: { finalTotal: 3000 } },
    { id: "s-canc", customer: "Cancelled Txn Party", cancelled: true, form: { invoiceNumber: "INV-C", invoiceDate: "2026-11-02" }, totals: { finalTotal: 5000 } },
  ];
  const paymentIns = [
    { id: "pi-void", customer: "Cancelled Txn Party", status: "Cancelled", amount: 2000, date: "2026-11-03" },
  ];

  const stmt = generatePartyStatement({ party, sales, paymentIns });
  assert.equal(stmt.transactions.length, 1, "Only the active valid sale must appear");
  assert.equal(stmt.totalDebit, 3000);
  assert.equal(stmt.totalCredit, 0);
  assert.equal(stmt.closingBalance, 3000);
});

// -------------------------------------------------------------
// Scenario 13: Duplicate payments and duplicate invoices
// -------------------------------------------------------------
test("Scenario 13: Duplicate array records are deduplicated", () => {
  const party = { id: "p13", partyName: "Duplicate Party" };
  const sales = [
    { id: "dup-sale-1", customer: "Duplicate Party", form: { invoiceNumber: "INV-D", invoiceDate: "2026-11-01" }, totals: { finalTotal: 1000 } },
    { id: "dup-sale-1", customer: "Duplicate Party", form: { invoiceNumber: "INV-D", invoiceDate: "2026-11-01" }, totals: { finalTotal: 1000 } },
  ];
  const paymentIns = [
    { id: "dup-pay-1", customer: "Duplicate Party", amount: 1000, date: "2026-11-02" },
    { id: "dup-pay-1", customer: "Duplicate Party", amount: 1000, date: "2026-11-02" },
  ];

  const stmt = generatePartyStatement({ party, sales, paymentIns });
  assert.equal(stmt.transactions.length, 2, "Duplicate entries must be filtered to exactly 2 transactions");
  assert.equal(stmt.totalDebit, 1000);
  assert.equal(stmt.totalCredit, 1000);
  assert.equal(stmt.closingBalance, 0);
});

// -------------------------------------------------------------
// Date Filtering and Prior Period Roll-Forward
// -------------------------------------------------------------
test("Date Filtering: Prior period movement rolls forward into opening balance", () => {
  const party = {
    id: "p-date",
    partyName: "Date Filter Party",
    openingBalance: 500,
    openingBalanceType: "to-receive",
  };

  const sales = [
    // Prior transaction: October
    { id: "s-prior", customer: "Date Filter Party", form: { invoiceNumber: "INV-OCT", invoiceDate: "2026-10-15" }, totals: { finalTotal: 1000 } },
    // In-range transaction: November
    { id: "s-curr", customer: "Date Filter Party", form: { invoiceNumber: "INV-NOV", invoiceDate: "2026-11-10" }, totals: { finalTotal: 700 } },
  ];

  const paymentIns = [
    // Prior payment: October
    { id: "p-prior", customer: "Date Filter Party", amount: 200, date: "2026-10-20" },
  ];

  // Request November statement
  const stmt = generatePartyStatement({
    party,
    sales,
    paymentIns,
    from: "2026-11-01",
    to: "2026-11-30",
  });

  // Effective Opening Balance at 01/11/2026:
  // Base (500) + Prior Debit (1000) - Prior Credit (200) = 1300 To Receive
  assert.equal(stmt.openingBalance, 1300);
  assert.equal(stmt.openingBalanceType, "to-receive");

  // In-range transactions: only s-curr (700)
  assert.equal(stmt.transactions.length, 1);
  assert.equal(stmt.totalDebit, 700);
  assert.equal(stmt.totalCredit, 0);

  // Closing Balance: 1300 + 700 = 2000 To Receive
  assert.equal(stmt.closingBalance, 2000);
  assert.equal(stmt.closingBalanceType, "to-receive");

  // Mathematical Reconciliation:
  // Opening Balance + Total Debit - Total Credit === Closing Balance
  assert.equal(stmt.openingBalance + stmt.totalDebit - stmt.totalCredit, stmt.closingBalance);
});

// -------------------------------------------------------------
// Date Range Helper Options
// -------------------------------------------------------------
test("getDateRangeForPeriod generates valid ISO dates for This Month and Previous Month", () => {
  const thisMonth = getDateRangeForPeriod("This Month");
  assert.ok(thisMonth.from.match(/^\d{4}-\d{2}-01$/));
  assert.ok(thisMonth.to.match(/^\d{4}-\d{2}-\d{2}$/));

  const prevMonth = getDateRangeForPeriod("Previous Month");
  assert.ok(prevMonth.from.match(/^\d{4}-\d{2}-01$/));
  assert.ok(prevMonth.to.match(/^\d{4}-\d{2}-\d{2}$/));
});
