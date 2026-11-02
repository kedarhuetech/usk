import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  FiChevronDown,
  FiPrinter,
  FiShare2,
  FiMoreVertical,
  FiSearch,
  FiX,
  FiClock,
} from "react-icons/fi";
import {
  buildCashFlowEntries,
  filterAndCalculateCashFlow,
  parseYMD,
} from "../../utils/cashFlowCalculations";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const readLocal = (...keys) => {
  for (const key of keys) {
    try {
      const val = window.localStorage.getItem(key);
      if (val) {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  return [];
};

const readLocalObject = (key) => {
  try {
    const val = window.localStorage.getItem(key);
    if (val) {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return {};
};

const writeLocal = (key, data) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event("ledgerly:business-data-changed"));
    window.dispatchEvent(new Event("storage"));
  } catch (err) {
    console.error("writeLocal error:", err);
  }
};

const fmt = (n) => {
  const num = Number(n || 0);
  if (num < 0) {
    return `- ₹ ${Math.abs(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹ ${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDateDisplay = (dStr) => {
  if (!dStr) return "—";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dStr)) return dStr;
  const ymd = parseYMD(dStr);
  if (ymd) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  return dStr;
};

function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const defaultFrom = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const defaultTo = () => {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

export default function CashFlowReport() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("This Month");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [firm, setFirm] = useState("ALL FIRMS");
  const [accountType, setAccountType] = useState("ALL");
  const [showZeroAmount, setShowZeroAmount] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [menuState, setMenuState] = useState(null); // { row, top, right }
  const [historyModal, setHistoryModal] = useState(null); // row
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const menuRef = useRef(null);

  useEffect(() => {
    const handleUpdate = () => setRefreshTrigger((k) => k + 1);
    window.addEventListener("ledgerly:business-data-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Close 3-dots menu on outside click or scroll
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuState(null);
      }
    }
    function handleScroll() {
      setMenuState(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const handlePeriodChange = (val) => {
    setPeriod(val);
    const d = new Date();
    if (val === "This Month") {
      setFrom(defaultFrom());
      setTo(defaultTo());
    } else if (val === "Last 30 Days") {
      const past = new Date();
      past.setDate(d.getDate() - 30);
      setFrom(isoDate(past));
      setTo(isoDate(d));
    } else if (val === "This Year") {
      setFrom(`${d.getFullYear()}-01-01`);
      setTo(`${d.getFullYear()}-12-31`);
    } else if (val === "All Time") {
      setFrom("");
      setTo("");
    }
  };

  /* ── Load all cash transactions using robust accounting calculations ── */
  const allCashEntries = useMemo(() => {
    const sales = readLocal("ledgerly:saleInvoices.v1");
    const purchases = readLocal("ledgerly:purchaseBills.v1");
    const paymentIns = readLocal("ledgerly:paymentIns.v1");
    const paymentOuts = readLocal("ledgerly:paymentOuts.v1");
    const expenses = readLocal("ledgerly:expenses.v1");
    const adjustments = readLocal("ledgerly:cashAdjustments.v1");
    const saleInvoiceUi = readLocalObject("ledgerly:saleInvoiceUiActions.v1");
    const bankTransactions = readLocal("ledgerly:bankTransactions.v1", "bank-transactions");

    return buildCashFlowEntries({
      sales,
      purchases,
      paymentIns,
      paymentOuts,
      expenses,
      adjustments,
      bankTransactions,
      saleInvoiceUi,
    });
  }, [refreshTrigger]);

  // Filter entries in range & search, and calculate opening balance and running balance
  const { openingBalance, filteredRows, totalCashIn, totalCashOut, closingBalance } = useMemo(() => {
    return filterAndCalculateCashFlow(allCashEntries, {
      from,
      to,
      showZeroAmount,
      search,
      firm,
      accountType,
    });
  }, [allCashEntries, from, to, showZeroAmount, search, firm, accountType]);

  useEffect(() => {
    if (filteredRows.length > 0 && !selectedRowId) {
      setSelectedRowId(filteredRows[0].id);
    }
  }, [filteredRows, selectedRowId]);

  /* ── 3-dots Menu Action Handlers ── */
  const handleOpenMenu = (e, row) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 220;
    const top = rect.bottom + menuHeight > window.innerHeight
      ? Math.max(10, rect.top - menuHeight)
      : rect.bottom + 4;
    const right = Math.max(10, window.innerWidth - rect.right);
    setMenuState({ row, top, right });
  };

  const handleAction = (action, row) => {
    setMenuState(null);
    if (!row) return;

    if (action === "View/Edit") {
      const t = row.type.toLowerCase();
      if (t.includes("sale") || t.includes("pos")) {
        navigate("/sales/sale-invoices/new", { state: { editInvoice: row.raw } });
      } else if (t.includes("purchase")) {
        navigate("/purchase-expense/purchase-bills/new", {
          state: { editPurchase: row.raw, editBill: row.raw, editInvoice: row.raw },
        });
      } else if (t.includes("payment-in")) {
        navigate("/sales/payment-in", { state: { editPayment: row.raw } });
      } else if (t.includes("payment-out")) {
        navigate("/purchase-expense/payment-out", { state: { editPayment: row.raw } });
      } else if (t.includes("expense")) {
        navigate("/purchase-expense/expenses", { state: { editExpense: row.raw } });
      } else if (t.includes("cash")) {
        navigate("/cash-bank/cash-in-hand");
      }
      return;
    }

    if (action === "Open PDF" || action === "Print") {
      const t = row.type.toLowerCase();
      if (t.includes("sale") || t.includes("pos")) {
        navigate("/sales/sale-invoices/preview", {
          state: { invoice: row.raw, printAfterOpen: action === "Print" },
        });
      } else {
        window.print();
      }
      return;
    }

    if (action === "Delete") {
      if (!window.confirm(`Delete this ${row.type} transaction (${row.refNo || row.name})?`)) {
        return;
      }
      if (row.storageKey) {
        const currentList = readLocal(row.storageKey);
        const updated = currentList.filter(
          (item) => (item.id || item.invoiceId) !== (row.raw.id || row.raw.invoiceId)
        );
        writeLocal(row.storageKey, updated);
      }
      return;
    }

    if (action === "Duplicate") {
      if (row.storageKey) {
        const currentList = readLocal(row.storageKey);
        const copy = {
          ...row.raw,
          id: `${row.type.toLowerCase()}-copy-${Date.now()}`,
          invoiceNumber: `${row.raw.invoiceNumber || row.raw.form?.invoiceNumber || "1"}-COPY`,
          createdAt: new Date().toISOString(),
          date: isoDate(),
        };
        writeLocal(row.storageKey, [copy, ...currentList]);
      }
      return;
    }

    if (action === "View History") {
      setHistoryModal(row);
      return;
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const rows = [
      ["DATE", "REF NO.", "NAME", "CATEGORY", "TYPE", "PAYMENT METHOD", "STATUS", "CASH IN", "CASH OUT", "RUNNING BALANCE"],
      ...filteredRows.map((r) => [
        fmtDateDisplay(r.date),
        r.refNo,
        r.name,
        r.category,
        r.type,
        r.paymentMethod || "",
        r.isUnpaid ? "Unpaid (No movement)" : r.isPartial ? "Partial" : "Paid",
        r.cashIn || "",
        r.cashOut || "",
        r.runningBalance,
      ]),
      [],
      ["Opening Balance", openingBalance],
      ["Total Cash-in", totalCashIn],
      ["Total Cash-out", totalCashOut],
      ["Closing Balance", closingBalance],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
    XLSX.writeFile(wb, `CashFlow_${from}_to_${to}.xlsx`);
  };

  const handlePrint = () => window.print();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-[#263b57]">
      {/* ── Top Bar ── */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-200 px-6 py-3.5 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
          <div className="relative">
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="appearance-none font-bold text-base text-[#263b57] pr-6 py-1 bg-transparent cursor-pointer focus:outline-none"
            >
              <option value="This Month">This Month</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="This Year">This Year</option>
              <option value="All Time">All Time</option>
              <option value="Custom">Custom</option>
            </select>
            <FiChevronDown className="absolute right-0.5 top-2.5 h-4 w-4 pointer-events-none text-gray-500" />
          </div>

          {/* Date range inputs */}
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-[#fbfcfd] px-2.5 py-1 text-xs text-gray-600">
            <span className="rounded bg-slate-400 px-1.5 py-0.5 font-medium text-white select-none">Between</span>
            <input
              type="date"
              value={from}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }}
              onChange={(e) => {
                setPeriod("Custom");
                setFrom(e.target.value);
              }}
              className="bg-transparent font-medium text-gray-700 outline-none cursor-pointer"
            />
            <span className="text-gray-400 select-none">To</span>
            <input
              type="date"
              value={to}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }}
              onChange={(e) => {
                setPeriod("Custom");
                setTo(e.target.value);
              }}
              className="bg-transparent font-medium text-gray-700 outline-none cursor-pointer"
            />
          </div>

          {/* Firms select */}
          <div className="relative">
            <select
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              className="appearance-none rounded-md border border-gray-200 bg-white px-3 py-1.5 pr-7 text-xs font-semibold text-gray-700 outline-none cursor-pointer hover:bg-slate-50"
            >
              <option>ALL FIRMS</option>
              <option>Sai Kirana Stores</option>
            </select>
            <FiChevronDown className="absolute right-2 top-2.5 h-3.5 w-3.5 pointer-events-none text-gray-500" />
          </div>

          {/* Account Filter (Explicitly separated or combined) */}
          <div className="relative">
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="appearance-none rounded-md border border-gray-200 bg-white px-3 py-1.5 pr-7 text-xs font-semibold text-gray-700 outline-none cursor-pointer hover:bg-slate-50"
              title="Filter by account type"
            >
              <option value="ALL">All (Cash &amp; Bank)</option>
              <option value="Cash">Cash in Hand Only</option>
              <option value="Bank">Bank Accounts Only</option>
            </select>
            <FiChevronDown className="absolute right-2 top-2.5 h-3.5 w-3.5 pointer-events-none text-gray-500" />
          </div>
        </div>

        {/* Right actions: Excel & Print */}
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex flex-col items-center text-[10px] font-semibold text-gray-600 hover:text-emerald-700 transition"
          >
            <span className="text-xl font-bold text-emerald-700 leading-none mb-0.5">▦</span>
            Excel Report
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex flex-col items-center text-[10px] font-semibold text-gray-600 hover:text-sky-700 transition"
          >
            <FiPrinter className="h-4 w-4 mb-0.5" />
            Print
          </button>
        </div>
      </div>

      {/* ── Sub-header: Opening Cash & Zero Amount Checkbox ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-6 py-2.5 bg-[#fbfcfd]">
        <div className="flex items-center gap-6">
          <span className="text-xs font-semibold text-teal-700">
            {accountType === "Cash"
              ? `Opening Cash-in Hand: ${fmt(openingBalance)}`
              : accountType === "Bank"
              ? `Opening Bank Balance: ${fmt(openingBalance)}`
              : `Opening Balance (Cash & Bank): ${fmt(openingBalance)}`}
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showZeroAmount}
              onChange={(e) => setShowZeroAmount(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-sky-600"
            />
            Show zero amount transaction (unpaid invoices)
          </label>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div className="border-b border-gray-100 px-6 py-2 bg-white">
        <div className="relative w-64">
          <FiSearch className="absolute left-2.5 top-2 text-gray-400 h-3.5 w-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full rounded border border-gray-200 py-1 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* ── Transactions Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-gray-200 bg-[#f8fafc] text-gray-600 font-bold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-2.5 px-4 font-semibold">
                DATE <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-3 font-semibold">
                REF NO. <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-4 font-semibold">
                NAME <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-3 font-semibold">
                CATEGORY <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-3 font-semibold">
                TYPE / METHOD <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-4 text-right font-semibold text-emerald-700">
                CASH IN <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-4 text-right font-semibold text-rose-700">
                CASH OUT <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-4 text-right font-semibold">
                RUNNING BALANCE <span className="inline-block text-[10px] text-gray-400">▼</span>
              </th>
              <th className="py-2.5 px-4 text-center font-semibold">PRINT / SHARE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-normal">
            {filteredRows.map((row) => {
              const isSelected = selectedRowId === row.id;
              const isNegative = row.runningBalance < 0;
              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRowId(row.id)}
                  className={`transition-colors cursor-pointer ${
                    isSelected ? "bg-[#dbeafe]" : "hover:bg-slate-50/70"
                  }`}
                >
                  <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                    {fmtDateDisplay(row.date)}
                  </td>
                  <td className="py-2.5 px-3 text-gray-700 font-mono text-[11px]">{row.refNo}</td>
                  <td className="py-2.5 px-4 font-medium text-[#263b57]">{row.name}</td>
                  <td className="py-2.5 px-3 text-gray-600">{row.category || "—"}</td>
                  <td className="py-2.5 px-3 text-gray-700">
                    <div className="font-medium text-slate-800">{row.type}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {row.paymentMethod && (
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {row.paymentMethod}
                        </span>
                      )}
                      {row.isUnpaid && (
                        <span className="inline-block rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                          Unpaid (No cash movement)
                        </span>
                      )}
                      {row.isPartial && (
                        <span className="inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          Partial
                        </span>
                      )}
                      {row.isDuplicate && (
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500" title={row.duplicateReason}>
                          Linked receipt
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-emerald-600">
                    {row.cashIn > 0 ? fmt(row.cashIn) : ""}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-rose-600">
                    {row.cashOut > 0 ? fmt(row.cashOut) : ""}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-semibold ${
                      isNegative ? "text-rose-600" : "text-teal-700"
                    }`}
                  >
                    {fmt(row.runningBalance)}
                  </td>
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.print();
                        }}
                        title="Print"
                        className="hover:text-gray-800 p-1 rounded"
                      >
                        <FiPrinter className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (navigator.share) {
                            navigator.share({
                              title: `${row.type} - ${row.name}`,
                              text: `${row.type} #${row.refNo}: ${row.name}`,
                            });
                          }
                        }}
                        title="Share"
                        className="hover:text-gray-800 p-1 rounded"
                      >
                        <FiShare2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleOpenMenu(e, row)}
                        title="More Actions"
                        className="hover:text-gray-800 p-1 rounded"
                      >
                        <FiMoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div className="py-12 text-center text-xs text-gray-400">
            No cash transactions found for the selected period.
          </div>
        )}
      </div>

      {/* ── Fixed 3-dots Context Menu (Never clipped by table overflow) ── */}
      {menuState && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuState.top,
            right: menuState.right,
            zIndex: 9999,
          }}
          className="w-44 rounded-md bg-white py-1.5 shadow-2xl border border-gray-200 text-left text-xs divide-y divide-gray-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="py-0.5">
            <button
              type="button"
              onClick={() => handleAction("View/Edit", menuState.row)}
              className="w-full px-3.5 py-2 text-left font-medium text-gray-800 hover:bg-sky-50 hover:text-sky-700 transition"
            >
              View/Edit
            </button>
            <button
              type="button"
              onClick={() => handleAction("Open PDF", menuState.row)}
              className="w-full px-3.5 py-2 text-left font-medium text-gray-800 hover:bg-sky-50 hover:text-sky-700 transition"
            >
              Open PDF
            </button>
            <button
              type="button"
              onClick={() => handleAction("Print", menuState.row)}
              className="w-full px-3.5 py-2 text-left font-medium text-gray-800 hover:bg-sky-50 hover:text-sky-700 transition"
            >
              Print
            </button>
          </div>
          <div className="py-0.5">
            <button
              type="button"
              onClick={() => handleAction("Delete", menuState.row)}
              className="w-full px-3.5 py-2 text-left font-medium text-rose-600 hover:bg-rose-50 transition"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => handleAction("Duplicate", menuState.row)}
              className="w-full px-3.5 py-2 text-left font-medium text-gray-800 hover:bg-sky-50 hover:text-sky-700 transition"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => handleAction("View History", menuState.row)}
              className="w-full px-3.5 py-2 text-left font-medium text-gray-800 hover:bg-sky-50 hover:text-sky-700 transition"
            >
              View History
            </button>
          </div>
        </div>
      )}

      {/* ── View History Modal ── */}
      {historyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setHistoryModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <FiClock className="text-sky-600" /> Transaction History
              </h3>
              <button
                type="button"
                onClick={() => setHistoryModal(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <FiX size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Transaction Type:</span>
                  <span className="font-semibold text-slate-800">{historyModal.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ref / Invoice No:</span>
                  <span className="font-semibold text-slate-800 font-mono">{historyModal.refNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Party / Name:</span>
                  <span className="font-semibold text-slate-800">{historyModal.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date:</span>
                  <span className="font-semibold text-slate-800">{fmtDateDisplay(historyModal.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment Method:</span>
                  <span className="font-semibold text-slate-800">{historyModal.paymentMethod || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment Status:</span>
                  <span className={`font-semibold ${historyModal.isUnpaid ? "text-rose-600" : "text-emerald-600"}`}>
                    {historyModal.isUnpaid ? "Unpaid (No cash movement)" : historyModal.isPartial ? "Partially Paid" : "Paid"}
                  </span>
                </div>
                {historyModal.total > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Invoice / Bill Total:</span>
                    <span className="font-semibold text-slate-700">{fmt(historyModal.total)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-gray-500">Actual Cash Movement:</span>
                  <span className="font-bold text-teal-700">
                    {fmt(historyModal.cashIn || historyModal.cashOut)}
                  </span>
                </div>
              </div>
              <div className="text-gray-400 text-[11px] text-center pt-2">
                Created on {fmtDateDisplay(historyModal.date)}
              </div>
            </div>
            <div className="flex justify-end border-t px-5 py-3 bg-gray-50">
              <button
                type="button"
                onClick={() => setHistoryModal(null)}
                className="rounded-md bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer Summary Bar matching Screenshot ── */}
      <div className="flex flex-wrap items-center justify-between border-t border-gray-200 bg-white px-6 py-3 text-xs gap-3">
        <span className="font-semibold text-emerald-700">
          Total Cash-in: {fmt(totalCashIn)}
        </span>
        <span className="font-semibold text-rose-600">
          Total Cash-out: {fmt(totalCashOut)}
        </span>
        <span className="font-semibold text-teal-700">
          {accountType === "Cash"
            ? `Closing Cash-in Hand: ${fmt(closingBalance)}`
            : accountType === "Bank"
            ? `Closing Bank Balance: ${fmt(closingBalance)}`
            : `Closing Balance (Cash & Bank): ${fmt(closingBalance)}`}
        </span>
      </div>
    </div>
  );
}
