import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiSearch, FiTrendingUp } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import EstimateEditor from "./EstimateEditor";
import {
  buildUnifiedDocumentHtml,
  getEffectiveCompanyInfo,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";
import { getAppSettings } from "../../services/appSettingsStorage.js";
import {
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";
import { toast, ConfirmModal } from "../../components/Common/Toast.jsx";
import { transactionsDb } from "../../services/databaseRepository.js";
import { notifyBusinessDataChanged } from "../../services/businessDataChanged.js";
import { getScopedStorageKey } from "../../config/businessConfig.js";

const STORAGE_KEY = "ledgerly:estimateQuotations.v1";

function estimateStorageKey() {
  return getScopedStorageKey(STORAGE_KEY);
}

function normalizeEstimate(item) {
  if (!item) return item;
  return {
    ...item,
    id: item.id,
    number: item.documentNumber || item.number || item.refNo || item.invoiceNumber || "",
    customer: item.customer || item.partyName || item.customerName || item.party || item.form?.customer || "Cash Sale",
    date: item.date || item.transactionDate || item.invoiceDate || (item.createdAt ? item.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
    amount: Number(item.amount ?? item.totalAmount ?? 0),
    status: item.status || "Open",
    phone: item.phone || item.partyPhone || item.form?.phone || "",
    billingAddress: item.billingAddress || item.partyAddress || item.address || "",
    shippingAddress: item.shippingAddress || "",
    description: item.description || item.notes || "",
    terms: item.terms || "",
    rows: (item.rows || item.items || []).map((r) => ({
      id: r.id || crypto.randomUUID(),
      item: r.item || r.itemName || r.name || "",
      description: r.description || "",
      size: r.size || "",
      qty: String(r.qty ?? r.quantity ?? 1),
      unit: r.unit || "NONE",
      price: String(r.price ?? r.unitPrice ?? 0),
      discountPercent: String(r.discountPercent ?? r.discount ?? ""),
      taxRate: String(r.taxRate ?? r.tax ?? "NONE"),
    })),
  };
}

function readEstimates() {
  try {
    const value = JSON.parse(window.localStorage.getItem(estimateStorageKey()) || "[]");
    return Array.isArray(value) ? value.map(normalizeEstimate) : [];
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
  const location = useLocation();
  const { pathname } = location;
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
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    confirmColor: "red",
    onConfirm: null,
  });

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

  useEffect(() => {
    let isMounted = true;
    async function fetchEstimates() {
      try {
        const list = await transactionsDb.listByType("estimate");
        if (isMounted && Array.isArray(list)) {
          const normalized = list.map(normalizeEstimate);
          setEstimates(normalized);
          try {
            window.localStorage.setItem(estimateStorageKey(), JSON.stringify(normalized));
          } catch {}
        }
      } catch {}
    }
    fetchEstimates();
    const onDataChanged = () => fetchEstimates();
    window.addEventListener("focus", onDataChanged);
    window.addEventListener("storage", onDataChanged);
    window.addEventListener("ledgerly:business-data-changed", onDataChanged);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", onDataChanged);
      window.removeEventListener("storage", onDataChanged);
      window.removeEventListener("ledgerly:business-data-changed", onDataChanged);
    };
  }, []);

  // Handle incoming edit or view state from reports or other pages
  useEffect(() => {
    if (location.state?.editEstimate || location.state?.editInvoice) {
      const incoming = location.state.editEstimate || location.state.editInvoice;
      setEditor({ mode: "edit", estimate: normalizeEstimate(incoming) });
    }
  }, [location.state]);

  const saveEstimates = (next) => {
    setEstimates(next);
    window.localStorage.setItem(estimateStorageKey(), JSON.stringify(next));
    notifyBusinessDataChanged();
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
  const saveEstimate = async (estimate) => {
    const saved = { ...estimate, id: estimate.id || `estimate-${Date.now()}` };

    try {
      // Save directly to MySQL transactions table
      await transactionsDb.save({
        ...saved,
        transactionType: "estimate",
        type: "estimate",
        documentNumber: saved.number,
        transactionDate: saved.date,
        partyName: saved.customer,
        totalAmount: Number(saved.amount || 0),
        terms: saved.terms || "",
        notes: saved.description || "",
        description: saved.description || "",
        billingAddress: saved.billingAddress || "",
        shippingAddress: saved.shippingAddress || saved.billingAddress || "",
        stateOfSupply: saved.state || "",
        items: (saved.rows || []).map((r) => {
          const gross = Math.max(Number(r.qty || 1), 0) * Math.max(Number(r.price || 0), 0);
          const discount = Math.max(Number(r.discountAmount) || gross * (Number(r.discountPercent) || 0) / 100, 0);
          const taxable = Math.max(gross - discount, 0);
          const rateMatch = String(r.taxRate || "").match(/(\d+(?:\.\d+)?)/);
          const taxRateNum = rateMatch ? Number(rateMatch[1]) : 0;
          const lineTotal = taxable + (taxable * taxRateNum) / 100;
          return {
            itemName: r.item,
            description: r.description,
            size: r.size || "",
            unit: r.unit || "NONE",
            quantity: Number(r.qty || 1),
            unitPrice: Number(r.price || 0),
            discountPercent: r.discountPercent || "",
            discountAmount: r.discountAmount || "",
            taxRate: r.taxRate || "NONE",
            totalAmount: Number(lineTotal.toFixed(2)),
          };
        }),
      });

      saveEstimates(editor.mode === "edit" ? estimates.map((item) => item.id === saved.id ? saved : item) : [saved, ...estimates]);
      setEditor(null);
      toast.success(editor.mode === "edit" ? "Estimate updated." : "Estimate created.");
    } catch (err) {
      toast.error(err.message || "Failed to persist estimate.");
      return;
    }

    // Auto-dispatch Meta WhatsApp transaction message if enabled in settings
    try {
      const currentSettings = getAppSettings();
      if ((currentSettings.txnMsgSendToParty ?? true) && currentSettings.txnMsgAutoEstimate) {
        const phone = (saved.phone || "").trim();
        if (phone) {
          const msg = buildTransactionMessage({
            type: "estimate",
            number: saved.number,
            amount: saved.amount || 0,
            balance: saved.amount || 0,
            settings: currentSettings,
          });
          sendMetaWhatsAppMessage({ phone, message: msg }).catch(() => {});
        }
      }
    } catch {}
  };

  const removeEstimate = (estimate) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Quotation",
      message: `Delete quotation ${estimate.number}?`,
      confirmText: "Delete",
      confirmColor: "red",
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        saveEstimates(estimates.filter((item) => item.id !== estimate.id));
        transactionsDb.remove(estimate.id).catch(() => {});
        toast.success(`Quotation ${estimate.number} deleted.`);
      },
    });
    setActionMenu("");
  };

  const toggleActionMenu = (key, event, menuHeight) => {
    if (actionMenu === key) { setActionMenu(""); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estHeight = menuHeight || 120;
    const shouldFlipUp = spaceBelow < estHeight + 20;

    if (shouldFlipUp) {
      setActionMenuPosition({
        bottom: Math.max(8, window.innerHeight - rect.top + 4),
        right: Math.max(8, window.innerWidth - rect.right),
        maxHeight: Math.min(560, Math.max(80, spaceAbove - 16)),
      });
    } else {
      setActionMenuPosition({
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - estHeight - 20)),
        right: Math.max(8, window.innerWidth - rect.right),
        maxHeight: Math.min(560, Math.max(80, spaceBelow - 16)),
      });
    }
    setActionMenu(key);
  };

  const convertEstimate = (estimate, destination) => {
    setActionMenu("");
    if (destination === "Sale") {
      navigate("/sales/sale-invoices/new", { state: { from: pathname, quotationConversion: estimate } });
      return;
    }
    if (destination === "Sale Order") {
      navigate("/sales/sale-order", { state: { from: pathname, quotationConversion: estimate } });
      return;
    }
    const status = `Converted to ${destination}`;
    saveEstimates(estimates.map((item) => item.id === estimate.id ? { ...item, status, convertedAt: new Date().toISOString(), conversionType: destination } : item));
  };

  const openEstimateDocument = (estimate, printNow = false) => {
    const info = getEffectiveCompanyInfo();
    const rows = (estimate.rows || []).map((row, index) => ({
      index: index + 1,
      name: row.item,
      description: row.description,
      qty: row.qty,
      unit: row.unit,
      price: row.price,
      amount: Number(row.qty || 0) * Number(row.price || 0),
    }));
    const html = buildUnifiedDocumentHtml({
      docType: "Estimate / Quotation",
      docNumber: estimate.number,
      docDate: estimate.date,
      partyName: estimate.customer || "Cash Sale",
      partyPhone: estimate.phone || "",
      billToAddress: estimate.billingAddress || "",
      shipToAddress: estimate.shippingAddress || "",
      status: estimate.status,
      items: rows,
      columns: [
        { label: "#", key: "index", width: "40px" },
        { label: "Item", key: "name" },
        { label: "Description", key: "description" },
        { label: "Qty / Unit", align: "center", render: (r) => `${r.qty || 0} ${r.unit || ""}` },
        { label: "Price / Unit", align: "right", render: (r) => formatMoney(r.price) },
        { label: "Amount", align: "right", render: (r) => formatMoney(r.amount) },
      ],
      totals: [
        { label: "Total Amount", value: formatMoney(estimate.amount), isGrand: true },
      ],
      totalAmount: estimate.amount,
      terms: estimate.terms || info.termsAndConditions,
      notes: estimate.description,
      company: info,
      autoPrint: printNow,
    });
    openPrintWindow(html, printNow);
  };

  const runEstimateAction = (action, estimate) => {
    setActionMenu("");
    if (action === "View/Edit") openEdit(estimate);
    else if (action === "Delete") removeEstimate(estimate);
    else if (action === "Open PDF") openEstimateDocument(estimate);
    else if (action === "Preview") setPreviewEstimate(estimate);
    else if (action === "Print") openEstimateDocument(estimate, true);
  };

  if (editor) return <EstimateEditor estimate={editor.estimate} onClose={() => setEditor(null)} onSave={saveEstimate} />;

  return <main className="flex h-full min-h-0 flex-col gap-1 bg-slate-100 p-1 text-slate-800">
    <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 bg-white px-5 py-3">
      <h1 className="flex items-center gap-3 text-xl font-bold text-slate-700">Estimate/Quotation <FiChevronDown className="h-5 w-5" /></h1>
      <Button onClick={openNew} className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-semibold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"><FiPlus className="h-4 w-4" /> Add Estimate</Button>
    </div>

    <Card className="px-5 py-4 shadow-sm"><div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-bold">Filter by:</span>
      <label className="flex min-h-10 items-center rounded-full bg-blue-50 px-4 text-sm"><select aria-label="Date preset" value={period} onChange={(event) => setPreset(event.target.value)} className="cursor-pointer bg-transparent font-medium outline-none"><option>This Month</option><option>This Quarter</option><option>This Year</option><option>All Time</option><option>Custom</option></select></label>
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-full bg-blue-50 px-4 text-sm"><FiCalendar className="text-slate-500" /><input aria-label="Start date" type="date" value={dateFrom} onChange={(event) => { setPeriod("Custom"); setDateFrom(event.target.value); }} className="w-[126px] bg-transparent outline-none" /><span>To</span><input aria-label="End date" type="date" value={dateTo} onChange={(event) => { setPeriod("Custom"); setDateTo(event.target.value); }} className="w-[126px] bg-transparent outline-none" /></div>
    </div></Card>

    <Card className="min-h-44 p-5 shadow-sm"><div className="w-full max-w-md rounded-lg border border-violet-200 bg-violet-50/50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-base text-slate-500">Total Quotations</p><p className="text-2xl font-bold">{formatMoney(totals.amount)}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{visible.length} quotations <FiTrendingUp /></span></div><div className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500"><span>Converted: <b className="text-slate-800">{formatMoney(totals.converted)}</b></span><span className="text-slate-300">|</span><span>Open: <b className="text-slate-800">{formatMoney(totals.open)}</b></span></div></div></Card>

    <Card className="flex min-h-0 flex-1 flex-col shadow-sm"><div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-4 py-3"><h2 className="text-lg font-semibold text-slate-700">Transactions</h2><label className="relative text-slate-500"><FiSearch className="absolute left-3 top-2.5 h-4 w-4" /><input aria-label="Search quotations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotations" className="h-9 w-52 rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label></div>
      {visible.length ? <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[980px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["Date", "Reference no", "Party Name", "Amount", "Balance", "Status", "Actions"].map((title) => <th key={title} className="border-y border-slate-200 px-3 py-3">{title}{title !== "Actions" && <FiFilter className="ml-2 inline h-3.5 w-3.5" />}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70 hover:bg-sky-50"><td className="px-3 py-4">{estimateDate(item)?.toLocaleDateString("en-GB") || "—"}</td><td className="px-3 py-4 text-right">{item.number}</td><td className="px-3 py-4 font-medium">{item.customer}</td><td className="whitespace-nowrap px-3 py-4 text-right">{formatMoney(item.amount)}</td><td className="whitespace-nowrap px-3 py-4 text-right">{String(item.status || "Open").startsWith("Converted") ? formatMoney(0) : formatMoney(item.amount)}</td><td className={`px-3 py-4 font-medium ${String(item.status || "").startsWith("Converted") ? "text-emerald-600" : "text-amber-600"}`}>{item.status || "Open"}</td><td className="px-3 py-3"><div className="relative flex items-center gap-1"><button type="button" onClick={(event) => toggleActionMenu(`convert:${item.id}`, event, 120)} aria-expanded={actionMenu === `convert:${item.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 font-medium text-blue-600 hover:bg-blue-50">Convert <FiChevronDown /></button>{actionMenu === `convert:${item.id}` && <><div className="fixed inset-0 z-[90] cursor-default bg-transparent" onClick={() => setActionMenu("")} /><div style={{ ...(actionMenuPosition.bottom != null ? { bottom: actionMenuPosition.bottom } : { top: actionMenuPosition.top }), right: actionMenuPosition.right, maxHeight: actionMenuPosition.maxHeight }} className="fixed z-[100] w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"><button type="button" onClick={() => convertEstimate(item, "Sale")} className="block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50">Convert to Sale</button><button type="button" onClick={() => convertEstimate(item, "Sale Order")} className="block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50">Convert to Sale Order</button></div></>}<button type="button" aria-label="More quotation actions" aria-expanded={actionMenu === `more:${item.id}`} onClick={(event) => toggleActionMenu(`more:${item.id}`, event, 260)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><FiMoreVertical /></button>{actionMenu === `more:${item.id}` && <><div className="fixed inset-0 z-[90] cursor-default bg-transparent" onClick={() => setActionMenu("")} /><div style={{ ...(actionMenuPosition.bottom != null ? { bottom: actionMenuPosition.bottom } : { top: actionMenuPosition.top }), right: actionMenuPosition.right, maxHeight: actionMenuPosition.maxHeight }} className="fixed z-[100] w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">{["View/Edit", "Delete", "Open PDF", "Preview", "Print"].map((action) => <button key={action} type="button" onClick={() => runEstimateAction(action, item)} className={`block w-full rounded-md px-3 py-2.5 text-left hover:bg-blue-50 ${action === "Delete" ? "text-rose-600" : "text-slate-700"}`}>{action}</button>)}</div></>}</div></td></tr>)}</tbody></table></div> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center"><div className="grid h-32 w-32 place-items-center rounded-full bg-blue-100 text-blue-400"><FiCalendar className="h-14 w-14" /></div><h2 className="mt-6 text-lg font-semibold text-slate-800">No Transactions to show</h2><p className="mt-2 text-sm text-slate-400">You haven't added any transactions yet.</p><Button onClick={openNew} className="mt-6 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"><FiPlus className="h-4 w-4" /> Add Estimate</Button></div>}
    </Card>

    {previewEstimate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewEstimate(null); }}><section className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4"><h2 className="text-xl font-bold">Estimate Preview</h2><button type="button" aria-label="Close preview" onClick={() => setPreviewEstimate(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100">×</button></header><div className="p-8"><div className="text-center"><h1 className="text-2xl font-bold">{getEffectiveCompanyInfo().companyName || "My Company"}</h1><p className="mt-1 text-sm text-slate-500">Estimate / Quotation</p></div><div className="my-8 flex flex-wrap justify-between gap-5 border-y py-5"><div><p className="text-sm text-slate-500">Estimate #</p><p className="font-semibold">{previewEstimate.number}</p><p className="mt-3 text-sm text-slate-500">Customer</p><p className="font-semibold">{previewEstimate.customer}</p>{previewEstimate.phone && <p>{previewEstimate.phone}</p>}</div><div className="text-right"><p className="text-sm text-slate-500">Date</p><p className="font-semibold">{estimateDate(previewEstimate)?.toLocaleDateString("en-GB") || "—"}</p><p className="mt-3 text-sm text-slate-500">State of supply</p><p>{previewEstimate.state || "—"}</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-100"><tr>{["#", "Item", "Description", "Qty", "Unit Price", "Amount"].map((heading) => <th key={heading} className="border-b px-3 py-3">{heading}</th>)}</tr></thead><tbody>{(previewEstimate.rows || []).map((row, index) => <tr key={row.id || index}><td className="border-b px-3 py-3">{index + 1}</td><td className="border-b px-3 py-3 font-medium">{row.item || "—"}</td><td className="border-b px-3 py-3">{row.description || "—"}</td><td className="border-b px-3 py-3">{row.qty || "—"} {row.unit}</td><td className="border-b px-3 py-3">{formatMoney(row.price)}</td><td className="border-b px-3 py-3 text-right">{formatMoney((Number(row.qty) || 0) * (Number(row.price) || 0))}</td></tr>)}</tbody></table></div>{previewEstimate.description && <p className="mt-5"><b>Description:</b> {previewEstimate.description}</p>}{previewEstimate.terms && <p className="mt-4 whitespace-pre-wrap"><b>Terms & Conditions:</b> {previewEstimate.terms}</p>}<p className="mt-6 text-right text-xl font-bold">Total: {formatMoney(previewEstimate.amount)}</p></div><footer className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4"><Button onClick={() => openEstimateDocument(previewEstimate)} className="border border-blue-300 text-blue-600">Open PDF</Button><Button onClick={() => openEstimateDocument(previewEstimate, true)} className="bg-blue-600 text-white">Print</Button><Button onClick={() => setPreviewEstimate(null)} className="bg-slate-100 text-slate-700">Close</Button></footer></section></div>}
    <ConfirmModal
      isOpen={confirmModal.isOpen}
      title={confirmModal.title}
      message={confirmModal.message}
      confirmText={confirmModal.confirmText}
      confirmColor={confirmModal.confirmColor}
      onConfirm={confirmModal.onConfirm}
      onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
    />
  </main>;
}
