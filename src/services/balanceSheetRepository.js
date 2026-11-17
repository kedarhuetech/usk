// Balance sheet persistence boundary. Replace this adapter with API calls without
// changing the accounting functions or report components.
import { listBankAccounts, listBankTransactions } from "./bankAccounts.js";
import { getAllLoans } from "./loanAccountsRepository.js";
import { balanceSheetDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

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

      let accounts = read(BALANCE_SHEET_ACCOUNTS_KEY, []);
      if (isDatabaseMode()) {
        try {
          const remoteAccounts = await balanceSheetDb.listAccounts();
          if (Array.isArray(remoteAccounts)) {
            accounts = remoteAccounts;
            storage?.setItem(BALANCE_SHEET_ACCOUNTS_KEY, JSON.stringify(accounts));
          }
        } catch (err) {
          console.warn("[BalanceSheet] Failed to fetch accounts from MySQL:", err.message);
        }
      }

      return { transactions, accounts, bankAccounts: Array.isArray(bankAccounts) ? bankAccounts : [], bankTransactions: Array.isArray(bankTransactions) ? bankTransactions : [], bankUnavailable, loans: Array.isArray(loans) ? loans : [] };
    },
    async saveAccount(account) {
      if (!storage) throw new Error("Browser storage is unavailable.");
      const accounts = read(BALANCE_SHEET_ACCOUNTS_KEY, []);
      const duplicate = accounts.some((row) => row.id !== account.id && row.name.trim().toLowerCase() === account.name.trim().toLowerCase());
      if (duplicate) throw new Error("An account with this name already exists.");

      if (isDatabaseMode()) {
        try {
          await balanceSheetDb.saveAccount(account);
        } catch (err) {
          console.warn("[BalanceSheet] Failed to persist account to MySQL:", err.message);
          throw err;
        }
      }

      const next = account.id ? accounts.map((row) => row.id === account.id ? account : row) : [...accounts, account];
      storage.setItem(BALANCE_SHEET_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    },
    async deleteAccount(id) {
      if (!storage) throw new Error("Browser storage is unavailable.");
      if (isDatabaseMode()) {
        try {
          await balanceSheetDb.removeAccount(id);
        } catch (err) {
          console.warn("[BalanceSheet] Failed to delete account from MySQL:", err.message);
        }
      }
      const next = read(BALANCE_SHEET_ACCOUNTS_KEY, []).filter((row) => row.id !== id);
      storage.setItem(BALANCE_SHEET_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    },
  };
}

export const balanceSheetRepository = createLocalBalanceSheetRepository();
