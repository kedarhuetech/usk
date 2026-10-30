import React, { useMemo, useState, useEffect } from "react";
import { FiPrinter, FiChevronDown } from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";

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

export default function ItemReportByParty() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [partyFilter, setPartyFilter] = useState("");
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

  const sales = useMemo(() => readLocal("ledgerly:saleInvoices.v1"), [refreshTrigger]);
  const purchases = useMemo(() => readLocal("ledgerly:purchaseBills.v1"), [refreshTrigger]);

  /* ── Build item aggregations ── */
  const rows = useMemo(() => {
    const itemMap = new Map();

    const getEntry = (itemName) => {
      const key = itemName.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemName: itemName.trim(),
          saleQty: 0,
          saleAmount: 0,
          purchaseQty: 0,
          purchaseAmount: 0,
        });
      }
      return itemMap.get(key);
    };

    const query = partyFilter.trim().toLowerCase();

    // Sales
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      const dateYmd = parseYMD(s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      // Party filter
      if (query) {
        const customer = (s.form?.customer || s.customer || s.partyName || "").toLowerCase();
        if (!customer.includes(query)) return;
      }
      (s.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = getEntry(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const amt = Number(r.amount || r.total || 0) || (Number(r.price || 0) * qty);
        entry.saleQty += qty;
        entry.saleAmount += amt;
      });
      // Fallback if no rows
      if (!(s.rows || []).length) {
        // No item-level data available, skip
      }
    });

    // Purchases
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      const dateYmd = parseYMD(p.form?.billDate || p.form?.invoiceDate || p.billDate || p.date || p.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      if (query) {
        const supplier = (p.form?.customer || p.supplier || p.partyName || p.party || "").toLowerCase();
        if (!supplier.includes(query)) return;
      }
      (p.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = getEntry(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const amt = Number(r.amount || r.total || 0) || (Number(r.price || 0) * qty);
        entry.purchaseQty += qty;
        entry.purchaseAmount += amt;
      });
    });

    return Array.from(itemMap.values()).filter(
      (r) => r.saleQty > 0 || r.purchaseQty > 0
    );
  }, [sales, purchases, from, to, partyFilter]);

  const totals = useMemo(() => ({
    saleQty: rows.reduce((s, r) => s + r.saleQty, 0),
    saleAmount: rows.reduce((s, r) => s + r.saleAmount, 0),
    purchaseQty: rows.reduce((s, r) => s + r.purchaseQty, 0),
    purchaseAmount: rows.reduce((s, r) => s + r.purchaseAmount, 0),
  }), [rows]);

  const handleExcel = () => {
    const data = [
      ["Item Name", "Sale Quantity", "Sale Amount", "Purchase Quantity", "Purchase Amount"],
      ...rows.map((r) => [r.itemName, r.saleQty, r.saleAmount, r.purchaseQty, r.purchaseAmount]),
      ["Total", totals.saleQty, totals.saleAmount, totals.purchaseQty, totals.purchaseAmount],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Report By Party");
    XLSX.writeFile(wb, `Item_Report_By_Party_${from}_to_${to}.xlsx`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-slate-800 text-xs">
      {/* ── Top Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        {/* Date Range */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs">
            <span className="text-slate-500 font-medium">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs">
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
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-emerald-600 shadow-xs hover:bg-emerald-50"
          >
            <RiFileExcel2Line className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Print"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50"
          >
            <FiPrinter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Title + Party Filter ── */}
      <div className="border-b border-slate-100 bg-white px-5 py-3">
        <h2 className="mb-3 text-sm font-bold tracking-wider text-slate-700 uppercase">DETAILS</h2>
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500">FILTERS</span>
          <input
            type="text"
            placeholder="Party filter"
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 min-w-[200px]"
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="px-5 py-3">Item Name</th>
              <th className="px-5 py-3 text-right">Sale Quantity</th>
              <th className="px-5 py-3 text-right">Sale Amount</th>
              <th className="px-5 py-3 text-right">Purchase Quantity</th>
              <th className="px-5 py-3 text-right">Purchase Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-400">
                  No item transactions found for the selected period{partyFilter ? ` and party "${partyFilter}"` : ""}.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.itemName + i} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-800">{row.itemName}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{row.saleQty}</td>
                  <td className="px-5 py-2.5 text-right text-slate-800">{fmtMoney(row.saleAmount)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{row.purchaseQty}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{fmtMoney(row.purchaseAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right">{totals.saleQty}</td>
                <td className="px-5 py-3 text-right">{fmtMoney(totals.saleAmount)}</td>
                <td className="px-5 py-3 text-right">{totals.purchaseQty}</td>
                <td className="px-5 py-3 text-right">{fmtMoney(totals.purchaseAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

