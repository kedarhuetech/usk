import { getPurchaseBills, purchaseBillsStorageKey } from "./purchaseBillsStorage.js";
import { getSaleInvoices, saleInvoicesStorageKey } from "./salesStorage.js";
import { getParties, partiesStorageKey } from "./partiesStorage.js";
import { calculatePartyBalances } from "./partyBalances.js";

export const saleInvoiceUiStorageKey = "ledgerly:saleInvoiceUiActions.v1";

function readStoredJson(key, fallback) {
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not read ${key} from browser storage: ${error.message}`, { cause: error });
  }
}

function readCollection(key) {
  const value = readStoredJson(key, []);
  if (!Array.isArray(value)) throw new Error(`Expected ${key} to contain a JSON array.`);
  if (value.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
    throw new Error(`Found an invalid transaction record in ${key}.`);
  }
  return value;
}

function amount(value, label) {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric ${label} in a saved transaction.`);
  return parsed;
}

function totalFor(record) {
  return Math.max(0, amount(record.totals?.finalTotal ?? record.totals?.grandTotal ?? record.totals?.amount ?? record.totalAmount ?? record.total ?? record.amount, "total"));
}

function uniqueRecords(records) {
  const unique = new Map();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const id = record.id || record.invoiceId;
    if (id == null || id === "") continue;
    unique.set(String(id), record);
  }
  return [...unique.values()];
}

function readSaleUiState() {
  const state = readStoredJson(saleInvoiceUiStorageKey, {});
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error(`Expected ${saleInvoiceUiStorageKey} to contain a JSON object.`);
  }
  return state;
}

export function calculateDashboardSummary({ sales = [], purchases = [], parties = [], saleUi = {}, paymentIns = [], paymentOuts = [], creditNotes = [], debitNotes = [] } = {}) {
  const deleted = new Set(Array.isArray(saleUi.deleted) ? saleUi.deleted.map(String) : []);
  const cancelled = saleUi.cancelled && typeof saleUi.cancelled === "object" ? saleUi.cancelled : {};
  const edits = saleUi.edits && typeof saleUi.edits === "object" ? saleUi.edits : {};
  const salesWithUi = [
    ...sales.map((record) => edits[record.id] ? { ...record, ...edits[record.id] } : record),
    ...(Array.isArray(saleUi.duplicates) ? saleUi.duplicates : []),
  ];

  // Active sales
  const activeSales = uniqueRecords(salesWithUi)
    .filter((record) => !record.isReturn && !deleted.has(String(record.id)) && !cancelled[record.id]
      && !record.cancelled && !record.deleted && !record.isDeleted
      && !["cancelled", "canceled", "void", "deleted"].includes(String(record.status || "").trim().toLowerCase()));

  const totalSales = activeSales
    .reduce((sum, record) => sum + totalFor(record), 0);

  const balances = calculatePartyBalances({ sales, purchases, parties, paymentIns, paymentOuts, creditNotes, debitNotes, saleUi });
  const salesReceivable = balances.salesReceivable;
  const purchasesPayable = balances.purchasesPayable;

  return {
    receivable: balances.receivable,
    payable: balances.payable,
    totalSales,
    activeSales,
    salesReceivable,
    purchasesPayable,
    partyReceivable: balances.openingReceivable,
    partyPayable: balances.openingPayable,
  };
}

// Uses the existing repositories after validating their persisted JSON, so a
// corrupt store produces a visible load error without replacing any saved data.
export async function loadLocalDashboardSummary() {
  readCollection(saleInvoicesStorageKey);
  readCollection(purchaseBillsStorageKey);
  readCollection(partiesStorageKey);
  const saleUi = readSaleUiState();
  return calculateDashboardSummary({
    sales: getSaleInvoices(),
    purchases: getPurchaseBills(),
    parties: getParties(),
    saleUi,
    paymentIns: readCollection("ledgerly:paymentIns.v1"),
    paymentOuts: readCollection("ledgerly:paymentOuts.v1"),
    creditNotes: readCollection("ledgerly:saleReturns.v1"),
    debitNotes: readCollection("ledgerly:purchaseReturns.v1"),
  });
}
