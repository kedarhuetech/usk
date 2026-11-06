// Implements the party details page.
import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiBell,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiCopy,
  FiDownload,
  FiFileText,
  FiFilter,
  FiMail,
  FiMessageSquare,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiSettings,
  FiStar,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import Button from "../../components/Common/Button";
import Input from "../../components/Common/Input";
import ImportPartiesModal from "./ImportPartiesModal";
import { gstTypes, indianStates, partyFormDefaults } from "../../constants/partiesData";
import { deleteParty, getPartyDeletionBlockReason, getParties, saveParty as savePartyLocally } from "../../services/partiesStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";
import { getCompanyProfile } from "../../services/companyProfileStorage";
import { businessDataChangedEvent } from "../../services/businessDataChanged";
import { calculateInvoiceSettlement, calculatePartyBalances, transactionMatchesParty } from "../../services/partyBalances";
import useAppSettings from "../../hooks/useAppSettings";

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
      <div className="absolute bottom-6 right-2 flex h-24 w-24 items-center justify-center rounded-full border-8 border-amber-400 bg-white text-[#FF5A1F] shadow-md">
        <FiUsers className="h-10 w-10" />
      </div>
      <div className="absolute bottom-8 left-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-white shadow-md">
        <FiPlus className="h-7 w-7" />
      </div>
    </div>
  );
}

// Renders the gst address tab interface.
function GstAddressTab({ form, setField, showShipping, setShowShipping, enableShippingAddress = true }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <SelectField label="GST Type" value={form.gstType} onChange={(value) => setField("gstType", value)} options={gstTypes} />
        <SelectField label="State" value={form.state} onChange={(value) => setField("state", value)} options={indianStates} />
        <Input label="Email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="Email ID" />
      </div>

      <div className={`grid gap-6 ${enableShippingAddress ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
        <div>
          <TextareaField label="Billing Address" value={form.billingAddress} onChange={(value) => setField("billingAddress", value)} placeholder="Billing Address" />
          <button type="button" className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
            Show Detailed Address
          </button>
        </div>
        {enableShippingAddress && (
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
                className="mt-8 flex h-28 w-full items-center justify-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50/50 text-sm font-semibold text-blue-600 hover:bg-blue-50 cursor-pointer"
              >
                <FiPlus /> Add Shipping Address
              </button>
            )}
          </div>
        )}
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

// Renders the additional fields tab interface using configured settings.
function AdditionalFieldsTab({ form, setAdditionalField, customFieldSettings = [] }) {
  const activeSettings = (customFieldSettings?.length === 4 ? customFieldSettings : [])
    .filter((cf) => cf.enabled);

  if (activeSettings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
        <p className="text-sm font-medium text-slate-700">No additional party fields are currently enabled in Settings.</p>
        <p className="mt-1 text-xs text-slate-500">
          Go to <span className="font-semibold text-blue-600">Settings &gt; PARTY &gt; Additional fields</span> to enable custom fields (e.g. MRP, Route, Delivery Zone).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Active Additional Fields (Configured in Party Settings)
      </p>
      {activeSettings.map((setting) => {
        const fieldItem = (form.additionalFields || []).find((f) => f.id === setting.id) || {
          id: setting.id,
          fieldName: setting.name || "",
          value: "",
          showInPrint: setting.showInPrint ?? true,
          enabled: true,
          type: setting.type || "text",
        };
        const labelText = setting.name || `Field (${setting.id})`;

        return (
          <div
            key={setting.id}
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3.5 sm:grid-cols-[180px_1fr_140px] items-center shadow-xs"
          >
            <div>
              <span className="block text-xs font-bold text-slate-800">{labelText}</span>
              <span className="text-[11px] text-slate-400">
                {setting.type === "date" ? "Date (dd/mm/yy)" : "Text field"}
              </span>
            </div>

            <div>
              {setting.type === "date" ? (
                <input
                  type="date"
                  value={fieldItem.value || ""}
                  onChange={(e) => setAdditionalField(setting.id, "value", e.target.value, setting)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              ) : (
                <input
                  type="text"
                  value={fieldItem.value || ""}
                  onChange={(e) => setAdditionalField(setting.id, "value", e.target.value, setting)}
                  placeholder={`Enter ${labelText}`}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              )}
            </div>

            <label className="flex items-center justify-end gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <span>Show In Print</span>
              <input
                type="checkbox"
                checked={fieldItem.showInPrint ?? setting.showInPrint ?? true}
                onChange={(e) => setAdditionalField(setting.id, "showInPrint", e.target.checked, setting)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

// Renders the add party modal interface.
function AddPartyModal({ onClose, onSave, initialParty = null, appSettings = {} }) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [showShipping, setShowShipping] = useState(Boolean(initialParty?.shippingAddress));
  const [form, setForm] = useState(() => ({
    ...partyFormDefaults,
    status: "active",
    loyaltyPoints: 0,
    ...(initialParty || {}),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sets field.
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  // Sets additional field by setting ID.
  const setAdditionalField = (fieldId, prop, value, settingMeta = null) => {
    setForm((current) => {
      const existing = current.additionalFields || [];
      const idx = existing.findIndex((f) => f.id === fieldId);
      if (idx >= 0) {
        return {
          ...current,
          additionalFields: existing.map((f, i) => (i === idx ? { ...f, [prop]: value } : f)),
        };
      }
      return {
        ...current,
        additionalFields: [
          ...existing,
          {
            id: fieldId,
            fieldName: settingMeta?.name || fieldId,
            value: prop === "value" ? value : "",
            showInPrint: prop === "showInPrint" ? value : (settingMeta?.showInPrint ?? true),
            enabled: true,
            type: settingMeta?.type || "text",
            [prop]: value,
          },
        ],
      };
    });
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
      await onSave({
        ...form,
        partyName: form.partyName.trim(),
        status: form.status || "active",
      });
      if (resetAfterSave) {
        setForm({ ...partyFormDefaults, status: "active", loyaltyPoints: 0 });
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
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-slate-800">{initialParty ? "Edit Party" : "Add Party"}</h2>
            {(appSettings.managePartyStatus ?? true) && (
              <button
                type="button"
                onClick={() => setField("status", (form.status || "active") === "inactive" ? "active" : "inactive")}
                className={`rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  form.status === "inactive"
                    ? "bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200"
                    : "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200"
                }`}
                title="Click to toggle Active / Inactive"
              >
                ● {form.status === "inactive" ? "Inactive" : "Active"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <FiSettings className="h-5 w-5" />
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-slate-100 cursor-pointer">
              <FiX className="h-6 w-6" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className={`grid gap-4 md:grid-cols-2 ${(appSettings.enablePartyGrouping ?? true) ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <Input label="Party Name *" value={form.partyName} onChange={(event) => setField("partyName", event.target.value)} placeholder="Party Name" />
            <Input label="GSTIN" value={form.gstin} onChange={(event) => setField("gstin", event.target.value)} placeholder="GSTIN" />
            <Input label="Phone Number" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="Phone Number" />
            {(appSettings.enablePartyGrouping ?? true) && (
              <Input label="Party Group" value={form.group || ""} onChange={(event) => setField("group", event.target.value)} placeholder="e.g. General, Retailers, Wholesalers" />
            )}
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
              <GstAddressTab
                form={form}
                setField={setField}
                showShipping={showShipping}
                setShowShipping={setShowShipping}
                enableShippingAddress={appSettings.enableShippingAddress ?? true}
              />
            )}
            {activeTab === "Credit & Balance" && <CreditBalanceTab form={form} setField={setField} />}
            {activeTab === "Additional Fields" && (
              <AdditionalFieldsTab
                form={form}
                setAdditionalField={setAdditionalField}
                customFieldSettings={appSettings.partyCustomFields}
              />
            )}
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

function buildStatementDocument(party, invoices, activity = [], settings = {}) {
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
      receivableBalance: Number(entry.receivableBalance || 0),
      payableBalance: Number(entry.payableBalance || 0),
    })),
  ];

  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const totalReceivable = rows.reduce((s, r) => s + r.receivableBalance, 0);
  const totalPayable = rows.reduce((s, r) => s + r.payableBalance, 0);

  const printShipping = (settings?.printShippingAddress !== false) && party?.shippingAddress;
  const printableFields = (party?.additionalFields || []).filter((f) => f.showInPrint && f.value);

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
    .party-info { margin-bottom: 16px; line-height: 1.5; }
    .party-name { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
    .party-contact { font-size: 13px; color: #475569; margin: 2px 0; }
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
    ${party?.billingAddress ? `<div class="party-contact">Billing Address: ${escapeHtml(party.billingAddress)}</div>` : ""}
    ${printShipping ? `<div class="party-contact"><strong>Shipping Address:</strong> ${escapeHtml(party.shippingAddress)}</div>` : ""}
    ${printableFields.map((f) => `<div class="party-contact"><strong>${escapeHtml(f.fieldName || f.name)}:</strong> ${escapeHtml(f.value)}</div>`).join("")}
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
  const appSettings = useAppSettings() || {};

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
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderExtraMessage, setReminderExtraMessage] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");
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
  const [partyActivity, setPartyActivity] = useState({ estimates: [], proformas: [], payments: [], paymentsOut: [], creditNotes: [], debitNotes: [] });
  const [selectedPartyId, setSelectedPartyId] = useState("cash-sale");
  const [search, setSearch] = useState("");
  const [statementOpen, setStatementOpen] = useState(false);
  const [printStatementOnOpen, setPrintStatementOnOpen] = useState(false);
  const [transactionSearchOpen, setTransactionSearchOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [importPartiesOpen, setImportPartiesOpen] = useState(false);
  const [importNotice, setImportNotice] = useState("");

  const handleImportParties = (selectedContacts) => {
    if (!selectedContacts?.length) return;
    const existing = getParties();
    let firstSavedId = null;

    for (const c of selectedContacts) {
      const match = existing.find(
        (p) =>
          String(p.partyName || "").trim().toLowerCase() === String(c.name || "").trim().toLowerCase() ||
          (c.phone && String(p.phone || "").trim() === String(c.phone || "").trim())
      );
      if (match) {
        if (!firstSavedId) firstSavedId = match.id;
        continue;
      }

      const saved = savePartyLocally({
        ...partyFormDefaults,
        partyName: c.name,
        phone: c.phone || "",
        email: c.email || "",
        billingAddress: c.address || "",
        openingBalance: "0",
        openingBalanceType: "to-receive",
        gstType: "Unregistered/Consumer",
      });
      if (!firstSavedId) firstSavedId = saved.id;
    }

    const updated = getParties();
    setParties(updated);
    if (firstSavedId) setSelectedPartyId(firstSavedId);
    setImportNotice(`Successfully imported ${selectedContacts.length} ${selectedContacts.length === 1 ? "party" : "parties"}!`);
    setTimeout(() => setImportNotice(""), 3500);
  };

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
        debitNotes: readLocalList("ledgerly:purchaseReturns.v1"),
        saleUi: (() => { try { return JSON.parse(window.localStorage.getItem("ledgerly:saleInvoiceUiActions.v1") || "{}"); } catch { return {}; } })(),
      });
    } catch (error) {
      setLoadError(error.message || "Could not load saved parties from this browser.");
    }
  }, []);

  useEffect(() => {
    const reloadLocalData = () => {
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
        debitNotes: readLocalList("ledgerly:purchaseReturns.v1"),
        saleUi: (() => { try { return JSON.parse(window.localStorage.getItem("ledgerly:saleInvoiceUiActions.v1") || "{}"); } catch { return {}; } })(),
      });
    };
    window.addEventListener(businessDataChangedEvent, reloadLocalData);
    window.addEventListener("storage", reloadLocalData);
    return () => {
      window.removeEventListener(businessDataChangedEvent, reloadLocalData);
      window.removeEventListener("storage", reloadLocalData);
    };
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

  const removeParty = () => {
    if (!selectedParty) return;
    const blockReason = getPartyDeletionBlockReason(selectedParty);
    if (blockReason) {
      setLoadError(`Cannot delete ${selectedParty.partyName}. ${blockReason}`);
      return;
    }
    if (!window.confirm(`Delete party "${selectedParty.partyName}"? This party has no linked transactions.`)) return;
    deleteParty(selectedParty.id);
    setParties((current) => current.filter((party) => String(party.id) !== String(selectedParty.id)));
    setSelectedPartyId("cash-sale");
    setLoadError("");
  };

  const partyBalanceResult = useMemo(() => calculatePartyBalances({
    parties,
    sales: invoices,
    purchases,
    paymentIns: partyActivity.payments,
    paymentOuts: partyActivity.paymentsOut,
    creditNotes: partyActivity.creditNotes,
    debitNotes: partyActivity.debitNotes,
    saleUi: partyActivity.saleUi,
  }), [parties, invoices, purchases, partyActivity]);
  const getPartyBalanceInfo = (party) => partyBalanceResult.parties.find((entry) => String(entry.id) === String(party.id)) || { receivable: 0, payable: 0, customerAdvances: 0, supplierAdvances: 0, net: 0 };

  const partyGroups = useMemo(() => {
    const set = new Set();
    parties.forEach((p) => {
      const g = (p.group || "General").trim();
      if (g) set.add(g);
    });
    return Array.from(set);
  }, [parties]);

  const filteredParties = parties.filter((party) => {
    const matchesSearch = String(party.partyName || "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    // Party Grouping setting check
    if ((appSettings.enablePartyGrouping ?? true) && groupFilter !== "all") {
      const g = (party.group || "General").toLowerCase();
      if (g !== groupFilter.toLowerCase()) return false;
    }

    // Party Status setting check
    if ((appSettings.managePartyStatus ?? true) && statusFilter !== "all") {
      const s = party.status || "active";
      if (statusFilter === "active" && s === "inactive") return false;
      if (statusFilter === "inactive" && s !== "inactive") return false;
    }

    const info = getPartyBalanceInfo(party);
    if (balanceFilter === "receivable") return info.receivable > 0;
    if (balanceFilter === "payable") return info.payable > 0;
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
  const selectedPartyBalance = selectedParty ? getPartyBalanceInfo(selectedParty) : null;
  const partyInvoices = selectedParty ? invoices.filter((invoice) => transactionMatchesParty(invoice, selectedParty)) : [];
  const partyPurchases = selectedParty ? purchases.filter((bill) => transactionMatchesParty(bill, selectedParty)) : [];
  const belongsToSelectedParty = (entry) => selectedParty && transactionMatchesParty(entry, selectedParty);
  const partyTransactions = [
    ...partyInvoices.map((invoice) => {
      const settlement = calculateInvoiceSettlement(invoice, { kind: "sale", payments: partyActivity.payments, adjustments: partyActivity.creditNotes });
      return { id: `sale:${invoice.id}`, source: "Sale", number: invoice.form?.invoiceNumber || invoice.invoiceNumber || invoice.number || "—", date: invoice.form?.invoiceDate || invoice.createdAt, total: settlement.total, received: settlement.paid, balance: settlement.outstanding, receivableBalance: settlement.outstanding, payableBalance: 0, status: settlement.status, raw: invoice };
    }),
    ...partyPurchases.map((bill) => {
      const settlement = calculateInvoiceSettlement(bill, { kind: "purchase", payments: partyActivity.paymentsOut, adjustments: partyActivity.debitNotes });
      return { id: `purchase:${bill.id}`, source: "Purchase", number: bill.form?.invoiceNumber || bill.invoiceNumber || bill.billNumber || bill.number || "—", date: bill.form?.invoiceDate || bill.form?.billDate || bill.date || bill.createdAt, total: settlement.total, received: settlement.paid, balance: settlement.outstanding, receivableBalance: 0, payableBalance: settlement.outstanding, status: settlement.status, raw: bill };
    }),
    ...partyActivity.estimates.filter(belongsToSelectedParty).map((entry) => ({ id: `estimate:${entry.id}`, source: "Estimate/Quotation", number: entry.number || entry.refNo || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: String(entry.status || "Open").startsWith("Converted") ? Number(entry.amount || 0) : 0, balance: String(entry.status || "Open").startsWith("Converted") ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...partyActivity.proformas.filter(belongsToSelectedParty).map((entry) => ({ id: `proforma:${entry.id}`, source: "Proforma Invoice", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: String(entry.status || "Open").startsWith("Converted") ? Number(entry.amount || 0) : 0, balance: String(entry.status || "Open").startsWith("Converted") ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...partyActivity.payments.filter(belongsToSelectedParty).map((entry) => { const unallocated = !entry.linkedInvoiceId && !entry.invoiceId && !(entry.allocations || []).length; const advance = unallocated ? Number(entry.amount || 0) : 0; return { id: `payment:${entry.id}`, source: "Payment-In", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: Number(entry.received ?? entry.amount ?? 0), balance: advance, receivableBalance: 0, payableBalance: advance, status: entry.status || "Unused", raw: entry }; }),
    ...partyActivity.paymentsOut.filter(belongsToSelectedParty).map((entry) => { const unallocated = !entry.linkedInvoiceId && !entry.linkedBillId && !entry.invoiceId && !entry.billId && !entry.purchaseId && !entry.linkedCreditNoteId && !(entry.allocations || []).length; const advance = unallocated ? Number(entry.amount || 0) : 0; return { id: `payment-out:${entry.id}`, source: entry.linkedCreditNoteId ? "Credit Note Refund" : "Payment-Out", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: Number(entry.amount || 0), balance: advance, receivableBalance: advance, payableBalance: 0, status: entry.status || "Paid", raw: entry }; }),
    ...partyActivity.creditNotes.filter((entry) => entry.type === "Credit Note" && !entry.cancelled && belongsToSelectedParty(entry)).map((entry) => { const credit = Number(entry.customerCreditAmount ?? entry.balance ?? 0); return { id: `credit-note:${entry.id}`, source: "Credit Note", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.total || 0), received: Number(entry.received || 0), balance: credit, receivableBalance: 0, payableBalance: credit, status: entry.status || "Credit Available", raw: entry }; }),
    ...partyActivity.debitNotes.filter((entry) => !entry.cancelled && belongsToSelectedParty(entry)).map((entry) => { const linked = entry.billId || entry.purchaseId || entry.linkedInvoiceId; const credit = linked ? 0 : Number(entry.balance ?? Math.max(0, Number(entry.total || entry.amount || 0) - Number(entry.received || 0))); return { id: `debit-note:${entry.id}`, source: "Debit Note", number: entry.refNo || entry.returnNo || entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.total || entry.amount || 0), received: Number(entry.received || 0), balance: credit, receivableBalance: credit, payableBalance: 0, status: entry.status || "Supplier Credit", raw: entry }; }),
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
    popup.document.write(buildStatementDocument(selectedParty, partyInvoices, partyTransactions, appSettings));
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
        <div className="flex items-center gap-4"><Button onClick={() => { setPartyBeingEdited(null); setIsModalOpen(true); }} className="bg-rose-600 text-white hover:bg-rose-700"><FiPlus /> Add Party</Button></div>
      </div>
      {loadError && <p className="bg-white px-5 py-2 text-sm text-red-600">{loadError}</p>}
      <div className="grid min-h-0 flex-1 gap-1 p-1 md:grid-cols-[minmax(300px,29%)_1fr]">
        <section className="flex min-h-[430px] flex-col overflow-hidden rounded-md bg-white">
          <div className="p-4 pb-2"><label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 px-4 text-slate-400"><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Party Name" className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" /></label></div>
          {/* Balance Filter Pills */}
          <div className="flex items-center gap-1.5 px-4 pb-2.5">
            {[
              { id: "all", label: "All" },
              { id: "receivable", label: "To Receive" },
              { id: "payable", label: "To Pay" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBalanceFilter(f.id)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  balanceFilter === f.id
                    ? f.id === "receivable"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : f.id === "payable"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-[#14171E] text-white shadow-xs ring-1 ring-[#FF5A1F]/50"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Party Grouping Filter Dropdown */}
          {(appSettings.enablePartyGrouping ?? true) && partyGroups.length > 0 && (
            <div className="flex items-center gap-2 px-4 pb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Group:</span>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="h-7 flex-1 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Groups ({parties.length})</option>
                {partyGroups.map((g) => {
                  const count = parties.filter((p) => (p.group || "General").toLowerCase() === g.toLowerCase()).length;
                  return (
                    <option key={g} value={g}>{g} ({count})</option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Party Status Filter Pills */}
          {(appSettings.managePartyStatus ?? true) && (
            <div className="flex items-center gap-1.5 px-4 pb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Status:</span>
              {[
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "inactive", label: "Inactive" },
              ].map((sf) => (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => setStatusFilter(sf.id)}
                  className={`rounded px-2.5 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                    statusFilter === sf.id
                      ? sf.id === "inactive"
                        ? "bg-rose-600 text-white shadow-xs"
                        : sf.id === "active"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-800 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {sf.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[1fr_130px] border-y border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            <span className="flex items-center justify-between">Party Name <FiFilter className="text-rose-500" /></span>
            <span>Amount</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {balanceFilter === "all" && statusFilter !== "inactive" && groupFilter === "all" && (
              <button
                onClick={() => setSelectedPartyId("cash-sale")}
                className={`grid w-full grid-cols-[1fr_130px] px-4 py-4 text-left text-sm transition ${
                  selectedPartyId === "cash-sale" ? "bg-sky-100 dark:bg-sky-950/40" : "hover:bg-slate-50"
                }`}
              >
                <span className="font-medium text-slate-800">Cash Sale</span>
                <span className="text-right font-medium text-emerald-500">0.00</span>
              </button>
            )}

            {filteredParties.map((party) => {
              const info = getPartyBalanceInfo(party);
              const isInactive = party.status === "inactive";
              return (
                <button
                  key={party.id}
                  onClick={() => setSelectedPartyId(party.id)}
                  className={`grid w-full grid-cols-[1fr_130px] items-center px-4 py-3.5 text-left text-sm transition ${
                    String(selectedPartyId) === String(party.id)
                      ? "bg-sky-100 dark:bg-sky-950/40"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate font-medium ${isInactive ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {party.partyName}
                      </span>
                      {(appSettings.managePartyStatus ?? true) && isInactive && (
                        <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-700">
                          Inactive
                        </span>
                      )}
                    </div>
                    {(appSettings.enablePartyGrouping ?? true) && party.group && (
                      <span className="mt-0.5 inline-block truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {party.group}
                      </span>
                    )}
                  </div>
                  <span className="text-right">
                    {info.receivable > 0 && (
                      <span className="block text-xs font-semibold text-emerald-600">
                        {info.receivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })} To Receive
                      </span>
                    )}
                    {info.payable > 0 && (
                      <span className="block text-xs font-semibold text-rose-600">
                        {info.payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })} To Pay
                      </span>
                    )}
                    {info.receivable <= 0 && info.payable <= 0 && (
                      <span className="text-xs text-slate-400">Settled</span>
                    )}
                  </span>
                </button>
              );
            })}

            {filteredParties.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400">
                {balanceFilter === "receivable" ? "No receivable parties found" : balanceFilter === "payable" ? "No payable parties found" : "No parties found"}
              </div>
            )}
          </div>

          {/* Left down side UI for adding parties through contacts using phone number and gmail */}
          <div className="border-t border-slate-200 p-2.5 bg-white">
            <button
              type="button"
              onClick={() => setImportPartiesOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-[#ecfdf5] p-2.5 text-left transition hover:bg-emerald-100/90 active:scale-[0.99] cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                  <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 2v20M6 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                    <circle cx="10" cy="10" r="2" />
                    <path d="M7 16a3 3 0 0 1 6 0" />
                  </svg>
                </div>
                <p className="text-xs leading-snug text-slate-700">
                  Use contacts from your Phone or<br />
                  Gmail to <span className="font-bold text-slate-900">quickly create parties.</span>
                </p>
              </div>
              <FiChevronRight className="h-4 w-4 shrink-0 text-emerald-700" />
            </button>
          </div>
        </section>

        {/* Right Section: Party Header & Transactions */}
        <section className="min-w-0 overflow-hidden rounded-md bg-white flex flex-col">
          {/* Header */}
          <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 bg-white">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-bold text-slate-800 text-lg">{cashSaleName}</h2>
                {selectedParty && (appSettings.enablePartyGrouping ?? true) && selectedParty.group && (
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                    {selectedParty.group}
                  </span>
                )}
                {selectedParty && (appSettings.managePartyStatus ?? true) && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextStatus = selectedParty.status === "inactive" ? "active" : "inactive";
                      saveParty({ ...selectedParty, status: nextStatus });
                    }}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border transition cursor-pointer ${
                      selectedParty.status === "inactive"
                        ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    }`}
                    title="Click to toggle Active / Inactive status"
                  >
                    ● {selectedParty.status === "inactive" ? "Inactive" : "Active"}
                  </button>
                )}
                {selectedParty && (
                  <>
                    <button
                      aria-label="Edit party"
                      title="Edit party"
                      onClick={() => {
                        setPartyBeingEdited(selectedParty);
                        setIsModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 font-bold ml-1 cursor-pointer text-xs"
                    >
                      ✎ Edit
                    </button>
                    <button
                      type="button"
                      aria-label="Delete party"
                      title="Delete party"
                      onClick={removeParty}
                      className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {selectedPartyBalance && (
                <p className="mt-1 flex flex-wrap gap-x-4 text-xs">
                  {selectedPartyBalance.receivable > 0 && (
                    <span className="font-semibold text-emerald-700">
                      To Receive {money(selectedPartyBalance.receivable)}
                    </span>
                  )}
                  {selectedPartyBalance.payable > 0 && (
                    <span className="font-semibold text-rose-700">
                      To Pay {money(selectedPartyBalance.payable)}
                    </span>
                  )}
                  {selectedPartyBalance.receivable === 0 && selectedPartyBalance.payable === 0 && selectedOpeningBalance > 0 && (
                    <span className="text-slate-500">
                      Opening balance {money(selectedOpeningBalance)} {selectedBalanceType === "to-pay" ? "To Pay" : "To Receive"}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Payment Reminder Action Button */}
              {selectedParty && (appSettings.enablePaymentReminder ?? true) && (selectedPartyBalance?.receivable > 0 || (selectedBalanceType === "to-receive" && selectedOpeningBalance > 0)) && (
                <button
                  type="button"
                  onClick={() => {
                    setReminderExtraMessage(appSettings.paymentReminderAdditionalMessage || "");
                    setReminderModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition cursor-pointer"
                  title="Send payment reminder to this party"
                >
                  <FiBell className="h-3.5 w-3.5" /> Send Reminder
                </button>
              )}
            </div>
          </div>

          {/* Party Metadata & Custom Fields Card */}
          {selectedParty && (
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {selectedParty.phone && (
                  <div><strong className="text-slate-700">Phone:</strong> {selectedParty.phone}</div>
                )}
                {selectedParty.email && (
                  <div><strong className="text-slate-700">Email:</strong> {selectedParty.email}</div>
                )}
                {selectedParty.gstin && (
                  <div><strong className="text-slate-700">GSTIN:</strong> {selectedParty.gstin}</div>
                )}
                {selectedParty.billingAddress && (
                  <div className="truncate"><strong className="text-slate-700">Billing:</strong> {selectedParty.billingAddress}</div>
                )}
                {(appSettings.enableShippingAddress ?? true) && selectedParty.shippingAddress && (
                  <div className="truncate text-blue-700"><strong className="text-blue-800">Shipping:</strong> {selectedParty.shippingAddress}</div>
                )}
                {(selectedParty.additionalFields || [])
                  .filter((f) => f.value && f.enabled !== false)
                  .map((f) => (
                    <div key={f.id}><strong className="text-slate-700">{f.fieldName || f.name}:</strong> {f.value}</div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-700">Transactions</h2>
            <div className="flex items-center gap-3 text-slate-500">
              {transactionSearchOpen && (
                <input
                  autoFocus
                  value={transactionSearch}
                  onChange={(event) => setTransactionSearch(event.target.value)}
                  placeholder="Search transactions"
                  className="h-9 w-48 rounded-md border border-slate-300 px-3 text-xs text-slate-700 outline-none focus:border-blue-500"
                />
              )}
              <button
                type="button"
                aria-label="Search transactions"
                title="Search transactions"
                onClick={() => { setTransactionSearchOpen((open) => !open); setTransactionSearch(""); }}
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <FiSearch className="text-lg" />
              </button>
              <button
                type="button"
                aria-label="Print party statement"
                title="Print party statement"
                onClick={() => { setPrintStatementOnOpen(false); setStatementOpen(true); }}
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <FiPrinter className="text-lg" />
              </button>
              <button
                type="button"
                aria-label="Download Excel transactions"
                title="Download Excel-compatible transactions"
                onClick={downloadExcel}
                className="grid h-9 w-9 place-items-center rounded-md text-emerald-600 hover:bg-emerald-50 cursor-pointer"
              >
                <span className="rounded bg-emerald-600 px-1 py-0.5 text-[10px] font-bold text-white">XLS</span>
              </button>
              <button
                type="button"
                aria-label="Preview or download PDF"
                title="Preview or download PDF"
                onClick={() => { setPrintStatementOnOpen(false); setStatementOpen(true); }}
                className="grid h-9 w-9 place-items-center rounded-md text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <FiFileText className="text-lg" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[690px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["Type", "Number", "Date", "Total", "Balance/ Unused", "Status", ""].map((label) => (
                    <th key={label} className="border-b border-r border-slate-200 px-3 py-3 font-semibold text-xs">
                      {label}{label && <FiFilter className="float-right mt-0.5 text-slate-400" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedParty && openingBalance > 0 && `${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} opening balance ${selectedParty.asOfDate || ""}`.toLowerCase().includes(transactionSearch.toLowerCase()) && (
                  <tr className="border-b border-slate-100 bg-sky-100 text-slate-800">
                    <td className="px-3 py-3.5 text-xs">{selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} Opening Balance</td>
                    <td className="px-3 py-3.5 text-xs">—</td>
                    <td className="px-3 py-3.5 text-xs">{selectedParty.asOfDate ? new Date(selectedParty.asOfDate).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-medium">₹ {openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-medium">₹ {openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3.5 text-xs text-rose-500 font-semibold">Unpaid</td>
                    <td className="px-3 py-3.5 text-xs">—</td>
                  </tr>
                )}
                {visiblePartyTransactions.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 text-slate-800 hover:bg-slate-50/50">
                    <td className="px-3 py-3.5 text-xs font-medium">{entry.source}</td>
                    <td className="px-3 py-3.5 text-xs">{entry.number}</td>
                    <td className="px-3 py-3.5 text-xs text-slate-600">{entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-semibold">{money(entry.total)}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-semibold">{(entry.source === "Payment-In" || entry.source === "Payment-Out") && !entry.balance ? "—" : money(entry.balance)}</td>
                    <td className={`px-3 py-3.5 text-xs font-semibold ${entry.status === "Paid" || entry.status === "Used" ? "text-emerald-500" : entry.status === "Partially Paid" ? "text-amber-600" : "text-rose-500"}`}>{entry.status}</td>
                    <td className="px-3 py-3.5 text-xs">—</td>
                  </tr>
                ))}
                {!visiblePartyTransactions.length && (openingBalance <= 0 || !`${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} opening balance ${selectedParty?.asOfDate || ""}`.toLowerCase().includes(transactionSearch.toLowerCase())) && (
                  <tr>
                    <td colSpan="7" className="h-48 text-center text-xs text-slate-400">
                      {transactionSearch ? "No matching transactions" : "No transactions to show"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
            receivableBalance: Number(entry.receivableBalance || 0),
            payableBalance: Number(entry.payableBalance || 0),
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
                <div className="mb-4 space-y-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    Party name: {selectedParty?.partyName || "Cash Sale"}
                  </h2>
                  {selectedParty?.phone && (
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      Contact No.: {selectedParty.phone}
                    </p>
                  )}
                  {selectedParty?.billingAddress && (
                    <p className="text-xs font-medium text-slate-600">
                      Billing Address: {selectedParty.billingAddress}
                    </p>
                  )}
                  {(appSettings.printShippingAddress !== false) && selectedParty?.shippingAddress && (
                    <p className="text-xs font-semibold text-blue-700">
                      Shipping Address: {selectedParty.shippingAddress}
                    </p>
                  )}
                  {(selectedParty?.additionalFields || [])
                    .filter((f) => f.showInPrint && f.value)
                    .map((f) => (
                      <p key={f.id} className="text-xs font-medium text-slate-700">
                        <strong>{f.fieldName || f.name}:</strong> {f.value}
                      </p>
                    ))}
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
      {isModalOpen && (
        <AddPartyModal
          initialParty={partyBeingEdited}
          onClose={() => {
            setIsModalOpen(false);
            setPartyBeingEdited(null);
          }}
          onSave={saveParty}
          appSettings={appSettings}
        />
      )}
      <ImportPartiesModal
        isOpen={importPartiesOpen}
        onClose={() => setImportPartiesOpen(false)}
        onImportParties={handleImportParties}
      />
      {importNotice && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition animate-in fade-in slide-in-from-bottom duration-200">
          <FiCheck className="h-4 w-4" />
          {importNotice}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: Send Payment Reminder (Screenshot 2) */}
      {/* ============================================================ */}
      {reminderModalOpen && selectedParty && (() => {
        const company = getCompanyProfile();
        const companyName = company.businessName || company.companyName || "Sai Kirana Stores";
        const amount = selectedPartyBalance?.receivable > 0
          ? selectedPartyBalance.receivable
          : (selectedBalanceType === "to-receive" ? selectedOpeningBalance : 0);
        const formattedAmount = money(amount);
        const fullText = `Dear, ${selectedParty.partyName}\nYour payment of ${formattedAmount} is pending with ${companyName}\n${reminderExtraMessage ? reminderExtraMessage + "\n" : ""}If you have already made the payment, kindly ignore this message.`;

        const handleSendWhatsApp = () => {
          const rawPhone = (selectedParty.phone || "").replace(/[^0-9]/g, "");
          if (!rawPhone) {
            alert("This party has no phone number entered.");
            return;
          }
          const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
          const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullText)}`;
          window.open(url, "_blank");
        };

        const handleCopyMessage = async () => {
          try {
            await navigator.clipboard.writeText(fullText);
            setReminderNotice("Reminder message copied to clipboard!");
            setTimeout(() => setReminderNotice(""), 3000);
          } catch {
            setReminderNotice("Could not copy message automatically.");
          }
        };

        const handleEmailReminder = () => {
          const email = selectedParty.email || "";
          const subject = encodeURIComponent(`Payment Reminder - ${companyName}`);
          const body = encodeURIComponent(fullText);
          window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setReminderModalOpen(false);
            }}
          >
            <div
              className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl transition animate-in fade-in zoom-in-95 duration-150"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <h3 className="text-base font-bold text-slate-800">Add/Edit Reminder Message</h3>
                <button
                  type="button"
                  onClick={() => setReminderModalOpen(false)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition cursor-pointer"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-3.5">
                <div className="space-y-1 text-sm text-slate-800 font-medium">
                  <p>Dear, <span className="font-bold text-blue-600">{selectedParty.partyName}</span></p>
                  <p>Your payment of <span className="font-bold text-emerald-600">{formattedAmount}</span> is pending with <span className="font-bold text-slate-900">{companyName}</span></p>
                </div>

                <textarea
                  rows={4}
                  value={reminderExtraMessage}
                  onChange={(e) => setReminderExtraMessage(e.target.value)}
                  placeholder="Type additional message"
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                />

                <p className="text-xs text-slate-500">
                  If you have already made the payment, kindly ignore this message.
                </p>

                {reminderNotice && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    <FiCheck className="h-4 w-4" />
                    {reminderNotice}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setReminderModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-98 transition cursor-pointer"
                >
                  <FiCopy className="h-3.5 w-3.5" /> COPY
                </button>
                {selectedParty.email && (
                  <button
                    type="button"
                    onClick={handleEmailReminder}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-98 transition cursor-pointer"
                  >
                    <FiMail className="h-3.5 w-3.5" /> EMAIL
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-98 transition cursor-pointer"
                >
                  <FiMessageSquare className="h-3.5 w-3.5" /> SEND VIA WHATSAPP
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default PartyDetails;
