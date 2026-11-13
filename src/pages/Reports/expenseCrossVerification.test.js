import test from "node:test";
import assert from "node:assert/strict";
import {
  getExpenses,
  saveExpenses,
  getExpenseCategories,
  transactionStorageKeys,
} from "../../services/transactionRepository.js";
import {
  filterExpenses,
  calculateExpenseMetrics,
  rowAmount,
  DEFAULT_EXPENSE_CATEGORIES,
} from "../../utils/expenseCalculations.js";

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
    CustomEvent: class CustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    },
  };
  return store;
}

test("Cross-Verification: Multi-record comparison between Expenses module, Expense Report, and Category Summary", () => {
  setupInMemoryStorage();

  // Create 7 realistic expense records matching the exact schema created by Expenses.jsx
  const sampleExpenses = [
    {
      id: "exp-1",
      number: "1",
      date: "2026-11-02",
      category: "Petrol",
      party: "City Fuel Station",
      gst: false,
      rows: [{ id: "r1", item: "Petrol Fuel", qty: 1, price: 500 }],
      payments: [{ id: "p1", type: "Cash", amount: 500 }],
      amount: 500,
      paid: 500,
      status: "Paid",
      description: "Company vehicle fuel refill",
    },
    {
      id: "exp-2",
      number: "2",
      date: "2026-11-05",
      category: "Rent",
      party: "Apex Properties Ltd",
      gst: false,
      rows: [{ id: "r2", item: "Office Space Rent", qty: 1, price: 15000 }],
      payments: [{ id: "p2", type: "Bank Transfer", amount: 15000 }],
      amount: 15000,
      paid: 15000,
      status: "Paid",
      description: "November 2026 office lease",
    },
    {
      id: "exp-3",
      number: "3",
      date: "2026-11-08",
      category: "Transport",
      party: "Express Logistics",
      gst: true,
      rows: [{ id: "r3", item: "Freight charges", qty: 1, price: 2118.64, tax: 18 }],
      payments: [{ id: "p3", type: "Cash", amount: 1000 }],
      amount: 2500,
      paid: 1000,
      status: "Partially Paid",
      description: "Partial courier settlement (1500 balance due)",
    },
    {
      id: "exp-4",
      number: "4",
      date: "2026-11-10",
      category: "Tea",
      party: "Sharma Tea Stall",
      gst: false,
      rows: [{ id: "r4", item: "Tea & Biscuits", qty: 1, price: 250 }],
      payments: [{ id: "p4", type: "Cash", amount: 250 }],
      amount: 250,
      paid: 250,
      status: "Paid",
      description: "Staff refreshments",
    },
    {
      id: "exp-5",
      number: "5",
      date: "2026-11-12",
      category: "Salary",
      party: "Staff Payroll",
      gst: false,
      rows: [{ id: "r5", item: "Advance Staff Wages", qty: 1, price: 30000 }],
      payments: [{ id: "p5", type: "Cheque", amount: 30000 }],
      amount: 30000,
      paid: 30000,
      status: "Paid",
      description: "Staff salary payout",
    },
    {
      id: "exp-6",
      number: "6",
      date: "2026-11-14",
      category: "Transport",
      party: "Blue Dart Express",
      gst: false,
      rows: [{ id: "r6", item: "Air Cargo Delivery", qty: 1, price: 1200 }],
      payments: [{ id: "p6", type: "UPI", amount: 1200 }],
      amount: 1200,
      paid: 1200,
      status: "Paid",
      description: "Sample dispatch to client",
    },
    {
      id: "exp-7",
      number: "7",
      date: "2026-11-15",
      category: "Petrol",
      party: "Highway Petroleum",
      gst: false,
      rows: [{ id: "r7", item: "Cancelled fuel coupon", qty: 1, price: 800 }],
      payments: [{ id: "p7", type: "Cash", amount: 0 }],
      amount: 800,
      paid: 0,
      status: "Cancelled",
      description: "Cancelled coupon - do not count in expenses",
    },
  ];

  saveExpenses(sampleExpenses);

  // 1. Total records in Expense module
  const rawRecords = JSON.parse(
    window.localStorage.getItem(transactionStorageKeys.expenses)
  );
  assert.equal(rawRecords.length, 7, "Total raw records in Expense module is 7");

  // 2. Total eligible records in Expense Report
  const normalized = getExpenses();
  const novemberExpenses = filterExpenses(normalized, {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  // Note: 7 records exist, 1 is Cancelled.
  assert.equal(novemberExpenses.length, 7, "All 7 records appear in the transaction table with status");

  const metrics = calculateExpenseMetrics(novemberExpenses);
  assert.equal(
    metrics.transactionCount,
    6,
    "Eligible active expense transactions is 6 (excluding cancelled)"
  );

  // 3. Overall expense amount in both reports
  const expectedTotal = 500 + 15000 + 2500 + 250 + 30000 + 1200; // 49450
  assert.equal(metrics.totalExpenses, expectedTotal, "Total active expense amount is 49450");

  const expectedPaid = 500 + 15000 + 1000 + 250 + 30000 + 1200; // 47950
  assert.equal(metrics.paidTotal, expectedPaid, "Total paid amount is 47950");

  const expectedDue = 1500;
  assert.equal(metrics.balanceTotal, expectedDue, "Total balance due is 1500");
  assert.equal(metrics.paidTotal + metrics.balanceTotal, metrics.totalExpenses);

  // 4. Total category-wise records in Expense Category Report
  // The 6 active records belong to 5 categories:
  // - Petrol: 1
  // - Rent: 1
  // - Transport: 2
  // - Tea: 1
  // - Salary: 1
  assert.equal(
    metrics.categoryBreakdown.length,
    5,
    "Category Summary tab has exactly 5 active categories"
  );

  const petrol = metrics.categoryBreakdown.find((c) => c.category === "Petrol");
  assert.equal(petrol.count, 1);
  assert.equal(petrol.total, 500);

  const rent = metrics.categoryBreakdown.find((c) => c.category === "Rent");
  assert.equal(rent.count, 1);
  assert.equal(rent.total, 15000);

  const transport = metrics.categoryBreakdown.find((c) => c.category === "Transport");
  assert.equal(transport.count, 2);
  assert.equal(transport.total, 3700, "Transport total = 2500 + 1200 = 3700");

  const tea = metrics.categoryBreakdown.find((c) => c.category === "Tea");
  assert.equal(tea.count, 1);
  assert.equal(tea.total, 250);

  const salary = metrics.categoryBreakdown.find((c) => c.category === "Salary");
  assert.equal(salary.count, 1);
  assert.equal(salary.total, 30000);

  // 5. Category-wise totals against the underlying expense records
  const categorySum = metrics.categoryBreakdown.reduce(
    (sum, c) => sum + c.total,
    0
  );
  assert.equal(
    categorySum,
    metrics.totalExpenses,
    "Sum of all category totals must exactly equal total expenses"
  );

  // 6. Cross-verify with Expenses.jsx calculation:
  // In Expenses.jsx: entriesFor("Transport")
  const transportEntries = rawRecords.filter(
    (r) => r.category === "Transport" && r.status !== "Cancelled"
  );
  const transportExpensesModuleTotal = transportEntries.reduce(
    (sum, r) => sum + Number(r.amount),
    0
  );
  assert.equal(
    transport.total,
    transportExpensesModuleTotal,
    "Category total in report matches Expense module entriesFor total"
  );
});
