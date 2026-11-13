import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiChevronDown,
  FiPrinter,
  FiSearch,
  FiFileText,
  FiX,
  FiFilter,
  FiArrowUp,
  FiArrowDown,
  FiTrendingUp,
  FiLayers,
} from "react-icons/fi";
import * as XLSX from "xlsx";

import { getSaleInvoices } from "../../services/salesStorage.js";
import { getPurchaseBills } from "../../services/purchaseBillsStorage.js";
import { getParties } from "../../services/partiesStorage.js";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";
import {
  readTransactionCollection,
  readTransactionValue,
  transactionStorageKeys,
} from "../../services/transactionRepository.js";
import { businessDataChangedEvent } from "../../services/businessDataChanged.js";
import {
  formatDateDMY,
  getPresetDateRange,
  formatTaxRateLabel,
  compileGstData,
  filterGstLines,
  calculateGstRateMetrics,
  round2,
} from "../../utils/gstRateCalculations.js";
import {
  buildUnifiedDocumentHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";

const money = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function readLocal(key) {
  try {
    return readTransactionCollection(key);
  } catch {
    return [];
  }
}

function readSaleUiActions() {
  try {
    return readTransactionValue(transactionStorageKeys.saleInvoiceUi, {});
  } catch {
    return {};
  }
}

export default function GSTRateReport({ initialTab = "summary" }) {
  const navigate = useNavigate();

  // Active view tab: "summary" | "transactions"
  const [activeTab, setActiveTab] = useState(initialTab);

  // Filters state
  const [period, setPeriod] = useState("This Month");
  const [dateRange, setDateRange] = useState(() => getPresetDateRange("This Month"));
  const [txTypeFilter, setTxTypeFilter] = useState("All"); // "All" | "Sale" | "Purchase"
  const [rateFilter, setRateFilter] = useState("All"); // "All" | rate string / number
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false); // false = newest first
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync with data changes across USV
  useEffect(() => {
    const handleUpdate = () => setRefreshTrigger((k) => k + 1);
    window.addEventListener(businessDataChangedEvent, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(businessDataChangedEvent, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Handle Preset Change
  const handlePresetChange = (preset) => {
    setPeriod(preset);
    if (preset !== "Custom") {
      setDateRange(getPresetDateRange(preset));
    }
  };

  // 1. Load actual data from repositories
  const sales = useMemo(() => {
    void refreshTrigger;
    try {
      return getSaleInvoices() || [];
    } catch {
      return readLocal("ledgerly:saleInvoices.v1");
    }
  }, [refreshTrigger]);

  const purchases = useMemo(() => {
    void refreshTrigger;
    try {
      return getPurchaseBills() || [];
    } catch {
      return readLocal("ledgerly:purchaseBills.v1");
    }
  }, [refreshTrigger]);

  const parties = useMemo(() => {
    void refreshTrigger;
    try {
      return getParties() || [];
    } catch {
      return readLocal("ledgerly:parties.v1");
    }
  }, [refreshTrigger]);

  const companyProfile = useMemo(() => {
    void refreshTrigger;
    try {
      return getCompanyProfile();
    } catch {
      return readLocal("ledgerly:companyProfile.v1")?.[0] || {};
    }
  }, [refreshTrigger]);

  const saleReturns = useMemo(() => {
    void refreshTrigger;
    return readLocal("ledgerly:saleReturns.v1");
  }, [refreshTrigger]);

  const purchaseReturns = useMemo(() => {
    void refreshTrigger;
    return readLocal("ledgerly:purchaseReturns.v1");
  }, [refreshTrigger]);

  const saleUiActions = useMemo(() => {
    void refreshTrigger;
    return readSaleUiActions();
  }, [refreshTrigger]);

  // 2. Compile all raw GST lines across active transactions
  const allLines = useMemo(() => {
    return compileGstData({
      sales,
      purchases,
      saleReturns,
      purchaseReturns,
      parties,
      companyProfile,
      saleUiActions,
    });
  }, [
    sales,
    purchases,
    saleReturns,
    purchaseReturns,
    parties,
    companyProfile,
    saleUiActions,
  ]);

  // 3. Available GST Rates discovered from actual transaction data
  const availableRates = useMemo(() => {
    const set = new Set();
    allLines.forEach((l) => {
      set.add(l.taxRate);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [allLines]);

  // 4. Filtered lines based on user controls
  const filteredLines = useMemo(() => {
    const list = filterGstLines(allLines, {
      from: dateRange.from,
      to: dateRange.to,
      transactionType: txTypeFilter,
      rate: rateFilter,
      search,
    });

    return list.sort((a, b) => {
      const cmp = String(a.date || "").localeCompare(String(b.date || ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [allLines, dateRange, txTypeFilter, rateFilter, search, sortAsc]);

  // 5. Aggregate metrics & Rate Breakdown
  const metrics = useMemo(() => {
    return calculateGstRateMetrics(filteredLines);
  }, [filteredLines]);

  // Has any active filter
  const hasActiveFilters =
    txTypeFilter !== "All" ||
    rateFilter !== "All" ||
    Boolean(search.trim()) ||
    period !== "This Month";

  const clearFilters = () => {
    setTxTypeFilter("All");
    setRateFilter("All");
    setSearch("");
    setPeriod("This Month");
    setDateRange(getPresetDateRange("This Month"));
  };

  // Export to Excel
  const exportExcel = () => {
    // 1. Rate Summary Sheet
    const summaryHeaders = [
      "GST Rate",
      "Transactions",
      "Taxable Amount",
      "CGST Amount",
      "SGST Amount",
      "IGST Amount",
      "Cess Amount",
      "Total GST Amount",
      "% of Total Tax",
    ];

    const summaryRows = metrics.rateBreakdown.map((r) => [
      r.rateLabel,
      r.transactionCount,
      r.taxable,
      r.cgst,
      r.sgst,
      r.igst,
      r.cess,
      r.tax,
      `${r.percentageOfTax.toFixed(2)}%`,
    ]);

    const summaryFooter = [
      "Total",
      metrics.totalTransactions,
      metrics.totalTaxable,
      metrics.totalCgst,
      metrics.totalSgst,
      metrics.totalIgst,
      metrics.totalCess,
      metrics.totalTax,
      "100.00%",
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet([
      summaryHeaders,
      ...summaryRows,
      summaryFooter,
    ]);

    // 2. Transactions Sheet
    const txHeaders = [
      "Date",
      "Type",
      "Invoice / Bill No.",
      "Party Name",
      "Item / Supply",
      "GST Rate",
      "Taxable Amount",
      "CGST",
      "SGST",
      "IGST",
      "Total GST",
      "Total Amount",
      "Status",
    ];

    const txRows = filteredLines.map((l) => [
      formatDateDMY(l.date),
      l.transactionType,
      l.transactionNumber,
      l.party,
      l.itemDescription,
      l.rateLabel,
      l.taxable,
      l.cgst,
      l.sgst,
      l.igst,
      l.tax,
      l.invoiceTotal,
      l.status,
    ]);

    const wsTx = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);

    const wb = XLSX.utils.book_new();
    if (activeTab === "summary") {
      XLSX.utils.book_append_sheet(wb, wsSummary, "GST Rate Summary");
      XLSX.utils.book_append_sheet(wb, wsTx, "Tax Transactions");
    } else {
      XLSX.utils.book_append_sheet(wb, wsTx, "Tax Transactions");
      XLSX.utils.book_append_sheet(wb, wsSummary, "GST Rate Summary");
    }

    const filename = `GST_Rate_Report_${dateRange.from || "all"}_to_${
      dateRange.to || "all"
    }.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Print Rate Summary Document
  const handlePrintSummary = () => {
    const rows = metrics.rateBreakdown.map((r, idx) => ({
      index: idx + 1,
      rate: r.rateLabel,
      count: r.transactionCount,
      taxable: r.taxable,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      tax: r.tax,
    }));

    const dateSub =
      dateRange.from && dateRange.to
        ? `Period: ${formatDateDMY(dateRange.from)} to ${formatDateDMY(dateRange.to)}`
        : "Period: All Time";

    const typeSub =
      txTypeFilter === "All"
        ? "Type: All (Sales & Purchases)"
        : `Type: ${txTypeFilter}`;

    const html = buildUnifiedDocumentHtml({
      title: "GST Rate Report",
      documentNumber: `GST-RATE-${dateRange.from ? dateRange.from.replace(/-/g, "") : "ALL"}`,
      date: formatDateDMY(new Date().toISOString().slice(0, 10)),
      status: `${metrics.rateBreakdown.length} Tax Rates`,
      partyName: "All Parties / General",
      columns: [
        { key: "index", label: "#", align: "center", width: "40px" },
        { key: "rate", label: "GST Rate", align: "left", width: "120px" },
        { key: "count", label: "Transactions", align: "center", width: "90px" },
        {
          key: "taxable",
          label: "Taxable Amount",
          align: "right",
          width: "120px",
          formatMoney: true,
        },
        {
          key: "cgst",
          label: "CGST",
          align: "right",
          width: "100px",
          formatMoney: true,
        },
        {
          key: "sgst",
          label: "SGST",
          align: "right",
          width: "100px",
          formatMoney: true,
        },
        {
          key: "igst",
          label: "IGST",
          align: "right",
          width: "100px",
          formatMoney: true,
        },
        {
          key: "tax",
          label: "Total GST",
          align: "right",
          width: "120px",
          formatMoney: true,
        },
      ],
      rows,
      totals: {
        subtotal: metrics.totalTaxable,
        total: metrics.totalTax,
      },
      notes: `${dateSub} | ${typeSub} | Total Taxable: ₹${metrics.totalTaxable.toFixed(
        2
      )} | CGST: ₹${metrics.totalCgst.toFixed(2)} | SGST: ₹${metrics.totalSgst.toFixed(
        2
      )} | IGST: ₹${metrics.totalIgst.toFixed(2)} | Total GST: ₹${metrics.totalTax.toFixed(2)}`,
      autoPrint: true,
    });

    openPrintWindow(html, true);
  };

  // Print Transactions Document
  const handlePrintTransactions = () => {
    const rows = filteredLines.map((l, idx) => ({
      index: idx + 1,
      date: formatDateDMY(l.date),
      type: l.transactionType,
      number: l.transactionNumber,
      party: l.party,
      rate: l.rateLabel,
      taxable: l.taxable,
      tax: l.tax,
    }));

    const dateSub =
      dateRange.from && dateRange.to
        ? `Period: ${formatDateDMY(dateRange.from)} to ${formatDateDMY(dateRange.to)}`
        : "Period: All Time";

    const html = buildUnifiedDocumentHtml({
      title: "GST Rate Report - Transactions",
      documentNumber: `GST-TX-${dateRange.from ? dateRange.from.replace(/-/g, "") : "ALL"}`,
      date: formatDateDMY(new Date().toISOString().slice(0, 10)),
      status: `${filteredLines.length} Records`,
      partyName: "All Parties / General",
      columns: [
        { key: "index", label: "#", align: "center", width: "40px" },
        { key: "date", label: "Date", align: "center", width: "85px" },
        { key: "type", label: "Type", align: "center", width: "70px" },
        { key: "number", label: "Doc No.", align: "left", width: "85px" },
        { key: "party", label: "Party Name", align: "left" },
        { key: "rate", label: "Rate", align: "center", width: "80px" },
        {
          key: "taxable",
          label: "Taxable",
          align: "right",
          width: "110px",
          formatMoney: true,
        },
        {
          key: "tax",
          label: "Total Tax",
          align: "right",
          width: "110px",
          formatMoney: true,
        },
      ],
      rows,
      totals: {
        subtotal: metrics.totalTaxable,
        total: metrics.totalTax,
      },
      notes: `${dateSub} | Total Records: ${filteredLines.length} | Taxable: ₹${metrics.totalTaxable.toFixed(
        2
      )} | Total GST: ₹${metrics.totalTax.toFixed(2)}`,
      autoPrint: true,
    });

    openPrintWindow(html, true);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Top Header */}
      <header className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">
              GST Rate Report
            </h1>
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`rounded px-3 py-1 transition ${
                  activeTab === "summary"
                    ? "bg-white text-sky-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Rate Summary ({metrics.rateBreakdown.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("transactions")}
                className={`rounded px-3 py-1 transition ${
                  activeTab === "transactions"
                    ? "bg-white text-sky-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Transactions ({filteredLines.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Aggregate and analyze business taxable turnover, CGST, SGST, and IGST by GST rate.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Export to Excel (.xlsx)"
            onClick={exportExcel}
            className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <span>xls</span> Export
          </button>

          <button
            type="button"
            title="Print report preview"
            onClick={
              activeTab === "summary" ? handlePrintSummary : handlePrintTransactions
            }
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <FiPrinter size={15} /> Print
          </button>
        </div>
      </header>

      {/* Filter Toolbar */}
      <section className="border-b border-slate-200 bg-white px-5 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Preset Selector */}
          <div className="relative">
            <select
              aria-label="Date preset selector"
              value={period}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option>Today</option>
              <option>This Month</option>
              <option>Last Month</option>
              <option>This Quarter</option>
              <option>This Year</option>
              <option>All Time</option>
              <option>Custom</option>
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
              size={14}
            />
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
            <span className="text-slate-400">From</span>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => {
                setPeriod("Custom");
                setDateRange((prev) => ({ ...prev, from: e.target.value }));
              }}
              className="bg-transparent text-slate-700 outline-none text-xs"
            />
            <span className="text-slate-400">To</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => {
                setPeriod("Custom");
                setDateRange((prev) => ({ ...prev, to: e.target.value }));
              }}
              className="bg-transparent text-slate-700 outline-none text-xs"
            />
          </div>

          {/* Transaction Type Filter */}
          <div className="relative">
            <select
              aria-label="Transaction type filter"
              value={txTypeFilter}
              onChange={(e) => setTxTypeFilter(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option value="All">All Transactions (Sales & Purchases)</option>
              <option value="Sale">Sales (Outward Supplies)</option>
              <option value="Purchase">Purchases (Inward Supplies)</option>
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
              size={14}
            />
          </div>

          {/* GST Rate Filter */}
          <div className="relative">
            <select
              aria-label="GST rate filter"
              value={rateFilter}
              onChange={(e) => setRateFilter(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option value="All">All GST Rates</option>
              {availableRates.map((r) => (
                <option key={r} value={String(r)}>
                  {formatTaxRateLabel(r)}
                </option>
              ))}
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
              size={14}
            />
          </div>

          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1">
            <FiSearch
              className="absolute left-3 top-2.5 text-slate-400"
              size={14}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice no, party, item..."
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-sky-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <FiX size={14} />
              </button>
            )}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-600 hover:bg-slate-200 transition"
            >
              <FiFilter size={12} /> Clear
            </button>
          )}
        </div>
      </section>

      {/* Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Taxable Turnover */}
        <div className="rounded-xl border border-sky-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Taxable Turnover
            </p>
            <p className="mt-1 text-2xl font-black text-sky-700">
              {money(metrics.totalTaxable)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Across {metrics.totalTransactions} transactions
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <FiLayers size={22} />
          </div>
        </div>

        {/* Card 2: Total GST Amount */}
        <div className="rounded-xl border border-emerald-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total GST Amount
            </p>
            <p className="mt-1 text-2xl font-black text-emerald-700">
              {money(metrics.totalTax)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              CGST + SGST + IGST + Cess
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <FiTrendingUp size={22} />
          </div>
        </div>

        {/* Card 3: Intra-State Tax (CGST + SGST) */}
        <div className="rounded-xl border border-indigo-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              CGST & SGST (Intra-State)
            </p>
            <p className="mt-1 text-2xl font-black text-indigo-700">
              {money(metrics.totalCgst + metrics.totalSgst)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              CGST: {money(metrics.totalCgst)} • SGST: {money(metrics.totalSgst)}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <FiFileText size={22} />
          </div>
        </div>

        {/* Card 4: Inter-State Tax (IGST) */}
        <div className="rounded-xl border border-purple-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              IGST (Inter-State)
            </p>
            <p className="mt-1 text-2xl font-black text-purple-700">
              {money(metrics.totalIgst)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {metrics.totalCess > 0
                ? `Cess: ${money(metrics.totalCess)}`
                : "Inter-state supply tax"}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-600">
            <FiLayers size={22} />
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="mx-5 mb-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {activeTab === "summary" ? (
          /* GST Rate Breakdown Summary Table View */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  Rate-Wise GST Breakdown
                </h2>
                <p className="text-xs text-slate-400">
                  Aggregated turnover, tax components, and transaction counts per GST rate.
                </p>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                {metrics.rateBreakdown.length} GST Rates
              </span>
            </div>

            {rateFilter !== "All" && (
              <div className="flex items-center justify-between bg-sky-50 border-b border-sky-100 px-5 py-2 text-xs text-sky-800">
                <span>
                  Showing single rate:{" "}
                  <strong className="font-semibold">
                    {formatTaxRateLabel(rateFilter)}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setRateFilter("All")}
                  className="font-bold text-sky-600 hover:text-sky-800 underline"
                >
                  Show All Rates
                </button>
              </div>
            )}

            {metrics.rateBreakdown.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[750px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-center w-12">#</th>
                      <th className="px-4 py-3">GST Rate</th>
                      <th className="px-4 py-3 text-center">Transactions</th>
                      <th className="px-4 py-3 text-right">Taxable Amount</th>
                      <th className="px-4 py-3 text-right">CGST</th>
                      <th className="px-4 py-3 text-right">SGST</th>
                      <th className="px-4 py-3 text-right">IGST</th>
                      <th className="px-4 py-3 text-right">Total GST</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.rateBreakdown.map((r, idx) => (
                      <tr
                        key={String(r.rate)}
                        className="hover:bg-slate-50/80 transition"
                      >
                        <td className="px-4 py-3 text-center text-slate-400 font-medium">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                            {r.rateLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-slate-700">
                          {r.transactionCount}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {money(r.taxable)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600">
                          {money(r.cgst)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600">
                          {money(r.sgst)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600">
                          {money(r.igst)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-emerald-700">
                          {money(r.tax)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setRateFilter(String(r.rate));
                              setActiveTab("transactions");
                            }}
                            className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-100 transition"
                          >
                            View Transactions
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-left">
                        Total ({metrics.rateBreakdown.length} Rates)
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {metrics.totalTransactions}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {money(metrics.totalTaxable)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {money(metrics.totalCgst)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {money(metrics.totalSgst)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {money(metrics.totalIgst)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">
                        {money(metrics.totalTax)}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <FiLayers size={28} />
                </div>
                <h3 className="text-base font-semibold text-slate-700">
                  No GST Data Found
                </h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  No transactions match the selected date range and filter criteria.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Detailed Contributing Transactions Table View */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rateFilter !== "All" && (
              <div className="flex items-center justify-between bg-sky-50 border-b border-sky-100 px-5 py-2.5 text-xs text-sky-900">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-600">Filtered by GST Rate:</span>
                  <span className="rounded-md bg-white px-2.5 py-0.5 font-bold text-sky-700 shadow-xs border border-sky-200">
                    {formatTaxRateLabel(rateFilter)}
                  </span>
                  <span className="text-slate-400">({filteredLines.length} lines)</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRateFilter("All")}
                    className="font-medium text-slate-500 hover:text-slate-800 underline"
                  >
                    Clear Rate Filter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRateFilter("All");
                      setActiveTab("summary");
                    }}
                    className="rounded-md bg-sky-600 px-3 py-1 font-semibold text-white shadow-xs hover:bg-sky-700 transition"
                  >
                    ← Back to Rate Summary
                  </button>
                </div>
              </div>
            )}

            {filteredLines.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[950px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3 text-center w-10">#</th>
                      <th
                        className="px-3 py-3 cursor-pointer select-none"
                        onClick={() => setSortAsc((prev) => !prev)}
                        title="Click to sort by date"
                      >
                        <div className="flex items-center gap-1">
                          <span>Date</span>
                          {sortAsc ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-center">Type</th>
                      <th className="px-3 py-3">Doc No.</th>
                      <th className="px-3 py-3">Party Name</th>
                      <th className="px-3 py-3">Item / Description</th>
                      <th className="px-3 py-3 text-center">Rate</th>
                      <th className="px-3 py-3 text-right">Taxable</th>
                      <th className="px-3 py-3 text-right">CGST</th>
                      <th className="px-3 py-3 text-right">SGST</th>
                      <th className="px-3 py-3 text-right">IGST</th>
                      <th className="px-3 py-3 text-right">Total GST</th>
                      <th className="px-3 py-3 text-right">Total Amt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLines.map((line, idx) => (
                      <tr
                        key={`${line.transactionId}-${idx}`}
                        className="hover:bg-sky-50/50 transition odd:bg-white even:bg-slate-50/40"
                      >
                        <td className="px-3 py-3 text-center text-slate-400 font-medium">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700 whitespace-nowrap">
                          {formatDateDMY(line.date)}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                              line.transactionType === "Sale"
                                ? "bg-emerald-50 text-emerald-700"
                                : line.transactionType === "Purchase"
                                ? "bg-sky-50 text-sky-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {line.transactionType}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">
                          {line.transactionNumber}
                        </td>
                        <td className="px-3 py-3 text-slate-700 font-medium">
                          {line.party || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-xs truncate" title={line.itemDescription}>
                          {line.itemDescription}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                            {line.rateLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                          {money(line.taxable)}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">
                          {line.cgst > 0 ? money(line.cgst) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">
                          {line.sgst > 0 ? money(line.sgst) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">
                          {line.igst > 0 ? money(line.igst) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                          {money(line.tax)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {money(line.invoiceTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-left">
                        Total ({filteredLines.length} Lines)
                      </td>
                      <td className="px-3 py-3"></td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">
                        {money(metrics.totalTaxable)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        {money(metrics.totalCgst)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        {money(metrics.totalSgst)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        {money(metrics.totalIgst)}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-emerald-700">
                        {money(metrics.totalTax)}
                      </td>
                      <td className="px-3 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-12 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <FiFileText size={28} />
                </div>
                <h3 className="text-base font-semibold text-slate-700">
                  No Contributing Transactions
                </h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  {hasActiveFilters
                    ? "No transactions match the selected rate and filter criteria."
                    : "No transactions recorded yet."}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
