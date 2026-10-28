import { calculateLoanOutstanding, validateLoan, validateRepayment } from "./loanAccounts.js";

export const LOAN_ACCOUNTS_STORAGE_KEY = "usv.loanAccounts.v1";

function storageKey() {
  const companyId = String(import.meta.env?.VITE_BUSINESS_ID || "").trim();
  return companyId ? `${LOAN_ACCOUNTS_STORAGE_KEY}:${encodeURIComponent(companyId)}` : LOAN_ACCOUNTS_STORAGE_KEY;
}

function localStorageRef() {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser local storage is unavailable.");
  return window.localStorage;
}

function readLoans() {
  try {
    const parsed = JSON.parse(localStorageRef().getItem(storageKey()) || "[]");
    return Array.isArray(parsed) ? parsed.filter((loan) => loan && typeof loan.id === "string" && loan.id.trim() && ["Active", "Closed"].includes(loan.status) && Array.isArray(loan.repayments) && !validateLoan(loan)) : [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function writeLoans(loans) {
  localStorageRef().setItem(storageKey(), JSON.stringify(loans));
}

const event = (status) => ({ status, at: new Date().toISOString() });

export async function getAllLoans() {
  return readLoans().sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

export async function getLoanById(id) {
  return readLoans().find((loan) => loan.id === id) || null;
}

export async function createLoan(loan) {
  const normalized = { ...loan, loanName: String(loan.loanName || "").trim(), lenderName: String(loan.lenderName || "").trim(), originalAmount: Number(loan.originalAmount), annualInterestRate: Number(loan.annualInterestRate), tenureMonths: Number(loan.tenureMonths), emiOverride: loan.emiOverride === "" || loan.emiOverride == null ? "" : Number(loan.emiOverride), notes: String(loan.notes || "").trim(), repaymentFrequency: loan.repaymentFrequency || "Monthly", status: "Active" };
  const validation = validateLoan(normalized);
  if (validation) throw new Error(validation);
  const loans = readLoans();
  const id = loan.id || crypto.randomUUID();
  if (loans.some((entry) => entry.id === id)) throw new Error("This loan was already saved.");
  const now = new Date().toISOString();
  const saved = { ...normalized, id, repayments: [], statusHistory: [event("Active")], createdAt: now, updatedAt: now };
  writeLoans([saved, ...loans]);
  return saved;
}

export async function updateLoan(id, changes) {
  const loans = readLoans();
  const index = loans.findIndex((loan) => loan.id === id);
  if (index < 0) throw new Error("Loan account not found.");
  if (loans[index].status !== "Active") throw new Error("Closed loans cannot be edited.");
  const editable = Object.fromEntries(Object.entries(changes).filter(([key]) => !["id", "status", "repayments", "statusHistory", "createdAt", "updatedAt"].includes(key)));
  const nextOverride = Object.hasOwn(editable, "emiOverride") ? (editable.emiOverride === "" || editable.emiOverride == null ? "" : Number(editable.emiOverride)) : loans[index].emiOverride;
  const updated = { ...loans[index], ...editable, originalAmount: Number(editable.originalAmount ?? loans[index].originalAmount), annualInterestRate: Number(editable.annualInterestRate ?? loans[index].annualInterestRate), tenureMonths: Number(editable.tenureMonths ?? loans[index].tenureMonths), emiOverride: nextOverride, updatedAt: new Date().toISOString() };
  const validation = validateLoan(updated);
  if (validation) throw new Error(validation);
  const previouslyPaid = loans[index].repayments.reduce((sum, repayment) => sum + Math.round(Number(repayment.principalPaid || 0) * 100), 0);
  if (Math.round(updated.originalAmount * 100) < previouslyPaid) throw new Error("Original amount cannot be lower than principal already repaid.");
  loans[index] = updated;
  writeLoans(loans);
  return updated;
}

export async function getRepayments(loanId) {
  const loan = await getLoanById(loanId);
  return loan ? [...loan.repayments].sort((left, right) => String(right.paymentDate).localeCompare(String(left.paymentDate))) : [];
}

export async function recordRepayment(loanId, repayment) {
  const loans = readLoans();
  const index = loans.findIndex((loan) => loan.id === loanId);
  if (index < 0) throw new Error("Loan account not found.");
  const loan = loans[index];
  if (loan.status !== "Active") throw new Error("Repayments cannot be added to a closed loan.");
  const id = repayment.id || crypto.randomUUID();
  const existing = loan.repayments.find((entry) => entry.id === id);
  if (existing) return existing;
  const normalized = { ...repayment, id, amountPaid: Number(repayment.amountPaid), principalPaid: Number(repayment.principalPaid), interestPaid: Math.round((Number(repayment.amountPaid) - Number(repayment.principalPaid)) * 100) / 100, reference: String(repayment.reference || "").trim(), notes: String(repayment.notes || "").trim() };
  const validation = validateRepayment(normalized, loan);
  if (validation) throw new Error(validation);
  normalized.createdAt = new Date().toISOString();
  loans[index] = { ...loan, repayments: [...loan.repayments, normalized], updatedAt: new Date().toISOString() };
  writeLoans(loans);
  return normalized;
}

export async function closeLoan(id) {
  const loans = readLoans();
  const index = loans.findIndex((loan) => loan.id === id);
  if (index < 0) throw new Error("Loan account not found.");
  if (loans[index].status === "Closed") return loans[index];
  const closed = { ...loans[index], status: "Closed", statusHistory: [...(loans[index].statusHistory || []), event("Closed")], updatedAt: new Date().toISOString() };
  loans[index] = closed;
  writeLoans(loans);
  return closed;
}

export { calculateLoanOutstanding };
