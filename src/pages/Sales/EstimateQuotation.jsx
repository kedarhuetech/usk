import { useMemo, useState } from "react";
import { FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiSearch, FiTrendingUp } from "react-icons/fi";
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
  const today = new Date();
  const [estimates, setEstimates] = useState(readEstimates);
  const [dateFrom, setDateFrom] = useState(toIsoDate(startOfMonth(today)));
  const [dateTo, setDateTo] = useState(toIsoDate(endOfMonth(today)));
  const [period, setPeriod] = useState("This Month");
  const [firm, setFirm] = useState("All Firms");
  const [user, setUser] = useState("All Users");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);

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
    if (item.status === "Converted") result.converted += Number(item.amount) || 0;
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
      {visible.length ? <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[780px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["Date", "Quotation no", "Party Name", "Transaction", "Amount", "Status", "Actions"].map((title) => <th key={title} className="border-y border-slate-200 px-3 py-3">{title}{title !== "Actions" && <FiFilter className="ml-2 inline h-3.5 w-3.5" />}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70 hover:bg-sky-50"><td className="px-3 py-4">{estimateDate(item)?.toLocaleDateString("en-GB") || "—"}</td><td className="px-3 py-4">{item.number}</td><td className="px-3 py-4 font-medium">{item.customer}</td><td className="px-3 py-4">Estimate / Quotation</td><td className="whitespace-nowrap px-3 py-4 text-right">{formatMoney(item.amount)}</td><td className={`px-3 py-4 font-medium ${item.status === "Converted" ? "text-emerald-600" : "text-amber-600"}`}>{item.status}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><button type="button" onClick={() => openEdit(item)} className="rounded px-2 py-1 text-blue-700 hover:bg-blue-50">View/Edit</button><button type="button" aria-label="Delete quotation" onClick={() => removeEstimate(item)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><FiMoreVertical /></button></div></td></tr>)}</tbody></table></div> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center"><div className="grid h-32 w-32 place-items-center rounded-full bg-blue-100 text-blue-400"><FiCalendar className="h-14 w-14" /></div><h2 className="mt-6 text-lg font-semibold text-slate-800">No Transactions to show</h2><p className="mt-2 text-sm text-slate-400">You haven't added any transactions yet.</p><Button onClick={openNew} className="mt-6 rounded-full bg-rose-600 px-5 text-white hover:bg-rose-700"><FiPlus /> Add Estimate</Button></div>}
    </Card>

  </main>;
}
