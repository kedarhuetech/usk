import React, { useMemo, useState, useEffect } from "react";
import {
  FiPrinter,
  FiShare2,
  FiChevronDown,
  FiFilter,
} from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";
import { getInventoryItems } from "../../services/itemsStorage";

/* ── helpers ── */
function readLocal(...keys) {
  for (const key of keys) {
    try {
      const val = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (Array.isArray(val) && val.length > 0) return val;
    } catch {}
  }
  return [];
}

function parseYMD(val) {
  if (!val) return "";
  const s = String(val).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const d = new Date(val);
  if (!isNaN(d.getTime()))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return "";
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayDate(iso) {
  // "YYYY-MM-DD" → "DD/MM/YYYY"
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const fmtMoney = (n) =>
  `₹ ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtQty = (n) => Number(n || 0).toLocaleString("en-IN");

export default function StockSummaryReport() {
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [dateFilter, setDateFilter] = useState(isoToday());
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const handler = () => setRefreshTrigger((k) => k + 1);
    window.addEventListener("ledgerly:business-data-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  /* ── raw data ── */
  const inventoryItems = useMemo(() => {
    try {
      return getInventoryItems() || [];
    } catch {
      return [];
    }
  }, [refreshTrigger]);

  const sales = useMemo(
    () => readLocal("ledgerly:saleInvoices.v1", "ledgerly:sales.v1"),
    [refreshTrigger]
  );
  const purchases = useMemo(
    () => readLocal("ledgerly:purchaseBills.v1", "ledgerly:purchases.v1"),
    [refreshTrigger]
  );
  const saleOrders = useMemo(
    () => readLocal("ledgerly:saleOrders.v1"),
    [refreshTrigger]
  );

  /* ── category list ── */
  const categories = useMemo(() => {
    const set = new Set();
    inventoryItems.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return ["All Categories", ...Array.from(set).sort()];
  }, [inventoryItems]);

  /* ── compute qty movements per item (name-based lookup) ── */
  const qtyMovements = useMemo(() => {
    // Map: lowercased item name → { soldQty, purchasedQty, reservedQty }
    const map = new Map();

    const getEntry = (name) => {
      const key = name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { soldQty: 0, purchasedQty: 0, reservedQty: 0 });
      return map.get(key);
    };

    // Date cutoff for date filter
    const cutoff = useDateFilter ? dateFilter : null;

    // Process sales → subtract qty
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      if (cutoff) {
        const d = parseYMD(s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt);
        if (d && d > cutoff) return;
      }
      (s.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        getEntry(name).soldQty += Math.max(Number(r.qty || r.quantity || 0), 0);
      });
    });

    // Process purchases → add qty
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      if (cutoff) {
        const d = parseYMD(p.form?.billDate || p.form?.invoiceDate || p.billDate || p.date || p.createdAt);
        if (d && d > cutoff) return;
      }
      (p.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        getEntry(name).purchasedQty += Math.max(Number(r.qty || r.quantity || 0), 0);
      });
    });

    // Process open sale orders → reserved qty
    saleOrders.forEach((so) => {
      const status = (so.status || "").toLowerCase();
      if (status === "cancelled" || status === "delivered" || status === "closed") return;
      (so.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        getEntry(name).reservedQty += Math.max(Number(r.qty || r.quantity || 0), 0);
      });
    });

    return map;
  }, [sales, purchases, saleOrders, useDateFilter, dateFilter]);

  /* ── build rows ── */
  const rows = useMemo(() => {
    return inventoryItems
      .filter((item) => item.type !== "service")
      .filter((item) =>
        categoryFilter === "All Categories" || item.category === categoryFilter
      )
      .map((item) => {
        const name = (item.itemName || item.name || "").trim();
        const key = name.toLowerCase();
        const mv = qtyMovements.get(key) || { soldQty: 0, purchasedQty: 0, reservedQty: 0 };

        // Opening qty from inventory item (already updated by sales in many flows)
        const openingQty = Number(
          item.openingQuantity !== undefined && item.openingQuantity !== ""
            ? item.openingQuantity
            : item.stock || 0
        );

        // Current stock = opening + purchased - sold
        // If your app updates openingQuantity on each sale, this becomes:
        // stockQty = openingQty + mv.purchasedQty (already deducted sales)
        // But for display accuracy we compute: opening + purchased - sold
        const stockQty = openingQty + mv.purchasedQty - mv.soldQty;

        const reservedQty = mv.reservedQty;
        const availableQty = stockQty - reservedQty;

        const purchasePrice = Number(item.purchasePrice || item.atPrice || 0);
        const salePrice = Number(item.salePrice || item.price || 0);
        // Stock value = purchasePrice × max(0, stock)
        const stockValue = purchasePrice > 0 ? purchasePrice * Math.max(0, stockQty) : 0;

        return {
          name,
          category: item.category || "",
          salePrice,
          purchasePrice,
          stockQty,
          availableQty,
          reservedQty,
          stockValue,
        };
      })
      .filter((r) => !showInStockOnly || r.stockQty > 0);
  }, [inventoryItems, qtyMovements, categoryFilter, showInStockOnly]);

  /* ── totals ── */
  const totals = useMemo(() => ({
    stockQty: rows.reduce((s, r) => s + r.stockQty, 0),
    availableQty: rows.reduce((s, r) => s + r.availableQty, 0),
    reservedQty: rows.reduce((s, r) => s + r.reservedQty, 0),
    stockValue: rows.reduce((s, r) => s + r.stockValue, 0),
  }), [rows]);

  /* ── Excel export ── */
  const handleExcel = () => {
    const data = [
      ["Item Name", "Sale Price", "Purchase Price", "Stock Qty", "Available Qty For Sale", "Reserved Qty", "Stock Value"],
      ...rows.map((r) => [
        r.name, r.salePrice, r.purchasePrice, r.stockQty, r.availableQty, r.reservedQty, r.stockValue,
      ]),
      ["Total", "", "", totals.stockQty, totals.availableQty, totals.reservedQty, totals.stockValue],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Summary");
    XLSX.writeFile(wb, `Stock_Summary_${dateFilter}.xlsx`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-slate-800 text-xs">
      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
        {/* Left filters */}
        <div className="flex flex-wrap items-center gap-4">
          {/* FILTERS label + Category dropdown */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">
              FILTERS
            </span>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none rounded border border-slate-300 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400 focus:border-sky-500 min-w-[140px]"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
            </div>
          </div>

          {/* Date Filter checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useDateFilter}
              onChange={(e) => setUseDateFilter(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-600"
            />
            <span className="text-slate-600 font-medium">Date filter</span>
          </label>

          {/* Date picker — only active when date filter is on */}
          <div className={`flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
            useDateFilter
              ? "border-slate-300 bg-white text-slate-800"
              : "border-slate-200 bg-slate-100 text-slate-400"
          }`}>
            <span className="text-slate-500">Date</span>
            <input
              type="date"
              value={dateFilter}
              disabled={!useDateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={`bg-transparent outline-none cursor-pointer ${
                useDateFilter ? "text-slate-800 font-semibold" : "text-slate-400 cursor-not-allowed"
              }`}
            />
          </div>

          {/* Show items in stock */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInStockOnly}
              onChange={(e) => setShowInStockOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-600"
            />
            <span className="text-slate-600 font-medium">Show items in stock</span>
          </label>
        </div>

        {/* Right action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExcel}
            title="Export Excel"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-emerald-600 shadow-xs hover:bg-emerald-50 transition-colors"
          >
            <RiFileExcel2Line className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Print"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <FiPrinter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Title ── */}
      <div className="border-b border-slate-100 bg-white px-5 py-3">
        <h2 className="text-sm font-bold tracking-wider text-slate-700 uppercase">
          STOCK SUMMARY
        </h2>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-[11px] font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3 min-w-[160px]">Item Name</th>
              <th className="px-4 py-3 text-right">Sale Price</th>
              <th className="px-4 py-3 text-right">Purchase Price</th>
              <th className="px-4 py-3 text-right">Stock Qty</th>
              <th className="px-4 py-3 text-right leading-tight">
                Available Qty For<br />Sale
              </th>
              <th className="px-4 py-3 text-right">Reserved Qty</th>
              <th className="px-5 py-3 text-right">Stock Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-400">
                  No items found. Add inventory items to see stock summary.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.name + i}
                  className="hover:bg-slate-50 transition-colors cursor-default"
                >
                  {/* Item Name */}
                  <td className="px-5 py-2.5 font-medium text-slate-800">
                    {row.name}
                  </td>
                  {/* Sale Price */}
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {row.salePrice > 0 ? fmtMoney(row.salePrice) : (
                      <span className="text-slate-400">₹ 0.00</span>
                    )}
                  </td>
                  {/* Purchase Price */}
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {row.purchasePrice > 0 ? fmtMoney(row.purchasePrice) : (
                      <span className="text-slate-400">₹ 0.00</span>
                    )}
                  </td>
                  {/* Stock Qty — green positive, red negative */}
                  <td className="px-4 py-2.5 text-right font-medium">
                    <span className={row.stockQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                      {fmtQty(row.stockQty)}
                    </span>
                  </td>
                  {/* Available Qty For Sale */}
                  <td className="px-4 py-2.5 text-right font-medium">
                    <span className={row.availableQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                      {fmtQty(row.availableQty)}
                    </span>
                  </td>
                  {/* Reserved Qty — rose if non-zero, slate if 0 */}
                  <td className="px-4 py-2.5 text-right font-medium">
                    <span className={row.reservedQty > 0 ? "text-rose-500" : "text-slate-400"}>
                      {fmtQty(row.reservedQty)}
                    </span>
                  </td>
                  {/* Stock Value */}
                  <td className="px-5 py-2.5 text-right text-slate-700">
                    {row.stockValue > 0 ? fmtMoney(row.stockValue) : (
                      <span className="text-slate-400">₹ 0.00</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* ── Totals row ── */}
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-white font-semibold text-slate-800">
                <td className="px-5 py-3">Total</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right">
                  <span className={totals.stockQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                    {fmtQty(totals.stockQty)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={totals.availableQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                    {fmtQty(totals.availableQty)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={totals.reservedQty > 0 ? "text-rose-500" : "text-slate-400"}>
                    {fmtQty(totals.reservedQty)}
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-slate-800">
                  {fmtMoney(totals.stockValue)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

