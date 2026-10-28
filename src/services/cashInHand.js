import { getSaleInvoices } from "./salesStorage.js";
import { getPurchaseBills } from "./purchaseBillsStorage.js";

// Persistence is isolated here so this browser-local store can be replaced by
// an API adapter later without changing the Cash in Hand page or calculations.
export const CASH_ADJUSTMENTS_STORAGE_KEY = "ledgerly:cashAdjustments.v1";

function paise(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function isCashPayment(record) {
  const method = record.form?.paymentType || record.paymentType || (record.saleType === "cash" ? "Cash" : "");
  return String(method).trim().toLowerCase() === "cash";
}

function isVoided(record) {
  return Boolean(record.cancelled || record.isReturn || String(record.status || "").toLowerCase() === "cancelled");
}

function recordId(record, fallback) {
  return String(record.id || record.invoiceId || fallback);
}

function mergeById(localRecords, type) {
  const records = new Map();
  for (const record of localRecords) {
    const id = recordId(record, `${record.form?.invoiceNumber || record.invoiceNumber || ""}-${record.form?.invoiceDate || record.createdAt || ""}`);
    records.set(`${type}:${id}`, { ...records.get(`${type}:${id}`), ...record, id });
  }
  return [...records.values()];
}

function invoiceMovement(record, type) {
  if (isVoided(record) || !isCashPayment(record)) return null;
  const invoiceTotal = Math.max(Number(record.totals?.finalTotal ?? record.totals?.amount ?? 0) || 0, 0);
  const received = Math.min(Math.max(Number(record.totals?.received || 0) || 0, 0), invoiceTotal);
  const amount = type === "sale" && record.saleType === "cash" ? invoiceTotal : received;
  if (amount <= 0) return null;

  const party = String(record.form?.customer || record.form?.party || record.form?.supplier || record.customer || record.partyName || (type === "sale" ? "Cash Sale" : "Supplier"));
  const number = String(record.form?.invoiceNumber || record.invoiceNumber || record.billNumber || "");
  return {
    id: `${type}:${record.id}`,
    sourceId: record.id,
    sourceType: type,
    type: type === "sale" ? (record.saleType === "cash" ? "Cash Sale" : "Cash Received") : "Cash Paid to Supplier",
    direction: type === "sale" ? "in" : "out",
    amount: Math.round(amount * 100) / 100,
    date: String(record.form?.invoiceDate || record.invoiceDate || record.createdAt || "").slice(0, 10),
    name: party,
    description: type === "sale" ? "Cash received against sale" : "Cash paid against purchase",
    reference: number,
    paymentMethod: "Cash",
    sourceRecord: record,
  };
}

export function buildCashLedger(sales = [], purchases = [], adjustments = []) {
  const entries = [];
  for (const sale of sales) {
    const entry = invoiceMovement(sale, "sale");
    if (entry) entries.push(entry);
  }
  for (const purchase of purchases) {
    const entry = invoiceMovement(purchase, "purchase");
    if (entry) entries.push(entry);
  }
  for (const adjustment of adjustments) {
    const amount = paise(adjustment.amount) / 100;
    if (!adjustment.id || amount === 0) continue;
    entries.push({
      id: `adjustment:${adjustment.id}`,
      sourceId: adjustment.id,
      sourceType: "adjustment",
      type: amount > 0 ? "Cash Increase" : "Cash Decrease",
      direction: amount > 0 ? "in" : "out",
      amount: Math.abs(amount),
      signedAmount: amount,
      date: String(adjustment.date || adjustment.createdAt || "").slice(0, 10),
      name: adjustment.reason,
      description: adjustment.reason,
      reference: "Physical cash count",
      paymentMethod: "Cash",
      sourceRecord: adjustment,
    });
  }
  return entries.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
}

export function calculateCashBalance(entries = []) {
  return entries.reduce((total, entry) => total + (entry.signedAmount !== undefined
    ? paise(entry.signedAmount)
    : entry.direction === "in" ? paise(entry.amount) : -paise(entry.amount)), 0) / 100;
}

export async function loadCashInHandData() {
  const sales = mergeById(getSaleInvoices(), "sale");
  const purchases = mergeById(getPurchaseBills(), "purchase");
  const adjustments = readCashAdjustments();
  return {
    entries: buildCashLedger(sales, purchases, adjustments),
    complete: true,
    unavailableSources: [],
  };
}

function readCashAdjustments() {
  if (typeof window === "undefined") return [];
  try {
    const records = JSON.parse(window.localStorage.getItem(CASH_ADJUSTMENTS_STORAGE_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function saveCashAdjustment(adjustment) {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser local storage is unavailable.");
  const existing = readCashAdjustments();
  const duplicate = existing.find((record) => record.id === adjustment.id);
  if (duplicate) return duplicate;
  const saved = { ...adjustment, createdAt: new Date().toISOString() };
  window.localStorage.setItem(CASH_ADJUSTMENTS_STORAGE_KEY, JSON.stringify([saved, ...existing]));
  return saved;
}

export function validateCashAdjustment({ recordedBalance, actualBalance, reason } = {}) {
  const recorded = Number(recordedBalance);
  const actual = Number(actualBalance);
  if (!Number.isFinite(recorded)) return "The recorded cash balance is unavailable.";
  if (!Number.isFinite(actual) || actual < 0) return "Enter a valid physical cash count of zero or more.";
  if (!String(reason || "").trim()) return "Enter a reason for this adjustment.";
  if (paise(actual) === paise(recorded)) return "The physical cash count matches the recorded balance; no adjustment is needed.";
  return "";
}

export function formatCashAmount(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
