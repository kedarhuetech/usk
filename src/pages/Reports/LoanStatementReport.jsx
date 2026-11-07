import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCalendar,
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiExternalLink,
  FiPlus,
  FiX,
  FiArrowUpRight,
  FiCreditCard,
  FiCheckCircle,
} from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";
import { getAllLoans } from "../../services/loanAccountsRepository.js";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";
import { getAppSettings } from "../../services/appSettingsStorage.js";
import {
  buildLoanStatementEntries,
  calculateLoanOpeningBalance,
  computeRunningBalances,
  filterLoanStatementEntries,
  calculateLoanStatementSummary,
  parseYMD,
  roundMoney,
} from "../../utils/loanStatementCalculations.js";

const fmt = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDateDisplay = (dStr) => {
  if (!dStr) return "—";
  const ymd = parseYMD(dStr);
  if (!ymd) return String(dStr);
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultTo() {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export default function LoanStatementReport() {
  const navigate = useNavigate();

  // Filters state
  const [period, setPeriod] = useState("This Month");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [selectedLoanId, setSelectedLoanId] = useState("All");
  const [store, setStore] = useState("All Stores");
  const [user, setUser] = useState("All Users");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  // Data states
  const [loans, setLoans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [printOpen, setPrintOpen] = useState(false);

  // Load loans
  const loadLoansData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAllLoans();
      setLoans(Array.isArray(data) ? data : []);
    } catch {
      setLoans([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLoansData();

    const handleDataChanged = () => loadLoansData();
    window.addEventListener("storage", handleDataChanged);
    window.addEventListener("ledgerly:business-data-changed", handleDataChanged);
    return () => {
      window.removeEventListener("storage", handleDataChanged);
      window.removeEventListener("ledgerly:business-data-changed", handleDataChanged);
    };
  }, [loadLoansData]);

  // Handle Period Presets
  const handlePeriodChange = (val) => {
    setPeriod(val);
    const now = new Date();
    if (val === "This Month") {
      setFrom(defaultFrom());
      setTo(defaultTo());
    } else if (val === "This Year") {
      setFrom(`${now.getFullYear()}-01-01`);
      setTo(`${now.getFullYear()}-12-31`);
    } else if (val === "All Time") {
      setFrom("");
      setTo("");
    }
  };

  // 1. Calculate opening balance as of `from`
  const openingPrincipal = useMemo(() => {
    return calculateLoanOpeningBalance(loans, from, selectedLoanId);
  }, [loans, from, selectedLoanId]);

  // 2. Build full chronological history with running balances
  const allChronologicalWithBalances = useMemo(() => {
    const raw = buildLoanStatementEntries(loans, selectedLoanId);
    return computeRunningBalances(raw, 0);
  }, [loans, selectedLoanId]);

  // 3. Filter entries for the selected range and criteria
  const visibleEntries = useMemo(() => {
    const filtered = filterLoanStatementEntries(allChronologicalWithBalances, {
      from,
      to,
      store,
      user,
      loanId: selectedLoanId,
      search,
    });

    return sortAsc ? filtered : [...filtered].reverse();
  }, [allChronologicalWithBalances, from, to, store, user, selectedLoanId, search, sortAsc]);

  // 4. Calculate Summary Metrics
  const summary = useMemo(() => {
    const inRange = filterLoanStatementEntries(allChronologicalWithBalances, {
      from,
      to,
      store,
      user,
      loanId: selectedLoanId,
    });
    return calculateLoanStatementSummary(inRange, openingPrincipal);
  }, [allChronologicalWithBalances, from, to, store, user, selectedLoanId, openingPrincipal]);

  // Options for Store & User filters
  const storeOptions = useMemo(() => {
    const stores = new Set();
    loans.forEach((l) => {
      if (l.store) stores.add(l.store);
      if (l.firm) stores.add(l.firm);
    });
    return ["All Stores", ...Array.from(stores)];
  }, [loans]);

  const userOptions = useMemo(() => {
    const users = new Set();
    loans.forEach((l) => {
      if (l.user) users.add(l.user);
      if (l.createdBy) users.add(l.createdBy);
    });
    return ["All Users", ...Array.from(users)];
  }, [loans]);

  // Excel Export
  const exportToExcel = () => {
    const headers = [
      "Date",
      "Loan Account",
      "Lender Name",
      "Voucher / Ref No.",
      "Transaction Type",
      "Payment Type",
      "Principal Amount",
      "Interest Amount",
      "Charges",
      "Balance",
      "Status",
      "Notes",
    ];

    const rows = [];

    if (from && openingPrincipal > 0) {
      rows.push([
        fmtDateDisplay(from),
        "—",
        "—",
        "OPENING BALANCE",
        "Opening Principal",
        "—",
        "",
        "",
        "",
        openingPrincipal,
        "—",
        "Balance prior to period",
      ]);
    }

    visibleEntries.forEach((entry) => {
      rows.push([
        fmtDateDisplay(entry.date),
        entry.loanName,
        entry.lenderName,
        entry.reference || "—",
        entry.transactionType,
        entry.paymentType || "Bank Transfer",
        entry.principalAmount,
        entry.interestAmount || 0,
        entry.charges || 0,
        entry.balance,
        entry.status,
        entry.notes || "",
      ]);
    });

    // Summary row
    rows.push([]);
    rows.push([
      "SUMMARY / TOTALS",
      "",
      "",
      "",
      "",
      "",
      summary.totalLoanReceived,
      summary.totalInterestPaid,
      summary.totalChargesPaid,
      summary.outstandingPrincipalBalance,
      "",
      `Outstanding as of ${to ? fmtDateDisplay(to) : "Today"}`,
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Loan Statement");
    XLSX.writeFile(workbook, `Loan-Statement-${from || "All"}-to-${to || "Present"}.xlsx`);
  };

  // Company profile for print
  const companyProfile = useMemo(() => getCompanyProfile(), []);
  const selectedLoanName = useMemo(() => {
    if (!selectedLoanId || selectedLoanId === "All") return "All Loans";
    const found = loans.find((l) => l.id === selectedLoanId);
    return found ? `${found.loanName} (${found.lenderName})` : "All Loans";
  }, [loans, selectedLoanId]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 text-slate-800">
      {/* Top Header */}
      <header className="flex min-h-[60px] items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Loan Statement</h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {selectedLoanName}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Principal disbursements, repayments, interest, and outstanding balances.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate("/cash-bank/loan-accounts")}
            className="flex items-center gap-1.5 rounded-md bg-[#1A1F71] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#14185D] transition"
          >
            <FiPlus /> Manage Loan Accounts
          </button>
        </div>
      </header>

      {/* Filter Toolbar */}
      <section className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 text-sm">
        {/* Period Preset */}
        <label className="flex items-center gap-1.5 rounded-full bg-sky-50 px-3.5 py-1.5 text-xs font-medium text-slate-700">
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="bg-transparent font-semibold outline-none cursor-pointer"
          >
            <option>This Month</option>
            <option>This Year</option>
            <option>All Time</option>
            <option>Custom</option>
          </select>
        </label>

        {/* Date pickers */}
        <div className="flex items-center gap-2 rounded-full bg-sky-50 px-3.5 py-1.5 text-xs text-slate-700">
          <FiCalendar className="text-slate-400" />
          <input
            type="date"
            aria-label="Start date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPeriod("Custom");
            }}
            className="bg-transparent font-medium outline-none cursor-pointer"
          />
          <span className="text-slate-400 font-semibold">To</span>
          <input
            type="date"
            aria-label="End date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPeriod("Custom");
            }}
            className="bg-transparent font-medium outline-none cursor-pointer"
          />
        </div>

        {/* Loan Account Filter */}
        <label className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">Loan:</span>
          <select
            aria-label="Loan filter"
            value={selectedLoanId}
            onChange={(e) => setSelectedLoanId(e.target.value)}
            className="max-w-[200px] truncate bg-transparent font-medium outline-none cursor-pointer"
          >
            <option value="All">All Loan Accounts</option>
            {loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.loanName} ({l.lenderName})
              </option>
            ))}
          </select>
        </label>

        {/* Store Filter */}
        <label className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">Store:</span>
          <select
            aria-label="Store filter"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            className="bg-transparent font-medium outline-none cursor-pointer"
          >
            {storeOptions.map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </label>

        {/* User Filter */}
        <label className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">User:</span>
          <select
            aria-label="User filter"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="bg-transparent font-medium outline-none cursor-pointer"
          >
            {userOptions.map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </label>

        {/* Search & Export Actions */}
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              aria-label="Search loan statement"
              placeholder="Search loan, lender, ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-52 rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            title="Refresh Report Data"
            aria-label="Refresh Report Data"
            onClick={loadLoansData}
            className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 hover:text-blue-600"
          >
            <FiRefreshCw className={isLoading ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            title="Export to Excel"
            onClick={exportToExcel}
            className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <RiFileExcel2Line className="text-sm" /> Excel
          </button>

          <button
            type="button"
            title="Print Report"
            onClick={() => setPrintOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <FiPrinter className="text-sm" /> Print
          </button>
        </div>
      </section>

      {/* Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Loan Received */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
            Total Loan Received
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-blue-900">
            {fmt(summary.totalLoanReceived)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Principal disbursed in period</p>
        </div>

        {/* Total Principal Repaid */}
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Total Principal Repaid
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-900">
            {fmt(summary.totalPrincipalRepaid)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Reduces principal balance</p>
        </div>

        {/* Total Interest Paid */}
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/60 to-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Total Interest Paid
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-amber-900">
            {fmt(summary.totalInterestPaid)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Finance expense (doesn't reduce principal)</p>
        </div>

        {/* Outstanding Principal Balance */}
        <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 to-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-800">
            Outstanding Principal
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-violet-900">
            {fmt(summary.outstandingPrincipalBalance)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Balance as of {to ? fmtDateDisplay(to) : "Today"}
          </p>
        </div>
      </section>

      {/* Main Transactions Table */}
      <section className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900">Loan Transactions</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {visibleEntries.length} {visibleEntries.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSortAsc((prev) => !prev)}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Sort Date: {sortAsc ? "Oldest First (Chronological)" : "Newest First"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-slate-600 backdrop-blur-sm border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 font-bold">DATE</th>
                <th className="py-3 px-3 font-bold">LOAN ACCOUNT / LENDER</th>
                <th className="py-3 px-3 font-bold">REF / VOUCHER NO.</th>
                <th className="py-3 px-3 font-bold">TRANSACTION TYPE</th>
                <th className="py-3 px-3 font-bold">PAYMENT TYPE</th>
                <th className="py-3 px-3 text-right font-bold">PRINCIPAL AMOUNT</th>
                <th className="py-3 px-3 text-right font-bold">INTEREST AMOUNT</th>
                <th className="py-3 px-3 text-right font-bold">BALANCE</th>
                <th className="py-3 px-3 text-center font-bold">STATUS</th>
                <th className="py-3 px-3 text-center font-bold">ACTION</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {/* Opening Balance Row */}
              {from && openingPrincipal > 0 && (
                <tr className="bg-slate-50/80 font-medium text-slate-700 italic">
                  <td className="py-2.5 px-3">{fmtDateDisplay(from)}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    Opening Principal Balance
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">—</td>
                  <td className="py-2.5 px-3">
                    <span className="rounded bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Balance Forward
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">—</td>
                  <td className="py-2.5 px-3 text-right">—</td>
                  <td className="py-2.5 px-3 text-right">—</td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    {fmt(openingPrincipal)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-400">—</td>
                  <td className="py-2.5 px-3 text-center text-slate-400">—</td>
                </tr>
              )}

              {/* Transactions List */}
              {visibleEntries.map((row) => {
                const isReceived = row.transactionType === "Loan Received";

                return (
                  <tr key={row.id} className="hover:bg-blue-50/40 transition">
                    <td className="py-3 px-3 font-medium whitespace-nowrap">
                      {fmtDateDisplay(row.date)}
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-slate-900">{row.loanName}</p>
                      <p className="text-[11px] text-slate-500">{row.lenderName}</p>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                      {row.reference || "—"}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isReceived
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {isReceived ? "+ Loan Received" : "− Principal Repaid"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{row.paymentType || "Bank"}</td>
                    <td
                      className={`py-3 px-3 text-right font-semibold tabular-nums ${
                        isReceived ? "text-blue-700" : "text-emerald-700"
                      }`}
                    >
                      {fmt(row.principalAmount)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-amber-700">
                      {row.interestAmount > 0 ? fmt(row.interestAmount) : "—"}
                    </td>
                    <td className="py-3 px-3 text-right font-bold tabular-nums text-slate-900">
                      {fmt(row.balance)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          row.status === "Active" || row.status === "Paid"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => navigate("/cash-bank/loan-accounts")}
                        title="View Loan in Cash & Bank"
                        className="inline-flex items-center gap-1 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                      >
                        <FiArrowUpRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {visibleEntries.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <FiCreditCard className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">
                        {search ? "No loan transactions match your search" : "No loan transactions found"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {loans.length === 0
                          ? "You haven't recorded any loans or repayments in Cash & Bank yet."
                          : "Try adjusting the date range or account filters above."}
                      </p>
                      {loans.length === 0 && (
                        <button
                          type="button"
                          onClick={() => navigate("/cash-bank/loan-accounts")}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <FiPlus /> Add Loan Account
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Table Footer Summary */}
            {visibleEntries.length > 0 && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td colSpan={5} className="py-3 px-3 uppercase text-[11px] tracking-wider">
                    Total / Summary
                  </td>
                  <td className="py-3 px-3 text-right text-blue-800">
                    {fmt(summary.totalLoanReceived)}
                  </td>
                  <td className="py-3 px-3 text-right text-amber-800">
                    {fmt(summary.totalInterestPaid)}
                  </td>
                  <td className="py-3 px-3 text-right text-violet-900">
                    {fmt(summary.outstandingPrincipalBalance)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Print Preview Modal */}
      {printOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">Print Preview - Loan Statement</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Print Document
                </button>
                <button
                  type="button"
                  onClick={() => setPrintOpen(false)}
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-200"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 font-sans text-xs" id="loan-statement-print">
              <div className="text-center pb-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-950">
                  {companyProfile.businessName || companyProfile.companyName || "Sai Kirana Stores"}
                </h2>
                {companyProfile.phoneNumber && (
                  <p className="text-xs text-slate-600">Phone: {companyProfile.phoneNumber}</p>
                )}
                <h3 className="mt-3 text-lg font-bold uppercase tracking-wider text-slate-800 underline underline-offset-4">
                  Loan Statement
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Account: <strong>{selectedLoanName}</strong> | Period:{" "}
                  <strong>{from ? fmtDateDisplay(from) : "Start"}</strong> to{" "}
                  <strong>{to ? fmtDateDisplay(to) : "Present"}</strong>
                </p>
              </div>

              {/* Summary Highlights */}
              <div className="grid grid-cols-4 gap-3 my-6 text-center">
                <div className="rounded border border-slate-200 p-2 bg-slate-50">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Loan Received</p>
                  <p className="text-sm font-bold text-blue-900">{fmt(summary.totalLoanReceived)}</p>
                </div>
                <div className="rounded border border-slate-200 p-2 bg-slate-50">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Principal Repaid</p>
                  <p className="text-sm font-bold text-emerald-900">
                    {fmt(summary.totalPrincipalRepaid)}
                  </p>
                </div>
                <div className="rounded border border-slate-200 p-2 bg-slate-50">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Interest Paid</p>
                  <p className="text-sm font-bold text-amber-900">{fmt(summary.totalInterestPaid)}</p>
                </div>
                <div className="rounded border border-slate-200 p-2 bg-slate-50">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Outstanding Balance</p>
                  <p className="text-sm font-bold text-violet-900">
                    {fmt(summary.outstandingPrincipalBalance)}
                  </p>
                </div>
              </div>

              {/* Printable Table */}
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="bg-slate-100 border-y border-slate-300">
                    <th className="p-2 font-bold">DATE</th>
                    <th className="p-2 font-bold">LOAN ACCOUNT</th>
                    <th className="p-2 font-bold">LENDER</th>
                    <th className="p-2 font-bold">REF NO.</th>
                    <th className="p-2 font-bold">TYPE</th>
                    <th className="p-2 text-right font-bold">PRINCIPAL</th>
                    <th className="p-2 text-right font-bold">INTEREST</th>
                    <th className="p-2 text-right font-bold">BALANCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {from && openingPrincipal > 0 && (
                    <tr className="bg-slate-50 font-semibold italic">
                      <td className="p-2">{fmtDateDisplay(from)}</td>
                      <td colSpan={4} className="p-2">
                        Opening Balance Forward
                      </td>
                      <td className="p-2 text-right">—</td>
                      <td className="p-2 text-right">—</td>
                      <td className="p-2 text-right font-bold">{fmt(openingPrincipal)}</td>
                    </tr>
                  )}
                  {visibleEntries.map((row) => (
                    <tr key={row.id}>
                      <td className="p-2">{fmtDateDisplay(row.date)}</td>
                      <td className="p-2 font-medium">{row.loanName}</td>
                      <td className="p-2 text-slate-600">{row.lenderName}</td>
                      <td className="p-2 font-mono">{row.reference || "—"}</td>
                      <td className="p-2">{row.transactionType}</td>
                      <td className="p-2 text-right font-medium">{fmt(row.principalAmount)}</td>
                      <td className="p-2 text-right text-slate-600">
                        {row.interestAmount > 0 ? fmt(row.interestAmount) : "—"}
                      </td>
                      <td className="p-2 text-right font-bold">{fmt(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-8 text-center text-[10px] text-slate-400">
                Report generated on {new Date().toLocaleDateString("en-IN")} by USV Business Management
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
