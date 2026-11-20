import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiPrinter, FiSearch } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import ReportPrintPreviewModal from "../../components/Common/ReportPrintPreviewModal";
import { toast, ConfirmModal } from "../../components/Common/Toast.jsx";
import { getPurchaseBills, replacePurchaseBills, savePurchaseBill } from "../../services/purchaseBillsStorage";
import { loadPurchaseBills, deleteBusinessPurchaseBill } from "../../services/businessRecords";
import { businessDataChangedEvent } from "../../services/businessDataChanged";
import { calculateInvoiceSettlement } from "../../services/partyBalances.js";
import { getPaymentOuts } from "../../services/transactionRepository.js";
import { transactionsDb } from "../../services/databaseRepository.js";
import { buildUnifiedDocumentHtml, openPrintWindow } from "../../services/unifiedPrintService.js";

const money = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value) => {
  if (!value) return "—";
  const s = String(value).split("T")[0];
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-GB");
};
const billTotal = (bill) => Number(bill.totals?.finalTotal ?? bill.totals?.grandTotal ?? bill.totalAmount ?? 0);
const billSettlement = (bill) => calculateInvoiceSettlement(bill, { kind: "purchase", payments: getPaymentOuts() });
const billPaid = (bill) => billSettlement(bill).paid;

export default function PurchaseBills() {
  const navigate = useNavigate();
  const [records, setRecords] = useState(() => getPurchaseBills());
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Purchase Invoices");
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    confirmColor: "red",
    onConfirm: null,
  });
  useEffect(() => {
    let active = true;
    const reloadBills = () => setRecords(getPurchaseBills());
    loadPurchaseBills()
      .then((rows) => { if (active && Array.isArray(rows)) setRecords(getPurchaseBills()); })
      .catch((error) => console.warn("Could not load purchase bills from backend:", error));
    window.addEventListener(businessDataChangedEvent, reloadBills);
    window.addEventListener("storage", reloadBills);
    return () => {
      active = false;
      window.removeEventListener(businessDataChangedEvent, reloadBills);
      window.removeEventListener("storage", reloadBills);
    };
  }, []);
  const visible = useMemo(() => records.filter((bill) => {
    const status = billSettlement(bill).paymentStatus;
    const text = `${bill.form?.customer || bill.partyName || bill.supplier || ""} ${bill.form?.invoiceNumber || bill.invoiceNumber || ""}`.toLowerCase();
    return (!fromDate || (bill.form?.invoiceDate || bill.date || "") >= fromDate)
      && (!toDate || (bill.form?.invoiceDate || bill.date || "") <= toDate)
      && (statusFilter === "All Purchase Invoices" || statusFilter === status)
      && text.includes(search.toLowerCase().trim());
  }).sort((a, b) => (b.form?.invoiceDate || b.date || "").localeCompare(a.form?.invoiceDate || a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")), [records, search, fromDate, toDate, statusFilter]);
  const total = visible.reduce((sum, bill) => sum + billTotal(bill), 0);
  const paid = visible.reduce((sum, bill) => sum + billPaid(bill), 0);
  const unpaid = Math.max(0, total - paid);
  const refresh = (next) => { replacePurchaseBills(next); setRecords(next); };
  const addPurchase = () => navigate("/purchase-expense/purchase-bills/new", { state: { from: "/purchase-expense/purchase-bills" } });
  const remove = (bill) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Purchase Bill",
      message: `Delete purchase bill ${bill.form?.invoiceNumber || bill.invoiceNumber || ""}?`,
      confirmText: "Delete",
      confirmColor: "red",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          await deleteBusinessPurchaseBill(bill.id);
          setRecords((prev) => prev.filter((entry) => entry.id !== bill.id));
          setMenuId("");
          toast.success("Purchase bill deleted.");
        } catch (error) {
          toast.error(error.message || "Could not delete this purchase bill.");
        }
      },
    });
  };
  const printRecords = useMemo(() => visible.map((bill) => {
    const amount = billTotal(bill);
    const received = billPaid(bill);
    const balance = Math.max(0, amount - received);
    const partyName = bill.form?.customer || bill.partyName || bill.supplier || "Cash Purchase";
    const billNum = bill.form?.invoiceNumber || bill.invoiceNumber || "—";
    const billDate = bill.form?.invoiceDate || bill.date || bill.createdAt;
    const paymentType = bill.form?.paymentType || (bill.purchaseType === "cash" ? "Cash" : "Credit");
    const gstin = bill.form?.gstin || bill.partyGstin || bill.gstin || "";
    const settlement = billSettlement(bill);

    const sourceRows = Array.isArray(bill.items) && bill.items.length > 0
      ? bill.items
      : Array.isArray(bill.rows) && bill.rows.length > 0
      ? bill.rows
      : [];

    return {
      ...bill,
      id: bill.id,
      invoiceDate: billDate,
      date: billDate,
      invoiceNumber: billNum,
      partyName,
      customer: partyName,
      supplier: partyName,
      gstin,
      paymentType,
      status: settlement.paymentStatus,
      totalAmount: amount,
      paidAmount: received,
      receivedAmount: received,
      balanceAmount: balance,
      totals: {
        ...(bill.totals || {}),
        subtotal: bill.totals?.subtotal ?? amount,
        finalTotal: amount,
        grandTotal: amount,
        received,
        paid: received,
        balance,
      },
      rows: sourceRows.map((r, i) => ({
        id: r.id || `row-${i}`,
        item: r.item || r.name || r.itemName || "Item",
        itemName: r.item || r.name || r.itemName || "Item",
        hsn: r.hsn || r.hsnSac || r.hsnCode || "",
        qty: Number(r.qty ?? r.quantity ?? 1),
        quantity: Number(r.qty ?? r.quantity ?? 1),
        unit: r.unit || "PCS",
        price: Number(r.price ?? r.rate ?? r.unitPrice ?? 0),
        rate: Number(r.price ?? r.rate ?? r.unitPrice ?? 0),
        unitPrice: Number(r.price ?? r.rate ?? r.unitPrice ?? 0),
        discount: Number(r.discount ?? r.discountAmount ?? 0),
        discountPercent: Number(r.discountPercent ?? 0),
        taxRate: Number(r.taxRate ?? r.tax ?? 0),
        amount: Number(r.amount ?? r.total ?? (r.calculated?.amount ?? (Number(r.qty ?? r.quantity ?? 1) * Number(r.price ?? r.rate ?? r.unitPrice ?? 0)))),
      })),
    };
  }), [visible]);

  const printSingleBill = (bill, printNow = false) => {
    setMenuId("");
    const amount = billTotal(bill);
    const received = billPaid(bill);
    const balance = Math.max(0, amount - received);
    const partyName = bill.form?.customer || bill.partyName || bill.supplier || "Cash Purchase";
    const billNum = bill.form?.invoiceNumber || bill.invoiceNumber || "—";
    const billDate = dateText(bill.form?.invoiceDate || bill.date);

    let rows = [];
    const sourceRows = Array.isArray(bill.items) && bill.items.length > 0
      ? bill.items
      : Array.isArray(bill.rows) && bill.rows.length > 0
      ? bill.rows
      : [];

    if (sourceRows.length > 0) {
      rows = sourceRows.map((r, i) => ({
        index: i + 1,
        item: r.item || r.name || r.itemName || "Item",
        description: r.description || "",
        hsn: r.hsn || r.hsnSac || r.hsnCode || "",
        qty: Number(r.qty ?? r.quantity ?? 1),
        unit: r.unit || "PCS",
        price: Number(r.price ?? r.rate ?? r.unitPrice ?? 0),
        tax: Number(r.taxRate ?? r.tax ?? 0),
        discount: Number(r.discount ?? r.discountAmount ?? 0),
        amount: Number(r.amount ?? r.total ?? (r.calculated?.amount ?? (Number(r.qty ?? r.quantity ?? 1) * Number(r.price ?? r.rate ?? r.unitPrice ?? 0)))),
      }));
    } else {
      rows = [{ index: 1, item: `Purchase Bill #${billNum}`, qty: 1, price: amount, amount }];
    }

    const html = buildUnifiedDocumentHtml({
      title: "Purchase Bill",
      documentNumber: billNum,
      date: billDate,
      partyName,
      partyPhone: bill.form?.phone || bill.phone || "",
      partyBillingAddress: bill.form?.billingAddress || bill.billingAddress || "",
      partyGstin: bill.form?.gstin || bill.partyGstin || bill.gstin || "",
      status: billSettlement(bill).paymentStatus,
      rows,
      totals: { subtotal: amount, total: amount, received, balance },
      notes: bill.form?.notes || bill.notes || "",
      autoPrint: printNow,
    });
    openPrintWindow(html, `Purchase_Bill_${billNum}`);
  };

  const print = () => setPrintModalOpen(true);
  const exportCsv = () => {
    const rows = [["Date", "Invoice No.", "Party Name", "Payment Type", "Amount", "Balance Due", "Status"], ...visible.map((bill) => {
      const amount = billTotal(bill), received = billPaid(bill);
      return [bill.form?.invoiceDate || bill.date || "", bill.form?.invoiceNumber || bill.invoiceNumber || "", bill.form?.customer || bill.partyName || "", bill.form?.paymentType || "Cash", amount, Math.max(0, amount - received), billSettlement(bill).paymentStatus];
    })];
    const content = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); link.download = "purchase-bills.csv"; link.click(); URL.revokeObjectURL(link.href);
  };

  return <div className="flex h-full min-h-0 w-full max-w-full flex-col gap-1.5 bg-slate-100 p-1.5 text-slate-700">
    <header className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 bg-white px-4 sm:px-5 py-3"><h1 className="text-xl sm:text-2xl font-bold">Purchase Bills</h1><div className="flex gap-3 shrink-0"><Button onClick={addPurchase} className="rounded-full bg-rose-600 px-5 sm:px-6 text-white whitespace-nowrap"><FiPlus /> Add Purchase</Button></div></header>
    <Card className="shrink-0 p-4 sm:p-5 w-full min-w-0 max-w-full"><div className="flex flex-wrap items-center gap-3 sm:gap-4"><label className="flex items-center gap-2 text-lg sm:text-xl font-semibold">{statusFilter}<FiChevronDown/><select aria-label="Invoice filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="absolute h-8 w-64 cursor-pointer opacity-0"><option>All Purchase Invoices</option><option>Paid</option><option>Unpaid</option></select></label><span className="flex items-center gap-2 rounded border px-3 py-2 text-sm"><FiCalendar/><input aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />To<input aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></span><button onClick={exportCsv} className="ml-auto flex flex-col items-center text-xs sm:text-sm"><span className="text-xl sm:text-2xl font-bold text-emerald-700">▦</span>Excel Report</button><button onClick={print} className="flex flex-col items-center text-xs sm:text-sm"><FiPrinter className="text-xl sm:text-2xl"/>Print</button></div><div className="mt-4 flex flex-wrap items-center gap-3 sm:gap-5"><div className="min-w-44 rounded-xl bg-teal-100 px-4 py-3 dark:bg-[#1d3354]"><p className="text-xs">Paid</p><strong className="text-xl sm:text-2xl">{money(paid)}</strong></div><span className="text-xl font-bold">+</span><div className="min-w-44 rounded-xl bg-blue-100 px-4 py-3 dark:bg-[#1d3354]"><p className="text-xs">Unpaid</p><strong className="text-xl sm:text-2xl">{money(unpaid)}</strong></div><span className="text-xl font-bold">=</span><div className="min-w-44 rounded-xl bg-orange-200 px-4 py-3 dark:bg-[#1d3354]"><p className="text-xs">Total</p><strong className="text-xl sm:text-2xl">{money(total)}</strong></div></div></Card>
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden w-full min-w-0 max-w-full"><div className="flex shrink-0 items-center justify-between px-4 py-3"><h2 className="text-base sm:text-lg font-semibold">TRANSACTIONS</h2><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search purchases" className="h-9 sm:h-10 w-48 sm:w-80 rounded border pl-9 pr-3 text-sm"/></label></div><div className="min-h-0 flex-1 w-full max-w-full overflow-x-auto overflow-y-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["DATE", "INVOICE NO.", "PARTY NAME", "PAYMENT TYPE", "AMOUNT", "BALANCE DUE", "STATUS", "ACTIONS"].map((heading) => <th key={heading} className="border-y px-2.5 py-3 whitespace-nowrap">{heading}{heading !== "ACTIONS" && <FiFilter className="ml-1.5 inline"/>}</th>)}</tr></thead><tbody>{visible.map((bill) => { const amount = billTotal(bill), received = billPaid(bill), status = billSettlement(bill).paymentStatus; return <tr key={bill.id} className="border-b odd:bg-sky-100 even:bg-white"><td className="px-2.5 py-3 whitespace-nowrap">{dateText(bill.form?.invoiceDate || bill.date)}</td><td className="px-2.5 py-3 text-right font-medium">{bill.form?.invoiceNumber || bill.invoiceNumber || "—"}</td><td className="px-2.5 py-3 font-medium">{bill.form?.customer || bill.partyName || "Cash Purchase"}</td><td className="px-2.5 py-3">{bill.form?.paymentType || "Cash"}</td><td className="px-2.5 py-3 text-right whitespace-nowrap">{money(amount)}</td><td className="px-2.5 py-3 text-right whitespace-nowrap">{money(Math.max(0, amount - received))}</td><td className={`px-2.5 py-3 font-medium ${status === "Paid" ? "text-emerald-600" : status === "Partially Paid" ? "text-amber-600" : "text-rose-500"}`}>{status}</td><td className="relative px-2.5 py-3"><button aria-label="Purchase bill actions" onClick={() => setMenuId(menuId === bill.id ? "" : bill.id)} className="p-1.5 text-slate-500 hover:text-slate-800"><FiMoreVertical/></button>{menuId === bill.id && <div className="absolute right-3 top-10 z-30 w-44 rounded-lg bg-white p-1 shadow-xl border border-slate-200">{["View/Edit", "Open PDF", "Print", "Delete"].map((action) => <button key={action} onClick={() => { if (action === "Delete") remove(bill); else if (action === "Print") printSingleBill(bill, true); else if (action === "Open PDF") printSingleBill(bill, false); else { setMenuId(""); navigate("/purchase-expense/purchase-bills/new", { state: { from: "/purchase-expense/purchase-bills", editPurchase: bill } }); } }} className={`block w-full rounded px-3 py-2.5 text-left text-sm hover:bg-blue-50 ${action === "Delete" ? "text-rose-600 hover:bg-rose-50" : "text-slate-700"}`}>{action}</button>)}</div>}</td></tr>; })}</tbody></table>{!visible.length && <div className="flex h-full min-h-64 flex-col items-center justify-center text-slate-400"><div className="grid h-28 w-28 place-items-center rounded-full bg-blue-50 text-5xl text-blue-400">▤</div><h3 className="mt-5 text-lg font-semibold text-slate-700">No Transactions to show</h3><p className="mt-2">You haven't added any purchase bills yet.</p><Button onClick={addPurchase} className="mt-5 rounded-full bg-rose-600 px-6 text-white"><FiPlus/> Add Purchase</Button></div>}</div></Card>
    <ConfirmModal
      isOpen={confirmModal.isOpen}
      title={confirmModal.title}
      message={confirmModal.message}
      confirmText={confirmModal.confirmText}
      confirmColor={confirmModal.confirmColor}
      onConfirm={confirmModal.onConfirm}
      onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
    />
    <ReportPrintPreviewModal
      isOpen={printModalOpen}
      title="Purchase Bills Report"
      dateFrom={fromDate}
      dateTo={toDate}
      user="Admin"
      records={printRecords}
      totalLabel="Total Purchase:"
      totalAmount={total}
      onClose={() => setPrintModalOpen(false)}
    />
  </div>;
}
