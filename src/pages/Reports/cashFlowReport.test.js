import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYMD,
  extractSaleCashMovement,
  extractPurchaseCashMovement,
  extractPaymentInMovement,
  extractPaymentOutMovement,
  extractExpenseMovement,
  extractCashAdjustmentMovement,
  buildCashFlowEntries,
  calculateOpeningBalance,
  filterAndCalculateCashFlow,
} from "../../utils/cashFlowCalculations.js";

test("Scenario 1: Fully paid cash sale produces correct Cash In", () => {
  const sale = {
    id: "sale-cash-1",
    saleType: "cash",
    form: { invoiceNumber: "INV-101", invoiceDate: "2026-11-01", customer: "Walk-in Customer", paymentType: "Cash" },
    totals: { finalTotal: 1200, received: 1200 },
  };

  const entry = extractSaleCashMovement(sale);
  assert.equal(entry.cashIn, 1200);
  assert.equal(entry.cashOut, 0);
  assert.equal(entry.isUnpaid, false);
  assert.equal(entry.paymentMethod, "Cash");
});

test("Scenario 2: Unpaid sale invoice produces ₹0 Cash In", () => {
  const unpaidSale = {
    id: "sale-unpaid-1",
    saleType: "credit",
    form: { invoiceNumber: "INV-102", invoiceDate: "2026-11-01", customer: "Credit Customer", paymentType: "Cash" },
    totals: { finalTotal: 5000, received: 0 },
    status: "Unpaid",
  };

  const entry = extractSaleCashMovement(unpaidSale);
  assert.equal(entry.cashIn, 0);
  assert.equal(entry.cashOut, 0);
  assert.equal(entry.isUnpaid, true);
});

test("Scenario 3: Partially paid sale invoice counts only actual amount received", () => {
  const partialSale = {
    id: "sale-partial-1",
    saleType: "credit",
    form: { invoiceNumber: "INV-103", invoiceDate: "2026-11-01", customer: "Partial Customer", paymentType: "Cash" },
    totals: { finalTotal: 3000, received: 1000 },
  };

  const entry = extractSaleCashMovement(partialSale);
  assert.equal(entry.cashIn, 1000);
  assert.equal(entry.cashOut, 0);
  assert.equal(entry.isPartial, true);
  assert.equal(entry.isUnpaid, false);
});

test("Scenario 4: Fully paid cash purchase produces correct Cash Out", () => {
  const cashPurchase = {
    id: "purch-cash-1",
    purchaseType: "cash",
    form: { invoiceNumber: "BILL-201", invoiceDate: "2026-11-01", party: "Apex Wholesalers", paymentType: "Cash" },
    totals: { finalTotal: 750, received: 750 },
    status: "Paid",
  };

  const entry = extractPurchaseCashMovement(cashPurchase);
  assert.equal(entry.cashIn, 0);
  assert.equal(entry.cashOut, 750);
  assert.equal(entry.isUnpaid, false);
});

test("Scenario 5: Unpaid purchase bill (Orbit Tech Distributors ₹53) produces ₹0 Cash Out", () => {
  // Exact user scenario: Orbit Tech Distributors purchase bill of ₹53 shown as Unpaid in Purchase Bills
  const orbitTechBill = {
    id: "purch-orbit-53",
    form: {
      customer: "Orbit Tech Distributors",
      invoiceNumber: "PUR-53",
      invoiceDate: "2026-11-02",
      paymentType: "Cash", // AddSale default
    },
    partyName: "Orbit Tech Distributors",
    totalAmount: 53,
    totals: { finalTotal: 53, received: 0 },
    paidAmount: 0,
    status: "Unpaid",
  };

  const entry = extractPurchaseCashMovement(orbitTechBill);
  assert.equal(entry.name, "Orbit Tech Distributors");
  assert.equal(entry.cashIn, 0);
  assert.equal(entry.cashOut, 0, "Unpaid purchase bill must not produce any Cash Out");
  assert.equal(entry.isUnpaid, true);

  // When filtered with showZeroAmount = false (default), it should NOT be included in movements or totals
  const result = filterAndCalculateCashFlow([entry], { from: "2026-11-01", to: "2026-11-30", showZeroAmount: false });
  assert.equal(result.filteredRows.length, 0, "Unpaid bill with zero movement excluded by default");
  assert.equal(result.totalCashOut, 0);

  // When filtered with showZeroAmount = true, it should show with ₹0 movement
  const resultZero = filterAndCalculateCashFlow([entry], { from: "2026-11-01", to: "2026-11-30", showZeroAmount: true });
  assert.equal(resultZero.filteredRows.length, 1);
  assert.equal(resultZero.filteredRows[0].cashOut, 0);
  assert.equal(resultZero.totalCashOut, 0);
});

test("Scenario 6: Partially paid purchase bill counts only amount paid", () => {
  const partialPurchase = {
    id: "purch-part-1",
    form: { invoiceNumber: "BILL-202", invoiceDate: "2026-11-02", supplier: "Supplier A", paymentType: "Cash" },
    totals: { finalTotal: 2000, received: 600 },
    paidAmount: 600,
    status: "Partial",
  };

  const entry = extractPurchaseCashMovement(partialPurchase);
  assert.equal(entry.cashIn, 0);
  assert.equal(entry.cashOut, 600);
  assert.equal(entry.isPartial, true);
});

test("Scenario 7: Payment-In counts as Cash/Bank In", () => {
  const payIn = {
    id: "payin-1",
    number: "RCPT-001",
    date: "2026-11-02",
    partyName: "Customer X",
    amount: 1500,
    payments: [{ type: "Cash", amount: 1500 }],
  };

  const entry = extractPaymentInMovement(payIn);
  assert.equal(entry.cashIn, 1500);
  assert.equal(entry.cashOut, 0);
  assert.equal(entry.paymentMethod, "Cash");
});

test("Scenario 8: Payment-Out counts as Cash/Bank Out", () => {
  const payOut = {
    id: "payout-1",
    number: "VOUCH-001",
    date: "2026-11-02",
    partyName: "Supplier Y",
    amount: 800,
    payments: [{ type: "Bank Transfer", amount: 800 }],
  };

  const entry = extractPaymentOutMovement(payOut);
  assert.equal(entry.cashIn, 0);
  assert.equal(entry.cashOut, 800);
  assert.equal(entry.paymentMethod, "Bank Transfer");
});

test("Scenario 9: Paid Expense counts as Cash Out, Unpaid Expense produces ₹0 Cash Out", () => {
  const paidExpense = {
    id: "exp-paid",
    number: "EXP-01",
    date: "2026-11-02",
    category: "Office Rent",
    amount: 450,
    paid: 450,
    status: "Paid",
    payments: [{ type: "UPI", amount: 450 }],
  };
  const paidEntry = extractExpenseMovement(paidExpense);
  assert.equal(paidEntry.cashOut, 450);
  assert.equal(paidEntry.cashIn, 0);

  const unpaidExpense = {
    id: "exp-unpaid",
    number: "EXP-02",
    date: "2026-11-02",
    category: "Electricity Bill",
    amount: 1200,
    paid: 0,
    status: "Unpaid",
  };
  const unpaidEntry = extractExpenseMovement(unpaidExpense);
  assert.equal(unpaidEntry.cashOut, 0);
  assert.equal(unpaidEntry.cashIn, 0);
  assert.equal(unpaidEntry.isUnpaid, true);
});

test("Scenario 10: Duplicate payment prevention prevents double-counting linked payments", () => {
  // Case A: A credit sale invoice with received = 0, followed by a linked Payment-In
  const creditSale = {
    id: "inv-linked-1",
    saleType: "credit",
    form: { invoiceNumber: "INV-LINKED-1", invoiceDate: "2026-11-01", customer: "Party Z" },
    totals: { finalTotal: 1000, received: 0 },
  };
  const linkedPaymentIn = {
    id: "payin-linked-1",
    number: "RCPT-L1",
    date: "2026-11-03",
    customer: "Party Z",
    amount: 1000,
    linkedInvoiceId: "inv-linked-1",
  };

  const entriesA = buildCashFlowEntries({
    sales: [creditSale],
    paymentIns: [linkedPaymentIn],
  });
  const resA = filterAndCalculateCashFlow(entriesA);
  assert.equal(resA.totalCashIn, 1000, "Credit sale + linked payment-in counted exactly once");

  // Case B: Sale invoice that ALREADY recorded received = 500 at creation, AND has a linked Payment-In of 500
  const paidSale = {
    id: "inv-already-paid",
    saleType: "cash",
    form: { invoiceNumber: "INV-ALREADY-PAID", invoiceDate: "2026-11-01", customer: "Party W" },
    totals: { finalTotal: 500, received: 500 },
  };
  const duplicatePayIn = {
    id: "payin-dup-1",
    number: "RCPT-DUP",
    date: "2026-11-01",
    customer: "Party W",
    amount: 500,
    linkedInvoiceId: "inv-already-paid",
  };

  const entriesB = buildCashFlowEntries({
    sales: [paidSale],
    paymentIns: [duplicatePayIn],
  });
  const resB = filterAndCalculateCashFlow(entriesB);
  assert.equal(resB.totalCashIn, 500, "Must not double count when invoice already recorded the receipt");
});

test("Scenario 11: Opening balance prior to range and running balance chronology", () => {
  const entries = [
    // Prior transactions (October 2026)
    { id: "1", date: "2026-10-15", cashIn: 1000, cashOut: 0 },
    { id: "2", date: "2026-10-20", cashIn: 0, cashOut: 300 },
    // Current period transactions (November 2026)
    { id: "3", date: "2026-11-01", cashIn: 500, cashOut: 0 },
    { id: "4", date: "2026-11-02", cashIn: 0, cashOut: 200 },
  ];

  // Opening balance before 2026-11-01 should be 1000 - 300 = 700
  const opening = calculateOpeningBalance(entries, "2026-11-01");
  assert.equal(opening, 700);

  const result = filterAndCalculateCashFlow(entries, { from: "2026-11-01", to: "2026-11-30" });
  assert.equal(result.openingBalance, 700);
  assert.equal(result.filteredRows.length, 2);
  assert.equal(result.filteredRows[0].runningBalance, 1200); // 700 + 500
  assert.equal(result.filteredRows[1].runningBalance, 1000); // 1200 - 200
  assert.equal(result.closingBalance, 1000);
});

test("Scenario 12: Date-filtered totals and formula Closing = Opening + In - Out", () => {
  const entries = [
    { id: "a", date: "2026-10-01", cashIn: 2000, cashOut: 0 },
    { id: "b", date: "2026-11-05", cashIn: 1500, cashOut: 0 },
    { id: "c", date: "2026-11-10", cashIn: 0, cashOut: 700 },
    { id: "d", date: "2026-11-15", cashIn: 300, cashOut: 0 },
    { id: "e", date: "2026-12-01", cashIn: 5000, cashOut: 0 }, // Out of range
  ];

  const result = filterAndCalculateCashFlow(entries, { from: "2026-11-01", to: "2026-11-30" });
  assert.equal(result.openingBalance, 2000);
  assert.equal(result.totalCashIn, 1800); // 1500 + 300
  assert.equal(result.totalCashOut, 700);
  assert.equal(result.closingBalance, 2000 + 1800 - 700); // 3100
  assert.equal(result.closingBalance, result.filteredRows[result.filteredRows.length - 1].runningBalance);
});

test("Integration Test: Complete business records in localStorage including Orbit Tech ₹53 unpaid purchase", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
    },
    dispatchEvent: () => true,
  };

  // Seed localStorage with representative transactions
  const purchases = [
    // Orbit Tech Distributors ₹53 unpaid purchase bill
    {
      id: "purch-orbit-53",
      form: { customer: "Orbit Tech Distributors", invoiceNumber: "PB-01", invoiceDate: "2026-11-02", paymentType: "Cash" },
      partyName: "Orbit Tech Distributors",
      totalAmount: 53,
      totals: { finalTotal: 53, received: 0 },
      status: "Unpaid",
    },
    // Paid purchase bill of ₹800
    {
      id: "purch-paid-800",
      form: { customer: "Supplier Metro", invoiceNumber: "PB-02", invoiceDate: "2026-11-03", paymentType: "Cash" },
      partyName: "Supplier Metro",
      totalAmount: 800,
      totals: { finalTotal: 800, received: 800 },
      status: "Paid",
    },
  ];

  const sales = [
    // Unpaid credit sale of ₹1000
    {
      id: "sale-unpaid-1000",
      saleType: "credit",
      form: { customer: "Unpaid Party", invoiceNumber: "INV-01", invoiceDate: "2026-11-02", paymentType: "Cash" },
      totals: { finalTotal: 1000, received: 0 },
      status: "Unpaid",
    },
    // Paid cash sale of ₹2500
    {
      id: "sale-paid-2500",
      saleType: "cash",
      form: { customer: "Counter Cash Sale", invoiceNumber: "INV-02", invoiceDate: "2026-11-04", paymentType: "Cash" },
      totals: { finalTotal: 2500, received: 2500 },
      status: "Paid",
    },
  ];

  const paymentIns = [
    { id: "pi-1", number: "PI-10", date: "2026-11-05", partyName: "Customer A", amount: 300, payments: [{ type: "Cash", amount: 300 }] },
  ];

  const paymentOuts = [
    { id: "po-1", number: "PO-20", date: "2026-11-06", partyName: "Supplier B", amount: 150, payments: [{ type: "Bank Transfer", amount: 150 }] },
  ];

  const expenses = [
    { id: "exp-1", number: "EX-1", date: "2026-11-07", category: "Tea & Snacks", amount: 100, paid: 100, status: "Paid" },
    { id: "exp-2", number: "EX-2", date: "2026-11-08", category: "Office Equipment", amount: 200, paid: 0, status: "Unpaid" },
  ];

  const adjustments = [
    { id: "adj-1", reference: "ADJ-01", date: "2026-11-09", amount: 50, reason: "Cash count surplus" },
  ];

  const entries = buildCashFlowEntries({
    sales,
    purchases,
    paymentIns,
    paymentOuts,
    expenses,
    adjustments,
  });

  // Calculate Cash Flow for November 2026
  const report = filterAndCalculateCashFlow(entries, {
    from: "2026-11-01",
    to: "2026-11-30",
    showZeroAmount: false,
  });

  // Expected Cash In: 2500 (sale) + 300 (payment-in) + 50 (adjustment) = 2850
  assert.equal(report.totalCashIn, 2850, "Total Cash In matches actual receipts");

  // Expected Cash Out: 800 (purchase) + 150 (payment-out) + 100 (expense) = 1050
  // Note: Orbit Tech ₹53 is UNPAID so it must NOT be in cash out!
  assert.equal(report.totalCashOut, 1050, "Total Cash Out excludes unpaid ₹53 Orbit Tech bill");

  // Closing Balance: 2850 - 1050 = 1800
  assert.equal(report.closingBalance, 1800);

  // Check showZeroAmount = true
  const zeroReport = filterAndCalculateCashFlow(entries, {
    from: "2026-11-01",
    to: "2026-11-30",
    showZeroAmount: true,
  });
  const orbitRow = zeroReport.filteredRows.find((r) => r.name === "Orbit Tech Distributors");
  assert.ok(orbitRow, "Orbit Tech row appears when showZeroAmount is enabled");
  assert.equal(orbitRow.cashOut, 0, "Orbit Tech cashOut is 0");
  assert.equal(orbitRow.isUnpaid, true);
  assert.equal(zeroReport.totalCashOut, 1050, "Enabling showZeroAmount does not change total Cash Out");
});

