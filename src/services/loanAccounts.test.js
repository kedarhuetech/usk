import test from "node:test";
import assert from "node:assert/strict";
import { calculateLoanEmi, calculateLoanOutstanding, estimateUpcomingEmiDate, summarizeLoans } from "./loanAccounts.js";
import { closeLoan, createLoan, getAllLoans, getLoanById, getRepayments, recordRepayment, updateLoan } from "./loanAccountsRepository.js";
import { LOAN_ACCOUNTS_STORAGE_KEY } from "./loanAccountsRepository.js";

const validLoan = (overrides = {}) => ({ loanName: "Equipment Loan", lenderName: "Local Bank", originalAmount: 12000, annualInterestRate: 0, startDate: "2026-10-01", tenureMonths: 12, repaymentFrequency: "Monthly", emiOverride: "", firstEmiDate: "2026-11-01", notes: "", ...overrides });

function withLocalStorage(run) {
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  return Promise.resolve().then(() => run(values)).finally(() => {
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

test("loan creation persists; edit retains repayment history; repayment splits principal and interest", async () => withLocalStorage(async () => {
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
}));

test("repayments cannot exceed principal and closed loans reject further payments", async () => withLocalStorage(async () => {
  const loan = await createLoan({ ...validLoan(), id: "loan-close" });
  await assert.rejects(() => recordRepayment(loan.id, { id: "bad", paymentDate: "2026-11-01", amountPaid: 12001, principalPaid: 12001 }), /exceed the outstanding/);
  await closeLoan(loan.id);
  await assert.rejects(() => recordRepayment(loan.id, { id: "closed", paymentDate: "2026-11-01", amountPaid: 10, principalPaid: 10 }), /closed loan/);
}));

test("malformed stored data loads safely and summary is calculated from saved records", async () => withLocalStorage(async (values) => {
  values.set(LOAN_ACCOUNTS_STORAGE_KEY, "broken-json");
  assert.deepEqual(await getAllLoans(), []);
  values.set(LOAN_ACCOUNTS_STORAGE_KEY, JSON.stringify([
    { ...validLoan(), id: "active", status: "Active", repayments: [] },
    { ...validLoan(), id: "closed", status: "Closed", repayments: [] },
    null,
  ]));
  assert.deepEqual(summarizeLoans(await getAllLoans()), { outstanding: 12000, activeCount: 1, monthlyEmi: 1000 });
}));
