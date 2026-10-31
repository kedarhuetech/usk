import React, { useMemo, useState, useEffect } from "react";
import { FiPrinter } from "react-icons/fi";
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

const fmtNum = (n) => {
  const v = Number(n || 0);
  if (v === 0) return "0";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ItemWiseProfitAndLoss() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [itemsHavingSaleOnly, setItemsHavingSaleOnly] = useState(false);
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
    try { return getInventoryItems() || []; } catch { return []; }
  }, [refreshTrigger]);

  const sales = useMemo(() => readLocal("ledgerly:saleInvoices.v1"), [refreshTrigger]);
  const purchases = useMemo(() => readLocal("ledgerly:purchaseBills.v1"), [refreshTrigger]);
  const saleReturns = useMemo(() => readLocal("ledgerly:saleReturns.v1"), [refreshTrigger]);
  const purchaseReturns = useMemo(() => readLocal("ledgerly:purchaseReturns.v1", "ledgerly:purchaseReturnsDebitNotes.v1"), [refreshTrigger]);

  /* ── Compute per-item financials ── */
  const rows = useMemo(() => {
    // Map: item name → {saleAmt, crNoteAmt, purchaseAmt, drNoteAmt, taxReceivable, taxPayable}
    const itemMap = new Map();

    const getEntry = (name) => {
      const key = name.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemName: name.trim(),
          saleAmt: 0,
          crNoteAmt: 0,
          purchaseAmt: 0,
          drNoteAmt: 0,
          taxReceivable: 0,
          taxPayable: 0,
        });
      }
      return itemMap.get(key);
    };

    // Sales → saleAmt
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      const dateYmd = parseYMD(s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      (s.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = getEntry(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const price = Number(r.price || r.rate || 0);
        const disc = Number(r.discountAmount || 0) || (price * qty * Number(r.discountPercent || 0)) / 100;
        const lineAmt = Number(r.amount || r.total || Math.max(0, price * qty - disc) || 0);
        const tax = Number(r.taxAmount || 0);
        entry.saleAmt += lineAmt;
        entry.taxReceivable += tax;
      });
      // Fallback: whole-invoice if no rows
      if (!(s.rows || []).length) {
        const amt = Number(s.totals?.finalTotal ?? s.totals?.grandTotal ?? s.total ?? 0);
        // Can't attribute to item, skip
      }
    });

    // Sale Returns → crNoteAmt
    saleReturns.forEach((sr) => {
      const dateYmd = parseYMD(sr.form?.invoiceDate || sr.date || sr.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      (sr.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = getEntry(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const price = Number(r.price || r.rate || 0);
        const lineAmt = Number(r.amount || r.total || price * qty || 0);
        entry.crNoteAmt += lineAmt;
      });
    });

    // Purchases → purchaseAmt
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      const dateYmd = parseYMD(p.form?.billDate || p.form?.invoiceDate || p.billDate || p.date || p.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      (p.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = getEntry(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const price = Number(r.price || r.rate || 0);
        const lineAmt = Number(r.amount || r.total || price * qty || 0);
        const tax = Number(r.taxAmount || 0);
        entry.purchaseAmt += lineAmt;
        entry.taxPayable += tax;
      });
    });

    // Purchase Returns → drNoteAmt
    purchaseReturns.forEach((pr) => {
      const dateYmd = parseYMD(pr.date || pr.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      (pr.rows || []).forEach((r) => {
        const name = (r.item || "").trim();
        if (!name) return;
        const entry = getEntry(name);
        const qty = Math.max(Number(r.qty || r.quantity || 0), 0);
        const price = Number(r.price || r.rate || 0);
        const lineAmt = Number(r.amount || r.total || price * qty || 0);
        entry.drNoteAmt += lineAmt;
      });
    });

    // Build final rows by merging with inventory items for Opening/Closing Stock
    // itemInventoryMap: lowercased name → inventory item
    const itemInventoryMap = new Map();
    inventoryItems.forEach((item) => {
      if (item.type === "service") return;
      const key = (item.itemName || item.name || "").trim().toLowerCase();
      if (key) itemInventoryMap.set(key, item);
    });

    // Build sold qty per item (for closing stock calculation)
    const soldQty = new Map();
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      const dateYmd = parseYMD(s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      (s.rows || []).forEach((r) => {
        const key = (r.item || "").trim().toLowerCase();
        if (!key) return;
        soldQty.set(key, (soldQty.get(key) || 0) + Math.max(Number(r.qty || 0), 0));
      });
    });
    const purchasedQty = new Map();
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      const dateYmd = parseYMD(p.form?.billDate || p.form?.invoiceDate || p.date || p.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      (p.rows || []).forEach((r) => {
        const key = (r.item || "").trim().toLowerCase();
        if (!key) return;
        purchasedQty.set(key, (purchasedQty.get(key) || 0) + Math.max(Number(r.qty || 0), 0));
      });
    });

    // All items: union of itemMap keys + all inventory items with transactions
    const allKeys = new Set([...itemMap.keys()]);

    return Array.from(allKeys).map((key) => {
      const txn = itemMap.get(key) || { itemName: key, saleAmt: 0, crNoteAmt: 0, purchaseAmt: 0, drNoteAmt: 0, taxReceivable: 0, taxPayable: 0 };
      const inv = itemInventoryMap.get(key);

      // Opening Stock Value: initial stock × purchase/at price
      const purchasePrice = Number(inv?.purchasePrice || inv?.atPrice || 0);
      const openingQtyRaw = Number(inv?.openingQuantity !== undefined && inv?.openingQuantity !== "" ? inv.openingQuantity : (inv?.stock || 0));
      // Closing stock = opening + purchased - sold
      const sold = soldQty.get(key) || 0;
      const purchased = purchasedQty.get(key) || 0;
      const closingQty = openingQtyRaw + purchased - sold;

      const openingStockVal = purchasePrice * Math.max(0, openingQtyRaw);
      const closingStockVal = purchasePrice * Math.max(0, closingQty);

      // Net P/L = Sale - CrNote + DrNote - (OpeningStock - ClosingStock) - TaxPayable - MfgCost
      // Simplified: Sale - CrNote - (COGS) where COGS = OpeningStock + Purchase - ClosingStock - DrNote
      const cogs = openingStockVal + txn.purchaseAmt - closingStockVal - txn.drNoteAmt;
      const netPL = txn.saleAmt - txn.crNoteAmt - cogs;

      return {
        itemName: txn.itemName || key,
        saleAmt: txn.saleAmt,
        crNoteAmt: txn.crNoteAmt,
        purchaseAmt: txn.purchaseAmt,
        drNoteAmt: txn.drNoteAmt,
        openingStockVal,
        closingStockVal,
        taxReceivable: txn.taxReceivable,
        taxPayable: txn.taxPayable,
        mfgCost: 0,
        consumptionCost: 0,
        netPL,
        hasSale: txn.saleAmt > 0,
      };
    }).filter((r) => !itemsHavingSaleOnly || r.hasSale);
  }, [sales, purchases, saleReturns, purchaseReturns, inventoryItems, from, to, itemsHavingSaleOnly]);

  const totalNetPL = useMemo(() => rows.reduce((s, r) => s + r.netPL, 0), [rows]);

  const handleExcel = () => {
    const data = [
      ["Item Name", "Sale", "Cr.Note/Sale Return", "Purchase", "Dr.Note/Purchase Return", "Opening Stock", "Closing Stock", "Tax Receivable", "Tax Payable", "Mfg. Cost", "Consumption Cost", "Net Profit/Loss"],
      ...rows.map((r) => [r.itemName, r.saleAmt, r.crNoteAmt, r.purchaseAmt, r.drNoteAmt, r.openingStockVal, r.closingStockVal, r.taxReceivable, r.taxPayable, r.mfgCost, r.consumptionCost, r.netPL]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Wise P&L");
    XLSX.writeFile(wb, `Item_Wise_ProfitLoss_${from}_to_${to}.xlsx`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-slate-800 text-xs">
      {/* ── Top Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range */}
          <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 shadow-xs cursor-pointer hover:border-sky-500 transition-colors">
            <span className="text-slate-500 font-medium select-none">From</span>
            <input type="date" value={from}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer" />
          </label>
          <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 shadow-xs cursor-pointer hover:border-sky-500 transition-colors">
            <span className="text-slate-500 font-medium select-none">To</span>
            <input type="date" value={to}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }}
              onChange={(e) => setTo(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer" />
          </label>
          {/* Items Having Sale toggle */}
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <input type="checkbox" checked={itemsHavingSaleOnly}
              onChange={(e) => setItemsHavingSaleOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-600" />
            <span className="text-slate-600 font-medium">Items Having Sale</span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExcel} title="Export Excel"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-emerald-600 shadow-xs hover:bg-emerald-50">
            <RiFileExcel2Line className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => window.print()} title="Print"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50">
            <FiPrinter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Title ── */}
      <div className="border-b border-slate-100 bg-white px-5 py-3">
        <h2 className="text-sm font-bold tracking-wider text-slate-700 uppercase">DETAILS</h2>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3 min-w-[120px]">Item Name</th>
              <th className="px-3 py-3 text-right">Sale</th>
              <th className="px-3 py-3 text-right leading-tight whitespace-nowrap">
                Cr. Note /<br />Sale Return
              </th>
              <th className="px-3 py-3 text-right">Purchase</th>
              <th className="px-3 py-3 text-right leading-tight whitespace-nowrap">
                Dr. Note /<br />Purchase Return
              </th>
              <th className="px-3 py-3 text-right leading-tight">Opening<br />Stock</th>
              <th className="px-3 py-3 text-right leading-tight">Closing<br />Stock</th>
              <th className="px-3 py-3 text-right leading-tight">Tax<br />Receivable</th>
              <th className="px-3 py-3 text-right leading-tight">Tax<br />Payable</th>
              <th className="px-3 py-3 text-right leading-tight">Mfg.<br />Cost</th>
              <th className="px-3 py-3 text-right leading-tight">Consumption<br />Cost</th>
              <th className="px-3 py-3 text-right leading-tight">Net<br />Profit/Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-16 text-center text-slate-400">
                  No item profit/loss data found for the selected period.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.itemName + i}
                  className="hover:bg-slate-50 cursor-default"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.itemName}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.saleAmt)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.crNoteAmt)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.purchaseAmt)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.drNoteAmt)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.openingStockVal)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.closingStockVal)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.taxReceivable)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.taxPayable)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.mfgCost)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(row.consumptionCost)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    <span className={row.netPL < 0 ? "text-rose-600" : "text-emerald-600"}>
                      {row.netPL < 0 ? "- " : ""}₹{Math.abs(row.netPL).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer: Total Amount ── */}
      {rows.length > 0 && (
        <div className="flex items-center justify-end border-t border-slate-200 bg-white px-6 py-3 text-xs font-semibold text-slate-700 shadow-sm">
          <span className="mr-2">Total Amount:</span>
          <span className={`font-bold text-sm ${totalNetPL < 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {totalNetPL < 0 ? "- " : ""}₹{Math.abs(totalNetPL).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      )}
    </div>
  );
}

