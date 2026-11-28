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
import { getAppSettings } from "../../services/appSettingsStorage";
import { getInventoryItems } from "../../services/itemsStorage";

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
    const appSettings = getAppSettings();
    if (appSettings.stopSaleOnNegativeStock) {
      const allInventory = getInventoryItems();
      const rows = bill.rows || bill.items || [];
      const wouldCauseNegative = rows.find((r) => {
        const item = allInventory.find(
          (it) => it.id === r.sourceItemId || it.id === r.itemId || (it.itemName && it.itemName.toLowerCase() === (r.item || "").toLowerCase())
        );
        if (item && item.type !== "service") {
          const currentStock = Number(item.openingQuantity ?? item.stock ?? 0);
          const billQty = Number(r.qty ?? r.quantity ?? 0);
          return currentStock - billQty < 0;
        }
        return false;
      });
      if (wouldCauseNegative) {
        toast.error(`Cannot delete this purchase bill: removing purchased stock would cause "${wouldCauseNegative.item}" inventory to drop below zero.`);
        return;
      }
    }
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

    let rows;
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
      doc: bill,
      title: "Purchase Bill",
      documentNumber: billNum,
      date: billDate,
      partyName,
      partyPhone: bill.form?.phone || bill.phone || "",
      partyBillingAddress: bill.form?.billingAddress || bill.billingAddress || "",
      partyGstin: bill.form?.gstin || bill.partyGstin || bill.gstin || "",
      vehicleNumber: bill.vehicleNumber || bill.vehicleNo || bill.form?.vehicleNumber || "",
      driverName: bill.driverName || bill.form?.driverName || "",
      lrNumber: bill.lrNumber || bill.lr_number || bill.txnField3 || bill.form?.lrNumber || "",
      txnField1: bill.txnField1 || bill.form?.txnField1 || bill.vehicleNumber || "",
      txnField2: bill.txnField2 || bill.form?.txnField2 || bill.driverName || "",
      txnField3: bill.txnField3 || bill.form?.txnField3 || bill.lrNumber || "",
      dateField: bill.dateField || bill.deliveryDate || bill.form?.dateField || "",
      status: billSettlement(bill).paymentStatus,
      rows,
      totals: { subtotal: amount, total: amount, received, balance },
      notes: bill.form?.notes || bill.notes || "",
      autoPrint: printNow,
    });
    openPrintWindow(html, printNow);
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

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col gap-2.5 bg-slate-50/70 p-2 sm:p-4 text-slate-800">
      {/* Top Header */}
      <header className="flex min-h-[56px] flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 sm:px-6 py-3 shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Purchase Bills</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Manage and track your vendor bills, purchases, and payables</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            onClick={addPurchase}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FiPlus className="h-4 w-4" /> Add Purchase
          </Button>
        </div>
      </header>

      {/* Filter and Metric Summary Card */}
      <Card className="shrink-0 p-4 sm:p-5 w-full min-w-0 max-w-full border border-slate-200/80 bg-white shadow-2xs rounded-xl">
        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="relative inline-flex items-center">
            <select
              aria-label="Invoice filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="appearance-none rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-white pl-3.5 pr-8 py-2 text-xs sm:text-sm font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-blue-500 focus:outline-none cursor-pointer transition"
            >
              <option>All Purchase Invoices</option>
              <option>Paid</option>
              <option>Unpaid</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs sm:text-sm text-slate-700 shadow-2xs">
            <FiCalendar className="text-slate-400 h-4 w-4 shrink-0" />
            <input
              aria-label="From date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="bg-transparent text-slate-700 outline-none text-xs sm:text-sm"
            />
            <span className="text-slate-400 font-medium">To</span>
            <input
              aria-label="To date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="bg-transparent text-slate-700 outline-none text-xs sm:text-sm"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
              title="Export to Excel CSV"
            >
              <span className="font-bold text-emerald-600">xls</span>
              <span>Excel Report</span>
            </button>
            <button
              type="button"
              onClick={print}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
              title="Print Purchase Bills Report"
            >
              <FiPrinter className="h-4 w-4 text-slate-500" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Clean, Modern Metric Cards (Light, Professional Theme) */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-stretch">
          {/* Paid Card */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 transition hover:bg-emerald-50/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Paid Amount</span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Paid</span>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{money(paid)}</p>
          </div>

          {/* Unpaid Card */}
          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 transition hover:bg-amber-50/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Unpaid Balance</span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Due</span>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{money(unpaid)}</p>
          </div>

          {/* Total Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:bg-slate-100/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Purchase</span>
              <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{visible.length} bills</span>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{money(total)}</p>
          </div>
        </div>
      </Card>

      {/* Transactions Table Card */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden w-full min-w-0 max-w-full border border-slate-200/80 bg-white shadow-2xs rounded-xl">
        <div className="flex shrink-0 items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-100 bg-white">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700">TRANSACTIONS</h2>
          <label className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search purchases..."
              className="h-9 w-48 sm:w-72 rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-3 text-xs sm:text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 w-full max-w-full overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-xs text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                {["DATE", "INVOICE NO.", "PARTY NAME", "PAYMENT TYPE", "AMOUNT", "BALANCE DUE", "STATUS", "ACTIONS"].map((heading) => (
                  <th key={heading} className="px-3 py-3 whitespace-nowrap">
                    {heading}
                    {heading !== "ACTIONS" && <FiFilter className="ml-1.5 inline text-slate-400" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((bill) => {
                const amount = billTotal(bill);
                const received = billPaid(bill);
                const status = billSettlement(bill).paymentStatus;
                return (
                  <tr key={bill.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-3.5 text-xs text-slate-600 whitespace-nowrap">{dateText(bill.form?.invoiceDate || bill.date)}</td>
                    <td className="px-3 py-3.5 text-xs font-semibold text-slate-800 text-right whitespace-nowrap">{bill.form?.invoiceNumber || bill.invoiceNumber || "—"}</td>
                    <td className="px-3 py-3.5 text-xs font-semibold text-slate-900">{bill.form?.customer || bill.partyName || "Cash Purchase"}</td>
                    <td className="px-3 py-3.5 text-xs text-slate-600">{bill.form?.paymentType || "Cash"}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-bold text-slate-900 whitespace-nowrap">{money(amount)}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-semibold text-slate-700 whitespace-nowrap">{money(Math.max(0, amount - received))}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        status === "Paid"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                          : status === "Partially Paid"
                          ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                          : "bg-rose-50 text-rose-700 border border-rose-200/60"
                      }`}>
                        {status}
                      </span>
                    </td>
                    <td className="relative px-3 py-3.5">
                      <button
                        aria-label="Purchase bill actions"
                        onClick={() => setMenuId(menuId === bill.id ? "" : bill.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      >
                        <FiMoreVertical className="h-4 w-4" />
                      </button>
                      {menuId === bill.id && (
                        <div className="absolute right-3 top-10 z-30 w-44 rounded-lg bg-white p-1 shadow-xl border border-slate-200">
                          {["View/Edit", "Open PDF", "Print", "Delete"].map((action) => (
                            <button
                              key={action}
                              onClick={() => {
                                if (action === "Delete") remove(bill);
                                else if (action === "Print") printSingleBill(bill, true);
                                else if (action === "Open PDF") printSingleBill(bill, false);
                                else {
                                  setMenuId("");
                                  navigate("/purchase-expense/purchase-bills/new", {
                                    state: { from: "/purchase-expense/purchase-bills", editPurchase: bill },
                                  });
                                }
                              }}
                              className={`block w-full rounded px-3 py-2 text-left text-xs sm:text-sm font-medium hover:bg-slate-50 transition cursor-pointer ${
                                action === "Delete" ? "text-rose-600 hover:bg-rose-50" : "text-slate-700"
                              }`}
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-slate-400">
              <div className="grid h-24 w-24 place-items-center rounded-full bg-slate-100 text-4xl text-slate-400">▤</div>
              <h3 className="mt-4 text-base font-semibold text-slate-700">No Transactions to show</h3>
              <p className="mt-1 text-xs text-slate-500">You haven't added any purchase bills yet.</p>
              <Button onClick={addPurchase} className="mt-4 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-xs sm:text-sm text-white font-semibold">
                <FiPlus className="h-4 w-4" /> Add Purchase
              </Button>
            </div>
          )}
        </div>
      </Card>
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
    </div>
  );
}
