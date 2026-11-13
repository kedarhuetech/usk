import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiChevronDown,
  FiPrinter,
  FiSearch,
  FiBarChart2,
  FiTrendingDown,
  FiFileText,
  FiAward,
  FiPieChart,
  FiPlus,
  FiX,
  FiFilter,
  FiEdit,
  FiArrowUp,
  FiArrowDown,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import ReportPrintPreviewModal from "../../components/Common/ReportPrintPreviewModal";
import {
  getExpenses,
  getExpenseCategories,
} from "../../services/transactionRepository.js";
import { businessDataChangedEvent } from "../../services/businessDataChanged.js";
import {
  formatDateDMY,
  getPresetDateRange,
  filterExpenses,
  calculateExpenseMetrics,
  rowAmount,
} from "../../utils/expenseCalculations.js";
import {
  buildUnifiedDocumentHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";

const money = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function ExpenseReport({ initialTab = "transactions" }) {
  const navigate = useNavigate();

  // Active view tab: "transactions" | "category"
  const [activeTab, setActiveTab] = useState(initialTab);

  // Filters state
  const [period, setPeriod] = useState("This Month");
  const [dateRange, setDateRange] = useState(() => getPresetDateRange("This Month"));
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [partyFilter, setPartyFilter] = useState("All");
  const [paymentModeFilter, setPaymentModeFilter] = useState("All");
  const [search, setSearch] = useState("");

  // UI state
  const [chartOpen, setChartOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false); // false = newest first
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync when initialTab changes (e.g. user toggles between Expense and Expense Category Report in sidebar)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

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

  // Load actual expenses from repository
  const allExpenses = useMemo(() => {
    void refreshTrigger;
    return getExpenses();
  }, [refreshTrigger]);

  // Available categories discovered from the application
  const categoryOptions = useMemo(() => {
    void refreshTrigger;
    return getExpenseCategories();
  }, [refreshTrigger]);

  // Available parties discovered from actual expenses
  const partyOptions = useMemo(() => {
    const set = new Set();
    allExpenses.forEach((e) => {
      if (e.party && e.party.trim()) {
        set.add(e.party.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allExpenses]);

  // Available payment modes discovered from actual expenses
  const paymentModeOptions = useMemo(() => {
    const set = new Set(["Cash", "Cheque", "Bank Transfer", "UPI", "Card"]);
    allExpenses.forEach((e) => {
      e.paymentModesList.forEach((m) => {
        if (m && m.trim()) set.add(m.trim());
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allExpenses]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    const filtered = filterExpenses(allExpenses, {
      from: dateRange.from,
      to: dateRange.to,
      category: categoryFilter,
      party: partyFilter,
      paymentMode: paymentModeFilter,
      search,
    });

    return filtered.sort((a, b) => {
      const cmp = String(a.date || "").localeCompare(String(b.date || ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [
    allExpenses,
    dateRange,
    categoryFilter,
    partyFilter,
    paymentModeFilter,
    search,
    sortAsc,
  ]);

  // Summary Metrics & Breakdowns
  const totals = useMemo(() => {
    return calculateExpenseMetrics(filteredExpenses);
  }, [filteredExpenses]);

  // Has any active filter
  const hasActiveFilters =
    categoryFilter !== "All" ||
    partyFilter !== "All" ||
    paymentModeFilter !== "All" ||
    Boolean(search.trim()) ||
    period !== "This Month";

  const clearFilters = () => {
    setCategoryFilter("All");
    setPartyFilter("All");
    setPaymentModeFilter("All");
    setSearch("");
    setPeriod("This Month");
    setDateRange(getPresetDateRange("This Month"));
  };

  // Export to Excel
  const exportExcel = () => {
    const headers = [
      "Date",
      "Expense No.",
      "Category",
      "Party / Paid To",
      "Payment Mode",
      "Description",
      "Status",
      "Total Amount",
      "Paid Amount",
      "Balance Due",
    ];

    const dataRows = filteredExpenses.map((exp) => [
      formatDateDMY(exp.date),
      exp.number,
      exp.category,
      exp.party || "—",
      exp.paymentMode,
      exp.description || "—",
      exp.status,
      exp.amount,
      exp.paid,
      exp.balance,
    ]);

    const footerRow = [
      "Total",
      `${totals.transactionCount} Expenses`,
      "",
      "",
      "",
      "",
      "",
      totals.totalExpenses,
      totals.paidTotal,
      totals.balanceTotal,
    ];

    const wsTransactions = XLSX.utils.aoa_to_sheet([
      headers,
      ...dataRows,
      footerRow,
    ]);

    // Category breakdown sheet
    const catHeaders = [
      "Category",
      "Transaction Count",
      "Total Amount",
      "% of Total",
    ];
    const catRows = totals.categoryBreakdown.map((c) => [
      c.category,
      c.count,
      c.total,
      `${c.percentage.toFixed(2)}%`,
    ]);
    const catFooter = [
      "Total",
      totals.transactionCount,
      totals.totalExpenses,
      "100.00%",
    ];
    const wsCategory = XLSX.utils.aoa_to_sheet([
      catHeaders,
      ...catRows,
      catFooter,
    ]);

    const wb = XLSX.utils.book_new();
    if (activeTab === "category") {
      XLSX.utils.book_append_sheet(wb, wsCategory, "Category Summary");
      XLSX.utils.book_append_sheet(wb, wsTransactions, "Expense Transactions");
    } else {
      XLSX.utils.book_append_sheet(wb, wsTransactions, "Expense Transactions");
      XLSX.utils.book_append_sheet(wb, wsCategory, "Category Summary");
    }

    const filename = `Expense_Report_${dateRange.from || "all"}_to_${
      dateRange.to || "all"
    }.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Dedicated Print for Category Summary Table
  const handlePrintCategorySummary = () => {
    const rows = totals.categoryBreakdown.map((cat, idx) => ({
      index: idx + 1,
      category: cat.category,
      count: cat.count,
      total: cat.total,
      percentage: `${cat.percentage.toFixed(2)}%`,
    }));

    const dateSub =
      dateRange.from && dateRange.to
        ? `Period: ${formatDateDMY(dateRange.from)} to ${formatDateDMY(dateRange.to)}`
        : "Period: All Time";

    const html = buildUnifiedDocumentHtml({
      title: "Expense Category Report",
      documentNumber: `EXP-CAT-${dateRange.from ? dateRange.from.replace(/-/g, "") : "ALL"}`,
      date: formatDateDMY(new Date().toISOString().slice(0, 10)),
      status: `${totals.categoryBreakdown.length} Categories`,
      partyName: "All Parties / General",
      columns: [
        { key: "index", label: "#", align: "center", width: "50px" },
        { key: "category", label: "Expense Category", align: "left" },
        { key: "count", label: "Transactions", align: "center", width: "110px" },
        {
          key: "total",
          label: "Total Amount",
          align: "right",
          width: "140px",
          formatMoney: true,
        },
        { key: "percentage", label: "% of Total", align: "right", width: "100px" },
      ],
      rows,
      totals: {
        subtotal: totals.totalExpenses,
        total: totals.totalExpenses,
      },
      notes: `${dateSub} | Categories: ${totals.categoryBreakdown.length} | Transactions: ${totals.transactionCount} | Total Allocation: 100.00%`,
      autoPrint: true,
    });

    openPrintWindow(html, true);
  };

  // Single Expense Voucher Print
  const handlePrintSingle = (exp) => {
    const rows = (exp.raw.rows || []).map((row) => ({
      item: row.item || exp.category || "Expense Item",
      qty: row.qty || 1,
      price: row.price || 0,
      tax: exp.gst && row.tax ? `${row.tax}%` : "—",
      amount: rowAmount(row, exp.gst),
    }));

    const html = buildUnifiedDocumentHtml({
      title: "Expense Voucher",
      documentNumber: exp.number,
      date: formatDateDMY(exp.date),
      status: exp.status,
      partyName: exp.party || exp.category || "General Expense",
      columns: [
        { key: "index", label: "#", align: "center", width: "40px" },
        { key: "item", label: "Expense Item / Category", align: "left" },
        { key: "qty", label: "Qty", align: "center", width: "60px" },
        {
          key: "price",
          label: "Rate",
          align: "right",
          width: "100px",
          formatMoney: true,
        },
        { key: "tax", label: "Tax", align: "center", width: "70px" },
        {
          key: "amount",
          label: "Amount",
          align: "right",
          width: "120px",
          formatMoney: true,
        },
      ],
      rows,
      totals: {
        subtotal: exp.amount,
        total: exp.amount,
        received: exp.paid,
        balance: exp.balance,
      },
      notes: exp.description
        ? `Category: ${exp.category} | ${exp.description}`
        : `Category: ${exp.category}`,
      autoPrint: true,
    });

    openPrintWindow(html, true);
  };

  // Records mapped for ReportPrintPreviewModal
  const printRecords = useMemo(() => {
    return filteredExpenses.map((exp) => ({
      ...exp.raw,
      invoiceDate: exp.date,
      date: exp.date,
      invoiceNo: exp.number,
      partyName: exp.party || exp.category || "General Expense",
      transactionType: "Expense",
      type: "Expense",
      paymentType: exp.paymentMode,
      totalAmount: exp.amount,
      amount: exp.amount,
      received: exp.paid,
      balance: exp.balance,
      status: exp.status,
      rows: (exp.raw.rows || []).map((r) => ({
        ...r,
        name: r.item || exp.category || "Expense Item",
        qty: r.qty || 1,
        price: r.price || 0,
        amount: rowAmount(r, exp.gst),
      })),
    }));
  }, [filteredExpenses]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Top Header */}
      <header className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">
              {activeTab === "category" ? "Expense Category Report" : "Expense Report"}
            </h1>
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("transactions")}
                className={`rounded px-3 py-1 transition ${
                  activeTab === "transactions"
                    ? "bg-white text-sky-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Transactions ({totals.transactionCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("category")}
                className={`rounded px-3 py-1 transition ${
                  activeTab === "category"
                    ? "bg-white text-sky-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Category Summary ({totals.categoryBreakdown.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Monitor business expenses, evaluate categories, and track payment outflows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Toggle visual overview"
            onClick={() => setChartOpen((prev) => !prev)}
            className={`flex h-9 w-9 items-center justify-center rounded-md border text-slate-600 transition hover:bg-slate-100 ${
              chartOpen
                ? "border-sky-500 bg-sky-50 text-sky-600"
                : "border-slate-200"
            }`}
          >
            <FiBarChart2 size={18} />
          </button>

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
            onClick={() => {
              if (activeTab === "category") {
                handlePrintCategorySummary();
              } else {
                setPrintModalOpen(true);
              }
            }}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <FiPrinter size={15} /> Print
          </button>

          <button
            type="button"
            onClick={() => navigate("/purchase-expense/expenses")}
            className="flex h-9 items-center gap-1 rounded-md bg-rose-600 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition"
          >
            <FiPlus size={15} /> Add Expense
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

          {/* Category Filter */}
          <div className="relative">
            <select
              aria-label="Category filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option value="All">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
              size={14}
            />
          </div>

          {/* Party Filter */}
          {partyOptions.length > 0 && (
            <div className="relative">
              <select
                aria-label="Party filter"
                value={partyFilter}
                onChange={(e) => setPartyFilter(e.target.value)}
                className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
              >
                <option value="All">All Parties</option>
                {partyOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <FiChevronDown
                className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
                size={14}
              />
            </div>
          )}

          {/* Payment Mode Filter */}
          <div className="relative">
            <select
              aria-label="Payment mode filter"
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option value="All">All Payment Modes</option>
              {paymentModeOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
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
              placeholder="Search description, party, ref no..."
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
        {/* Card 1: Total Expenses */}
        <div className="rounded-xl border border-rose-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Expenses
            </p>
            <p className="mt-1 text-2xl font-black text-rose-600">
              {money(totals.totalExpenses)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Paid: {money(totals.paidTotal)} • Due: {money(totals.balanceTotal)}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <FiTrendingDown size={22} />
          </div>
        </div>

        {/* Card 2: Transactions Count */}
        <div className="rounded-xl border border-sky-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Transactions
            </p>
            <p className="mt-1 text-2xl font-black text-slate-800">
              {totals.transactionCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {totals.categoryBreakdown.length} active categories
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <FiFileText size={22} />
          </div>
        </div>

        {/* Card 3: Highest Expense */}
        <div className="rounded-xl border border-amber-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Highest Expense
            </p>
            <p className="mt-1 text-2xl font-black text-amber-600">
              {money(totals.highestExpense)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Single largest recorded expense
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <FiAward size={22} />
          </div>
        </div>

        {/* Card 4: Average Expense */}
        <div className="rounded-xl border border-indigo-100 bg-white p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Average Expense
            </p>
            <p className="mt-1 text-2xl font-black text-indigo-600">
              {money(totals.averageExpense)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Average per expense transaction
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <FiPieChart size={22} />
          </div>
        </div>
      </section>

      {/* Visual Charts Overview (Collapsible) */}
      {chartOpen && (
        <section className="mx-5 mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Category Distribution */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-xs font-bold uppercase text-slate-700">
                Expense Category Distribution
              </h2>
              <span className="text-xs text-slate-400">
                Click category to filter
              </span>
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto space-y-2.5 pr-1">
              {totals.categoryBreakdown.length > 0 ? (
                totals.categoryBreakdown.map((cat) => (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() =>
                      setCategoryFilter(
                        categoryFilter === cat.category ? "All" : cat.category
                      )
                    }
                    className={`block w-full text-left rounded-md p-1.5 transition ${
                      categoryFilter === cat.category
                        ? "bg-sky-50 ring-1 ring-sky-300"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <span>{cat.category} ({cat.count})</span>
                      <span className="font-bold">{money(cat.total)} ({cat.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(2, cat.percentage))}%` }}
                      />
                    </div>
                  </button>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">
                  No expense category data for current filter
                </p>
              )}
            </div>
          </div>

          {/* Payment Mode Distribution */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-xs font-bold uppercase text-slate-700">
                Payment Outflows By Mode
              </h2>
              <span className="text-xs text-slate-400">
                Click mode to filter
              </span>
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto space-y-2.5 pr-1">
              {totals.paymentModeBreakdown.length > 0 ? (
                totals.paymentModeBreakdown.map((pm) => (
                  <button
                    key={pm.mode}
                    type="button"
                    onClick={() =>
                      setPaymentModeFilter(
                        paymentModeFilter === pm.mode ? "All" : pm.mode
                      )
                    }
                    className={`block w-full text-left rounded-md p-1.5 transition ${
                      paymentModeFilter === pm.mode
                        ? "bg-emerald-50 ring-1 ring-emerald-300"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <span>{pm.mode} ({pm.count})</span>
                      <span className="font-bold">{money(pm.total)} ({pm.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(2, pm.percentage))}%` }}
                      />
                    </div>
                  </button>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">
                  No payment mode data for current filter
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <div className="mx-5 mb-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {activeTab === "category" ? (
          /* Category Breakdown View */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  Expense Category Breakdown
                </h2>
                <p className="text-xs text-slate-400">
                  Aggregated totals for actual business categories in the selected range.
                </p>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                {totals.categoryBreakdown.length} Categories
              </span>
            </div>

            {categoryFilter !== "All" && (
              <div className="flex items-center justify-between bg-sky-50 border-b border-sky-100 px-5 py-2 text-xs text-sky-800">
                <span>
                  Showing single category: <strong className="font-semibold">{categoryFilter}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("All")}
                  className="font-bold text-sky-600 hover:text-sky-800 underline"
                >
                  Show All Categories
                </button>
              </div>
            )}

            {totals.categoryBreakdown.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-center w-12">#</th>
                      <th className="px-4 py-3">Expense Category</th>
                      <th className="px-4 py-3 text-center">Transactions</th>
                      <th className="px-4 py-3 text-right">Total Amount</th>
                      <th className="px-4 py-3 text-right">% of Total</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {totals.categoryBreakdown.map((cat, idx) => (
                      <tr
                        key={cat.category}
                        className="hover:bg-slate-50/80 transition"
                      >
                        <td className="px-4 py-3 text-center text-slate-400 font-medium">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {cat.category}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-slate-700">
                          {cat.count}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600">
                          {money(cat.total)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600">
                          {cat.percentage.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryFilter(cat.category);
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
                        Total ({totals.categoryBreakdown.length} Categories)
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {totals.transactionCount}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-rose-600">
                        {money(totals.totalExpenses)}
                      </td>
                      <td className="px-4 py-3 text-right">100.00%</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <FiPieChart size={28} />
                </div>
                <h3 className="text-base font-semibold text-slate-700">
                  No Category Data
                </h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  No expense records match the selected date range and filter criteria.
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
          /* Expense Transactions Table View */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {categoryFilter !== "All" && (
              <div className="flex items-center justify-between bg-sky-50 border-b border-sky-100 px-5 py-2.5 text-xs text-sky-900">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-600">Filtered by category:</span>
                  <span className="rounded-md bg-white px-2.5 py-0.5 font-bold text-sky-700 shadow-xs border border-sky-200">
                    {categoryFilter}
                  </span>
                  <span className="text-slate-400">({filteredExpenses.length} transactions)</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("All")}
                    className="font-medium text-slate-500 hover:text-slate-800 underline"
                  >
                    Clear filter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter("All");
                      setActiveTab("category");
                    }}
                    className="rounded-md bg-sky-600 px-3 py-1 font-semibold text-white shadow-xs hover:bg-sky-700 transition"
                  >
                    ← Back to Category Summary
                  </button>
                </div>
              </div>
            )}
            {filteredExpenses.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[850px] border-collapse text-left text-xs">
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
                      <th className="px-3 py-3">Expense No.</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Party / Paid To</th>
                      <th className="px-3 py-3">Payment Mode</th>
                      <th className="px-3 py-3">Description</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-3 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenses.map((exp, idx) => (
                      <tr
                        key={exp.id}
                        className="hover:bg-sky-50/50 transition odd:bg-white even:bg-slate-50/40"
                      >
                        <td className="px-3 py-3 text-center text-slate-400 font-medium">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700 whitespace-nowrap">
                          {formatDateDMY(exp.date)}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">
                          {exp.number}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {exp.category}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-700 font-medium">
                          {exp.party || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {exp.paymentMode}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-xs truncate" title={exp.description}>
                          {exp.description || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              exp.status === "Paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : exp.status === "Partially Paid"
                                ? "bg-amber-100 text-amber-800"
                                : exp.status === "Cancelled"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {exp.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-black text-rose-600 whitespace-nowrap">
                          <div>{money(exp.amount)}</div>
                          {exp.balance > 0 && exp.status !== "Cancelled" && (
                            <div className="text-[10px] font-medium text-amber-700">
                              Due: {money(exp.balance)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                navigate("/purchase-expense/expenses", {
                                  state: { editExpense: exp.raw },
                                })
                              }
                              title="Edit Expense"
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-sky-600"
                            >
                              <FiEdit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintSingle(exp)}
                              title="Print Expense Voucher"
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              <FiPrinter size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-left">
                        Total ({totals.transactionCount} Expenses)
                      </td>
                      <td colSpan={5} className="px-3 py-3 text-right text-slate-500 text-xs">
                        Paid: {money(totals.paidTotal)} • Balance: {money(totals.balanceTotal)}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-rose-600">
                        {money(totals.totalExpenses)}
                      </td>
                      <td className="px-3 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-12 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-100 text-slate-400 mb-4">
                  <FiTrendingDown size={36} />
                </div>
                <h3 className="text-lg font-bold text-slate-700">
                  No Expenses Found
                </h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  {hasActiveFilters
                    ? "No expenses matched your filter criteria. Try clearing or expanding your filters."
                    : "No expenses have been recorded yet. Add your first business expense to start tracking."}
                </p>
                <div className="mt-5 flex gap-2">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Clear Filters
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate("/purchase-expense/expenses")}
                    className="rounded-md bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700"
                  >
                    ＋ Add Expense
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Print Preview Modal */}
      <ReportPrintPreviewModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Expense Report"
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        records={printRecords}
        totalLabel="Total Expenses:"
        totalAmount={totals.totalExpenses}
      />
    </div>
  );
}
