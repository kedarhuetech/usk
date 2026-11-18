import { calculateLoanEmi, calculateLoanOutstanding, validateLoan, validateRepayment } from "./loanAccounts.js";
import { cashBankDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { getActiveBusinessId } from "../config/businessConfig.js";

export const LOAN_ACCOUNTS_STORAGE_KEY = "usv.loanAccounts.v1";

export function getLoanAccountsStorageKey() {
  const companyId = getActiveBusinessId();
  return companyId ? `${LOAN_ACCOUNTS_STORAGE_KEY}:${encodeURIComponent(companyId)}` : LOAN_ACCOUNTS_STORAGE_KEY;
}

const storageKey = getLoanAccountsStorageKey;

function localStorageRef() {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser local storage is unavailable.");
  return window.localStorage;
}

function normalizeLoan(loan) {
  if (!loan || typeof loan !== "object") return null;
  const id = String(loan.id || "").trim();
  if (!id) return null;
  const todayStr = new Date().toISOString().slice(0, 10);

  const originalAmount = Number(loan.originalAmount ?? loan.principalAmount ?? loan.principal_amount ?? 0);
  const annualInterestRate = Number(loan.annualInterestRate ?? loan.interestRate ?? loan.interest_rate ?? 0);
  const tenureMonths = Number(loan.tenureMonths ?? loan.termMonths ?? loan.term_months ?? 12);
  const estimatedEmi = calculateLoanEmi(originalAmount, annualInterestRate, tenureMonths);

  // An explicit override exists ONLY if explicitly provided and differs from the mathematical estimate
  let emiOverride = "";
  if (loan.emiOverride !== undefined && loan.emiOverride !== null && loan.emiOverride !== "") {
    const num = parseFloat(loan.emiOverride);
    if (Number.isFinite(num) && num > 0 && Math.abs(num - estimatedEmi) >= 0.01) {
      emiOverride = num;
    }
  } else if (loan.emiAmount || loan.emi_amount) {
    const rawVal = parseFloat(loan.emiAmount ?? loan.emi_amount);
    if (Number.isFinite(rawVal) && rawVal > 0 && Math.abs(rawVal - estimatedEmi) >= 0.01) {
      emiOverride = rawVal;
    }
  }

  const emiAmount = (emiOverride && Number(emiOverride) > 0) ? Number(emiOverride) : estimatedEmi;

  const repayments = Array.isArray(loan.repayments)
    ? loan.repayments.map((r) => ({
        id: r.id,
        loanId: r.loanId || loan.id,
        paymentDate: r.paymentDate ? String(r.paymentDate).slice(0, 10) : todayStr,
        amountPaid: Number(r.amountPaid || 0),
        principalPaid: Number(r.principalPaid || 0),
        interestPaid: Number(r.interestPaid || 0),
        reference: String(r.reference || ""),
        notes: String(r.notes || ""),
      }))
    : [];

  return {
    ...loan,
    id,
    loanName: loan.loanName || loan.accountName || loan.account_name || "Loan Account",
    lenderName: loan.lenderName || loan.lender_name || "Lender",
    originalAmount,
    annualInterestRate,
    tenureMonths,
    emiOverride,
    emiAmount,
    startDate: loan.startDate ? String(loan.startDate).slice(0, 10) : todayStr,
    firstEmiDate: loan.firstEmiDate ? String(loan.firstEmiDate).slice(0, 10) : todayStr,
    repaymentFrequency: loan.repaymentFrequency || loan.loanType || loan.loan_type || "Monthly",
    status: ["Active", "Closed"].includes(loan.status) ? loan.status : "Active",
    repayments,
    statusHistory: Array.isArray(loan.statusHistory) && loan.statusHistory.length ? loan.statusHistory : [event(loan.status || "Active")],
    notes: String(loan.notes || ""),
  };
}

function readLoans() {
  try {
    const parsed = JSON.parse(localStorageRef().getItem(storageKey()) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeLoan).filter(Boolean) : [];
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
  if (isDatabaseMode()) {
    try {
      const res = await cashBankDb.getLoanAccounts();
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list)) {
        const mapped = list.map(normalizeLoan).filter(Boolean);
        writeLoans(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn("[LoanAccounts] Failed to fetch from MySQL:", err.message);
    }
  }
  return readLoans().sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

export async function getLoanById(id) {
  return readLoans().find((loan) => loan.id === id) || null;
}

export async function createLoan(loan) {
  const normalized = { ...loan, loanName: String(loan.loanName || "").trim(), lenderName: String(loan.lenderName || "").trim(), originalAmount: Number(loan.originalAmount), annualInterestRate: Number(loan.annualInterestRate), tenureMonths: Number(loan.tenureMonths), emiOverride: loan.emiOverride === "" || loan.emiOverride == null ? "" : Number(loan.emiOverride), notes: String(loan.notes || "").trim(), repaymentFrequency: loan.repaymentFrequency || "Monthly", status: (loan.status && ["Active", "Closed"].includes(loan.status)) ? loan.status : "Active" };
  const validation = validateLoan(normalized);
  if (validation) throw new Error(validation);
  const loans = readLoans();
  const id = loan.id || crypto.randomUUID();
  if (loans.some((entry) => entry.id === id)) throw new Error("This loan was already saved.");
  const now = new Date().toISOString();
  const saved = { ...normalized, id, repayments: [], statusHistory: [event(normalized.status)], createdAt: now, updatedAt: now };

  if (isDatabaseMode()) {
    const estimatedEmi = calculateLoanEmi(saved.originalAmount, saved.annualInterestRate, saved.tenureMonths);
    const emiToStore = (saved.emiOverride !== "" && Number(saved.emiOverride) > 0) ? Number(saved.emiOverride) : estimatedEmi;

    await cashBankDb.saveLoanAccount({
      id: saved.id,
      accountName: saved.loanName,
      lenderName: saved.lenderName,
      accountNumber: saved.id.slice(0, 8),
      loanType: saved.repaymentFrequency || "Monthly",
      principalAmount: parseFloat(saved.originalAmount) || 0,
      currentBalance: parseFloat(saved.originalAmount) || 0,
      interestRate: parseFloat(saved.annualInterestRate) || 0,
      termMonths: parseInt(saved.tenureMonths, 10) || 12,
      emiAmount: emiToStore,
      startDate: saved.startDate || null,
    });
  }
  writeLoans([saved, ...loans]);
  return saved;
}

export async function updateLoan(id, changes) {
  let loans = readLoans();
  let index = loans.findIndex((loan) => loan.id === id);
  if (index < 0) {
    const all = await getAllLoans();
    index = all.findIndex((loan) => loan.id === id);
    loans = all;
  }
  if (index < 0) throw new Error("Loan account not found.");
  const nextStatus = changes.status && ["Active", "Closed"].includes(changes.status) ? changes.status : loans[index].status;
  const statusHistory = nextStatus !== loans[index].status ? [...(loans[index].statusHistory || []), event(nextStatus)] : (loans[index].statusHistory || [event(loans[index].status)]);
  const editable = Object.fromEntries(Object.entries(changes).filter(([key]) => !["id", "repayments", "statusHistory", "createdAt", "updatedAt"].includes(key)));
  const nextOverride = Object.hasOwn(editable, "emiOverride") ? (editable.emiOverride === "" || editable.emiOverride == null ? "" : Number(editable.emiOverride)) : loans[index].emiOverride;
  const updated = { ...loans[index], ...editable, status: nextStatus, statusHistory, originalAmount: Number(editable.originalAmount ?? loans[index].originalAmount), annualInterestRate: Number(editable.annualInterestRate ?? loans[index].annualInterestRate), tenureMonths: Number(editable.tenureMonths ?? loans[index].tenureMonths), emiOverride: nextOverride, updatedAt: new Date().toISOString() };
  const validation = validateLoan(updated);
  if (validation) throw new Error(validation);
  const previouslyPaid = (loans[index].repayments || []).reduce((sum, repayment) => sum + Math.round(Number(repayment.principalPaid || 0) * 100), 0);
  if (Math.round(updated.originalAmount * 100) < previouslyPaid) throw new Error("Original amount cannot be lower than principal already repaid.");
  loans[index] = updated;
  if (isDatabaseMode()) {
    try {
      const estimatedEmi = calculateLoanEmi(updated.originalAmount, updated.annualInterestRate, updated.tenureMonths);
      const emiToStore = (updated.emiOverride !== "" && Number(updated.emiOverride) > 0) ? Number(updated.emiOverride) : estimatedEmi;

      await cashBankDb.saveLoanAccount({
        id: updated.id,
        accountName: updated.loanName,
        lenderName: updated.lenderName,
        accountNumber: updated.accountNumber || updated.id.slice(0, 8),
        loanType: updated.repaymentFrequency || "Monthly",
        principalAmount: parseFloat(updated.originalAmount) || 0,
        currentBalance: parseFloat(calculateLoanOutstanding(updated)) || 0,
        interestRate: parseFloat(updated.annualInterestRate) || 0,
        termMonths: parseInt(updated.tenureMonths, 10) || 12,
        emiAmount: emiToStore,
        startDate: updated.startDate || null,
      });
    } catch (dbErr) {
      console.warn("[LoanAccounts] Failed to sync update to MySQL:", dbErr.message);
    }
  }
  writeLoans(loans);
  return updated;
}

export async function getRepayments(loanId) {
  if (isDatabaseMode()) {
    try {
      const remote = await cashBankDb.listRepayments(loanId);
      if (Array.isArray(remote)) {
        return remote.map((r) => ({
          ...r,
          paymentDate: r.paymentDate ? String(r.paymentDate).slice(0, 10) : "",
          amountPaid: Number(r.amountPaid || 0),
          principalPaid: Number(r.principalPaid || 0),
          interestPaid: Number(r.interestPaid || 0),
        }));
      }
    } catch (err) {
      console.warn("[LoanRepayments] Failed to fetch from MySQL:", err.message);
    }
  }
  const loan = await getLoanById(loanId);
  return loan ? [...(loan.repayments || [])].sort((left, right) => String(right.paymentDate).localeCompare(String(left.paymentDate))) : [];
}

export async function recordRepayment(loanId, repayment) {
  let loans = readLoans();
  let index = loans.findIndex((loan) => loan.id === loanId);
  if (index < 0) {
    const all = await getAllLoans();
    index = all.findIndex((loan) => loan.id === loanId);
    loans = all;
  }
  if (index < 0) throw new Error("Loan account not found.");
  const loan = loans[index];
  if (loan.status !== "Active") throw new Error("Repayments cannot be added to a closed loan.");
  const id = repayment.id || crypto.randomUUID();
  const existing = (loan.repayments || []).find((entry) => entry.id === id);
  if (existing) return existing;
  const normalized = { ...repayment, id, loanId, amountPaid: Number(repayment.amountPaid), principalPaid: Number(repayment.principalPaid), interestPaid: Math.round((Number(repayment.amountPaid) - Number(repayment.principalPaid)) * 100) / 100, reference: String(repayment.reference || "").trim(), notes: String(repayment.notes || "").trim() };
  const validation = validateRepayment(normalized, loan);
  if (validation) throw new Error(validation);
  normalized.createdAt = new Date().toISOString();

  if (isDatabaseMode()) {
    await cashBankDb.saveRepayment(loanId, normalized);
  }

  loans[index] = { ...loan, repayments: [normalized, ...(loan.repayments || [])], updatedAt: new Date().toISOString() };
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
