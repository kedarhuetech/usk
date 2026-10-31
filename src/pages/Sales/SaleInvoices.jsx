// Implements the sale invoices page.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiBarChart2,
  FiCalendar,
  FiChevronDown,
  FiDownload,
  FiFilter,
  FiGrid,
  FiMoreVertical,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiSettings,
  FiShare2,
  FiTrendingUp,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import ReportPrintPreviewModal from "../../components/Common/ReportPrintPreviewModal";
import Card from "../../components/Common/Card";
import { loadSalesInvoices } from "../../services/businessRecords";
import { notifyBusinessDataChanged } from "../../services/businessDataChanged.js";

const SALE_INVOICE_UI_KEY = "ledgerly:saleInvoiceUiActions.v1";

// Reads sale invoice ui.
function readSaleInvoiceUi() {
  try { const value = JSON.parse(window.localStorage.getItem(SALE_INVOICE_UI_KEY) || "{}"); return value && typeof value === "object" ? value : {}; }
  catch { return {}; }
}

// This helper handles invoice history logic.
function recordInvoiceHistory(state, invoice, action) {
  return [{ id: `${invoice.id}-${Date.now()}`, invoiceId: invoice.id, invoiceNumber: invoice.form?.invoiceNumber || invoice.invoiceNumber || "—", action, at: new Date().toISOString() }, ...(state.history || [])];
}

// This helper handles date logic.
function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Starts of month.
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
// This helper handles of month logic.
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

// This helper handles date logic.
function invoiceDate(invoice) {
  const value = invoice.form?.invoiceDate || invoice.createdAt;
  if (!value) return null;
  const s = String(value).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  const normalized = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : (s.length === 10 ? s : value);
  const date = new Date(normalized.length === 10 ? `${normalized}T00:00:00` : normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Checks whether in date range.
function isInDateRange(value, start, end) {
  if (!start && !end) return true;
  if (!value) return false;
  const s = String(value).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  const normalized = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : (s.length === 10 ? s : value);
  const date = new Date(normalized.length === 10 ? `${normalized}T00:00:00` : normalized);
  if (Number.isNaN(date.getTime())) return false;
  const iso = isoDate(date);
  return (!start || iso >= start) && (!end || iso <= end);
}

// Formats date.
function formatDate(value) {
  if (!value) return "—";
  return value.toLocaleDateString("en-GB");
}

// Formats money.
function formatMoney(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// This helper handles amount logic.
function invoiceAmount(invoice) {
  return Number(invoice.totals?.finalTotal ?? invoice.totals?.amount ?? 0);
}

// This helper handles store logic.
function invoiceStore(invoice) {
  const value = invoice.business?.name || invoice.business?.businessName || invoice.storeName || invoice.store;
  return typeof value === "string" ? value : value?.name || value?.businessName || "";
}

// This helper handles user logic.
function invoiceUser(invoice) {
  const value = invoice.createdBy || invoice.createdByName || invoice.userName || invoice.user;
  return typeof value === "string" ? value : value?.name || value?.fullName || "";
}

// This helper handles received logic.
function invoiceReceived(invoice) {
  if (invoice.saleType === "cash") return invoiceAmount(invoice);
  if (invoice.totals?.received != null) return Math.min(Math.max(Number(invoice.totals.received || 0), 0), invoiceAmount(invoice));
  return 0;
}

// This helper handles balance logic.
function invoiceBalance(invoice) {
  return Math.max(invoiceAmount(invoice) - invoiceReceived(invoice) - Number(invoice.creditNoteAppliedAmount || 0), 0);
}

// Downloads csv.
function downloadCsv(rows) {
  // Handles result.
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [["Date", "Invoice No", "Party Name", "Transaction", "Payment Type", "Amount", "Balance", "Status"], ...rows.map((invoice) => [
    formatDate(invoiceDate(invoice)), invoice.form?.invoiceNumber || invoice.invoiceNumber || "", invoice.form?.customer || "Cash Sale", "Sale", invoice.form?.paymentType || (invoice.saleType === "cash" ? "Cash" : "Credit"), invoiceAmount(invoice), invoiceBalance(invoice), invoiceBalance(invoice) > 0 ? "Unpaid" : "Paid",
  ])].map((row) => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "sale-invoices.csv"; link.click(); URL.revokeObjectURL(url);
}

// Renders the empty state interface.
function EmptyState({ onAddSale }) {
  return <div className="flex min-h-[420px] flex-1 items-center justify-center px-5 py-12 text-center"><div className="max-w-sm"><div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-blue-50 text-blue-500"><FiTrendingUp className="h-16 w-16" /></div><h2 className="mt-6 text-lg font-bold text-slate-800">No sales recorded yet</h2><p className="mt-2 text-sm leading-6 text-slate-500">Create your first sale invoice to get started.</p><Button onClick={onAddSale} className="mt-6 bg-rose-600 text-white shadow-sm hover:bg-rose-700"><FiPlus className="h-5 w-5" /> Add Sale</Button></div></div>;
}

const graphPeriods = ["Daily", "Weekly", "Monthly", "Yearly"];

// Renders the sales graph view interface.
function SalesGraphView({ invoices, from, to, setFrom, setTo, period, setPeriod, user, setUser, users, onClose }) {
  const buckets = useMemo(() => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
    const cursor = new Date(start);
    if (period === "Weekly") cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    if (period === "Monthly") cursor.setDate(1);
    if (period === "Yearly") cursor.setMonth(0, 1);
    const values = [];
    while (cursor <= end && values.length < 500) {
      const date = new Date(cursor);
      const key = period === "Yearly" ? `${date.getFullYear()}` : period === "Monthly" ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : period === "Weekly" ? isoDate(date) : isoDate(date);
      const label = period === "Yearly" ? `${date.getFullYear()}` : period === "Monthly" ? date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : period === "Weekly" ? `Week ${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : formatDate(date);
      values.push({ key, label, total: 0 });
      if (period === "Daily") cursor.setDate(cursor.getDate() + 1);
      else if (period === "Weekly") cursor.setDate(cursor.getDate() + 7);
      else if (period === "Monthly") cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setFullYear(cursor.getFullYear() + 1);
    }
    const lookup = new Map(values.map((bucket, index) => [bucket.key, index]));
    invoices.forEach((invoice) => {
      const date = invoiceDate(invoice);
      if (!date) return;
      if (period === "Weekly") date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      if (period === "Monthly") date.setDate(1);
      if (period === "Yearly") date.setMonth(0, 1);
      const key = period === "Yearly" ? `${date.getFullYear()}` : period === "Monthly" ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : isoDate(date);
      const index = lookup.get(key);
      if (index !== undefined) values[index].total += invoiceAmount(invoice);
    });
    return values;
  }, [invoices, from, to, period]);
  const height = 430;
  const width = Math.max(1120, buckets.length * (period === "Daily" ? 22 : 48));
  const pad = { top: 18, right: 24, bottom: 108, left: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const peak = Math.max(...buckets.map((bucket) => bucket.total), 0);
  const scale = Math.max(500, Math.ceil(peak / 500) * 500);
  // Handles result.
  const x = (index) => pad.left + (buckets.length < 2 ? plotW / 2 : (index / (buckets.length - 1)) * plotW);
  // Handles result.
  const y = (value) => pad.top + plotH - (value / scale) * plotH;
  const path = buckets.map((bucket, index) => `${index ? "L" : "M"} ${x(index)} ${y(bucket.total)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(buckets.length / (period === "Daily" ? 70 : 35)));
  return <div className="flex min-h-[calc(100vh-7rem)] flex-col bg-white px-5 py-5">
      <div className="flex flex-wrap items-center gap-3"><div className="flex min-h-14 flex-wrap items-center gap-3 rounded-md border border-slate-200 px-3"><span className="text-sm text-slate-500">From</span><input aria-label="Graph start date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="bg-transparent text-sm text-slate-700 outline-none" /><span className="text-sm text-slate-500">To</span><input aria-label="Graph end date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="bg-transparent text-sm text-slate-700 outline-none" /></div><label className="flex h-10 min-w-56 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-sky-600"><select aria-label="Graph user filter" value={user} onChange={(event) => setUser(event.target.value)} className="w-full bg-transparent outline-none">{users.map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={onClose} aria-label="Back to Sale Invoices" title="Back to Sale Invoices" className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-slate-200 text-teal-600 shadow-sm hover:bg-teal-50"><FiGrid className="h-5 w-5" /></button></div>
    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 px-1"><h2 className="text-xl font-medium text-slate-900">Sales Graph</h2><div className="flex items-center gap-5">{graphPeriods.map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`border-b-2 px-2 py-3 text-lg text-sky-700 ${period === value ? "border-sky-600" : "border-transparent hover:border-sky-200"}`}>{value}</button>)}</div></div>
    <div className="mt-3 min-h-0 flex-1 overflow-auto border-t border-slate-100"><svg role="img" aria-label={`${period} sales graph`} width={width} height={height} className="block"><rect width={width} height={height} fill="white" />{Array.from({ length: 6 }, (_, index) => { const gridY = pad.top + (plotH / 5) * index; const value = scale - (scale / 5) * index; return <g key={index}><line x1={pad.left} y1={gridY} x2={width - pad.right} y2={gridY} stroke="#d6d6d6" /><text x={pad.left - 12} y={gridY + 5} textAnchor="end" fontSize="14" fill="#667085">{Math.round(value).toLocaleString("en-IN")}</text></g>; })}<line x1={pad.left} y1={pad.top + plotH} x2={width - pad.right} y2={pad.top + plotH} stroke="#a3a3a3" />{buckets.length > 0 && <path d={path} fill="none" stroke="#0786ad" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}{buckets.map((bucket, index) => <g key={bucket.key}><line x1={x(index)} y1={pad.top} x2={x(index)} y2={pad.top + plotH} stroke="#e5e5e5" /><circle cx={x(index)} cy={y(bucket.total)} r="3" fill="#0786ad" />{index % labelStep === 0 && <text transform={`translate(${x(index)},${pad.top + plotH + 20}) rotate(-58)`} textAnchor="end" fontSize="11" fill="#667085">{bucket.label}</text>}</g>)}</svg>{buckets.length === 0 && <p className="p-8 text-sm text-slate-500">Choose a valid date range to see sales.</p>}</div>
  </div>;
}

// Renders the invoice actions menu interface.
function InvoiceActionsMenu({ invoice, open, onToggle, onAction }) {
  const rootRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, right: 16 });
  useEffect(() => {
    if (!open) return undefined;
    // Closes when outside.
    const closeWhenOutside = (event) => { if (!rootRef.current?.contains(event.target)) onToggle(false); };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, [open, onToggle]);
  const actions = ["View/Edit", "Generate e-Invoice", "Convert To Return", "Preview Delivery Challan", "Payment History", "Cancel Invoice", "Delete", "Duplicate", "Open PDF", "Preview", "Print", "View History"];
  // Toggles result.
  const toggle = (event) => {
    if (open) { onToggle(false); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = Math.min(540, window.innerHeight * 0.72);
    const top = Math.max(12, rect.top - menuHeight - 4);
    setPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
    onToggle(true);
  };
  return <div ref={rootRef} className="relative"><button type="button" onClick={toggle} aria-label="More invoice actions" className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><FiMoreVertical className="h-5 w-5" /></button>{open && <div style={{ top: position.top, right: position.right }} className="fixed z-[100] max-h-[min(560px,72vh)] w-60 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">{actions.map((action) => <button key={action} type="button" onClick={() => onAction(action, invoice)} className="w-full rounded px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100">{action}</button>)}</div>}</div>;
}

// Renders the sale invoices interface.
function SaleInvoices() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const today = new Date();
  const [invoices, setInvoices] = useState([]);
  const [invoiceUi, setInvoiceUi] = useState(readSaleInvoiceUi);
  const [dateFrom, setDateFrom] = useState(isoDate(startOfMonth(today)));
  const [dateTo, setDateTo] = useState(isoDate(endOfMonth(today)));
  const [period, setPeriod] = useState("This Month");
  const [store, setStore] = useState("All Stores");
  const [user, setUser] = useState("All Users");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState("");
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphFrom, setGraphFrom] = useState(`${today.getFullYear()}-01-01`);
  const [graphTo, setGraphTo] = useState(isoDate(today));
  const [graphPeriod, setGraphPeriod] = useState("Daily");
  const [graphUser, setGraphUser] = useState("All Users");
  const [activeDialog, setActiveDialog] = useState(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  // Opens add sale.
  const openAddSale = () => navigate("/sales/sale-invoices/new", { state: { from: pathname } });
  // Opens preview.
  const openPreview = (invoice, printAfterOpen = false) => navigate("/sales/sale-invoices/preview", { state: { invoice, printAfterOpen } });

  useEffect(() => {
    let active = true;
    // Refreshes result.
    const refresh = async () => {
      try { const rows = await loadSalesInvoices(); if (active) setInvoices(rows.filter((invoice) => invoice.transactionType !== "purchase")); }
      catch (error) { console.error("Could not load sale invoices:", error); }
    };
    refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);

  const shownInvoices = useMemo(() => [
    ...invoices,
    ...(invoiceUi.duplicates || []),
    ...(invoiceUi.returns || []),
  ].filter((invoice) => !(invoiceUi.deleted || []).includes(invoice.id)).map((invoice) => ({
    ...invoice,
    ...(invoiceUi.edits?.[invoice.id] || {}),
    cancelled: Boolean(invoiceUi.cancelled?.[invoice.id] || invoice.cancelled),
  })), [invoices, invoiceUi]);
  const stores = useMemo(() => ["All Stores", ...new Set(shownInvoices.map(invoiceStore).filter(Boolean))], [shownInvoices]);
  const users = useMemo(() => ["All Users", ...new Set(shownInvoices.map(invoiceUser).filter(Boolean))], [shownInvoices]);
  const visibleInvoices = useMemo(() => shownInvoices.filter((invoice) => {
    const date = invoiceDate(invoice);
    const inSelectedPeriod = isInDateRange(date ? isoDate(date) : null, dateFrom, dateTo);
    const party = invoice.form?.customer || "Cash Sale";
    const number = invoice.form?.invoiceNumber || invoice.invoiceNumber || "";
    return inSelectedPeriod
      && (store === "All Stores" || store === invoiceStore(invoice))
      && (user === "All Users" || user === invoiceUser(invoice))
      && `${party} ${number} ${invoice.form?.paymentType || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => (invoiceDate(b)?.getTime() || 0) - (invoiceDate(a)?.getTime() || 0)), [shownInvoices, dateFrom, dateTo, store, user, search]);

  const totals = useMemo(() => visibleInvoices.reduce((sum, invoice) => ({
    amount: sum.amount + invoiceAmount(invoice), received: sum.received + invoiceReceived(invoice), balance: sum.balance + invoiceBalance(invoice),
  }), { amount: 0, received: 0, balance: 0 }), [visibleInvoices]);

  const graphInvoices = useMemo(() => shownInvoices.filter((invoice) => {
    const date = invoiceDate(invoice);
    return isInDateRange(date ? isoDate(date) : null, graphFrom, graphTo)
      && (graphUser === "All Users" || invoiceUser(invoice) === graphUser);
  }), [shownInvoices, graphFrom, graphTo, graphUser]);

  // Sets period range.
  const setPeriodRange = (value) => {
    setPeriod(value);
    const base = new Date();
    if (value === "This Month") { setDateFrom(isoDate(startOfMonth(base))); setDateTo(isoDate(endOfMonth(base))); }
    else if (value === "This Quarter") { const firstMonth = Math.floor(base.getMonth() / 3) * 3; setDateFrom(isoDate(new Date(base.getFullYear(), firstMonth, 1))); setDateTo(isoDate(new Date(base.getFullYear(), firstMonth + 3, 0))); }
    else if (value === "This Year") { setDateFrom(`${base.getFullYear()}-01-01`); setDateTo(`${base.getFullYear()}-12-31`); }
    else if (value === "All Time") { setDateFrom(""); setDateTo(""); }
  };

  // Saves invoice ui.
  const saveInvoiceUi = (update) => setInvoiceUi((current) => {
    const next = update(current);
    window.localStorage.setItem(SALE_INVOICE_UI_KEY, JSON.stringify(next));
    notifyBusinessDataChanged();
    return next;
  });

  // Opens invoice action.
  const openInvoiceAction = (action, invoice) => {
    setRowMenu("");
    if (action === "Preview" || action === "Open PDF") { openPreview(invoice); return; }
    if (action === "Print") { openPreview(invoice, true); return; }
    if (action === "View/Edit") {
      navigate("/sales/sale-invoices/new", { state: { from: pathname, editInvoice: invoice } }); return;
    }
    if (action === "Share") { shareInvoice(invoice); return; }
    if (action === "Cancel Invoice" && !window.confirm("Cancel this invoice in this browser? Its saved invoice will remain unchanged.")) return;
    if (action === "Delete" && !window.confirm("Hide this invoice from the Sale Invoices list in this browser? Its saved invoice will remain unchanged.")) return;
    if (action === "Convert To Return" && !window.confirm("Create a local sale return for this invoice?")) return;
    if (action === "Cancel Invoice") saveInvoiceUi((current) => ({ ...current, cancelled: { ...(current.cancelled || {}), [invoice.id]: true }, history: recordInvoiceHistory(current, invoice, action) }));
    else if (action === "Delete") saveInvoiceUi((current) => ({ ...current, deleted: [...new Set([...(current.deleted || []), invoice.id])], history: recordInvoiceHistory(current, invoice, action) }));
    else if (action === "Duplicate") {
      const duplicate = { ...invoice, id: `local-copy-${Date.now()}`, localOnly: true, createdAt: new Date().toISOString(), form: { ...invoice.form, invoiceNumber: `${invoice.form?.invoiceNumber || invoice.invoiceNumber || "1"}-COPY` } };
      saveInvoiceUi((current) => ({ ...current, duplicates: [duplicate, ...(current.duplicates || [])], history: recordInvoiceHistory(current, invoice, action) }));
    } else if (action === "Convert To Return") {
      const returned = { ...invoice, id: `local-return-${Date.now()}`, localOnly: true, isReturn: true, createdAt: new Date().toISOString(), form: { ...invoice.form, invoiceNumber: `${invoice.form?.invoiceNumber || invoice.invoiceNumber || "1"}-RET` }, totals: { ...invoice.totals, finalTotal: -invoiceAmount(invoice), received: 0, balance: 0 } };
      saveInvoiceUi((current) => ({ ...current, returns: [returned, ...(current.returns || [])], history: recordInvoiceHistory(current, invoice, action) }));
    } else if (["Generate e-Invoice", "Preview Delivery Challan", "Payment History", "View History"].includes(action)) setActiveDialog({ type: action, invoice });
  };

  // Handles invoice.
  const shareInvoice = async (invoice) => {
    const text = `Sale invoice ${invoice.form?.invoiceNumber || ""} for ${invoice.form?.customer || "Cash Sale"}: ${formatMoney(invoiceAmount(invoice))}`;
    try {
      if (navigator.share) await navigator.share({ title: "Sale Invoice", text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); window.alert("Invoice details copied to clipboard."); }
      else window.alert(text);
    } catch { /* Share dialog was closed. */ }
    setRowMenu("");
  };

  if (graphOpen) return <SalesGraphView invoices={graphInvoices} from={graphFrom} to={graphTo} setFrom={setGraphFrom} setTo={setGraphTo} period={graphPeriod} setPeriod={setGraphPeriod} user={graphUser} setUser={setGraphUser} users={users} onClose={() => setGraphOpen(false)} />;

  return (
    <div className="min-h-full bg-slate-200 p-1">
      <div className="mb-1 flex flex-col gap-4 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="inline-flex items-center gap-3 text-xl font-bold text-slate-800">Sale Invoices <FiChevronDown className="h-5 w-5 text-slate-500" /></h1>
        <div className="flex items-center gap-3"><Button onClick={openAddSale} className="bg-rose-600 text-white shadow-sm hover:bg-rose-700"><FiPlus className="h-5 w-5" /> Add Sale</Button><button type="button" aria-label="Sale invoice settings" className="grid h-10 w-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><FiSettings className="h-5 w-5" /></button></div>
      </div>

      <Card className="mb-1 p-4 shadow-sm"><div className="flex flex-wrap items-center gap-3"><span className="text-sm font-bold text-slate-800">Filter by:</span>
        <label className="flex min-h-10 items-center gap-2 rounded-full bg-blue-50 px-4 text-sm text-slate-700"><select aria-label="Date range preset" value={period} onChange={(event) => setPeriodRange(event.target.value)} className="cursor-pointer bg-transparent font-medium outline-none"><option>This Month</option><option>This Quarter</option><option>This Year</option><option>All Time</option><option>Custom</option></select></label>
        <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-full bg-blue-50 px-4 text-sm text-slate-700"><FiCalendar className="h-4 w-4 text-slate-500" /><input aria-label="Start date" type="date" value={dateFrom} onChange={(event) => { setPeriod("Custom"); setDateFrom(event.target.value); }} className="w-[126px] bg-transparent outline-none" /><span>To</span><input aria-label="End date" type="date" value={dateTo} onChange={(event) => { setPeriod("Custom"); setDateTo(event.target.value); }} className="w-[126px] bg-transparent outline-none" /></div>
        <label className="flex min-h-10 items-center gap-2 rounded-full bg-blue-50 px-4 text-sm text-slate-700"><select aria-label="Store filter" value={store} onChange={(event) => setStore(event.target.value)} className="max-w-48 cursor-pointer bg-transparent font-medium outline-none">{stores.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="flex min-h-10 items-center gap-2 rounded-full bg-blue-50 px-4 text-sm text-slate-700"><select aria-label="User filter" value={user} onChange={(event) => setUser(event.target.value)} className="max-w-40 cursor-pointer bg-transparent font-medium outline-none">{users.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div></Card>

      <Card className="mb-1 min-h-44 p-5 shadow-sm"><div className="w-full max-w-md rounded-lg border border-violet-200 bg-violet-50/50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-base text-slate-500">Total Sales Amount</p><p className="text-2xl font-bold text-slate-800">{formatMoney(totals.amount)}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-600">{visibleInvoices.length} invoices <FiTrendingUp /></span></div><div className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500"><span>Received: <b className="text-slate-800">{formatMoney(totals.received)}</b></span><span className="text-slate-300">|</span><span>Balance: <b className="text-slate-800">{formatMoney(totals.balance)}</b></span></div></div></Card>

      <Card className="flex min-h-[calc(100vh-25rem)] flex-col shadow-sm"><div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-4 py-3"><h2 className="text-lg font-semibold text-slate-700">Transactions</h2><div className="flex items-center gap-3 text-slate-500">
        {searchOpen && <label className="relative"><FiSearch className="absolute left-3 top-2.5 h-4 w-4" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoices" className="h-9 w-48 rounded-md border border-slate-300 pl-9 pr-8 text-sm outline-none focus:border-blue-500" /><button type="button" onClick={() => { setSearch(""); setSearchOpen(false); }} aria-label="Close search" className="absolute right-2 top-2"><FiX /></button></label>}
        <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search" title="Search" className="rounded p-1.5 hover:bg-slate-100"><FiSearch className="h-5 w-5" /></button><button type="button" onClick={() => setGraphOpen(true)} aria-label="Open sales graph" title="Sales Graph" className="rounded p-1.5 hover:bg-slate-100"><FiBarChart2 className="h-5 w-5" /></button><button type="button" onClick={() => downloadCsv(visibleInvoices)} aria-label="Download Excel CSV" title="Download Excel CSV" className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"><FiDownload className="h-5 w-5" /></button><button type="button" onClick={() => setPrintModalOpen(true)} aria-label="Print sale invoices" title="Print" className="rounded p-1.5 hover:bg-slate-100"><FiPrinter className="h-5 w-5" /></button>
      </div></div>
        {visibleInvoices.length ? <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[1050px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["Date", "Invoice no", "Party Name", "Transaction", "Payment Type", "Amount", "Balance", "Status", "Actions"].map((heading) => <th key={heading} className="border-y border-slate-200 px-3 py-3">{heading}{heading !== "Actions" && <FiFilter className="ml-2 inline h-3.5 w-3.5 text-slate-500" />}</th>)}</tr></thead><tbody>{visibleInvoices.map((invoice, index) => {
          const amount = invoiceAmount(invoice); const balance = invoiceBalance(invoice); const cancelled = Boolean(invoice.cancelled || invoice.status === "Cancelled");
          const paymentType = invoice.form?.paymentType || (invoice.saleType === "cash" ? "Cash" : "Credit");
          return <tr key={invoice.id || index} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70 hover:bg-sky-50"><td className="whitespace-nowrap px-3 py-4">{formatDate(invoiceDate(invoice))}</td><td className="px-3 py-4">{invoice.form?.invoiceNumber || invoice.invoiceNumber || "—"}</td><td className="px-3 py-4 font-medium">{invoice.form?.customer || "Cash Sale"}</td><td className="px-3 py-4">{invoice.isReturn ? "Sale Return" : cancelled ? "Sale [Cancelled]" : "Sale"}</td><td className="px-3 py-4">{paymentType}</td><td className="whitespace-nowrap px-3 py-4 text-right">{cancelled ? "—" : formatMoney(amount)}</td><td className="whitespace-nowrap px-3 py-4 text-right">{cancelled ? "—" : formatMoney(balance)}</td><td className={`px-3 py-4 font-medium ${cancelled ? "text-slate-400" : invoice.isReturn ? "text-amber-600" : balance > 0 ? "text-rose-500" : "text-emerald-500"}`}>{cancelled ? "Cancelled" : invoice.isReturn ? "Returned" : balance > 0 ? "Unpaid" : "Paid"}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><button type="button" onClick={() => openPreview(invoice, true)} aria-label="Print invoice" title="Print" className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><FiPrinter className="h-5 w-5" /></button><button type="button" onClick={() => shareInvoice(invoice)} aria-label="Share invoice" title="Share" className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><FiShare2 className="h-5 w-5" /></button><InvoiceActionsMenu invoice={invoice} open={rowMenu === invoice.id} onToggle={() => setRowMenu(rowMenu === invoice.id ? "" : invoice.id)} onAction={openInvoiceAction} /></div></td></tr>;
        })}</tbody></table></div> : <EmptyState onAddSale={openAddSale} />}
      </Card>
      {activeDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveDialog(null); }}><section className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-bold text-slate-800">{activeDialog.type === "edit" ? "View / Edit Invoice" : activeDialog.type}</h2><p className="mt-1 text-sm text-slate-500">Invoice {activeDialog.invoice.form?.invoiceNumber || activeDialog.invoice.invoiceNumber || "—"} · {activeDialog.invoice.form?.customer || "Cash Sale"}</p></div><button type="button" aria-label="Close" onClick={() => setActiveDialog(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100"><FiX /></button></header>
        {activeDialog.type === "Generate e-Invoice" && <div className="space-y-4 p-5"><p className="text-sm text-slate-600">Create a demo e-invoice record for {formatMoney(invoiceAmount(activeDialog.invoice))}. This does not submit to a government portal.</p>{activeDialog.generated && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-700">Demo e-invoice generated: {activeDialog.reference}</p>}<div className="flex justify-end gap-2"><Button onClick={() => setActiveDialog(null)} className="bg-slate-100 text-slate-700">Close</Button>{!activeDialog.generated && <Button onClick={() => { const reference = `DEMO-${Date.now()}`; saveInvoiceUi((current) => ({ ...current, eInvoices: { ...(current.eInvoices || {}), [activeDialog.invoice.id]: reference }, history: recordInvoiceHistory(current, activeDialog.invoice, "Demo e-Invoice generated") })); setActiveDialog((current) => ({ ...current, generated: true, reference })); }} className="bg-blue-600 text-white">Generate Demo e-Invoice</Button>}</div></div>}
        {activeDialog.type === "Preview Delivery Challan" && <div className="space-y-4 p-5"><div className="grid grid-cols-2 gap-3 text-sm"><p><b>Date:</b> {formatDate(invoiceDate(activeDialog.invoice))}</p><p><b>Party:</b> {activeDialog.invoice.form?.customer || "Cash Sale"}</p></div><div className="max-h-64 overflow-auto rounded border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-2">Item</th><th className="p-2">Quantity</th><th className="p-2">Unit</th></tr></thead><tbody>{(activeDialog.invoice.rows || []).filter((row) => row.item || row.qty).map((row, index) => <tr key={row.id || index} className="border-t border-slate-100"><td className="p-2">{row.item || "—"}</td><td className="p-2">{row.qty || "—"}</td><td className="p-2">{row.unit || "—"}</td></tr>)}</tbody></table></div><div className="flex justify-end"><Button onClick={() => window.print()} className="bg-blue-600 text-white"><FiPrinter /> Print Challan</Button></div></div>}
        {activeDialog.type === "Payment History" && <div className="space-y-3 p-5 text-sm text-slate-700"><div className="flex justify-between border-b pb-3"><span>Invoice total</span><b>{formatMoney(invoiceAmount(activeDialog.invoice))}</b></div><div className="flex justify-between border-b pb-3"><span>Received</span><b className="text-emerald-600">{formatMoney(invoiceReceived(activeDialog.invoice))}</b></div><div className="flex justify-between"><span>Balance</span><b className="text-rose-600">{formatMoney(invoiceBalance(activeDialog.invoice))}</b></div><p className="text-xs text-slate-500">Payment entries are shown from this invoice’s saved received amount.</p></div>}
        {activeDialog.type === "View History" && <div className="max-h-80 space-y-3 overflow-y-auto p-5">{(invoiceUi.history || []).filter((entry) => entry.invoiceId === activeDialog.invoice.id).map((entry) => <div key={entry.id} className="flex justify-between gap-3 border-b border-slate-100 pb-3 text-sm"><span className="font-medium text-slate-700">{entry.action}</span><time className="text-slate-500">{new Date(entry.at).toLocaleString()}</time></div>)}{!(invoiceUi.history || []).some((entry) => entry.invoiceId === activeDialog.invoice.id) && <p className="text-sm text-slate-500">No local action history for this invoice yet.</p>}</div>}
        <footer className="flex justify-end border-t border-slate-100 px-5 py-3"><Button onClick={() => setActiveDialog(null)} className="bg-slate-100 text-slate-700">Close</Button></footer></section></div>}
      <ReportPrintPreviewModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Sale Report"
        dateFrom={dateFrom}
        dateTo={dateTo}
        user={user}
        records={visibleInvoices}
        totalLabel="Total Sale:"
        totalAmount={totals.amount}
      />
    </div>
  );
}

export default SaleInvoices;
