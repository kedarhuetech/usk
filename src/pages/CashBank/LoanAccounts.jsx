import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiCreditCard, FiEdit2, FiEye, FiPlus, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { calculateLoanOutstanding, calculateLoanEmi, estimateUpcomingEmiDate, formatLoanAmount, loanEmi, summarizeLoans, validateLoan, validateRepayment } from "../../services/loanAccounts";
import { closeLoan, createLoan, getAllLoans, recordRepayment, updateLoan } from "../../services/loanAccountsRepository";

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const blankLoan = () => ({ loanName: "", lenderName: "", originalAmount: "", annualInterestRate: "", startDate: today(), tenureMonths: "12", repaymentFrequency: "Monthly", emiOverride: "", firstEmiDate: today(), notes: "" });

function Dialog({ title, onClose, children, wide = false }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white shadow-2xl ${wide ? "max-w-4xl" : "max-w-2xl"}`}><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><h2 className="text-lg font-bold text-slate-900">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><FiX /></button></header>{children}</section></div>;
}

function LoanForm({ initialLoan, onClose, onSaved }) {
  const editing = Boolean(initialLoan);
  const [form, setForm] = useState(() => initialLoan ? { ...initialLoan } : blankLoan());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const estimate = calculateLoanEmi(form.originalAmount, form.annualInterestRate, form.tenureMonths);
  const agreedEmi = form.emiOverride === "" ? estimate : Number(form.emiOverride);
  const inputClass = "mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 font-normal outline-none focus:border-blue-500 disabled:bg-slate-100";

  const submit = async (event) => {
    event.preventDefault();
    const payload = { ...form, loanName: form.loanName.trim(), lenderName: form.lenderName.trim(), originalAmount: Number(form.originalAmount), annualInterestRate: Number(form.annualInterestRate), tenureMonths: Number(form.tenureMonths), emiOverride: form.emiOverride === "" ? "" : Number(form.emiOverride), notes: form.notes.trim() };
    const validation = validateLoan(payload);
    if (validation) { setError(validation); return; }
    setSaving(true); setError("");
    try {
      const editable = Object.fromEntries(Object.entries(payload).filter(([key]) => !["id", "status", "repayments", "statusHistory", "createdAt", "updatedAt"].includes(key)));
      await (editing ? updateLoan(initialLoan.id, editable) : createLoan(editable));
      await onSaved();
    } catch (saveError) { setError(saveError.message || "Could not save the loan in browser storage."); }
    finally { setSaving(false); }
  };

  return <Dialog title={editing ? "Edit Loan Account" : "Add Loan Account"} onClose={onClose} wide><form onSubmit={submit} className="space-y-4 p-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold text-slate-700">Loan name *<input required maxLength={120} value={form.loanName} disabled={saving} onChange={(event) => setField("loanName", event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Lender / bank name *<input required maxLength={160} value={form.lenderName} disabled={saving} onChange={(event) => setField("lenderName", event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Original loan amount (₹) *<input type="number" min="0.01" step="0.01" required value={form.originalAmount} disabled={saving || editing && Boolean(initialLoan.repayments?.length)} onChange={(event) => setField("originalAmount", event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Annual interest rate (%) *<input type="number" min="0" max="100" step="0.01" required value={form.annualInterestRate} disabled={saving} onChange={(event) => setField("annualInterestRate", event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Loan start date *<input type="date" required value={form.startDate} disabled={saving} onChange={(event) => setField("startDate", event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Tenure (months) *<input type="number" min="1" max="1200" step="1" required value={form.tenureMonths} disabled={saving} onChange={(event) => setField("tenureMonths", event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Repayment frequency<select value={form.repaymentFrequency} disabled={saving} onChange={(event) => setField("repaymentFrequency", event.target.value)} className={inputClass}><option>Monthly</option></select></label>
      <label className="block text-sm font-semibold text-slate-700">First EMI date *<input type="date" required value={form.firstEmiDate} disabled={saving} onChange={(event) => setField("firstEmiDate", event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Loan status<select value={editing ? initialLoan.status : "Active"} disabled className={inputClass}><option>Active</option><option>Closed</option></select></label>
      <label className="block text-sm font-semibold text-slate-700">EMI override (₹, optional)<input type="number" min="0.01" step="0.01" value={form.emiOverride} disabled={saving} onChange={(event) => setField("emiOverride", event.target.value)} className={inputClass} placeholder="Use calculated estimate" /></label>
      <div className="flex items-end rounded-md bg-blue-50 p-3 text-sm text-blue-900"><div><span className="text-xs font-semibold uppercase">{form.emiOverride ? "Agreed EMI" : "Estimated monthly EMI"}</span><strong className="ml-2 text-lg">{formatLoanAmount(agreedEmi)}</strong><p className="text-xs">EMI is an estimate; lender terms may differ.</p></div></div>
    </div>
    {editing && initialLoan.repayments?.length > 0 && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Original amount is locked because repayments have been recorded. You can still edit other loan details.</p>}
    <label className="block text-sm font-semibold text-slate-700">Notes (optional)<textarea maxLength={1000} rows={3} value={form.notes || ""} disabled={saving} onChange={(event) => setField("notes", event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 p-3 font-normal" /></label>
    {error && <p role="alert" className="flex gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</p>}
    <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={onClose} disabled={saving} className="border border-slate-300 text-slate-700">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A1F71] text-white disabled:opacity-60">{saving ? "Saving…" : editing ? "Save Changes" : "Save Loan"}</Button></footer>
  </form></Dialog>;
}

function RepaymentForm({ loan, onCancel, onSaved }) {
  const [amountPaid, setAmountPaid] = useState("");
  const [principalPaid, setPrincipalPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [repaymentId] = useState(() => crypto.randomUUID());
  const interest = Math.round((Number(amountPaid || 0) - Number(principalPaid || 0)) * 100) / 100;

  const submit = async (event) => {
    event.preventDefault();
    const repayment = { id: repaymentId, paymentDate, amountPaid: Number(amountPaid), principalPaid: Number(principalPaid), reference, notes };
    const validation = validateRepayment(repayment, loan);
    if (validation) { setError(validation); return; }
    setSaving(true); setError("");
    try { await recordRepayment(loan.id, repayment); await onSaved(); }
    catch (saveError) { setError(saveError.message || "Could not record the repayment."); }
    finally { setSaving(false); }
  };
  const inputClass = "mt-1 h-9 w-full rounded border border-slate-300 px-2 font-normal";
  return <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold">Record repayment</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Payment date *<input type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={inputClass} /></label><label className="text-xs font-semibold text-slate-600">Total paid (₹) *<input type="number" min="0.01" step="0.01" required value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} className={inputClass} /></label><label className="text-xs font-semibold text-slate-600">Principal portion (₹) *<input type="number" min="0" step="0.01" required value={principalPaid} onChange={(event) => setPrincipalPaid(event.target.value)} className={inputClass} /></label><div className="self-end rounded bg-white p-2 text-xs text-slate-600">Interest / charges portion: <strong>{formatLoanAmount(Math.max(interest, 0))}</strong></div><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Reference (optional)<input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} /></label><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Notes (optional)<textarea maxLength={500} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2 font-normal" /></label></div><p className="text-xs text-slate-500">Enter the principal portion shown by the lender. Outstanding balance is an estimate based on principal payments only.</p>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><Button onClick={onCancel} disabled={saving} className="border border-slate-300 text-slate-700">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A1F71] text-white disabled:opacity-60">{saving ? "Saving…" : "Save Repayment"}</Button></div></form>;
}

function LoanDetails({ loan, onClose, onRepayment, onCloseLoan }) {
  const [showRepayment, setShowRepayment] = useState(false);
  const repayments = [...(loan.repayments || [])].sort((left, right) => String(right.paymentDate).localeCompare(String(left.paymentDate)));
  return <Dialog title={loan.loanName} onClose={onClose} wide><div className="space-y-5 p-5"><div className="grid gap-4 sm:grid-cols-3">{[["Lender", loan.lenderName], ["Status", loan.status], ["Original amount", formatLoanAmount(loan.originalAmount)], ["Estimated outstanding principal", formatLoanAmount(calculateLoanOutstanding(loan))], ["Annual interest", `${loan.annualInterestRate}%`], ["Tenure", `${loan.tenureMonths} months`], [loan.emiOverride ? "Agreed EMI" : "Estimated EMI", formatLoanAmount(loanEmi(loan))], ["Start date", loan.startDate], ["First EMI date", loan.firstEmiDate], ["Estimated next EMI date", estimateUpcomingEmiDate(loan)], ["Repayment frequency", loan.repaymentFrequency], ["Notes", loan.notes || "—"]].map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-900">{value}</p></div>)}</div><p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Outstanding principal is estimated as original principal minus recorded principal portions. The next EMI date advances once per recorded repayment; interest accrual and lender statements are not verified.</p>
    {loan.status === "Active" && !showRepayment && <Button onClick={() => setShowRepayment(true)} className="bg-blue-600 text-white">Record Repayment</Button>}
    {showRepayment && <RepaymentForm loan={loan} onCancel={() => setShowRepayment(false)} onSaved={async () => { setShowRepayment(false); await onRepayment(); }} />}
    <section><h3 className="mb-2 font-bold text-slate-900">Repayment history</h3>{repayments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2">Date</th><th className="p-2 text-right">Paid</th><th className="p-2 text-right">Principal</th><th className="p-2 text-right">Interest / charges</th><th className="p-2">Reference</th></tr></thead><tbody>{repayments.map((repayment) => <tr key={repayment.id} className="border-t"><td className="p-2">{repayment.paymentDate}</td><td className="p-2 text-right">{formatLoanAmount(repayment.amountPaid)}</td><td className="p-2 text-right">{formatLoanAmount(repayment.principalPaid)}</td><td className="p-2 text-right">{formatLoanAmount(repayment.interestPaid)}</td><td className="p-2">{repayment.reference || "—"}</td></tr>)}</tbody></table></div> : <p className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">No repayments recorded.</p>}</section>
    {loan.status === "Active" && <div className="flex justify-end"><Button onClick={onCloseLoan} className="border border-rose-200 text-rose-700 hover:bg-rose-50">Mark Loan Closed</Button></div>}</div></Dialog>;
}

function LoanAccounts() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setLoans(await getAllLoans()); }
    catch (loadError) { setError(loadError.message || "Loan accounts could not be loaded from browser storage."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(timer); }, [refresh]);
  const summary = useMemo(() => summarizeLoans(loans), [loans]);
  const selected = loans.find((loan) => loan.id === selectedId);

  const formSaved = async () => { setShowForm(false); setEditing(null); setNotice(editing ? "Loan details updated." : "Loan account saved in this browser."); await refresh(); };
  const repaySaved = async () => { setNotice("Repayment recorded in the loan register only."); await refresh(); };
  const markClosed = async () => {
    if (!selected || !window.confirm(`Mark ${selected.loanName} as closed? The loan and repayment history will be retained.`)) return;
    try { await closeLoan(selected.id); setNotice("Loan marked closed; history retained."); await refresh(); }
    catch (closeError) { setError(closeError.message || "Loan could not be closed."); }
  };

  return <main className="min-h-full bg-slate-100 p-4 sm:p-6"><div className="mx-auto max-w-screen-2xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-blue-700">Cash &amp; Bank</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Loan Accounts</h1><p className="mt-1 text-sm text-slate-600">Track loan terms, estimated EMIs, principal outstanding, and repayments.</p></div><Button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiPlus /> Add Loan Account</Button></header>
    {error && <Card role="alert" className="flex gap-2 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><FiAlertCircle className="mt-0.5" />{error}</Card>}{notice && <Card role="status" className="flex justify-between gap-2 border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice("")}><FiX /></button></Card>}
    <div className="grid gap-3 sm:grid-cols-3">{[["Outstanding principal (estimate)", formatLoanAmount(summary.outstanding), FiCreditCard], ["Active loans", summary.activeCount, FiCheckCircle], ["Monthly EMI (active loans)", formatLoanAmount(summary.monthlyEmi), FiCreditCard]].map(([label, value, Icon]) => <Card key={label} className="flex items-center gap-3 p-4"><span className="rounded-full bg-blue-50 p-3 text-blue-800"><Icon /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{loading ? "Loading…" : value}</p></div></Card>)}</div>
    <Card className="overflow-hidden shadow-sm"><div className="border-b border-slate-200 p-4"><h2 className="text-lg font-bold text-slate-900">Loan register</h2></div>{loading ? <p className="p-14 text-center text-sm text-slate-500">Loading loan accounts…</p> : loans.length === 0 ? <div className="flex flex-col items-center px-5 py-14 text-center"><span className="rounded-full bg-blue-50 p-4 text-2xl text-blue-800"><FiCreditCard /></span><h3 className="mt-4 text-lg font-bold text-slate-900">No loan accounts yet</h3><p className="mt-1 text-sm text-slate-600">Add a loan to calculate an estimated EMI and track repayments.</p><Button onClick={() => { setEditing(null); setShowForm(true); }} className="mt-4 bg-[#1A1F71] text-white"><FiPlus /> Add Loan Account</Button></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Loan</th><th className="px-3 py-3">Lender</th><th className="px-3 py-3 text-right">Original amount</th><th className="px-3 py-3 text-right">Outstanding</th><th className="px-3 py-3">Rate</th><th className="px-3 py-3">Tenure</th><th className="px-3 py-3 text-right">Monthly EMI</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loans.map((loan) => <tr key={loan.id} className="hover:bg-slate-50"><td className="px-3 py-3 font-semibold text-slate-900">{loan.loanName}</td><td className="px-3 py-3">{loan.lenderName}</td><td className="px-3 py-3 text-right tabular-nums">{formatLoanAmount(loan.originalAmount)}</td><td className="px-3 py-3 text-right tabular-nums">{formatLoanAmount(calculateLoanOutstanding(loan))}</td><td className="px-3 py-3">{loan.annualInterestRate}%</td><td className="px-3 py-3">{loan.tenureMonths} mo</td><td className="px-3 py-3 text-right tabular-nums">{formatLoanAmount(loanEmi(loan))}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${loan.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{loan.status}</span></td><td className="px-3 py-3"><div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedId(loan.id)} aria-label={`View ${loan.loanName}`} title="View details" className="rounded p-1.5 text-slate-600 hover:bg-slate-200"><FiEye /></button>{loan.status === "Active" && <button type="button" onClick={() => { setEditing(loan); setShowForm(true); }} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"><FiEdit2 /> Edit</button>}</div></td></tr>)}</tbody></table></div>}</Card>
    <p className="text-xs text-slate-500">Loan records and repayments are stored only in this browser. EMI is an estimate unless you enter an agreed override. Outstanding is estimated from principal portions you record; this register does not verify lender balances or post repayments to cash or bank accounts.</p>
  </div>
  {showForm && <LoanForm key={editing?.id || "new-loan"} initialLoan={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={formSaved} />}
  {selected && <LoanDetails loan={selected} onClose={() => setSelectedId("")} onRepayment={repaySaved} onCloseLoan={markClosed} />}
  </main>;
}

export default LoanAccounts;
