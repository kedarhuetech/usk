import { useState, useMemo, useEffect } from "react";
import {
  FiPrinter,
  FiSearch,
  FiFileText,
  FiX,
  FiFilter,
  FiArrowUp,
  FiArrowDown,
  FiTrendingUp,
  FiTrendingDown,
  FiLayers,
  FiInfo,
  FiChevronDown,
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
  compileGstSummary,
  groupLinesByTransaction,
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

export default function GSTReport() {
  // Filters state
  const [period, setPeriod] = useState("This Month");
  const [dateRange, setDateRange] = useState(() => getPresetDateRange("This Month"));
  const [txTypeFilter, setTxTypeFilter] = useState("All"); // "All" | "Sale" | "Purchase"
  const [rateFilter, setRateFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [viewMode, setViewMode] = useState("transactions"); // "transactions" | "lines"

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

  // 2. Compile raw GST lines
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

  // 3. Available rates discovered from transactions
  const availableRates = useMemo(() => {
    const set = new Set();
    allLines.forEach((l) => set.add(l.taxRate));
    return Array.from(set).sort((a, b) => b - a);
  }, [allLines]);

  // 4. Filtered lines based on user controls
  const filteredLines = useMemo(() => {
    return filterGstLines(allLines, {
      from: dateRange.from,
      to: dateRange.to,
      transactionType: txTypeFilter,
      rate: rateFilter,
      search,
    });
  }, [allLines, dateRange, txTypeFilter, rateFilter, search]);

  // 5. Compute Sales GST Summary, Purchase GST Summary, and Overall Summary
  const summary = useMemo(() => {
    return compileGstSummary(filteredLines);
  }, [filteredLines]);

  // 6. Grouped transaction vouchers
  const groupedTransactions = useMemo(() => {
    const list = groupLinesByTransaction(filteredLines);
    return list.sort((a, b) => {
      const cmp = String(a.date || "").localeCompare(String(b.date || ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [filteredLines, sortAsc]);

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
    // 1. Summary Sheet
    const summaryData = [
      ["USV GST Report Summary"],
      ["Period", `${dateRange.from || "All"} to ${dateRange.to || "All"}`],
      ["Transaction Type", txTypeFilter],
      [""],
      ["Sales GST Summary (Outward Supplies)"],
      ["Total Taxable Sales", summary.sales.taxable],
      ["Total CGST Collected", summary.sales.cgst],
      ["Total SGST Collected", summary.sales.sgst],
      ["Total IGST Collected", summary.sales.igst],
      ["Total Cess Collected", summary.sales.cess],
      ["Total GST on Sales", summary.sales.tax],
      ["Sales Invoices Count", summary.sales.count],
      [""],
      ["Purchase GST Summary (Inward Supplies)"],
      ["Total Taxable Purchases", summary.purchases.taxable],
      ["Total CGST Paid", summary.purchases.cgst],
      ["Total SGST Paid", summary.purchases.sgst],
      ["Total IGST Paid", summary.purchases.igst],
      ["Total Cess Paid", summary.purchases.cess],
      ["Total GST on Purchases", summary.purchases.tax],
      ["Purchase Bills Count", summary.purchases.count],
      [""],
      ["Overall Summary"],
      ["Total Sales GST", summary.overall.totalSalesGst],
      ["Total Purchase GST", summary.overall.totalPurchaseGst],
      ["Difference (Sales GST - Purchase GST)", summary.overall.netDifference],
      ["Note: Difference is an informational figure, not confirmed tax liability."],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

    // 2. Transactions Sheet
    const txHeaders = [
      "Date",
      "Type",
      "Doc No.",
      "Party Name",
      "GST Rates",
      "Taxable Amount",
      "CGST",
      "SGST",
      "IGST",
      "Total GST",
      "Invoice Total",
      "Status",
    ];

    const txRows = groupedTransactions.map((tx) => [
      formatDateDMY(tx.date),
      tx.transactionType,
      tx.transactionNumber,
      tx.party,
      tx.ratesLabel,
      tx.taxable,
      tx.cgst,
      tx.sgst,
      tx.igst,
      tx.tax,
      tx.invoiceTotal,
      tx.status,
    ]);

    const txFooter = [
      "Total",
      "",
      "",
      "",
      "",
      summary.overall.totalTaxable,
      summary.overall.totalCgst,
      summary.overall.totalSgst,
      summary.overall.totalIgst,
      summary.overall.totalTax,
      "",
      "",
    ];

    const wsTx = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows, txFooter]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "GST Summary");
    XLSX.utils.book_append_sheet(wb, wsTx, "GST Transactions");

    const filename = `GST_Report_${dateRange.from || "all"}_to_${
      dateRange.to || "all"
    }.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Print Document
  const handlePrint = () => {
    const rows = groupedTransactions.map((tx, idx) => ({
      index: idx + 1,
      date: formatDateDMY(tx.date),
      type: tx.transactionType,
      number: tx.transactionNumber,
      party: tx.party,
      taxable: tx.taxable,
      cgst: tx.cgst,
      sgst: tx.sgst,
      igst: tx.igst,
      tax: tx.tax,
    }));

    const dateSub =
      dateRange.from && dateRange.to
        ? `Period: ${formatDateDMY(dateRange.from)} to ${formatDateDMY(dateRange.to)}`
        : "Period: All Time";

    const typeSub =
      txTypeFilter === "All"
        ? "Type: All Transactions"
        : `Type: ${txTypeFilter}`;

    const html = buildUnifiedDocumentHtml({
      title: "GST Report",
      documentNumber: `GST-REP-${dateRange.from ? dateRange.from.replace(/-/g, "") : "ALL"}`,
      date: formatDateDMY(new Date().toISOString().slice(0, 10)),
      status: `${groupedTransactions.length} Transactions`,
      partyName: "All Parties / General",
      columns: [
        { key: "index", label: "#", align: "center", width: "40px" },
        { key: "date", label: "Date", align: "center", width: "80px" },
        { key: "type", label: "Type", align: "center", width: "70px" },
        { key: "number", label: "Doc No.", align: "left", width: "80px" },
        { key: "party", label: "Party", align: "left" },
        {
          key: "taxable",
          label: "Taxable",
          align: "right",
          width: "110px",
          formatMoney: true,
        },
        {
          key: "cgst",
          label: "CGST",
          align: "right",
          width: "90px",
          formatMoney: true,
        },
        {
          key: "sgst",
          label: "SGST",
          align: "right",
          width: "90px",
          formatMoney: true,
        },
        {
          key: "igst",
          label: "IGST",
          align: "right",
          width: "90px",
          formatMoney: true,
        },
        {
          key: "tax",
          label: "Total GST",
          align: "right",
          width: "110px",
          formatMoney: true,
        },
      ],
      rows,
      totals: {
        subtotal: summary.overall.totalTaxable,
        total: summary.overall.totalTax,
      },
      notes: `${dateSub} | ${typeSub} | Sales GST: ₹${summary.sales.tax.toFixed(
        2
      )} | Purchase GST: ₹${summary.purchases.tax.toFixed(
        2
      )} | Net Difference (Informational): ₹${summary.overall.netDifference.toFixed(2)}`,
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
            <h1 className="text-xl font-bold text-slate-800">GST Report</h1>
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode("transactions")}
                className={`rounded px-3 py-1 transition ${
                  viewMode === "transactions"
                    ? "bg-white text-sky-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Vouchers ({groupedTransactions.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("lines")}
                className={`rounded px-3 py-1 transition ${
                  viewMode === "lines"
                    ? "bg-white text-sky-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Line Items ({filteredLines.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Comprehensive sales and purchase GST tax breakdown, intra-state vs inter-state tax splits, and net flow summary.
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
            onClick={handlePrint}
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
              placeholder="Search invoice/bill no, party, item..."
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

      {/* Summary KPI Sections */}
      <section className="p-5 space-y-4">
        {/* Three Columns: Sales Summary, Purchase Summary, and Overall Summary */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 1. Sales GST Summary Card */}
          <div className="rounded-xl border border-emerald-100 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-emerald-50 pb-2.5 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Sales GST Summary
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  {summary.sales.count} Invoices
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Taxable Sales:</span>
                  <span className="font-semibold text-slate-800">{money(summary.sales.taxable)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>CGST Collected:</span>
                  <span className="font-medium text-slate-700">{money(summary.sales.cgst)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>SGST Collected:</span>
                  <span className="font-medium text-slate-700">{money(summary.sales.sgst)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>IGST Collected:</span>
                  <span className="font-medium text-slate-700">{money(summary.sales.igst)}</span>
                </div>
                {summary.sales.cess > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Cess Collected:</span>
                    <span className="font-medium text-slate-700">{money(summary.sales.cess)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Total GST on Sales:</span>
              <span className="text-lg font-black text-emerald-600">{money(summary.sales.tax)}</span>
            </div>
          </div>

          {/* 2. Purchase GST Summary Card */}
          <div className="rounded-xl border border-sky-100 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-sky-50 pb-2.5 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
                  Purchase GST Summary
                </span>
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                  {summary.purchases.count} Bills
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Taxable Purchases:</span>
                  <span className="font-semibold text-slate-800">{money(summary.purchases.taxable)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>CGST Paid:</span>
                  <span className="font-medium text-slate-700">{money(summary.purchases.cgst)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>SGST Paid:</span>
                  <span className="font-medium text-slate-700">{money(summary.purchases.sgst)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>IGST Paid:</span>
                  <span className="font-medium text-slate-700">{money(summary.purchases.igst)}</span>
                </div>
                {summary.purchases.cess > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Cess Paid:</span>
                    <span className="font-medium text-slate-700">{money(summary.purchases.cess)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Total GST on Purchases:</span>
              <span className="text-lg font-black text-sky-600">{money(summary.purchases.tax)}</span>
            </div>
          </div>

          {/* 3. Overall Summary Card */}
          <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-indigo-50 pb-2.5 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                  Overall GST Summary
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                  {summary.overall.totalTransactions} Total
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Sales GST:</span>
                  <span className="font-semibold text-emerald-600">{money(summary.overall.totalSalesGst)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Purchase GST:</span>
                  <span className="font-semibold text-sky-600">{money(summary.overall.totalPurchaseGst)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Total Taxable Turnover:</span>
                  <span className="font-medium text-slate-700">{money(summary.overall.totalTaxable)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Total Tax Across Ops:</span>
                  <span className="font-medium text-slate-700">{money(summary.overall.totalTax)}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Net GST Difference:
                </span>
                <span
                  className={`text-lg font-black ${
                    summary.overall.netDifference >= 0 ? "text-indigo-700" : "text-amber-600"
                  }`}
                >
                  {money(summary.overall.netDifference)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 italic">
                *Informational figure only; not confirmed GST liability.
              </p>
            </div>
          </div>
        </div>

        {/* Informational Callout Banner */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 shadow-2xs">
          <FiInfo className="mt-0.5 text-amber-600 shrink-0" size={16} />
          <div>
            <strong className="font-semibold">Statutory Accounting Note:</strong> The net difference of{" "}
            <strong>{money(summary.overall.netDifference)}</strong> between Sales GST collected and Purchase GST paid is an informational figure for tracking operational tax flow. Actual GST payable or eligible Input Tax Credit (ITC) must be determined in your statutory <strong>GSTR-3B</strong> return according to Section 16/17(5) eligibility and reverse charge rules.
          </div>
        </div>
      </section>

      {/* Transaction Details Table View */}
      <div className="mx-5 mb-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {viewMode === "transactions" ? "Contributing Vouchers" : "Contributing Tax Line Items"}
            </h2>
            <p className="text-xs text-slate-400">
              {viewMode === "transactions"
                ? "Transaction-level vouchers contributing to the active GST report."
                : "Line-by-line item tax components for detailed audit."}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {viewMode === "transactions" ? groupedTransactions.length : filteredLines.length} Records
          </span>
        </div>

        {viewMode === "transactions" ? (
          /* Transaction-Level Voucher Table */
          groupedTransactions.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-xs">
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
                    <th className="px-3 py-3 text-center">Rates</th>
                    <th className="px-3 py-3 text-right">Taxable</th>
                    <th className="px-3 py-3 text-right">CGST</th>
                    <th className="px-3 py-3 text-right">SGST</th>
                    <th className="px-3 py-3 text-right">IGST</th>
                    <th className="px-3 py-3 text-right">Total GST</th>
                    <th className="px-3 py-3 text-right">Doc Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedTransactions.map((tx, idx) => (
                    <tr
                      key={`${tx.transactionType}-${tx.id}-${idx}`}
                      className="hover:bg-sky-50/50 transition odd:bg-white even:bg-slate-50/40"
                    >
                      <td className="px-3 py-3 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {formatDateDMY(tx.date)}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                            tx.transactionType === "Sale"
                              ? "bg-emerald-50 text-emerald-700"
                              : tx.transactionType === "Purchase"
                              ? "bg-sky-50 text-sky-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {tx.transactionType}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        {tx.transactionNumber}
                      </td>
                      <td className="px-3 py-3 text-slate-700 font-medium">
                        {tx.party || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                          {tx.ratesLabel || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                        {money(tx.taxable)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">
                        {tx.cgst > 0 ? money(tx.cgst) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">
                        {tx.sgst > 0 ? money(tx.sgst) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">
                        {tx.igst > 0 ? money(tx.igst) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-emerald-700 whitespace-nowrap">
                        {money(tx.tax)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {money(tx.invoiceTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-left">
                      Total ({groupedTransactions.length} Transactions)
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">
                      {money(summary.overall.totalTaxable)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-700">
                      {money(summary.overall.totalCgst)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-700">
                      {money(summary.overall.totalSgst)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-700">
                      {money(summary.overall.totalIgst)}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-emerald-700">
                      {money(summary.overall.totalTax)}
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
                No Transactions Found
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
                  Clear Filters
                </button>
              )}
            </div>
          )
        ) : (
          /* Itemized Tax Lines Table */
          filteredLines.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[950px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 text-center w-10">#</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3 text-center">Type</th>
                    <th className="px-3 py-3">Doc No.</th>
                    <th className="px-3 py-3">Party Name</th>
                    <th className="px-3 py-3">Item / Supply</th>
                    <th className="px-3 py-3 text-center">Rate</th>
                    <th className="px-3 py-3 text-right">Taxable</th>
                    <th className="px-3 py-3 text-right">CGST</th>
                    <th className="px-3 py-3 text-right">SGST</th>
                    <th className="px-3 py-3 text-right">IGST</th>
                    <th className="px-3 py-3 text-right">Total GST</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-12 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <FiFileText size={28} />
              </div>
              <h3 className="text-base font-semibold text-slate-700">
                No Lines Found
              </h3>
            </div>
          )
        )}
      </div>
    </div>
  );
}
