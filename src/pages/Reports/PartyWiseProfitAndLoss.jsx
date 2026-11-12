import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiChevronDown,
  FiFilter,
  FiInfo,
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiUser,
  FiX,
} from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";
import { getParties } from "../../services/partiesStorage.js";
import { getSaleInvoices } from "../../services/salesStorage.js";
import { getSaleReturns } from "../../services/saleReturnsStorage.js";
import { getInventoryItems } from "../../services/itemsStorage.js";
import { getPurchaseBills } from "../../services/purchaseBillsStorage.js";
import {
  calculatePartyWiseProfit,
  formatPercentage,
} from "../../services/partyWiseProfitService.js";
import {
  formatDateDisplay,
  formatMoney,
  parseYMD,
} from "../../utils/billWiseProfit.js";

function defaultFrom() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function defaultTo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeReadLocal(...keys) {
  if (typeof window === "undefined" || !window.localStorage) return [];
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  return [];
}

export default function PartyWiseProfitAndLoss() {
  // Filters State
  const [period, setPeriod] = useState("This Month");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [selectedPartyId, setSelectedPartyId] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyWithSales, setOnlyWithSales] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Drill-down Modal State
  const [detailParty, setDetailParty] = useState(null);

  // Reactive reload on business data changes
  useEffect(() => {
    const handleUpdate = () => setRefreshKey((k) => k + 1);
    window.addEventListener("ledgerly:business-data-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Load raw data sources
  const partiesMaster = useMemo(() => {
    try {
      const direct = getParties();
      if (Array.isArray(direct) && direct.length > 0) return direct;
    } catch {}
    return safeReadLocal("ledgerly:parties.v1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const salesInvoices = useMemo(() => {
    try {
      const direct = getSaleInvoices();
      if (Array.isArray(direct) && direct.length > 0) return direct;
    } catch {}
    return safeReadLocal("ledgerly:saleInvoices.v1", "ledgerly:sales.v1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const saleReturns = useMemo(() => {
    try {
      const direct = getSaleReturns();
      if (Array.isArray(direct) && direct.length > 0) return direct;
    } catch {}
    return safeReadLocal("ledgerly:saleReturns.v1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const inventoryItems = useMemo(() => {
    try {
      const direct = getInventoryItems();
      if (Array.isArray(direct) && direct.length > 0) return direct;
    } catch {}
    return safeReadLocal("ledgerly:inventoryItems.v1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const purchaseBills = useMemo(() => {
    try {
      const direct = getPurchaseBills();
      if (Array.isArray(direct) && direct.length > 0) return direct;
    } catch {}
    return safeReadLocal("ledgerly:purchaseBills.v1", "ledgerly:purchases.v1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Handle Preset Period Changes
  const handlePeriodChange = (val) => {
    setPeriod(val);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();

    if (val === "This Month") {
      setFrom(defaultFrom());
      setTo(defaultTo());
    } else if (val === "Today") {
      const todayStr = `${y}-${pad(m)}-${pad(day)}`;
      setFrom(todayStr);
      setTo(todayStr);
    } else if (val === "Yesterday") {
      const yDate = new Date(d);
      yDate.setDate(yDate.getDate() - 1);
      const str = `${yDate.getFullYear()}-${pad(yDate.getMonth() + 1)}-${pad(yDate.getDate())}`;
      setFrom(str);
      setTo(str);
    } else if (val === "This Week") {
      const dayOfWeek = d.getDay();
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setFrom(`${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`);
      setTo(`${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`);
    } else if (val === "Last 30 Days") {
      const past = new Date(d);
      past.setDate(past.getDate() - 30);
      setFrom(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`);
      setTo(`${y}-${pad(m)}-${pad(day)}`);
    } else if (val === "This Quarter") {
      const qMonth = Math.floor(d.getMonth() / 3) * 3;
      const qStart = new Date(y, qMonth, 1);
      const qEnd = new Date(y, qMonth + 3, 0);
      setFrom(`${qStart.getFullYear()}-${pad(qStart.getMonth() + 1)}-${pad(qStart.getDate())}`);
      setTo(`${qEnd.getFullYear()}-${pad(qEnd.getMonth() + 1)}-${pad(qEnd.getDate())}`);
    } else if (val === "This Year") {
      setFrom(`${y}-01-01`);
      setTo(`${y}-12-31`);
    } else if (val === "All Time") {
      setFrom("2000-01-01");
      setTo("2099-12-31");
    }
  };

  // Reset all filters to default
  const handleResetFilters = () => {
    setPeriod("This Month");
    setFrom(defaultFrom());
    setTo(defaultTo());
    setSelectedPartyId("All");
    setSearchQuery("");
    setOnlyWithSales(true);
  };

  // Compute Party-wise Profit & Loss
  const { rows, summary, allParties } = useMemo(() => {
    return calculatePartyWiseProfit({
      salesInvoices,
      saleReturns,
      partiesMaster,
      inventoryItems,
      purchaseBills,
      from,
      to,
      selectedPartyId,
      onlyWithSales,
      searchQuery,
    });
  }, [
    salesInvoices,
    saleReturns,
    partiesMaster,
    inventoryItems,
    purchaseBills,
    from,
    to,
    selectedPartyId,
    onlyWithSales,
    searchQuery,
  ]);

  // Export to Excel
  const handleExportExcel = () => {
    const headers = [
      "Party Name",
      "Party Type",
      "Phone",
      "Invoices",
      "Total Sales (Rs)",
      "Total Discount (Rs)",
      "Cost of Goods (Rs)",
      "Gross Profit (Rs)",
      "Profit Margin (%)",
      "Status",
    ];

    const dataRows = rows.map((r) => [
      r.partyName,
      r.partyType,
      r.phone || "-",
      r.invoicesCount,
      r.totalSales,
      r.totalDiscount,
      r.cogs,
      r.grossProfit,
      Number(r.profitMargin.toFixed(2)),
      r.hasMissingCost ? "Incomplete Cost" : r.isLoss ? "Loss" : "Profitable",
    ]);

    const footerRow = [
      "Total / Average",
      "",
      "",
      summary.totalInvoices,
      summary.totalSales,
      summary.totalDiscount,
      summary.totalCost,
      summary.totalGrossProfit,
      Number(summary.overallMargin.toFixed(2)),
      "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Party Wise Profit & Loss");
    XLSX.writeFile(
      wb,
      `Party_Wise_Profit_Loss_${from || "All"}_to_${to || "All"}.xlsx`
    );
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 text-xs text-slate-800">
      {/* ── Top Header & Filter Controls ── */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-900">Party wise Profit & Loss</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
              {rows.length} {rows.length === 1 ? "party" : "parties"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100 shadow-2xs"
            >
              <RiFileExcel2Line className="text-base text-emerald-600" />
              Excel Report
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <FiPrinter className="text-sm text-slate-600" />
              Print
            </button>
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Preset Period */}
          <div className="relative">
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="appearance-none rounded border border-slate-300 bg-white py-1.5 pl-3 pr-8 font-semibold text-slate-800 outline-none cursor-pointer hover:border-slate-400 shadow-2xs"
            >
              <option value="This Month">This Month</option>
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="This Week">This Week</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="This Quarter">This Quarter</option>
              <option value="This Year">This Year</option>
              <option value="All Time">All Time</option>
              <option value="Custom">Custom</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>

          {/* Date Range */}
          <div className="flex items-center overflow-hidden rounded border border-slate-300 bg-white shadow-2xs">
            <span className="border-r border-slate-200 bg-slate-100 px-2.5 py-1.5 font-medium text-slate-600">
              Between
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPeriod("Custom");
              }}
              className="bg-transparent px-2 py-1 font-semibold text-slate-700 outline-none cursor-pointer"
            />
            <span className="px-1 font-medium text-slate-400">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPeriod("Custom");
              }}
              className="bg-transparent px-2 py-1 font-semibold text-slate-700 outline-none cursor-pointer"
            />
          </div>

          {/* Party Dropdown */}
          <div className="relative">
            <select
              value={selectedPartyId}
              onChange={(e) => setSelectedPartyId(e.target.value)}
              className="max-w-[200px] appearance-none truncate rounded border border-slate-300 bg-white py-1.5 pl-3 pr-8 font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400 shadow-2xs"
            >
              <option value="All">All Parties</option>
              {allParties.map((p) => (
                <option key={p.partyId} value={p.partyId}>
                  {p.partyName}
                </option>
              ))}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>

          {/* Toggle: Only parties with sales */}
          <label className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 select-none">
            <input
              type="checkbox"
              checked={onlyWithSales}
              onChange={(e) => setOnlyWithSales(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-blue-600 cursor-pointer"
            />
            Only with sales
          </label>

          {/* Search Input */}
          <div className="relative flex items-center">
            <FiSearch className="absolute left-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search party or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          {/* Reset Filters */}
          <button
            type="button"
            onClick={handleResetFilters}
            title="Reset to default filters"
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <FiRefreshCw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>

      {/* ── Summary Metric Cards ── */}
      <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-4 print:border-b-2">
        {/* Total Sales Card */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Sales
          </span>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {formatMoney(summary.totalSales)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {summary.totalInvoices} {summary.totalInvoices === 1 ? "invoice" : "invoices"}
          </div>
        </div>

        {/* Total Cost Card */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Cost of Goods (COGS)
          </span>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {formatMoney(summary.totalCost)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Discounts: {formatMoney(summary.totalDiscount)}
          </div>
        </div>

        {/* Total Gross Profit Card */}
        <div
          className={`rounded-lg border p-3.5 ${
            summary.totalGrossProfit >= 0
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-rose-200 bg-rose-50/40"
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Gross Profit
          </span>
          <div
            className={`mt-1 text-lg font-bold ${
              summary.totalGrossProfit >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {formatMoney(summary.totalGrossProfit)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="font-semibold text-emerald-700">{summary.profitableCount} Profit</span>
            <span>•</span>
            <span className="font-semibold text-rose-700">{summary.lossCount} Loss</span>
          </div>
        </div>

        {/* Overall Margin Card */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Overall Profit Margin
          </span>
          <div
            className={`mt-1 text-lg font-bold ${
              summary.overallMargin >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {formatPercentage(summary.overallMargin)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {summary.missingCostCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                <FiAlertCircle className="h-3 w-3" />
                {summary.missingCostCount} cost incomplete
              </span>
            ) : (
              "All item costs verified"
            )}
          </div>
        </div>
      </div>

      {/* ── Main Report Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-700">
            <tr>
              <th className="px-4 py-2.5">Party Name</th>
              <th className="px-3 py-2.5 text-center">Invoices</th>
              <th className="px-3 py-2.5 text-right">Total Sales</th>
              <th className="px-3 py-2.5 text-right">Total Discount</th>
              <th className="px-3 py-2.5 text-right">Cost of Goods</th>
              <th className="px-3 py-2.5 text-right">Profit / Loss</th>
              <th className="px-3 py-2.5 text-right">Margin</th>
              <th className="px-4 py-2.5 text-center print:hidden">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <FiUser className="h-8 w-8 text-slate-300" />
                    <p className="mt-2 font-semibold text-slate-600">No party transactions found</p>
                    <p className="text-xs text-slate-400">
                      Try adjusting the date range or unchecking "Only with sales" to see all parties.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.partyId}
                  onClick={() => setDetailParty(row)}
                  className="cursor-pointer transition hover:bg-slate-50/80"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{row.partyName}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {row.partyType}
                      </span>
                      {row.hasMissingCost && (
                        <span
                          title={`Incomplete item purchase cost: ${row.missingCostItems.join(", ")}`}
                          className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                        >
                          <FiAlertCircle className="h-2.5 w-2.5" />
                          Cost Missing
                        </span>
                      )}
                    </div>
                    {(row.phone || row.email) && (
                      <div className="text-[11px] text-slate-500">
                        {row.phone} {row.phone && row.email ? "•" : ""} {row.email}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center font-medium text-slate-700">
                    {row.invoicesCount}
                    {row.returnsCount > 0 && (
                      <span className="ml-1 text-[10px] font-normal text-rose-600">
                        (-{row.returnsCount} ret)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                    {formatMoney(row.totalSales)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {row.totalDiscount > 0 ? formatMoney(row.totalDiscount) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                    {formatMoney(row.cogs)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[11px] ${
                        row.grossProfit > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : row.grossProfit < 0
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {formatMoney(row.grossProfit)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold">
                    <span
                      className={`${
                        row.profitMargin > 0
                          ? "text-emerald-700"
                          : row.profitMargin < 0
                          ? "text-rose-700"
                          : "text-slate-600"
                      }`}
                    >
                      {formatPercentage(row.profitMargin)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center print:hidden">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailParty(row);
                      }}
                      className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-blue-600 hover:border-blue-300 hover:bg-blue-50 shadow-2xs"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
              <tr>
                <td className="px-4 py-2.5">Total / Summary</td>
                <td className="px-3 py-2.5 text-center">{summary.totalInvoices}</td>
                <td className="px-3 py-2.5 text-right">{formatMoney(summary.totalSales)}</td>
                <td className="px-3 py-2.5 text-right">{formatMoney(summary.totalDiscount)}</td>
                <td className="px-3 py-2.5 text-right">{formatMoney(summary.totalCost)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] ${
                      summary.totalGrossProfit >= 0
                        ? "bg-emerald-200 text-emerald-900"
                        : "bg-rose-200 text-rose-900"
                    }`}
                  >
                    {formatMoney(summary.totalGrossProfit)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-800">
                  {formatPercentage(summary.overallMargin)}
                </td>
                <td className="px-4 py-2.5 print:hidden"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Detailed Party Drill-Down Modal ── */}
      {detailParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    {detailParty.partyName}
                  </h2>
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    {detailParty.partyType}
                  </span>
                </div>
                {(detailParty.phone || detailParty.email) && (
                  <p className="text-xs text-slate-500">
                    {detailParty.phone} {detailParty.phone && detailParty.email ? "•" : ""} {detailParty.email}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailParty(null)}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Party Summary Row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Invoices</div>
                  <div className="mt-0.5 text-sm font-bold text-slate-800">
                    {detailParty.invoicesCount}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Total Sales</div>
                  <div className="mt-0.5 text-sm font-bold text-slate-900">
                    {formatMoney(detailParty.totalSales)}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Cost of Goods</div>
                  <div className="mt-0.5 text-sm font-bold text-slate-800">
                    {formatMoney(detailParty.cogs)}
                  </div>
                </div>
                <div
                  className={`rounded border p-2.5 text-center ${
                    detailParty.grossProfit >= 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase">Gross Profit</div>
                  <div className="mt-0.5 text-sm font-bold">
                    {formatMoney(detailParty.grossProfit)}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Profit Margin</div>
                  <div
                    className={`mt-0.5 text-sm font-bold ${
                      detailParty.profitMargin >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {formatPercentage(detailParty.profitMargin)}
                  </div>
                </div>
              </div>

              {/* Missing Cost Alert */}
              {detailParty.hasMissingCost && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <strong className="font-semibold">Missing Purchase Cost:</strong>
                    <p className="mt-0.5 text-amber-800">
                      The following item(s) sold to this party have no recorded purchase cost:{" "}
                      <span className="font-semibold">{detailParty.missingCostItems.join(", ")}</span>.
                      Add a purchase bill or enter the item's purchase price to ensure accurate profit calculation.
                    </p>
                  </div>
                </div>
              )}

              {/* Invoices List */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900">Sales Invoices</h3>
                {detailParty.invoices.length === 0 ? (
                  <p className="text-xs text-slate-400">No sales invoices recorded for this period.</p>
                ) : (
                  detailParty.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                    >
                      {/* Invoice Summary Header */}
                      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-900">
                            Invoice: {inv.invoiceNumber}
                          </span>
                          <span className="text-slate-500">{inv.formattedDate}</span>
                          {inv.isCancelled && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700">
                              Cancelled
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span>
                            Sale: <strong>{formatMoney(inv.saleAmount)}</strong>
                          </span>
                          <span>
                            Cost: <strong>{formatMoney(inv.cogs)}</strong>
                          </span>
                          <span>
                            Profit:{" "}
                            <strong
                              className={
                                inv.profit !== null && inv.profit >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                              }
                            >
                              {inv.profit !== null ? formatMoney(inv.profit) : "N/A (Cost Missing)"}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Line Items Table */}
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                          <tr>
                            <th className="px-3 py-1.5 text-left">Item Name</th>
                            <th className="px-2 py-1.5 text-center">Qty</th>
                            <th className="px-2 py-1.5 text-right">Sale Price</th>
                            <th className="px-2 py-1.5 text-right">Discount</th>
                            <th className="px-2 py-1.5 text-right">Net Amount</th>
                            <th className="px-2 py-1.5 text-right">Unit Cost</th>
                            <th className="px-2 py-1.5 text-right">Total Cost</th>
                            <th className="px-3 py-1.5 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {inv.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-1.5 font-medium text-slate-800">
                                {item.itemName}
                                {item.isCostMissing && (
                                  <span className="ml-1 text-[10px] text-amber-700">
                                    (No Cost)
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center text-slate-600">
                                {item.qty} {item.unit}
                              </td>
                              <td className="px-2 py-1.5 text-right">{formatMoney(item.unitPrice)}</td>
                              <td className="px-2 py-1.5 text-right text-slate-500">
                                {item.discount > 0 ? formatMoney(item.discount) : "—"}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium text-slate-800">
                                {formatMoney(item.netAmount)}
                              </td>
                              <td className="px-2 py-1.5 text-right text-slate-600">
                                {item.costPrice !== null ? formatMoney(item.costPrice) : "—"}
                              </td>
                              <td className="px-2 py-1.5 text-right text-slate-700">
                                {item.totalCogs !== null ? formatMoney(item.totalCogs) : "—"}
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right font-bold ${
                                  item.profit !== null && item.profit >= 0
                                    ? "text-emerald-700"
                                    : item.profit !== null
                                    ? "text-rose-700"
                                    : "text-slate-400"
                                }`}
                              >
                                {item.profit !== null ? formatMoney(item.profit) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>

              {/* Sales Returns (if any) */}
              {detailParty.returns && detailParty.returns.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <h4 className="font-bold text-rose-800">Sales Returns Deducted</h4>
                  <table className="w-full text-[11px] border border-rose-200 rounded">
                    <thead className="bg-rose-50 text-rose-800">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Return No</th>
                        <th className="px-3 py-1.5 text-left">Date</th>
                        <th className="px-3 py-1.5 text-right">Return Amount</th>
                        <th className="px-3 py-1.5 text-right">COGS Deducted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100 bg-white">
                      {detailParty.returns.map((ret) => (
                        <tr key={ret.id}>
                          <td className="px-3 py-1.5 font-medium">{ret.returnNo}</td>
                          <td className="px-3 py-1.5">{formatDateDisplay(ret.dateYmd)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-rose-700">
                            -{formatMoney(ret.amount)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700">
                            -{formatMoney(ret.returnCogs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={() => setDetailParty(null)}
                className="rounded border border-slate-300 bg-white px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
