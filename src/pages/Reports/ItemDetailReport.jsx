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

function fmtDisplayDate(ymd) {
  if (!ymd) return "—";
  const parts = ymd.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return ymd;
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

export default function ItemDetailReport() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [selectedItemName, setSelectedItemName] = useState("");
  const [hideInactiveDates, setHideInactiveDates] = useState(false);
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
  const adjustments = useMemo(() => readLocal("ledgerly:inventoryAdjustments.v1"), [refreshTrigger]);

  // Set default selected item
  useEffect(() => {
    if (!selectedItemName && inventoryItems.length > 0) {
      const first = inventoryItems.find((i) => i.type !== "service");
      if (first) setSelectedItemName(first.itemName || first.name);
    }
  }, [inventoryItems, selectedItemName]);

  const rows = useMemo(() => {
    if (!selectedItemName) return [];
    const target = selectedItemName.trim().toLowerCase();
    const invItem = inventoryItems.find(
      (i) => (i.itemName || i.name || "").trim().toLowerCase() === target
    );
    const openingQty = Number(
      invItem?.openingQuantity !== undefined && invItem?.openingQuantity !== ""
        ? invItem.openingQuantity
        : invItem?.stock || 0
    );

    // Collect daily activity: map of YYYY-MM-DD -> { saleQty, purchaseQty, adjQty }
    const daily = new Map();

    const getDay = (dateStr) => {
      const ymd = parseYMD(dateStr);
      if (!ymd) return null;
      if (!daily.has(ymd)) {
        daily.set(ymd, { saleQty: 0, purchaseQty: 0, adjQty: 0 });
      }
      return { ymd, entry: daily.get(ymd) };
    };

    // Before-period movements
    let beforeSale = 0;
    let beforePurchase = 0;
    let beforeAdj = 0;

    // Process Sales
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      const d = parseYMD(s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt);
      (s.rows || []).forEach((r) => {
        if ((r.item || "").trim().toLowerCase() !== target) return;
        const q = Math.max(Number(r.qty || r.quantity || 0), 0);
        if (from && d && d < from) {
          beforeSale += q;
        } else if (d) {
          const day = getDay(d);
          if (day) day.entry.saleQty += q;
        }
      });
    });

    // Process Purchases
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      const d = parseYMD(p.form?.billDate || p.form?.invoiceDate || p.billDate || p.date || p.createdAt);
      (p.rows || []).forEach((r) => {
        if ((r.item || "").trim().toLowerCase() !== target) return;
        const q = Math.max(Number(r.qty || r.quantity || 0), 0);
        if (from && d && d < from) {
          beforePurchase += q;
        } else if (d) {
          const day = getDay(d);
          if (day) day.entry.purchaseQty += q;
        }
      });
    });

    // Process Adjustments
    adjustments.forEach((adj) => {
      if ((adj.itemName || adj.item || "").trim().toLowerCase() !== target) return;
      const d = parseYMD(adj.date || adj.createdAt);
      const q = Number(adj.quantity || adj.qty || 0);
      if (from && d && d < from) {
        beforeAdj += q;
      } else if (d) {
        const day = getDay(d);
        if (day) day.entry.adjQty += q;
      }
    });

    // Generate date sequence from `from` to `to`
    const result = [];
    const startDate = from ? new Date(from) : new Date(defaultFrom());
    const endDate = to ? new Date(to) : new Date(defaultTo());

    let runningClosing = openingQty + beforePurchase - beforeSale + beforeAdj;

    // Iterate through dates
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const dayData = daily.get(ymd) || { saleQty: 0, purchaseQty: 0, adjQty: 0 };

      runningClosing = runningClosing + dayData.purchaseQty - dayData.saleQty + dayData.adjQty;

      const hasActivity =
        dayData.saleQty !== 0 || dayData.purchaseQty !== 0 || dayData.adjQty !== 0;

      if (!hideInactiveDates || hasActivity) {
        result.push({
          date: ymd,
          displayDate: fmtDisplayDate(ymd),
          saleQty: dayData.saleQty,
          purchaseQty: dayData.purchaseQty,
          adjQty: dayData.adjQty,
          closingQty: runningClosing,
        });
      }

      cur.setDate(cur.getDate() + 1);
    }

    return result;
  }, [selectedItemName, inventoryItems, sales, purchases, adjustments, from, to, hideInactiveDates]);

  const handleExcel = () => {
    const data = [
      ["Date", "Sale Quantity", "Purchase Quantity", "Adjustment Quantity", "Closing Quantity"],
      ...rows.map((r) => [r.displayDate, r.saleQty, r.purchaseQty, r.adjQty, r.closingQty]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Detail");
    XLSX.writeFile(wb, `Item_Detail_${selectedItemName || "all"}_${from}_to_${to}.xlsx`);
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

      {/* ── Title & Item Selector ── */}
      <div className="border-b border-slate-100 bg-white px-5 py-3">
        <h2 className="mb-3 text-sm font-bold tracking-wider text-slate-700 uppercase">
          DETAILS
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 text-xs">
              Item name
            </span>
            <div className="relative">
              <input
                type="text"
                value={selectedItemName}
                onChange={(e) => setSelectedItemName(e.target.value)}
                placeholder="Type or select item..."
                list="inventory-items-datalist"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500 min-w-[200px]"
              />
              <datalist id="inventory-items-datalist">
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.itemName || item.name} />
                ))}
              </datalist>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideInactiveDates}
              onChange={(e) => setHideInactiveDates(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-600 cursor-pointer"
            />
            <span className="text-slate-600 font-medium">Hide inactive dates</span>
          </label>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Sale Quantity</th>
              <th className="px-5 py-3 text-right">Purchase Quantity</th>
              <th className="px-5 py-3 text-right">Adjustment Quantity</th>
              <th className="px-5 py-3 text-right">Closing Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-400">
                  {selectedItemName
                    ? "No activity recorded for this item in the selected period."
                    : "Please enter or select an item name above."}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const isSelected = selectedRow === idx;
                return (
                  <tr
                    key={row.date + idx}
                    onClick={() => setSelectedRow(idx)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-sky-50 dark:bg-[#1d3354] font-medium" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-5 py-2.5 font-medium text-slate-800">
                      {row.displayDate}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-700">
                      {row.saleQty || 0}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-700">
                      {row.purchaseQty || 0}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-700">
                      {row.adjQty || 0}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium">
                      <span className={row.closingQty < 0 ? "text-rose-500" : "text-emerald-600"}>
                        {row.closingQty}
                      </span>
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

