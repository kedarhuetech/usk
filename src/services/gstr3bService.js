import { parseYMD } from "../utils/billWiseProfit.js";
import { getSaleInvoices } from "./salesStorage.js";
import { getPurchaseBills } from "./purchaseBillsStorage.js";
import { getParties } from "./partiesStorage.js";
import { getCompanyProfile } from "./companyProfileStorage.js";

/**
 * Normalizes month/year string (e.g. "11/2026", "2026-11", "11-2026") to { year, month } numbers.
 */
export function parseMonthYear(val) {
  if (!val) {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  if (typeof val === "string") {
    const s = val.trim();
    // MM/YYYY or MM-YYYY
    const m1 = s.match(/^(\d{1,2})[-\/](\d{4})$/);
    if (m1) {
      return { year: Number(m1[2]), month: Number(m1[1]) };
    }
    // YYYY-MM or YYYY/MM
    const m2 = s.match(/^(\d{4})[-\/](\d{1,2})$/);
    if (m2) {
      return { year: Number(m2[1]), month: Number(m2[2]) };
    }
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Returns formatted start and end dates (YYYY-MM-DD) for a month range.
 */
export function getPeriodDateRange(fromMonthYear, toMonthYear) {
  const from = parseMonthYear(fromMonthYear);
  const to = parseMonthYear(toMonthYear);

  const fromMonthStr = String(from.month).padStart(2, "0");
  const toMonthStr = String(to.month).padStart(2, "0");

  const fromDate = `${from.year}-${fromMonthStr}-01`;
  const lastDay = new Date(to.year, to.month, 0).getDate();
  const toDate = `${to.year}-${toMonthStr}-${String(lastDay).padStart(2, "0")}`;

  return { fromDate, toDate };
}

/**
 * Safely extracts a YYYY-MM-DD date from a transaction record.
 */
export function getRecordDate(rec) {
  if (!rec) return "";
  const raw = rec.form?.invoiceDate || rec.form?.billDate || rec.invoiceDate || rec.billDate || rec.date || rec.createdAt || "";
  return parseYMD(raw);
}

/**
 * Checks if a transaction is voided or cancelled.
 */
export function isRecordCancelled(rec, uiActions = {}) {
  if (!rec) return true;
  if (rec.cancelled || rec.isCancelled) return true;
  const status = String(rec.status || "").trim().toLowerCase();
  if (status === "cancelled" || status === "canceled" || status === "void" || status === "deleted") {
    return true;
  }
  const idStr = String(rec.id || rec.invoiceId || "");
  if (uiActions.cancelled && typeof uiActions.cancelled === "object" && uiActions.cancelled[idStr]) {
    return true;
  }
  if (uiActions.deleted && Array.isArray(uiActions.deleted) && uiActions.deleted.map(String).includes(idStr)) {
    return true;
  }
  return false;
}

/**
 * Safely parses numbers.
 */
function num(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extracts percentage number from a tax rate string (e.g. "GST 18%", "IGST 12%", "5", "NONE" -> 18, 12, 5, 0).
 */
export function extractTaxRateNumber(rateStr) {
  if (!rateStr) return 0;
  const s = String(rateStr).trim().toUpperCase();
  if (s === "NONE" || s === "EXEMPT" || s === "NIL") return 0;
  const match = s.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/**
 * Reads local storage safely.
 */
function readLocal(key) {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Resolves GST breakdown for an item line in an invoice or bill.
 */
export function resolveLineGst(row = {}, isInterstate = false) {
  const calculated = row.calculated || {};
  const qty = Math.max(0, num(row.qty ?? calculated.qty));
  const price = Math.max(0, num(row.price));
  const taxable = num(calculated.taxable ?? (row.priceMode === "With Tax" ? (qty * price) / (1 + extractTaxRateNumber(row.taxRate) / 100) : qty * price));
  const tax = num(calculated.tax);
  const taxRate = extractTaxRateNumber(row.taxRate);

  // If explicit tax breakdown is provided on row or calculated
  const rawCgst = row.cgstAmount ?? calculated.cgst ?? (calculated.cgstAmount);
  const rawSgst = row.sgstAmount ?? calculated.sgst ?? (calculated.sgstAmount);
  const rawIgst = row.igstAmount ?? calculated.igst ?? (calculated.igstAmount);
  const rawCess = row.cessAmount ?? calculated.cess ?? (calculated.cessAmount) ?? 0;

  if (rawCgst != null || rawSgst != null || rawIgst != null) {
    return {
      taxable,
      tax: num(tax || (num(rawCgst) + num(rawSgst) + num(rawIgst) + num(rawCess))),
      taxRate,
      cgst: num(rawCgst),
      sgst: num(rawSgst),
      igst: num(rawIgst),
      cess: num(rawCess),
      isInterstate: num(rawIgst) > 0,
    };
  }

  // Derive tax split based on interstate flag or taxRate prefix
  const isIgstRate = String(row.taxRate || "").toUpperCase().includes("IGST");
  const forceInterstate = isInterstate || isIgstRate;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const cess = num(rawCess);

  if (tax > 0) {
    if (forceInterstate) {
      igst = tax;
    } else {
      cgst = Number((tax / 2).toFixed(2));
      sgst = Number((tax - cgst).toFixed(2));
    }
  }

  return {
    taxable,
    tax,
    taxRate,
    cgst,
    sgst,
    igst,
    cess,
    isInterstate: forceInterstate,
  };
}

/**
 * Main GSTR-3B Calculation Engine
 */
export function calculateGSTR3BData({
  sales = [],
  purchases = [],
  saleReturns = [],
  parties = [],
  companyProfile = null,
  fromMonthYear = "11/2026",
  toMonthYear = "11/2026",
  considerNonTaxAsExempted = false,
  saleUiActions = {},
}) {
  const { fromDate, toDate } = getPeriodDateRange(fromMonthYear, toMonthYear);

  // Home state resolution (defaults to Maharashtra)
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

  // Filter valid transactions by date range
  const salesInPeriod = (sales || []).filter((s) => {
    if (isRecordCancelled(s, saleUiActions)) return false;
    const dt = getRecordDate(s);
    return dt && dt >= fromDate && dt <= toDate;
  });

  const purchasesInPeriod = (purchases || []).filter((p) => {
    if (isRecordCancelled(p)) return false;
    const dt = getRecordDate(p);
    return dt && dt >= fromDate && dt <= toDate;
  });

  const returnsInPeriod = (saleReturns || []).filter((r) => {
    if (isRecordCancelled(r)) return false;
    const dt = getRecordDate(r);
    return dt && dt >= fromDate && dt <= toDate;
  });

  // Diagnostics list for records requiring user review
  const diagnostics = [];

  // ----------------------------------------------------
  // SECTION 1 & 2: OUTWARD SUPPLIES & INTER-STATE DETAILS
  // ----------------------------------------------------
  let s1_otherThanZero_taxable = 0;
  let s1_otherThanZero_igst = 0;
  let s1_otherThanZero_cgst = 0;
  let s1_otherThanZero_sgst = 0;
  let s1_otherThanZero_cess = 0;

  let s1_zeroRated_taxable = 0;
  let s1_zeroRated_igst = 0;
  let s1_zeroRated_cess = 0;

  let s1_nilExempt_taxable = 0;
  let s1_nonGst_taxable = 0;

  // State-wise map for Table 2: Place of Supply -> { unregistered: { taxable, igst }, composition: { taxable, igst }, uin: { taxable, igst } }
  const table2StateMap = new Map();

  salesInPeriod.forEach((sale) => {
    const custName = String(sale.form?.customer || sale.customer || sale.party || sale.partyName || "").trim();
    const party = partyMap.get(custName.toLowerCase()) || {};

    const stateOfSupply = String(
      sale.form?.stateOfSupply || party.state || ""
    ).trim();

    const isExplicitInterstate = stateOfSupply && stateOfSupply.toLowerCase() !== "none" && stateOfSupply.toLowerCase() !== homeState;
    const gstin = String(party.gstin || sale.form?.gstin || "").trim();
    const isGstinInterstate = gstin.length >= 2 && !gstin.startsWith("27") && homeState === "maharashtra";
    const isInterstate = Boolean(isExplicitInterstate || isGstinInterstate);

    const partyGstType = String(party.gstType || "").toLowerCase();
    const isUnregistered = partyGstType.includes("unregistered") || partyGstType.includes("consumer") || !gstin;
    const isComposition = partyGstType.includes("composition");
    const isUin = partyGstType.includes("uin");

    const rows = sale.rows || sale.items || [];
    rows.forEach((row) => {
      if (!row || !row.item) return;
      const gst = resolveLineGst(row, isInterstate);

      const isZeroRate = String(row.taxRate || "").includes("0%");
      const isNilOrExempt = gst.taxRate === 0 && (considerNonTaxAsExempted || isZeroRate || String(row.taxRate || "").toUpperCase() === "NONE");

      if (isNilOrExempt) {
        s1_nilExempt_taxable += gst.taxable;
      } else if (gst.tax > 0) {
        s1_otherThanZero_taxable += gst.taxable;
        s1_otherThanZero_cgst += gst.cgst;
        s1_otherThanZero_sgst += gst.sgst;
        s1_otherThanZero_igst += gst.igst;
        s1_otherThanZero_cess += gst.cess;

        // Populate Table 2 if Interstate and made to Unregistered, Composition, or UIN
        if (gst.isInterstate) {
          const stateKey = stateOfSupply && stateOfSupply.toLowerCase() !== "none" ? stateOfSupply : "Other State";
          if (!table2StateMap.has(stateKey)) {
            table2StateMap.set(stateKey, {
              unregisteredTaxable: 0,
              unregisteredIgst: 0,
              compositionTaxable: 0,
              compositionIgst: 0,
              uinTaxable: 0,
              uinIgst: 0,
            });
          }
          const stateData = table2StateMap.get(stateKey);
          if (isComposition) {
            stateData.compositionTaxable += gst.taxable;
            stateData.compositionIgst += gst.igst;
          } else if (isUin) {
            stateData.uinTaxable += gst.taxable;
            stateData.uinIgst += gst.igst;
          } else if (isUnregistered) {
            stateData.unregisteredTaxable += gst.taxable;
            stateData.unregisteredIgst += gst.igst;
          }
        }
      } else {
        if (considerNonTaxAsExempted) {
          s1_nilExempt_taxable += gst.taxable;
        } else {
          s1_nonGst_taxable += gst.taxable;
        }
      }
    });
  });

  // Adjust for Credit Notes (Sale Returns)
  returnsInPeriod.forEach((cn) => {
    const custName = String(cn.party || "").trim();
    const party = partyMap.get(custName.toLowerCase()) || {};
    const stateOfSupply = String(party.state || "").trim();
    const isInterstate = stateOfSupply && stateOfSupply.toLowerCase() !== homeState;

    const rows = cn.rows || [];
    rows.forEach((row) => {
      const gst = resolveLineGst(row, isInterstate);
      if (gst.tax > 0) {
        s1_otherThanZero_taxable = Math.max(0, s1_otherThanZero_taxable - gst.taxable);
        s1_otherThanZero_cgst = Math.max(0, s1_otherThanZero_cgst - gst.cgst);
        s1_otherThanZero_sgst = Math.max(0, s1_otherThanZero_sgst - gst.sgst);
        s1_otherThanZero_igst = Math.max(0, s1_otherThanZero_igst - gst.igst);
      }
    });
  });

  // ----------------------------------------------------
  // SECTION 1(d) & 3: INWARD SUPPLIES & ELIGIBLE ITC
  // ----------------------------------------------------
  let s1_rcm_taxable = 0;
  let s1_rcm_igst = 0;
  let s1_rcm_cgst = 0;
  let s1_rcm_sgst = 0;
  let s1_rcm_cess = 0;

  // Table 3 ITC breakdown
  let itc_importGoods_igst = 0;
  let itc_importGoods_cess = 0;

  let itc_importServices_igst = 0;
  let itc_importServices_cess = 0;

  let itc_rcm_igst = 0;
  let itc_rcm_cgst = 0;
  let itc_rcm_sgst = 0;
  let itc_rcm_cess = 0;

  let itc_isd_igst = 0;
  let itc_isd_cgst = 0;
  let itc_isd_sgst = 0;
  let itc_isd_cess = 0;

  let itc_allOther_igst = 0;
  let itc_allOther_cgst = 0;
  let itc_allOther_sgst = 0;
  let itc_allOther_cess = 0;

  let itc_ineligible_17_5_igst = 0;
  let itc_ineligible_17_5_cgst = 0;
  let itc_ineligible_17_5_sgst = 0;
  let itc_ineligible_17_5_cess = 0;

  let itc_ineligible_other_igst = 0;
  let itc_ineligible_other_cgst = 0;
  let itc_ineligible_other_sgst = 0;
  let itc_ineligible_other_cess = 0;

  // Table 4: Exempt, Nil-rated & Non-GST inward supplies
  let s4_exempt_interstate = 0;
  let s4_exempt_intrastate = 0;
  let s4_nongst_interstate = 0;
  let s4_nongst_intrastate = 0;

  purchasesInPeriod.forEach((bill) => {
    const suppName = String(bill.form?.customer || bill.partyName || bill.supplier || bill.party || "").trim();
    const party = partyMap.get(suppName.toLowerCase()) || {};

    const stateOfSupply = String(bill.form?.stateOfSupply || party.state || "").trim();
    const isExplicitInterstate = stateOfSupply && stateOfSupply.toLowerCase() !== "none" && stateOfSupply.toLowerCase() !== homeState;
    const gstin = String(party.gstin || bill.form?.gstin || "").trim();
    const isGstinInterstate = gstin.length >= 2 && !gstin.startsWith("27") && homeState === "maharashtra";
    const isInterstate = Boolean(isExplicitInterstate || isGstinInterstate);

    const isRcm = Boolean(bill.isReverseCharge || bill.reverseCharge || bill.form?.isReverseCharge);
    const isCompositionSupplier = String(party.gstType || "").toLowerCase().includes("composition");

    const rows = bill.rows || bill.items || [];
    rows.forEach((row) => {
      if (!row || !row.item) return;
      const gst = resolveLineGst(row, isInterstate);

      if (isRcm) {
        // Table 1(d) Inward supplies liable to reverse charge
        s1_rcm_taxable += gst.taxable;
        s1_rcm_cgst += gst.cgst;
        s1_rcm_sgst += gst.sgst;
        s1_rcm_igst += gst.igst;
        s1_rcm_cess += gst.cess;

        // Table 3(A)(3) ITC on RCM
        itc_rcm_cgst += gst.cgst;
        itc_rcm_sgst += gst.sgst;
        itc_rcm_igst += gst.igst;
        itc_rcm_cess += gst.cess;
      } else if (gst.tax > 0) {
        // Normal eligible purchase -> Table 3(A)(5) All other ITC
        itc_allOther_cgst += gst.cgst;
        itc_allOther_sgst += gst.sgst;
        itc_allOther_igst += gst.igst;
        itc_allOther_cess += gst.cess;
      } else {
        // 0% or exempt purchase -> Table 4
        if (isCompositionSupplier || considerNonTaxAsExempted || String(row.taxRate || "").includes("0%")) {
          if (isInterstate) s4_exempt_interstate += gst.taxable;
          else s4_exempt_intrastate += gst.taxable;
        } else {
          if (isInterstate) s4_nongst_interstate += gst.taxable;
          else s4_nongst_intrastate += gst.taxable;
        }
      }
    });
  });

  // Calculate Net Tax Payable
  const totalOutwardTax = s1_otherThanZero_igst + s1_otherThanZero_cgst + s1_otherThanZero_sgst + s1_otherThanZero_cess;
  const totalRcmTax = s1_rcm_igst + s1_rcm_cgst + s1_rcm_sgst + s1_rcm_cess;
  const totalEligibleItc =
    itc_allOther_igst + itc_allOther_cgst + itc_allOther_sgst + itc_allOther_cess +
    itc_rcm_igst + itc_rcm_cgst + itc_rcm_sgst + itc_rcm_cess;
  const netTaxPayable = totalOutwardTax - totalEligibleItc + totalRcmTax;

  // Prepare Table 2 rows
  const table2Rows = Array.from(table2StateMap.entries()).map(([state, values]) => ({
    state,
    ...values,
  }));

  return {
    period: { fromDate, toDate, fromMonthYear, toMonthYear },
    summary: {
      totalOutwardTax,
      totalRcmTax,
      totalEligibleItc,
      netTaxPayable,
    },
    table1: {
      outwardTaxable: {
        nature: "Outward taxable supplies (other than zero rated, nil rated and exempted)",
        taxable: s1_otherThanZero_taxable,
        igst: s1_otherThanZero_igst,
        cgst: s1_otherThanZero_cgst,
        sgst: s1_otherThanZero_sgst,
        cess: s1_otherThanZero_cess,
      },
      zeroRated: {
        nature: "Outward taxable supplies (zero rated)",
        taxable: s1_zeroRated_taxable,
        igst: s1_zeroRated_igst,
        cgst: 0,
        sgst: 0,
        cess: s1_zeroRated_cess,
      },
      nilExempt: {
        nature: "Other outward supplies (nil rated, exempted)",
        taxable: s1_nilExempt_taxable,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      },
      inwardRcm: {
        nature: "Inward supplies (liable to reverse charge)",
        taxable: s1_rcm_taxable,
        igst: s1_rcm_igst,
        cgst: s1_rcm_cgst,
        sgst: s1_rcm_sgst,
        cess: s1_rcm_cess,
      },
      nonGst: {
        nature: "Non-GST outward supplies",
        taxable: s1_nonGst_taxable,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      },
    },
    table2: table2Rows,
    table3: {
      available: {
        importGoods: { igst: itc_importGoods_igst, cgst: 0, sgst: 0, cess: itc_importGoods_cess },
        importServices: { igst: itc_importServices_igst, cgst: 0, sgst: 0, cess: itc_importServices_cess },
        rcm: { igst: itc_rcm_igst, cgst: itc_rcm_cgst, sgst: itc_rcm_sgst, cess: itc_rcm_cess },
        isd: { igst: itc_isd_igst, cgst: itc_isd_cgst, sgst: itc_isd_sgst, cess: itc_isd_cess },
        allOther: { igst: itc_allOther_igst, cgst: itc_allOther_cgst, sgst: itc_allOther_sgst, cess: itc_allOther_cess },
      },
      ineligible: {
        section17_5: { igst: itc_ineligible_17_5_igst, cgst: itc_ineligible_17_5_cgst, sgst: itc_ineligible_17_5_sgst, cess: itc_ineligible_17_5_cess },
        others: { igst: itc_ineligible_other_igst, cgst: itc_ineligible_other_cgst, sgst: itc_ineligible_other_sgst, cess: itc_ineligible_other_cess },
      },
    },
    table4: {
      compositionExempt: {
        nature: "From a supplier under composition scheme, Exempt and Nil rated supply",
        interstate: s4_exempt_interstate,
        intrastate: s4_exempt_intrastate,
      },
      nonGst: {
        nature: "Non GST supply",
        interstate: s4_nongst_interstate,
        intrastate: s4_nongst_intrastate,
      },
    },
    diagnostics,
  };
}

/**
 * Backward compatibility wrapper for existing simple signature
 */
export function calculateGSTR3B({ sales, purchases, periodFrom, periodTo }) {
  const d1 = parseYMD(periodFrom);
  const m1 = d1 ? `${d1.slice(5, 7)}/${d1.slice(0, 4)}` : "11/2026";
  const parties = readLocal("ledgerly:parties.v1");
  const companyProfile = readLocal("ledgerly:companyProfile.v1")?.[0] || {};
  const saleReturns = readLocal("ledgerly:saleReturns.v1");

  const full = calculateGSTR3BData({
    sales,
    purchases,
    saleReturns,
    parties,
    companyProfile,
    fromMonthYear: m1,
    toMonthYear: m1,
  });

  return {
    summary: [
      { section: "Outward Taxable Supplies", description: "Total tax on outward supplies", amount: full.summary.totalOutwardTax },
      { section: "Reverse Charge", description: "Tax on reverse‑charge purchases", amount: full.summary.totalRcmTax },
      { section: "Eligible ITC", description: "Input tax credit claimed", amount: full.summary.totalEligibleItc },
      { section: "Net Tax Payable", description: "Tax liability after ITC", amount: full.summary.netTaxPayable },
    ],
    full,
  };
}
