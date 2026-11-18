import { getSaleInvoices } from "./salesStorage.js";
import { getPurchaseBills } from "./purchaseBillsStorage.js";
import { cashBankDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

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
  if (isDatabaseMode()) {
    try {
      const resp = await cashBankDb.getCashInHand();
      const rows = Array.isArray(resp) ? resp : (resp?.data || []);

      const entries = rows.map((r) => {
        const direction = (r.entryType || r.entry_type || "in").toLowerCase() === "in" ? "in" : "out";
        const amt = Math.abs(Number(r.amount) || 0);
        const date = r.entryDate
          ? String(r.entryDate).slice(0, 10)
          : r.entry_date
          ? String(r.entry_date).slice(0, 10)
          : "";
        const refType = String(r.referenceType || r.reference_type || "").toLowerCase();

        let typeName = "Cash Entry";
        if (refType === "adjustment") {
          typeName = direction === "in" ? "Cash Increase" : "Cash Decrease";
        } else if (refType === "sale" || refType === "pos") {
          typeName = "Cash Sale";
        } else if (refType === "purchase") {
          typeName = "Cash Paid to Supplier";
        } else if (refType === "expense") {
          typeName = "Cash Expense";
        } else if (refType === "credit note" || refType === "credit_note" || refType === "sale_return") {
          typeName = "Credit Note (Cash Refund)";
        } else if (refType === "debit note" || refType === "debit_note" || refType === "purchase_return") {
          typeName = "Debit Note (Cash Received)";
        } else if (refType.includes("payment_in") || refType.includes("payment-in")) {
          typeName = "Payment In (Cash)";
        } else if (refType.includes("payment_out") || refType.includes("payment-out")) {
          typeName = "Payment Out (Cash)";
        }

        const name =
          r.partyName ||
          r.party_name ||
          (refType === "adjustment" ? (r.description || "Cash Adjustment") : "Cash Party");
        const refNo = r.referenceNo || r.reference_no || "";
        const desc = r.description || `${typeName} ${refNo ? `#${refNo}` : ""}`.trim();

        return {
          id: String(r.id),
          sourceId: r.id,
          sourceType: refType || "cash_in_hand",
          type: typeName,
          direction,
          amount: amt,
          signedAmount: direction === "in" ? amt : -amt,
          date,
          name,
          description: desc,
          reference: refNo,
          paymentMethod: "Cash",
          sourceRecord: r,
        };
      });

      return {
        entries: entries.sort(
          (left, right) =>
            right.date.localeCompare(left.date) || right.id.localeCompare(left.id)
        ),
        complete: true,
        unavailableSources: [],
      };
    } catch (err) {
      console.warn("[CashInHand] Failed to load from MySQL backend, falling back to local storage:", err.message);
    }
  }

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

export async function saveCashAdjustment(adjustment) {
  const delta = Number(adjustment.amount ?? adjustment.difference ?? 0);
  const entryType = delta >= 0 ? "in" : "out";
  const amount = Math.abs(delta);
  const now = new Date();
  const dateStr = adjustment.date || (adjustment.createdAt ? String(adjustment.createdAt).slice(0, 10) : now.toISOString().slice(0, 10));

  const saved = {
    ...adjustment,
    amount: delta,
    createdAt: now.toISOString(),
  };

  if (isDatabaseMode()) {
    try {
      await cashBankDb.saveCashInHand({
        id: saved.id,
        entryDate: dateStr,
        entryType,
        amount,
        partyName: "Physical Cash Count",
        referenceType: "adjustment",
        referenceNo: "ADJUSTMENT",
        description: saved.reason || "Physical cash count adjustment",
      });
    } catch (err) {
      console.error("[CashBank] Failed to persist adjustment to MySQL:", err);
      throw err;
    }
  }

  if (typeof window !== "undefined" && window.localStorage) {
    const existing = readCashAdjustments();
    window.localStorage.setItem(
      CASH_ADJUSTMENTS_STORAGE_KEY,
      JSON.stringify([saved, ...existing.filter((r) => r.id !== saved.id)])
    );
  }

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
