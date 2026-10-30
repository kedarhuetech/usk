import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCalendar,
  FiChevronDown,
  FiFilter,
  FiPrinter,
  FiSearch,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import { getParties } from "../../services/partiesStorage";
import { getInventoryItems } from "../../services/itemsStorage";
import { calculateSaleReturnRow } from "../../services/saleReturnsStorage";

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
    if (dmySlash)
      return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDash)
      return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd)
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  return "";
}

function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const defaultFrom = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const defaultTo = () => {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    lastDay
  ).padStart(2, "0")}`;
};

export default function PartyReportByItem() {
  const navigate = useNavigate();

  // Filters
  const [period, setPeriod] = useState("This Month");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [firm, setFirm] = useState("All Firms");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedItem, setSelectedItem] = useState("All Items");
  const [search, setSearch] = useState("");
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Listen to business data updates
  useEffect(() => {
    const handleUpdate = () => setRefreshTrigger((k) => k + 1);
    window.addEventListener("ledgerly:business-data-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
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
    } else if (val === "This Quarter") {
      const qMonth = Math.floor(d.getMonth() / 3) * 3;
      const qStart = new Date(d.getFullYear(), qMonth, 1);
      const qEnd = new Date(d.getFullYear(), qMonth + 3, 0);
      setFrom(isoDate(qStart));
      setTo(isoDate(qEnd));
    } else if (val === "This Year") {
      setFrom(`${d.getFullYear()}-01-01`);
      setTo(`${d.getFullYear()}-12-31`);
    } else if (val === "All Time") {
      setFrom("");
      setTo("");
    }
  };

  // Raw data from storage
  const inventoryItems = useMemo(() => getInventoryItems(), [refreshTrigger]);
  const sales = useMemo(() => readLocal("ledgerly:saleInvoices.v1"), [refreshTrigger]);
  const saleReturns = useMemo(() => readLocal("ledgerly:saleReturns.v1"), [refreshTrigger]);
  const purchases = useMemo(() => readLocal("ledgerly:purchaseBills.v1"), [refreshTrigger]);

  // Inventory lookup map for category resolution
  const itemCategoryMap = useMemo(() => {
    const map = new Map();
    inventoryItems.forEach((item) => {
      const name = (item.itemName || item.name || "").trim().toLowerCase();
      if (name && item.category) {
        map.set(name, item.category);
      }
    });
    return map;
  }, [inventoryItems]);

  // Distinct categories
  const categoriesList = useMemo(() => {
    const set = new Set();
    inventoryItems.forEach((i) => {
      if (i.category && i.category.trim()) set.add(i.category.trim());
    });
    sales.forEach((s) => {
      (s.rows || []).forEach((r) => {
        if (r.category && r.category.trim()) set.add(r.category.trim());
      });
    });

    return ["All Categories", ...Array.from(set).sort()];
  }, [inventoryItems, sales]);

  // Distinct items
  const itemsList = useMemo(() => {
    const set = new Set();
    inventoryItems.forEach((i) => {
      const name = i.itemName || i.name;
      if (name && name.trim()) set.add(name.trim());
    });
    sales.forEach((s) => {
      (s.rows || []).forEach((r) => {
        if (r.item && r.item.trim()) set.add(r.item.trim());
      });
    });
    purchases.forEach((p) => {
      (p.rows || []).forEach((r) => {
        if (r.item && r.item.trim()) set.add(r.item.trim());
      });
    });
    return ["All Items", ...Array.from(set).sort()];
  }, [inventoryItems, sales, purchases]);

  // Calculate party report by items
  const aggregatedReport = useMemo(() => {
    const partyStats = new Map();

    const getPartyObj = (partyName) => {
      const key = partyName.trim();
      if (!partyStats.has(key)) {
        partyStats.set(key, {
          partyName: key,
          saleQty: 0,
          saleAmount: 0,
          purchaseQty: 0,
          purchaseAmount: 0,
        });
      }
      return partyStats.get(key);
    };

    // 1. Process Sales
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      const dateYmd = parseYMD(s.form?.invoiceDate || s.date || s.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;

      const pName = (s.form?.customer || s.customer || s.partyName || "Cash Sale").trim() || "Cash Sale";
      const stats = getPartyObj(pName);

      const rows = Array.isArray(s.rows) && s.rows.length > 0 ? s.rows : [];
      if (rows.length === 0) {
        // Fallback for invoice without granular rows
        if (selectedItem === "All Items" && selectedCategory === "All Categories") {
          const totalAmt = Number(s.totals?.finalTotal ?? s.totals?.grandTotal ?? s.total ?? 0);
          stats.saleAmount += totalAmt;
          stats.saleQty += 1;
        }
      } else {
        rows.forEach((r) => {
          const itemName = (r.item || "").trim();
          if (selectedItem !== "All Items" && itemName.toLowerCase() !== selectedItem.toLowerCase()) {
            return;
          }
          const itemCat = r.category || itemCategoryMap.get(itemName.toLowerCase()) || "";
          if (selectedCategory !== "All Categories" && itemCat.toLowerCase() !== selectedCategory.toLowerCase()) {
            return;
          }

          const qty = Number(r.qty || r.quantity || 0);
          const price = Number(r.price || r.rate || 0);
          const discount = Number(r.discountAmount || (price * qty * Number(r.discountPercent || 0)) / 100 || 0);
          const lineAmt = Number(r.amount || r.total || Math.max(0, price * qty - discount) || 0);

          stats.saleQty += qty;
          stats.saleAmount += lineAmt;
        });
      }
    });

    // 2. Process Purchases
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      const dateYmd = parseYMD(p.form?.invoiceDate || p.form?.billDate || p.date || p.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;

      const pName = (p.form?.customer || p.supplier || p.partyName || p.party || "Supplier").trim() || "Supplier";
      const stats = getPartyObj(pName);

      const rows = Array.isArray(p.rows) && p.rows.length > 0 ? p.rows : [];
      if (rows.length === 0) {
        if (selectedItem === "All Items" && selectedCategory === "All Categories") {
          const totalAmt = Number(p.totals?.finalTotal ?? p.totals?.grandTotal ?? p.totalAmount ?? p.total ?? 0);
          stats.purchaseAmount += totalAmt;
          stats.purchaseQty += 1;
        }
      } else {
        rows.forEach((r) => {
          const itemName = (r.item || "").trim();
          if (selectedItem !== "All Items" && itemName.toLowerCase() !== selectedItem.toLowerCase()) {
            return;
          }
          const itemCat = r.category || itemCategoryMap.get(itemName.toLowerCase()) || "";
          if (selectedCategory !== "All Categories" && itemCat.toLowerCase() !== selectedCategory.toLowerCase()) {
            return;
          }

          const qty = Number(r.qty || r.quantity || 0);
          const price = Number(r.price || r.rate || 0);
          const discount = Number(r.discountAmount || (price * qty * Number(r.discountPercent || 0)) / 100 || 0);
          const lineAmt = Number(r.amount || r.total || Math.max(0, price * qty - discount) || 0);

          stats.purchaseQty += qty;
          stats.purchaseAmount += lineAmt;
        });
      }
    });

    // Returns reduce item sales and remain separate from new sales.
    saleReturns.forEach((creditNote) => {
      if (creditNote.cancelled) return;
      const dateYmd = parseYMD(creditNote.date || creditNote.createdAt);
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;
      const partyName = String(creditNote.party || creditNote.customer || creditNote.partyName || "Cash Sale").trim() || "Cash Sale";
      (creditNote.rows || []).forEach((row) => {
        const itemName = String(row.item || "").trim();
        if (selectedItem !== "All Items" && itemName.toLowerCase() !== selectedItem.toLowerCase()) return;
        const category = row.category || itemCategoryMap.get(itemName.toLowerCase()) || "";
        if (selectedCategory !== "All Categories" && category.toLowerCase() !== selectedCategory.toLowerCase()) return;
        const stats = getPartyObj(partyName);
        stats.saleQty -= Number(row.qty || 0);
        stats.saleAmount -= calculateSaleReturnRow(row).amount;
      });
    });
    // Filter to parties with non-zero activity
    const list = Array.from(partyStats.values()).filter(
      (p) => p.saleQty > 0 || p.saleAmount > 0 || p.purchaseQty > 0 || p.purchaseAmount > 0
    );

    // Sort by sale amount descending (matching screenshot)
    return list.sort((a, b) => b.saleAmount - a.saleAmount);
  }, [sales, purchases, saleReturns, from, to, selectedCategory, selectedItem, itemCategoryMap]);

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!search.trim()) return aggregatedReport;
    const q = search.trim().toLowerCase();
    return aggregatedReport.filter((r) => r.partyName.toLowerCase().includes(q));
  }, [aggregatedReport, search]);

  // Overall totals
  const totalSaleQty = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.saleQty, 0),
    [filteredRows]
  );
  const totalSaleAmount = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.saleAmount, 0),
    [filteredRows]
  );
  const totalPurchaseQty = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.purchaseQty, 0),
    [filteredRows]
  );
  const totalPurchaseAmount = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.purchaseAmount, 0),
    [filteredRows]
  );

  // Format date for display "DD/MM/YYYY"
  const fmtDateDisplay = (ymd) => {
    if (!ymd) return "";
    const parts = ymd.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return ymd;
  };

  // Export to Excel
  const handleExportExcel = () => {
    const data = filteredRows.map((row, idx) => ({
      "#": idx + 1,
      "PARTY NAME": row.partyName,
      "SALE QUANTITY": row.saleQty,
      "SALE AMOUNT": row.saleAmount,
      "PURCHASE QUANTITY": row.purchaseQty,
      "PURCHASE AMOUNT": row.purchaseAmount,
    }));

    // Add totals row
    data.push({
      "#": "",
      "PARTY NAME": "Total:",
      "SALE QUANTITY": totalSaleQty,
      "SALE AMOUNT": totalSaleAmount,
      "PURCHASE QUANTITY": totalPurchaseQty,
      "PURCHASE AMOUNT": totalPurchaseAmount,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Party Report By Item");
    XLSX.writeFile(wb, "party-report-by-item.xlsx");
  };

  return (
    <div className="flex h-full flex-col bg-white overflow-hidden text-slate-800">
      {/* ── Top Filter Bar matching Screenshot ── */}
      <div className="border-b border-slate-200 px-6 py-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Period Dropdown (e.g. This Month) */}
            <div className="relative">
              <select
                value={period}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="appearance-none pr-8 bg-transparent text-base font-bold text-slate-900 outline-none cursor-pointer hover:text-blue-600 transition"
              >
                <option value="This Month">This Month</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="This Quarter">This Quarter</option>
                <option value="This Year">This Year</option>
                <option value="All Time">All Time</option>
              </select>
              <FiChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-slate-600" />
            </div>

            {/* Date Range Badge "Between 01/10/2026 To 31/10/2026" */}
            <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300 bg-white text-xs text-slate-700 shadow-sm">
              <span className="bg-slate-400 px-3 py-1.5 font-medium text-white">
                Between
              </span>
              <div className="flex items-center gap-1.5 px-3 py-1">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPeriod("Custom");
                    setFrom(e.target.value);
                  }}
                  className="bg-transparent font-medium text-slate-800 outline-none cursor-pointer"
                />
                <span className="text-slate-400">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPeriod("Custom");
                    setTo(e.target.value);
                  }}
                  className="bg-transparent font-medium text-slate-800 outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* All Firms Dropdown */}
            <div className="relative">
              <select
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400"
              >
                <option value="All Firms">All Firms</option>
              </select>
              <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-6 text-xs text-slate-600">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex flex-col items-center gap-1 hover:text-blue-600 transition"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-[10px] font-bold text-white shadow-sm">
                X
              </div>
              <span className="text-[11px] font-medium text-slate-700">Excel Report</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex flex-col items-center gap-1 hover:text-blue-600 transition"
            >
              <FiPrinter className="h-5 w-5 text-slate-600" />
              <span className="text-[11px] font-medium text-slate-700">Print</span>
            </button>
          </div>
        </div>

        {/* Second Row of Filters: All Categories & All Items */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Categories Dropdown */}
          <div className="relative min-w-[190px]">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400 focus:border-sky-500"
            >
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
          </div>

          {/* Items Dropdown */}
          <div className="relative min-w-[190px]">
            <select
              value={selectedItem}
              onChange={(e) => setSelectedItem(e.target.value)}
              className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400 focus:border-sky-500"
            >
              {itemsList.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
          </div>
        </div>
      </div>

      {/* ── Search Bar Area above Table ── */}
      <div className="px-6 pt-3 pb-2">
        <div className="relative w-80 max-w-full">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400 h-3.5 w-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=""
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-200"
          />
        </div>
      </div>

      {/* ── Data Table matching Screenshot ── */}
      <div className="flex-1 overflow-auto px-6 pb-2">
        <table className="w-full min-w-[850px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-600 shadow-sm">
            <tr>
              <th className="w-10 px-3 py-3">#</th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  PARTY NAME <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  SALE QUANTITY <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  SALE AMOUNT <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  PURCHASE QUANTITY <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  PURCHASE AMOUNT <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row, index) => {
              const isSelected = selectedRowIndex === index;
              return (
                <tr
                  key={row.partyName}
                  onClick={() => setSelectedRowIndex(index)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? "bg-sky-100/70" : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-3.5 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-3.5 font-medium text-slate-900">{row.partyName}</td>
                  <td className="px-3 py-3.5 text-right font-medium text-slate-800">
                    {row.saleQty}
                  </td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap font-medium text-slate-900">
                    {money(row.saleAmount)}
                  </td>
                  <td className="px-3 py-3.5 text-right font-medium text-slate-800">
                    {row.purchaseQty}
                  </td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap font-medium text-slate-900">
                    {money(row.purchaseAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div className="flex h-56 flex-col items-center justify-center text-center text-slate-400">
            <p className="text-sm font-semibold text-slate-600">No records found</p>
            <p className="mt-1 text-xs">Try selecting a different date range, category, or item filter.</p>
          </div>
        )}
      </div>

      {/* ── Total Summary Footer matching Screenshot ── */}
      <div className="border-t border-slate-200 bg-white px-6 py-3 text-xs">
        <div className="grid grid-cols-[1fr_120px_140px_140px_140px] items-center text-right font-bold text-slate-800">
          <div className="text-left font-bold text-slate-800 pl-8">Total:</div>
          <div className="pr-3">{totalSaleQty}</div>
          <div className="pr-3">{money(totalSaleAmount)}</div>
          <div className="pr-3">{totalPurchaseQty}</div>
          <div className="pr-3">{money(totalPurchaseAmount)}</div>
        </div>
      </div>
    </div>
  );
}
