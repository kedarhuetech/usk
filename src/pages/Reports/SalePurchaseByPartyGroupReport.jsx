import React, { useMemo, useState, useEffect } from "react";
import {
  FiChevronDown,
  FiFilter,
  FiPrinter,
  FiSearch,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import { getParties } from "../../services/partiesStorage";

function readLocal(...keys) {
  for (const key of keys) {
    try {
      const val = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (Array.isArray(val) && val.length > 0) return val;
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

export default function SalePurchaseByPartyGroupReport() {
  const [period, setPeriod] = useState("This Month");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [firm, setFirm] = useState("ALL FIRMS");
  const [search, setSearch] = useState("");
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
    } else if (val === "Today") {
      const today = isoDate(d);
      setFrom(today);
      setTo(today);
    } else if (val === "Yesterday") {
      const y = new Date(d);
      y.setDate(y.getDate() - 1);
      const yDate = isoDate(y);
      setFrom(yDate);
      setTo(yDate);
    } else if (val === "This Week") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      setFrom(isoDate(monday));
      setTo(isoDate(new Date()));
    } else if (val === "Last 30 Days") {
      const prev = new Date();
      prev.setDate(prev.getDate() - 30);
      setFrom(isoDate(prev));
      setTo(isoDate(new Date()));
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
      setFrom("2000-01-01");
      setTo("2099-12-31");
    }
  };

  // Raw data
  const sales = useMemo(
    () => readLocal("ledgerly:saleInvoices.v1", "ledgerly:sales.v1"),
    [refreshTrigger]
  );
  const purchases = useMemo(
    () => readLocal("ledgerly:purchaseBills.v1", "ledgerly:purchases.v1"),
    [refreshTrigger]
  );
  const parties = useMemo(() => {
    try {
      return getParties() || [];
    } catch {
      return [];
    }
  }, [refreshTrigger]);

  // Build a party name → group map from saved parties
  const partyGroupMap = useMemo(() => {
    const map = new Map();
    parties.forEach((p) => {
      const name = (p.partyName || "").trim();
      if (name) {
        map.set(name.toLowerCase(), p.group || "General");
      }
    });
    return map;
  }, [parties]);

  // Aggregate sale and purchase totals by GROUP
  const rows = useMemo(() => {
    const groupMap = new Map();

    const getGroupObj = (groupName) => {
      const key = (groupName || "General").trim();
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          groupName: key,
          saleAmount: 0,
          purchaseAmount: 0,
        });
      }
      return groupMap.get(key);
    };

    // Process Sales — look up party group from parties storage
    sales.forEach((s) => {
      if (s.cancelled || s.status === "Cancelled") return;
      const dateYmd = parseYMD(
        s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt
      );
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;

      const pName = (
        s.form?.customer || s.customer || s.partyName || s.party || "Cash Sale"
      ).trim();
      const group = partyGroupMap.get(pName.toLowerCase()) || "General";
      const obj = getGroupObj(group);

      const amount = Number(
        s.totals?.finalTotal ??
          s.totals?.grandTotal ??
          s.totalAmount ??
          s.total ??
          s.form?.grandTotal ??
          0
      );
      obj.saleAmount += amount;
    });

    // Process Purchases
    purchases.forEach((p) => {
      if (p.cancelled || p.status === "Cancelled") return;
      const dateYmd = parseYMD(
        p.form?.invoiceDate ||
          p.form?.billDate ||
          p.invoiceDate ||
          p.billDate ||
          p.date ||
          p.createdAt
      );
      if (from && dateYmd && dateYmd < from) return;
      if (to && dateYmd && dateYmd > to) return;

      const pName = (
        p.form?.customer || p.supplier || p.partyName || p.party || "Supplier"
      ).trim();
      const group = partyGroupMap.get(pName.toLowerCase()) || "General";
      const obj = getGroupObj(group);

      const amount = Number(
        p.totals?.finalTotal ??
          p.totals?.grandTotal ??
          p.totalAmount ??
          p.total ??
          p.form?.grandTotal ??
          0
      );
      obj.purchaseAmount += amount;
    });

    let list = Array.from(groupMap.values()).filter(
      (item) => item.saleAmount > 0 || item.purchaseAmount > 0
    );

    // Apply search
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter((r) => r.groupName.toLowerCase().includes(query));
    }

    return list;
  }, [sales, purchases, partyGroupMap, from, to, search]);

  const totalSaleAmount = useMemo(
    () => rows.reduce((acc, r) => acc + (r.saleAmount || 0), 0),
    [rows]
  );
  const totalPurchaseAmount = useMemo(
    () => rows.reduce((acc, r) => acc + (r.purchaseAmount || 0), 0),
    [rows]
  );

  const handleExportExcel = () => {
    const data = [
      ["GROUP NAME", "SALE AMOUNT", "PURCHASE AMOUNT"],
      ...rows.map((r) => [r.groupName, r.saleAmount || 0, r.purchaseAmount || 0]),
      ["Total", totalSaleAmount, totalPurchaseAmount],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sale Purchase By Party Group");
    XLSX.writeFile(wb, `Sale_Purchase_By_Party_Group_${from}_to_${to}.xlsx`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 text-slate-800">
      {/* ── Top Filters ── */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Period Dropdown */}
            <div className="relative">
              <select
                value={period}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="appearance-none pr-8 bg-transparent text-base font-bold text-slate-900 outline-none cursor-pointer hover:text-blue-600 transition"
              >
                <option value="This Month">This Month</option>
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">This Week</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="This Quarter">This Quarter</option>
                <option value="This Year">This Year</option>
                <option value="All Time">All Time</option>
                <option value="Custom">Custom</option>
              </select>
              <FiChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-slate-600" />
            </div>

            {/* Date Range */}
            <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300 bg-white text-xs text-slate-700 shadow-sm">
              <span className="bg-slate-400 px-3 py-1.5 font-medium text-white">
                Between
              </span>
              <div className="flex items-center gap-1.5 px-3 py-1">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => { setPeriod("Custom"); setFrom(e.target.value); }}
                  className="bg-transparent font-medium text-slate-800 outline-none cursor-pointer"
                />
                <span className="text-slate-400">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => { setPeriod("Custom"); setTo(e.target.value); }}
                  className="bg-transparent font-medium text-slate-800 outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* All Firms */}
            <div className="relative">
              <select
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-400"
              >
                <option value="ALL FIRMS">ALL FIRMS</option>
              </select>
              <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
            </div>
          </div>

          {/* Excel & Print buttons */}
          <div className="flex items-center gap-6 text-xs text-slate-600">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex flex-col items-center gap-1 hover:text-blue-600 transition"
              title="Export Excel Report"
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
              title="Print Report"
            >
              <FiPrinter className="h-5 w-5 text-slate-600" />
              <span className="text-[11px] font-medium text-slate-700">Print</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Title + Search bar row ── */}
      <div className="flex items-center justify-between bg-white px-6 py-3 border-b border-slate-100">
        <h2 className="text-sm font-bold tracking-wider text-slate-700 uppercase">
          SALE PURCHASE BY PARTY GROUP
        </h2>
        <div className="relative">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Search group..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-6 py-3">
                <div className="flex items-center justify-between">
                  <span>GROUP NAME</span>
                  <FiFilter className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs" />
                </div>
              </th>
              <th className="px-8 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span>SALE AMOUNT</span>
                  <FiFilter className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs" />
                </div>
              </th>
              <th className="px-8 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span>PURCHASE AMOUNT</span>
                  <FiFilter className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-16 text-center text-slate-400">
                  No group transactions found for the selected period.
                  <div className="mt-2 text-xs text-slate-400">
                    Assign a <span className="font-semibold text-sky-600">Party Group</span> when adding or editing a party.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const isSelected = selectedRowIndex === index;
                return (
                  <tr
                    key={row.groupName + index}
                    onClick={() => setSelectedRowIndex(index)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-sky-100/70 text-slate-900 font-medium"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-6 py-3 font-medium text-slate-800">
                      {row.groupName}
                    </td>
                    <td className="px-8 py-3 text-right font-medium">
                      {row.saleAmount > 0 ? (
                        <span className="text-emerald-600">{money(row.saleAmount)}</span>
                      ) : (
                        <span className="text-slate-800">{money(0)}</span>
                      )}
                    </td>
                    <td className="px-8 py-3 text-right font-medium">
                      {row.purchaseAmount > 0 ? (
                        <span className="text-rose-600">{money(row.purchaseAmount)}</span>
                      ) : (
                        <span className="text-slate-800">{money(0)}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer Summary ── */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3 text-xs font-medium text-slate-700 shadow-sm">
        <div className="flex items-center gap-2">
          <span>Total Sale Amount:</span>
          <span className="text-emerald-600 font-bold">{money(totalSaleAmount)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Total Purchase Amount:</span>
          <span className="text-rose-600 font-bold">{money(totalPurchaseAmount)}</span>
        </div>
      </div>
    </div>
  );
}
