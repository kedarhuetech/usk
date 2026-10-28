import { useMemo, useState } from "react";
import { FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiSearch, FiTrendingUp } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import EstimateEditor from "./EstimateEditor";

const STORAGE_KEY = "ledgerly:proformaInvoices.v1";
const money = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

function readProformas() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

export default function ProformaInvoices() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const now = new Date();
  const [proformas, setProformas] = useState(readProformas);
  const [dateFrom, setDateFrom] = useState(iso(startOfMonth(now)));
  const [dateTo, setDateTo] = useState(iso(endOfMonth(now)));
  const [preset, setPreset] = useState("This Month");
  const [firm, setFirm] = useState("All Firms");
  const [user, setUser] = useState("All Users");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [openMenu, setOpenMenu] = useState("");
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 8 });
  const [preview, setPreview] = useState(null);

  const firms = useMemo(() => ["All Firms", ...new Set(proformas.map((entry) => entry.firm).filter(Boolean))], [proformas]);
  const users = useMemo(() => ["All Users", ...new Set(proformas.map((entry) => entry.user).filter(Boolean))], [proformas]);
  const visible = useMemo(() => proformas.filter((entry) => {
    const query = `${entry.customer || ""} ${entry.number || ""}`.toLowerCase();
    return (!dateFrom || entry.date >= dateFrom) && (!dateTo || entry.date <= dateTo)
      && (firm === "All Firms" || entry.firm === firm)
      && (user === "All Users" || entry.user === user)
      && query.includes(search.trim().toLowerCase());
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "")), [proformas, dateFrom, dateTo, firm, user, search]);
  const totals = visible.reduce((result, entry) => {
    const amount = Number(entry.amount) || 0;
    result.amount += amount;
    if (String(entry.status || "").startsWith("Converted")) result.converted += amount;
    else result.open += amount;
    return result;
  }, { amount: 0, converted: 0, open: 0 });

  const persist = (next) => {
    setProformas(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };
  const setDatePreset = (value) => {
    setPreset(value);
    const date = new Date();
    if (value === "This Month") { setDateFrom(iso(startOfMonth(date))); setDateTo(iso(endOfMonth(date))); }
    else if (value === "This Quarter") {
      const firstMonth = Math.floor(date.getMonth() / 3) * 3;
      setDateFrom(iso(new Date(date.getFullYear(), firstMonth, 1)));
      setDateTo(iso(new Date(date.getFullYear(), firstMonth + 3, 0)));
    } else if (value === "This Year") { setDateFrom(`${date.getFullYear()}-01-01`); setDateTo(`${date.getFullYear()}-12-31`); }
    else if (value === "All Time") { setDateFrom(""); setDateTo(""); }
  };
  const saveProforma = (value) => {
    const saved = { ...value, id: value.id || `proforma-${Date.now()}` };
    persist(editor.mode === "edit" ? proformas.map((entry) => entry.id === saved.id ? saved : entry) : [saved, ...proformas]);
    setEditor(null);
  };
  const deleteProforma = (entry) => {
    if (window.confirm(`Delete proforma invoice ${entry.number}?`)) persist(proformas.filter((value) => value.id !== entry.id));
    setOpenMenu("");
  };

  const toggleMenu = (menuKey, event, menuHeight = 280) => {
    if (openMenu === menuKey) { setOpenMenu(""); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const top = rect.bottom + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight) : rect.bottom + 4;
    setMenuPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
    setOpenMenu(menuKey);
  };

  const convertProforma = (entry, destination) => {
    setOpenMenu("");
    if (destination === "Sale") {
      navigate("/sales/sale-invoices/new", { state: { from: pathname, proformaConversion: entry } });
      return;
    }
    persist(proformas.map((value) => value.id === entry.id ? { ...value, status: "Converted to Sale Order", convertedAt: new Date().toISOString(), conversionType: "Sale Order" } : value));
  };

  const duplicateProforma = (entry) => {
    persist([{ ...entry, id: `proforma-${Date.now()}`, number: `${entry.number}-COPY`, status: "Open", convertedAt: "", convertedSaleId: "", conversionType: "" }, ...proformas]);
    setOpenMenu("");
  };

  const openDocument = (entry, printNow = false) => {
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const rows = (entry.rows || []).map((row, index) => `<tr><td>${index + 1}</td><td>${escape(row.item)}</td><td>${escape(row.description)}</td><td>${escape(row.qty)} ${escape(row.unit)}</td><td>${money(row.price)}</td><td>${money(Number(row.qty || 0) * Number(row.price || 0))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Proforma Invoice ${escape(entry.number)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:36px}header{text-align:center;border-bottom:2px solid #d8e0ea;padding-bottom:18px}h1{font-size:24px;margin:0 0 8px}h2{margin-top:30px}section{display:flex;justify-content:space-between;margin:24px 0}table{border-collapse:collapse;width:100%;margin-top:20px}th{background:#eaf2fb;text-align:left}th,td{border:1px solid #d4dbe5;padding:10px}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}.actions{text-align:right;margin:24px 0}.actions button{padding:10px 20px;background:#1683ee;color:white;border:0;border-radius:6px}@media print{body{margin:15mm}.actions{display:none}}</style></head><body><header><h1>My Company</h1><div>Proforma Invoice</div></header><h2>Proforma #${escape(entry.number)}</h2><section><div><b>Prepared for:</b><br>${escape(entry.customer)}<br>${escape(entry.phone || "")}</div><div><b>Date:</b> ${escape(entry.date)}<br><b>State of supply:</b> ${escape(entry.state || "—")}</div></section><table><thead><tr><th>#</th><th>Item</th><th>Description</th><th>Qty / Unit</th><th>Price / Unit</th><th>Amount</th></tr></thead><tbody>${rows || "<tr><td colspan='6'>No items</td></tr>"}</tbody></table>${entry.description ? `<p><b>Description:</b> ${escape(entry.description)}</p>` : ""}${entry.terms ? `<p><b>Terms &amp; Conditions:</b><br>${escape(entry.terms).replace(/\n/g, "<br>")}</p>` : ""}<p class="total">Total: ${money(entry.amount)}</p><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>${printNow ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}</body></html>`;
    const documentWindow = window.open("", "_blank");
    if (!documentWindow) { window.alert("Allow pop-ups to open the proforma document."); return; }
    documentWindow.document.open(); documentWindow.document.write(html); documentWindow.document.close();
  };

  const runAction = (action, entry) => {
    setOpenMenu("");
    if (action === "View/Edit") setEditor({ mode: "edit", entry });
    else if (action === "Delete") deleteProforma(entry);
    else if (action === "Duplicate") duplicateProforma(entry);
    else if (action === "Open PDF") openDocument(entry);
    else if (action === "Preview") setPreview(entry);
    else if (action === "Print") openDocument(entry, true);
  };

  if (editor) return <EstimateEditor documentType="Proforma Invoice" estimate={editor.entry} onClose={() => setEditor(null)} onSave={saveProforma} />;

  return <main className="flex h-full min-h-0 flex-col gap-1 bg-slate-100 p-1 text-slate-800">
    <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 bg-white px-5 py-3"><h1 className="flex items-center gap-3 text-xl font-bold text-slate-700">Proforma Invoice <FiChevronDown className="h-5 w-5" /></h1><Button onClick={() => setEditor({ mode: "new" })} className="rounded-full bg-rose-600 px-5 text-white hover:bg-rose-700"><FiPlus /> Add Proforma</Button></div>

    <Card className="px-5 py-4 shadow-sm"><div className="flex flex-wrap items-center gap-3"><span className="text-sm font-bold">Filter by:</span><label className="flex min-h-10 items-center rounded-full bg-blue-50 px-4 text-sm"><select aria-label="Date preset" value={preset} onChange={(event) => setDatePreset(event.target.value)} className="cursor-pointer bg-transparent font-medium outline-none"><option>This Month</option><option>This Quarter</option><option>This Year</option><option>All Time</option><option>Custom</option></select></label><div className="flex min-h-10 flex-wrap items-center gap-2 rounded-full bg-blue-50 px-4 text-sm"><FiCalendar className="text-slate-500" /><input aria-label="Start date" type="date" value={dateFrom} onChange={(event) => { setPreset("Custom"); setDateFrom(event.target.value); }} className="w-[126px] bg-transparent outline-none" /><span>To</span><input aria-label="End date" type="date" value={dateTo} onChange={(event) => { setPreset("Custom"); setDateTo(event.target.value); }} className="w-[126px] bg-transparent outline-none" /></div><label className="flex min-h-10 items-center rounded-full bg-blue-50 px-4 text-sm"><select aria-label="Firm filter" value={firm} onChange={(event) => setFirm(event.target.value)} className="max-w-48 cursor-pointer bg-transparent font-medium outline-none">{firms.map((value) => <option key={value}>{value}</option>)}</select></label><label className="flex min-h-10 items-center rounded-full bg-blue-50 px-4 text-sm"><select aria-label="User filter" value={user} onChange={(event) => setUser(event.target.value)} className="max-w-40 cursor-pointer bg-transparent font-medium outline-none">{users.map((value) => <option key={value}>{value}</option>)}</select></label></div></Card>

    <Card className="min-h-44 p-5 shadow-sm"><div className="w-full max-w-md rounded-lg border border-violet-200 bg-violet-50/50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-base text-slate-500">Total Proformas</p><p className="text-2xl font-bold text-slate-800">{money(totals.amount)}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{visible.length} proformas <FiTrendingUp /></span></div><div className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500"><span>Converted: <b className="text-slate-800">{money(totals.converted)}</b></span><span className="text-slate-300">|</span><span>Open: <b className="text-slate-800">{money(totals.open)}</b></span></div></div></Card>

    <Card className="flex min-h-0 flex-1 flex-col shadow-sm"><div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-4 py-3"><h2 className="text-lg font-semibold text-slate-700">Transactions</h2><label className="relative text-slate-500"><FiSearch className="absolute left-3 top-2.5 h-4 w-4" /><input aria-label="Search proforma invoices" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search proformas" className="h-9 w-52 rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label></div>
      {visible.length ? <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[900px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["Date", "Reference no", "Party Name", "Amount", "Balance", "Status", "Actions"].map((heading) => <th key={heading} className="border-y border-slate-200 px-3 py-3">{heading}{heading !== "Actions" && <FiFilter className="ml-2 inline h-3.5 w-3.5" />}</th>)}</tr></thead><tbody>{visible.map((entry) => <tr key={entry.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70 hover:bg-sky-50"><td className="px-3 py-4">{entry.date ? new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-GB") : "—"}</td><td className="px-3 py-4 text-right">{entry.number}</td><td className="px-3 py-4 font-medium">{entry.customer || "Cash Sale"}</td><td className="px-3 py-4 text-right">{money(entry.amount)}</td><td className="px-3 py-4 text-right">{String(entry.status || "Open").startsWith("Converted") ? money(0) : money(entry.amount)}</td><td className={`px-3 py-4 font-medium ${String(entry.status || "").startsWith("Converted") ? "text-emerald-600" : "text-amber-600"}`}>{entry.status || "Open"}</td><td className="px-3 py-3"><div className="relative flex items-center gap-1"><button type="button" onClick={(event) => toggleMenu(`convert:${entry.id}`, event, 105)} aria-expanded={openMenu === `convert:${entry.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 font-medium text-blue-600 hover:bg-blue-50">Convert <FiChevronDown /></button>{openMenu === `convert:${entry.id}` && <div style={{ top: menuPosition.top, right: menuPosition.right }} className="fixed z-[100] w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"><button type="button" onClick={() => convertProforma(entry, "Sale")} className="block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50">Convert to Sale</button><button type="button" onClick={() => convertProforma(entry, "Sale Order")} className="block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50">Convert to Sale Order</button></div>}<button type="button" aria-label="More proforma actions" onClick={(event) => toggleMenu(entry.id, event)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><FiMoreVertical /></button>{openMenu === entry.id && <div style={{ top: menuPosition.top, right: menuPosition.right }} className="fixed z-[100] max-h-[min(560px,75vh)] w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">{["View/Edit", "Delete", "Duplicate", "Open PDF", "Preview", "Print"].map((action) => <button key={action} type="button" onClick={() => runAction(action, entry)} className={`block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50 ${action === "Delete" ? "text-rose-600" : "text-slate-700"}`}>{action}</button>)}</div>}</div></td></tr>)}</tbody></table></div> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center"><div className="grid h-32 w-32 place-items-center rounded-full bg-blue-100 text-blue-400"><FiCalendar className="h-14 w-14" /></div><h2 className="mt-6 text-lg font-semibold text-slate-800">No Transactions to show</h2><p className="mt-2 text-sm text-slate-400">You haven't added any transactions yet.</p><Button onClick={() => setEditor({ mode: "new" })} className="mt-6 rounded-full bg-rose-600 px-5 text-white hover:bg-rose-700"><FiPlus /> Add Proforma</Button></div>}
    </Card>
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4"><h2 className="text-xl font-bold">Proforma Preview</h2><button type="button" onClick={() => setPreview(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100">×</button></header><div className="p-8"><div className="text-center"><h1 className="text-2xl font-bold">My Company</h1><p className="mt-1 text-sm text-slate-500">Proforma Invoice</p></div><div className="my-8 flex justify-between gap-5 border-y py-5"><div><p className="text-sm text-slate-500">Proforma #</p><p className="font-semibold">{preview.number}</p><p className="mt-3 text-sm text-slate-500">Customer</p><p className="font-semibold">{preview.customer || "Cash Sale"}</p>{preview.phone && <p>{preview.phone}</p>}</div><div className="text-right"><p className="text-sm text-slate-500">Date</p><p className="font-semibold">{preview.date ? new Date(`${preview.date}T00:00:00`).toLocaleDateString("en-GB") : "—"}</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-100"><tr>{["#", "Item", "Description", "Qty", "Unit Price", "Amount"].map((heading) => <th key={heading} className="border-b px-3 py-3">{heading}</th>)}</tr></thead><tbody>{(preview.rows || []).map((row, index) => <tr key={row.id || index}><td className="border-b px-3 py-3">{index + 1}</td><td className="border-b px-3 py-3 font-medium">{row.item || "—"}</td><td className="border-b px-3 py-3">{row.description || "—"}</td><td className="border-b px-3 py-3">{row.qty || "—"} {row.unit}</td><td className="border-b px-3 py-3">{money(row.price)}</td><td className="border-b px-3 py-3 text-right">{money(Number(row.qty || 0) * Number(row.price || 0))}</td></tr>)}</tbody></table></div>{preview.terms && <p className="mt-4 whitespace-pre-wrap"><b>Terms &amp; Conditions:</b> {preview.terms}</p>}<p className="mt-6 text-right text-xl font-bold">Total: {money(preview.amount)}</p></div><footer className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4"><Button onClick={() => openDocument(preview)} className="border border-blue-300 text-blue-600">Open PDF</Button><Button onClick={() => openDocument(preview, true)} className="bg-blue-600 text-white">Print</Button><Button onClick={() => setPreview(null)} className="bg-slate-100 text-slate-700">Close</Button></footer></section></div>}
  </main>;
}
