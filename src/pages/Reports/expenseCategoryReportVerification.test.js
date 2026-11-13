import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExpense,
  filterExpenses,
  calculateExpenseMetrics,
  getPresetDateRange,
  DEFAULT_EXPENSE_CATEGORIES,
} from "../../utils/expenseCalculations.js";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";

// Mock localStorage environment
function createMockStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

globalThis.window = {
  localStorage: createMockStorage(),
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};

test("1. Verify Exact Test Dataset (Grocery: ₹145, Petrol: ₹80, Transport: ₹450 -> Total: ₹675)", () => {
  const testExpenses = [
    {
      id: "exp-001",
      number: "EXP-101",
      date: "2026-11-05",
      category: "Grocery",
      party: "Daily Fresh",
      paymentMode: "Cash",
      amount: 145,
      paid: 145,
      balance: 0,
      status: "Paid",
    },
    {
      id: "exp-002",
      number: "EXP-102",
      date: "2026-11-08",
      category: "Petrol",
      party: "Indian Oil",
      paymentMode: "UPI",
      amount: 80,
      paid: 80,
      balance: 0,
      status: "Paid",
    },
    {
      id: "exp-003",
      number: "EXP-103",
      date: "2026-11-10",
      category: "Transport",
      party: "City Logistics",
      paymentMode: "Bank Transfer",
      amount: 450,
      paid: 450,
      balance: 0,
      status: "Paid",
    },
  ];

  const normalized = testExpenses.map((e, idx) => normalizeExpense(e, idx));
  const metrics = calculateExpenseMetrics(normalized);

  // Total amount must equal ₹675
  assert.equal(metrics.totalExpenses, 675, "Total expenses must equal 675");
  // Transaction count must equal 3
  assert.equal(metrics.transactionCount, 3, "Transaction count must equal 3");
  // Category count must equal 3
  assert.equal(metrics.categoryBreakdown.length, 3, "Category count must equal 3");

  // Check individual categories
  const catMap = new Map(metrics.categoryBreakdown.map((c) => [c.category, c]));

  assert.ok(catMap.has("Grocery"), "Must include Grocery");
  assert.equal(catMap.get("Grocery").total, 145, "Grocery total must be 145");
  assert.equal(catMap.get("Grocery").count, 1, "Grocery count must be 1");
  assert.equal(
    catMap.get("Grocery").percentage.toFixed(2),
    "21.48",
    "Grocery percentage must be 21.48%"
  );

  assert.ok(catMap.has("Petrol"), "Must include Petrol");
  assert.equal(catMap.get("Petrol").total, 80, "Petrol total must be 80");
  assert.equal(catMap.get("Petrol").count, 1, "Petrol count must be 1");
  assert.equal(
    catMap.get("Petrol").percentage.toFixed(2),
    "11.85",
    "Petrol percentage must be 11.85%"
  );

  assert.ok(catMap.has("Transport"), "Must include Transport");
  assert.equal(catMap.get("Transport").total, 450, "Transport total must be 450");
  assert.equal(catMap.get("Transport").count, 1, "Transport count must be 1");
  assert.equal(
    catMap.get("Transport").percentage.toFixed(2),
    "66.67",
    "Transport percentage must be 66.67%"
  );

  // Sum of percentages must equal 100%
  const sumPercentage = metrics.categoryBreakdown.reduce(
    (sum, c) => sum + c.percentage,
    0
  );
  assert.equal(
    Math.round(sumPercentage * 100) / 100,
    100,
    "Sum of category percentages must equal 100.00%"
  );
});

test("2. Reconcile Category Breakdown Mathematical Integrity", () => {
  const dataset = [
    { id: "e1", category: "Grocery", amount: 145 },
    { id: "e2", category: "Petrol", amount: 80 },
    { id: "e3", category: "Transport", amount: 450 },
  ].map((e, i) => normalizeExpense(e, i));

  const metrics = calculateExpenseMetrics(dataset);

  const sumCategoryCounts = metrics.categoryBreakdown.reduce((s, c) => s + c.count, 0);
  const sumCategoryTotals = metrics.categoryBreakdown.reduce((s, c) => s + c.total, 0);
  const sumCategoryPercentages = metrics.categoryBreakdown.reduce((s, c) => s + c.percentage, 0);

  assert.equal(sumCategoryCounts, metrics.transactionCount, "sum(category.counts) === total transactions");
  assert.equal(sumCategoryTotals, metrics.totalExpenses, "sum(category.totals) === totalExpenses");
  assert.equal(Number(sumCategoryPercentages.toFixed(2)), 100.00, "sum(category.percentages) === 100.00%");
});

test("3. Category Filtering and 'View Transactions' Isolation", () => {
  const dataset = [
    { id: "e1", date: "2026-11-05", category: "Grocery", amount: 145, party: "Daily Fresh", paymentMode: "Cash" },
    { id: "e2", date: "2026-11-08", category: "Petrol", amount: 80, party: "Indian Oil", paymentMode: "UPI" },
    { id: "e3", date: "2026-11-10", category: "Transport", amount: 450, party: "City Logistics", paymentMode: "Bank Transfer" },
  ].map((e, i) => normalizeExpense(e, i));

  // 3a. Selecting single category (simulates clicking 'View Transactions' for Grocery)
  const groceryFiltered = filterExpenses(dataset, { category: "Grocery" });
  assert.equal(groceryFiltered.length, 1, "Only Grocery transactions should remain");
  assert.equal(groceryFiltered[0].category, "Grocery");
  assert.equal(groceryFiltered[0].amount, 145);

  // 3b. Metrics for isolated single category
  const groceryMetrics = calculateExpenseMetrics(groceryFiltered);
  assert.equal(groceryMetrics.totalExpenses, 145);
  assert.equal(groceryMetrics.transactionCount, 1);
  assert.equal(groceryMetrics.categoryBreakdown.length, 1);
  assert.equal(groceryMetrics.categoryBreakdown[0].category, "Grocery");
  assert.equal(groceryMetrics.categoryBreakdown[0].percentage, 100);

  // 3c. Clearing filter restores full 3 records and totals
  const allRestored = filterExpenses(dataset, { category: "All" });
  assert.equal(allRestored.length, 3);
  const restoredMetrics = calculateExpenseMetrics(allRestored);
  assert.equal(restoredMetrics.totalExpenses, 675);
  assert.equal(restoredMetrics.categoryBreakdown.length, 3);
});

test("4. Date Range Filters on Category Summary", () => {
  const dataset = [
    { id: "e1", date: "2026-10-15", category: "Grocery", amount: 145 }, // Last Month
    { id: "e2", date: "2026-11-08", category: "Petrol", amount: 80 },    // This Month
    { id: "e3", date: "2026-11-10", category: "Transport", amount: 450 }, // This Month
  ].map((e, i) => normalizeExpense(e, i));

  // Filter: November only (2026-11-01 to 2026-11-30)
  const novFiltered = filterExpenses(dataset, { from: "2026-11-01", to: "2026-11-30" });
  assert.equal(novFiltered.length, 2, "Only November expenses should match");
  const novMetrics = calculateExpenseMetrics(novFiltered);
  assert.equal(novMetrics.totalExpenses, 530, "November total = 80 + 450 = 530");
  assert.equal(novMetrics.categoryBreakdown.length, 2);

  // Filter: October only (2026-10-01 to 2026-10-31)
  const octFiltered = filterExpenses(dataset, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(octFiltered.length, 1, "Only October expenses should match");
  const octMetrics = calculateExpenseMetrics(octFiltered);
  assert.equal(octMetrics.totalExpenses, 145, "October total = 145");
  assert.equal(octMetrics.categoryBreakdown[0].category, "Grocery");

  // Filter: All Time
  const allFiltered = filterExpenses(dataset, { from: "", to: "" });
  assert.equal(allFiltered.length, 3);
  const allMetrics = calculateExpenseMetrics(allFiltered);
  assert.equal(allMetrics.totalExpenses, 675);
});

test("5. Multi-dimension Filters: Party, Payment Mode, and Search", () => {
  const dataset = [
    { id: "e1", category: "Grocery", party: "SuperMart", paymentMode: "Cash", amount: 145, description: "Monthly tea supplies" },
    { id: "e2", category: "Petrol", party: "Indian Oil", paymentMode: "UPI", amount: 80, description: "Fuel for delivery bike" },
    { id: "e3", category: "Transport", party: "Speed Cargo", paymentMode: "Cash", amount: 450, description: "Carton transport freight" },
  ].map((e, i) => normalizeExpense(e, i));

  // 5a. Party Filter
  const partyFiltered = filterExpenses(dataset, { party: "Indian Oil" });
  assert.equal(partyFiltered.length, 1);
  assert.equal(partyFiltered[0].category, "Petrol");

  // 5b. Payment Mode Filter (Cash -> Grocery ₹145 + Transport ₹450 = ₹595)
  const cashFiltered = filterExpenses(dataset, { paymentMode: "Cash" });
  assert.equal(cashFiltered.length, 2);
  const cashMetrics = calculateExpenseMetrics(cashFiltered);
  assert.equal(cashMetrics.totalExpenses, 595);
  assert.equal(cashMetrics.categoryBreakdown.length, 2);

  // 5c. Search Filter ("freight" -> matches description of Transport)
  const searchFiltered = filterExpenses(dataset, { search: "freight" });
  assert.equal(searchFiltered.length, 1);
  assert.equal(searchFiltered[0].category, "Transport");
  assert.equal(searchFiltered[0].amount, 450);
});

test("6. Cancelled Expenses and Partial Payment Integrity", () => {
  const dataset = [
    { id: "e1", category: "Grocery", amount: 145, paid: 100, balance: 45, status: "Partially Paid" },
    { id: "e2", category: "Petrol", amount: 80, paid: 80, balance: 0, status: "Paid" },
    { id: "e3", category: "Transport", amount: 450, paid: 450, balance: 0, status: "Paid" },
    { id: "e4", category: "Stationery", amount: 200, paid: 0, balance: 200, status: "Cancelled", cancelled: true },
  ].map((e, i) => normalizeExpense(e, i));

  const metrics = calculateExpenseMetrics(dataset);

  // Cancelled record (Stationery ₹200) MUST NOT be in active total
  assert.equal(metrics.totalExpenses, 675, "Cancelled expense must not inflate total");
  assert.equal(metrics.transactionCount, 3, "Cancelled expense must not increment active transaction count");
  assert.equal(metrics.categoryBreakdown.length, 3, "Only active categories should appear in breakdown");
  assert.ok(!metrics.categoryBreakdown.some((c) => c.category === "Stationery"));

  // Grocery is partially paid: category total is full amount (₹145), paidTotal is ₹630, balanceTotal is ₹45
  assert.equal(metrics.paidTotal, 630);
  assert.equal(metrics.balanceTotal, 45);
  const groceryCat = metrics.categoryBreakdown.find((c) => c.category === "Grocery");
  assert.equal(groceryCat.total, 145, "Partial payment does not reduce total category expense");
});

test("7. Category Summary Print Document Generation", () => {
  const dataset = [
    { id: "e1", category: "Grocery", amount: 145 },
    { id: "e2", category: "Petrol", amount: 80 },
    { id: "e3", category: "Transport", amount: 450 },
  ].map((e, i) => normalizeExpense(e, i));

  const metrics = calculateExpenseMetrics(dataset);
  const rows = metrics.categoryBreakdown.map((cat, idx) => ({
    index: idx + 1,
    category: cat.category,
    count: cat.count,
    total: cat.total,
    percentage: `${cat.percentage.toFixed(2)}%`,
  }));

  const html = buildUnifiedDocumentHtml({
    title: "Expense Category Report",
    documentNumber: "EXP-CAT-202611",
    date: "13/11/2026",
    status: `${metrics.categoryBreakdown.length} Categories`,
    partyName: "All Parties / General",
    columns: [
      { key: "index", label: "#", align: "center", width: "50px" },
      { key: "category", label: "Expense Category", align: "left" },
      { key: "count", label: "Transactions", align: "center", width: "110px" },
      { key: "total", label: "Total Amount", align: "right", width: "140px", formatMoney: true },
      { key: "percentage", label: "% of Total", align: "right", width: "100px" },
    ],
    rows,
    totals: {
      subtotal: metrics.totalExpenses,
      total: metrics.totalExpenses,
    },
    notes: "Period: 01/11/2026 to 30/11/2026 | Categories: 3 | Transactions: 3 | Total Allocation: 100.00%",
  });

  assert.ok(html.includes("Expense Category Report"), "Document must contain title");
  assert.ok(html.includes("Grocery"), "Document must contain Grocery");
  assert.ok(html.includes("Petrol"), "Document must contain Petrol");
  assert.ok(html.includes("Transport"), "Document must contain Transport");
  assert.ok(html.includes("675"), "Document must contain grand total 675");
  assert.ok(html.includes("66.67%"), "Document must contain Transport percentage");
  assert.ok(html.includes("21.48%"), "Document must contain Grocery percentage");
  assert.ok(html.includes("11.85%"), "Document must contain Petrol percentage");
  assert.ok(html.includes("100.00%"), "Document must contain total allocation percentage");
});
