// Implements the party details page.
import { useEffect, useState } from "react";
import { FiDownload, FiFileText, FiFilter, FiMoreVertical, FiPlus, FiPrinter, FiSearch, FiSettings, FiUsers, FiX } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import Button from "../../components/Common/Button";
import Input from "../../components/Common/Input";
import { gstTypes, indianStates, partyFormDefaults } from "../../constants/partiesData";
import { getParties, saveParty as savePartyLocally } from "../../services/partiesStorage";
import { deleteSaleInvoice, getSaleInvoices, saveSaleInvoice } from "../../services/salesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";
import { getCompanyProfile } from "../../services/companyProfileStorage";

const tabs = ["GST & Address", "Credit & Balance", "Additional Fields"];

// Renders the select field interface.
function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
      >
        <option value="">Select {label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

// Renders the textarea field interface.
function TextareaField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-28 w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500"
      />
    </label>
  );
}

// Renders the party illustration interface.
function PartyIllustration() {
  return (
    <div className="relative mx-auto h-56 w-72">
      <div className="absolute left-8 top-8 h-40 w-52 rounded-lg border border-slate-200 bg-white shadow-sm" />
      <div className="absolute left-2 top-12 h-32 w-44 rounded-lg bg-amber-400 shadow-lg">
        <div className="h-7 rounded-t-lg bg-slate-700" />
        <div className="space-y-3 p-4">
          <div className="h-4 w-28 rounded bg-white/80" />
          <div className="h-3 w-36 rounded bg-white/70" />
          <div className="h-3 w-32 rounded bg-white/70" />
        </div>
      </div>
      <div className="absolute bottom-6 right-2 flex h-24 w-24 items-center justify-center rounded-full border-8 border-amber-400 bg-white text-[#1A1F71] shadow-md">
        <FiUsers className="h-10 w-10" />
      </div>
      <div className="absolute bottom-8 left-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-white shadow-md">
        <FiPlus className="h-7 w-7" />
      </div>
    </div>
  );
}

// Renders the gst address tab interface.
function GstAddressTab({ form, setField, showShipping, setShowShipping }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <SelectField label="GST Type" value={form.gstType} onChange={(value) => setField("gstType", value)} options={gstTypes} />
        <SelectField label="State" value={form.state} onChange={(value) => setField("state", value)} options={indianStates} />
        <Input label="Email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="Email ID" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <TextareaField label="Billing Address" value={form.billingAddress} onChange={(value) => setField("billingAddress", value)} placeholder="Billing Address" />
          <button type="button" className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
            Show Detailed Address
          </button>
        </div>
        <div>
          {showShipping ? (
            <>
              <TextareaField label="Shipping Address" value={form.shippingAddress} onChange={(value) => setField("shippingAddress", value)} placeholder="Shipping Address" />
              <button type="button" className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
                Show Detailed Address
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowShipping(true)}
              className="mt-8 flex h-28 w-full items-center justify-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50/50 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              <FiPlus /> Add New Address
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Renders the credit balance tab interface.
function CreditBalanceTab({ form, setField }) {
  return (
    <div className="grid max-w-3xl gap-5 md:grid-cols-2">
      <Input label="Opening Balance" prefix="Rs" value={form.openingBalance} onChange={(event) => setField("openingBalance", event.target.value)} placeholder="0.00" />
      <Input label="As Of Date" type="date" value={form.asOfDate} onChange={(event) => setField("asOfDate", event.target.value)} />
      <div className="flex flex-wrap items-center gap-6 md:col-span-2">
        {[{ value: "to-pay", label: "To Pay" }, { value: "to-receive", label: "To Receive" }].map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-3 text-base text-slate-700">
            <input type="radio" name="openingBalanceType" value={option.value} checked={form.openingBalanceType === option.value} onChange={() => setField("openingBalanceType", option.value)} className="h-5 w-5 accent-blue-600" />
            {option.label}
          </label>
        ))}
      </div>
      <div className="md:col-span-2 rounded-lg border border-slate-200 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">Credit Limit</p>
        <div className="flex flex-wrap gap-3">
          {["no-limit", "custom-limit"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setField("creditLimitType", type)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${form.creditLimitType === type ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {type === "no-limit" ? "No Limit" : "Custom Limit"}
            </button>
          ))}
        </div>
        {form.creditLimitType === "custom-limit" && (
          <div className="mt-4 max-w-sm">
            <Input prefix="Rs" value={form.creditLimit} onChange={(event) => setField("creditLimit", event.target.value)} placeholder="Credit Limit" />
          </div>
        )}
      </div>
    </div>
  );
}

// Renders the additional fields tab interface.
function AdditionalFieldsTab({ form, setAdditionalField }) {
  return (
    <div className="space-y-3">
      {form.additionalFields.map((field, index) => (
        <div key={field.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[40px_1fr_1fr_150px]">
          <label className="flex items-center">
            <input type="checkbox" checked={field.enabled} onChange={(event) => setAdditionalField(index, "enabled", event.target.checked)} className="h-4 w-4 accent-blue-600" />
          </label>
          <Input value={field.fieldName} onChange={(event) => setAdditionalField(index, "fieldName", event.target.value)} placeholder="Field Name" />
          <Input type={field.type} value={field.value} onChange={(event) => setAdditionalField(index, "value", event.target.value)} placeholder="Value" />
          <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-600">
            Show In Print
            <input type="checkbox" checked={field.showInPrint} onChange={(event) => setAdditionalField(index, "showInPrint", event.target.checked)} className="h-4 w-4 accent-blue-600" />
          </label>
        </div>
      ))}
    </div>
  );
}

// Renders the add party modal interface.
function AddPartyModal({ onClose, onSave, initialParty = null }) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [showShipping, setShowShipping] = useState(Boolean(initialParty?.shippingAddress));
  const [form, setForm] = useState(() => initialParty ? { ...partyFormDefaults, ...initialParty } : partyFormDefaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sets field.
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  // Sets additional field.
  const setAdditionalField = (index, field, value) => {
    setForm((current) => ({
      ...current,
      additionalFields: current.additionalFields.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };
  // Saves result.
  const save = async (resetAfterSave = false) => {
    if (!form.partyName.trim()) {
      setError("Party name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, partyName: form.partyName.trim() });
      if (resetAfterSave) {
        setForm(partyFormDefaults);
        setShowShipping(false);
      } else {
        onClose();
      }
    } catch (saveError) {
      setError(saveError.message || "Could not save party in this browser.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{initialParty ? "Edit Party" : "Add Party"}</h2>
          <div className="flex items-center gap-4 text-slate-500">
            <FiSettings className="h-5 w-5" />
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-slate-100">
              <FiX className="h-6 w-6" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Input label="Party Name *" value={form.partyName} onChange={(event) => setField("partyName", event.target.value)} placeholder="Party Name" />
            <Input label="GSTIN" value={form.gstin} onChange={(event) => setField("gstin", event.target.value)} placeholder="GSTIN" />
            <Input label="Phone Number" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="Phone Number" />
            <Input label="Party Group" value={form.group || ""} onChange={(event) => setField("group", event.target.value)} placeholder="e.g. General, Retailers, Wholesalers" />
          </div>

          <div className="mt-8 border-b border-slate-200">
            <div className="flex gap-8 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-1 py-3 text-sm font-semibold ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            {activeTab === "GST & Address" && (
              <GstAddressTab form={form} setField={setField} showShipping={showShipping} setShowShipping={setShowShipping} />
            )}
            {activeTab === "Credit & Balance" && <CreditBalanceTab form={form} setField={setField} />}
            {activeTab === "Additional Fields" && <AdditionalFieldsTab form={form} setAdditionalField={setAdditionalField} />}
          </div>
        </div>

        <footer className="flex justify-end gap-4 border-t border-slate-200 bg-white px-6 py-4">
          {error && <p className="mr-auto self-center text-sm font-semibold text-red-600">{error}</p>}
          {!initialParty && <Button disabled={saving} onClick={() => save(true)} className="border border-blue-600 bg-white text-blue-600 hover:bg-blue-50">Save & New</Button>}
          <Button disabled={saving} onClick={() => save(false)} className="bg-blue-600 text-white shadow-sm hover:bg-blue-700">{saving ? "Saving…" : "Save"}</Button>
        </footer>
      </section>
    </div>
  );
}

// This helper handles result logic.
function money(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Escapes html.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// Builds statement document.
// Formats date as DD/MM/YYYY
function formatDateDMY(dateStr) {
  if (!dateStr) return "-";
  const s = String(dateStr).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3]}`;
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[3].padStart(2, "0")}/${ymd[2].padStart(2, "0")}/${ymd[1]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return dateStr;
}

function buildStatementDocument(party, invoices, activity = []) {
  const company = getCompanyProfile();
  const companyName = company.businessName || company.companyName || "Company Name";
  const companyPhone = company.phoneNumber || company.phone || "";
  const opening = Math.abs(Number(party?.openingBalance || 0));
  const openingType = party?.openingBalanceType || "to-receive";

  const rows = [
    ...(opening > 0 ? [{
      date: formatDateDMY(party?.asOfDate),
      source: `${openingType === "to-pay" ? "Payable" : "Receivable"} Opening Balance`,
      number: "-",
      status: "Unpaid",
      total: opening,
      received: 0,
      balance: opening,
      receivableBalance: openingType === "to-receive" ? opening : 0,
      payableBalance: openingType === "to-pay" ? opening : 0,
    }] : []),
    ...activity.map((entry) => ({
      date: formatDateDMY(entry.date),
      source: entry.source,
      number: entry.number || "-",
      status: entry.status || "Paid",
      total: Number(entry.total || 0),
      received: Number(entry.received || 0),
      balance: Number(entry.balance || 0),
      receivableBalance: openingType === "to-receive" ? Number(entry.balance || 0) : 0,
      payableBalance: openingType === "to-pay" ? Number(entry.balance || 0) : 0,
    })),
  ];

  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const totalReceivable = rows.reduce((s, r) => s + r.receivableBalance, 0);
  const totalPayable = rows.reduce((s, r) => s + r.payableBalance, 0);

  const tableRows = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.source)}</td>
      <td>${escapeHtml(r.number)}</td>
      <td style="color:${r.status === 'Paid' ? '#16a34a' : '#e11d48'};font-weight:600;">${escapeHtml(r.status)}</td>
      <td style="text-align:right;">${money(r.total)}</td>
      <td style="text-align:right;">${money(r.received)}</td>
      <td style="text-align:right;">${money(r.balance)}</td>
      <td style="text-align:right;color:#16a34a;">${r.receivableBalance > 0 ? money(r.receivableBalance) : '-'}</td>
      <td style="text-align:right;color:#e11d48;">${r.payableBalance > 0 ? money(r.payableBalance) : '-'}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Party statement - ${escapeHtml(party?.partyName || "Cash Sale")}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 36px; }
    .company-header { text-align: center; margin-bottom: 24px; }
    .company-name { font-size: 22px; font-weight: 800; margin: 0; }
    .company-phone { font-size: 13px; color: #475569; margin: 4px 0 0; }
    .doc-title { text-align: center; text-decoration: underline; font-size: 26px; font-weight: 800; margin: 28px 0 20px; }
    .party-info { margin-bottom: 16px; }
    .party-name { font-size: 18px; font-weight: 700; margin: 0; }
    .party-contact { font-size: 13px; color: #475569; margin: 4px 0 0; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 12px; }
    th { background: #cbd5e1; font-weight: 700; color: #0f172a; text-align: left; padding: 10px 8px; border-bottom: 2px solid #94a3b8; }
    td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; }
    .total-row td { background: #cbd5e1; font-weight: 800; border-top: 2px solid #94a3b8; }
    .btn-bar { margin-top: 28px; display: flex; justify-content: flex-end; gap: 10px; }
    .btn { padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #e11d48; color: #e11d48; background: white; }
    .btn-primary { background: #e11d48; color: white; }
    @media print {
      body { margin: 10mm; }
      .btn-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="company-header">
    <h1 class="company-name">${escapeHtml(companyName)}</h1>
    ${companyPhone ? `<p class="company-phone">Phone no.: ${escapeHtml(companyPhone)}</p>` : ""}
  </div>

  <h2 class="doc-title">Party statement</h2>

  <div class="party-info">
    <div class="party-name">Party name: ${escapeHtml(party?.partyName || "Cash Sale")}</div>
    ${party?.phone ? `<div class="party-contact">Contact No.: ${escapeHtml(party.phone)}</div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Txn Type</th>
        <th>Ref No.</th>
        <th>Payment Status</th>
        <th style="text-align:right;">Total</th>
        <th style="text-align:right;">Received / Paid</th>
        <th style="text-align:right;">Txn Balance</th>
        <th style="text-align:right;">Receivable Balance</th>
        <th style="text-align:right;">Payable Balance</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="9" style="text-align:center;padding:24px;color:#94a3b8;">No transactions to show</td></tr>'}
      ${rows.length > 0 ? `
        <tr class="total-row">
          <td colspan="4" style="font-weight:800;">Total</td>
          <td style="text-align:right;font-weight:800;">${money(totalAmount)}</td>
          <td style="text-align:right;font-weight:800;">${money(totalReceived)}</td>
          <td style="text-align:right;font-weight:800;">${money(totalBalance)}</td>
          <td style="text-align:right;font-weight:800;color:#15803d;">${money(totalReceivable)}</td>
          <td style="text-align:right;font-weight:800;color:#be123c;">${money(totalPayable)}</td>
        </tr>
      ` : ""}
    </tbody>
  </table>

  <div class="btn-bar">
    <button class="btn" onclick="window.print()">Print</button>
    <button class="btn" onclick="window.print()">Save PDF</button>
  </div>
</body>
</html>`;
}

// Renders the party details interface.
function PartyDetails() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.openAddParty) {
      setIsModalOpen(true);
    }
  }, [location.state]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partyBeingEdited, setPartyBeingEdited] = useState(null);
  const [parties, setParties] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [balanceFilter, setBalanceFilter] = useState(() => {
    const params = new URLSearchParams(location.search);
    const f = params.get("filter") || location.state?.filter;
    if (f === "receivable" || f === "to-receive") return "receivable";
    if (f === "payable" || f === "to-pay") return "payable";
    return "all";
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const f = params.get("filter") || location.state?.filter;
    if (f === "receivable" || f === "to-receive") {
      setBalanceFilter("receivable");
    } else if (f === "payable" || f === "to-pay") {
      setBalanceFilter("payable");
    }
  }, [location.search, location.state]);
  const [partyActivity, setPartyActivity] = useState({ estimates: [], proformas: [], payments: [], paymentsOut: [], creditNotes: [] });
  const [selectedPartyId, setSelectedPartyId] = useState("cash-sale");
  const [search, setSearch] = useState("");
  const [openTransactionMenu, setOpenTransactionMenu] = useState("");
  const [transactionMenuPosition, setTransactionMenuPosition] = useState({ top: 0, left: 0 });
  const [statementOpen, setStatementOpen] = useState(false);
  const [printStatementOnOpen, setPrintStatementOnOpen] = useState(false);
  const [transactionSearchOpen, setTransactionSearchOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    try {
      setParties(getParties());
      setInvoices(getSaleInvoices());
      setPurchases(getPurchaseBills());
      const readLocalList = (key) => {
        try { const value = JSON.parse(window.localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
        catch { return []; }
      };
      setPartyActivity({
        estimates: readLocalList("ledgerly:estimateQuotations.v1"),
        proformas: readLocalList("ledgerly:proformaInvoices.v1"),
        payments: readLocalList("ledgerly:paymentIns.v1"),
        paymentsOut: readLocalList("ledgerly:paymentOuts.v1"),
        creditNotes: readLocalList("ledgerly:saleReturns.v1"),
      });
    } catch (error) {
      setLoadError(error.message || "Could not load saved parties from this browser.");
    }
  }, []);

  useEffect(() => {
    if (!statementOpen || !printStatementOnOpen) return undefined;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [statementOpen, printStatementOnOpen]);

  // Saves party.
  const saveParty = async (party) => {
    const saved = savePartyLocally(party);
    setParties((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setPartyBeingEdited(null);
    return saved;
  };

  // Refreshes local invoices.
  const refreshLocalInvoices = () => setInvoices(getSaleInvoices());
  // Handles actions.
  const transactionActions = (invoice, type = "sale") => {
    const key = invoice?.id || `opening-${selectedParty?.id}`;
    // Handles result.
    const preview = (printAfterOpen = false, targetInvoice = invoice) => navigate("/sales/sale-invoices/preview", { state: { invoice: targetInvoice, printAfterOpen } });
    // Handles action.
    const handleAction = (action) => {
      setOpenTransactionMenu("");
      if (action === "View/Edit") {
        if (invoice) preview();
      } else if (action === "Open PDF") {
        openStatementDocument(false);
      } else if (action === "Preview") {
        setPrintStatementOnOpen(false);
        setStatementOpen(true);
      } else if (action === "Print") {
        setPrintStatementOnOpen(true);
        setStatementOpen(true);
      } else if (action === "Delete") {
        if (type === "opening") {
          const saved = savePartyLocally({ ...selectedParty, openingBalance: "0", openingBalanceType: "to-receive" });
          setParties((current) => current.map((party) => party.id === saved.id ? saved : party));
        } else if (window.confirm("Delete this sale transaction from this browser?")) {
          deleteSaleInvoice(invoice.id);
          refreshLocalInvoices();
        }
      } else if (action === "Duplicate" && invoice) {
        const duplicate = saveSaleInvoice({ ...invoice, id: crypto.randomUUID(), invoiceId: undefined, invoiceNumber: `${invoice.invoiceNumber || "1"}-COPY`, form: { ...invoice.form, invoiceNumber: `${invoice.form?.invoiceNumber || invoice.invoiceNumber || "1"}-COPY` }, createdAt: new Date().toISOString(), stockAdjustedAt: invoice.stockAdjustedAt || new Date().toISOString() });
        refreshLocalInvoices();
        preview(false, duplicate);
      } else if (action === "View History") {
        const date = invoice?.updatedAt || invoice?.createdAt || selectedParty?.updatedAt;
        window.alert(date ? `Saved locally on ${new Date(date).toLocaleString()}.` : "No transaction history is available yet.");
      }
    };
    return (
      <div className="relative">
        <button type="button" aria-label="Transaction actions" onClick={(event) => {
          if (openTransactionMenu === key) {
            setOpenTransactionMenu("");
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const menuHeight = 330;
          const top = rect.bottom + menuHeight + 8 <= window.innerHeight
            ? rect.bottom + 4
            : Math.max(8, rect.top - menuHeight - 4);
          setTransactionMenuPosition({ top, left: Math.max(8, rect.right - 220) });
          setOpenTransactionMenu(key);
        }} className="rounded p-1 text-slate-500 hover:bg-slate-100"><FiMoreVertical /></button>
        {openTransactionMenu === key && createPortal(<div className="fixed z-[100] max-h-[min(330px,calc(100vh-16px))] w-[220px] overflow-y-auto rounded-xl bg-white py-2 shadow-xl ring-1 ring-black/10" style={{ top: transactionMenuPosition.top, left: transactionMenuPosition.left }}>{["View/Edit", ...(type === "opening" ? [] : ["Delete", "Duplicate"]), "Open PDF", "Preview", "Print", ...(type === "opening" ? ["Delete"] : []), "View History"].map((action) => <button key={action} type="button" onClick={() => handleAction(action)} className="block w-full px-5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">{action}</button>)}</div>, document.body)}
      </div>
    );
  };

  const getPartyBalanceInfo = (party) => {
    const ob = Math.abs(Number(party.openingBalance || 0));
    const obType = party.openingBalanceType || (String(party.partyType || "").toLowerCase() === "supplier" || String(party.partyType || "").toLowerCase() === "vendor" ? "to-pay" : "to-receive");

    // Unpaid sales for this party
    const partySalesUnpaid = (invoices || [])
      .filter((inv) => {
        const matchesParty = String(inv.partyId || inv.form?.partyId || "") === String(party.id)
          || String(inv.partyName || inv.customerName || inv.form?.customer || "").trim().toLowerCase() === String(party.partyName || "").trim().toLowerCase();
        return matchesParty && !inv.cancelled && inv.status !== "Cancelled";
      })
      .reduce((sum, inv) => {
        const total = Number(inv.totals?.finalTotal || inv.total || 0);
        const received = Number(inv.receivedAmount || inv.form?.receivedAmount || 0);
        return sum + Math.max(0, total - received);
      }, 0);

    // Unpaid purchases for this party
    const partyPurchasesUnpaid = (purchases || [])
      .filter((bill) => {
        const matchesParty = String(bill.partyId || bill.form?.partyId || "") === String(party.id)
          || String(bill.supplier || bill.partyName || bill.party || bill.form?.customer || "").trim().toLowerCase() === String(party.partyName || "").trim().toLowerCase();
        return matchesParty && !bill.cancelled && bill.status !== "Cancelled";
      })
      .reduce((sum, bill) => {
        const total = Number(bill.totals?.finalTotal || bill.totalAmount || bill.total || 0);
        const paid = Number(bill.paidAmount || bill.received || bill.form?.paidAmount || 0);
        return sum + Math.max(0, total - paid);
      }, 0);

    let receivable = (obType === "to-receive" ? ob : 0) + partySalesUnpaid;
    let payable = (obType === "to-pay" ? ob : 0) + partyPurchasesUnpaid;

    if (party.balance !== undefined && party.balance !== null && party.balance !== "") {
      const rawBal = Number(party.balance);
      if (rawBal > 0 && obType === "to-receive") receivable = Math.max(receivable, rawBal);
      if (rawBal < 0 || obType === "to-pay") payable = Math.max(payable, Math.abs(rawBal));
    }

    const net = receivable - payable;
    const balanceAmount = Math.abs(net) || (ob > 0 ? ob : 0);
    const balanceType = net > 0 ? "to-receive" : net < 0 ? "to-pay" : (receivable > 0 ? "to-receive" : payable > 0 ? "to-pay" : obType);

    return {
      receivable,
      payable,
      net,
      balanceAmount,
      balanceType,
    };
  };

  const filteredParties = parties.filter((party) => {
    const matchesSearch = String(party.partyName || "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    const info = getPartyBalanceInfo(party);
    if (balanceFilter === "receivable") {
      return info.balanceType === "to-receive" && info.balanceAmount > 0;
    }
    if (balanceFilter === "payable") {
      return info.balanceType === "to-pay" && info.balanceAmount > 0;
    }
    return true;
  });

  // When filtering, ensure selected party is valid
  useEffect(() => {
    if (balanceFilter !== "all" && filteredParties.length > 0) {
      const isCurrentInList = filteredParties.some((p) => String(p.id) === String(selectedPartyId));
      if (!isCurrentInList) {
        setSelectedPartyId(filteredParties[0].id);
      }
    }
  }, [balanceFilter, filteredParties]);
  const selectedParty = parties.find((party) => String(party.id) === String(selectedPartyId));
  const partyInvoices = selectedParty ? invoices.filter((invoice) =>
    String(invoice.partyId || invoice.form?.partyId || "") === String(selectedParty.id)
    || String(invoice.partyName || invoice.customerName || invoice.form?.customer || "").toLowerCase() === String(selectedParty.partyName || "").toLowerCase()
  ) : [];
  const belongsToSelectedParty = (entry) => selectedParty && (
    String(entry.partyId || entry.form?.partyId || "") === String(selectedParty.id)
    || String(entry.partyName || entry.customerName || entry.customer || entry.form?.customer || "").trim().toLowerCase() === String(selectedParty.partyName || "").trim().toLowerCase()
  );
  const partyTransactions = [
    ...partyInvoices.map((invoice) => {
      const total = Number(invoice.totals?.finalTotal || invoice.total || invoice.grandTotal || 0);
      const received = Number(invoice.receivedAmount || invoice.form?.receivedAmount || 0);
      const balance = Math.max(0, Number(invoice.balance ?? (invoice.saleType === "credit" ? total - received : 0)) - Number(invoice.creditNoteAppliedAmount || 0));
      return { id: `sale:${invoice.id}`, source: "Sale", number: invoice.form?.invoiceNumber || invoice.invoiceNumber || invoice.number || "—", date: invoice.form?.invoiceDate || invoice.createdAt, total, received: total - balance, balance, status: balance > 0 ? "Unpaid" : "Paid", raw: invoice };
    }),
    ...partyActivity.estimates.filter(belongsToSelectedParty).map((entry) => ({ id: `estimate:${entry.id}`, source: "Estimate/Quotation", number: entry.number || entry.refNo || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: String(entry.status || "Open").startsWith("Converted") ? Number(entry.amount || 0) : 0, balance: String(entry.status || "Open").startsWith("Converted") ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...partyActivity.proformas.filter(belongsToSelectedParty).map((entry) => ({ id: `proforma:${entry.id}`, source: "Proforma Invoice", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: String(entry.status || "Open").startsWith("Converted") ? Number(entry.amount || 0) : 0, balance: String(entry.status || "Open").startsWith("Converted") ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...partyActivity.payments.filter(belongsToSelectedParty).map((entry) => ({ id: `payment:${entry.id}`, source: "Payment-In", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: Number(entry.received ?? entry.amount ?? 0), balance: 0, status: entry.status || "Unused", raw: entry })),
    ...partyActivity.paymentsOut.filter(belongsToSelectedParty).map((entry) => ({ id: `payment-out:${entry.id}`, source: entry.linkedCreditNoteId ? "Credit Note Refund" : "Payment-Out", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: Number(entry.amount || 0), balance: 0, status: entry.status || "Paid", raw: entry })),
    ...partyActivity.creditNotes.filter((entry) => entry.type === "Credit Note" && !entry.cancelled && (String(entry.party || entry.customer || "").trim().toLowerCase() === String(selectedParty?.partyName || "").trim().toLowerCase())).map((entry) => ({ id: `credit-note:${entry.id}`, source: "Credit Note", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.total || 0), received: Number(entry.received || 0), balance: Number(entry.balance || 0), status: entry.status || "Credit Available", raw: entry })),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const visiblePartyTransactions = partyTransactions.filter((entry) => [entry.source, entry.number, entry.date, entry.total, entry.received, entry.balance, entry.status, entry.raw?.paymentType, entry.raw?.description].join(" ").toLowerCase().includes(transactionSearch.toLowerCase()));
  const openingBalance = Math.abs(Number(selectedParty?.openingBalance || 0));
  const cashSaleName = selectedParty?.partyName || "Cash Sale";
  const selectedOpeningBalance = Math.abs(Number(selectedParty?.openingBalance || 0));
  const selectedBalanceType = selectedParty?.openingBalanceType || "to-receive";
  // Opens statement document.
  const openStatementDocument = (printWhenReady = false) => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setLoadError("Allow pop-ups to open the printable party statement.");
      return;
    }
    popup.document.open();
    popup.document.write(buildStatementDocument(selectedParty, partyInvoices, partyTransactions));
    popup.document.close();
    if (printWhenReady) popup.addEventListener("load", () => popup.print(), { once: true });
  };
  // Downloads excel.
  const downloadExcel = () => {
    const tableRows = [
      ["Date", "Type", "Number", "Payment Status", "Total", "Received / Paid", "Balance"],
      ...(selectedParty && openingBalance > 0 ? [[selectedParty.asOfDate || "", `${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} Opening Balance`, "", "Unpaid", openingBalance, 0, openingBalance]] : []),
      ...partyTransactions.map((entry) => [entry.date || "", entry.source, entry.number, entry.status, entry.total, entry.received, entry.balance]),
    ];
    const excelDocument = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${tableRows.map((row, index) => `<tr>${row.map((value) => index === 0 ? `<th>${escapeHtml(value)}</th>` : `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    const url = URL.createObjectURL(new Blob([excelDocument], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(selectedParty?.partyName || "cash-sale").replace(/[^a-z0-9-_]+/gi, "-")}-transactions.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-7.5rem)] flex-col bg-slate-200">
      <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-700">Parties</h1>
        <div className="flex items-center gap-4"><Button onClick={() => { setPartyBeingEdited(null); setIsModalOpen(true); }} className="bg-rose-600 text-white hover:bg-rose-700"><FiPlus /> Add Party</Button><FiSettings className="text-xl text-slate-500" /><FiMoreVertical className="text-xl text-slate-500" /></div>
      </div>
      {loadError && <p className="bg-white px-5 py-2 text-sm text-red-600">{loadError}</p>}
      <div className="grid min-h-0 flex-1 gap-1 p-1 md:grid-cols-[minmax(300px,29%)_1fr]">
        <section className="flex min-h-[430px] flex-col overflow-hidden rounded-md bg-white">
          <div className="p-4 pb-2"><label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 px-4 text-slate-400"><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Party Name" className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" /></label></div>
          {/* Balance Filter Pills */}
          <div className="flex items-center gap-1.5 px-4 pb-3">
            {[
              { id: "all", label: "All" },
              { id: "receivable", label: "To Receive" },
              { id: "payable", label: "To Pay" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBalanceFilter(f.id)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  balanceFilter === f.id
                    ? f.id === "receivable"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : f.id === "payable"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-[#1A1F71] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_130px] border-y border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500"><span className="flex items-center justify-between">Party Name <FiFilter className="text-rose-500" /></span><span>Amount</span></div>
          <div className="min-h-0 flex-1 overflow-auto">
            {balanceFilter === "all" && (
              <button onClick={() => setSelectedPartyId("cash-sale")} className={`grid w-full grid-cols-[1fr_130px] px-4 py-5 text-left text-sm ${selectedPartyId === "cash-sale" ? "bg-sky-100 dark:bg-sky-950/40" : "hover:bg-slate-50"}`}><span className="font-medium text-slate-800">Cash Sale</span><span className="text-right font-medium text-emerald-500">0.00</span></button>
            )}
            {filteredParties.map((party) => {
              const info = getPartyBalanceInfo(party);
              return <button key={party.id} onClick={() => setSelectedPartyId(party.id)} className={`grid w-full grid-cols-[1fr_130px] items-center px-4 py-5 text-left text-sm ${String(selectedPartyId) === String(party.id) ? "bg-sky-100 dark:bg-sky-950/40" : "hover:bg-slate-50"}`}><span className="truncate font-medium text-slate-800">{party.partyName}</span><span className="text-right"><span className={`block font-medium ${info.balanceType === "to-pay" ? "text-rose-500" : "text-emerald-500"}`}>{info.balanceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>{info.balanceAmount > 0 && <span className="text-xs text-slate-400">{info.balanceType === "to-pay" ? "To Pay" : "To Receive"}</span>}</span></button>;
            })}
            {filteredParties.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400">
                {balanceFilter === "receivable" ? "No receivable parties found" : balanceFilter === "payable" ? "No payable parties found" : "No parties found"}
              </div>
            )}
          </div>
          <div className="m-2 flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-slate-700"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><FiUsers className="text-xl" /></span><span>Use contacts from your Phone or Gmail to <b>quickly create</b> parties.</span><span className="ml-auto text-emerald-600">›</span></div>
        </section>
        <section className="min-w-0 overflow-hidden rounded-md bg-white">
          <div className="flex h-[68px] items-center justify-between border-b border-slate-200 px-4"><div><h2 className="font-semibold text-slate-700">{cashSaleName} {selectedParty && <button aria-label="Edit party" title="Edit party" onClick={() => { setPartyBeingEdited(selectedParty); setIsModalOpen(true); }} className="ml-2 text-blue-500">✎</button>}</h2>{selectedParty && selectedOpeningBalance > 0 && <p className="mt-1 text-xs text-slate-500">₹ {selectedOpeningBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })} {selectedBalanceType === "to-pay" ? "To Pay" : "To Receive"}</p>}</div><div className="flex gap-4 text-lg"><span className="text-amber-500">●</span><span className="text-green-500">●</span><span className="text-orange-400">◷</span></div></div>
          <div className="flex min-h-[82px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><h2 className="font-semibold text-slate-700">Transactions</h2><div className="flex items-center gap-3 text-slate-500">
            {transactionSearchOpen && <input autoFocus value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Search transactions" className="h-10 w-48 rounded-md border border-slate-300 px-3 text-sm text-slate-700 outline-none focus:border-blue-500" />}
            <button type="button" aria-label="Search transactions" title="Search transactions" onClick={() => { setTransactionSearchOpen((open) => !open); setTransactionSearch(""); }} className="grid h-11 w-11 place-items-center rounded-md hover:bg-slate-100"><FiSearch className="text-2xl" /></button>
            <button type="button" aria-label="Print party statement" title="Print party statement" onClick={() => { setPrintStatementOnOpen(false); setStatementOpen(true); }} className="grid h-11 w-11 place-items-center rounded-md hover:bg-slate-100 cursor-pointer"><FiPrinter className="text-2xl" /></button>
            <button type="button" aria-label="Download Excel transactions" title="Download Excel-compatible transactions" onClick={downloadExcel} className="grid h-11 w-11 place-items-center rounded-md text-emerald-600 hover:bg-emerald-50 cursor-pointer"><span className="rounded bg-emerald-600 px-1 py-0.5 text-[11px] font-bold text-white">XLS</span></button>
            <button type="button" aria-label="Preview or download PDF" title="Preview or download PDF" onClick={() => { setPrintStatementOnOpen(false); setStatementOpen(true); }} className="grid h-11 w-11 place-items-center rounded-md text-rose-600 hover:bg-rose-50 cursor-pointer"><FiFileText className="text-2xl" /></button>
          </div></div>
          <div className="overflow-auto"><table className="w-full min-w-[690px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Type", "Number", "Date", "Total", "Balance/ Unused", "Status", ""].map((label) => <th key={label} className="border-b border-r border-slate-200 px-3 py-3 font-semibold">{label}{label && <FiFilter className="float-right mt-0.5 text-slate-400" />}</th>)}</tr></thead><tbody>
            {selectedParty && openingBalance > 0 && `${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} opening balance ${selectedParty.asOfDate || ""}`.toLowerCase().includes(transactionSearch.toLowerCase()) && <tr className="border-b border-slate-100 bg-sky-100 text-slate-800"><td className="px-3 py-4">{selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} Opening Balance</td><td className="px-3 py-4">—</td><td className="px-3 py-4">{selectedParty.asOfDate ? new Date(selectedParty.asOfDate).toLocaleDateString("en-GB") : "—"}</td><td className="px-3 py-4 text-right">₹ {openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td className="px-3 py-4 text-right">₹ {openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td className="px-3 py-4 text-rose-500">Unpaid</td><td className="px-3 py-4">{transactionActions(null, "opening")}</td></tr>}
            {visiblePartyTransactions.map((entry) => <tr key={entry.id} className="border-b border-slate-100 text-slate-800"><td className="px-3 py-4">{entry.source}</td><td className="px-3 py-4">{entry.number}</td><td className="px-3 py-4">{entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "—"}</td><td className="px-3 py-4 text-right">{money(entry.total)}</td><td className="px-3 py-4 text-right">{entry.source === "Payment-In" ? "—" : money(entry.balance)}</td><td className={`px-3 py-4 ${["Paid", "Used"].includes(entry.status) ? "text-emerald-500" : "text-rose-500"}`}>{entry.status}</td><td className="px-3 py-4">{entry.source === "Sale" ? transactionActions(entry.raw) : <button type="button" title="View transaction" onClick={() => { setStatementOpen(true); setPrintStatementOnOpen(false); }} className="rounded p-1 text-slate-500 hover:bg-slate-100"><FiMoreVertical /></button>}</td></tr>)}
            {!visiblePartyTransactions.length && (openingBalance <= 0 || !`${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} opening balance ${selectedParty?.asOfDate || ""}`.toLowerCase().includes(transactionSearch.toLowerCase())) && <tr><td colSpan="7" className="h-48 text-center text-slate-400">{transactionSearch ? "No matching transactions" : "No transactions to show"}</td></tr>}
          </tbody></table></div>
        </section>
      </div>
      {statementOpen && (() => {
        const company = getCompanyProfile();
        const companyName = company.businessName || company.companyName || "Company Name";
        const companyPhone = company.phoneNumber || company.phone || "";

        const statementRows = [
          ...(selectedParty && selectedOpeningBalance > 0 ? [{
            id: "opening",
            date: selectedParty.asOfDate || "",
            source: `${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} Opening Balance`,
            number: "-",
            status: "Unpaid",
            total: selectedOpeningBalance,
            received: 0,
            balance: selectedOpeningBalance,
            receivableBalance: selectedBalanceType === "to-receive" ? selectedOpeningBalance : 0,
            payableBalance: selectedBalanceType === "to-pay" ? selectedOpeningBalance : 0,
          }] : []),
          ...partyTransactions.map((entry) => ({
            id: entry.id,
            date: entry.date,
            source: entry.source,
            number: entry.number || "-",
            status: entry.status || "Paid",
            total: Number(entry.total || 0),
            received: Number(entry.received || 0),
            balance: Number(entry.balance || 0),
            receivableBalance: selectedBalanceType === "to-receive" ? Number(entry.balance || 0) : 0,
            payableBalance: selectedBalanceType === "to-pay" ? Number(entry.balance || 0) : 0,
          })),
        ];

        const totalAmount = statementRows.reduce((sum, r) => sum + Number(r.total || 0), 0);
        const totalReceived = statementRows.reduce((sum, r) => sum + Number(r.received || 0), 0);
        const totalBalance = statementRows.reduce((sum, r) => sum + Number(r.balance || 0), 0);
        const totalReceivable = statementRows.reduce((sum, r) => sum + Number(r.receivableBalance || 0), 0);
        const totalPayable = statementRows.reduce((sum, r) => sum + Number(r.payableBalance || 0), 0);

        return (
          <div className="party-statement-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 backdrop-blur-xs">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                .party-statement-print, .party-statement-print * { visibility: visible !important; }
                .party-statement-print {
                  position: fixed !important;
                  inset: 0 !important;
                  width: 100% !important;
                  max-height: none !important;
                  overflow: visible !important;
                  border: 0 !important;
                  box-shadow: none !important;
                  background: white !important;
                }
                .party-statement-actions, .party-statement-close { display: none !important; }
              }
            `}</style>
            <section className="party-statement-print flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              {/* Header */}
              <header className="party-statement-close flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="text-xl font-bold text-slate-800">Preview</h2>
                <button
                  type="button"
                  aria-label="Close preview"
                  onClick={() => { setStatementOpen(false); setPrintStatementOnOpen(false); }}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </header>

              {/* Main Content */}
              <main className="min-h-0 flex-1 overflow-auto px-6 py-6 text-sm text-black sm:px-12">
                {/* Company Title */}
                <div className="text-center">
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{companyName}</h3>
                  {companyPhone && (
                    <p className="mt-1 text-xs text-slate-600">Phone no.: {companyPhone}</p>
                  )}
                </div>

                {/* Document Title */}
                <h1 className="mb-8 mt-6 text-center text-2xl sm:text-3xl font-extrabold text-slate-950 underline decoration-2 underline-offset-4">
                  Party statement
                </h1>

                {/* Party Info */}
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    Party name: {selectedParty?.partyName || "Cash Sale"}
                  </h2>
                  {selectedParty?.phone && (
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      Contact No.: {selectedParty.phone}
                    </p>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded border border-neutral-300">
                  <table className="w-full min-w-[850px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-[#cbd5e1] text-slate-900 font-bold border-b border-neutral-300">
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Txn Type</th>
                        <th className="px-3 py-2.5">Ref No.</th>
                        <th className="px-3 py-2.5">Payment Status</th>
                        <th className="px-3 py-2.5 text-right">Total</th>
                        <th className="px-3 py-2.5 text-right">Received / Paid</th>
                        <th className="px-3 py-2.5 text-right">Txn Balance</th>
                        <th className="px-3 py-2.5 text-right">Receivable Balance</th>
                        <th className="px-3 py-2.5 text-right">Payable Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {statementRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-500 font-medium">
                            No transactions to show
                          </td>
                        </tr>
                      ) : (
                        statementRows.map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-slate-50 text-slate-800">
                            <td className="px-3 py-2.5 font-medium">{formatDateDMY(row.date)}</td>
                            <td className="px-3 py-2.5">{row.source}</td>
                            <td className="px-3 py-2.5">{row.number}</td>
                            <td className="px-3 py-2.5">
                              <span className={row.status === "Paid" ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                                {row.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium">{money(row.total)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{money(row.received)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{money(row.balance)}</td>
                            <td className="px-3 py-2.5 text-right font-medium text-emerald-600">
                              {row.receivableBalance > 0 ? money(row.receivableBalance) : "-"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-rose-600">
                              {row.payableBalance > 0 ? money(row.payableBalance) : "-"}
                            </td>
                          </tr>
                        ))
                      )}

                      {/* Total Row */}
                      {statementRows.length > 0 && (
                        <tr className="bg-[#cbd5e1] font-bold text-slate-900 border-t-2 border-neutral-400">
                          <td className="px-3 py-2.5 font-bold" colSpan={4}>Total</td>
                          <td className="px-3 py-2.5 text-right font-bold">{money(totalAmount)}</td>
                          <td className="px-3 py-2.5 text-right font-bold">{money(totalReceived)}</td>
                          <td className="px-3 py-2.5 text-right font-bold">{money(totalBalance)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{money(totalReceivable)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-rose-700">{money(totalPayable)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </main>

              {/* Actions Footer */}
              <footer className="party-statement-actions flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={() => openStatementDocument(false)}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  Open PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const email = selectedParty?.email || "";
                    const subject = encodeURIComponent(`Party statement - ${selectedParty?.partyName || "Cash Sale"}`);
                    const body = encodeURIComponent("Please find the party statement attached.");
                    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
                  }}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  Email PDF
                </button>
                <button
                  type="button"
                  onClick={() => { setStatementOpen(false); setPrintStatementOnOpen(false); }}
                  className="rounded-full bg-rose-600 px-7 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-rose-700 transition"
                >
                  Close
                </button>
              </footer>
            </section>
          </div>
        );
      })()}
      {isModalOpen && <AddPartyModal initialParty={partyBeingEdited} onClose={() => { setIsModalOpen(false); setPartyBeingEdited(null); }} onSave={saveParty} />}
    </div>
  );
}

export default PartyDetails;
