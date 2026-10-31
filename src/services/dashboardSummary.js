import { getPurchaseBills, purchaseBillsStorageKey } from "./purchaseBillsStorage.js";
import { getSaleInvoices, saleInvoicesStorageKey } from "./salesStorage.js";
import { getParties, partiesStorageKey } from "./partiesStorage.js";

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

function outstandingFor(record) {
  const total = totalFor(record);
  const settlementType = String(record.saleType || record.purchaseType || "").trim().toLowerCase();
  if (settlementType === "cash" || record.isCashTransaction === true) return 0;
  if (["paid", "cancelled", "canceled", "void", "deleted"].includes(String(record.status || "").trim().toLowerCase())) return 0;

  if (record.totals?.balance !== undefined && record.totals?.balance !== null) {
    return Math.max(0, amount(record.totals.balance, "balance"));
  }
  if (record.balance !== undefined && record.balance !== null) {
    return Math.max(0, amount(record.balance, "balance"));
  }

  const paidOrReceived = Math.min(
    Math.max(
      amount(
        record.totals?.received ?? record.paidAmount ?? record.receivedAmount ?? record.form?.receivedAmount ?? record.form?.paidAmount,
        "paid or received amount"
      ),
      0
    ),
    total
  );
  return Math.max(total - paidOrReceived, 0);
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

export function calculateDashboardSummary({ sales = [], purchases = [], parties = [], saleUi = {} } = {}) {
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

  // Active purchases
  const activePurchases = uniqueRecords(purchases)
    .filter((record) => !record.isReturn && !record.cancelled && !record.deleted && !record.isDeleted
      && !["cancelled", "canceled", "void", "deleted"].includes(String(record.status || "").toLowerCase()));

  // Track matched transaction IDs so unlinked transactions can also be accounted for
  const matchedSaleIds = new Set();
  const matchedPurchaseIds = new Set();

  let partyReceivable = 0;
  let partyPayable = 0;

  for (const party of parties) {
    const ob = Math.abs(amount(party.openingBalance || 0, "party opening balance"));
    const partyTypeStr = String(party.partyType || "").trim().toLowerCase();
    const isSupplier = partyTypeStr === "supplier" || partyTypeStr === "vendor";
    const obType = party.openingBalanceType
      ? String(party.openingBalanceType).trim().toLowerCase()
      : (isSupplier ? "to-pay" : "to-receive");

    // Unpaid sales for this party
    const partySales = activeSales.filter((inv) => {
      const match = (inv.partyId && String(inv.partyId) === String(party.id)) ||
        (inv.form?.partyId && String(inv.form.partyId) === String(party.id)) ||
        (inv.partyName && party.partyName && String(inv.partyName).trim().toLowerCase() === String(party.partyName).trim().toLowerCase()) ||
        (inv.customerName && party.partyName && String(inv.customerName).trim().toLowerCase() === String(party.partyName).trim().toLowerCase()) ||
        (inv.customer && party.partyName && String(inv.customer).trim().toLowerCase() === String(party.partyName).trim().toLowerCase()) ||
        (inv.form?.customer && party.partyName && String(inv.form.customer).trim().toLowerCase() === String(party.partyName).trim().toLowerCase());
      if (match) {
        matchedSaleIds.add(String(inv.id || inv.invoiceId));
      }
      return match;
    });

    const partySalesUnpaid = partySales.reduce((sum, inv) => sum + outstandingFor(inv), 0);

    // Unpaid purchases for this party
    const partyPurchases = activePurchases.filter((bill) => {
      const match = (bill.partyId && String(bill.partyId) === String(party.id)) ||
        (bill.form?.partyId && String(bill.form.partyId) === String(party.id)) ||
        (bill.supplier && party.partyName && String(bill.supplier).trim().toLowerCase() === String(party.partyName).trim().toLowerCase()) ||
        (bill.partyName && party.partyName && String(bill.partyName).trim().toLowerCase() === String(party.partyName).trim().toLowerCase()) ||
        (bill.party && party.partyName && String(bill.party).trim().toLowerCase() === String(party.partyName).trim().toLowerCase()) ||
        (bill.form?.customer && party.partyName && String(bill.form.customer).trim().toLowerCase() === String(party.partyName).trim().toLowerCase());
      if (match) {
        matchedPurchaseIds.add(String(bill.id || bill.invoiceId));
      }
      return match;
    });

    const partyPurchasesUnpaid = partyPurchases.reduce((sum, bill) => sum + outstandingFor(bill), 0);

    let rec = (obType === "to-receive" ? ob : 0) + partySalesUnpaid;
    let pay = (obType === "to-pay" ? ob : 0) + partyPurchasesUnpaid;

    if (party.balance !== undefined && party.balance !== null && party.balance !== "") {
      const rawBal = Number(party.balance);
      if (rawBal > 0 && obType === "to-receive") rec = Math.max(rec, rawBal);
      if (rawBal < 0 || obType === "to-pay") pay = Math.max(pay, Math.abs(rawBal));
    }

    const net = rec - pay;
    if (net > 0) {
      partyReceivable += net;
    } else if (net < 0) {
      partyPayable += Math.abs(net);
    } else {
      if (rec > 0) partyReceivable += rec;
      if (pay > 0) partyPayable += pay;
    }
  }

  // Any unmatched active sales with outstanding balance
  const unlinkedSalesReceivable = activeSales
    .filter((inv) => !matchedSaleIds.has(String(inv.id || inv.invoiceId)))
    .reduce((sum, inv) => sum + outstandingFor(inv), 0);

  // Any unmatched active purchases with outstanding balance
  const unlinkedPurchasesPayable = activePurchases
    .filter((bill) => !matchedPurchaseIds.has(String(bill.id || bill.invoiceId)))
    .reduce((sum, bill) => sum + outstandingFor(bill), 0);

  const receivable = partyReceivable + unlinkedSalesReceivable;
  const payable = partyPayable + unlinkedPurchasesPayable;

  return {
    receivable,
    payable,
    totalSales,
    activeSales,
    salesReceivable: receivable,
    purchasesPayable: payable,
    partyReceivable,
    partyPayable,
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
  });
}
