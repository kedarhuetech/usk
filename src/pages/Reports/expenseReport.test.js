import test from "node:test";
import assert from "node:assert/strict";
import {
  getExpenses,
  saveExpenses,
  getExpenseCategories,
  saveExpenseCategories,
  transactionStorageKeys,
} from "../../services/transactionRepository.js";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  parseYMD,
  formatDateDMY,
  getPresetDateRange,
  normalizeExpense,
  filterExpenses,
  calculateExpenseMetrics,
} from "../../utils/expenseCalculations.js";
import { BACKUP_SOURCES } from "../../services/backupToComputer.js";

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

test("1. Expense records appear correctly in the report", () => {
  setupInMemoryStorage();

  const sampleExpense = {
    id: "exp-001",
    number: "EXP-101",
    category: "Transport",
    party: "City Express Logistics",
    date: "2026-11-10",
    amount: 1500,
    paid: 1500,
    status: "Paid",
    description: "Freight courier for finished goods",
    rows: [
      { id: "r1", item: "Freight Delivery", qty: 1, price: 1500 },
    ],
    payments: [{ id: "p1", type: "Bank Transfer", amount: 1500 }],
    createdAt: "2026-11-10T10:00:00.000Z",
  };

  saveExpenses([sampleExpense]);
  const expenses = getExpenses();

  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].number, "EXP-101");
  assert.equal(expenses[0].category, "Transport");
  assert.equal(expenses[0].party, "City Express Logistics");
  assert.equal(expenses[0].amount, 1500);
  assert.equal(expenses[0].paid, 1500);
  assert.equal(expenses[0].balance, 0);
  assert.equal(expenses[0].status, "Paid");
  assert.equal(expenses[0].paymentMode, "Bank Transfer");
  assert.equal(expenses[0].description, "Freight courier for finished goods");
});

test("2. Actual existing expense categories appear in filters and summaries", () => {
  setupInMemoryStorage();

  // Initially has defaults
  const initialCategories = getExpenseCategories();
  assert.deepEqual(
    initialCategories.sort(),
    [...DEFAULT_EXPENSE_CATEGORIES].sort()
  );

  // When custom categories are saved dynamically
  saveExpenseCategories(["Transport", "Office Supplies", "Tea"]);
  const updatedCategories = getExpenseCategories();
  assert.ok(updatedCategories.includes("Office Supplies"));
  assert.ok(updatedCategories.includes("Transport"));
  assert.ok(updatedCategories.includes("Tea"));

  // Also picks up categories used on records
  saveExpenses([
    {
      id: "exp-002",
      number: "EXP-102",
      category: "Software Subscriptions",
      amount: 4999,
      date: "2026-11-05",
    },
  ]);

  const mergedCategories = getExpenseCategories();
  assert.ok(mergedCategories.includes("Software Subscriptions"));
});

test("3. Date filters calculate correct totals", () => {
  setupInMemoryStorage();

  const exp1 = {
    id: "e1",
    number: "EXP-1",
    date: "2026-11-01",
    category: "Rent",
    amount: 10000,
    paid: 10000,
  };
  const exp2 = {
    id: "e2",
    number: "EXP-2",
    date: "2026-11-12",
    category: "Tea",
    amount: 250,
    paid: 250,
  };
  const exp3 = {
    id: "e3",
    number: "EXP-3",
    date: "2026-10-25",
    category: "Petrol",
    amount: 800,
    paid: 800,
  };

  saveExpenses([exp1, exp2, exp3]);
  const all = getExpenses();

  // Filter for November 2026 only
  const novemberExpenses = filterExpenses(all, {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  assert.equal(novemberExpenses.length, 2);

  const metrics = calculateExpenseMetrics(novemberExpenses);
  assert.equal(metrics.totalExpenses, 10250);
  assert.equal(metrics.transactionCount, 2);

  // Filter for single day
  const singleDay = filterExpenses(all, {
    from: "2026-11-12",
    to: "2026-11-12",
  });
  assert.equal(singleDay.length, 1);
  assert.equal(singleDay[0].amount, 250);
});

test("4. Category filters work correctly", () => {
  setupInMemoryStorage();

  const exp1 = {
    id: "e1",
    number: "EXP-1",
    date: "2026-11-05",
    category: "Transport",
    amount: 1200,
  };
  const exp2 = {
    id: "e2",
    number: "EXP-2",
    date: "2026-11-06",
    category: "Petrol",
    amount: 500,
  };
  const exp3 = {
    id: "e3",
    number: "EXP-3",
    date: "2026-11-07",
    category: "Transport",
    amount: 800,
  };

  saveExpenses([exp1, exp2, exp3]);
  const all = getExpenses();

  const transportOnly = filterExpenses(all, { category: "Transport" });
  assert.equal(transportOnly.length, 2);
  const metrics = calculateExpenseMetrics(transportOnly);
  assert.equal(metrics.totalExpenses, 2000);

  const petrolOnly = filterExpenses(all, { category: "Petrol" });
  assert.equal(petrolOnly.length, 1);
  assert.equal(petrolOnly[0].amount, 500);
});

test("5. Payment-mode filters work correctly", () => {
  setupInMemoryStorage();

  const expCash = {
    id: "e1",
    number: "EXP-1",
    amount: 300,
    payments: [{ type: "Cash", amount: 300 }],
  };
  const expUPI = {
    id: "e2",
    number: "EXP-2",
    amount: 1500,
    payments: [{ type: "UPI", amount: 1500 }],
  };
  const expBank = {
    id: "e3",
    number: "EXP-3",
    amount: 25000,
    payments: [{ type: "Bank Transfer", amount: 25000 }],
  };

  saveExpenses([expCash, expUPI, expBank]);
  const all = getExpenses();

  const cashFiltered = filterExpenses(all, { paymentMode: "Cash" });
  assert.equal(cashFiltered.length, 1);
  assert.equal(cashFiltered[0].number, "EXP-1");

  const upiFiltered = filterExpenses(all, { paymentMode: "UPI" });
  assert.equal(upiFiltered.length, 1);
  assert.equal(upiFiltered[0].number, "EXP-2");

  const bankFiltered = filterExpenses(all, { paymentMode: "Bank Transfer" });
  assert.equal(bankFiltered.length, 1);
  assert.equal(bankFiltered[0].number, "EXP-3");
});

test("6. Search works correctly", () => {
  setupInMemoryStorage();

  const exp1 = {
    id: "e1",
    number: "VOUCHER-99",
    category: "Rent",
    party: "Green Real Estate",
    description: "Office warehouse monthly rent",
    amount: 12000,
  };
  const exp2 = {
    id: "e2",
    number: "EXP-100",
    category: "Tea",
    party: "Sharma Refreshments",
    description: "Morning snacks for staff",
    amount: 350,
  };

  saveExpenses([exp1, exp2]);
  const all = getExpenses();

  // Search by description keyword
  assert.equal(filterExpenses(all, { search: "warehouse" }).length, 1);
  assert.equal(filterExpenses(all, { search: "warehouse" })[0].number, "VOUCHER-99");

  // Search by party name
  assert.equal(filterExpenses(all, { search: "Sharma" }).length, 1);
  assert.equal(filterExpenses(all, { search: "Sharma" })[0].number, "EXP-100");

  // Search by voucher number
  assert.equal(filterExpenses(all, { search: "99" }).length, 1);

  // Search by amount
  assert.equal(filterExpenses(all, { search: "12000" }).length, 1);
});

test("7. Summary totals match transaction totals", () => {
  setupInMemoryStorage();

  const records = [
    {
      id: "e1",
      number: "1",
      category: "Transport",
      amount: 1200,
      paid: 1200,
      payments: [{ type: "Cash", amount: 1200 }],
    },
    {
      id: "e2",
      number: "2",
      category: "Rent",
      amount: 8000,
      paid: 6000,
      payments: [{ type: "Bank Transfer", amount: 6000 }],
    },
    {
      id: "e3",
      number: "3",
      category: "Transport",
      amount: 1800,
      paid: 1800,
      payments: [{ type: "UPI", amount: 1800 }],
    },
  ];

  saveExpenses(records);
  const all = getExpenses();
  const metrics = calculateExpenseMetrics(all);

  // Check aggregate totals
  assert.equal(metrics.totalExpenses, 11000);
  assert.equal(metrics.transactionCount, 3);
  assert.equal(metrics.highestExpense, 8000);
  assert.equal(metrics.averageExpense, 11000 / 3);
  assert.equal(metrics.paidTotal, 9000);
  assert.equal(metrics.balanceTotal, 2000);

  // Check Category Totals sum up to totalExpenses
  const categorySum = metrics.categoryBreakdown.reduce(
    (sum, c) => sum + c.total,
    0
  );
  assert.equal(categorySum, metrics.totalExpenses);

  // Check Payment Mode Totals sum up to totalExpenses
  const paymentModeSum = metrics.paymentModeBreakdown.reduce(
    (sum, m) => sum + m.total,
    0
  );
  assert.equal(paymentModeSum, metrics.totalExpenses);
});

test("8. Editing an expense updates the report", () => {
  setupInMemoryStorage();

  const exp = {
    id: "e1",
    number: "EXP-1",
    category: "Tea",
    amount: 100,
    paid: 100,
  };
  saveExpenses([exp]);
  assert.equal(calculateExpenseMetrics(getExpenses()).totalExpenses, 100);

  // Update expense amount to 250
  const updatedExp = { ...exp, amount: 250, paid: 250 };
  saveExpenses([updatedExp]);

  const refreshed = getExpenses();
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].amount, 250);
  assert.equal(calculateExpenseMetrics(refreshed).totalExpenses, 250);
});

test("9. Deleting an expense removes it from the report", () => {
  setupInMemoryStorage();

  const exp1 = { id: "e1", number: "EXP-1", amount: 500 };
  const exp2 = { id: "e2", number: "EXP-2", amount: 1000 };
  saveExpenses([exp1, exp2]);
  assert.equal(getExpenses().length, 2);

  // Soft delete exp1
  saveExpenses([{ ...exp1, deleted: true }, exp2]);
  const activeOnly = getExpenses();
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].id, "e2");
  assert.equal(calculateExpenseMetrics(activeOnly).totalExpenses, 1000);

  // Complete removal from storage
  saveExpenses([exp2]);
  assert.equal(getExpenses().length, 1);
  assert.equal(getExpenses()[0].id, "e2");
});

test("10. Excel export and printing data readiness", () => {
  setupInMemoryStorage();

  const exp = {
    id: "e1",
    number: "EXP-55",
    date: "2026-11-10",
    category: "Salary",
    party: "Rahul Sharma",
    description: "Advance salary payout",
    amount: 15000,
    paid: 15000,
    status: "Paid",
    payments: [{ type: "Bank Transfer", amount: 15000 }],
    rows: [{ item: "Advance Salary", qty: 1, price: 15000 }],
  };

  saveExpenses([exp]);
  const expenses = getExpenses();
  const metrics = calculateExpenseMetrics(expenses);

  // Verify Excel row format
  const excelRow = [
    formatDateDMY(expenses[0].date),
    expenses[0].number,
    expenses[0].category,
    expenses[0].party,
    expenses[0].paymentMode,
    expenses[0].description,
    expenses[0].status,
    expenses[0].amount,
    expenses[0].paid,
    expenses[0].balance,
  ];
  assert.equal(excelRow[0], "10/11/2026");
  assert.equal(excelRow[1], "EXP-55");
  assert.equal(excelRow[2], "Salary");
  assert.equal(excelRow[7], 15000);
  assert.equal(excelRow[8], 15000);
  assert.equal(excelRow[9], 0);

  // Verify Category Summary export row
  assert.equal(metrics.categoryBreakdown.length, 1);
  assert.equal(metrics.categoryBreakdown[0].category, "Salary");
  assert.equal(metrics.categoryBreakdown[0].total, 15000);
  assert.equal(metrics.categoryBreakdown[0].percentage, 100);

  // Verify backup integration
  const expenseSource = BACKUP_SOURCES.find(
    (s) => s.key === transactionStorageKeys.expenses
  );
  assert.ok(expenseSource, "Expenses key must be included in backup sources");
});

test("11. Empty data displays a proper empty state", () => {
  setupInMemoryStorage();

  const emptyExpenses = getExpenses();
  assert.equal(emptyExpenses.length, 0);

  const metrics = calculateExpenseMetrics(emptyExpenses);
  assert.equal(metrics.totalExpenses, 0);
  assert.equal(metrics.transactionCount, 0);
  assert.equal(metrics.highestExpense, 0);
  assert.equal(metrics.averageExpense, 0);
  assert.equal(metrics.paidTotal, 0);
  assert.equal(metrics.balanceTotal, 0);
  assert.deepEqual(metrics.categoryBreakdown, []);
  assert.deepEqual(metrics.paymentModeBreakdown, []);
});

test("12. No duplicate expenses or double counting occur", () => {
  setupInMemoryStorage({
    [transactionStorageKeys.purchases]: JSON.stringify([
      { id: "pb-1", totalAmount: 40000, type: "Purchase" },
    ]),
    [transactionStorageKeys.paymentOuts]: JSON.stringify([
      { id: "po-1", amount: 20000, type: "Payment-Out" },
    ]),
    [transactionStorageKeys.expenses]: JSON.stringify([
      {
        id: "exp-1",
        number: "EXP-1",
        amount: 500,
        category: "Tea",
        payments: [
          { type: "Cash", amount: 200 },
          { type: "UPI", amount: 300 },
        ],
      },
    ]),
  });

  const expenses = getExpenses();
  assert.equal(expenses.length, 1, "Only expenses should be returned");
  assert.equal(expenses[0].id, "exp-1");

  const metrics = calculateExpenseMetrics(expenses);
  assert.equal(metrics.totalExpenses, 500, "Should not count purchase bills or payment outs");

  // Multi-payment inside one voucher correctly attributes 200 and 300 without double counting
  const cashMode = metrics.paymentModeBreakdown.find((m) => m.mode === "Cash");
  const upiMode = metrics.paymentModeBreakdown.find((m) => m.mode === "UPI");
  assert.equal(cashMode.total, 200);
  assert.equal(upiMode.total, 300);
  assert.equal(cashMode.total + upiMode.total, 500);
});

test("13. Partial payment correctly updates paid, due, and status without reducing expense total", () => {
  setupInMemoryStorage();

  const partialExp = {
    id: "exp-partial-1",
    number: "EXP-P1",
    amount: 5000,
    paid: 2000,
    payments: [{ type: "Cash", amount: 2000 }],
    category: "Rent",
    date: "2026-11-05",
  };

  saveExpenses([partialExp]);
  const expenses = getExpenses();
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].amount, 5000, "Expense amount must remain total 5000");
  assert.equal(expenses[0].paid, 2000, "Paid must be 2000");
  assert.equal(expenses[0].balance, 3000, "Balance must be 3000");
  assert.equal(expenses[0].status, "Partially Paid");

  const metrics = calculateExpenseMetrics(expenses);
  assert.equal(metrics.totalExpenses, 5000);
  assert.equal(metrics.paidTotal, 2000);
  assert.equal(metrics.balanceTotal, 3000);
  assert.equal(metrics.paidTotal + metrics.balanceTotal, metrics.totalExpenses);
});

test("14. Date boundary conditions include both first and last days of month", () => {
  setupInMemoryStorage();

  const firstDay = {
    id: "e-first",
    number: "E-1",
    date: "2026-11-01",
    amount: 100,
  };
  const midDay = {
    id: "e-mid",
    number: "E-15",
    date: "2026-11-15",
    amount: 200,
  };
  const lastDay = {
    id: "e-last",
    number: "E-30",
    date: "2026-11-30",
    amount: 300,
  };

  saveExpenses([firstDay, midDay, lastDay]);
  const all = getExpenses();

  const filtered = filterExpenses(all, {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  assert.equal(filtered.length, 3, "Must include 1st, 15th, and 30th");
  const metrics = calculateExpenseMetrics(filtered);
  assert.equal(metrics.totalExpenses, 600);
});

test("15. Deduplication prevents identical IDs from being counted twice", () => {
  setupInMemoryStorage({
    [transactionStorageKeys.expenses]: JSON.stringify([
      { id: "dup-1", number: "1", amount: 1000, date: "2026-11-01" },
      { id: "dup-1", number: "1", amount: 1000, date: "2026-11-01" },
    ]),
  });

  const expenses = getExpenses();
  assert.equal(expenses.length, 1, "Duplicate ID must be deduplicated to 1 record");
  const metrics = calculateExpenseMetrics(expenses);
  assert.equal(metrics.totalExpenses, 1000);
});

test("16. Cancelled expenses do not add to active total expenses", () => {
  setupInMemoryStorage();

  const activeExp = {
    id: "e-active",
    number: "E-1",
    amount: 1200,
    status: "Paid",
  };
  const cancelledExp = {
    id: "e-cancelled",
    number: "E-2",
    amount: 800,
    status: "Cancelled",
  };

  saveExpenses([activeExp, cancelledExp]);
  const expenses = getExpenses();
  assert.equal(expenses.length, 2);

  const metrics = calculateExpenseMetrics(expenses);
  assert.equal(metrics.totalExpenses, 1200, "Cancelled expense must not add to total expenses");
  assert.equal(metrics.transactionCount, 1, "Active transaction count must exclude cancelled");
});
