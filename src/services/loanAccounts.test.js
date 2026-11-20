import test from "node:test";
import assert from "node:assert/strict";
import { calculateLoanEmi, calculateLoanOutstanding, estimateUpcomingEmiDate, summarizeLoans } from "./loanAccounts.js";
import { closeLoan, createLoan, getAllLoans, getLoanById, getRepayments, recordRepayment, toLoanDbPayload, updateLoan } from "./loanAccountsRepository.js";
import { getLoanAccountsStorageKey, LOAN_ACCOUNTS_STORAGE_KEY } from "./loanAccountsRepository.js";
import { cashBankDb } from "./databaseRepository.js";
import { STORAGE_MODE_KEY } from "./dataStorageConfig.js";

const validLoan = (overrides = {}) => ({
  loanName: "Equipment Loan",
  lenderName: "Local Bank",
  originalAmount: 12000,
  annualInterestRate: 0,
  startDate: "2026-10-01",
  tenureMonths: 12,
  repaymentFrequency: "Monthly",
  emiOverride: "",
  firstEmiDate: "2026-11-01",
  notes: "",
  ...overrides,
});

function withLocalStorage(run, { mode = "local" } = {}) {
  const originalWindow = globalThis.window;
  const values = new Map();
  values.set(STORAGE_MODE_KEY, mode);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  return Promise.resolve()
    .then(() => run(values))
    .finally(() => {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    });
}

test("EMI supports zero interest and standard reducing-balance calculation", () => {
  assert.equal(calculateLoanEmi(12000, 0, 12), 1000);
  assert.equal(calculateLoanEmi(100000, 12, 12), 8884.88);
  assert.equal(calculateLoanEmi(100, 0, 0), 0);
});

test("outstanding principal subtracts only recorded principal and estimates EMI date", () => {
  const loan = { originalAmount: 12000, firstEmiDate: "2026-01-31", repayments: [{ principalPaid: 1000 }, { principalPaid: 500 }] };
  assert.equal(calculateLoanOutstanding(loan), 10500);
  assert.equal(estimateUpcomingEmiDate(loan), "2026-03-31");
  assert.equal(estimateUpcomingEmiDate({ firstEmiDate: "2026-01-31", repayments: [{}] }), "2026-02-28");
});

test("toLoanDbPayload formats loan model for backend and MySQL schema", () => {
  const payload = toLoanDbPayload({
    id: "test-loan-db",
    loanName: "Machinery Loan",
    lenderName: "SBI",
    originalAmount: 50000,
    annualInterestRate: 10,
    tenureMonths: 24,
    emiOverride: "",
    repaymentFrequency: "Monthly",
    startDate: "2026-01-01",
    status: "Closed",
    closedDate: "2026-11-20",
  });
  assert.equal(payload.id, "test-loan-db");
  assert.equal(payload.accountName, "Machinery Loan");
  assert.equal(payload.status, "Closed");
  assert.equal(payload.closedDate, "2026-11-20");
  assert.equal(payload.principalAmount, 50000);
  assert.equal(payload.interestRate, 10);
});

test("offline mode: loan creation persists; edit retains repayment history; repayment splits principal and interest", async () =>
  withLocalStorage(async () => {
    const created = await createLoan({ ...validLoan(), id: "loan-1" });
    assert.equal(created.status, "Active");
    assert.equal((await getAllLoans()).length, 1);
    const payment = { id: "payment-1", paymentDate: "2026-11-01", amountPaid: 1100, principalPaid: 1000, reference: "R-1", notes: "Monthly payment" };
    const savedPayment = await recordRepayment(created.id, payment);
    assert.equal(savedPayment.interestPaid, 100);
    assert.equal(calculateLoanOutstanding(await getLoanById(created.id)), 11000);
    assert.equal((await recordRepayment(created.id, payment)).id, "payment-1");
    assert.equal((await getRepayments(created.id)).length, 1);
    const edited = await updateLoan(created.id, { ...validLoan(), loanName: "Updated Equipment Loan" });
    assert.equal(edited.loanName, "Updated Equipment Loan");
    assert.equal(edited.repayments.length, 1);
    assert.equal((await getLoanById(created.id)).repayments.length, 1);
  }, { mode: "local" }));

test("offline mode: loan status can be updated between Active and Closed and persisted", async () =>
  withLocalStorage(async () => {
    const loan = await createLoan({ ...validLoan(), id: "loan-status-test", status: "Active" });
    assert.equal(loan.status, "Active");

    const closed = await updateLoan(loan.id, { status: "Closed" });
    assert.equal(closed.status, "Closed");
    assert.equal((await getLoanById(loan.id)).status, "Closed");

    const reopened = await updateLoan(loan.id, { status: "Active" });
    assert.equal(reopened.status, "Active");
    assert.equal((await getLoanById(loan.id)).status, "Active");
  }, { mode: "local" }));

test("offline mode: closeLoan marks loan closed, sets closedDate, and retains history", async () =>
  withLocalStorage(async () => {
    const loan = await createLoan({ ...validLoan(), id: "loan-close-offline" });
    assert.equal(loan.status, "Active");

    const closed = await closeLoan(loan.id);
    assert.equal(closed.status, "Closed");
    assert.ok(closed.closedDate, "Must set closedDate");
    assert.equal(closed.statusHistory.length, 2);
    assert.equal(closed.statusHistory[1].status, "Closed");

    const retrieved = await getLoanById(loan.id);
    assert.equal(retrieved.status, "Closed");
    assert.equal(retrieved.closedDate, closed.closedDate);
  }, { mode: "local" }));

test("offline mode: repayments cannot exceed principal and closed loans reject further payments", async () =>
  withLocalStorage(async () => {
    const loan = await createLoan({ ...validLoan(), id: "loan-close" });
    await assert.rejects(() => recordRepayment(loan.id, { id: "bad", paymentDate: "2026-11-01", amountPaid: 12001, principalPaid: 12001 }), /exceed the outstanding/);
    await closeLoan(loan.id);
    await assert.rejects(() => recordRepayment(loan.id, { id: "closed", paymentDate: "2026-11-01", amountPaid: 10, principalPaid: 10 }), /closed loan/);
  }, { mode: "local" }));

test("offline mode: malformed stored data loads safely and summary is calculated from saved records", async () =>
  withLocalStorage(async (values) => {
    const key = getLoanAccountsStorageKey();
    values.set(key, "broken-json");
    values.set(LOAN_ACCOUNTS_STORAGE_KEY, "broken-json");
    assert.deepEqual(await getAllLoans(), []);
    const validJson = JSON.stringify([
      { ...validLoan(), id: "active", status: "Active", repayments: [] },
      { ...validLoan(), id: "closed", status: "Closed", repayments: [] },
      null,
    ]);
    values.set(key, validJson);
    values.set(LOAN_ACCOUNTS_STORAGE_KEY, validJson);
    assert.deepEqual(summarizeLoans(await getAllLoans()), { outstanding: 12000, activeCount: 1, monthlyEmi: 1000 });
  }, { mode: "local" }));

test("database mode: closeLoan persists Closed status and closure date to MySQL", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveLoanAccount;
    const saveCalls = [];
    cashBankDb.saveLoanAccount = async (payload) => {
      saveCalls.push(payload);
      return { success: true, data: payload };
    };

    try {
      const created = await createLoan({ ...validLoan(), id: "db-loan-close-1" });
      assert.equal(saveCalls.length, 1);
      assert.equal(saveCalls[0].status, "Active");

      const closed = await closeLoan(created.id);
      assert.equal(saveCalls.length, 2);
      assert.equal(saveCalls[1].status, "Closed");
      assert.ok(saveCalls[1].closedDate, "Closure date must be sent in payload");
      assert.equal(closed.status, "Closed");
      assert.equal(closed.closedDate, saveCalls[1].closedDate);

      const cached = await getLoanById(created.id);
      assert.equal(cached.status, "Closed");
      assert.equal(cached.closedDate, closed.closedDate);
    } finally {
      cashBankDb.saveLoanAccount = originalSave;
    }
  }, { mode: "database" }));

test("database mode: closeLoan fails and leaves local state unchanged if MySQL fails", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveLoanAccount;
    let callCount = 0;
    cashBankDb.saveLoanAccount = async () => {
      callCount++;
      if (callCount === 1) return { success: true };
      throw new Error("MySQL deadlock on loan_accounts");
    };

    try {
      const created = await createLoan({ ...validLoan(), id: "db-loan-err" });
      assert.equal(created.status, "Active");

      await assert.rejects(
        () => closeLoan(created.id),
        /MySQL deadlock on loan_accounts/
      );

      // Local state must remain Active
      const record = await getLoanById(created.id);
      assert.equal(record.status, "Active");
      assert.equal(record.statusHistory.length, 1);
    } finally {
      cashBankDb.saveLoanAccount = originalSave;
    }
  }, { mode: "database" }));

test("database mode: updateLoan surfaces database errors without mutating local state", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveLoanAccount;
    let callCount = 0;
    cashBankDb.saveLoanAccount = async () => {
      callCount++;
      if (callCount === 1) return { success: true };
      throw new Error("Connection lost during loan update");
    };

    try {
      const created = await createLoan({ ...validLoan(), id: "db-loan-upd-err", loanName: "Original Loan Name" });

      await assert.rejects(
        () => updateLoan(created.id, { loanName: "Should Fail" }),
        /Connection lost during loan update/
      );

      const record = await getLoanById(created.id);
      assert.equal(record.loanName, "Original Loan Name");
    } finally {
      cashBankDb.saveLoanAccount = originalSave;
    }
  }, { mode: "database" }));

test("database mode: getAllLoans preserves Closed status and closedDate from MySQL without resetting to Active", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveLoanAccount;
    const originalGet = cashBankDb.getLoanAccounts;

    cashBankDb.saveLoanAccount = async () => ({ success: true });
    cashBankDb.getLoanAccounts = async () => ({
      success: true,
      data: [
        {
          id: "db-loan-sync",
          accountName: "Enterprise Loan",
          lenderName: "HDFC Bank",
          accountNumber: "ACC123",
          loanType: "Monthly",
          principalAmount: 100000,
          currentBalance: 0,
          interestRate: 8.5,
          termMonths: 24,
          emiAmount: 4500,
          startDate: "2025-01-01",
          status: "Closed",
          closedDate: "2026-11-15",
          repayments: [],
        },
      ],
    });

    try {
      const loaded = await getAllLoans();
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0].id, "db-loan-sync");
      assert.equal(loaded[0].loanName, "Enterprise Loan");
      assert.equal(loaded[0].status, "Closed");
      assert.equal(loaded[0].closedDate, "2026-11-15");

      // Verify that summary excludes the closed loan from active metrics
      const summary = summarizeLoans(loaded);
      assert.equal(summary.activeCount, 0);
      assert.equal(summary.outstanding, 0);
      assert.equal(summary.monthlyEmi, 0);
    } finally {
      cashBankDb.saveLoanAccount = originalSave;
      cashBankDb.getLoanAccounts = originalGet;
    }
  }, { mode: "database" }));
