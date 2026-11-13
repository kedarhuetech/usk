import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiChevronDown,
  FiPrinter,
  FiSearch,
  FiBarChart2,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiShoppingBag,
  FiShoppingCart,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import ReportPrintPreviewModal from "../../components/Common/ReportPrintPreviewModal";
import { getSaleOrders, getPurchaseOrders, getOrderFulfillmentSummary } from "../../services/transactionRepository.js";
import { businessDataChangedEvent } from "../../services/businessDataChanged.js";
import OrderPartialConvertModal from "../../components/Common/OrderPartialConvertModal.jsx";
import {
  buildUnifiedDocumentHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";

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

function formatDate(val) {
  const ymd = parseYMD(val);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function rowAmount(row) {
  const gross = (Number(row.qty) || 0) * (Number(row.price) || 0);
  const discount =
    row.discountType === "amount"
      ? Number(row.discount || 0)
      : gross * (Number(row.discount || 0) / 100);
  const net = Math.max(0, gross - discount);
  return (
    net +
    (net * (Number(row.tax) || 0)) / 100 +
    (net * (Number(row.cess) || 0)) / 100
  );
}

function getPresetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (preset) {
    case "Today":
      return { from: fmt(now), to: fmt(now) };
    case "This Month":
      return {
        from: `${y}-${pad(m + 1)}-01`,
        to: fmt(new Date(y, m + 1, 0)),
      };
    case "Last Month": {
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      return {
        from: `${prevY}-${pad(prevM + 1)}-01`,
        to: fmt(new Date(prevY, prevM + 1, 0)),
      };
    }
    case "This Quarter": {
      const qStartMonth = Math.floor(m / 3) * 3;
      return {
        from: `${y}-${pad(qStartMonth + 1)}-01`,
        to: fmt(new Date(y, qStartMonth + 3, 0)),
      };
    }
    case "This Year": {
      const fyStartYear = m >= 3 ? y : y - 1;
      return {
        from: `${fyStartYear}-04-01`,
        to: `${fyStartYear + 1}-03-31`,
      };
    }
    case "All Time":
      return { from: "", to: "" };
    default:
      return {
        from: `${y}-${pad(m + 1)}-01`,
        to: fmt(new Date(y, m + 1, 0)),
      };
  }
}

export default function SalePurchaseOrdersReport() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("This Month");
  const [dateRange, setDateRange] = useState(() => getPresetRange("This Month"));
  const [typeFilter, setTypeFilter] = useState("All"); // All | Sale Order | Purchase Order
  const [statusFilter, setStatusFilter] = useState("All"); // All | Open | Order Overdue | Converted | Converted to Sale | Converted to Purchase | Cancelled
  const [partyFilter, setPartyFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [chartOpen, setChartOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [reportConvertOrder, setReportConvertOrder] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync with data changes
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
      setDateRange(getPresetRange(preset));
    }
  };

  // Load and normalize orders
  const allOrders = useMemo(() => {
    void refreshTrigger;
    const rawSales = getSaleOrders();
    const rawPurchases = getPurchaseOrders();
    const todayYmd = parseYMD(new Date());

    const sales = (Array.isArray(rawSales) ? rawSales : []).map((order, idx) => {
      const summary = getOrderFulfillmentSummary(order);
      const isConverted = summary.isFullyConverted;
      const isCancelled = order.status === "Cancelled";
      const orderDate = parseYMD(order.date || order.createdAt);
      const dueDate = parseYMD(order.dueDate || order.date);
      let status = summary.status;
      if (!isConverted && !isCancelled && dueDate && dueDate < todayYmd && summary.remainingAmount > 0) {
        status = "Order Overdue";
      }

      const rows = summary.rows || [];
      const itemNames = rows.map((r) => r.item).filter(Boolean);

      return {
        id: order.id || `so-${idx}`,
        type: "Sale Order",
        orderNo: order.number || String(idx + 1),
        date: orderDate,
        dueDate,
        party: order.customer || "Cash Sale",
        phone: order.phone || "",
        orderedQty: summary.totalOrderedQty,
        convertedQty: summary.totalConvertedQty,
        remainingQty: summary.totalRemainingQty,
        totalAmount: summary.originalAmount,
        convertedAmount: summary.convertedAmount,
        balance: summary.remainingAmount,
        status,
        isConverted,
        isPartiallyConverted: summary.isPartiallyConverted,
        isCancelled,
        itemCount: itemNames.length,
        itemsSummary: itemNames.join(", "),
        raw: order,
      };
    });

    const purchases = (Array.isArray(rawPurchases) ? rawPurchases : []).map(
      (order, idx) => {
        const summary = getOrderFulfillmentSummary(order);
        const isConverted = summary.isFullyConverted;
        const isCancelled = order.status === "Cancelled";
        const orderDate = parseYMD(order.date || order.createdAt);
        const dueDate = parseYMD(order.dueDate || order.date);
        let status = summary.status;
        if (!isConverted && !isCancelled && dueDate && dueDate < todayYmd && summary.remainingAmount > 0) {
          status = "Order Overdue";
        }

        const rows = summary.rows || [];
        const itemNames = rows.map((r) => r.item).filter(Boolean);

        return {
          id: order.id || `po-${idx}`,
          type: "Purchase Order",
          orderNo: order.number || String(idx + 1),
          date: orderDate,
          dueDate,
          party: order.supplier || "Cash Purchase",
          phone: order.phone || "",
          orderedQty: summary.totalOrderedQty,
          convertedQty: summary.totalConvertedQty,
          remainingQty: summary.totalRemainingQty,
          totalAmount: summary.originalAmount,
          convertedAmount: summary.convertedAmount,
          balance: summary.remainingAmount,
          status,
          isConverted,
          isPartiallyConverted: summary.isPartiallyConverted,
          isCancelled,
          itemCount: itemNames.length,
          itemsSummary: itemNames.join(", "),
          raw: order,
        };
      }
    );

    return [...sales, ...purchases].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
  }, [refreshTrigger]);

  // Unique Parties
  const partyOptions = useMemo(() => {
    const set = new Set();
    allOrders.forEach((o) => {
      if (o.party && o.party !== "Cash Sale" && o.party !== "Cash Purchase") {
        set.add(o.party);
      }
    });
    return Array.from(set).sort();
  }, [allOrders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => {
      // Date filter
      if (dateRange.from && order.date && order.date < dateRange.from) return false;
      if (dateRange.to && order.date && order.date > dateRange.to) return false;

      // Type filter
      if (typeFilter !== "All" && order.type !== typeFilter) return false;

      // Status filter
      if (statusFilter !== "All") {
        if (statusFilter === "Converted") {
          if (!order.isConverted) return false;
        } else if (statusFilter === "Fully Converted") {
          if (!order.isConverted) return false;
        } else if (statusFilter === "Partially Converted") {
          if (!order.isPartiallyConverted) return false;
        } else if (order.status !== statusFilter) {
          return false;
        }
      }

      // Party filter
      if (partyFilter !== "All" && order.party !== partyFilter) return false;

      // Search query
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          (order.orderNo && order.orderNo.toLowerCase().includes(q)) ||
          (order.party && order.party.toLowerCase().includes(q)) ||
          (order.itemsSummary && order.itemsSummary.toLowerCase().includes(q)) ||
          (order.status && order.status.toLowerCase().includes(q)) ||
          String(order.totalAmount).includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [allOrders, dateRange, typeFilter, statusFilter, partyFilter, search]);

  // Totals & KPI Metrics
  const totals = useMemo(() => {
    let totalCount = 0;
    let totalAmount = 0;
    let totalBalance = 0;
    let saleCount = 0;
    let saleAmount = 0;
    let purchaseCount = 0;
    let purchaseAmount = 0;
    let openCount = 0;
    let openAmount = 0;
    let convertedCount = 0;
    let convertedAmount = 0;
    let totalOrderedQty = 0;
    let totalConvertedQty = 0;
    let totalRemainingQty = 0;

    filteredOrders.forEach((o) => {
      totalCount++;
      totalAmount += (o.totalAmount || 0);
      totalBalance += (o.balance || 0);
      convertedAmount += (o.convertedAmount || 0);
      totalOrderedQty += (o.orderedQty || 0);
      totalConvertedQty += (o.convertedQty || 0);
      totalRemainingQty += (o.remainingQty || 0);

      if (o.type === "Sale Order") {
        saleCount++;
        saleAmount += (o.totalAmount || 0);
      } else {
        purchaseCount++;
        purchaseAmount += (o.totalAmount || 0);
      }

      if (o.isConverted) {
        convertedCount++;
      } else if (!o.isCancelled) {
        openCount++;
        openAmount += (o.balance || 0);
      }
    });

    return {
      totalCount,
      totalAmount,
      totalBalance,
      saleCount,
      saleAmount,
      purchaseCount,
      purchaseAmount,
      openCount,
      openAmount,
      convertedCount,
      convertedAmount,
      totalOrderedQty,
      totalConvertedQty,
      totalRemainingQty,
    };
  }, [filteredOrders]);

  // Export to Excel
  const exportExcel = () => {
    const headers = [
      "Date",
      "Order No.",
      "Due Date",
      "Party Name",
      "Order Type",
      "Items",
      "Ordered Qty",
      "Converted Qty",
      "Remaining Qty",
      "Total Amount",
      "Converted Value",
      "Balance Due",
      "Status",
    ];

    const dataRows = filteredOrders.map((o) => [
      formatDate(o.date),
      o.orderNo,
      formatDate(o.dueDate),
      o.party,
      o.type,
      o.itemsSummary || `${o.itemCount} items`,
      o.orderedQty || 0,
      o.convertedQty || 0,
      o.remainingQty || 0,
      o.totalAmount,
      o.convertedAmount || 0,
      o.balance,
      o.status,
    ]);

    const footerRow = [
      "Total",
      `${totals.totalCount} Orders`,
      "",
      "",
      "",
      "",
      totals.totalOrderedQty,
      totals.totalConvertedQty,
      totals.totalRemainingQty,
      totals.totalAmount,
      totals.convertedAmount,
      totals.totalBalance,
      "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sale & Purchase Orders");
    const filename = `Sale_Purchase_Orders_${dateRange.from || "all"}_to_${
      dateRange.to || "all"
    }.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Print Single Order
  const handlePrintSingle = (order) => {
    const rows = (order.raw.rows || []).map((row) => ({
      item: row.item || "Item",
      description: row.description || "",
      qty: `${row.qty || 1} ${row.unit || ""}`.trim(),
      price: row.price || 0,
      amount: rowAmount(row),
    }));

    const html = buildUnifiedDocumentHtml({
      title: order.type,
      documentNumber: order.orderNo,
      date: formatDate(order.date),
      dueDate: formatDate(order.dueDate),
      status: order.status,
      partyName: order.party,
      partyPhone: order.phone,
      columns: [
        { key: "index", label: "#", align: "center", width: "40px" },
        { key: "item", label: "Item Description", align: "left" },
        { key: "description", label: "Details", align: "left" },
        { key: "qty", label: "Qty", align: "center", width: "90px" },
        {
          key: "price",
          label: "Rate",
          align: "right",
          width: "100px",
          formatMoney: true,
        },
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
        subtotal: order.totalAmount,
        total: order.totalAmount,
        received: order.totalAmount - order.balance,
        balance: order.balance,
      },
      terms: order.raw.terms || "",
      notes: order.raw.description || "",
      autoPrint: true,
    });

    openPrintWindow(html, true);
  };

  // Navigate to Edit Order
  const handleViewEdit = (order) => {
    if (order.type === "Sale Order") {
      navigate("/sales/sale-order", { state: { editOrder: order.raw } });
    } else {
      navigate("/purchase-expense/purchase-order", {
        state: { editOrder: order.raw },
      });
    }
  };

  // Convert to Sale Invoice / Purchase Bill
  const handleConvert = (order) => {
    if (order.isConverted) return;
    setReportConvertOrder(order);
  };

  const handleProceedReportConversion = (selectedItems) => {
    const order = reportConvertOrder;
    setReportConvertOrder(null);
    if (!order) return;
    if (order.type === "Sale Order") {
      navigate("/sales/sale-invoices/new", {
        state: {
          from: "/reports/sale-purchase-orders",
          saleOrdersConversion: [order.raw],
          conversionItems: selectedItems,
        },
      });
    } else {
      navigate("/purchase-expense/purchase-bills/new", {
        state: {
          from: "/reports/sale-purchase-orders",
          purchaseOrderConversion: order.raw,
          conversionItems: selectedItems,
        },
      });
    }
  };

  const getStatusBadge = (status) => {
    if (
      status === "Fully Converted" ||
      status === "Converted to Sale" ||
      status === "Converted to Purchase"
    ) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <FiCheckCircle size={12} /> {status === "Fully Converted" ? "Fully Converted" : status}
        </span>
      );
    }
    if (status === "Partially Converted") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <FiClock size={12} /> Partially Converted
        </span>
      );
    }
    if (status === "Order Overdue") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
          <FiAlertCircle size={12} /> Order Overdue
        </span>
      );
    }
    if (status === "Cancelled") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          <FiAlertCircle size={12} /> Cancelled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
        Open
      </span>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Top Header */}
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Sale / Purchase Orders Report
          </h1>
          <p className="text-xs text-slate-500">
            Track and monitor open, overdue, and converted sale and purchase orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Toggle chart overview"
            onClick={() => setChartOpen((prev) => !prev)}
            className={`flex h-9 w-9 items-center justify-center rounded-md border text-slate-600 transition hover:bg-slate-100 ${
              chartOpen ? "border-sky-500 bg-sky-50 text-sky-600" : "border-slate-200"
            }`}
          >
            <FiBarChart2 size={18} />
          </button>

          <button
            type="button"
            title="Export to Excel (.xlsx)"
            onClick={exportExcel}
            className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <span>xls</span> Export
          </button>

          <button
            type="button"
            title="Print report preview"
            onClick={() => setPrintModalOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
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
              size={14}
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
            />
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="relative flex items-center">
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => {
                  setPeriod("Custom");
                  setDateRange((prev) => ({ ...prev, from: e.target.value }));
                }}
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
              />
            </div>
            <span>To</span>
            <div className="relative flex items-center">
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => {
                  setPeriod("Custom");
                  setDateRange((prev) => ({ ...prev, to: e.target.value }));
                }}
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="h-5 w-px bg-slate-200" />

          {/* Order Type Filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option value="All">All Order Types</option>
              <option value="Sale Order">Sale Orders</option>
              <option value="Purchase Order">Purchase Orders</option>
            </select>
            <FiChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option value="All">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Order Overdue">Order Overdue</option>
              <option value="Converted">Converted (All)</option>
              <option value="Converted to Sale">Converted to Sale</option>
              <option value="Converted to Purchase">Converted to Purchase</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <FiChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
            />
          </div>

          {/* Party Filter */}
          {partyOptions.length > 0 && (
            <div className="relative">
              <select
                value={partyFilter}
                onChange={(e) => setPartyFilter(e.target.value)}
                className="h-9 max-w-48 appearance-none truncate rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
              >
                <option value="All">All Parties</option>
                {partyOptions.map((party) => (
                  <option key={party} value={party}>
                    {party}
                  </option>
                ))}
              </select>
              <FiChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
              />
            </div>
          )}

          {/* Search Box */}
          <div className="relative ml-auto min-w-[220px]">
            <FiSearch className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order no, party, items..."
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-xs outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </section>

      {/* Summary KPI Cards */}
      <section className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {/* Total Orders Card */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Orders</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">
              {totals.totalCount}
            </span>
          </div>
          <div className="mt-1 text-lg font-bold text-slate-800">
            {money(totals.totalAmount)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>SO: {totals.saleCount}</span>
            <span>PO: {totals.purchaseCount}</span>
          </div>
        </div>

        {/* Sale Orders Card */}
        <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-sky-700">
            <span className="flex items-center gap-1">
              <FiShoppingBag size={13} /> Sale Orders
            </span>
            <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-800">
              {totals.saleCount}
            </span>
          </div>
          <div className="mt-1 text-lg font-bold text-sky-900">
            {money(totals.saleAmount)}
          </div>
          <div className="mt-1 text-[11px] text-sky-600/80">
            Customer order bookings
          </div>
        </div>

        {/* Purchase Orders Card */}
        <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-amber-700">
            <span className="flex items-center gap-1">
              <FiShoppingCart size={13} /> Purchase Orders
            </span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
              {totals.purchaseCount}
            </span>
          </div>
          <div className="mt-1 text-lg font-bold text-amber-900">
            {money(totals.purchaseAmount)}
          </div>
          <div className="mt-1 text-[11px] text-amber-600/80">
            Supplier procurement orders
          </div>
        </div>

        {/* Conversion & Open Card */}
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
            <span className="flex items-center gap-1">
              <FiCheckCircle size={13} /> Converted
            </span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
              {totals.convertedCount}
            </span>
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-900">
            {money(totals.convertedAmount)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Open: {totals.openCount}</span>
            <span className="text-amber-700 font-medium">Bal: {money(totals.totalBalance)}</span>
          </div>
        </div>
      </section>

      {/* Chart View */}
      {chartOpen && (
        <div className="mx-4 mb-3 rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Order Volume Distribution (Top Recent)</span>
            <span className="text-slate-400">Amounts in ₹</span>
          </div>
          <div className="flex h-24 items-end gap-2 overflow-x-auto pt-2">
            {filteredOrders.slice(0, 16).map((order) => {
              const max = Math.max(1, ...filteredOrders.map((o) => o.totalAmount));
              const heightPct = Math.max(8, (order.totalAmount / max) * 100);
              const isSale = order.type === "Sale Order";
              return (
                <div
                  key={order.id}
                  title={`${order.type} #${order.orderNo} (${order.party}): ${money(order.totalAmount)}`}
                  className="flex flex-1 min-w-[28px] flex-col items-center gap-1 group cursor-pointer"
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      isSale
                        ? "bg-sky-500 group-hover:bg-sky-600"
                        : "bg-amber-500 group-hover:bg-amber-600"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="truncate text-[10px] text-slate-400">
                    {order.orderNo}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xs">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3.5 py-3 font-semibold">
                  Date
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 font-semibold">
                  Order No.
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 font-semibold">
                  Party Name
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 font-semibold">
                  Type
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 font-semibold">
                  Due Date
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 text-right font-semibold">
                  Ordered
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 text-right font-semibold">
                  Converted
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 text-right font-semibold">
                  Remaining
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 text-right font-semibold">
                  Total Amount
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 text-right font-semibold">
                  Balance
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 text-center font-semibold">
                  Status
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-sky-50/50 transition-colors"
                  >
                    <td className="whitespace-nowrap px-3.5 py-3">
                      {formatDate(order.date)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-800">
                      {order.orderNo}
                    </td>
                    <td className="px-3.5 py-3 font-medium text-slate-900">
                      <div>{order.party}</div>
                      {order.phone && (
                        <div className="text-[11px] text-slate-400">
                          {order.phone}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${
                          order.type === "Sale Order"
                            ? "bg-sky-50 text-sky-700 border border-sky-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {order.type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-slate-500">
                      {formatDate(order.dueDate)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right font-medium text-slate-700">
                      {order.orderedQty}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right font-medium text-emerald-600">
                      {order.convertedQty}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-amber-600">
                      {order.remainingQty}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-slate-800">
                      {money(order.totalAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-slate-900">
                      {money(order.balance)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-center">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleViewEdit(order)}
                          className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition"
                          title="View or edit order"
                        >
                          View/Edit
                        </button>
                        {order.isConverted ? (
                          <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                            Fulfilled
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConvert(order)}
                            className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs hover:bg-blue-700 transition"
                            title={
                              order.type === "Sale Order"
                                ? "Convert to Sale Invoice"
                                : "Convert to Purchase Bill"
                            }
                          >
                            {order.isPartiallyConverted ? "Convert Rem." : "Convert"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePrintSingle(order)}
                          className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                          title="Print document"
                        >
                          <FiPrinter size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={12}
                    className="py-12 text-center text-sm text-slate-400"
                  >
                    No sale or purchase orders match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Summary */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700">
          <div>
            Showing {filteredOrders.length} of {allOrders.length} total orders
          </div>
          <div className="flex items-center gap-6">
            <div>
              <span>Total Orders Amount: </span>
              <span className="font-bold text-slate-900">
                {money(totals.totalAmount)}
              </span>
            </div>
            <div>
              <span>Outstanding Balance: </span>
              <span className="font-bold text-amber-700">
                {money(totals.totalBalance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Print Preview Modal */}
      <ReportPrintPreviewModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Sale / Purchase Orders Report"
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        user="All Users"
        records={filteredOrders.map((o) => ({
          ...o.raw,
          form: {
            invoiceNumber: o.orderNo,
            customer: o.party,
            invoiceDate: o.date,
            paymentType: o.type,
          },
          totalAmount: o.totalAmount,
          totals: {
            finalTotal: o.totalAmount,
            received: o.totalAmount - o.balance,
          },
        }))}
        totalLabel="Total Orders:"
        totalAmount={totals.totalAmount}
      />

      {reportConvertOrder && (
        <OrderPartialConvertModal
          isOpen={Boolean(reportConvertOrder)}
          order={reportConvertOrder.raw}
          type={reportConvertOrder.type === "Purchase Order" ? "purchase" : "sale"}
          onClose={() => setReportConvertOrder(null)}
          onProceed={handleProceedReportConversion}
        />
      )}
    </div>
  );
}
