import { useState, useMemo, useEffect } from "react";
import {
  FiCalendar,
  FiPrinter,
  FiRefreshCw,
  FiAlertCircle,
  FiInfo,
  FiFileText,
} from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";

import { getSaleInvoices } from "../../services/salesStorage.js";
import { getPurchaseBills } from "../../services/purchaseBillsStorage.js";
import { getParties } from "../../services/partiesStorage.js";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";
import { calculateGSTR3BData } from "../../services/gstr3bService.js";

function readLocal(key) {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function readSaleUiActions() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    return JSON.parse(window.localStorage.getItem("ledgerly:saleInvoiceUiActions.v1") || "{}");
  } catch {
    return {};
  }
}

function formatAmount(val) {
  const n = Number(val || 0);
  if (n === 0) return "0";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrency(val) {
  const n = Number(val || 0);
  return `₹ ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function GSTR3BReport() {
  // Current month state (default 11/2026 matching screenshots)
  const [fromMonthYear, setFromMonthYear] = useState("11/2026");
  const [toMonthYear, setToMonthYear] = useState("11/2026");
  const [considerNonTaxAsExempted, setConsiderNonTaxAsExempted] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Synchronize on business data events
  useEffect(() => {
    const handler = () => setRefreshTrigger((k) => k + 1);
    window.addEventListener("ledgerly:business-data-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Master records loading
  const sales = useMemo(() => {
    try {
      return getSaleInvoices() || [];
    } catch {
      return readLocal("ledgerly:saleInvoices.v1");
    }
  }, [refreshTrigger]);

  const purchases = useMemo(() => {
    try {
      return getPurchaseBills() || [];
    } catch {
      return readLocal("ledgerly:purchaseBills.v1");
    }
  }, [refreshTrigger]);

  const parties = useMemo(() => {
    try {
      return getParties() || [];
    } catch {
      return readLocal("ledgerly:parties.v1");
    }
  }, [refreshTrigger]);

  const companyProfile = useMemo(() => {
    try {
      return getCompanyProfile();
    } catch {
      return readLocal("ledgerly:companyProfile.v1")?.[0] || {};
    }
  }, [refreshTrigger]);

  const saleReturns = useMemo(() => {
    return readLocal("ledgerly:saleReturns.v1");
  }, [refreshTrigger]);

  const saleUiActions = useMemo(() => {
    return readSaleUiActions();
  }, [refreshTrigger]);

  // Main calculation result
  const gstr3b = useMemo(() => {
    return calculateGSTR3BData({
      sales,
      purchases,
      saleReturns,
      parties,
      companyProfile,
      fromMonthYear,
      toMonthYear,
      considerNonTaxAsExempted,
      saleUiActions,
    });
  }, [sales, purchases, saleReturns, parties, companyProfile, fromMonthYear, toMonthYear, considerNonTaxAsExempted, saleUiActions]);

  // Export to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Table 1 Sheet
    const t1Rows = [
      ["Nature Of Supplies", "Total Taxable Value", "Integrated Tax", "Central Tax", "State/UT Tax", "Cess"],
      [
        gstr3b.table1.outwardTaxable.nature,
        gstr3b.table1.outwardTaxable.taxable,
        gstr3b.table1.outwardTaxable.igst,
        gstr3b.table1.outwardTaxable.cgst,
        gstr3b.table1.outwardTaxable.sgst,
        gstr3b.table1.outwardTaxable.cess,
      ],
      [
        gstr3b.table1.zeroRated.nature,
        gstr3b.table1.zeroRated.taxable,
        gstr3b.table1.zeroRated.igst,
        gstr3b.table1.zeroRated.cgst,
        gstr3b.table1.zeroRated.sgst,
        gstr3b.table1.zeroRated.cess,
      ],
      [
        gstr3b.table1.nilExempt.nature,
        gstr3b.table1.nilExempt.taxable,
        gstr3b.table1.nilExempt.igst,
        gstr3b.table1.nilExempt.cgst,
        gstr3b.table1.nilExempt.sgst,
        gstr3b.table1.nilExempt.cess,
      ],
      [
        gstr3b.table1.inwardRcm.nature,
        gstr3b.table1.inwardRcm.taxable,
        gstr3b.table1.inwardRcm.igst,
        gstr3b.table1.inwardRcm.cgst,
        gstr3b.table1.inwardRcm.sgst,
        gstr3b.table1.inwardRcm.cess,
      ],
      [
        gstr3b.table1.nonGst.nature,
        gstr3b.table1.nonGst.taxable,
        gstr3b.table1.nonGst.igst,
        gstr3b.table1.nonGst.cgst,
        gstr3b.table1.nonGst.sgst,
        gstr3b.table1.nonGst.cess,
      ],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(t1Rows);
    XLSX.utils.book_append_sheet(wb, ws1, "Table 1 Outward Supplies");

    // Table 2 Sheet
    const t2Rows = [
      [
        "Place Of Supply (State/UT)",
        "Unregistered - Taxable",
        "Unregistered - IGST",
        "Composition - Taxable",
        "Composition - IGST",
        "UIN - Taxable",
        "UIN - IGST",
      ],
      ...(gstr3b.table2.length > 0
        ? gstr3b.table2.map((r) => [
            r.state,
            r.unregisteredTaxable,
            r.unregisteredIgst,
            r.compositionTaxable,
            r.compositionIgst,
            r.uinTaxable,
            r.uinIgst,
          ])
        : [["None", 0, 0, 0, 0, 0, 0]]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(t2Rows);
    XLSX.utils.book_append_sheet(wb, ws2, "Table 2 Inter-State");

    // Table 3 Sheet (ITC)
    const t3Rows = [
      ["Details", "Integrated Tax", "Central Tax", "State/UT Tax", "Cess"],
      ["(A) ITC Available (whether in full or part)", "", "", "", ""],
      ["(1) Import of goods", gstr3b.table3.available.importGoods.igst, 0, 0, gstr3b.table3.available.importGoods.cess],
      ["(2) Import of services", gstr3b.table3.available.importServices.igst, 0, 0, gstr3b.table3.available.importServices.cess],
      ["(3) Inward supplies liable to reverse charge", gstr3b.table3.available.rcm.igst, gstr3b.table3.available.rcm.cgst, gstr3b.table3.available.rcm.sgst, gstr3b.table3.available.rcm.cess],
      ["(4) Inward supplies from ISD", gstr3b.table3.available.isd.igst, gstr3b.table3.available.isd.cgst, gstr3b.table3.available.isd.sgst, gstr3b.table3.available.isd.cess],
      ["(5) All other ITC", gstr3b.table3.available.allOther.igst, gstr3b.table3.available.allOther.cgst, gstr3b.table3.available.allOther.sgst, gstr3b.table3.available.allOther.cess],
      ["(D) Ineligible ITC", "", "", "", ""],
      ["(1) As per section 17(5)", gstr3b.table3.ineligible.section17_5.igst, gstr3b.table3.ineligible.section17_5.cgst, gstr3b.table3.ineligible.section17_5.sgst, gstr3b.table3.ineligible.section17_5.cess],
      ["(2) Others", gstr3b.table3.ineligible.others.igst, gstr3b.table3.ineligible.others.cgst, gstr3b.table3.ineligible.others.sgst, gstr3b.table3.ineligible.others.cess],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(t3Rows);
    XLSX.utils.book_append_sheet(wb, ws3, "Table 3 Eligible ITC");

    // Table 4 Sheet
    const t4Rows = [
      ["Nature Of Supplies", "Inter-State Supplies", "Intra-State Supplies"],
      [
        gstr3b.table4.compositionExempt.nature,
        gstr3b.table4.compositionExempt.interstate,
        gstr3b.table4.compositionExempt.intrastate,
      ],
      [
        gstr3b.table4.nonGst.nature,
        gstr3b.table4.nonGst.interstate,
        gstr3b.table4.nonGst.intrastate,
      ],
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(t4Rows);
    XLSX.utils.book_append_sheet(wb, ws4, "Table 4 Inward Supplies");

    XLSX.writeFile(wb, `GSTR3B_${fromMonthYear.replace("/", "-")}_to_${toMonthYear.replace("/", "-")}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50 text-slate-800">
      {/* Top Filter Bar Matching Reference Screenshot */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Month Range Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs">
              <span className="text-slate-500">From Month/Year</span>
              <input
                type="text"
                value={fromMonthYear}
                onChange={(e) => setFromMonthYear(e.target.value)}
                placeholder="MM/YYYY"
                className="w-20 font-medium text-slate-800 outline-none"
              />
              <FiCalendar className="text-slate-400" />
            </div>

            <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs">
              <span className="text-slate-500">To Month/Year</span>
              <input
                type="text"
                value={toMonthYear}
                onChange={(e) => setToMonthYear(e.target.value)}
                placeholder="MM/YYYY"
                className="w-20 font-medium text-slate-800 outline-none"
              />
              <FiCalendar className="text-slate-400" />
            </div>

            <button
              type="button"
              onClick={() => setRefreshTrigger((k) => k + 1)}
              title="Recalculate report"
              className="flex items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              <FiRefreshCw className="h-3.5 w-3.5" />
              Recalculate
            </button>
          </div>

          {/* Right Controls: Checkbox and Export/Print */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={considerNonTaxAsExempted}
                onChange={(e) => setConsiderNonTaxAsExempted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              CONSIDER NON-TAX AS EXEMPTED
            </label>

            <button
              type="button"
              onClick={handleExportExcel}
              title="Export to Excel"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700 cursor-pointer"
            >
              <RiFileExcel2Line className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handlePrint}
              title="Print GSTR-3B Report"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-blue-600 shadow-2xs hover:bg-slate-50 cursor-pointer"
            >
              <FiPrinter className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Title */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            GSTR3 REPORT
          </h1>
          <span className="text-xs text-slate-500">
            Reporting Period: {gstr3b.period.fromDate} to {gstr3b.period.toDate}
          </span>
        </div>

        {/* GST Overview Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">Total Outward Tax</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(gstr3b.summary.totalOutwardTax)}</div>
            <div className="mt-1 text-[11px] text-slate-400">Total GST on sales supplies</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">Eligible Input Tax Credit</div>
            <div className="mt-1 text-lg font-bold text-emerald-600">{formatCurrency(gstr3b.summary.totalEligibleItc)}</div>
            <div className="mt-1 text-[11px] text-slate-400">ITC from purchase bills</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">Reverse Charge Tax (RCM)</div>
            <div className="mt-1 text-lg font-bold text-amber-600">{formatCurrency(gstr3b.summary.totalRcmTax)}</div>
            <div className="mt-1 text-[11px] text-slate-400">Inward RCM supplies liability</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">Net Tax Payable</div>
            <div className={`mt-1 text-lg font-bold ${gstr3b.summary.netTaxPayable > 0 ? "text-rose-600" : "text-emerald-700"}`}>
              {formatCurrency(gstr3b.summary.netTaxPayable)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Outward Tax - ITC + RCM</div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TABLE 1: Outward Supplies & Inward Supplies Liable to RCM      */}
        {/* ============================================================== */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-2xs">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              1. Details of outward supplies and inward supplies liable to reverse charge
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-200 text-slate-700">
                  <th className="px-3 py-2.5 font-medium">Nature Of Supplies</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total Taxable Value</th>
                  <th className="px-3 py-2.5 text-right font-medium">Integrated Tax</th>
                  <th className="px-3 py-2.5 text-right font-medium">Central Tax</th>
                  <th className="px-3 py-2.5 text-right font-medium">State/UT Tax</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cess</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-normal">{gstr3b.table1.outwardTaxable.nature}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{formatAmount(gstr3b.table1.outwardTaxable.taxable)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.outwardTaxable.igst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.outwardTaxable.cgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.outwardTaxable.sgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.outwardTaxable.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-normal">{gstr3b.table1.zeroRated.nature}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{formatAmount(gstr3b.table1.zeroRated.taxable)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.zeroRated.igst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.zeroRated.cgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.zeroRated.sgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.zeroRated.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-normal">{gstr3b.table1.nilExempt.nature}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{formatAmount(gstr3b.table1.nilExempt.taxable)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nilExempt.igst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nilExempt.cgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nilExempt.sgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nilExempt.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-normal">{gstr3b.table1.inwardRcm.nature}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{formatAmount(gstr3b.table1.inwardRcm.taxable)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.inwardRcm.igst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.inwardRcm.cgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.inwardRcm.sgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.inwardRcm.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-normal">{gstr3b.table1.nonGst.nature}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{formatAmount(gstr3b.table1.nonGst.taxable)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nonGst.igst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nonGst.cgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nonGst.sgst)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table1.nonGst.cess)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TABLE 2: Inter-State Supplies to Unregistered, Composition, UIN */}
        {/* ============================================================== */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-2xs">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              2. Details of inter-State supplies made to unregistered persons, composition dealer and UIN holders
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-200 text-slate-700">
                  <th rowSpan="2" className="border-r border-slate-300 px-3 py-2 font-medium">
                    Place Of Supply (State/UT)
                  </th>
                  <th colSpan="2" className="border-r border-slate-300 px-3 py-1.5 text-center font-medium">
                    Supplies Made To Unregistered Persons
                  </th>
                  <th colSpan="2" className="border-r border-slate-300 px-3 py-1.5 text-center font-medium">
                    Supplies Made To Composition Taxable Persons
                  </th>
                  <th colSpan="2" className="px-3 py-1.5 text-center font-medium">
                    Supplies Made To UIN Holders
                  </th>
                </tr>
                <tr className="border-b border-slate-300 bg-slate-100 text-slate-600">
                  <th className="border-r border-slate-200 px-3 py-1.5 text-right font-medium">Total Taxable Value</th>
                  <th className="border-r border-slate-300 px-3 py-1.5 text-right font-medium">Amount Of Integrated Tax</th>
                  <th className="border-r border-slate-200 px-3 py-1.5 text-right font-medium">Total Taxable Value</th>
                  <th className="border-r border-slate-300 px-3 py-1.5 text-right font-medium">Amount Of Integrated Tax</th>
                  <th className="border-r border-slate-200 px-3 py-1.5 text-right font-medium">Total Taxable Value</th>
                  <th className="px-3 py-1.5 text-right font-medium">Amount Of Integrated Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {gstr3b.table2.length > 0 ? (
                  gstr3b.table2.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="border-r border-slate-200 px-3 py-2.5 font-medium">{row.state}</td>
                      <td className="border-r border-slate-200 px-3 py-2.5 text-right">{formatAmount(row.unregisteredTaxable)}</td>
                      <td className="border-r border-slate-200 px-3 py-2.5 text-right">{formatAmount(row.unregisteredIgst)}</td>
                      <td className="border-r border-slate-200 px-3 py-2.5 text-right">{formatAmount(row.compositionTaxable)}</td>
                      <td className="border-r border-slate-200 px-3 py-2.5 text-right">{formatAmount(row.compositionIgst)}</td>
                      <td className="border-r border-slate-200 px-3 py-2.5 text-right">{formatAmount(row.uinTaxable)}</td>
                      <td className="px-3 py-2.5 text-right">{formatAmount(row.uinIgst)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="px-3 py-4 text-center text-slate-400">
                      No inter-state supplies made to unregistered or composition dealers in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TABLE 3: Details of eligible Input Tax Credit (ITC)             */}
        {/* ============================================================== */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-2xs">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              3. Details of eligible Input Tax Credit
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-200 text-slate-700">
                  <th className="px-3 py-2.5 font-medium">Details</th>
                  <th className="px-3 py-2.5 text-right font-medium">Integrated Tax</th>
                  <th className="px-3 py-2.5 text-right font-medium">Central Tax</th>
                  <th className="px-3 py-2.5 text-right font-medium">State/UT Tax</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cess</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {/* Subsection A: Available ITC */}
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td colSpan="5" className="px-3 py-2">
                    (A) ITC Available (whether in full or part)
                  </td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="pl-6 px-3 py-2 font-normal">(1) Import of goods</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.importGoods.igst)}</td>
                  <td className="px-3 py-2 text-right">0</td>
                  <td className="px-3 py-2 text-right">0</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.importGoods.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="pl-6 px-3 py-2 font-normal">(2) Import of services</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.importServices.igst)}</td>
                  <td className="px-3 py-2 text-right">0</td>
                  <td className="px-3 py-2 text-right">0</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.importServices.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="pl-6 px-3 py-2 font-normal">(3) Inward supplies liable to reverse charge (other than 1 & 2 above)</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.rcm.igst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.rcm.cgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.rcm.sgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.rcm.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="pl-6 px-3 py-2 font-normal">(4) Inward supplies from ISD</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.isd.igst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.isd.cgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.isd.sgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.isd.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="pl-6 px-3 py-2 font-normal">(5) All other ITC</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.allOther.igst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.allOther.cgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.allOther.sgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.available.allOther.cess)}</td>
                </tr>

                {/* Subsection D: Ineligible ITC */}
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td colSpan="5" className="px-3 py-2">
                    (D) Ineligible ITC
                  </td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="pl-6 px-3 py-2 font-normal">(1) As per section 17(5)</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.section17_5.igst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.section17_5.cgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.section17_5.sgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.section17_5.cess)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="pl-6 px-3 py-2 font-normal">(2) Others</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.others.igst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.others.cgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.others.sgst)}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(gstr3b.table3.ineligible.others.cess)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TABLE 4: Exempt, Nil-rated and Non-GST Inward Supplies         */}
        {/* ============================================================== */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-2xs">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              4. Details of exempt, nil-rated and non-GST inward supplies
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-200 text-slate-700">
                  <th className="px-3 py-2.5 font-medium">Nature Of Supplies</th>
                  <th className="px-3 py-2.5 text-right font-medium">Inter-State Supplies</th>
                  <th className="px-3 py-2.5 text-right font-medium">Intra-State Supplies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-normal">{gstr3b.table4.compositionExempt.nature}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table4.compositionExempt.interstate)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table4.compositionExempt.intrastate)}</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-normal">{gstr3b.table4.nonGst.nature}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table4.nonGst.interstate)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(gstr3b.table4.nonGst.intrastate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
