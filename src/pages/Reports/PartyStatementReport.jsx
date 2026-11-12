import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiCalendar,
  FiChevronDown,
  FiDownload,
  FiFileText,
  FiFilter,
  FiMail,
  FiMapPin,
  FiPhone,
  FiPrinter,
  FiSearch,
  FiUser,
  FiX,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import { getParties } from "../../services/partiesStorage.js";
import {
  readTransactionCollection,
  readTransactionValue,
  transactionStorageKeys,
} from "../../services/transactionRepository.js";
import {
  generatePartyStatement,
  formatDateDMY,
  formatMoney,
  formatRunningBalance,
  getDateRangeForPeriod,
  parseYMD,
} from "../../services/partyStatementService.js";
import {
  buildUnifiedStatementHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";

function readLocal(...keys) {
  for (const key of keys) {
    try {
      const val = readTransactionCollection(key);
      if (Array.isArray(val) && val.length > 0) return val;
    } catch {}
  }
  return [];
}

export default function PartyStatementReport() {
  const navigate = useNavigate();
  const location = useLocation();

  // Refresh trigger for business data changes
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

  // Raw parties & transaction stores
  const storedParties = useMemo(() => getParties(), [refreshTrigger]);
  const sales = useMemo(() => readLocal(transactionStorageKeys.sales), [refreshTrigger]);
  const purchases = useMemo(() => readLocal(transactionStorageKeys.purchases), [refreshTrigger]);
  const paymentIns = useMemo(() => readLocal(transactionStorageKeys.paymentIns), [refreshTrigger]);
  const paymentOuts = useMemo(() => readLocal(transactionStorageKeys.paymentOuts), [refreshTrigger]);
  const creditNotes = useMemo(() => readLocal("ledgerly:saleReturns.v1"), [refreshTrigger]);
  const debitNotes = useMemo(
    () => readLocal("ledgerly:purchaseReturns.v1", "ledgerly:purchaseReturnsDebitNotes.v1"),
    [refreshTrigger]
  );
  const saleUi = useMemo(() => {
    try {
      return readTransactionValue(transactionStorageKeys.saleInvoiceUi, {});
    } catch {
      return {};
    }
  }, [refreshTrigger]);

  // Selected party state (supports initial party passed in location.state)
  const initialPartyId = location.state?.partyId || "";
  const [selectedPartyId, setSelectedPartyId] = useState(initialPartyId);

  // Party search / dropdown state
  const [partySearchQuery, setPartySearchQuery] = useState("");
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Date filters
  const [period, setPeriod] = useState("This Month");
  const initialRange = useMemo(() => getDateRangeForPeriod("This Month"), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setPartyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle period change
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === "Custom") return;
    const range = getDateRangeForPeriod(newPeriod);
    setFrom(range.from);
    setTo(range.to);
  };

  // Find currently selected party
  const selectedParty = useMemo(() => {
    if (!selectedPartyId) return null;
    return storedParties.find((p) => String(p.id) === String(selectedPartyId)) || null;
  }, [storedParties, selectedPartyId]);

  // Filter parties for search dropdown
  const filteredPartyOptions = useMemo(() => {
    const q = partySearchQuery.trim().toLowerCase();
    if (!q) return storedParties;
    return storedParties.filter(
      (p) =>
        String(p.partyName || "").toLowerCase().includes(q) ||
        String(p.phone || "").includes(q) ||
        String(p.email || "").toLowerCase().includes(q) ||
        String(p.gstin || "").toLowerCase().includes(q)
    );
  }, [storedParties, partySearchQuery]);

  // Calculate party statement using dedicated calculation service
  const statement = useMemo(() => {
    if (!selectedParty) return null;
    return generatePartyStatement({
      party: selectedParty,
      sales,
      purchases,
      paymentIns,
      paymentOuts,
      creditNotes,
      debitNotes,
      saleUi,
      from,
      to,
    });
  }, [selectedParty, sales, purchases, paymentIns, paymentOuts, creditNotes, debitNotes, saleUi, from, to]);

  // Handle clicking a transaction row to view/edit
  const handleRowClick = (txn) => {
    if (!txn?.raw) return;
    const t = txn.type;
    if (t === "Sale") {
      navigate("/sales/sale-invoices/new", { state: { editInvoice: txn.raw } });
    } else if (t === "Purchase") {
      navigate("/purchase-expense/purchase-bills/new", {
        state: { editPurchase: txn.raw, editBill: txn.raw, editInvoice: txn.raw },
      });
    } else if (t === "Payment-In") {
      navigate("/sales/payment-in", { state: { editPayment: txn.raw } });
    } else if (t === "Payment-Out") {
      navigate("/purchase-expense/payment-out", { state: { editPayment: txn.raw } });
    } else if (t === "Credit Note") {
      navigate("/sales/sale-return/new", { state: { editInvoice: txn.raw, editReturn: txn.raw } });
    } else if (t === "Debit Note") {
      navigate("/purchase-expense/purchase-return/new", { state: { editBill: txn.raw, editReturn: txn.raw } });
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!statement || !selectedParty) return;

    const data = [
      { "#": "PARTY NAME", Date: selectedParty.partyName, "Txn Type": "", "Ref No.": "", "Payment Type": "", Debit: "", Credit: "", "Running Balance": "" },
      { "#": "PHONE", Date: selectedParty.phone || "—", "Txn Type": "", "Ref No.": "", "Payment Type": "", Debit: "", Credit: "", "Running Balance": "" },
      { "#": "GSTIN", Date: selectedParty.gstin || "—", "Txn Type": "", "Ref No.": "", "Payment Type": "", Debit: "", Credit: "", "Running Balance": "" },
      { "#": "PERIOD", Date: `${statement.from ? formatDateDMY(statement.from) : "Start"} To ${statement.to ? formatDateDMY(statement.to) : "End"}`, "Txn Type": "", "Ref No.": "", "Payment Type": "", Debit: "", Credit: "", "Running Balance": "" },
      { "#": "", Date: "", "Txn Type": "", "Ref No.": "", "Payment Type": "", Debit: "", Credit: "", "Running Balance": "" },
      // Opening Balance Row
      {
        "#": 0,
        Date: statement.from ? formatDateDMY(statement.from) : "—",
        "Txn Type": "Opening Balance",
        "Ref No.": "—",
        "Payment Type": "—",
        Debit: statement.openingBalanceSigned > 0 ? statement.openingBalance : "",
        Credit: statement.openingBalanceSigned < 0 ? statement.openingBalance : "",
        "Running Balance": formatRunningBalance(statement.openingBalanceSigned),
      },
      // Transactions
      ...statement.transactions.map((t, idx) => ({
        "#": idx + 1,
        Date: formatDateDMY(t.date),
        "Txn Type": t.type,
        "Ref No.": t.number,
        "Payment Type": t.paymentType || "Cash",
        Debit: t.debit > 0 ? t.debit : "",
        Credit: t.credit > 0 ? t.credit : "",
        "Running Balance": t.runningBalanceFormatted,
      })),
      // Totals
      {
        "#": "TOTAL",
        Date: "",
        "Txn Type": "",
        "Ref No.": "",
        "Payment Type": "",
        Debit: statement.totalDebit,
        Credit: statement.totalCredit,
        "Running Balance": formatRunningBalance(statement.closingBalanceSigned),
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Party Statement");
    const sanitizedName = String(selectedParty.partyName || "Party").replaceAll(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(wb, `${sanitizedName}-party-statement.xlsx`);
  };

  // Print Statement Document
  const handlePrint = () => {
    if (!statement || !selectedParty) return;

    // Use unified print service statement builder
    const statementRows = [
      ...(statement.openingBalance > 0
        ? [
            {
              id: "opening",
              date: statement.from ? formatDateDMY(statement.from) : "—",
              source: `Opening Balance (${statement.openingBalanceType === "to-pay" ? "Payable" : "Receivable"})`,
              number: "—",
              status: "Unpaid",
              total: statement.openingBalance,
              received: 0,
              balance: statement.openingBalance,
              receivableBalance: statement.openingBalanceSigned > 0 ? statement.openingBalance : 0,
              payableBalance: statement.openingBalanceSigned < 0 ? statement.openingBalance : 0,
            },
          ]
        : []),
      ...statement.transactions.map((t) => {
        // Payment attribution:
        // Payment-In / Payment-Out carry the payment amount.
        // Invoice / bill rows show ₹0 to prevent double-counting when separate payment entries exist.
        const isPayment = t.type === "Payment-In" || t.type === "Payment-Out";
        const receivedAmount = isPayment ? Number(t.total || 0) : Number(t.received || 0);

        return {
          id: t.id,
          date: formatDateDMY(t.date),
          source: t.type,
          number: t.number,
          status: t.status || "Completed",
          total: t.total,
          received: receivedAmount,
          balance: t.runningBalance,
          receivableBalance: t.runningBalanceSigned > 0 ? t.runningBalance : 0,
          payableBalance: t.runningBalanceSigned < 0 ? t.runningBalance : 0,
        };
      }),
    ];

    const totalAmount = statementRows.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const totalReceived = statementRows.reduce((sum, r) => sum + Number(r.received || 0), 0);

    const html = buildUnifiedStatementHtml({
      party: selectedParty,
      company: { currencySymbol: "₹" },
      rows: statementRows,
      totals: {
        totalAmount,
        totalReceived,
        totalBalance: statement.closingBalance,
        totalReceivable: statement.closingBalanceSigned > 0 ? statement.closingBalance : 0,
        totalPayable: statement.closingBalanceSigned < 0 ? statement.closingBalance : 0,
      },
      autoPrint: false,
    });

    openPrintWindow(html, false);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-50 text-slate-800 overflow-hidden">
      {/* ── Top Bar: Title & Party Selector ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 font-bold">
            <FiFileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Party Statement</h1>
            <p className="text-xs text-slate-500">Customer &amp; Supplier Account Ledger with Running Balance</p>
          </div>
        </div>

        {/* Party Selector Dropdown / Search */}
        <div className="relative w-80 max-w-full" ref={dropdownRef}>
          <div
            onClick={() => setPartyDropdownOpen((prev) => !prev)}
            className={`flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium cursor-pointer transition ${
              selectedParty
                ? "border-sky-300 bg-sky-50/50 text-slate-900 hover:border-sky-400"
                : "border-amber-300 bg-amber-50/40 text-slate-600 hover:border-amber-400"
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <FiUser className={selectedParty ? "text-sky-600" : "text-amber-500"} />
              <span className="truncate font-semibold">
                {selectedParty ? selectedParty.partyName : "Select Customer or Supplier..."}
              </span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              {selectedParty && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPartyId("");
                  }}
                  className="rounded p-0.5 hover:bg-slate-200 text-slate-500"
                  title="Clear party selection"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              )}
              <FiChevronDown className="h-4 w-4" />
            </div>
          </div>

          {/* Dropdown Menu */}
          {partyDropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl max-h-80 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                <div className="relative">
                  <FiSearch className="absolute left-2.5 top-2 text-slate-400 h-3.5 w-3.5" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search by name, phone, GSTIN..."
                    value={partySearchQuery}
                    onChange={(e) => setPartySearchQuery(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-60 divide-y divide-slate-100 text-xs">
                {filteredPartyOptions.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">No parties found</div>
                ) : (
                  filteredPartyOptions.map((party) => {
                    const isSelected = String(party.id) === String(selectedPartyId);
                    return (
                      <div
                        key={party.id}
                        onClick={() => {
                          setSelectedPartyId(party.id);
                          setPartyDropdownOpen(false);
                          setPartySearchQuery("");
                        }}
                        className={`flex items-center justify-between p-2.5 cursor-pointer transition ${
                          isSelected ? "bg-sky-50 text-sky-900 font-semibold" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="truncate">
                          <p className="font-semibold text-slate-900 truncate">{party.partyName}</p>
                          <p className="text-[11px] text-slate-400">
                            {party.phone ? `Ph: ${party.phone}` : "No phone"}
                            {party.gstin ? ` • GST: ${party.gstin}` : ""}
                          </p>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0 ${
                            party.partyType === "supplier" || party.partyType === "vendor"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {party.partyType || "Customer"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Body Area ── */}
      {!selectedParty ? (
        /* Empty State: Prompt user to select a party */
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 mb-4 border border-sky-100 shadow-xs">
            <FiUser className="h-10 w-10 text-sky-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Select a Party to View Statement</h2>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Choose any customer or supplier from the selector at the top or quick-select below to view their detailed
            chronological account statement, opening balance, debits, credits, and running balance.
          </p>

          {/* Quick pick popular parties */}
          {storedParties.length > 0 && (
            <div className="mt-6 w-full max-w-lg">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Registered Parties</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {storedParties.slice(0, 6).map((party) => (
                  <button
                    key={party.id}
                    type="button"
                    onClick={() => setSelectedPartyId(party.id)}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 hover:border-sky-400 hover:bg-sky-50/50 transition text-xs shadow-xs"
                  >
                    <div className="truncate">
                      <p className="font-semibold text-slate-900 truncate">{party.partyName}</p>
                      <p className="text-[11px] text-slate-400">{party.phone || "—"}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                      Select
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Statement View */
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* ── Filter Bar & Actions ── */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Period Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Period:</span>
                <select
                  value={period}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-sky-500 cursor-pointer shadow-xs"
                >
                  <option value="This Month">This Month</option>
                  <option value="Previous Month">Previous Month</option>
                  <option value="This Year">This Year</option>
                  <option value="All Time">All Time</option>
                  <option value="Custom">Custom Date Range</option>
                </select>
              </div>

              {/* Date pickers */}
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                <FiCalendar className="text-slate-400" />
                <span className="text-slate-400">From</span>
                <input
                  type="date"
                  value={from}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {}
                  }}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPeriod("Custom");
                  }}
                  className="bg-transparent outline-none font-medium cursor-pointer"
                />
                <span className="text-slate-400">To</span>
                <input
                  type="date"
                  value={to}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {}
                  }}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPeriod("Custom");
                  }}
                  className="bg-transparent outline-none font-medium cursor-pointer"
                />
              </div>
            </div>

            {/* Right Buttons: Excel & Print */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition shadow-xs"
                title="Download Excel Spreadsheet"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded bg-emerald-600 text-[9px] font-bold text-white">
                  X
                </div>
                <span>Excel Report</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 transition shadow-xs"
                title="Print Party Statement Document"
              >
                <FiPrinter className="h-4 w-4" />
                <span>Print Statement</span>
              </button>
            </div>
          </div>

          {/* ── Party Summary Info & 4 Metric Cards ── */}
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            {/* Party Profile Banner */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-bold text-slate-900 text-sm">{selectedParty.partyName}</span>
                {selectedParty.phone && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <FiPhone className="text-slate-400" /> {selectedParty.phone}
                  </span>
                )}
                {selectedParty.email && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <FiMail className="text-slate-400" /> {selectedParty.email}
                  </span>
                )}
                {selectedParty.gstin && (
                  <span className="rounded bg-slate-200/80 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                    GSTIN: {selectedParty.gstin}
                  </span>
                )}
              </div>
              {selectedParty.billingAddress && (
                <span className="flex items-center gap-1 text-slate-500 truncate max-w-md">
                  <FiMapPin className="text-slate-400 shrink-0" /> {selectedParty.billingAddress}
                </span>
              )}
            </div>

            {/* 4 Summary Cards */}
            {statement && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Opening Balance */}
                <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Opening Balance</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(statement.openingBalance)}</p>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">As of {statement.from ? formatDateDMY(statement.from) : "Start"}</span>
                    <span
                      className={`font-semibold ${
                        statement.openingBalanceType === "to-receive"
                          ? "text-teal-600"
                          : statement.openingBalanceType === "to-pay"
                          ? "text-rose-600"
                          : "text-slate-500"
                      }`}
                    >
                      {statement.openingBalanceType === "to-receive"
                        ? "To Receive (Dr)"
                        : statement.openingBalanceType === "to-pay"
                        ? "To Pay (Cr)"
                        : "Settled"}
                    </span>
                  </div>
                </div>

                {/* 2. Total Debit */}
                <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Debit (In)</p>
                  <p className="mt-1 text-lg font-bold text-sky-700">{formatMoney(statement.totalDebit)}</p>
                  <p className="mt-1 text-[11px] text-slate-400">Sales, payments-out, debit notes</p>
                </div>

                {/* 3. Total Credit */}
                <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Credit (Out)</p>
                  <p className="mt-1 text-lg font-bold text-indigo-700">{formatMoney(statement.totalCredit)}</p>
                  <p className="mt-1 text-[11px] text-slate-400">Purchases, receipts, credit notes</p>
                </div>

                {/* 4. Closing Balance */}
                <div
                  className={`rounded-lg border p-3.5 shadow-xs ${
                    statement.closingBalanceType === "to-receive"
                      ? "border-teal-200 bg-teal-50/30"
                      : statement.closingBalanceType === "to-pay"
                      ? "border-rose-200 bg-rose-50/30"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Closing Balance</p>
                  <p
                    className={`mt-1 text-lg font-bold ${
                      statement.closingBalanceType === "to-receive"
                        ? "text-teal-700"
                        : statement.closingBalanceType === "to-pay"
                        ? "text-rose-600"
                        : "text-slate-800"
                    }`}
                  >
                    {formatMoney(statement.closingBalance)}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">As of {statement.to ? formatDateDMY(statement.to) : "End"}</span>
                    <span
                      className={`font-bold uppercase text-[10px] rounded px-1.5 py-0.5 ${
                        statement.closingBalanceType === "to-receive"
                          ? "bg-teal-100 text-teal-800"
                          : statement.closingBalanceType === "to-pay"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {statement.closingBalanceType === "to-receive"
                        ? "To Receive (Dr)"
                        : statement.closingBalanceType === "to-pay"
                        ? "To Pay (Cr)"
                        : "Settled"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Transaction Ledger Table ── */}
          <div className="flex-1 overflow-auto px-6 py-3">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs bg-white rounded-lg overflow-hidden border border-slate-200 shadow-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-600 shadow-xs">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">#</th>
                  <th className="w-28 px-3 py-3">Date</th>
                  <th className="w-32 px-3 py-3">Transaction Type</th>
                  <th className="w-32 px-3 py-3">Ref No.</th>
                  <th className="w-28 px-3 py-3">Payment Type</th>
                  <th className="w-32 px-3 py-3 text-right">Debit</th>
                  <th className="w-32 px-3 py-3 text-right">Credit</th>
                  <th className="w-36 px-3 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* 1. Opening Balance Row */}
                {statement && (
                  <tr className="bg-slate-50/70 font-semibold text-slate-700 italic border-b border-slate-200">
                    <td className="px-3 py-3 text-center text-slate-400">—</td>
                    <td className="px-3 py-3">{statement.from ? formatDateDMY(statement.from) : "—"}</td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        Opening Balance
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-400">—</td>
                    <td className="px-3 py-3 text-slate-400">—</td>
                    <td className="px-3 py-3 text-right font-medium">
                      {statement.openingBalanceSigned > 0 ? formatMoney(statement.openingBalance) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {statement.openingBalanceSigned < 0 ? formatMoney(statement.openingBalance) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-bold">
                      <span
                        className={
                          statement.openingBalanceType === "to-receive"
                            ? "text-teal-600"
                            : statement.openingBalanceType === "to-pay"
                            ? "text-rose-600"
                            : "text-slate-500"
                        }
                      >
                        {formatRunningBalance(statement.openingBalanceSigned)}
                      </span>
                    </td>
                  </tr>
                )}

                {/* 2. In-range Transactions */}
                {statement && statement.transactions.length > 0 ? (
                  statement.transactions.map((t, idx) => (
                    <tr
                      key={t.id || idx}
                      onClick={() => handleRowClick(t)}
                      className="cursor-pointer transition hover:bg-sky-50/60"
                      title="Click to view/edit this transaction"
                    >
                      <td className="px-3 py-3 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {formatDateDMY(t.date)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            t.type === "Sale"
                              ? "bg-blue-100 text-blue-800"
                              : t.type === "Purchase"
                              ? "bg-amber-100 text-amber-800"
                              : t.type === "Payment-In"
                              ? "bg-emerald-100 text-emerald-800"
                              : t.type === "Payment-Out"
                              ? "bg-violet-100 text-violet-800"
                              : t.type === "Credit Note"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-orange-100 text-orange-800"
                          }`}
                        >
                          {t.type}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-700 truncate">{t.number}</td>
                      <td className="px-3 py-3 text-slate-500">{t.paymentType || "Cash"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                        {t.debit > 0 ? formatMoney(t.debit) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                        {t.credit > 0 ? formatMoney(t.credit) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-bold whitespace-nowrap">
                        <span
                          className={
                            t.runningBalanceType === "to-receive"
                              ? "text-teal-600"
                              : t.runningBalanceType === "to-pay"
                              ? "text-rose-600"
                              : "text-slate-500"
                          }
                        >
                          {t.runningBalanceFormatted}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No transactions recorded within this date range.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Total Row */}
              {statement && (
                <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900 text-xs">
                  <tr>
                    <td colSpan={5} className="px-3 py-3 font-bold uppercase tracking-wider">
                      Period Total / Movement
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-sky-800">
                      {formatMoney(statement.totalDebit)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-indigo-800">
                      {formatMoney(statement.totalCredit)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-sm">
                      <span
                        className={
                          statement.closingBalanceType === "to-receive"
                            ? "text-teal-700"
                            : statement.closingBalanceType === "to-pay"
                            ? "text-rose-700"
                            : "text-slate-700"
                        }
                      >
                        {formatRunningBalance(statement.closingBalanceSigned)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
