import { parseYMD } from "./billWiseProfit.js";
import { getAppSettings } from "../services/appSettingsStorage.js";
import { getCompanyProfile } from "../services/companyProfileStorage.js";

/**
 * Standard known GST rates in India / USV.
 */
export const KNOWN_GST_RATES = Object.freeze([0, 0.25, 3, 5, 12, 18, 28, 40]);

/**
 * Normalizes any date to YYYY-MM-DD.
 */
export { parseYMD };

export function formatDateDMY(val) {
  const ymd = parseYMD(val);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Returns date range object { from, to } for standard presets.
 */
export function getPresetDateRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (preset) {
    case "Today":
      return { from: fmt(now), to: fmt(now) };
    case "This Month":
      return {
        from: `${y}-${pad(m + 1)}-01`,
        to: fmt(new Date(y, m + 1, 0)),
      };
    case "Last Month": {
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      return {
        from: `${prevY}-${pad(prevM + 1)}-01`,
        to: fmt(new Date(prevY, prevM + 1, 0)),
      };
    }
    case "This Quarter": {
      const qStartMonth = Math.floor(m / 3) * 3;
      return {
        from: `${y}-${pad(qStartMonth + 1)}-01`,
        to: fmt(new Date(y, qStartMonth + 3, 0)),
      };
    }
    case "This Year": {
      const fyStartYear = m >= 3 ? y : y - 1;
      return {
        from: `${fyStartYear}-04-01`,
        to: `${fyStartYear + 1}-03-31`,
      };
    }
    case "All Time":
      return { from: "", to: "" };
    default:
      return {
        from: `${y}-${pad(m + 1)}-01`,
        to: fmt(new Date(y, m + 1, 0)),
      };
  }
}

/**
 * Safely parses numbers, defaulting to 0.
 */
export function num(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Round a number to 2 decimal places.
 */
export function round2(val) {
  return Number(Math.round(num(val) + "e2") + "e-2");
}

/**
 * Extracts percentage number from a tax rate string or number.
 * Examples: "GST 18%" -> 18, "IGST 12%" -> 12, "Exempt" -> 0, "NONE" -> 0, 5 -> 5.
 */
export function extractTaxRateNumber(rateStr) {
  if (rateStr == null) return 0;
  if (typeof rateStr === "number") return Math.max(0, rateStr);
  const s = String(rateStr).trim().toUpperCase();
  if (s === "NONE" || s === "EXEMPT" || s === "NIL" || s === "NON-GST") {
    return 0;
  }
  const match = s.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/**
 * Formats a tax rate number into a user-friendly display string.
 */
export function formatTaxRateLabel(rateNum) {
  const r = num(rateNum);
  if (r === 0) return "0% (Exempt / Nil)";
  return `${r}%`;
}

/**
 * Checks if a transaction is cancelled, voided, or deleted.
 */
export function isTransactionCancelled(rec, uiActions = {}) {
  if (!rec) return true;
  if (rec.cancelled || rec.isCancelled || rec.deleted || rec.isDeleted) {
    return true;
  }
  const status = String(rec.status || "").trim().toLowerCase();
  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "void" ||
    status === "deleted"
  ) {
    return true;
  }
  const idStr = String(rec.id || rec.invoiceId || "");
  if (
    uiActions.cancelled &&
    typeof uiActions.cancelled === "object" &&
    uiActions.cancelled[idStr]
  ) {
    return true;
  }
  if (
    uiActions.deleted &&
    Array.isArray(uiActions.deleted) &&
    uiActions.deleted.map(String).includes(idStr)
  ) {
    return true;
  }
  return false;
}

/**
 * Resolves GST breakdown for an item line in an invoice or bill.
 */
export function resolveRowGst(row = {}, isInterstate = false) {
  const calculated = row.calculated || {};
  const qty = Math.max(0, num(row.qty ?? calculated.qty));
  const price = Math.max(0, num(row.price));
  const taxRateNum = extractTaxRateNumber(row.taxRate ?? calculated.taxRate);

  let taxable = 0;
  if (calculated.taxable != null) {
    taxable = num(calculated.taxable);
  } else if (row.priceMode === "With Tax" && taxRateNum > 0) {
    const gross = qty * price;
    taxable = gross / (1 + taxRateNum / 100);
  } else {
    taxable = qty * price;
  }

  // Deduct discount if not already deducted
  if (calculated.taxable == null && (row.discountAmount || row.discountPercent)) {
    const discPct = Math.min(100, Math.max(0, num(row.discountPercent)));
    const discAmt = num(row.discountAmount);
    const effectiveDisc =
      row.discountMode === "amount" && row.discountAmount !== ""
        ? discAmt
        : taxable * (discPct / 100);
    taxable = Math.max(0, taxable - effectiveDisc);
  }

  taxable = round2(taxable);

  // If explicit tax breakdown is provided on row or calculated
  const rawCgst = row.cgstAmount ?? calculated.cgst ?? calculated.cgstAmount;
  const rawSgst = row.sgstAmount ?? calculated.sgst ?? calculated.sgstAmount;
  const rawIgst = row.igstAmount ?? calculated.igst ?? calculated.igstAmount;
  const rawCess = row.cessAmount ?? calculated.cess ?? calculated.cessAmount ?? 0;

  if (rawCgst != null || rawSgst != null || rawIgst != null) {
    const cgst = round2(rawCgst);
    const sgst = round2(rawSgst);
    const igst = round2(rawIgst);
    const cess = round2(rawCess);
    const tax = round2(cgst + sgst + igst + cess);
    return {
      taxable,
      taxRate: taxRateNum,
      cgst,
      sgst,
      igst,
      cess,
      tax,
      isInterstate: igst > 0,
    };
  }

  // Derive tax based on rate and interstate flag
  let totalTax = 0;
  if (calculated.tax != null) {
    totalTax = num(calculated.tax);
  } else if (taxRateNum > 0) {
    totalTax = taxable * (taxRateNum / 100);
  }

  const cess = round2(rawCess);
  totalTax = round2(totalTax + cess);

  const isIgstRate = String(row.taxRate || "").toUpperCase().includes("IGST");
  const effectiveInterstate = isInterstate || isIgstRate;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (totalTax > 0) {
    if (effectiveInterstate) {
      igst = round2(totalTax - cess);
    } else {
      const baseTax = Math.max(0, totalTax - cess);
      cgst = round2(baseTax / 2);
      sgst = round2(baseTax - cgst);
    }
  }

  return {
    taxable,
    taxRate: taxRateNum,
    cgst,
    sgst,
    igst,
    cess,
    tax: totalTax,
    isInterstate: effectiveInterstate,
  };
}

/**
 * Extracts line tax items from any Sale Invoice, Purchase Bill, Sale Return, or Purchase Return.
 */
export function extractTransactionTaxLines(transaction, type = "Sale", options = {}) {
  const { homeState = "maharashtra", partyMap = new Map() } = options;

  if (!transaction) return [];

  const partyName = String(
    transaction.form?.customer ||
      transaction.form?.supplier ||
      transaction.customer ||
      transaction.party ||
      transaction.partyName ||
      transaction.supplier ||
      ""
  ).trim();

  const party = partyMap.get(partyName.toLowerCase()) || {};

  const stateOfSupply = String(
    transaction.form?.stateOfSupply ||
      party.state ||
      transaction.stateOfSupply ||
      ""
  ).trim();

  const isExplicitInterstate =
    stateOfSupply &&
    stateOfSupply.toLowerCase() !== "none" &&
    stateOfSupply.toLowerCase() !== homeState.toLowerCase();

  const gstin = String(
    party.gstin ||
      transaction.form?.gstin ||
      transaction.gstin ||
      ""
  ).trim();

  const isGstinInterstate =
    gstin.length >= 2 &&
    !gstin.startsWith("27") &&
    homeState.toLowerCase() === "maharashtra";

  const isInterstate = Boolean(isExplicitInterstate || isGstinInterstate);

  const txDate =
    parseYMD(
      transaction.form?.invoiceDate ||
        transaction.form?.billDate ||
        transaction.invoiceDate ||
        transaction.billDate ||
        transaction.date ||
        transaction.createdAt
    ) || "";

  const txNumber = String(
    transaction.form?.invoiceNumber ||
      transaction.form?.billNumber ||
      transaction.invoiceNumber ||
      transaction.billNumber ||
      transaction.number ||
      transaction.id ||
      ""
  );

  const txId = String(transaction.id || transaction.invoiceId || txNumber);
  const rows = transaction.rows || transaction.items || [];

  if (rows.length === 0) {
    // Single header-level transaction without explicit row items
    const totals = transaction.totals || {};
    const tax = round2(totals.tax ?? totals.taxAmount ?? 0);
    const taxable = round2(
      totals.taxable ??
        (totals.finalTotal ? totals.finalTotal - tax : transaction.amount || 0)
    );
    const taxRate =
      extractTaxRateNumber(transaction.taxRate ?? totals.taxRate) ||
      (taxable > 0 && tax > 0 ? round2((tax / taxable) * 100) : 0);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (tax > 0) {
      if (isInterstate) {
        igst = tax;
      } else {
        cgst = round2(tax / 2);
        sgst = round2(tax - cgst);
      }
    }

    return [
      {
        transactionId: txId,
        transactionNumber: txNumber,
        transactionType: type,
        date: txDate,
        party: partyName || "General",
        taxRate,
        rateLabel: formatTaxRateLabel(taxRate),
        taxable,
        cgst,
        sgst,
        igst,
        cess: 0,
        tax,
        invoiceTotal: round2(totals.finalTotal ?? (taxable + tax)),
        isInterstate,
        status: transaction.status || "Paid",
        itemDescription: "Consolidated Supply",
        rawTransaction: transaction,
      },
    ];
  }

  // Multi-row transaction
  return rows
    .filter((row) => row && (row.item || row.qty || row.price))
    .map((row, idx) => {
      const gst = resolveRowGst(row, isInterstate);
      return {
        transactionId: txId,
        transactionNumber: txNumber,
        transactionType: type,
        date: txDate,
        party: partyName || "General",
        taxRate: gst.taxRate,
        rateLabel: formatTaxRateLabel(gst.taxRate),
        taxable: gst.taxable,
        cgst: gst.cgst,
        sgst: gst.sgst,
        igst: gst.igst,
        cess: gst.cess,
        tax: gst.tax,
        invoiceTotal: round2(
          transaction.totals?.finalTotal ?? (gst.taxable + gst.tax)
        ),
        isInterstate: gst.isInterstate,
        status: transaction.status || "Paid",
        itemDescription: row.item || `Item ${idx + 1}`,
        rawRow: row,
        rawTransaction: transaction,
      };
    });
}

/**
 * Compiles all active GST lines across Sale Invoices, Purchase Bills, and optional Returns.
 */
export function compileGstData({
  sales = [],
  purchases = [],
  saleReturns = [],
  purchaseReturns = [],
  parties = [],
  companyProfile = null,
  saleUiActions = {},
}) {
  const homeState = (companyProfile?.state || "Maharashtra").trim().toLowerCase();

  // Create party lookup map
  const partyMap = new Map();
  (parties || []).forEach((p) => {
    if (!p) return;
    const nameKey = String(p.partyName || p.name || "").trim().toLowerCase();
    const idKey = String(p.id || "").trim();
    if (nameKey) partyMap.set(nameKey, p);
    if (idKey) partyMap.set(idKey, p);
  });

  const opts = { homeState, partyMap };
  const lines = [];

  // 1. Sale Invoices (Outward Supplies)
  const seenSaleIds = new Set();
  sales.forEach((s) => {
    if (isTransactionCancelled(s, saleUiActions)) return;
    const id = String(s.id || s.invoiceId || s.invoiceNumber || "");
    if (id && seenSaleIds.has(id)) return;
    if (id) seenSaleIds.add(id);

    const sLines = extractTransactionTaxLines(s, "Sale", opts);
    lines.push(...sLines);
  });

  // 2. Purchase Bills (Inward Supplies)
  const seenPurchaseIds = new Set();
  purchases.forEach((p) => {
    if (isTransactionCancelled(p)) return;
    const id = String(p.id || p.invoiceId || p.billNumber || "");
    if (id && seenPurchaseIds.has(id)) return;
    if (id) seenPurchaseIds.add(id);

    const pLines = extractTransactionTaxLines(p, "Purchase", opts);
    lines.push(...pLines);
  });

  // 3. Sale Returns / Credit Notes
  const seenReturnIds = new Set();
  (saleReturns || []).forEach((sr) => {
    if (isTransactionCancelled(sr)) return;
    const id = String(sr.id || sr.returnNumber || "");
    if (id && seenReturnIds.has(id)) return;
    if (id) seenReturnIds.add(id);

    const rLines = extractTransactionTaxLines(sr, "Credit Note", opts);
    lines.push(...rLines);
  });

  // 4. Purchase Returns / Debit Notes
  const seenDebitIds = new Set();
  (purchaseReturns || []).forEach((pr) => {
    if (isTransactionCancelled(pr)) return;
    const id = String(pr.id || pr.returnNumber || "");
    if (id && seenDebitIds.has(id)) return;
    if (id) seenDebitIds.add(id);

    const dLines = extractTransactionTaxLines(pr, "Debit Note", opts);
    lines.push(...dLines);
  });

  return lines;
}

/**
 * Filters compiled GST lines by date range, transaction type, rate, and search.
 */
export function filterGstLines(lines = [], filters = {}) {
  const {
    from = "",
    to = "",
    transactionType = "All", // "All" | "Sale" | "Purchase"
    rate = "All", // "All" | number (e.g. 18) | string ("18%")
    search = "",
  } = filters;

  const q = search.trim().toLowerCase();
  const rateFilterNum =
    rate === "All" || rate === "" ? null : extractTaxRateNumber(rate);

  return lines.filter((line) => {
    if (!line) return false;

    // Date range filter
    if (from && (!line.date || line.date < from)) return false;
    if (to && (!line.date || line.date > to)) return false;

    // Transaction type filter
    if (transactionType !== "All") {
      if (transactionType === "Sale" || transactionType === "Sales") {
        if (line.transactionType !== "Sale" && line.transactionType !== "Credit Note") {
          return false;
        }
      } else if (transactionType === "Purchase" || transactionType === "Purchases") {
        if (line.transactionType !== "Purchase" && line.transactionType !== "Debit Note") {
          return false;
        }
      } else if (
        line.transactionType.toLowerCase() !== transactionType.toLowerCase()
      ) {
        return false;
      }
    }

    // GST Rate filter
    if (rateFilterNum !== null) {
      if (Math.abs(line.taxRate - rateFilterNum) > 0.001) {
        return false;
      }
    }

    // Search query filter
    if (q) {
      const match =
        line.transactionNumber.toLowerCase().includes(q) ||
        line.party.toLowerCase().includes(q) ||
        line.itemDescription.toLowerCase().includes(q) ||
        line.rateLabel.toLowerCase().includes(q) ||
        String(line.taxable).includes(q) ||
        String(line.tax).includes(q);
      if (!match) return false;
    }

    return true;
  });
}

/**
 * Aggregates filtered GST lines by GST rate and computes report summary metrics.
 */
export function calculateGstRateMetrics(filteredLines = []) {
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;
  let totalTax = 0;

  // Rate aggregation map: rateNumber -> aggregation object
  const rateMap = new Map();

  // Distinct transaction tracker for rate: rateNumber -> Set of transactionIds
  const rateTxSet = new Map();
  const globalTxSet = new Set();

  filteredLines.forEach((line) => {
    const isNegative =
      line.transactionType === "Credit Note" ||
      line.transactionType === "Debit Note";

    const factor = isNegative ? -1 : 1;

    const taxable = line.taxable * factor;
    const cgst = line.cgst * factor;
    const sgst = line.sgst * factor;
    const igst = line.igst * factor;
    const cess = (line.cess || 0) * factor;
    const tax = line.tax * factor;

    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalCess += cess;
    totalTax += tax;

    globalTxSet.add(line.transactionId);

    const rNum = line.taxRate;
    if (!rateMap.has(rNum)) {
      rateMap.set(rNum, {
        rate: rNum,
        rateLabel: line.rateLabel,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        tax: 0,
      });
      rateTxSet.set(rNum, new Set());
    }

    const cur = rateMap.get(rNum);
    cur.taxable += taxable;
    cur.cgst += cgst;
    cur.sgst += sgst;
    cur.igst += igst;
    cur.cess += cess;
    cur.tax += tax;

    rateTxSet.get(rNum).add(line.transactionId);
  });

  totalTaxable = round2(totalTaxable);
  totalCgst = round2(totalCgst);
  totalSgst = round2(totalSgst);
  totalIgst = round2(totalIgst);
  totalCess = round2(totalCess);
  totalTax = round2(totalTax);

  // Format rate breakdown rows sorted in descending order of tax rate
  const rateBreakdown = Array.from(rateMap.values())
    .map((item) => {
      const txCount = rateTxSet.get(item.rate)?.size || 0;
      return {
        rate: item.rate,
        rateLabel: item.rateLabel,
        transactionCount: txCount,
        taxable: round2(item.taxable),
        cgst: round2(item.cgst),
        sgst: round2(item.sgst),
        igst: round2(item.igst),
        cess: round2(item.cess),
        tax: round2(item.tax),
        percentageOfTax:
          totalTax > 0 ? round2((item.tax / totalTax) * 100) : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  return {
    totalTaxable,
    totalCgst,
    totalSgst,
    totalIgst,
    totalCess,
    totalTax,
    totalTransactions: globalTxSet.size,
    rateBreakdown,
  };
}

/**
 * Calculates comprehensive GST summary for Sales, Purchases, and Overall Net difference.
 */
export function compileGstSummary(filteredLines = []) {
  const salesSummary = {
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    cess: 0,
    tax: 0,
    count: 0,
  };

  const purchaseSummary = {
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    cess: 0,
    tax: 0,
    count: 0,
  };

  const saleTxIds = new Set();
  const purchaseTxIds = new Set();

  filteredLines.forEach((line) => {
    const isSale =
      line.transactionType === "Sale" || line.transactionType === "Credit Note";
    const isPurchase =
      line.transactionType === "Purchase" || line.transactionType === "Debit Note";
    const factor =
      line.transactionType === "Credit Note" || line.transactionType === "Debit Note"
        ? -1
        : 1;

    const taxable = line.taxable * factor;
    const cgst = line.cgst * factor;
    const sgst = line.sgst * factor;
    const igst = line.igst * factor;
    const cess = (line.cess || 0) * factor;
    const tax = line.tax * factor;

    if (isSale) {
      salesSummary.taxable += taxable;
      salesSummary.cgst += cgst;
      salesSummary.sgst += sgst;
      salesSummary.igst += igst;
      salesSummary.cess += cess;
      salesSummary.tax += tax;
      saleTxIds.add(line.transactionId);
    } else if (isPurchase) {
      purchaseSummary.taxable += taxable;
      purchaseSummary.cgst += cgst;
      purchaseSummary.sgst += sgst;
      purchaseSummary.igst += igst;
      purchaseSummary.cess += cess;
      purchaseSummary.tax += tax;
      purchaseTxIds.add(line.transactionId);
    }
  });

  salesSummary.taxable = round2(salesSummary.taxable);
  salesSummary.cgst = round2(salesSummary.cgst);
  salesSummary.sgst = round2(salesSummary.sgst);
  salesSummary.igst = round2(salesSummary.igst);
  salesSummary.cess = round2(salesSummary.cess);
  salesSummary.tax = round2(salesSummary.tax);
  salesSummary.count = saleTxIds.size;

  purchaseSummary.taxable = round2(purchaseSummary.taxable);
  purchaseSummary.cgst = round2(purchaseSummary.cgst);
  purchaseSummary.sgst = round2(purchaseSummary.sgst);
  purchaseSummary.igst = round2(purchaseSummary.igst);
  purchaseSummary.cess = round2(purchaseSummary.cess);
  purchaseSummary.tax = round2(purchaseSummary.tax);
  purchaseSummary.count = purchaseTxIds.size;

  const totalSalesGst = salesSummary.tax;
  const totalPurchaseGst = purchaseSummary.tax;
  const netDifference = round2(totalSalesGst - totalPurchaseGst);

  return {
    sales: salesSummary,
    purchases: purchaseSummary,
    overall: {
      totalSalesGst,
      totalPurchaseGst,
      netDifference,
      totalTaxable: round2(salesSummary.taxable + purchaseSummary.taxable),
      totalCgst: round2(salesSummary.cgst + purchaseSummary.cgst),
      totalSgst: round2(salesSummary.sgst + purchaseSummary.sgst),
      totalIgst: round2(salesSummary.igst + purchaseSummary.igst),
      totalTax: round2(totalSalesGst + totalPurchaseGst),
      totalTransactions: saleTxIds.size + purchaseTxIds.size,
    },
  };
}

/**
 * Consolidates lines into transaction-level voucher records.
 */
export function groupLinesByTransaction(filteredLines = []) {
  const map = new Map();

  filteredLines.forEach((line) => {
    const key = `${line.transactionType}-${line.transactionId}`;
    if (!map.has(key)) {
      map.set(key, {
        id: line.transactionId,
        transactionNumber: line.transactionNumber,
        date: line.date,
        party: line.party,
        transactionType: line.transactionType,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        tax: 0,
        invoiceTotal: line.invoiceTotal,
        status: line.status,
        rates: new Set(),
        items: [],
      });
    }

    const tx = map.get(key);
    tx.taxable = round2(tx.taxable + line.taxable);
    tx.cgst = round2(tx.cgst + line.cgst);
    tx.sgst = round2(tx.sgst + line.sgst);
    tx.igst = round2(tx.igst + line.igst);
    tx.cess = round2(tx.cess + (line.cess || 0));
    tx.tax = round2(tx.tax + line.tax);
    tx.rates.add(line.rateLabel);
    tx.items.push(line);
  });

  return Array.from(map.values()).map((tx) => ({
    ...tx,
    ratesLabel: Array.from(tx.rates).join(", "),
  }));
}

