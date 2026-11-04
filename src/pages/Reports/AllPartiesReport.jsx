import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiFilter,
  FiPrinter,
  FiSearch,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import { getParties } from "../../services/partiesStorage";
import { calculatePartyBalances } from "../../services/partyBalances";
import { readTransactionCollection, readTransactionValue, transactionStorageKeys } from "../../services/transactionRepository.js";

function readLocal(...keys) {
  for (const key of keys) {
    try { return readTransactionCollection(key); } catch {}
  }
  return [];
}

const money = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AllPartiesReport() {
  const navigate = useNavigate();

  // Filters
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => isoDate());
  const [partyTypeFilter, setPartyTypeFilter] = useState("All parties");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
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

  // Raw data from storage
  const storedParties = useMemo(() => getParties(), [refreshTrigger]);
  const sales = useMemo(() => readLocal(transactionStorageKeys.sales), [refreshTrigger]);
  const saleReturns = useMemo(() => readLocal("ledgerly:saleReturns.v1"), [refreshTrigger]);
  const purchases = useMemo(() => readLocal(transactionStorageKeys.purchases), [refreshTrigger]);
  const paymentIns = useMemo(() => readLocal(transactionStorageKeys.paymentIns), [refreshTrigger]);
  const paymentOuts = useMemo(() => readLocal(transactionStorageKeys.paymentOuts), [refreshTrigger]);
  const debitNotes = useMemo(() => readLocal("ledgerly:purchaseReturns.v1"), [refreshTrigger]);
  const saleUi = useMemo(() => { try { return readTransactionValue(transactionStorageKeys.saleInvoiceUi, {}); } catch { return {}; } }, [refreshTrigger]);

  // Balance calculation shared with the Parties page and dashboard.
  const consolidatedParties = useMemo(() => {
    const result = calculatePartyBalances({
      parties: [{ id: "cash-sale", partyName: "Cash Sale", openingBalance: 0, openingBalanceType: "to-receive" }, ...storedParties],
      sales,
      purchases,
      paymentIns,
      paymentOuts,
      creditNotes: saleReturns,
      debitNotes,
      saleUi,
      from: dateFilterActive ? from : "",
      to: dateFilterActive ? to : "",
    });
    return result.parties.map((party) => ({
      ...party,
      netBalance: party.net,
      receivableBalance: party.receivable > 0 ? party.receivable : null,
      payableBalance: party.payable > 0 ? party.payable : null,
    })).sort((a, b) => a.partyName.toLowerCase() === "cash sale" ? -1 : b.partyName.toLowerCase() === "cash sale" ? 1 : a.partyName.localeCompare(b.partyName));
  }, [storedParties, sales, purchases, saleReturns, paymentIns, paymentOuts, debitNotes, saleUi, dateFilterActive, from, to]);
  // Filtered rows based on party type and search query
  const filteredRows = useMemo(() => {
    return consolidatedParties.filter((p) => {
      // Party Type filter
      if (partyTypeFilter === "Receivable" && !(p.receivableBalance > 0)) return false;
      if (partyTypeFilter === "Payable" && !(p.payableBalance > 0)) return false;

      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${p.partyName} ${p.email} ${p.phone}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [consolidatedParties, partyTypeFilter, search]);

  // Overall totals
  const totalReceivable = useMemo(() => {
    return filteredRows.reduce((sum, p) => sum + (p.receivableBalance || 0), 0);
  }, [filteredRows]);

  const totalPayable = useMemo(() => {
    return filteredRows.reduce((sum, p) => sum + (p.payableBalance || 0), 0);
  }, [filteredRows]);

  // Checkbox selection
  const isAllSelected = filteredRows.length > 0 && selectedIds.size === filteredRows.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Export to Excel
  const handleExportExcel = () => {
    const data = filteredRows.map((row, idx) => ({
      "#": idx + 1,
      "PARTY NAME": row.partyName,
      EMAIL: row.email || "--",
      "PHONE NO.": row.phone || "--",
      "RECEIVABLE BALANCE": row.receivableBalance != null ? row.receivableBalance : "--",
      "PAYABLE BALANCE": row.payableBalance != null ? row.payableBalance : "--",
      "CREDIT LIMIT": row.creditLimit || "--",
    }));

    // Add totals row
    data.push({
      "#": "",
      "PARTY NAME": "Total",
      EMAIL: "",
      "PHONE NO.": "",
      "RECEIVABLE BALANCE": totalReceivable,
      "PAYABLE BALANCE": totalPayable,
      "CREDIT LIMIT": "",
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "All Parties");
    XLSX.writeFile(wb, "all-parties-report.xlsx");
  };

  return (
    <div className="flex h-full flex-col bg-white overflow-hidden text-slate-800">
      {/* ── Top Filter Bar matching Screenshot ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Date Filter Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={dateFilterActive}
              onChange={(e) => setDateFilterActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
            />
            <span>Date Filter</span>
          </label>

          {/* Date Picker (shown when Date Filter is checked) */}
          {dateFilterActive && (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
              <span className="text-slate-400 select-none">From</span>
              <input
                type="date"
                value={from}
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-transparent outline-none font-medium cursor-pointer"
              />
              <span className="text-slate-400 select-none">To</span>
              <input
                type="date"
                value={to}
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }}
                onChange={(e) => setTo(e.target.value)}
                className="bg-transparent outline-none font-medium cursor-pointer"
              />
            </div>
          )}

          {/* All parties Dropdown with subtle gold border */}
          <div className="relative">
            <select
              value={partyTypeFilter}
              onChange={(e) => setPartyTypeFilter(e.target.value)}
              className="appearance-none rounded-md border border-amber-400 bg-white px-4 py-1.5 pr-8 text-xs font-semibold text-slate-800 shadow-sm outline-none cursor-pointer focus:border-amber-500 focus:ring-1 focus:ring-amber-400"
            >
              <option value="All parties">All parties</option>
              <option value="Receivable">Receivable</option>
              <option value="Payable">Payable</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
              ▼
            </span>
          </div>
        </div>

        {/* Right Action Buttons matching screenshot */}
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

      {/* ── Search Bar Area above Table ── */}
      <div className="px-6 pt-3 pb-2">
        <div className="relative w-80 max-w-full">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400 h-3.5 w-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Party Name, Phone or Email..."
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-200"
          />
        </div>
      </div>

      {/* ── All Parties Table matching Screenshot ── */}
      <div className="flex-1 overflow-auto px-6 pb-2">
        <table className="w-full min-w-[950px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-600 shadow-sm">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
              </th>
              <th className="w-10 px-3 py-3">#</th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  PARTY NAME <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  EMAIL <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3">
                <span className="inline-flex items-center gap-1">
                  PHONE NO. <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  RECEIVABLE BA... <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  PAYABLE BALA... <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
              <th className="px-3 py-3 text-center">
                <span className="inline-flex items-center gap-1 justify-center">
                  CREDIT LIMIT <FiFilter className="text-[10px] text-slate-400" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((party, index) => {
              const isChecked = selectedIds.has(party.id);
              return (
                <tr
                  key={party.id}
                  onClick={() => navigate("/parties/party-details", { state: { partyId: party.id } })}
                  className={`cursor-pointer transition-colors ${
                    isChecked ? "bg-sky-50/80" : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-3.5" onClick={(e) => toggleSelectRow(party.id, e)}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => toggleSelectRow(party.id, e)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-3.5 font-medium text-slate-900">{party.partyName}</td>
                  <td className="px-3 py-3.5 text-slate-500">{party.email || "--"}</td>
                  <td className="px-3 py-3.5 text-slate-600">{party.phone || "--"}</td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap">
                    {party.receivableBalance != null ? (
                      <span className="font-semibold text-teal-600">
                        {money(party.receivableBalance)}
                      </span>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap">
                    {party.payableBalance != null ? (
                      <span className="font-semibold text-rose-500">
                        {money(party.payableBalance)}
                      </span>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-center text-slate-400">
                    {party.creditLimit ? money(party.creditLimit) : "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div className="flex h-56 flex-col items-center justify-center text-center text-slate-400">
            <p className="text-sm font-semibold text-slate-600">No parties found</p>
            <p className="mt-1 text-xs">Try selecting a different filter or search query.</p>
          </div>
        )}
      </div>

      {/* ── Footer Summary Bar matching Screenshot ── */}
      <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-white px-6 py-3.5 text-xs">
        <div className="font-medium text-slate-700">
          Total Receivable:{" "}
          <span className="font-bold text-teal-600">{money(totalReceivable)}</span>
        </div>
        <div className="font-medium text-slate-700">
          Total Payable:{" "}
          <span className="font-bold text-rose-500">{money(totalPayable)}</span>
        </div>
      </div>
    </div>
  );
}

