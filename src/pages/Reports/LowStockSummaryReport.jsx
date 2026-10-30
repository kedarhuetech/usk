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

const fmtMoney = (n) =>
  `₹ ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function LowStockSummaryReport() {
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
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

  // Compute sold and purchased qty per item
  const movements = useMemo(() => {
    const map = new Map();
    const get = (name) => {
      const k = name.trim().toLowerCase();
      if (!map.has(k)) map.set(k, { sold: 0, purchased: 0 });
      return map.get(k);
    };
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      (s.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (name) get(name).sold += Math.max(Number(r.qty || r.quantity || 0), 0);
      });
    });
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      (p.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (name) get(name).purchased += Math.max(Number(r.qty || r.quantity || 0), 0);
      });
    });
    return map;
  }, [sales, purchases]);

  // Filter low stock items: stock <= minStock
  const rows = useMemo(() => {
    return inventoryItems
      .filter((item) => item.type !== "service")
      .filter(
        (item) =>
          selectedCategory === "All Categories" || item.category === selectedCategory
      )
      .map((item) => {
        const name = (item.itemName || item.name || "").trim();
        const mv = movements.get(name.toLowerCase()) || { sold: 0, purchased: 0 };
        const openingQty = Number(
          item.openingQuantity !== undefined && item.openingQuantity !== ""
            ? item.openingQuantity
            : item.stock || 0
        );
        const stockQty = openingQty + mv.purchased - mv.sold;
        const minStock = Number(item.minimumStock || item.minStock || 0);
        const purchasePrice = Number(item.purchasePrice || item.atPrice || 0);
        const stockValue = purchasePrice > 0 ? purchasePrice * Math.max(0, stockQty) : 0;

        return {
          id: item.id,
          name,
          minStock,
          stockQty,
          stockValue,
          isLow: stockQty <= minStock,
        };
      })
      .filter((r) => r.isLow)
      .filter((r) => !showInStockOnly || r.stockQty > 0);
  }, [inventoryItems, movements, selectedCategory, showInStockOnly]);

  const handleExcel = () => {
    const data = [
      ["#", "Item Name", "Minimum Stock Qty", "Stock Qty", "Stock Value"],
      ...rows.map((r, i) => [i + 1, r.name, r.minStock, r.stockQty, r.stockValue]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Low Stock Summary");
    XLSX.writeFile(wb, "Low_Stock_Summary.xlsx");
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-slate-800 text-xs">
      {/* ── Filters Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500">
              FILTERS
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

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInStockOnly}
              onChange={(e) => setShowInStockOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-600 cursor-pointer"
            />
            <span className="text-slate-600 font-medium">Show items in stock</span>
          </label>
        </div>

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

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="w-12 px-4 py-3 text-center">#</th>
              <th className="px-5 py-3">Item Name</th>
              <th className="px-5 py-3 text-right">Minimum Stock Qty</th>
              <th className="px-5 py-3 text-right">Stock Qty</th>
              <th className="px-5 py-3 text-right">Stock Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-400">
                  No items currently below minimum stock quantity.
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
                    <td className="w-12 px-4 py-3 text-center text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {row.name}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-700">
                      {row.minStock}
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      <span className={row.stockQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                        {row.stockQty}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-800 font-medium">
                      {fmtMoney(row.stockValue)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

