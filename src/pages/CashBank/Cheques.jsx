import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiArrowDownLeft, FiArrowUpRight, FiCheckCircle, FiEye, FiFileText, FiPlus, FiSearch, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { CHEQUE_STATUSES, CHEQUE_TYPES, allowedChequeStatuses, filterCheques, formatChequeAmount, initialChequeStatus, summarizeCheques, validateCheque } from "../../services/cheques";
import { createCheque, deleteOrCancelCheque, getAllCheques, updateCheque, updateChequeStatus } from "../../services/chequesRepository";

const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const blankCheque = (type = CHEQUE_TYPES.RECEIVED) => ({
  type,
  partyName: "",
  chequeNumber: "",
  bankName: "",
  amount: "",
  chequeDate: localDate(),
  expectedDate: localDate(),
  notes: "",
  status: initialChequeStatus(type),
});

function Dialog({ title, onClose, children, wide = false }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><h2 className="text-lg font-bold text-slate-900">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><FiX /></button></header>{children}</section></div>;
}

function ChequeForm({ initialCheque, onClose, onSaved }) {
  const editing = Boolean(initialCheque);
  const [form, setForm] = useState(() => initialCheque ? { ...initialCheque } : blankCheque());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const payload = { ...form, partyName: form.partyName.trim(), chequeNumber: form.chequeNumber.trim(), bankName: form.bankName.trim(), amount: Number(form.amount), notes: form.notes.trim() };
    const validation = validateCheque(payload);
    if (validation) { setError(validation); return; }
    setSaving(true); setError("");
    try {
      const saved = editing ? await updateCheque(initialCheque.id, Object.fromEntries(Object.entries(payload).filter(([key]) => !["id", "createdAt", "updatedAt", "history", "status"].includes(key)))) : await createCheque(payload);
      await onSaved(saved);
    } catch (saveError) { setError(saveError.message || "Could not save this cheque in browser storage."); }
    finally { setSaving(false); }
  };

  const fieldClass = "mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 font-normal outline-none focus:border-blue-500 disabled:bg-slate-100";
  return <Dialog title={editing ? "Edit Cheque" : "Add Cheque"} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">Cheque type<span className="text-rose-600"> *</span><select required value={form.type} disabled={saving || editing} onChange={(event) => { setField("type", event.target.value); setField("status", initialChequeStatus(event.target.value)); }} className={fieldClass}><option value={CHEQUE_TYPES.RECEIVED}>Cheque Received</option><option value={CHEQUE_TYPES.ISSUED}>Cheque Issued</option></select></label>
        <label className="block text-sm font-semibold text-slate-700">Party name<span className="text-rose-600"> *</span><input required maxLength={160} value={form.partyName} disabled={saving} onChange={(event) => setField("partyName", event.target.value)} className={fieldClass} /></label>
        <label className="block text-sm font-semibold text-slate-700">Cheque number<span className="text-rose-600"> *</span><input required maxLength={50} value={form.chequeNumber} disabled={saving} onChange={(event) => setField("chequeNumber", event.target.value)} className={fieldClass} autoComplete="off" /></label>
        <label className="block text-sm font-semibold text-slate-700">Bank name<span className="text-rose-600"> *</span><input required maxLength={120} value={form.bankName} disabled={saving} onChange={(event) => setField("bankName", event.target.value)} className={fieldClass} /></label>
        <label className="block text-sm font-semibold text-slate-700">Amount (₹)<span className="text-rose-600"> *</span><input type="number" min="0.01" step="0.01" required value={form.amount} disabled={saving} onChange={(event) => setField("amount", event.target.value)} className={fieldClass} /></label>
        <label className="block text-sm font-semibold text-slate-700">Cheque date<span className="text-rose-600"> *</span><input type="date" required value={form.chequeDate} disabled={saving} onChange={(event) => setField("chequeDate", event.target.value)} className={fieldClass} /></label>
        <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">Expected {form.type === CHEQUE_TYPES.RECEIVED ? "deposit" : "payment / clearance"} date<span className="text-rose-600"> *</span><input type="date" required value={form.expectedDate} disabled={saving} onChange={(event) => setField("expectedDate", event.target.value)} className={fieldClass} /></label>
      </div>
      {editing && <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">Cheque type, status, and status history are retained. Use the status control in the register to record a status change.</p>}
      <label className="block text-sm font-semibold text-slate-700">Notes (optional)<textarea maxLength={1000} rows={3} value={form.notes} disabled={saving} onChange={(event) => setField("notes", event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 p-3 font-normal" /></label>
      {error && <p role="alert" className="flex gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</p>}
      <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={onClose} disabled={saving} className="border border-slate-300 text-slate-700">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A1F71] text-white disabled:opacity-60">{saving ? "Saving…" : editing ? "Save Changes" : "Save Cheque"}</Button></footer>
    </form>
  </Dialog>;
}

function StatusBadge({ status }) {
  const style = status === "Cleared" ? "bg-emerald-50 text-emerald-700" : status === "Bounced" || status === "Cancelled" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{status}</span>;
}

function ChequeDetails({ cheque, onClose }) {
  return <Dialog title="Cheque details" onClose={onClose}>
    <div className="space-y-5 p-5"><div className="grid grid-cols-2 gap-4">{[["Type", `Cheque ${cheque.type}`], ["Status", cheque.status], ["Party", cheque.partyName], ["Cheque number", cheque.chequeNumber], ["Bank", cheque.bankName], ["Amount", formatChequeAmount(cheque.amount)], ["Cheque date", cheque.chequeDate], [cheque.type === CHEQUE_TYPES.RECEIVED ? "Expected deposit" : "Expected payment / clearance", cheque.expectedDate], ["Notes", cheque.notes || "—"]].map(([label, value]) => <div key={label} className="min-w-0"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p></div>)}</div>
      <div><h3 className="mb-2 text-sm font-bold text-slate-900">Status history</h3>{(cheque.history || []).length ? <ol className="space-y-2 border-l-2 border-slate-200 pl-4">{cheque.history.map((event, index) => <li key={`${event.at}-${index}`} className="text-sm"><span className="font-semibold">{event.status}</span><span className="ml-2 text-xs text-slate-500">{new Date(event.at).toLocaleString()}</span>{event.note && <p className="text-slate-600">{event.note}</p>}</li>)}</ol> : <p className="text-sm text-slate-500">No status changes recorded.</p>}</div>
      <p className="rounded-md bg-blue-50 p-3 text-xs text-blue-800">This is a tracking register only. Status changes are manual and do not confirm bank clearance or post to cash / bank balances.</p>
    </div>
  </Dialog>;
}

function Cheques() {
  const [cheques, setCheques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [pendingStatuses, setPendingStatuses] = useState({});
  const [updatingId, setUpdatingId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { setCheques(await getAllCheques()); }
    catch (error) { setLoadError(error.message || "Could not read cheques from this browser's storage."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(timer); }, [refresh]);

  const summary = useMemo(() => summarizeCheques(cheques), [cheques]);
  const filtered = useMemo(() => filterCheques(cheques, { query: search, type: typeFilter, status: statusFilter }), [cheques, search, typeFilter, statusFilter]);

  const saved = async (record) => {
    setShowForm(false); setEditing(null); setNotice(`Cheque ${record.chequeNumber} saved in this browser.`); await refresh();
  };

  const changeStatus = async (cheque) => {
    const status = pendingStatuses[cheque.id];
    if (!status || status === cheque.status) return;
    setUpdatingId(cheque.id); setNotice("");
    try {
      const savedRecord = await updateChequeStatus(cheque.id, status);
      setPendingStatuses((current) => { const next = { ...current }; delete next[cheque.id]; return next; });
      setNotice(`Cheque marked ${savedRecord.status}. This is a manual tracking status.`);
      await refresh();
    } catch (error) { setNotice(error.message || "Status could not be updated."); }
    finally { setUpdatingId(""); }
  };

  const cancelCheque = async (cheque) => {
    if (!window.confirm(`Cancel cheque ${cheque.chequeNumber} for ${cheque.partyName}? The record will be retained in history.`)) return;
    setUpdatingId(cheque.id); setNotice("");
    try { await deleteOrCancelCheque(cheque.id); setNotice(`Cheque ${cheque.chequeNumber} cancelled; its record was retained.`); await refresh(); }
    catch (error) { setNotice(error.message || "Cheque could not be cancelled."); }
    finally { setUpdatingId(""); }
  };

  const summaryCards = [
    { label: "Received cheques", value: formatChequeAmount(summary.receivedAmount), icon: FiArrowDownLeft, color: "text-emerald-700" },
    { label: "Issued cheques", value: formatChequeAmount(summary.issuedAmount), icon: FiArrowUpRight, color: "text-blue-700" },
    { label: "Pending", value: summary.pendingCount, icon: FiFileText, color: "text-amber-700" },
    { label: "Cleared", value: summary.clearedCount, icon: FiCheckCircle, color: "text-emerald-700" },
  ];

  return <main className="min-h-full bg-slate-100 p-4 sm:p-6"><div className="mx-auto max-w-screen-2xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-blue-700">Cash &amp; Bank</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Cheques</h1><p className="mt-1 text-sm text-slate-600">Track cheques received from customers and issued to suppliers.</p></div><Button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiPlus /> Add Cheque</Button></header>
    {loadError && <Card role="alert" className="flex gap-2 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><FiAlertCircle className="mt-0.5" />{loadError}</Card>}
    {notice && <Card role="status" className="flex justify-between gap-2 border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice("")}><FiX /></button></Card>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaryCards.map(({ label, value, icon: Icon, color }) => <Card key={label} className="flex items-center gap-3 p-4"><span className={`rounded-full bg-slate-100 p-3 ${color}`}><Icon /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></div></Card>)}</div>
    <Card className="overflow-hidden shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><h2 className="text-lg font-bold text-slate-900">Cheque register</h2><div className="flex flex-wrap gap-2"><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input aria-label="Search cheques" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search party, number, bank" className="h-10 w-64 rounded-md border border-slate-300 pl-9 pr-3" /></label><select aria-label="Filter by cheque type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3"><option value="all">All types</option><option value={CHEQUE_TYPES.RECEIVED}>Received</option><option value={CHEQUE_TYPES.ISSUED}>Issued</option></select><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3"><option value="all">All statuses</option>{CHEQUE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div></div>
      {loading ? <p className="p-14 text-center text-sm text-slate-500">Loading cheques…</p> : filtered.length === 0 ? <div className="flex flex-col items-center px-5 py-14 text-center"><span className="rounded-full bg-blue-50 p-4 text-2xl text-blue-800"><FiFileText /></span><h3 className="mt-4 text-lg font-bold text-slate-900">{cheques.length ? "No cheques match these filters" : "No cheques recorded yet"}</h3><p className="mt-1 text-sm text-slate-600">{cheques.length ? "Change or clear the filters to see other cheque records." : "Add a received or issued cheque to start your register."}</p>{!cheques.length && <Button onClick={() => { setEditing(null); setShowForm(true); }} className="mt-4 bg-[#1A1F71] text-white"><FiPlus /> Add Cheque</Button>}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Type</th><th className="px-3 py-3">Cheque No.</th><th className="px-3 py-3">Party</th><th className="px-3 py-3">Bank</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Cheque date</th><th className="px-3 py-3">Expected date</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((cheque) => <tr key={cheque.id} className="hover:bg-slate-50"><td className="px-3 py-3"><span className={`inline-flex items-center gap-1 font-medium ${cheque.type === CHEQUE_TYPES.RECEIVED ? "text-emerald-700" : "text-blue-700"}`}>{cheque.type === CHEQUE_TYPES.RECEIVED ? <FiArrowDownLeft /> : <FiArrowUpRight />}{cheque.type}</span></td><td className="px-3 py-3 font-semibold text-slate-900">{cheque.chequeNumber}</td><td className="px-3 py-3">{cheque.partyName}</td><td className="px-3 py-3">{cheque.bankName}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{formatChequeAmount(cheque.amount)}</td><td className="px-3 py-3">{cheque.chequeDate}</td><td className="px-3 py-3">{cheque.expectedDate}</td><td className="px-3 py-3"><StatusBadge status={cheque.status} /></td><td className="px-3 py-3"><div className="flex items-center gap-2"><button type="button" title="View" aria-label={`View cheque ${cheque.chequeNumber}`} onClick={() => setViewing(cheque)} className="rounded p-1.5 text-slate-600 hover:bg-slate-200"><FiEye /></button><button type="button" disabled={cheque.status === "Cancelled"} onClick={() => { setEditing(cheque); setShowForm(true); }} className="rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:text-slate-400">Edit</button>{allowedChequeStatuses(cheque).length > 0 && <><select aria-label={`Next status for cheque ${cheque.chequeNumber}`} value={pendingStatuses[cheque.id] || ""} disabled={updatingId === cheque.id} onChange={(event) => setPendingStatuses((current) => ({ ...current, [cheque.id]: event.target.value }))} className="h-8 max-w-32 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Update status</option>{allowedChequeStatuses(cheque).map((status) => <option key={status}>{status}</option>)}</select><button type="button" disabled={!pendingStatuses[cheque.id] || updatingId === cheque.id} onClick={() => void changeStatus(cheque)} className="rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:text-slate-400">Save</button></>}{cheque.status !== "Cancelled" && allowedChequeStatuses(cheque).includes("Cancelled") && <button type="button" disabled={updatingId === cheque.id} onClick={() => void cancelCheque(cheque)} className="rounded px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Cancel</button>}</div></td></tr>)}</tbody></table></div>}
    </Card>
    <p className="text-xs text-slate-500">Cheques are stored only in this browser and are not shared between browsers or devices. This tracking register does not change cash or bank balances and does not verify bank clearance.</p>
  </div>
  {showForm && <ChequeForm key={editing?.id || "new-cheque"} initialCheque={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={saved} />}
  {viewing && <ChequeDetails cheque={viewing} onClose={() => setViewing(null)} />}
  </main>;
}

export default Cheques;
