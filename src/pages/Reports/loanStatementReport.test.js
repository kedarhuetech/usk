import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYMD,
  roundMoney,
  buildLoanStatementEntries,
  calculateLoanOpeningBalance,
  computeRunningBalances,
  filterLoanStatementEntries,
  calculateLoanStatementSummary,
} from "../../utils/loanStatementCalculations.js";

const sampleLoans = [
  {
    id: "loan-1",
    loanName: "Machinery Loan",
    lenderName: "HDFC Bank",
    originalAmount: 100000,
    annualInterestRate: 10,
    startDate: "2026-01-15",
    tenureMonths: 24,
    status: "Active",
    repayments: [
      {
        id: "rep-1",
        paymentDate: "2026-02-15",
        amountPaid: 5000,
        principalPaid: 4000,
        interestPaid: 1000,
        reference: "EMI-01",
        notes: "First EMI",
      },
      {
        id: "rep-2",
        paymentDate: "2026-03-15",
        amountPaid: 5000,
        principalPaid: 4100,
        interestPaid: 900,
        reference: "EMI-02",
        notes: "Second EMI",
      },
    ],
  },
  {
    id: "loan-2",
    loanName: "Working Capital Loan",
    lenderName: "SBI Bank",
    originalAmount: 50000,
    annualInterestRate: 12,
    startDate: "2026-02-01",
    tenureMonths: 12,
    status: "Active",
    repayments: [
      {
        id: "rep-3",
        paymentDate: "2026-03-01",
        amountPaid: 4500,
        principalPaid: 4000,
        interestPaid: 500,
        reference: "SBI-01",
        notes: "First payment",
      },
    ],
  },
];

test("Rule 1: Loan received increases outstanding principal", () => {
  const entries = buildLoanStatementEntries([sampleLoans[0]]);
  const running = computeRunningBalances(entries, 0);

  const loanReceived = running.find((e) => e.transactionType === "Loan Received");
  assert.equal(loanReceived.principalAmount, 100000);
  assert.equal(loanReceived.balance, 100000);
});

test("Rule 2: Principal repayment decreases outstanding principal", () => {
  const entries = buildLoanStatementEntries([sampleLoans[0]]);
  const running = computeRunningBalances(entries, 0);

  // Initial: 100,000
  // Repayment 1 (Feb 15): 4,000 principal paid -> Balance 96,000
  const rep1 = running.find((e) => e.reference === "EMI-01");
  assert.equal(rep1.principalAmount, 4000);
  assert.equal(rep1.balance, 96000);

  // Repayment 2 (Mar 15): 4,100 principal paid -> Balance 91,900
  const rep2 = running.find((e) => e.reference === "EMI-02");
  assert.equal(rep2.principalAmount, 4100);
  assert.equal(rep2.balance, 91900);
});

test("Rule 3: Interest payment does not decrease principal", () => {
  const entries = buildLoanStatementEntries([sampleLoans[0]]);
  const running = computeRunningBalances(entries, 0);

  const rep1 = running.find((e) => e.reference === "EMI-01");
  assert.equal(rep1.interestAmount, 1000);
  // Total paid was 5000, but only principal (4000) reduced balance: 100000 - 4000 = 96000
  assert.equal(rep1.balance, 96000);
});

test("Rule 4: Multiple loans display together or can be filtered by specific loan", () => {
  const allEntries = buildLoanStatementEntries(sampleLoans, "All");
  // Total entries: loan-1 (received + 2 repayments) + loan-2 (received + 1 repayment) = 5
  assert.equal(allEntries.length, 5);

  const filteredLoan1 = buildLoanStatementEntries(sampleLoans, "loan-1");
  assert.equal(filteredLoan1.length, 3);
  assert.ok(filteredLoan1.every((e) => e.loanId === "loan-1"));
});

test("Rule 5: Date filters calculate opening and closing balances correctly", () => {
  // Let's filter for March 2026 (2026-03-01 to 2026-03-31)
  // Prior to March:
  // Loan-1 received: 100,000 (Jan 15)
  // Loan-1 rep 1: 4,000 (Feb 15)
  // Loan-2 received: 50,000 (Feb 01)
  // Expected Opening Balance on 2026-03-01: 100,000 - 4,000 + 50,000 = 146,000
  const opening = calculateLoanOpeningBalance(sampleLoans, "2026-03-01", "All");
  assert.equal(opening, 146000);

  // Activity in March:
  // Loan-2 rep 1: 4,000 principal (Mar 01)
  // Loan-1 rep 2: 4,100 principal (Mar 15)
  const allEntries = buildLoanStatementEntries(sampleLoans, "All");
  const filtered = filterLoanStatementEntries(allEntries, { from: "2026-03-01", to: "2026-03-31" });
  assert.equal(filtered.length, 2);

  const summary = calculateLoanStatementSummary(filtered, opening);
  assert.equal(summary.openingPrincipalBalance, 146000);
  assert.equal(summary.totalLoanReceived, 0);
  assert.equal(summary.totalPrincipalRepaid, 8100); // 4000 + 4100
  assert.equal(summary.totalInterestPaid, 1400); // 500 + 900
  // Closing = Opening (146000) + Received (0) - Repaid (8100) = 137,900
  assert.equal(summary.outstandingPrincipalBalance, 137900);
});

test("Rule 6: Text search correctly filters entries", () => {
  const allEntries = buildLoanStatementEntries(sampleLoans, "All");
  const searchedSBI = filterLoanStatementEntries(allEntries, { search: "SBI" });
  assert.equal(searchedSBI.length, 2);
  assert.ok(searchedSBI.every((e) => e.lenderName === "SBI Bank"));

  const searchedEMI = filterLoanStatementEntries(allEntries, { search: "EMI-01" });
  assert.equal(searchedEMI.length, 1);
  assert.equal(searchedEMI[0].reference, "EMI-01");
});

test("Rule 7: Fully repaid loan results in zero outstanding balance", () => {
  const zeroLoan = {
    id: "loan-zero",
    loanName: "Paid Off Loan",
    lenderName: "Local Credit",
    originalAmount: 10000,
    startDate: "2026-01-01",
    status: "Closed",
    repayments: [
      {
        id: "rep-full",
        paymentDate: "2026-01-10",
        amountPaid: 10500,
        principalPaid: 10000,
        interestPaid: 500,
        reference: "FULL-PAY",
      },
    ],
  };

  const entries = buildLoanStatementEntries([zeroLoan]);
  const running = computeRunningBalances(entries, 0);
  assert.equal(running[0].balance, 10000);
  assert.equal(running[1].balance, 0);

  const summary = calculateLoanStatementSummary(running, 0);
  assert.equal(summary.outstandingPrincipalBalance, 0);
});
