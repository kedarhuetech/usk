import React, { useMemo, useState } from "react";
import {
  FiCalendar,
  FiChevronDown,
  FiFilter,
  FiMoreVertical,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiX,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import { getInventoryItems } from "../../services/itemsStorage";
import { getParties, saveParty } from "../../services/partiesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";

const STORAGE_KEY = "ledgerly:purchaseReturns.v1";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDisplayDate = (val) => {
  if (!val) return "—";
  const [y, m, d] = val.split("-");
  return `${d}/${m}/${y}`;
};

const money = (value) =>
  `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const freshRow = () => ({
  id: crypto.randomUUID(),
  item: "",
  description: "",
  qty: "",
  unit: "NONE",
  price: "",
  discount: "",
  tax: "NONE",
});

function readReturns() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const rowAmount = (row) => {
  const gross = (Number(row.qty) || 0) * (Number(row.price) || 0);
  const net = Math.max(0, gross - (gross * (Number(row.discount) || 0)) / 100);
  return net + (net * (Number(row.tax) || 0)) / 100;
};

export default function PurchaseReturns() {
  const [records, setRecords] = useState(readReturns);
  const [editor, setEditor] = useState(null);
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState("");
  const [openItemRow, setOpenItemRow] = useState("");

  // Filter state matching screenshot
  const [datePreset, setDatePreset] = useState("This Month");
  const [fromDate, setFromDate] = useState(() => `${today().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(today);
  const [firmFilter, setFirmFilter] = useState("ALL FIRMS");
  const [userFilter, setUserFilter] = useState("ALL USERS");
  const [recordType, setRecordType] = useState("Debit Note");
  const [paymentFilter, setPaymentFilter] = useState("All Payment");

  const parties = useMemo(() => getParties(), []);
  const bills = useMemo(() => getPurchaseBills(), []);
  const items = useMemo(
    () => getInventoryItems().filter((item) => item.type !== "service"),
    []
  );

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const matchType = (record.type || "Debit Note") === recordType;
      const matchDate =
        (!fromDate || record.date >= fromDate) &&
        (!toDate || record.date <= toDate);
      const isPaid = (record.balance || 0) <= 0 && (record.total || 0) > 0;
      const matchPayment =
        paymentFilter === "All Payment" ||
        (paymentFilter === "Paid" ? isPaid : !isPaid);
      const text = `${record.party || ""} ${record.refNo || ""} ${
        record.billNumber || ""
      } ${record.category || ""}`.toLowerCase();
      const matchSearch = text.includes(search.toLowerCase().trim());
      return matchType && matchDate && matchPayment && matchSearch;
    });
  }, [records, recordType, fromDate, toDate, paymentFilter, search]);

  const totalAmount = useMemo(
    () => filtered.reduce((acc, row) => acc + (Number(row.total) || 0), 0),
    [filtered]
  );
  const totalBalance = useMemo(
    () => filtered.reduce((acc, row) => acc + (Number(row.balance) || 0), 0),
    [filtered]
  );

  const persist = (next) => {
    setRecords(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const startNew = () => {
    const nextRef = String(
      Math.max(0, ...records.map((r) => Number(r.refNo) || 0)) + 1
    );
    setEditor({
      mode: "new",
      value: {
        id: "",
        refNo: nextRef,
        type: recordType,
        party: "",
        phone: "",
        billNumber: "",
        billDate: "",
        category: "General",
        date: today(),
        state: "Select",
        rows: [freshRow(), freshRow()],
        paymentType: "Cash",
        received: "",
        description: "",
      },
    });
  };

  const change = (key, value) =>
    setEditor((current) => ({
      ...current,
      value: { ...current.value, [key]: value },
    }));

  const changeRow = (id, key, value) =>
    setEditor((current) => ({
      ...current,
      value: {
        ...current.value,
        rows: current.value.rows.map((row) =>
          row.id === id ? { ...row, [key]: value } : row
        ),
      },
    }));

  const save = () => {
    const value = editor.value;
    if (!value.party.trim()) {
      window.alert("Please enter or select a Party Name.");
      return;
    }
    const total = value.rows.reduce((sum, row) => sum + rowAmount(row), 0);
    const receivedVal = Number(value.received || 0);
    const balanceVal = Math.max(0, total - receivedVal);
    const saved = {
      ...value,
      id: value.id || crypto.randomUUID(),
      total,
      received: receivedVal,
      balance: balanceVal,
      status: balanceVal <= 0 && total > 0 ? "Paid" : "Unpaid",
      updatedAt: new Date().toISOString(),
    };

    persist(
      editor.mode === "edit"
        ? records.map((r) => (r.id === saved.id ? saved : r))
        : [saved, ...records]
    );
    setEditor(null);
  };

  const printRecord = (record) => {
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;
    const esc = (t) =>
      String(t ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          }[c])
      );
    popup.document.write(`
      <title>${esc(record.type)} ${esc(record.refNo)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #333; }
        h1 { text-align: center; margin-bottom: 8px; }
        .meta { margin-bottom: 24px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f4f5f8; }
        .total-box { text-align: right; margin-top: 24px; font-size: 16px; }
        @media print { button { display: none; } }
      </style>
      <h1>${esc(record.type)}</h1>
      <div class="meta">
        <p><strong>Ref No:</strong> ${esc(record.refNo)} &nbsp;|&nbsp; <strong>Date:</strong> ${formatDisplayDate(record.date)}</p>
        <p><strong>Party:</strong> ${esc(record.party)} &nbsp;|&nbsp; <strong>Bill No:</strong> ${esc(record.billNumber || "—")}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Item</th><th>Qty</th><th>Unit</th><th>Price</th><th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${(record.rows || [])
            .map(
              (r) => `
            <tr>
              <td>${esc(r.item)}</td>
              <td>${esc(r.qty)}</td>
              <td>${esc(r.unit)}</td>
              <td>${money(r.price)}</td>
              <td>${money(rowAmount(r))}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div class="total-box">
        <p>Total: <strong>${money(record.total)}</strong></p>
        <p>Received / Adjusted: ${money(record.received)}</p>
        <p>Balance: <strong>${money(record.balance)}</strong></p>
      </div>
      <button style="margin-top:20px;padding:8px 16px;cursor:pointer" onclick="window.print()">Print / Save PDF</button>
    `);
    popup.document.close();
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const data = filtered.map((record) => ({
      Date: formatDisplayDate(record.date),
      "Ref No.": record.refNo,
      "Party Name": record.party,
      Category: record.category || "General",
      Type: record.type,
      Total: record.total,
      Received: record.received,
      Balance: record.balance,
      Status: record.status,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Debit Notes");
    XLSX.writeFile(workbook, `Debit_Notes_${today()}.xlsx`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f5f8] text-slate-800 text-xs select-none">
      {/* ================= 1. TOP FILTER BAR ================= */}
      <div className="bg-white px-4 py-3 border-b border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Period dropdown */}
          <div className="relative">
            <select
              value={datePreset}
              onChange={(e) => {
                const val = e.target.value;
                setDatePreset(val);
                if (val === "This Month") {
                  setFromDate(`${today().slice(0, 7)}-01`);
                  setToDate(today());
                } else if (val === "Today") {
                  setFromDate(today());
                  setToDate(today());
                } else if (val === "All Time") {
                  setFromDate("");
                  setToDate("");
                }
              }}
              className="appearance-none bg-transparent pr-5 py-1 text-sm font-bold text-gray-800 cursor-pointer focus:outline-none"
            >
              <option value="This Month">This Month</option>
              <option value="Today">Today</option>
              <option value="All Time">All Time</option>
            </select>
            <FiChevronDown className="absolute right-0 top-2 pointer-events-none text-gray-600 text-xs" />
          </div>

          {/* Date range picker */}
          <div className="flex items-center border border-gray-300 rounded overflow-hidden text-xs bg-white h-[30px]">
            <span className="bg-[#9da8b6] text-white px-2.5 h-full flex items-center text-[11px] font-medium">
              Between
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset("Custom");
              }}
              className="px-2 text-center text-gray-700 outline-none text-xs w-28 h-full"
            />
            <span className="px-1.5 text-gray-500 text-[11px]">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset("Custom");
              }}
              className="px-2 text-center text-gray-700 outline-none text-xs w-28 h-full"
            />
          </div>

          {/* ALL FIRMS dropdown */}
          <div className="relative">
            <select
              value={firmFilter}
              onChange={(e) => setFirmFilter(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-7 text-xs font-medium text-gray-700 cursor-pointer focus:outline-none focus:border-blue-500 h-[30px]"
            >
              <option value="ALL FIRMS">ALL FIRMS</option>
              <option value="Sai Kirana Stores">Sai Kirana Stores</option>
            </select>
            <FiChevronDown className="absolute right-2 top-2.5 pointer-events-none text-gray-500 text-xs" />
          </div>

          {/* ALL USERS dropdown */}
          <div className="relative">
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-7 text-xs font-medium text-gray-700 cursor-pointer focus:outline-none focus:border-blue-500 h-[30px]"
            >
              <option value="ALL USERS">ALL USERS</option>
              <option value="Admin">Admin</option>
            </select>
            <FiChevronDown className="absolute right-2 top-2.5 pointer-events-none text-gray-500 text-xs" />
          </div>
        </div>

        {/* Action icons on right */}
        <div className="flex items-center gap-4">
          <button
            onClick={exportExcel}
            className="flex flex-col items-center text-gray-600 hover:text-green-700 transition cursor-pointer"
            title="Excel Report"
          >
            <div className="text-[#107c41] font-bold text-lg leading-none">▦</div>
            <span className="text-[10px] text-gray-600 font-medium mt-0.5">Excel Report</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex flex-col items-center text-gray-600 hover:text-blue-600 transition cursor-pointer"
            title="Print"
          >
            <FiPrinter className="text-lg text-gray-700" />
            <span className="text-[10px] text-gray-600 font-medium mt-0.5">Print</span>
          </button>
        </div>
      </div>

      {/* ================= 2. SUB-FILTERS ROW ================= */}
      <div className="bg-white px-4 py-2 border-b border-gray-200 flex items-center gap-3 shrink-0">
        <div className="relative">
          <select
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded px-3 py-1 pr-7 text-xs text-gray-700 cursor-pointer focus:outline-none focus:border-blue-500 min-w-[140px] h-[30px]"
          >
            <option value="Debit Note">Debit Note</option>
            <option value="Purchase Return">Purchase Return</option>
          </select>
          <FiChevronDown className="absolute right-2 top-2.5 pointer-events-none text-gray-500 text-xs" />
        </div>

        <div className="relative">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded px-3 py-1 pr-7 text-xs text-gray-700 cursor-pointer focus:outline-none focus:border-blue-500 min-w-[140px] h-[30px]"
          >
            <option value="All Payment">All Payment</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
          <FiChevronDown className="absolute right-2 top-2.5 pointer-events-none text-gray-500 text-xs" />
        </div>
      </div>

      {/* ================= 3. SEARCH & ADD BUTTON ROW ================= */}
      <div className="bg-white px-4 py-2 flex items-center justify-between border-b border-gray-200 shrink-0">
        <div className="relative w-64">
          <FiSearch className="absolute left-2.5 top-2.5 text-gray-400 text-xs" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=""
            className="w-full pl-8 pr-3 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500 h-[30px]"
          />
        </div>

        <button
          onClick={startNew}
          className="flex items-center gap-1.5 bg-[#0078d4] hover:bg-[#006abc] text-white font-medium px-4 py-1.5 rounded-full text-xs transition shadow-xs cursor-pointer"
        >
          <FiPlus className="text-sm stroke-[3]" />
          <span>Add Debit Note</span>
        </button>
      </div>

      {/* ================= 4. TABLE & EMPTY STATE ================= */}
      <div className="flex-1 min-h-0 overflow-auto bg-white flex flex-col justify-between">
        <div>
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 bg-white text-gray-600 text-[11px] font-semibold">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>DATE</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>REF NO.</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>PARTY NAME</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>CATEGOR...</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>TYPE</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>TOTAL</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>RECEIV...</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>BALANCE</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span>STATUS</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center">PRINT /...</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  className="border-b border-gray-100 hover:bg-blue-50 text-xs"
                >
                  <td className="py-2.5 px-3 text-center text-gray-500">{idx + 1}</td>
                  <td className="py-2.5 px-2">{formatDisplayDate(item.date)}</td>
                  <td className="py-2.5 px-2">{item.refNo}</td>
                  <td className="py-2.5 px-2 font-medium text-gray-900">{item.party}</td>
                  <td className="py-2.5 px-2 text-gray-600">{item.category || "General"}</td>
                  <td className="py-2.5 px-2 text-gray-600">{item.type || "Debit Note"}</td>
                  <td className="py-2.5 px-2 text-right font-medium">{money(item.total)}</td>
                  <td className="py-2.5 px-2 text-right text-gray-600">{money(item.received)}</td>
                  <td className="py-2.5 px-2 text-right text-gray-600">{money(item.balance)}</td>
                  <td className="py-2.5 px-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        item.status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {item.status || "Unpaid"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center relative">
                    <button
                      onClick={() => printRecord(item)}
                      className="text-gray-500 hover:text-blue-600 mr-2"
                      title="Print"
                    >
                      <FiPrinter />
                    </button>
                    <button
                      onClick={() => setMenuId(menuId === item.id ? "" : item.id)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <FiMoreVertical />
                    </button>
                    {menuId === item.id && (
                      <div className="absolute right-3 top-8 z-30 w-36 rounded bg-white p-1 shadow-lg border border-gray-200 text-left">
                        <button
                          onClick={() => {
                            setMenuId("");
                            setEditor({ mode: "edit", value: item });
                          }}
                          className="block w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 text-left"
                        >
                          View / Edit
                        </button>
                        <button
                          onClick={() => {
                            setMenuId("");
                            if (window.confirm("Delete this debit note?")) {
                              persist(records.filter((r) => r.id !== item.id));
                            }
                          }}
                          className="block w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 text-left"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Screenshot-exact empty state */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-24 pb-20 select-none">
              {/* Overlapping document illustration */}
              <div className="relative w-28 h-28 mb-3 flex items-center justify-center">
                {/* Back page (angled slightly left) */}
                <div
                  className="absolute w-20 h-24 bg-white border border-gray-300 rounded shadow-xs flex flex-col p-2 space-y-1.5"
                  style={{ transform: "rotate(-10deg) translate(-10px, 4px)" }}
                >
                  <div className="w-8 h-1 bg-gray-200 rounded"></div>
                  <div className="w-14 h-1 bg-gray-200 rounded"></div>
                  <div className="w-11 h-1 bg-gray-200 rounded"></div>
                  <div className="w-13 h-1 bg-gray-200 rounded"></div>
                </div>

                {/* Front page */}
                <div className="relative w-20 h-24 bg-white border border-gray-300 rounded shadow-xs flex flex-col p-2 space-y-1.5 z-10">
                  <div className="w-10 h-1.5 bg-gray-300 rounded mb-1"></div>
                  <div className="w-14 h-1 bg-gray-200 rounded"></div>
                  <div className="w-12 h-1 bg-gray-200 rounded"></div>
                  <div className="w-14 h-1 bg-gray-200 rounded"></div>
                  <div className="w-9 h-1 bg-gray-200 rounded"></div>
                  <div className="mt-auto self-end w-2.5 h-2.5 bg-[#0078d4] rounded-xs"></div>
                </div>
              </div>

              {/* Exact text from screenshot */}
              <h3 className="text-gray-500 font-medium text-xs mt-2 text-center">
                No data is available for Debit Note.
              </h3>
              <p className="text-gray-400 text-[11px] mt-0.5 text-center">
                Please try again after making relevant changes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ================= 5. BOTTOM STATUS / TOTALS FOOTER ================= */}
      <div className="bg-white border-t border-gray-300 px-5 py-2.5 flex items-center justify-between text-xs font-semibold shrink-0">
        <div className="text-gray-700">
          Total Amount:{" "}
          <span className="text-[#107c41] font-bold">
            ₹ {totalAmount.toFixed(2)}
          </span>
        </div>
        <div className="text-gray-700">
          Balance:{" "}
          <span className="font-bold text-gray-800">
            ₹ {totalBalance.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ================= ADD / EDIT DEBIT NOTE MODAL ================= */}
      {editor && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex h-12 shrink-0 items-center justify-between bg-slate-200 px-5">
            <span className="rounded-t-lg bg-white px-5 py-3 font-semibold text-sm">
              {editor.value.type} #{editor.value.refNo}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEditor(null)}
                className="text-gray-600 hover:text-black p-1 text-lg"
              >
                <FiX />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-auto flex-1 bg-[#f8fafc]">
            <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-5">
              <h2 className="text-lg font-bold text-gray-800 border-b pb-2">
                {editor.mode === "edit" ? "Edit" : "New"} {editor.value.type}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Party Name *
                  </label>
                  <input
                    list="debit-parties"
                    value={editor.value.party}
                    onChange={(e) => {
                      const selected = parties.find(
                        (p) => p.partyName === e.target.value
                      );
                      change("party", e.target.value);
                      if (selected?.phone) change("phone", selected.phone);
                    }}
                    placeholder="Search or enter party"
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                  <datalist id="debit-parties">
                    {parties.map((p) => (
                      <option key={p.id} value={p.partyName}>
                        {p.phone}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Ref No.
                  </label>
                  <input
                    type="text"
                    value={editor.value.refNo}
                    onChange={(e) => change("refNo", e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={editor.value.date}
                    onChange={(e) => change("date", e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Original Bill No. (Optional)
                  </label>
                  <select
                    value={editor.value.billNumber}
                    onChange={(e) => {
                      const b = bills.find(
                        (item) =>
                          (item.form?.invoiceNumber || item.invoiceNumber) ===
                          e.target.value
                      );
                      change("billNumber", e.target.value);
                      if (b?.form?.customer || b?.partyName) {
                        change("party", b.form?.customer || b.partyName);
                      }
                    }}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  >
                    <option value="">Select Purchase Bill</option>
                    {bills.map((b) => (
                      <option
                        key={b.id}
                        value={b.form?.invoiceNumber || b.invoiceNumber || ""}
                      >
                        Bill #{b.form?.invoiceNumber || b.invoiceNumber} -{" "}
                        {b.form?.customer || b.partyName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={editor.value.category}
                    onChange={(e) => change("category", e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Items table in modal */}
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-2 text-left w-8">#</th>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-center w-20">Qty</th>
                      <th className="p-2 text-center w-20">Unit</th>
                      <th className="p-2 text-right w-24">Price</th>
                      <th className="p-2 text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editor.value.rows.map((row, i) => (
                      <tr key={row.id} className="border-b">
                        <td className="p-2 text-center text-gray-500">{i + 1}</td>
                        <td className="p-2 relative">
                          <input
                            type="text"
                            value={row.item}
                            onFocus={() => setOpenItemRow(row.id)}
                            onChange={(e) => {
                              changeRow(row.id, "item", e.target.value);
                              setOpenItemRow(row.id);
                            }}
                            placeholder="Enter or select item"
                            className="w-full border rounded px-2 py-1 text-xs"
                          />
                          {openItemRow === row.id && (
                            <div className="absolute left-2 top-full z-40 max-h-48 w-64 overflow-auto rounded border bg-white shadow-lg">
                              {items
                                .filter((it) =>
                                  String(it.itemName || it.name || "")
                                    .toLowerCase()
                                    .includes(row.item.toLowerCase())
                                )
                                .map((it) => (
                                  <button
                                    type="button"
                                    key={it.id}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      changeRow(
                                        row.id,
                                        "item",
                                        it.itemName || it.name
                                      );
                                      changeRow(
                                        row.id,
                                        "price",
                                        it.purchasePrice || it.price || ""
                                      );
                                      changeRow(
                                        row.id,
                                        "unit",
                                        it.unit || it.baseUnit || "NONE"
                                      );
                                      if (!row.qty) changeRow(row.id, "qty", "1");
                                      setOpenItemRow("");
                                    }}
                                    className="block w-full px-3 py-1.5 text-left hover:bg-blue-50 text-xs"
                                  >
                                    {it.itemName || it.name}
                                  </button>
                                ))}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={row.qty}
                            onChange={(e) => changeRow(row.id, "qty", e.target.value)}
                            className="w-full border rounded px-2 py-1 text-center text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.unit}
                            onChange={(e) => changeRow(row.id, "unit", e.target.value)}
                            className="w-full border rounded px-2 py-1 text-center text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={row.price}
                            onChange={(e) => changeRow(row.id, "price", e.target.value)}
                            className="w-full border rounded px-2 py-1 text-right text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-medium">
                          {money(rowAmount(row))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() =>
                    change("rows", [...editor.value.rows, freshRow()])
                  }
                  className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded text-xs"
                >
                  + Add Row
                </button>
                <div className="text-right text-sm font-semibold">
                  Total:{" "}
                  {money(
                    editor.value.rows.reduce(
                      (sum, r) => sum + rowAmount(r),
                      0
                    )
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  className="px-4 py-2 border rounded text-xs text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="px-5 py-2 bg-[#0078d4] text-white rounded text-xs font-medium hover:bg-[#006abc]"
                >
                  Save Debit Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

