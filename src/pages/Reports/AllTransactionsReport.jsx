import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCalendar,
  FiChevronDown,
  FiDownload,
  FiFilter,
  FiMoreVertical,
  FiPrinter,
  FiSearch,
  FiShare2,
  FiX,
  FiClock,
} from "react-icons/fi";
import * as XLSX from "xlsx";

function readLocal(...keys) {
  for (const key of keys) {
    try {
      const val = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (Array.isArray(val)) return val;
    } catch {}
  }
  return [];
}

const money = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function parseYMD(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const s = val.trim();
    const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmySlash) return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AllTransactionsReport() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("This Month");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => isoDate());
  const [firm, setFirm] = useState("ALL FIRMS");
  const [user, setUser] = useState("ALL USERS");
  const [txnType, setTxnType] = useState("All Transaction");
  const [paymentType, setPaymentType] = useState("All Payment");
  const [search, setSearch] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [menuState, setMenuState] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

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
      } else if (t.includes("estimate") || t.includes("quotation")) {
        navigate("/sales/estimate-quotation/new", { state: { editInvoice: row.raw } });
      } else if (t.includes("proforma")) {
        navigate("/sales/proforma-invoice/new", { state: { editInvoice: row.raw } });
      } else {
        navigate("/sales/sale-invoices/new", { state: { editInvoice: row.raw } });
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
      if (!window.confirm(`Delete this ${row.type} transaction (${row.refNo || row.partyName})?`)) {
        return;
      }
      if (row.storageKey) {
        const currentList = readLocal(row.storageKey);
        const updated = currentList.filter(
          (item) => (item.id || item.invoiceId) !== (row.raw.id || row.raw.invoiceId)
        );
        try {
          window.localStorage.setItem(row.storageKey, JSON.stringify(updated));
          window.dispatchEvent(new Event("ledgerly:business-data-changed"));
          window.dispatchEvent(new Event("storage"));
        } catch {}
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
        };
        try {
          window.localStorage.setItem(row.storageKey, JSON.stringify([copy, ...currentList]));
          window.dispatchEvent(new Event("ledgerly:business-data-changed"));
          window.dispatchEvent(new Event("storage"));
        } catch {}
      }
      return;
    }

    if (action === "View History") {
      setHistoryModal(row);
      return;
    }
  };

  // Load all recorded transactions across the application
  const sales = useMemo(() => readLocal("ledgerly:saleInvoices.v1"), [refreshTrigger]);
  const purchases = useMemo(() => readLocal("ledgerly:purchaseBills.v1"), [refreshTrigger]);
  const saleReturns = useMemo(() => readLocal("ledgerly:saleReturns.v1"), [refreshTrigger]);
  const purchaseReturns = useMemo(
    () => readLocal("ledgerly:purchaseReturns.v1", "ledgerly:purchaseReturnsDebitNotes.v1"),
    [refreshTrigger]
  );
  const estimates = useMemo(() => readLocal("ledgerly:estimateQuotations.v1"), [refreshTrigger]);
  const proformas = useMemo(() => readLocal("ledgerly:proformaInvoices.v1"), [refreshTrigger]);
  const paymentIns = useMemo(() => readLocal("ledgerly:paymentIns.v1"), [refreshTrigger]);
  const paymentOuts = useMemo(() => readLocal("ledgerly:paymentOuts.v1"), [refreshTrigger]);
  const expenses = useMemo(() => readLocal("ledgerly:expenses.v1"), [refreshTrigger]);
  const saleOrders = useMemo(() => readLocal("ledgerly:saleOrders.v1"), [refreshTrigger]);
  const purchaseOrders = useMemo(() => readLocal("ledgerly:purchaseOrders.v1"), [refreshTrigger]);
  const deliveryChallans = useMemo(() => readLocal("ledgerly:deliveryChallans.v1"), [refreshTrigger]);

  const allRecords = useMemo(() => {
    const list = [
      ...sales.map((r) => {
        const total = Number(r.totals?.finalTotal ?? r.totals?.grandTotal ?? r.total ?? r.amount ?? 0);
        const received = Number(r.totals?.received ?? r.receivedAmount ?? (r.saleType === "cash" ? total : 0));
        const balance = Math.max(0, total - received);
        const isCancelled = r.status === "Cancelled" || r.cancelled;
        const status = isCancelled ? "Cancelled" : balance === 0 ? "Paid" : received > 0 ? "Partial" : "Unpaid";
        return {
          id: r.id || `sale-${Math.random()}`,
          date: r.form?.invoiceDate || r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.form?.invoiceNumber || r.invoiceNumber || "—",
          partyName: r.form?.customer || r.partyName || r.customer || "Cash Sale",
          category: r.category || r.form?.category || "—",
          type: "Sale",
          total,
          received,
          balance,
          status,
          paymentType: r.form?.paymentType || r.paymentType || (r.saleType === "cash" ? "Cash" : "Credit"),
          raw: r,
          storageKey: "ledgerly:saleInvoices.v1",
        };
      }),
      ...purchases.map((r) => {
        const total = Number(r.totals?.finalTotal ?? r.totals?.grandTotal ?? r.totalAmount ?? r.total ?? 0);
        const received = Number(r.totals?.received ?? r.paidAmount ?? (r.form?.paymentType === "Cash" ? total : 0));
        const balance = Math.max(0, total - received);
        const isCancelled = r.status === "Cancelled" || r.cancelled;
        const status = isCancelled ? "Cancelled" : balance === 0 ? "Paid" : received > 0 ? "Partial" : "Unpaid";
        return {
          id: r.id || `purch-${Math.random()}`,
          date: r.form?.invoiceDate || r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.form?.invoiceNumber || r.invoiceNumber || "—",
          partyName: r.form?.customer || r.partyName || r.supplier || "Cash Purchase",
          category: r.category || "—",
          type: "Purchase",
          total,
          received,
          balance,
          status,
          paymentType: r.form?.paymentType || r.paymentType || "Cash",
          raw: r,
          storageKey: "ledgerly:purchaseBills.v1",
        };
      }),
      ...paymentIns.map((r) => {
        const total = Number(r.amount || r.total || 0);
        return {
          id: r.id || `payin-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.number || r.refNo || "—",
          partyName: r.customer || r.partyName || "—",
          category: "—",
          type: "Payment-In",
          total,
          received: total,
          balance: 0,
          status: "Unused",
          paymentType: r.paymentType || "Cash",
          raw: r,
          storageKey: "ledgerly:paymentIns.v1",
        };
      }),
      ...paymentOuts.map((r) => {
        const total = Number(r.amount || r.total || 0);
        return {
          id: r.id || `payout-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.number || r.refNo || "—",
          partyName: r.supplier || r.partyName || "—",
          category: "—",
          type: "Payment-Out",
          total,
          received: total,
          balance: 0,
          status: "Paid",
          paymentType: r.paymentType || "Cash",
          raw: r,
          storageKey: "ledgerly:paymentOuts.v1",
        };
      }),
      ...expenses.map((r) => {
        const total = Number(r.amount || 0);
        return {
          id: r.id || `exp-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.expenseNo || r.number || "—",
          partyName: r.partyName || r.paidTo || "Expense",
          category: r.category || "General",
          type: "Expense",
          total,
          received: total,
          balance: 0,
          status: "Paid",
          paymentType: r.paymentType || "Cash",
          raw: r,
          storageKey: "ledgerly:expenses.v1",
        };
      }),
      ...saleReturns.map((r) => {
        const total = Number(r.totals?.finalTotal ?? r.total ?? 0);
        return {
          id: r.id || `sret-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.returnNo || r.invoiceNumber || "—",
          partyName: r.customer || r.partyName || "Cash Sale",
          category: "—",
          type: "Credit Note",
          total,
          received: total,
          balance: 0,
          status: "Paid",
          paymentType: r.paymentType || "Cash",
          raw: r,
          storageKey: "ledgerly:saleReturns.v1",
        };
      }),
      ...purchaseReturns.map((r) => {
        const total = Number(r.totals?.finalTotal ?? r.total ?? 0);
        return {
          id: r.id || `pret-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.returnNo || r.invoiceNumber || "—",
          partyName: r.supplier || r.partyName || "Cash Purchase",
          category: "—",
          type: "Debit Note",
          total,
          received: total,
          balance: 0,
          status: "Paid",
          paymentType: r.paymentType || "Cash",
          raw: r,
          storageKey: "ledgerly:purchaseReturns.v1",
        };
      }),
      ...estimates.map((r) => {
        const total = Number(r.amount || r.total || 0);
        return {
          id: r.id || `est-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.number || r.refNo || "—",
          partyName: r.customer || r.partyName || "Cash Sale",
          category: "—",
          type: "Estimate",
          total,
          received: 0,
          balance: total,
          status: r.status || "Open",
          paymentType: "Credit",
          raw: r,
          storageKey: "ledgerly:estimateQuotations.v1",
        };
      }),
      ...proformas.map((r) => {
        const total = Number(r.amount || r.total || 0);
        return {
          id: r.id || `prof-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.number || r.refNo || "—",
          partyName: r.customer || r.partyName || "Cash Sale",
          category: "—",
          type: "Proforma",
          total,
          received: 0,
          balance: total,
          status: r.status || "Open",
          paymentType: "Credit",
          raw: r,
          storageKey: "ledgerly:proformaInvoices.v1",
        };
      }),
      ...saleOrders.map((r) => {
        const total = Number(r.amount || r.total || 0);
        return {
          id: r.id || `so-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.number || "—",
          partyName: r.customer || "Cash Sale",
          category: "—",
          type: "Sale Order",
          total,
          received: 0,
          balance: total,
          status: r.status || "Open",
          paymentType: "Credit",
          raw: r,
          storageKey: "ledgerly:saleOrders.v1",
        };
      }),
      ...purchaseOrders.map((r) => {
        const total = Number(r.amount || r.total || 0);
        return {
          id: r.id || `po-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.number || "—",
          partyName: r.supplier || "Supplier",
          category: "—",
          type: "Purchase Order",
          total,
          received: 0,
          balance: total,
          status: r.status || "Open",
          paymentType: "Credit",
          raw: r,
          storageKey: "ledgerly:purchaseOrders.v1",
        };
      }),
      ...deliveryChallans.map((r) => {
        const total = Number(r.amount || r.total || 0);
        return {
          id: r.id || `dc-${Math.random()}`,
          date: r.date || r.createdAt?.slice(0, 10) || "",
          refNo: r.number || "—",
          partyName: r.party || "Customer",
          category: "—",
          type: "Delivery Challan",
          total,
          received: 0,
          balance: total,
          status: r.status || "Open",
          paymentType: "Credit",
          raw: r,
          storageKey: "ledgerly:deliveryChallans.v1",
        };
      }),
    ];

    return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [
    sales,
    purchases,
    paymentIns,
    paymentOuts,
    expenses,
    saleReturns,
    purchaseReturns,
    estimates,
    proformas,
    saleOrders,
    purchaseOrders,
    deliveryChallans,
  ]);

  // Handle Preset ranges
  const handlePeriodChange = (val) => {
    setPeriod(val);
    const d = new Date();
    if (val === "This Month") {
      setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
      setTo(isoDate(d));
    } else if (val === "Last 30 Days") {
      const past = new Date();
      past.setDate(d.getDate() - 30);
      setFrom(isoDate(past));
      setTo(isoDate(d));
    } else if (val === "This Year") {
      setFrom(`${d.getFullYear()}-01-01`);
      setTo(isoDate(d));
    } else if (val === "All Time") {
      setFrom("");
      setTo("");
    }
  };

  // Filter list
  const filtered = useMemo(() => {
    return allRecords.filter((row) => {
      const ymd = parseYMD(row.date);
      if (from && ymd && ymd < from) return false;
      if (to && ymd && ymd > to) return false;

      if (txnType !== "All Transaction" && row.type !== txnType) {
        return false;
      }

      if (paymentType !== "All Payment" && row.paymentType !== paymentType) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = `${row.refNo} ${row.partyName} ${row.type} ${row.status} ${row.category}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [allRecords, from, to, txnType, paymentType, search]);

  // Status badge styling
  const getStatusBadge = (status) => {
    switch (status) {
      case "Paid":
        return "text-teal-600 font-medium";
      case "Partial":
        return "text-sky-600 font-medium";
      case "Unpaid":
        return "text-rose-500 font-medium";
      case "Cancelled":
        return "text-rose-400 font-medium";
      case "Unused":
        return "text-sky-500 font-medium";
      default:
        return "text-slate-600 font-medium";
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const data = filtered.map((row, idx) => ({
      "#": idx + 1,
      Date: row.date,
      "Ref No.": row.refNo,
      "Party Name": row.partyName,
      Category: row.category,
      Type: row.type,
      Total: row.total,
      Received: row.received,
      Balance: row.balance,
      Status: row.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "All Transactions");
    XLSX.writeFile(wb, "all-transactions-report.xlsx");
  };

  return (
    <div className="flex h-full flex-col bg-white overflow-hidden text-slate-800">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
          <div className="relative">
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="appearance-none font-bold text-lg text-slate-800 pr-7 py-1 bg-transparent cursor-pointer focus:outline-none"
            >
              <option value="This Month">This Month</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="This Year">This Year</option>
              <option value="All Time">All Time</option>
              <option value="Custom">Custom</option>
            </select>
            <FiChevronDown className="absolute right-1 top-2.5 h-4 w-4 pointer-events-none text-slate-600" />
          </div>

          {/* Date range badge & inputs */}
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
            <span className="rounded bg-slate-400 px-1.5 py-0.5 font-medium text-white">Between</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPeriod("Custom");
                setFrom(e.target.value);
              }}
              className="bg-transparent font-medium text-slate-700 outline-none"
            />
            <span className="text-slate-400">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPeriod("Custom");
                setTo(e.target.value);
              }}
              className="bg-transparent font-medium text-slate-700 outline-none"
            />
          </div>

          {/* Firms select */}
          <select
            value={firm}
            onChange={(e) => setFirm(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none cursor-pointer hover:bg-slate-50"
          >
            <option>ALL FIRMS</option>
            <option>Sai Kirana Stores</option>
          </select>

          {/* Users select */}
          <select
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none cursor-pointer hover:bg-slate-50"
          >
            <option>ALL USERS</option>
            <option>Admin</option>
          </select>
        </div>

        {/* Excel & Print Actions */}
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex flex-col items-center text-[11px] font-medium text-slate-600 hover:text-emerald-700 transition"
          >
            <span className="text-xl font-bold text-emerald-700">▦</span>
            Excel Report
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex flex-col items-center text-[11px] font-medium text-slate-600 hover:text-blue-600 transition"
          >
            <FiPrinter className="h-5 w-5" />
            Print
          </button>
        </div>
      </div>

      {/* Sub Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-2.5 bg-slate-50/50">
        <select
          value={txnType}
          onChange={(e) => setTxnType(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
        >
          <option>All Transaction</option>
          <option>Sale</option>
          <option>Purchase</option>
          <option>Payment-In</option>
          <option>Payment-Out</option>
          <option>Expense</option>
          <option>Credit Note</option>
          <option>Debit Note</option>
          <option>Estimate</option>
          <option>Proforma</option>
          <option>Sale Order</option>
          <option>Purchase Order</option>
        </select>

        <select
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
        >
          <option>All Payment</option>
          <option>Cash</option>
          <option>Credit</option>
          <option>Online</option>
          <option>Cheque</option>
        </select>

        <div className="relative ml-auto w-64">
          <FiSearch className="absolute left-2.5 top-2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in report..."
            className="w-full rounded-md border border-slate-200 bg-white py-1 pl-8 pr-3 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Transactions Table matching screenshot */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-600">
            <tr>
              <th className="w-10 px-3 py-3">#</th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  DATE <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1">
                  REF NO. <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  PARTY NAME <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  CATEGORY <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  TYPE <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  TOTAL <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  RECEIVED/PAID <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  BALANCE <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  STATUS <FiFilter className="text-[10px]" />
                </span>
              </th>
              <th className="px-3 py-3 text-center">PRINT / SHARE</th>
              <th className="w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((row, index) => {
              const isSelected = index === 6; // visual accent match
              return (
                <tr
                  key={row.id}
                  className={`hover:bg-slate-50 transition-colors ${
                    isSelected ? "bg-sky-50/70" : "bg-white"
                  }`}
                >
                  <td className="px-3 py-3.5 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-3.5 whitespace-nowrap text-slate-700">
                    {row.date ? row.date.split("-").reverse().join("/") : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right font-medium text-slate-800">{row.refNo}</td>
                  <td className="px-4 py-3.5 font-medium text-slate-900">{row.partyName}</td>
                  <td className="px-3 py-3.5 text-slate-500">{row.category}</td>
                  <td className="px-3 py-3.5 font-medium text-slate-800">{row.type}</td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap font-medium text-slate-900">
                    {row.total ? money(row.total) : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap text-slate-700">
                    {row.received ? money(row.received) : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap text-slate-700">
                    {row.total ? money(row.balance) : "—"}
                  </td>
                  <td className={`px-3 py-3.5 whitespace-nowrap ${getStatusBadge(row.status)}`}>
                    {row.status}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center justify-center gap-3 text-slate-400">
                      <button
                        type="button"
                        onClick={() => {
                          const t = row.type.toLowerCase();
                          if (t.includes("sale") || t.includes("pos")) {
                            navigate("/sales/sale-invoices/preview", {
                              state: { invoice: row.raw, printAfterOpen: true },
                            });
                          } else {
                            window.print();
                          }
                        }}
                        title="Print"
                        className="hover:text-blue-600 transition"
                      >
                        <FiPrinter className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const text = `${row.type} #${row.refNo} for ${row.partyName}: ${money(row.total)}`;
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(text);
                            window.alert("Copied to clipboard!");
                          }
                        }}
                        title="Share"
                        className="hover:text-blue-600 transition"
                      >
                        <FiShare2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-3.5 text-center">
                    <button
                      type="button"
                      onClick={(e) => handleOpenMenu(e, row)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                      title="More actions"
                    >
                      <FiMoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex h-56 flex-col items-center justify-center text-center text-slate-400">
            <p className="text-sm font-semibold text-slate-600">No transactions found</p>
            <p className="mt-1 text-xs">Try selecting a different date range or filter.</p>
          </div>
        )}
      </div>

      {/* ── 3-dots Context Menu (fixed viewport position) ── */}
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
                  <span className="font-semibold text-slate-800">{historyModal.refNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Party / Name:</span>
                  <span className="font-semibold text-slate-800">{historyModal.partyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date:</span>
                  <span className="font-semibold text-slate-800">
                    {historyModal.date ? historyModal.date.split("-").reverse().join("/") : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount:</span>
                  <span className="font-semibold text-teal-600">{money(historyModal.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className="font-semibold text-slate-800">{historyModal.status}</span>
                </div>
              </div>
              <div className="text-gray-400 text-[11px] text-center pt-2">
                Created on {historyModal.date ? historyModal.date.split("-").reverse().join("/") : "—"}
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
    </div>
  );
}

