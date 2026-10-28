import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiArrowDownLeft, FiArrowUpRight, FiCheckCircle, FiCreditCard, FiEdit2, FiPlus, FiSearch, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import {
  calculateBankBalances,
  formatBankAmount,
  listBankAccounts,
  listBankTransactions,
  maskAccountNumber,
  saveBankAccount,
  saveBankTransaction,
  validateBankAccount,
  validateBankTransaction,
} from "../../services/bankAccounts";

const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const emptyAccount = () => ({
  accountName: "", bankName: "", accountHolderName: "", accountNumber: "", ifsc: "", branch: "",
  openingBalance: "0", openingBalanceDate: today(), notes: "", status: "active",
});

function Dialog({ title, onClose, children, wide = false, layer = "z-50" }) {
  return (
    <div className={`fixed inset-0 ${layer} flex items-center justify-center bg-slate-950/50 p-4`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white shadow-2xl ${wide ? "max-w-4xl" : "max-w-xl"}`}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><h2 className="text-lg font-bold text-slate-900">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><FiX /></button></header>
        {children}
      </section>
    </div>
  );
}

function AccountForm({ initialAccount, accounts, onClose, onSaved }) {
  const editing = Boolean(initialAccount);
  const [recordId] = useState(() => initialAccount?.id || crypto.randomUUID());
  const [form, setForm] = useState(() => initialAccount ? { ...emptyAccount(), ...initialAccount } : emptyAccount());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const payload = { ...form, accountNumber: String(form.accountNumber).replace(/\s/g, ""), ifsc: String(form.ifsc || "").trim().toUpperCase() };
    const validation = validateBankAccount(payload);
    if (validation) { setError(validation); return; }
    const duplicate = accounts.some((account) => account.id !== initialAccount?.id && String(account.accountNumber).replace(/\s/g, "") === payload.accountNumber);
    if (duplicate) { setError("An account with this account number already exists."); return; }
    setError("");
    setSaving(true);
    try {
      const saved = await saveBankAccount({ ...payload, id: recordId });
      onSaved(saved);
    } catch (saveError) {
      setError(saveError.message || "Could not save the bank account. Check that the backend and database are available.");
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, options = {}) => (
    <label className="block text-sm font-semibold text-slate-700">{label}{options.required && <span className="text-rose-600"> *</span>}
      <input type={options.type || "text"} value={form[name] ?? ""} disabled={options.disabled || saving} required={options.required} min={options.min} step={options.step} maxLength={options.maxLength} autoComplete="off" onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 font-normal outline-none focus:border-blue-500 disabled:bg-slate-100" />
    </label>
  );

  return (
    <Dialog title={editing ? "Edit Bank Account" : "Add Bank Account"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("accountName", "Account name", { required: true, maxLength: 120 })}
          {field("bankName", "Bank name", { required: true, maxLength: 120 })}
          {field("accountHolderName", "Account holder name", { maxLength: 120 })}
          {field("accountNumber", "Account number", { required: true, maxLength: 24 })}
          {field("ifsc", "IFSC code", { maxLength: 11 })}
          {field("branch", "Branch", { maxLength: 120 })}
          {field("openingBalance", "Opening balance (₹)", { type: "number", required: true, min: 0, step: "0.01", disabled: editing })}
          {field("openingBalanceDate", "Opening balance date", { type: "date", required: true, disabled: editing })}
        </div>
        {editing && <p className="text-xs text-slate-500">Opening balance and date stay unchanged while editing account details.</p>}
        <label className="block text-sm font-semibold text-slate-700">Notes<textarea value={form.notes || ""} maxLength={1000} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} className="mt-1.5 w-full rounded-md border border-slate-300 p-3 font-normal outline-none focus:border-blue-500 disabled:bg-slate-100" /></label>
        {error && <p role="alert" className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={onClose} disabled={saving} className="border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:opacity-60">{saving ? "Saving…" : editing ? "Save Changes" : "Save Account"}</Button></footer>
      </form>
    </Dialog>
  );
}

function TransactionForm({ account, onClose, onSaved }) {
  const [recordId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ type: "money-in", amount: "", date: today(), description: "", reference: "", relatedParty: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const payload = { ...form, accountId: account.id, amount: Number(form.amount) };
    const validation = validateBankTransaction(payload);
    if (validation) { setError(validation); return; }
    setError("");
    setSaving(true);
    try {
      const saved = await saveBankTransaction({ ...payload, id: recordId });
      onSaved(saved);
    } catch (saveError) {
      setError(saveError.message || "Could not save this transaction. Check that the backend and database are available.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title="Record Bank Transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Account: <strong>{account.accountName}</strong> · {account.bankName}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">Transaction type<select value={form.type} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 font-normal"><option value="money-in">Money In / Deposit</option><option value="money-out">Money Out / Withdrawal</option></select></label>
          <label className="block text-sm font-semibold text-slate-700">Amount (₹)<input type="number" min="0.01" step="0.01" required value={form.amount} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-slate-700">Transaction date<input type="date" required value={form.date} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-slate-700">Reference (optional)<input maxLength={120} value={form.reference} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">Description<input required maxLength={240} value={form.description} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">Related party (optional)<input maxLength={120} value={form.relatedParty} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, relatedParty: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
        </div>
        {error && <p role="alert" className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={onClose} disabled={saving} className="border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:opacity-60">{saving ? "Saving…" : "Save Transaction"}</Button></footer>
      </form>
    </Dialog>
  );
}

function BankAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [editingAccount, setEditingAccount] = useState(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [detailAccountId, setDetailAccountId] = useState("");
  const [transactionAccount, setTransactionAccount] = useState(null);
  const [notice, setNotice] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [loadedAccounts, loadedTransactions] = await Promise.all([listBankAccounts(), listBankTransactions()]);
      setAccounts(Array.isArray(loadedAccounts) ? loadedAccounts : []);
      setTransactions(Array.isArray(loadedTransactions) ? loadedTransactions : []);
    } catch (error) {
      setLoadError(error.message || "Bank accounts could not be loaded. Check the backend and database connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const balancedAccounts = useMemo(() => calculateBankBalances(accounts, transactions), [accounts, transactions]);
  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return balancedAccounts.filter((account) => (
      (statusFilter === "all" || String(account.status || "active") === statusFilter)
      && (!needle || `${account.accountName} ${account.bankName} ${String(account.accountNumber || "").slice(-4)}`.toLowerCase().includes(needle))
    ));
  }, [balancedAccounts, search, statusFilter]);
  const activeAccounts = balancedAccounts.filter((account) => account.status !== "inactive");
  const totalBalance = activeAccounts.reduce((total, account) => total + Math.round(Number(account.currentBalance || 0) * 100), 0) / 100;
  const detailAccount = balancedAccounts.find((account) => account.id === detailAccountId);
  const detailHistory = transactions.filter((transaction) => (
    transaction.accountId === detailAccountId
    && (!historyFrom || transaction.date >= historyFrom)
    && (!historyTo || transaction.date <= historyTo)
  )).sort((left, right) => String(right.date).localeCompare(String(left.date)) || String(right.createdAt || "").localeCompare(String(left.createdAt || "")));

  const accountSaved = async (saved) => {
    setAccounts((current) => [saved, ...current.filter((account) => account.id !== saved.id)]);
    setShowAccountForm(false);
    setEditingAccount(null);
    setNotice(editingAccount ? "Bank account details updated." : "Bank account added.");
    if (editingAccount) setDetailAccountId(saved.id);
  };

  const transactionSaved = async () => {
    setTransactionAccount(null);
    setNotice("Bank transaction recorded. The book balance has been recalculated.");
    await refresh();
  };

  const toggleStatus = async (account) => {
    const nextStatus = account.status === "inactive" ? "active" : "inactive";
    setNotice("");
    try {
      const saved = await saveBankAccount({ ...account, status: nextStatus });
      setAccounts((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
      setNotice(nextStatus === "active" ? "Account reactivated." : "Account deactivated. Transaction history was retained.");
    } catch (error) {
      setNotice(error.message || "Could not update the account status.");
    }
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold text-blue-700">Cash &amp; Bank</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Bank Accounts</h1><p className="mt-1 text-sm text-slate-600">Manage accounts, record deposits and withdrawals, and review calculated book balances.</p></div>
          <Button onClick={() => { setEditingAccount(null); setShowAccountForm(true); }} className="bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiPlus /> Add Bank Account</Button>
        </header>

        {loadError && <Card className="flex items-start gap-2 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{loadError}</Card>}
        {notice && <Card role="status" className="flex items-start gap-2 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><FiCheckCircle className="mt-0.5 shrink-0" />{notice}</Card>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5"><p className="text-sm font-medium text-slate-500">Total recorded bank balance</p><p className="mt-2 text-2xl font-bold text-slate-900">{formatBankAmount(totalBalance)}</p><p className="mt-1 text-xs text-slate-500">Active accounts · based on opening balances and saved transactions</p></Card>
          <Card className="p-5"><p className="text-sm font-medium text-slate-500">Bank accounts</p><p className="mt-2 text-2xl font-bold text-slate-900">{accounts.length}</p><p className="mt-1 text-xs text-slate-500">{activeAccounts.length} active · {accounts.length - activeAccounts.length} inactive</p></Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3"><FiSearch className="text-slate-400" /><input aria-label="Search bank accounts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search account, bank, or last four digits" className="w-full outline-none" /></label>
            <select aria-label="Account status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="active">Active accounts</option><option value="inactive">Inactive accounts</option><option value="all">All accounts</option></select>
          </div>
          {loading ? <p className="p-10 text-center text-sm text-slate-500">Loading bank accounts…</p> : !filteredAccounts.length ? (
            <div className="px-5 py-14 text-center"><FiCreditCard className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-3 text-lg font-semibold text-slate-800">{accounts.length ? "No matching accounts" : "No bank accounts yet"}</h2><p className="mt-1 text-sm text-slate-500">{accounts.length ? "Try another search or status filter." : "Add a bank account to start recording bank activity."}</p>{!accounts.length && <Button onClick={() => setShowAccountForm(true)} className="mt-5 bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiPlus /> Add Bank Account</Button>}</div>
          ) : <div className="overflow-x-auto"><table className="min-w-[860px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Account</th><th className="px-5 py-3">Account number</th><th className="px-5 py-3 text-right">Opening balance</th><th className="px-5 py-3 text-right">Current book balance</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead><tbody>{filteredAccounts.map((account) => <tr key={account.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-5 py-4"><button type="button" onClick={() => setDetailAccountId(account.id)} className="text-left"><span className="block font-semibold text-slate-900">{account.accountName}</span><span className="text-xs text-slate-500">{account.bankName}{account.branch ? ` · ${account.branch}` : ""}</span></button></td><td className="px-5 py-4 font-mono text-slate-600">{maskAccountNumber(account.accountNumber)}</td><td className="px-5 py-4 text-right tabular-nums">{formatBankAmount(account.openingBalance)}</td><td className="px-5 py-4 text-right font-semibold tabular-nums">{formatBankAmount(account.currentBalance)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.status === "inactive" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{account.status === "inactive" ? "Inactive" : "Active"}</span></td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setDetailAccountId(account.id)} className="font-semibold text-blue-700 hover:underline">Details</button><button type="button" onClick={() => { setEditingAccount(account); setShowAccountForm(true); }} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"><FiEdit2 /> Edit</button></div></td></tr>)}</tbody></table></div>}
        </Card>
      </div>

      {showAccountForm && <AccountForm initialAccount={editingAccount} accounts={accounts} onClose={() => { setShowAccountForm(false); setEditingAccount(null); }} onSaved={accountSaved} />}
      {transactionAccount && <TransactionForm account={transactionAccount} onClose={() => setTransactionAccount(null)} onSaved={transactionSaved} />}
      {detailAccount && <Dialog title="Bank Account Details" wide layer="z-40" onClose={() => setDetailAccountId("")}>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Account name" value={detailAccount.accountName} /><Info label="Bank" value={detailAccount.bankName} /><Info label="Account number" value={maskAccountNumber(detailAccount.accountNumber)} />
            <Info label="Account holder" value={detailAccount.accountHolderName || "—"} /><Info label="IFSC" value={detailAccount.ifsc || "—"} /><Info label="Branch" value={detailAccount.branch || "—"} />
            <Info label="Opening balance" value={formatBankAmount(detailAccount.openingBalance)} /><Info label="Opening date" value={detailAccount.openingBalanceDate || "—"} /><Info label="Current book balance" value={formatBankAmount(detailAccount.currentBalance)} />
          </div>
          {detailAccount.notes && <p className="text-sm text-slate-600">{detailAccount.notes}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Transaction history</h3><p className="text-xs text-slate-500">Saved movements are retained as an append-only history.</p></div><div className="flex gap-2"><Button onClick={() => { setEditingAccount(detailAccount); setShowAccountForm(true); }} className="border border-slate-300 text-slate-700 hover:bg-slate-50"><FiEdit2 /> Edit</Button><Button onClick={() => setTransactionAccount(detailAccount)} disabled={detailAccount.status === "inactive"} className="bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:opacity-50"><FiPlus /> Record Transaction</Button><Button onClick={() => toggleStatus(detailAccount)} className={detailAccount.status === "inactive" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-amber-100 text-amber-900 hover:bg-amber-200"}>{detailAccount.status === "inactive" ? "Reactivate" : "Deactivate"}</Button></div></div>
          <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold text-slate-600">From<input type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} className="mt-1 block h-9 rounded border border-slate-300 px-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-slate-600">To<input type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} className="mt-1 block h-9 rounded border border-slate-300 px-2 text-sm font-normal" /></label><button type="button" onClick={() => { setHistoryFrom(""); setHistoryTo(""); }} className="h-9 px-2 text-sm font-semibold text-blue-700">Clear dates</button></div>
          {!detailHistory.length ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No saved bank transactions match this date range.</p> : <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description / reference</th><th className="px-4 py-3">Party</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{detailHistory.map((transaction) => <tr key={transaction.id} className="border-t border-slate-100"><td className="px-4 py-3">{transaction.date}</td><td className={`px-4 py-3 font-semibold ${transaction.type === "money-in" ? "text-emerald-700" : "text-rose-700"}`}><span className="inline-flex items-center gap-1">{transaction.type === "money-in" ? <FiArrowDownLeft /> : <FiArrowUpRight />}{transaction.type === "money-in" ? "Money In" : "Money Out"}</span></td><td className="px-4 py-3">{transaction.description}{transaction.reference && <span className="block text-xs text-slate-500">Ref: {transaction.reference}</span>}</td><td className="px-4 py-3">{transaction.relatedParty || "—"}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBankAmount(transaction.amount)}</td></tr>)}</tbody></table></div>}
        </div>
      </Dialog>}
    </div>
  );
}

function Info({ label, value }) {
  return <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p></div>;
}

export default BankAccounts;
