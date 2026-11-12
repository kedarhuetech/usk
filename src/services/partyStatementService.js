// Party Statement Service
// Calculates full transaction ledger, chronological running balance, debits, credits,
// and date-ranged opening/closing balances for any customer or supplier.
// Standalone, framework-agnostic architecture for easy MySQL migration.

import { calculateInvoiceSettlement, transactionMatchesParty } from "./partyBalances.js";

/**
 * Amount helper: safely parses a number >= 0.
 */
export const amount = (val) => {
  const parsed = Number(val);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

/**
 * Normalizes party names for case-insensitive matching.
 */
export function normalizePartyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Safely parses any date representation into ISO YYYY-MM-DD.
 */
export function parseYMD(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const s = val.trim();
    const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmySlash) {
      return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
    }
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDash) {
      return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
    }
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  return "";
}

/**
 * Formats a date into DD/MM/YYYY for UI display.
 */
export function formatDateDMY(val) {
  const ymd = parseYMD(val);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Indian currency formatting helper.
 */
export function formatMoney(val) {
  return `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats running balance with standard Dr / Cr indicator.
 */
export function formatRunningBalance(signedBalance) {
  const num = Number(signedBalance || 0);
  if (Math.abs(num) < 0.005) return "₹ 0.00";
  const absFormatted = formatMoney(Math.abs(num));
  return num > 0 ? `${absFormatted} Dr` : `${absFormatted} Cr`;
}

/**
 * Calculates start and end dates for standard period options.
 */
export function getDateRangeForPeriod(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const toIso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  if (period === "This Month") {
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    return { from: toIso(firstDay), to: toIso(lastDay) };
  }
  if (period === "Previous Month") {
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    return { from: toIso(firstDay), to: toIso(lastDay) };
  }
  if (period === "This Year") {
    const firstDay = new Date(y, 0, 1);
    const lastDay = new Date(y, 11, 31);
    return { from: toIso(firstDay), to: toIso(lastDay) };
  }
  return { from: "", to: "" };
}

const isVoided = (record) =>
  Boolean(
    record?.deleted ||
    record?.isDeleted ||
    record?.isReturn ||
    ["canceled", "void", "deleted"].includes(String(record?.status || "").trim().toLowerCase())
  );

const isInvoiceCancelled = (record) =>
  Boolean(
    record?.cancelled ||
    record?.isCancelled ||
    record?.invoiceStatus === "Cancelled" ||
    String(record?.status || "").trim().toLowerCase() === "cancelled"
  );

function invoiceTotal(record) {
  return amount(
    record?.totals?.finalTotal ??
    record?.totals?.grandTotal ??
    record?.totals?.amount ??
    record?.totalAmount ??
    record?.total ??
    record?.grandTotal ??
    record?.amount
  );
}

function allocationFor(payment, invoice) {
  const invoiceKey = String(invoice?.id || invoice?.invoiceId || "");
  const allocations = [payment?.allocations, payment?.invoices, payment?.appliedTo].find(Array.isArray);
  if (allocations) {
    return allocations.reduce((sum, allocation) => {
      const ref = String(allocation.invoiceId || allocation.billId || allocation.transactionId || allocation.id || "");
      return sum + (ref === invoiceKey ? amount(allocation.amount ?? allocation.allocatedAmount) : 0);
    }, 0);
  }
  const linkedId = String(
    payment?.linkedInvoiceId ||
    payment?.linkedBillId ||
    payment?.invoiceId ||
    payment?.billId ||
    payment?.purchaseId ||
    ""
  );
  return linkedId === invoiceKey ? amount(payment?.amount ?? payment?.total ?? payment?.received ?? payment?.paid) : 0;
}

function explicitPaid(record, kind) {
  const declaredSettlement = String(record?.saleType || record?.purchaseType || "").trim().toLowerCase();
  if ((kind === "sale" || kind === "purchase") && declaredSettlement === "cash") return invoiceTotal(record);
  const explicit =
    record?.totals?.received ??
    record?.totals?.paid ??
    record?.paidAmount ??
    record?.receivedAmount ??
    record?.received ??
    record?.form?.receivedAmount ??
    record?.form?.paidAmount;
  if (explicit !== undefined && explicit !== null && explicit !== "") return amount(explicit);
  const paymentType = String(record?.form?.paymentType || record?.paymentType || "").trim().toLowerCase();
  if (kind === "sale" && (String(record?.saleType || "").toLowerCase() === "cash" || paymentType === "cash")) {
    return invoiceTotal(record);
  }
  if (kind === "purchase" && (String(record?.purchaseType || "").toLowerCase() === "cash" || paymentType === "cash")) {
    return invoiceTotal(record);
  }
  return 0;
}

/**
 * Checks if a transaction record matches the target party safely and unambiguously.
 * Respects distinct parties with identical names by matching partyId first.
 */
export function recordMatchesParty(record, targetParty) {
  if (!record || !targetParty) return false;
  return transactionMatchesParty(record, targetParty);
}

/**
 * Gathers, normalizes, and classifies all actual transactions for a given party across USV.
 */
export function collectPartyTransactions({
  party,
  sales = [],
  purchases = [],
  paymentIns = [],
  paymentOuts = [],
  creditNotes = [],
  debitNotes = [],
  saleUi = {},
} = {}) {
  if (!party) return [];

  const dedupById = (list = []) => {
    const seen = new Set();
    return list.filter((r) => {
      if (!r) return false;
      const key = String(r.id || r.invoiceId || r.billId || "");
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const uniqueSales = dedupById(sales);
  const uniquePurchases = dedupById(purchases);
  const uniquePaymentIns = dedupById(paymentIns);
  const uniquePaymentOuts = dedupById(paymentOuts);
  const uniqueCreditNotes = dedupById(creditNotes);
  const uniqueDebitNotes = dedupById(debitNotes);

  const deletedSales = new Set(Array.isArray(saleUi?.deleted) ? saleUi.deleted.map(String) : []);
  const saleEdits = saleUi?.edits && typeof saleUi.edits === "object" ? saleUi.edits : {};
  const saleCancelled = saleUi?.cancelled && typeof saleUi.cancelled === "object" ? saleUi.cancelled : {};

  // 1. Live Payments
  const liveReceipts = uniquePaymentIns.filter((p) => !isVoided(p) && !isInvoiceCancelled(p));
  const livePayments = uniquePaymentOuts.filter((p) => !isVoided(p) && !isInvoiceCancelled(p));
  const liveCredits = uniqueCreditNotes.filter((c) => !isVoided(c) && !isInvoiceCancelled(c));
  const liveDebits = uniqueDebitNotes.filter((d) => !isVoided(d) && !isInvoiceCancelled(d));

  const txns = [];

  // 2. Sales Invoices
  uniqueSales
    .map((record) => (saleEdits[record.id] ? { ...record, ...saleEdits[record.id] } : record))
    .filter((record) => {
      const recId = String(record?.id || record?.invoiceId || "");
      if (deletedSales.has(recId) || saleCancelled[recId] || isVoided(record) || isInvoiceCancelled(record)) {
        return false;
      }
      return recordMatchesParty(record, party);
    })
    .forEach((sale) => {
      const settlement = calculateInvoiceSettlement(sale, {
        kind: "sale",
        payments: liveReceipts,
        adjustments: liveCredits,
      });

      const totalAmt = settlement.total;
      const date = parseYMD(
        sale.form?.invoiceDate || sale.invoiceDate || sale.date || sale.createdAt || sale.updatedAt
      );
      const number =
        sale.form?.invoiceNumber || sale.invoiceNumber || sale.number || sale.id || "—";
      const paymentType =
        sale.form?.paymentType ||
        sale.paymentType ||
        (String(sale.saleType || "").toLowerCase() === "cash" ? "Cash" : "Credit");

      // Sale invoice row (Debit = total amount)
      txns.push({
        id: `sale:${sale.id}`,
        rawId: sale.id,
        source: "Sale",
        type: "Sale",
        number,
        date,
        paymentType,
        total: totalAmt,
        debit: totalAmt,
        credit: 0,
        received: 0,
        status: settlement.status,
        raw: sale,
        storageKey: "ledgerly:saleInvoices.v1",
      });

      // Immediate payment received at sale creation (if not already recorded in liveReceipts)
      const hasLinkedReceipt = liveReceipts.some(
        (p) => allocationFor(p, sale) > 0 || String(p.linkedInvoiceId || p.invoiceId) === String(sale.id)
      );
      const immediatePaid = hasLinkedReceipt ? 0 : explicitPaid(sale, "sale");
      if (immediatePaid > 0) {
        txns.push({
          id: `payment:sale-cash:${sale.id}`,
          rawId: sale.id,
          source: "Payment-In",
          type: "Payment-In",
          number: number !== "—" ? `REC-${number}` : `REC-${sale.id}`,
          date,
          paymentType,
          total: immediatePaid,
          debit: 0,
          credit: immediatePaid,
          received: immediatePaid,
          status: "Paid",
          raw: sale,
          storageKey: "ledgerly:saleInvoices.v1",
        });
      }
    });

  // 3. Purchase Bills
  uniquePurchases
    .filter((record) => {
      if (isVoided(record) || isInvoiceCancelled(record)) return false;
      return recordMatchesParty(record, party);
    })
    .forEach((bill) => {
      const settlement = calculateInvoiceSettlement(bill, {
        kind: "purchase",
        payments: livePayments,
        adjustments: liveDebits,
      });

      const totalAmt = settlement.total;
      const date = parseYMD(
        bill.form?.invoiceDate ||
        bill.form?.billDate ||
        bill.billDate ||
        bill.date ||
        bill.createdAt ||
        bill.updatedAt
      );
      const number =
        bill.form?.invoiceNumber ||
        bill.form?.billNumber ||
        bill.billNumber ||
        bill.invoiceNumber ||
        bill.number ||
        bill.id ||
        "—";
      const paymentType =
        bill.form?.paymentType ||
        bill.paymentType ||
        (String(bill.purchaseType || "").toLowerCase() === "cash" ? "Cash" : "Credit");

      // Purchase bill row (Credit = total amount)
      txns.push({
        id: `purchase:${bill.id}`,
        rawId: bill.id,
        source: "Purchase",
        type: "Purchase",
        number,
        date,
        paymentType,
        total: totalAmt,
        debit: 0,
        credit: totalAmt,
        received: 0,
        status: settlement.status,
        raw: bill,
        storageKey: "ledgerly:purchaseBills.v1",
      });

      // Immediate payment made at purchase creation (if not already recorded in livePayments)
      const hasLinkedPayment = livePayments.some(
        (p) =>
          allocationFor(p, bill) > 0 ||
          String(p.linkedInvoiceId || p.linkedBillId || p.billId || p.purchaseId) === String(bill.id)
      );
      const immediatePaid = hasLinkedPayment ? 0 : explicitPaid(bill, "purchase");
      if (immediatePaid > 0) {
        txns.push({
          id: `payment:purchase-cash:${bill.id}`,
          rawId: bill.id,
          source: "Payment-Out",
          type: "Payment-Out",
          number: number !== "—" ? `PAY-${number}` : `PAY-${bill.id}`,
          date,
          paymentType,
          total: immediatePaid,
          debit: immediatePaid,
          credit: 0,
          received: immediatePaid,
          status: "Paid",
          raw: bill,
          storageKey: "ledgerly:purchaseBills.v1",
        });
      }
    });

  // 4. Payment-In (Receipts from Customer)
  liveReceipts
    .filter((entry) => recordMatchesParty(entry, party))
    .forEach((entry) => {
      const amt = Number(entry.amount ?? entry.total ?? entry.received ?? 0);
      const date = parseYMD(entry.date || entry.createdAt || entry.updatedAt);
      const number = entry.number || entry.receiptNo || entry.refNo || entry.id || "—";
      const paymentType = entry.paymentType || entry.mode || "Cash";

      txns.push({
        id: `payment-in:${entry.id}`,
        rawId: entry.id,
        source: "Payment-In",
        type: "Payment-In",
        number,
        date,
        paymentType,
        total: amt,
        debit: 0,
        credit: amt,
        received: amt,
        status: entry.status || "Paid",
        raw: entry,
        storageKey: "ledgerly:paymentIns.v1",
      });
    });

  // 5. Payment-Out (Payments to Supplier)
  livePayments
    .filter((entry) => recordMatchesParty(entry, party))
    .forEach((entry) => {
      const amt = Number(entry.amount ?? entry.total ?? entry.paid ?? 0);
      const date = parseYMD(entry.date || entry.createdAt || entry.updatedAt);
      const number = entry.number || entry.paymentNo || entry.refNo || entry.id || "—";
      const paymentType = entry.paymentType || entry.mode || "Cash";

      txns.push({
        id: `payment-out:${entry.id}`,
        rawId: entry.id,
        source: "Payment-Out",
        type: "Payment-Out",
        number,
        date,
        paymentType,
        total: amt,
        debit: amt,
        credit: 0,
        received: amt,
        status: entry.status || "Paid",
        raw: entry,
        storageKey: "ledgerly:paymentOuts.v1",
      });
    });

  // 6. Credit Notes (Sales Returns)
  liveCredits
    .filter((entry) => recordMatchesParty(entry, party))
    .forEach((entry) => {
      const amt = Number(entry.total ?? entry.amount ?? 0);
      const date = parseYMD(entry.date || entry.createdAt || entry.updatedAt);
      const number = entry.number || entry.creditNoteNo || entry.refNo || entry.id || "—";

      txns.push({
        id: `credit-note:${entry.id}`,
        rawId: entry.id,
        source: "Credit Note",
        type: "Credit Note",
        number,
        date,
        paymentType: entry.paymentType || "Credit",
        total: amt,
        debit: 0,
        credit: amt,
        status: entry.status || "Applied",
        raw: entry,
        storageKey: "ledgerly:saleReturns.v1",
      });
    });

  // 7. Debit Notes (Purchase Returns)
  liveDebits
    .filter((entry) => recordMatchesParty(entry, party))
    .forEach((entry) => {
      const amt = Number(entry.total ?? entry.amount ?? 0);
      const date = parseYMD(entry.date || entry.createdAt || entry.updatedAt);
      const number = entry.refNo || entry.returnNo || entry.number || entry.id || "—";

      txns.push({
        id: `debit-note:${entry.id}`,
        rawId: entry.id,
        source: "Debit Note",
        type: "Debit Note",
        number,
        date,
        paymentType: entry.paymentType || "Credit",
        total: amt,
        debit: amt,
        credit: 0,
        status: entry.status || "Applied",
        raw: entry,
        storageKey: "ledgerly:purchaseReturns.v1",
      });
    });

  // 8. Deterministic Chronological Sorting
  const typeOrder = {
    Sale: 1,
    Purchase: 2,
    "Credit Note": 3,
    "Debit Note": 4,
    "Payment-In": 5,
    "Payment-Out": 6,
  };

  return txns.sort((a, b) => {
    const dComp = String(a.date || "").localeCompare(String(b.date || ""));
    if (dComp !== 0) return dComp;
    const pA = typeOrder[a.type] ?? 99;
    const pB = typeOrder[b.type] ?? 99;
    if (pA !== pB) return pA - pB;
    return String(a.number || a.id || "").localeCompare(String(b.number || b.id || ""));
  });
}

/**
 * Generates the complete Party Statement report:
 * 1. Calculates opening balance using transactions strictly before the From Date.
 * 2. Filters transactions within the date range.
 * 3. Calculates running balance row-by-row.
 * 4. Produces opening, period debit/credit, and closing balances with exact reconciliation:
 *    Opening Balance + Total Debit - Total Credit = Closing Balance
 */
export function generatePartyStatement({
  party,
  sales = [],
  purchases = [],
  paymentIns = [],
  paymentOuts = [],
  creditNotes = [],
  debitNotes = [],
  saleUi = {},
  from = "",
  to = "",
} = {}) {
  if (!party) {
    return {
      party: null,
      from: "",
      to: "",
      openingBalance: 0,
      openingBalanceSigned: 0,
      openingBalanceType: "settled",
      totalDebit: 0,
      totalCredit: 0,
      netMovement: 0,
      closingBalance: 0,
      closingBalanceSigned: 0,
      closingBalanceType: "settled",
      transactions: [],
      priorCount: 0,
      totalCount: 0,
    };
  }

  // 1. Gather all transactions for this party
  const allTxns = collectPartyTransactions({
    party,
    sales,
    purchases,
    paymentIns,
    paymentOuts,
    creditNotes,
    debitNotes,
    saleUi,
  });

  // 2. Base opening balance configured on party profile
  const baseOb = amount(party.openingBalance);
  const partyType = String(party.partyType || "").trim().toLowerCase();
  const obType = String(
    party.openingBalanceType ||
    ((partyType === "supplier" || partyType === "vendor") ? "to-pay" : "to-receive")
  ).toLowerCase();

  // In signed ledger convention: + is To Receive (Dr), - is To Pay (Cr)
  let initialSignedOb = obType === "to-pay" ? -baseOb : baseOb;

  // Fallback if balance was stored on party directly
  if (baseOb === 0 && party.balance != null && party.balance !== "") {
    const raw = Number(party.balance);
    if (Number.isFinite(raw)) {
      initialSignedOb = obType === "to-pay" || raw < 0 ? -Math.abs(raw) : raw;
    }
  }

  // 3. Divide transactions into prior (before From Date) and in-range
  const fromYMD = parseYMD(from);
  const toYMD = parseYMD(to);

  const priorTxns = [];
  const inRangeTxns = [];

  for (const txn of allTxns) {
    const d = txn.date;
    if (fromYMD && d && d < fromYMD) {
      priorTxns.push(txn);
    } else if ((!fromYMD || !d || d >= fromYMD) && (!toYMD || !d || d <= toYMD)) {
      inRangeTxns.push(txn);
    }
  }

  // 4. Calculate effective opening balance as of From Date
  const priorDebit = priorTxns.reduce((sum, t) => sum + t.debit, 0);
  const priorCredit = priorTxns.reduce((sum, t) => sum + t.credit, 0);
  const effectiveOpeningSigned = initialSignedOb + priorDebit - priorCredit;

  const openingBalance = Math.abs(effectiveOpeningSigned);
  const openingBalanceType =
    effectiveOpeningSigned > 0.005
      ? "to-receive"
      : effectiveOpeningSigned < -0.005
      ? "to-pay"
      : "settled";

  // 5. Calculate row-by-row running balance for in-range transactions
  let currentRunning = effectiveOpeningSigned;
  const ledgerRows = inRangeTxns.map((t, idx) => {
    currentRunning = currentRunning + t.debit - t.credit;
    const signedBal = currentRunning;
    const balType =
      signedBal > 0.005 ? "to-receive" : signedBal < -0.005 ? "to-pay" : "settled";

    return {
      ...t,
      srNo: idx + 1,
      runningBalanceSigned: signedBal,
      runningBalance: Math.abs(signedBal),
      runningBalanceType: balType,
      runningBalanceFormatted: formatRunningBalance(signedBal),
    };
  });

  // 6. Calculate period totals and closing balance
  const totalDebit = inRangeTxns.reduce((sum, t) => sum + t.debit, 0);
  const totalCredit = inRangeTxns.reduce((sum, t) => sum + t.credit, 0);
  const netMovement = totalDebit - totalCredit;
  const closingSigned = effectiveOpeningSigned + netMovement;

  const closingBalance = Math.abs(closingSigned);
  const closingBalanceType =
    closingSigned > 0.005
      ? "to-receive"
      : closingSigned < -0.005
      ? "to-pay"
      : "settled";

  return {
    party,
    from: fromYMD,
    to: toYMD,
    openingBalance,
    openingBalanceSigned: effectiveOpeningSigned,
    openingBalanceType,
    totalDebit,
    totalCredit,
    netMovement,
    closingBalance,
    closingBalanceSigned: closingSigned,
    closingBalanceType,
    transactions: ledgerRows,
    priorCount: priorTxns.length,
    totalCount: ledgerRows.length,
  };
}
