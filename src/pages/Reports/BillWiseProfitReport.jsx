import { useMemo, useState, useEffect } from "react";
import {
  FiChevronDown,
  FiPrinter,
  FiSearch,
  FiX,
  FiAlertCircle,
  FiInfo,
} from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";
import { getInventoryItems } from "../../services/itemsStorage";
import { getParties } from "../../services/partiesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import {
  formatMoney,
  calculateInvoiceProfit,
} from "../../utils/billWiseProfit";

function readLocal(...keys) {
  for (const key of keys) {
    try {
      const val = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (Array.isArray(val) && val.length > 0) return val;
    } catch {
      // Ignore corrupted local storage items
    }
  }
  return [];
}

const defaultFrom = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const defaultTo = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    last
  ).padStart(2, "0")}`;
};

export default function BillWiseProfitReport() {
  const [period, setPeriod] = useState("This Month");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [selectedParty, setSelectedParty] = useState("All Parties");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Synchronize with business data changes across tabs, windows, and navigation focus
  useEffect(() => {
    const handler = () => setRefreshTrigger((k) => k + 1);
    window.addEventListener("ledgerly:business-data-changed", handler);
    window.addEventListener("storage", handler);
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handler);
      window.removeEventListener("storage", handler);
      window.removeEventListener("focus", handler);
      document.removeEventListener("visibilitychange", handler);
    };
  }, []);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedInvoice) {
        setSelectedInvoice(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedInvoice]);

  // Load masters and raw records
  const inventoryItems = useMemo(() => {
    try {
      return getInventoryItems() || [];
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const rawSales = useMemo(() => {
    const list = [];
    try {
      const stored = getSaleInvoices();
      if (Array.isArray(stored)) list.push(...stored);
    } catch {
      // fallback
    }
    const local = readLocal("ledgerly:saleInvoices.v1", "ledgerly:sales.v1");
    if (Array.isArray(local)) list.push(...local);

    const seen = new Set();
    const merged = [];
    for (const s of list) {
      const key = String(s.id || s.invoiceId || "");
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(s);
      } else if (!key) {
        merged.push(s);
      }
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const purchaseBills = useMemo(() => {
    const list = [];
    try {
      const stored = getPurchaseBills();
      if (Array.isArray(stored)) list.push(...stored);
    } catch {
      // fallback
    }
    const local = readLocal("ledgerly:purchaseBills.v1", "ledgerly:purchases.v1");
    if (Array.isArray(local)) list.push(...local);

    const seen = new Set();
    const merged = [];
    for (const b of list) {
      const key = String(b.id || b.invoiceId || "");
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(b);
      } else if (!key) {
        merged.push(b);
      }
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const partiesMaster = useMemo(() => {
    try {
      return getParties() || [];
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Period dropdown preset handler
  const handlePeriodChange = (val) => {
    setPeriod(val);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = d.getMonth() + 1;

    if (val === "This Month") {
      setFrom(defaultFrom());
      setTo(defaultTo());
    } else if (val === "Today") {
      const today = `${y}-${pad(m)}-${pad(d.getDate())}`;
      setFrom(today);
      setTo(today);
    } else if (val === "Yesterday") {
      const yesterday = new Date(d);
      yesterday.setDate(d.getDate() - 1);
      const yStr = `${yesterday.getFullYear()}-${pad(
        yesterday.getMonth() + 1
      )}-${pad(yesterday.getDate())}`;
      setFrom(yStr);
      setTo(yStr);
    } else if (val === "This Week") {
      const day = d.getDay();
      const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setFrom(
        `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(
          monday.getDate()
        )}`
      );
      setTo(
        `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(
          sunday.getDate()
        )}`
      );
    } else if (val === "Last 30 Days") {
      const past = new Date(d);
      past.setDate(d.getDate() - 30);
      setFrom(
        `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(
          past.getDate()
        )}`
      );
      setTo(`${y}-${pad(m)}-${pad(d.getDate())}`);
    } else if (val === "This Quarter") {
      const qMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const qStart = `${y}-${pad(qMonth)}-01`;
      const qEndDay = new Date(y, qMonth + 2, 0).getDate();
      const qEnd = `${y}-${pad(qMonth + 2)}-${pad(qEndDay)}`;
      setFrom(qStart);
      setTo(qEnd);
    } else if (val === "This Year") {
      setFrom(`${y}-01-01`);
      setTo(`${y}-12-31`);
    } else if (val === "All Time") {
      setFrom("");
      setTo("");
    }
  };

  // Build list of distinct parties for filter
  const partyOptions = useMemo(() => {
    const set = new Set();
    rawSales.forEach((s) => {
      const p = s.form?.customer || s.customer || s.partyName;
      if (p) set.add(p.trim());
    });
    partiesMaster.forEach((p) => {
      const name = p.partyName || p.name;
      if (name) set.add(name.trim());
    });
    return ["All Parties", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rawSales, partiesMaster]);

  // Compute profit and loss for all active sale invoices
  const calculatedInvoices = useMemo(() => {
    return rawSales
      .filter((s) => !s.cancelled && s.status !== "Cancelled")
      .map((invoice) =>
        calculateInvoiceProfit(invoice, inventoryItems, purchaseBills)
      )
      .sort((a, b) => (b.dateYmd || "").localeCompare(a.dateYmd || ""));
  }, [rawSales, inventoryItems, purchaseBills]);

  // Apply filters: Date Range, Party, and Search Query
  const filteredInvoices = useMemo(() => {
    return calculatedInvoices.filter((row) => {
      // Date filter
      if (from && row.dateYmd && row.dateYmd < from) return false;
      if (to && row.dateYmd && row.dateYmd > to) return false;

      // Party filter
      if (selectedParty !== "All Parties") {
        if (
          row.partyName.trim().toLowerCase() !==
          selectedParty.trim().toLowerCase()
        ) {
          return false;
        }
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesInv = row.invoiceNumber.toLowerCase().includes(q);
        const matchesParty = row.partyName.toLowerCase().includes(q);
        const matchesAmount = String(row.saleAmount).includes(q);
        if (!matchesInv && !matchesParty && !matchesAmount) return false;
      }

      return true;
    });
  }, [calculatedInvoices, from, to, selectedParty, searchQuery]);

  // Totals for summary footer
  const totalSaleAmount = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + (inv.saleAmount || 0), 0);
  }, [filteredInvoices]);

  const { totalProfitKnown, countKnown, countTotal } = useMemo(() => {
    let sum = 0;
    let known = 0;
    filteredInvoices.forEach((inv) => {
      if (inv.profit !== null && !inv.hasMissingCost) {
        sum += inv.profit;
        known += 1;
      }
    });
    return {
      totalProfitKnown: sum,
      countKnown: known,
      countTotal: filteredInvoices.length,
    };
  }, [filteredInvoices]);

  // Excel export
  const handleExportExcel = () => {
    const headers = [
      "Date",
      "Invoice No.",
      "Party",
      "Total Sale Amount",
      "Total Cost",
      "Tax Payable",
      "TDS Receivable",
      "Profit (+) / Loss (-)",
      "Status",
    ];

    const dataRows = filteredInvoices.map((inv) => [
      inv.formattedDate,
      inv.invoiceNumber,
      inv.partyName,
      inv.saleAmount,
      inv.totalCost !== null ? inv.totalCost : "N/A (Cost missing)",
      inv.taxPayable,
      inv.tdsReceivable,
      inv.profit !== null ? inv.profit : "N/A",
      inv.hasMissingCost
        ? "Cost Missing"
        : inv.profit < 0
        ? "Loss"
        : "Profit",
    ]);

    const footerRow = [
      "Total",
      "",
      "",
      totalSaleAmount,
      "",
      "",
      "",
      totalProfitKnown,
      countKnown < countTotal
        ? `Known (${countKnown}/${countTotal} bills)`
        : "Complete",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bill Wise Profit");
    XLSX.writeFile(
      wb,
      `Bill_Wise_Profit_${from || "All"}_to_${to || "All"}.xlsx`
    );
  };

  // CSV export
  const handleExportCSV = () => {
    const headers = [
      "Date",
      "Invoice No.",
      "Party",
      "Total Sale Amount",
      "Total Cost",
      "Tax Payable",
      "TDS Receivable",
      "Profit (+) / Loss (-)",
      "Status",
    ];

    const dataRows = filteredInvoices.map((inv) => [
      inv.formattedDate,
      inv.invoiceNumber,
      inv.partyName,
      inv.saleAmount,
      inv.totalCost !== null ? inv.totalCost : "N/A",
      inv.taxPayable,
      inv.tdsReceivable,
      inv.profit !== null ? inv.profit : "N/A",
      inv.hasMissingCost
        ? "Cost Missing"
        : inv.profit < 0
        ? "Loss"
        : "Profit",
    ]);

    const footerRow = [
      "Total",
      "",
      "",
      totalSaleAmount,
      "",
      "",
      "",
      totalProfitKnown,
      "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bill Wise Profit");
    XLSX.writeFile(
      wb,
      `Bill_Wise_Profit_${from || "All"}_to_${to || "All"}.csv`,
      { bookType: "csv" }
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 text-slate-800 text-xs">
      {/* ── Top Filters Bar ── */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Period Dropdown */}
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

            {/* Between Date Pickers */}
            <div className="flex items-center overflow-hidden rounded border border-slate-300 bg-white text-xs shadow-2xs">
              <span className="bg-slate-100 px-2.5 py-1.5 font-medium text-slate-600 border-r border-slate-200">
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
              <span className="text-slate-400 font-medium px-1">To</span>
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

            {/* Party Filter Dropdown */}
            <div className="relative">
              <select
                value={selectedParty}
                onChange={(e) => setSelectedParty(e.target.value)}
                className="max-w-[180px] appearance-none truncate rounded border border-slate-300 bg-white py-1.5 pl-3 pr-8 font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400 shadow-2xs"
              >
                {partyOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>

            {/* Search Input */}
            <div className="relative flex items-center">
              <FiSearch className="absolute left-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice or party..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 w-44 lg:w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Export & Print Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              title="Export to Excel (.xlsx)"
              className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-emerald-700 shadow-2xs hover:bg-emerald-50 transition cursor-pointer"
            >
              <RiFileExcel2Line className="h-4 w-4 text-emerald-600" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              title="Export to CSV (.csv)"
              className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
            >
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="Print Report"
              className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
            >
              <FiPrinter className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Report Title Header ── */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2.5">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-slate-800 uppercase">
            Bill Wise Profit
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Profit/Loss = Sale Amount − Total Cost − Tax Payable + TDS Receivable
          </p>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          Showing <span className="font-semibold text-slate-700">{filteredInvoices.length}</span>{" "}
          sale {filteredInvoices.length === 1 ? "invoice" : "invoices"}
        </div>
      </div>

      {/* ── Main Data Table ── */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3 min-w-[95px]">Date</th>
              <th className="px-4 py-3 min-w-[110px]">Invoice No.</th>
              <th className="px-4 py-3 min-w-[160px]">Party</th>
              <th className="px-4 py-3 text-right min-w-[130px]">
                Total Sale Amount
              </th>
              <th className="px-4 py-3 text-right min-w-[150px]">
                Profit (+) / Loss (-)
              </th>
              <th className="px-4 py-3 text-center min-w-[90px] print:hidden">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400">
                  <p className="font-medium">No sale invoices found</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try adjusting the date range or party filters above.
                  </p>
                </td>
              </tr>
            ) : (
              filteredInvoices.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-700">
                    {row.formattedDate}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {row.invoiceNumber}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {row.partyName}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                    {formatMoney(row.saleAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.hasMissingCost ? (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200"
                        title="Purchase cost missing for one or more items in this invoice"
                      >
                        <FiAlertCircle className="h-3 w-3" />
                        Unavailable
                      </span>
                    ) : (
                      <span
                        className={`font-semibold ${
                          row.isLoss ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {row.isLoss ? "- " : "+ "}
                        {formatMoney(Math.abs(row.profit))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center print:hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(row)}
                      className="rounded border border-blue-600 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-600 hover:text-white transition cursor-pointer shadow-2xs"
                    >
                      Show
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Summary Bottom Footer ── */}
      {filteredInvoices.length > 0 && (
        <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-white px-6 py-3 text-xs shadow-md">
          <div className="text-slate-500 font-medium">
            {countKnown < countTotal && (
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <FiInfo className="h-3 w-3" />
                Profit calculated for {countKnown} of {countTotal} bills (others have missing purchase cost)
              </span>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Total Sale Amount:</span>
              <span className="font-bold text-slate-800 text-sm">
                {formatMoney(totalSaleAmount)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">
                Total Profit (+) / Loss (-):
              </span>
              <span
                className={`font-bold text-sm ${
                  totalProfitKnown < 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {totalProfitKnown < 0 ? "- " : "+ "}
                {formatMoney(Math.abs(totalProfitKnown))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Show Modal: Detailed Invoice Profit Calculation ── */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedInvoice(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Invoice #${selectedInvoice.invoiceNumber} - ${selectedInvoice.partyName}`}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            {/* Modal Header */}
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Invoice #{selectedInvoice.invoiceNumber} - {selectedInvoice.partyName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Date: {selectedInvoice.formattedDate}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedInvoice(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </header>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Alert if cost missing */}
              {selectedInvoice.hasMissingCost && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                  <FiAlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">
                      Incomplete Purchase Cost Information
                    </p>
                    <p className="mt-0.5 text-amber-700">
                      One or more items in this invoice do not have a recorded purchase
                      price in the item master or purchase history. Profit is reported
                      as unavailable rather than assuming zero cost.
                    </p>
                  </div>
                </div>
              )}

              {/* Cost Calculation Subtitle */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Cost Calculation
                </h4>

                {/* Items Table */}
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-2.5">Item Name</th>
                        <th className="px-4 py-2.5 text-right">Quantity</th>
                        <th className="px-4 py-2.5 text-right">Purchase Price</th>
                        <th className="px-4 py-2.5 text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInvoice.items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-6 text-center text-slate-400 italic"
                          >
                            No line item records stored for this invoice.
                          </td>
                        </tr>
                      ) : (
                        selectedInvoice.items.map((item, idx) => (
                          <tr key={item.id || idx} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 font-medium text-slate-800">
                              {item.itemName}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-700">
                              {item.qty} {item.unit}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-700">
                              {item.purchasePrice !== null ? (
                                formatMoney(item.purchasePrice)
                              ) : (
                                <span className="text-amber-600 font-medium italic">
                                  Not Set
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                              {item.totalCost !== null ? (
                                formatMoney(item.totalCost)
                              ) : (
                                <span className="text-amber-600 italic">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Breakdown Panel */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 text-slate-600">
                  <span className="font-medium">Sale Amount</span>
                  <span className="font-semibold text-slate-800">
                    {formatMoney(selectedInvoice.saleAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 text-slate-600">
                  <span className="font-medium">Total Cost</span>
                  <span className="font-semibold text-slate-800">
                    {selectedInvoice.totalCost !== null ? (
                      formatMoney(selectedInvoice.totalCost)
                    ) : (
                      <span className="text-amber-600 font-medium italic">
                        Unavailable
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 text-slate-600">
                  <span className="font-medium">Tax Payable</span>
                  <span className="font-semibold text-slate-800">
                    {formatMoney(selectedInvoice.taxPayable)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 text-slate-600">
                  <span className="font-medium">TDS Receivable</span>
                  <span className="font-semibold text-slate-800">
                    {formatMoney(selectedInvoice.tdsReceivable)}
                  </span>
                </div>

                {selectedInvoice.additionalCharges > 0 && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-200/70 text-slate-600">
                    <span className="font-medium">Additional Charges</span>
                    <span className="font-semibold text-slate-800">
                      {formatMoney(selectedInvoice.additionalCharges)}
                    </span>
                  </div>
                )}

                {/* Profit Result */}
                <div className="flex items-center justify-between pt-2 text-sm">
                  <div>
                    <span className="font-bold text-slate-900 block">
                      Profit (Sale Amount - Total Cost - Tax Payable + TDS Receivable)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Calculated using standard formula
                    </span>
                  </div>
                  <div>
                    {selectedInvoice.profit !== null ? (
                      <span
                        className={`text-base font-bold ${
                          selectedInvoice.isLoss
                            ? "text-rose-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {selectedInvoice.isLoss ? "- " : "+ "}
                        {formatMoney(Math.abs(selectedInvoice.profit))}
                        {selectedInvoice.isLoss ? " (Loss)" : ""}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Unavailable
                      </span>
                    )}
                  </div>
                </div>

                {/* Profit Excluding Additional Charges */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                  <span className="font-semibold text-slate-700">
                    Profit (Excluding Additional Charges)
                  </span>
                  <div>
                    {selectedInvoice.profitExcludingCharges !== null ? (
                      <span
                        className={`font-bold ${
                          selectedInvoice.profitExcludingCharges < 0
                            ? "text-rose-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {selectedInvoice.profitExcludingCharges < 0 ? "- " : "+ "}
                        {formatMoney(
                          Math.abs(selectedInvoice.profitExcludingCharges)
                        )}
                        {selectedInvoice.profitExcludingCharges < 0
                          ? " (Loss)"
                          : ""}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Unavailable
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg bg-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-300 transition cursor-pointer"
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
