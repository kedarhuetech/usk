import { businessGrowthApi } from "./apiClient.js";

export const BANK_ACCOUNTS_RESOURCE = "bank-accounts";
export const BANK_TRANSACTIONS_RESOURCE = "bank-transactions";

export function listBankAccounts() {
  return businessGrowthApi.list(BANK_ACCOUNTS_RESOURCE);
}

export function listBankTransactions() {
  return businessGrowthApi.list(BANK_TRANSACTIONS_RESOURCE);
}

export function saveBankAccount(account) {
  const storedAccount = { ...account };
  delete storedAccount.currentBalance;
  return businessGrowthApi.save(BANK_ACCOUNTS_RESOURCE, storedAccount);
}

export function saveBankTransaction(transaction) {
  return businessGrowthApi.save(BANK_TRANSACTIONS_RESOURCE, transaction);
}

function asPaise(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function calculateBankBalances(accounts = [], transactions = []) {
  const totals = new Map(accounts.map((account) => [account.id, asPaise(account.openingBalance)]));
  for (const transaction of transactions) {
    const amount = asPaise(transaction.amount);
    if (!totals.has(transaction.accountId) || amount <= 0) continue;
    const multiplier = transaction.type === "money-in" ? 1 : transaction.type === "money-out" ? -1 : 0;
    totals.set(transaction.accountId, totals.get(transaction.accountId) + multiplier * amount);
  }
  return accounts.map((account) => ({
    ...account,
    currentBalance: (totals.get(account.id) || 0) / 100,
  }));
}

export function maskAccountNumber(accountNumber = "") {
  const digits = String(accountNumber).replace(/\D/g, "");
  return digits ? `•••• ${digits.slice(-4)}` : "—";
}

export function formatBankAmount(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

export function validateBankAccount(account = {}) {
  if (!String(account.accountName || "").trim()) return "Account name is required.";
  if (!String(account.bankName || "").trim()) return "Bank name is required.";
  if (!/^\d{6,20}$/.test(String(account.accountNumber || "").replace(/\s/g, ""))) return "Enter an account number with 6 to 20 digits.";
  if (account.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(account.ifsc).trim().toUpperCase())) return "Enter a valid 11-character IFSC code.";
  if (account.openingBalance === "" || !Number.isFinite(Number(account.openingBalance)) || Number(account.openingBalance) < 0) return "Opening balance must be zero or greater.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(account.openingBalanceDate || ""))) return "Opening balance date is required.";
  return "";
}

export function validateBankTransaction(transaction = {}) {
  if (!String(transaction.accountId || "")) return "Select a bank account.";
  if (!["money-in", "money-out"].includes(transaction.type)) return "Choose Money In or Money Out.";
  if (!Number.isFinite(Number(transaction.amount)) || Number(transaction.amount) <= 0) return "Amount must be greater than zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(transaction.date || ""))) return "Transaction date is required.";
  if (!String(transaction.description || "").trim()) return "Description is required.";
  return "";
}
