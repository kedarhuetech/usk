import React, { useMemo, useState, useEffect } from "react";
import { FiChevronDown, FiPrinter } from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";
import { getInventoryItems } from "../../services/itemsStorage";

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

const defaultFrom = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const defaultTo = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
};

const fmtMoney = (n) =>
  `₹ ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function StockDetailReport() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedRow, setSelectedRow] = useState(null);
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

  const inventoryItems = useMemo(() => {
    try {
      return getInventoryItems() || [];
    } catch {
      return [];
    }
  }, [refreshTrigger]);

  const sales = useMemo(() => readLocal("ledgerly:saleInvoices.v1"), [refreshTrigger]);
  const purchases = useMemo(() => readLocal("ledgerly:purchaseBills.v1"), [refreshTrigger]);

  const categories = useMemo(() => {
    const set = new Set();
    inventoryItems.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return ["All Categories", ...Array.from(set).sort()];
  }, [inventoryItems]);

  const rows = useMemo(() => {
    // 1. Calculate movements in period [from, to] and before period (< from)
    const statsMap = new Map();

    const get = (name) => {
      const k = name.trim().toLowerCase();
      if (!statsMap.has(k)) {
        statsMap.set(k, {
          beforeIn: 0,
          beforeOut: 0,
          qtyIn: 0,
          purchaseAmount: 0,
          qtyOut: 0,
          saleAmount: 0,
        });
      }
      return statsMap.get(k);
    };

    // Process Purchases (Quantity In)
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      const d = parseYMD(p.form?.billDate || p.form?.invoiceDate || p.billDate || p.date || p.createdAt);
      (p.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = get(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const price = Number(r.price || r.rate || 0);
        const amt = Number(r.amount || r.total || 0) || (price * qty);

        if (from && d && d < from) {
          entry.beforeIn += qty;
        } else if ((!from || d >= from) && (!to || d <= to)) {
          entry.qtyIn += qty;
          entry.purchaseAmount += amt;
        }
      });
    });

    // Process Sales (Quantity Out)
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      const d = parseYMD(s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt);
      (s.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = get(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const price = Number(r.price || r.rate || 0);
        const amt = Number(r.amount || r.total || 0) || (price * qty);

        if (from && d && d < from) {
          entry.beforeOut += qty;
        } else if ((!from || d >= from) && (!to || d <= to)) {
          entry.qtyOut += qty;
          entry.saleAmount += amt;
        }
      });
    });

    return inventoryItems
      .filter((item) => item.type !== "service")
      .filter(
        (item) =>
          selectedCategory === "All Categories" || item.category === selectedCategory
      )
      .map((item) => {
        const name = (item.itemName || item.name || "").trim();
        const mv = statsMap.get(name.toLowerCase()) || {
          beforeIn: 0,
          beforeOut: 0,
          qtyIn: 0,
          purchaseAmount: 0,
          qtyOut: 0,
          saleAmount: 0,
        };

        const initialStock = Number(
          item.openingQuantity !== undefined && item.openingQuantity !== ""
            ? item.openingQuantity
            : item.stock || 0
        );

        // Beginning Quantity = initial stock + beforeIn - beforeOut
        const beginningQty = initialStock + mv.beforeIn - mv.beforeOut;
        const closingQty = beginningQty + mv.qtyIn - mv.qtyOut;

        return {
          id: item.id,
          name,
          beginningQty,
          qtyIn: mv.qtyIn,
          purchaseAmount: mv.purchaseAmount,
          qtyOut: mv.qtyOut,
          saleAmount: mv.saleAmount,
          closingQty,
        };
      });
  }, [inventoryItems, sales, purchases, from, to, selectedCategory]);

  const totals = useMemo(() => ({
    beginningQty: rows.reduce((s, r) => s + r.beginningQty, 0),
    qtyIn: rows.reduce((s, r) => s + r.qtyIn, 0),
    purchaseAmount: rows.reduce((s, r) => s + r.purchaseAmount, 0),
    qtyOut: rows.reduce((s, r) => s + r.qtyOut, 0),
    saleAmount: rows.reduce((s, r) => s + r.saleAmount, 0),
    closingQty: rows.reduce((s, r) => s + r.closingQty, 0),
  }), [rows]);

  const handleExcel = () => {
    const data = [
      ["Item Name", "Begining Quantity", "Quantity In", "Purchase Amount", "Quantity Out", "Sale Amount", "Closing Quantity"],
      ...rows.map((r) => [
        r.name,
        r.beginningQty,
        r.qtyIn,
        r.purchaseAmount,
        r.qtyOut,
        r.saleAmount,
        r.closingQty,
      ]),
      ["Total", totals.beginningQty, totals.qtyIn, totals.purchaseAmount, totals.qtyOut, totals.saleAmount, totals.closingQty],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Detail");
    XLSX.writeFile(wb, `Stock_Detail_${from}_to_${to}.xlsx`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-slate-800 text-xs">
      {/* ── Top Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        {/* Date Range */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 shadow-xs">
            <span className="text-slate-500 font-medium">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 shadow-xs">
            <span className="text-slate-500 font-medium">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Excel & Print */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExcel}
            title="Export Excel"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-emerald-600 shadow-xs hover:bg-emerald-50 cursor-pointer"
          >
            <RiFileExcel2Line className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Print"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 cursor-pointer"
          >
            <FiPrinter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Title & Category Filter ── */}
      <div className="border-b border-slate-100 bg-white px-5 py-3">
        <h2 className="mb-3 text-sm font-bold tracking-wider text-slate-700 uppercase">
          DETAILS
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-600 text-xs">
            Filter by Item Category
          </span>
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="appearance-none rounded border border-slate-300 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400 focus:border-sky-500 min-w-[140px]"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="px-5 py-3 min-w-[150px]">Item Name</th>
              <th className="px-4 py-3 text-right">Begining Quantity</th>
              <th className="px-4 py-3 text-right">Quantity In</th>
              <th className="px-4 py-3 text-right">Purchase Amount</th>
              <th className="px-4 py-3 text-right">Quantity Out</th>
              <th className="px-4 py-3 text-right">Sale Amount</th>
              <th className="px-4 py-3 text-right">Closing Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-400">
                  No stock details found for the selected period.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const isSelected = selectedRow === idx;
                return (
                  <tr
                    key={row.id || row.name + idx}
                    onClick={() => setSelectedRow(idx)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-sky-50 dark:bg-[#1d3354] font-medium" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-5 py-2.5 font-medium text-slate-800">
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {row.beginningQty}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {row.qtyIn}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {fmtMoney(row.purchaseAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {row.qtyOut}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                      {fmtMoney(row.saleAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      <span className={row.closingQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                        {row.closingQty}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
                <td className="px-5 py-3">Total</td>
                <td className="px-4 py-3 text-right">{totals.beginningQty}</td>
                <td className="px-4 py-3 text-right">{totals.qtyIn}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(totals.purchaseAmount)}</td>
                <td className="px-4 py-3 text-right">{totals.qtyOut}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(totals.saleAmount)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={totals.closingQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                    {totals.closingQty}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

