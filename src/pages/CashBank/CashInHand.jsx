import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiArrowDownLeft, FiArrowUpRight, FiSearch, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { calculateCashBalance, formatCashAmount, loadCashInHandData, saveCashAdjustment, validateCashAdjustment } from "../../services/cashInHand";

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function CashAdjustmentDialog({ recordedBalance, onClose, onSaved }) {
  const [actual, setActual] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [recordId] = useState(() => crypto.randomUUID());
  const difference = actual === "" ? null : Math.round((Number(actual) - recordedBalance) * 100) / 100;

  const submit = async (event) => {
    event.preventDefault();
    const validation = validateCashAdjustment({ recordedBalance, actualBalance: actual, reason });
    if (validation) { setError(validation); return; }
    setSaving(true); setError("");
    try {
      const adjustment = await saveCashAdjustment({ id: recordId, date: today(), actualBalance: Number(actual), recordedBalance, amount: difference, reason: reason.trim() });
      onSaved(adjustment);
    } catch (saveError) { setError(saveError.message || "Could not save the cash adjustment. Check that the backend and database are available."); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Adjust Cash" className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-bold">Adjust Cash</h2><button type="button" aria-label="Close" onClick={onClose} disabled={saving}><FiX /></button></header>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="rounded-lg bg-slate-50 p-4 text-sm">Current recorded balance <strong className="float-right">{formatCashAmount(recordedBalance)}</strong></div>
        <label className="block text-sm font-semibold text-slate-700">Actual physical cash counted (₹)<input autoFocus type="number" min="0" step="0.01" required value={actual} disabled={saving} onChange={(event) => setActual(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
        {difference !== null && Number.isFinite(difference) && <div className={`rounded-lg p-4 text-sm ${difference < 0 ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>Adjustment {difference > 0 ? "increase" : difference < 0 ? "decrease" : "none"}<strong className="float-right">{difference < 0 ? "−" : "+"}{formatCashAmount(Math.abs(difference))}</strong><p className="mt-1">New balance after adjustment: {formatCashAmount(Number(actual) || 0)}</p></div>}
        <label className="block text-sm font-semibold text-slate-700">Reason / note <span className="text-rose-600">*</span><textarea required maxLength={500} rows={3} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 p-3 font-normal" placeholder="Explain why the physical count differs" /></label>
        {error && <p role="alert" className="flex gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={onClose} disabled={saving} className="border border-slate-300 text-slate-700">Cancel</Button><Button type="submit" disabled={saving || difference === 0} className="bg-[#1A1F71] text-white disabled:opacity-60">{saving ? "Saving…" : "Review and Save"}</Button></footer>
      </form>
    </section>
  </div>;
}

function CashInHand() {
  const [entries, setEntries] = useState([]);
  const [complete, setComplete] = useState(false);
  const [unavailable, setUnavailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await loadCashInHandData();
      setEntries(result.entries); setComplete(result.complete); setUnavailable(result.unavailableSources);
    } catch (loadError) { setError(loadError.message || "Cash records could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(timer); }, [refresh]);

  const balance = calculateCashBalance(entries);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => (!needle || [entry.type, entry.name, entry.description, entry.reference].some((value) => String(value || "").toLowerCase().includes(needle))) && (!fromDate || entry.date >= fromDate) && (!toDate || entry.date <= toDate));
  }, [entries, query, fromDate, toDate]);

  const afterSave = async () => {
    setAdjusting(false); setNotice("Cash adjustment saved in this browser."); await refresh();
  };

  return <main className="min-h-full bg-slate-100 p-4 md:p-7">
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-950">Cash in Hand</h1><p className="mt-1 text-slate-600">Track saved cash sales, customer receipts, supplier payments, and cash count adjustments.</p></div><div className="flex gap-2"><Button onClick={() => setAdjusting(true)} disabled={loading} className="bg-[#1A1F71] text-white disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-70">Adjust Cash</Button></div></header>
      {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{notice}<button className="float-right" onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
      {error && <div role="alert" className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800"><FiAlertCircle className="mt-0.5" />{error}</div>}
      {!complete && !loading && <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-semibold">Balance may be incomplete. Some saved records could not be loaded.</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{unavailable.map((source) => <li key={source.name}><strong>{source.name}:</strong> {source.message}</li>)}</ul></div>}
      <Card className="border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current recorded cash balance</p><p className="mt-2 text-3xl font-bold text-slate-950">{loading ? "Loading…" : formatCashAmount(balance)}</p><p className="mt-2 text-sm text-slate-500">Calculated from saved cash transactions and adjustments stored in this browser.</p></Card>
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h2 className="text-lg font-bold text-slate-900">Cash transactions</h2><div className="flex flex-wrap gap-2"><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cash transactions" className="h-10 w-64 rounded-md border border-slate-300 pl-9 pr-3" /></label><label className="sr-only" htmlFor="cash-from">From date</label><input id="cash-from" aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-10 rounded-md border border-slate-300 px-2" /><label className="sr-only" htmlFor="cash-to">To date</label><input id="cash-to" aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-10 rounded-md border border-slate-300 px-2" /></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Name / Description</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">
          {!loading && filtered.map((entry) => <tr key={entry.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(entry)}><td className="px-4 py-3"><span className={`inline-flex items-center gap-2 font-medium ${entry.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>{entry.direction === "in" ? <FiArrowDownLeft /> : <FiArrowUpRight />}{entry.type}</span></td><td className="px-4 py-3"><span className="font-medium text-slate-900">{entry.name}</span>{entry.reference && <span className="ml-2 text-slate-500">{entry.reference}</span>}</td><td className="px-4 py-3 text-slate-600">{entry.date || "—"}</td><td className={`px-4 py-3 text-right font-semibold ${entry.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>{entry.direction === "in" ? "+" : "−"}{formatCashAmount(entry.amount)}</td></tr>)}
          {loading && <tr><td colSpan="4" className="px-4 py-14 text-center text-slate-500">Loading cash transactions…</td></tr>}
          {!loading && filtered.length === 0 && <tr><td colSpan="4" className="px-4 py-14 text-center text-slate-500">{entries.length ? "No transactions match these filters." : "No saved cash transactions yet."}</td></tr>}
        </tbody></table></div>
      </Card>
      <p className="text-xs text-slate-500">Only saved cash payment records are included. Bank and credit activity is excluded. Cash receipts, payments, and expense pages are not yet available in this app.</p>
    </div>
    {adjusting && <CashAdjustmentDialog recordedBalance={balance} onClose={() => setAdjusting(false)} onSaved={afterSave} />}
    {selected && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" aria-label="Cash transaction details" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><header className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Transaction details</h2><button aria-label="Close" onClick={() => setSelected(null)}><FiX /></button></header><dl className="space-y-3 text-sm">{[["Type", selected.type], ["Name", selected.name], ["Date", selected.date || "—"], ["Amount", `${selected.direction === "in" ? "+" : "−"}${formatCashAmount(selected.amount)}`], ["Payment method", selected.paymentMethod], ["Reference", selected.reference || "—"], ["Description", selected.description]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-900">{value}</dd></div>)}</dl></section></div>}
  </main>;
}

export default CashInHand;
