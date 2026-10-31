import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiPrinter, FiSearch } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { getPurchaseBills, replacePurchaseBills, savePurchaseBill } from "../../services/purchaseBillsStorage";

const money = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB") : "—";
const billTotal = (bill) => Number(bill.totals?.finalTotal ?? bill.totals?.grandTotal ?? bill.totalAmount ?? 0);
const billPaid = (bill) => Number(bill.totals?.received ?? bill.paidAmount ?? 0);

export default function PurchaseBills() {
  const navigate = useNavigate();
  const [records, setRecords] = useState(() => getPurchaseBills());
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Purchase Invoices");
  const visible = useMemo(() => records.filter((bill) => {
    const status = billPaid(bill) >= billTotal(bill) ? "Paid" : "Unpaid";
    const text = `${bill.form?.customer || bill.partyName || ""} ${bill.form?.invoiceNumber || bill.invoiceNumber || ""}`.toLowerCase();
    return (!fromDate || (bill.form?.invoiceDate || bill.date || "") >= fromDate)
      && (!toDate || (bill.form?.invoiceDate || bill.date || "") <= toDate)
      && (statusFilter === "All Purchase Invoices" || statusFilter === status)
      && text.includes(search.toLowerCase().trim());
  }).sort((a, b) => (b.form?.invoiceDate || b.date || "").localeCompare(a.form?.invoiceDate || a.date || "")), [records, search, fromDate, toDate, statusFilter]);
  const total = visible.reduce((sum, bill) => sum + billTotal(bill), 0);
  const paid = visible.reduce((sum, bill) => sum + billPaid(bill), 0);
  const unpaid = Math.max(0, total - paid);
  const refresh = (next) => { setRecords(next); replacePurchaseBills(next); };
  const addPurchase = () => navigate("/purchase-expense/purchase-bills/new", { state: { from: "/purchase-expense/purchase-bills", localOnlyPurchase: true } });
  const remove = (bill) => {
    if (!window.confirm(`Delete purchase bill ${bill.form?.invoiceNumber || bill.invoiceNumber || ""}?`)) return;
    refresh(records.filter((entry) => entry.id !== bill.id));
    setMenuId("");
  };
  const duplicate = (bill) => {
    const copy = { ...bill, id: `purchase-${Date.now()}`, invoiceId: `purchase-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), form: { ...bill.form, invoiceNumber: String(records.length + 1) } };
    refresh([savePurchaseBill(copy), ...records]);
    setMenuId("");
  };
  const print = () => window.print();
  const exportCsv = () => {
    const rows = [["Date", "Invoice No.", "Party Name", "Payment Type", "Amount", "Balance Due", "Status"], ...visible.map((bill) => {
      const amount = billTotal(bill), received = billPaid(bill);
      return [bill.form?.invoiceDate || bill.date || "", bill.form?.invoiceNumber || bill.invoiceNumber || "", bill.form?.customer || bill.partyName || "", bill.form?.paymentType || "Cash", amount, Math.max(0, amount - received), received >= amount ? "Paid" : "Unpaid"];
    })];
    const content = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); link.download = "purchase-bills.csv"; link.click(); URL.revokeObjectURL(link.href);
  };

  return <main className="flex h-full min-h-0 flex-col gap-1.5 bg-slate-100 p-1.5 text-slate-700">
    <header className="flex min-h-[68px] items-center justify-between bg-white px-5"><h1 className="text-2xl font-bold">Purchase Bills</h1><div className="flex gap-3"><Button onClick={addPurchase} className="rounded-full bg-rose-600 px-6 text-white"><FiPlus /> Add Purchase</Button></div></header>
    <Card className="shrink-0 p-5"><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-xl font-semibold">{statusFilter}<FiChevronDown /><select aria-label="Invoice filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="absolute h-8 w-64 cursor-pointer opacity-0"><option>All Purchase Invoices</option><option>Paid</option><option>Unpaid</option></select></label><span className="flex items-center gap-2 rounded border px-3 py-2"><FiCalendar /><input aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />To<input aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></span><select className="rounded border px-4 py-3"><option>sai kirana stores</option></select><select className="rounded border px-4 py-3"><option>Admin</option></select><button onClick={exportCsv} className="ml-auto flex flex-col items-center text-sm"><span className="text-2xl font-bold text-emerald-700">▦</span>Excel Report</button><button onClick={print} className="flex flex-col items-center text-sm"><FiPrinter className="text-2xl" />Print</button></div><div className="mt-5 flex flex-wrap items-center gap-5"><div className="min-w-56 rounded-xl bg-blue-100 px-5 py-4"><p>Paid</p><strong className="text-2xl">{money(paid)}</strong></div><span className="text-2xl font-bold">+</span><div className="min-w-56 rounded-xl bg-blue-100 px-5 py-4"><p>Unpaid</p><strong className="text-2xl">{money(unpaid)}</strong></div><span className="text-2xl font-bold">=</span><div className="min-w-56 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-400 py-4"><p>Total</p><strong className="text-2xl">{money(total)}</strong></div></div></Card>
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="flex shrink-0 items-center justify-between px-4 py-4"><h2 className="text-lg font-semibold">TRANSACTIONS</h2><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search purchases" className="h-10 w-80 rounded border pl-9 pr-3" /></label></div><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[1100px] border-collapse text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["DATE", "INVOICE NO.", "PARTY NAME", "PAYMENT TYPE", "AMOUNT", "BALANCE DUE", "STATUS", "ACTIONS"].map((heading) => <th key={heading} className="border-y px-3 py-4">{heading}{heading !== "ACTIONS" && <FiFilter className="ml-2 inline" />}</th>)}</tr></thead><tbody>{visible.map((bill) => { const amount = billTotal(bill), received = billPaid(bill); const status = received >= amount ? "Paid" : "Unpaid"; return <tr key={bill.id} className="border-b odd:bg-sky-100 even:bg-white"><td className="px-3 py-4">{dateText(bill.form?.invoiceDate || bill.date)}</td><td className="px-3 py-4 text-right">{bill.form?.invoiceNumber || bill.invoiceNumber || "—"}</td><td className="px-3 py-4 font-medium">{bill.form?.customer || bill.partyName || "Cash Purchase"}</td><td className="px-3 py-4">{bill.form?.paymentType || "Cash"}</td><td className="px-3 py-4 text-right">{money(amount)}</td><td className="px-3 py-4 text-right">{money(Math.max(0, amount - received))}</td><td className={`px-3 py-4 ${status === "Paid" ? "text-emerald-600" : "text-rose-500"}`}>{status}</td><td className="relative px-3 py-3"><button aria-label="Purchase bill actions" onClick={() => setMenuId(menuId === bill.id ? "" : bill.id)} className="p-2"><FiMoreVertical /></button>{menuId === bill.id && <div className="absolute right-3 top-10 z-30 w-44 rounded-lg bg-white p-1 shadow-xl">{["View/Edit", "Delete", "Duplicate", "Print"].map((action) => <button key={action} onClick={() => { if (action === "Delete") remove(bill); else if (action === "Duplicate") duplicate(bill); else if (action === "Print") print(); else { setMenuId(""); navigate("/purchase-expense/purchase-bills/new", { state: { from: "/purchase-expense/purchase-bills", localOnlyPurchase: true, editPurchase: bill } }); } }} className="block w-full rounded px-3 py-2.5 text-left hover:bg-blue-50">{action}</button>)}</div>}</td></tr>; })}</tbody></table>{!visible.length && <div className="flex h-full min-h-64 flex-col items-center justify-center text-slate-400"><div className="grid h-28 w-28 place-items-center rounded-full bg-blue-50 text-5xl text-blue-400">▤</div><h3 className="mt-5 text-lg font-semibold text-slate-700">No Transactions to show</h3><p className="mt-2">You haven't added any purchase bills yet.</p><Button onClick={addPurchase} className="mt-5 rounded-full bg-rose-600 px-6 text-white"><FiPlus /> Add Purchase</Button></div>}</div></Card>
  </main>;
}
