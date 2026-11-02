// Balance sheet persistence boundary. Replace this adapter with API calls without
// changing the accounting functions or report components.
import { listBankAccounts, listBankTransactions } from "./bankAccounts.js";
import { getAllLoans } from "./loanAccountsRepository.js";
export const BALANCE_SHEET_ACCOUNTS_KEY = "usv.balanceSheetAccounts.v1";

const TRANSACTION_KEYS = {
  sales: "ledgerly:saleInvoices.v1", saleReturns: "ledgerly:saleReturns.v1",
  purchases: "ledgerly:purchaseBills.v1", purchaseReturns: "ledgerly:purchaseReturns.v1",
  purchaseDebitNotes: "ledgerly:purchaseReturnsDebitNotes.v1", expenses: "ledgerly:expenses.v1",
  paymentIns: "ledgerly:paymentIns.v1", paymentOuts: "ledgerly:paymentOuts.v1",
  cashAdjustments: "ledgerly:cashAdjustments.v1", bankTransactions: "ledgerly:bankTransactions.v1",
  items: "ledgerly:inventoryItems.v1", saleUi: "ledgerly:saleInvoiceUiActions.v1",
};

export function createLocalBalanceSheetRepository(storage = typeof window !== "undefined" ? window.localStorage : null) {
  const read = (key, fallback) => { try { const value = JSON.parse(storage?.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; } };
  return {
    async load() {
      const transactions = Object.fromEntries(Object.entries(TRANSACTION_KEYS).map(([name, key]) => [name, read(key, name === "saleUi" ? {} : [])]));
      let bankAccounts = [], bankTransactions = [], bankUnavailable = false, loans = [];
      try { [bankAccounts, bankTransactions] = await Promise.all([listBankAccounts(), listBankTransactions()]); }
      catch { bankUnavailable = true; }
      try { loans = await getAllLoans(); } catch { /* Missing loan storage is treated as unavailable data. */ }
      return { transactions, accounts: read(BALANCE_SHEET_ACCOUNTS_KEY, []), bankAccounts: Array.isArray(bankAccounts) ? bankAccounts : [], bankTransactions: Array.isArray(bankTransactions) ? bankTransactions : [], bankUnavailable, loans: Array.isArray(loans) ? loans : [] };
    },
    async saveAccount(account) {
      if (!storage) throw new Error("Browser storage is unavailable.");
      const accounts = read(BALANCE_SHEET_ACCOUNTS_KEY, []);
      const duplicate = accounts.some((row) => row.id !== account.id && row.name.trim().toLowerCase() === account.name.trim().toLowerCase());
      if (duplicate) throw new Error("An account with this name already exists.");
      const next = account.id ? accounts.map((row) => row.id === account.id ? account : row) : [...accounts, account];
      storage.setItem(BALANCE_SHEET_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    },
    async deleteAccount(id) {
      if (!storage) throw new Error("Browser storage is unavailable.");
      const next = read(BALANCE_SHEET_ACCOUNTS_KEY, []).filter((row) => row.id !== id);
      storage.setItem(BALANCE_SHEET_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    },
  };
}

export const balanceSheetRepository = createLocalBalanceSheetRepository();
