import { useMemo, useState } from "react";
import { FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiSearch, FiTrendingUp } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import EstimateEditor from "./EstimateEditor";

const STORAGE_KEY = "ledgerly:estimateQuotations.v1";

function readEstimates() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMoney(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function estimateDate(estimate) {
  const date = new Date(`${estimate.date}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

export default function EstimateQuotation() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const today = new Date();
  const [estimates, setEstimates] = useState(readEstimates);
  const [dateFrom, setDateFrom] = useState(toIsoDate(startOfMonth(today)));
  const [dateTo, setDateTo] = useState(toIsoDate(endOfMonth(today)));
  const [period, setPeriod] = useState("This Month");
  const [firm, setFirm] = useState("All Firms");
  const [user, setUser] = useState("All Users");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [actionMenu, setActionMenu] = useState("");
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, right: 8 });
  const [previewEstimate, setPreviewEstimate] = useState(null);

  const firms = useMemo(() => ["All Firms", ...new Set(estimates.map((item) => item.firm).filter(Boolean))], [estimates]);
  const users = useMemo(() => ["All Users", ...new Set(estimates.map((item) => item.user).filter(Boolean))], [estimates]);
  const visible = useMemo(() => estimates.filter((item) => {
    const date = item.date || "";
    const query = `${item.customer} ${item.number}`.toLowerCase();
    return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)
      && (firm === "All Firms" || item.firm === firm)
      && (user === "All Users" || item.user === user)
      && query.includes(search.trim().toLowerCase());
  }).sort((a, b) => b.date.localeCompare(a.date)), [estimates, dateFrom, dateTo, firm, user, search]);
  const totals = useMemo(() => visible.reduce((result, item) => {
    result.amount += Number(item.amount) || 0;
    if (String(item.status || "").startsWith("Converted")) result.converted += Number(item.amount) || 0;
    else result.open += Number(item.amount) || 0;
    return result;
  }, { amount: 0, converted: 0, open: 0 }), [visible]);

  const saveEstimates = (next) => {
    setEstimates(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const setPreset = (value) => {
    setPeriod(value);
    const base = new Date();
    if (value === "This Month") { setDateFrom(toIsoDate(startOfMonth(base))); setDateTo(toIsoDate(endOfMonth(base))); }
    else if (value === "This Quarter") {
      const firstMonth = Math.floor(base.getMonth() / 3) * 3;
      setDateFrom(toIsoDate(new Date(base.getFullYear(), firstMonth, 1)));
      setDateTo(toIsoDate(new Date(base.getFullYear(), firstMonth + 3, 0)));
    } else if (value === "This Year") { setDateFrom(`${base.getFullYear()}-01-01`); setDateTo(`${base.getFullYear()}-12-31`); }
    else if (value === "All Time") { setDateFrom(""); setDateTo(""); }
  };

  const openNew = () => setEditor({ mode: "new" });
  const openEdit = (estimate) => setEditor({ mode: "edit", estimate });
  const saveEstimate = (estimate) => {
    const saved = { ...estimate, id: estimate.id || `estimate-${Date.now()}` };
    saveEstimates(editor.mode === "edit" ? estimates.map((item) => item.id === saved.id ? saved : item) : [saved, ...estimates]);
    setEditor(null);
  };

  const removeEstimate = (estimate) => {
    if (window.confirm(`Delete quotation ${estimate.number}?`)) saveEstimates(estimates.filter((item) => item.id !== estimate.id));
    setActionMenu("");
  };

  const toggleActionMenu = (key, event, menuHeight) => {
    if (actionMenu === key) { setActionMenu(""); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const top = rect.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 4)
      : rect.bottom + 4;
    setActionMenuPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
    setActionMenu(key);
  };

  const convertEstimate = (estimate, destination) => {
    if (destination === "Sale") {
      setActionMenu("");
      navigate("/sales/sale-invoices/new", { state: { from: pathname, quotationConversion: estimate } });
      return;
    }
    const status = `Converted to ${destination}`;
    saveEstimates(estimates.map((item) => item.id === estimate.id ? { ...item, status, convertedAt: new Date().toISOString(), conversionType: destination } : item));
    setActionMenu("");
  };

  const duplicateEstimate = (estimate) => {
    const copy = { ...estimate, id: `estimate-${Date.now()}`, number: `${estimate.number}-COPY`, status: "Open", convertedAt: "", conversionType: "", convertedSaleId: "" };
    saveEstimates([copy, ...estimates]);
    setActionMenu("");
  };

  const openEstimateDocument = (estimate, printNow = false) => {
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const rows = (estimate.rows || []).map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.qty)} ${escapeHtml(row.unit)}</td><td>${escapeHtml(row.price)}</td><td>${formatMoney(Number(row.qty || 0) * Number(row.price || 0))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Estimate ${escapeHtml(estimate.number)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:36px}header{text-align:center;border-bottom:2px solid #d8e0ea;padding-bottom:18px}h1{font-size:24px;margin:0 0 8px}h2{margin-top:30px}section{display:flex;justify-content:space-between;margin:24px 0}table{border-collapse:collapse;width:100%;margin-top:20px}th{background:#eaf2fb;text-align:left}th,td{border:1px solid #d4dbe5;padding:10px}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}.actions{margin:24px 0;text-align:right}.actions button{padding:10px 20px;background:#1683ee;color:white;border:0;border-radius:6px;cursor:pointer}@media print{body{margin:15mm}.actions{display:none}}</style></head><body><header><h1>My Company</h1><div>Estimate / Quotation</div></header><h2>Estimate #${escapeHtml(estimate.number)}</h2><section><div><b>Prepared for:</b><br>${escapeHtml(estimate.customer)}<br>${escapeHtml(estimate.phone || "")}</div><div><b>Date:</b> ${escapeHtml(estimate.date)}<br><b>State of supply:</b> ${escapeHtml(estimate.state || "—")}</div></section><table><thead><tr><th>#</th><th>Item</th><th>Description</th><th>Qty / Unit</th><th>Price / Unit</th><th>Amount</th></tr></thead><tbody>${rows || "<tr><td colspan='6'>No items</td></tr>"}</tbody></table>${estimate.description ? `<p><b>Description:</b> ${escapeHtml(estimate.description)}</p>` : ""}${estimate.terms ? `<p><b>Terms & Conditions:</b><br>${escapeHtml(estimate.terms).replace(/\n/g, "<br>")}</p>` : ""}<p class="total">Total: ${formatMoney(estimate.amount)}</p><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>${printNow ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}</body></html>`;
    const documentWindow = window.open("", "_blank");
    if (!documentWindow) { window.alert("Allow pop-ups to open the estimate document."); return; }
    documentWindow.document.open();
    documentWindow.document.write(html);
    documentWindow.document.close();
  };

  const runEstimateAction = (action, estimate) => {
    setActionMenu("");
    if (action === "View/Edit") openEdit(estimate);
    else if (action === "Delete") removeEstimate(estimate);
    else if (action === "Duplicate") duplicateEstimate(estimate);
    else if (action === "Open PDF") openEstimateDocument(estimate);
    else if (action === "Preview") setPreviewEstimate(estimate);
    else if (action === "Print") openEstimateDocument(estimate, true);
  };

  if (editor) return <EstimateEditor estimate={editor.estimate} onClose={() => setEditor(null)} onSave={saveEstimate} />;

  return <main className="flex h-full min-h-0 flex-col gap-1 bg-slate-100 p-1 text-slate-800">
    <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 bg-white px-5 py-3">
      <h1 className="flex items-center gap-3 text-xl font-bold text-slate-700">Estimate/Quotation <FiChevronDown className="h-5 w-5" /></h1>
      <Button onClick={openNew} className="rounded-full bg-rose-600 px-5 text-white hover:bg-rose-700"><FiPlus /> Add Estimate</Button>
    </div>

    <Card className="px-5 py-4 shadow-sm"><div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-bold">Filter by:</span>
      <label className="flex min-h-10 items-center rounded-full bg-blue-50 px-4 text-sm"><select aria-label="Date preset" value={period} onChange={(event) => setPreset(event.target.value)} className="cursor-pointer bg-transparent font-medium outline-none"><option>This Month</option><option>This Quarter</option><option>This Year</option><option>All Time</option><option>Custom</option></select></label>
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-full bg-blue-50 px-4 text-sm"><FiCalendar className="text-slate-500" /><input aria-label="Start date" type="date" value={dateFrom} onChange={(event) => { setPeriod("Custom"); setDateFrom(event.target.value); }} className="w-[126px] bg-transparent outline-none" /><span>To</span><input aria-label="End date" type="date" value={dateTo} onChange={(event) => { setPeriod("Custom"); setDateTo(event.target.value); }} className="w-[126px] bg-transparent outline-none" /></div>
      <label className="flex min-h-10 items-center rounded-full bg-blue-50 px-4 text-sm"><select aria-label="Firm filter" value={firm} onChange={(event) => setFirm(event.target.value)} className="max-w-48 cursor-pointer bg-transparent font-medium outline-none">{firms.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="flex min-h-10 items-center rounded-full bg-blue-50 px-4 text-sm"><select aria-label="User filter" value={user} onChange={(event) => setUser(event.target.value)} className="max-w-40 cursor-pointer bg-transparent font-medium outline-none">{users.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div></Card>

    <Card className="min-h-44 p-5 shadow-sm"><div className="w-full max-w-md rounded-lg border border-violet-200 bg-violet-50/50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-base text-slate-500">Total Quotations</p><p className="text-2xl font-bold">{formatMoney(totals.amount)}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{visible.length} quotations <FiTrendingUp /></span></div><div className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500"><span>Converted: <b className="text-slate-800">{formatMoney(totals.converted)}</b></span><span className="text-slate-300">|</span><span>Open: <b className="text-slate-800">{formatMoney(totals.open)}</b></span></div></div></Card>

    <Card className="flex min-h-0 flex-1 flex-col shadow-sm"><div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-4 py-3"><h2 className="text-lg font-semibold text-slate-700">Transactions</h2><label className="relative text-slate-500"><FiSearch className="absolute left-3 top-2.5 h-4 w-4" /><input aria-label="Search quotations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotations" className="h-9 w-52 rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label></div>
      {visible.length ? <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[980px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["Date", "Reference no", "Party Name", "Amount", "Balance", "Status", "Actions"].map((title) => <th key={title} className="border-y border-slate-200 px-3 py-3">{title}{title !== "Actions" && <FiFilter className="ml-2 inline h-3.5 w-3.5" />}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70 hover:bg-sky-50"><td className="px-3 py-4">{estimateDate(item)?.toLocaleDateString("en-GB") || "—"}</td><td className="px-3 py-4 text-right">{item.number}</td><td className="px-3 py-4 font-medium">{item.customer}</td><td className="whitespace-nowrap px-3 py-4 text-right">{formatMoney(item.amount)}</td><td className="whitespace-nowrap px-3 py-4 text-right">{String(item.status || "Open").startsWith("Converted") ? formatMoney(0) : formatMoney(item.amount)}</td><td className={`px-3 py-4 font-medium ${String(item.status || "").startsWith("Converted") ? "text-emerald-600" : "text-amber-600"}`}>{item.status || "Open"}</td><td className="px-3 py-3"><div className="relative flex items-center gap-1"><button type="button" onClick={(event) => toggleActionMenu(`convert:${item.id}`, event, 100)} aria-expanded={actionMenu === `convert:${item.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 font-medium text-blue-600 hover:bg-blue-50">Convert <FiChevronDown /></button>{actionMenu === `convert:${item.id}` && <div style={{ top: actionMenuPosition.top, right: actionMenuPosition.right }} className="fixed z-[100] w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"><button type="button" onClick={() => convertEstimate(item, "Sale")} className="block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50">Convert to Sale</button><button type="button" onClick={() => convertEstimate(item, "Sale Order")} className="block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50">Convert to Sale Order</button></div>}<button type="button" aria-label="More quotation actions" aria-expanded={actionMenu === `more:${item.id}`} onClick={(event) => toggleActionMenu(`more:${item.id}`, event, 270)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><FiMoreVertical /></button>{actionMenu === `more:${item.id}` && <div style={{ top: actionMenuPosition.top, right: actionMenuPosition.right }} className="fixed z-[100] max-h-[min(560px,75vh)] w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">{["View/Edit", "Delete", "Duplicate", "Open PDF", "Preview", "Print"].map((action) => <button key={action} type="button" onClick={() => runEstimateAction(action, item)} className={`block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50 ${action === "Delete" ? "text-rose-600" : "text-slate-700"}`}>{action}</button>)}</div>}</div></td></tr>)}</tbody></table></div> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center"><div className="grid h-32 w-32 place-items-center rounded-full bg-blue-100 text-blue-400"><FiCalendar className="h-14 w-14" /></div><h2 className="mt-6 text-lg font-semibold text-slate-800">No Transactions to show</h2><p className="mt-2 text-sm text-slate-400">You haven't added any transactions yet.</p><Button onClick={openNew} className="mt-6 rounded-full bg-rose-600 px-5 text-white hover:bg-rose-700"><FiPlus /> Add Estimate</Button></div>}
    </Card>

    {previewEstimate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewEstimate(null); }}><section className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4"><h2 className="text-xl font-bold">Estimate Preview</h2><button type="button" aria-label="Close preview" onClick={() => setPreviewEstimate(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100">×</button></header><div className="p-8"><div className="text-center"><h1 className="text-2xl font-bold">My Company</h1><p className="mt-1 text-sm text-slate-500">Estimate / Quotation</p></div><div className="my-8 flex flex-wrap justify-between gap-5 border-y py-5"><div><p className="text-sm text-slate-500">Estimate #</p><p className="font-semibold">{previewEstimate.number}</p><p className="mt-3 text-sm text-slate-500">Customer</p><p className="font-semibold">{previewEstimate.customer}</p>{previewEstimate.phone && <p>{previewEstimate.phone}</p>}</div><div className="text-right"><p className="text-sm text-slate-500">Date</p><p className="font-semibold">{estimateDate(previewEstimate)?.toLocaleDateString("en-GB") || "—"}</p><p className="mt-3 text-sm text-slate-500">State of supply</p><p>{previewEstimate.state || "—"}</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-100"><tr>{["#", "Item", "Description", "Qty", "Unit Price", "Amount"].map((heading) => <th key={heading} className="border-b px-3 py-3">{heading}</th>)}</tr></thead><tbody>{(previewEstimate.rows || []).map((row, index) => <tr key={row.id || index}><td className="border-b px-3 py-3">{index + 1}</td><td className="border-b px-3 py-3 font-medium">{row.item || "—"}</td><td className="border-b px-3 py-3">{row.description || "—"}</td><td className="border-b px-3 py-3">{row.qty || "—"} {row.unit}</td><td className="border-b px-3 py-3">{formatMoney(row.price)}</td><td className="border-b px-3 py-3 text-right">{formatMoney((Number(row.qty) || 0) * (Number(row.price) || 0))}</td></tr>)}</tbody></table></div>{previewEstimate.description && <p className="mt-5"><b>Description:</b> {previewEstimate.description}</p>}{previewEstimate.terms && <p className="mt-4 whitespace-pre-wrap"><b>Terms & Conditions:</b> {previewEstimate.terms}</p>}<p className="mt-6 text-right text-xl font-bold">Total: {formatMoney(previewEstimate.amount)}</p></div><footer className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4"><Button onClick={() => openEstimateDocument(previewEstimate)} className="border border-blue-300 text-blue-600">Open PDF</Button><Button onClick={() => openEstimateDocument(previewEstimate, true)} className="bg-blue-600 text-white">Print</Button><Button onClick={() => setPreviewEstimate(null)} className="bg-slate-100 text-slate-700">Close</Button></footer></section></div>}

  </main>;
}
