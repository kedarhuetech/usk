const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateLoanEmi(principal, annualRate, tenureMonths) {
  const amount = Number(principal);
  const rate = Number(annualRate);
  const months = Number(tenureMonths);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(months) || months <= 0) return 0;
  if (rate === 0) return roundMoney(amount / months);
  const monthlyRate = rate / 1200;
  return roundMoney(amount * monthlyRate / (1 - (1 + monthlyRate) ** -months));
}

export function calculateLoanOutstanding(loan) {
  const principalPaid = (loan.repayments || []).reduce((total, repayment) => total + Math.round(Number(repayment.principalPaid || 0) * 100), 0);
  return Math.max(0, roundMoney((Math.round(Number(loan.originalAmount || 0) * 100) - principalPaid) / 100));
}

export function loanEmi(loan) {
  const override = Number(loan.emiOverride);
  return Number.isFinite(override) && override > 0 ? roundMoney(override) : calculateLoanEmi(loan.originalAmount, loan.annualInterestRate, loan.tenureMonths);
}

export function estimateUpcomingEmiDate(loan) {
  const [year, month, day] = String(loan.firstEmiDate || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const paidInstallments = (loan.repayments || []).length;
  const targetMonth = month - 1 + paidInstallments;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function validateLoan(loan = {}) {
  if (!String(loan.loanName || "").trim()) return "Loan name is required.";
  if (String(loan.loanName).trim().length > 120) return "Loan name must be 120 characters or fewer.";
  if (!String(loan.lenderName || "").trim()) return "Lender or bank name is required.";
  if (String(loan.lenderName).trim().length > 160) return "Lender name must be 160 characters or fewer.";
  const principal = Number(loan.originalAmount);
  if (!Number.isFinite(principal) || principal <= 0 || principal > 999999999999) return "Enter an original loan amount greater than zero.";
  const rate = Number(loan.annualInterestRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return "Annual interest rate must be between 0% and 100%.";
  if (!validDate(loan.startDate)) return "Enter a valid loan start date.";
  if (!Number.isInteger(Number(loan.tenureMonths)) || Number(loan.tenureMonths) < 1 || Number(loan.tenureMonths) > 1200) return "Loan tenure must be between 1 and 1,200 months.";
  if (loan.repaymentFrequency !== "Monthly") return "Monthly repayment frequency is currently supported.";
  if (!validDate(loan.firstEmiDate)) return "Enter a valid first EMI date.";
  if (loan.emiOverride !== "" && loan.emiOverride !== null && loan.emiOverride !== undefined) {
    const override = Number(loan.emiOverride);
    if (!Number.isFinite(override) || override <= 0) return "EMI override must be greater than zero, or left blank.";
  }
  if (loan.notes && String(loan.notes).length > 1000) return "Notes must be 1,000 characters or fewer.";
  return "";
}

export function validateRepayment(repayment = {}, loan) {
  if (!validDate(repayment.paymentDate)) return "Enter a valid payment date.";
  const amount = Number(repayment.amountPaid);
  const principal = Number(repayment.principalPaid);
  if (!Number.isFinite(amount) || amount <= 0) return "Total amount paid must be greater than zero.";
  if (!Number.isFinite(principal) || principal < 0) return "Enter the principal portion paid (zero or more).";
  if (Math.round(principal * 100) > Math.round(amount * 100)) return "Principal paid cannot exceed the total amount paid.";
  if (Math.round(principal * 100) > Math.round(calculateLoanOutstanding(loan) * 100)) return "Principal paid cannot exceed the outstanding principal.";
  if (repayment.reference && String(repayment.reference).length > 120) return "Reference must be 120 characters or fewer.";
  if (repayment.notes && String(repayment.notes).length > 500) return "Repayment notes must be 500 characters or fewer.";
  return "";
}

export function summarizeLoans(loans = []) {
  const active = loans.filter((loan) => loan.status === "Active");
  return {
    outstanding: roundMoney(active.reduce((sum, loan) => sum + calculateLoanOutstanding(loan), 0)),
    activeCount: active.length,
    monthlyEmi: roundMoney(active.reduce((sum, loan) => sum + loanEmi(loan), 0)),
  };
}

export function formatLoanAmount(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
