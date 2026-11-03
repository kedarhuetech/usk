// Implements the sale preview page with multiple themes and color selection.
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiDownload,
  FiMail,
  FiMessageCircle,
  FiPrinter,
  FiShare2,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import { getCompanyProfile } from "../../services/companyProfileStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import { businessGrowthApi } from "../../services/apiClient.js";
import { normalizePersistedAssetUrls } from "../../services/businessGrowthData.js";
import {
  APP_SETTINGS_UPDATED_EVENT,
  getAppSettings,
  saveAppSettings,
} from "../../services/appSettingsStorage.js";

// Color palette for accent colors.
export const colorOptions = [
  { name: "Magenta", bg: "bg-[#881337]", text: "text-[#881337]", border: "border-[#881337]", hex: "#881337", bgLight: "bg-rose-50", textLight: "text-[#881337]", borderLight: "border-rose-200" },
  { name: "Indigo", bg: "bg-indigo-600", text: "text-indigo-600", border: "border-indigo-600", hex: "#4f46e5", bgLight: "bg-indigo-50", textLight: "text-indigo-700", borderLight: "border-indigo-200" },
  { name: "Sky", bg: "bg-sky-600", text: "text-sky-600", border: "border-sky-600", hex: "#0284c7", bgLight: "bg-sky-50", textLight: "text-sky-700", borderLight: "border-sky-200" },
  { name: "Slate", bg: "bg-slate-600", text: "text-slate-600", border: "border-slate-600", hex: "#475569", bgLight: "bg-slate-50", textLight: "text-slate-700", borderLight: "border-slate-200" },
  { name: "Zinc", bg: "bg-zinc-700", text: "text-zinc-700", border: "border-zinc-700", hex: "#3f3f46", bgLight: "bg-zinc-50", textLight: "text-zinc-700", borderLight: "border-zinc-200" },
  { name: "Emerald", bg: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-600", hex: "#059669", bgLight: "bg-emerald-50", textLight: "text-emerald-700", borderLight: "border-emerald-200" },
  { name: "Orange", bg: "bg-orange-600", text: "text-orange-600", border: "border-orange-600", hex: "#ea580c", bgLight: "bg-orange-50", textLight: "text-orange-700", borderLight: "border-orange-200" },
  { name: "Rose", bg: "bg-rose-600", text: "text-rose-600", border: "border-rose-600", hex: "#e11d48", bgLight: "bg-rose-50", textLight: "text-rose-700", borderLight: "border-rose-200" },
  { name: "Purple", bg: "bg-purple-600", text: "text-purple-600", border: "border-purple-600", hex: "#9333ea", bgLight: "bg-purple-50", textLight: "text-purple-700", borderLight: "border-purple-200" },
];

export const themeList = [
  "GST Theme 1",
  "GST Theme 2",
  "GST Theme 3",
  "GST Theme 4",
  "GST Theme 5",
  "GST Theme 6",
  "Bill of Supply",
  "Classic Simple",
];

// Discards placeholder 'My Company' and resolves actual company name.
function getEffectiveCompanyName(profile, savedBusiness, invoiceBusiness) {
  const candidates = [
    profile?.companyName,
    profile?.businessName,
    savedBusiness?.businessName,
    savedBusiness?.storeName,
    invoiceBusiness?.name,
  ];
  for (const name of candidates) {
    if (name && typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed && trimmed.toLowerCase() !== "my company") {
        return trimmed;
      }
    }
  }
  return "Sai Kirana Stores";
}

// Reads stored invoice safely.
function readStoredInvoice() {
  try {
    const raw = sessionStorage.getItem("ledgerly:lastSaleInvoice");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}

  try {
    const list = getSaleInvoices();
    if (Array.isArray(list) && list.length > 0) return list[0];
  } catch {}

  return null;
}

// Converts number to Indian currency words.
export function numberToWords(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n === 0) return "Zero Rupees Only";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const scales = ["", "Thousand", "Lakh", "Crore"];

  function convertGroup(val) {
    if (val === 0) return "";
    if (val < 20) return ones[val];
    if (val < 100) return tens[Math.floor(val / 10)] + (val % 10 ? " " + ones[val % 10] : "");
    return ones[Math.floor(val / 100)] + " Hundred" + (val % 100 ? " " + convertGroup(val % 100) : "");
  }

  const intPart = Math.floor(Math.abs(n));
  const decPart = Math.round((Math.abs(n) - intPart) * 100);
  let str = "";
  const groups = [];
  let remaining = intPart;

  groups.push(remaining % 1000);
  remaining = Math.floor(remaining / 1000);
  while (remaining > 0) {
    groups.push(remaining % 100);
    remaining = Math.floor(remaining / 100);
  }

  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] > 0) {
      str += convertGroup(groups[i]) + (scales[i] ? " " + scales[i] : "") + " ";
    }
  }

  str = str.trim() || "Zero";
  if (decPart > 0) {
    str += " and " + convertGroup(decPart) + " Paise";
  }
  return str + " Only";
}

// Normalizes invoice data so no theme throws undefined errors.
function normalizeInvoiceData(raw) {
  if (!raw) return null;
  const form = raw.form || {};
  const business = raw.business || {};
  const customer = form.customer || raw.customer || raw.partyName || raw.customerName || "Cash Sale";
  const invoiceNumber = form.invoiceNumber || raw.invoiceNumber || raw.number || "1";
  const rawDate = form.invoiceDate || raw.invoiceDate || raw.date || raw.createdAt || "";
  const invoiceDateFormatted = rawDate ? (rawDate.includes("-") ? rawDate.split("-").reverse().join("-") : rawDate) : "";
  const billingAddress = form.billingAddress || raw.billingAddress || raw.address || "";
  const shippingAddress = form.shippingAddress || raw.shippingAddress || billingAddress;
  const phone = form.phone || raw.phone || raw.contactNumber || "";
  const stateOfSupply = form.stateOfSupply || raw.stateOfSupply || "None";
  const terms = form.terms || raw.terms || "";
  const termsTitle = form.termsTitle || raw.termsTitle || "Terms & Conditions";
  const isRcm = Boolean(form.isRcm || raw.isRcm);

  // Rows normalization
  const rawRows = Array.isArray(raw.rows) && raw.rows.length ? raw.rows : Array.isArray(raw.items) ? raw.items : [];
  const rows = rawRows
    .filter((r) => r && (r.item || r.itemName || r.name || r.qty || r.price))
    .map((r, idx) => {
      const item = r.item || r.itemName || r.name || `Item ${idx + 1}`;
      const hsn = r.hsn || r.sac || "";
      const qty = Number(r.calculated?.qty ?? r.qty ?? r.quantity ?? 1);
      const unit = r.unit || "PCS";
      const price = Number(r.price ?? r.rate ?? r.salePrice ?? 0);
      const discount = Number(r.calculated?.discount ?? r.discountAmount ?? r.discount ?? 0);
      const tax = Number(r.calculated?.tax ?? r.taxAmount ?? r.tax ?? 0);
      const cess = Number(r.calculated?.cess ?? r.cessAmount ?? 0);
      const amount = Number(r.calculated?.amount ?? r.amount ?? r.total ?? (qty * price - discount + tax));

      return {
        id: r.id || `row-${idx}`,
        item,
        hsn,
        qty,
        unit,
        price,
        discount,
        tax,
        cess,
        amount,
      };
    });

  // Totals normalization
  const rawTotals = raw.totals || {};
  const totalQty = Number(rawTotals.qty ?? rows.reduce((s, r) => s + r.qty, 0));
  const totalDiscount = Number(rawTotals.discount ?? rows.reduce((s, r) => s + r.discount, 0));
  const totalTax = Number(rawTotals.tax ?? rows.reduce((s, r) => s + r.tax, 0));
  const totalCess = Number(rawTotals.cess ?? rows.reduce((s, r) => s + r.cess, 0));
  const tcsAmount = Number(rawTotals.tcsAmount ?? 0);
  const tdsAmount = Number(rawTotals.tdsAmount ?? 0);
  const finalTotal = Number(rawTotals.finalTotal ?? rawTotals.amount ?? raw.total ?? raw.amount ?? rows.reduce((s, r) => s + r.amount, 0));
  const received = Number(rawTotals.received ?? 0);
  const balance = Number(rawTotals.balance ?? Math.max(finalTotal - received, 0));

  return {
    customer,
    invoiceNumber,
    invoiceDateFormatted,
    billingAddress,
    shippingAddress,
    phone,
    stateOfSupply,
    terms,
    termsTitle,
    isRcm,
    rows: rows.length > 0 ? rows : [{ id: "empty", item: "Sample Item", hsn: "1001", qty: 1, unit: "PCS", price: finalTotal || 0, discount: 0, tax: 0, cess: 0, amount: finalTotal || 0 }],
    totals: {
      qty: totalQty || 1,
      discount: totalDiscount,
      tax: totalTax,
      cess: totalCess,
      tcsAmount,
      tdsAmount,
      finalTotal: Math.max(0, finalTotal),
      received,
      balance,
    },
    business,
  };
}

// ─────────────────── REUSABLE BLOCKS ───────────────────

export function BankDetailsBlock({ color, appSettings = {} }) {
  if (appSettings.printBankDetails === false) return null;
  const hex = color?.hex || appSettings.themeColor || "#881337";
  return (
    <div className="border border-slate-200 rounded p-2.5 space-y-1 bg-white">
      <p className="font-bold text-xs" style={{ color: hex }}>Bank Details</p>
      <div className="flex items-center gap-2.5">
        <div className="h-12 w-12 border border-slate-300 bg-slate-50 flex flex-col items-center justify-center p-1 shrink-0 rounded">
          <div className="h-7 w-7 bg-slate-800 rounded flex items-center justify-center text-white text-[7px] font-mono">QR</div>
          <span className="text-[6px] font-bold text-emerald-700 mt-0.5">UPI PAY</span>
        </div>
        <div className="text-[11px] text-slate-600 space-y-0.5">
          <p><span className="font-semibold text-slate-700">Bank:</span> HDFC Bank</p>
          <p><span className="font-semibold text-slate-700">A/c No:</span> 50200012345678</p>
          <p><span className="font-semibold text-slate-700">IFSC:</span> HDFC0001234</p>
        </div>
      </div>
    </div>
  );
}

export function SignatureBlock({ companyName, signature, color, appSettings = {} }) {
  if (appSettings.printSignature === false) return null;
  const label = appSettings.printSignatureText || "Authorized Signatory";
  return (
    <div className="inline-block min-w-[170px] text-center border border-slate-200 rounded p-2.5 bg-white">
      <p className="text-[11px] font-semibold text-slate-800">For, {companyName}</p>
      <div className="my-1.5 flex h-12 items-center justify-center">
        {signature ? (
          <img src={signature} alt="Authorized Signature" className="max-h-11 max-w-[130px] object-contain" />
        ) : (
          <div className="mt-8 w-32 border-b border-dashed border-slate-300" />
        )}
      </div>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

// ─────────────────── THEME RENDERERS ───────────────────

// 1. GST Theme 5 - Vyapar Signature Magenta Layout (Default)
export function GSTTheme5({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const hex = color?.hex || appSettings.themeColor || "#881337";
  const docTitle = appSettings.compositeScheme
    ? "Bill of Supply"
    : appSettings.enableGst === false
    ? "Invoice"
    : appSettings.transactionNames?.saleInvoice || "Tax Invoice";

  const showBank = appSettings.printBankDetails !== false;
  const showTerms = appSettings.printTermsAndConditions !== false && Boolean(data.terms || appSettings.termsAndConditions);
  const showSign = appSettings.printSignature !== false;
  const showHsn = appSettings.enableHsnSacCode !== false;
  const showTax = appSettings.enableGst !== false && !appSettings.compositeScheme;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] bg-white p-6 text-[12px] leading-tight text-slate-800 shadow-lg print:min-h-0 print:max-w-none print:p-6 print:text-xs print:shadow-none">
      {/* Title */}
      <div className="text-center pb-2 relative">
        <h2 className="text-base font-bold uppercase tracking-wider text-slate-900">{docTitle}</h2>
        {appSettings.compositeScheme && (
          <p className="text-[10px] text-amber-800 font-medium mt-0.5">
            Composition taxable person, not eligible to collect tax on supplies
          </p>
        )}
        {data.isRcm && (
          <span className="inline-block text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded mt-0.5">
            Tax Payable on Reverse Charge: YES
          </span>
        )}
        {appSettings.printOriginalDuplicate && (
          <span className="absolute right-0 top-0 text-[10px] font-bold text-slate-400 border border-slate-300 px-2 py-0.5 rounded">
            ORIGINAL FOR RECIPIENT
          </span>
        )}
      </div>

      {/* Header Row: Logo Left, Company Name Right */}
      <div className="flex items-start justify-between pb-3 pt-1">
        {appSettings.printCompanyLogo !== false && (
          <div className="h-16 w-28 rounded bg-slate-100 border border-slate-300 flex items-center justify-center text-xs text-slate-400 font-semibold overflow-hidden">
            {companyLogo ? (
              <img src={companyLogo} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              "LOGO"
            )}
          </div>
        )}

        <div className="text-right">
          {appSettings.printCompanyName !== false && (
            <h1 className="text-xl font-bold text-slate-900">{companyName}</h1>
          )}
          {appSettings.printPhoneNumber !== false && companyPhone && (
            <p className="text-slate-600 text-xs mt-0.5">Ph. no : {companyPhone}</p>
          )}
          {appSettings.printAddress !== false && companyAddress && (
            <p className="text-slate-500 text-[11px]">{companyAddress}</p>
          )}
          {appSettings.printGstinOnSale !== false && companyGstin && (
            <p className="text-slate-600 text-[11px] font-semibold mt-0.5">GSTIN : {companyGstin}</p>
          )}
        </div>
      </div>

      {/* Color Accent Band */}
      <div className="w-full h-1.5 mb-3 rounded-full" style={{ backgroundColor: hex }} />

      {/* 3-Column Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-b py-3 text-xs" style={{ borderColor: hex }}>
        <div>
          <p className="font-bold uppercase tracking-wider text-xs" style={{ color: hex }}>Bill To:</p>
          <p className="font-semibold text-slate-900 mt-0.5">{data.customer}</p>
          {data.billingAddress && <p className="text-slate-600 text-[11px]">{data.billingAddress}</p>}
          {data.phone && <p className="text-slate-600 text-[11px]">Contact No: {data.phone}</p>}
        </div>
        <div>
          <p className="font-bold uppercase tracking-wider text-xs" style={{ color: hex }}>Shipping To</p>
          <p className="text-slate-600 text-[11px] mt-0.5">{data.shippingAddress || data.billingAddress}</p>
        </div>
        <div className="text-left md:text-right">
          <p className="font-bold uppercase tracking-wider text-xs" style={{ color: hex }}>Invoice Details</p>
          <p className="text-slate-800 text-[11px] mt-0.5 font-semibold">Invoice No.: {data.invoiceNumber}</p>
          <p className="text-slate-600 text-[11px]">Date: {data.invoiceDateFormatted}</p>
          {appSettings.enablePlaceOfSupply !== false && (
            <p className="text-slate-600 text-[11px]">Place of supply: {data.stateOfSupply}</p>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="text-white font-bold" style={{ backgroundColor: hex }}>
            <th className="p-2 text-center w-8">#</th>
            <th className="p-2 text-left">Item name</th>
            {showHsn && <th className="p-2 text-center">HSN/SAC</th>}
            <th className="p-2 text-center">Quantity</th>
            <th className="p-2 text-right">Price/unit</th>
            <th className="p-2 text-right">Discount</th>
            {showTax && <th className="p-2 text-right">GST</th>}
            <th className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.map((row, idx) => (
            <tr key={row.id || idx}>
              <td className="p-2 text-center">{idx + 1}</td>
              <td className="p-2 font-semibold text-slate-900">{row.item}</td>
              {showHsn && <td className="p-2 text-center text-slate-600">{row.hsn || "-"}</td>}
              <td className="p-2 text-center">{row.qty} {row.unit}</td>
              <td className="p-2 text-right">₹ {row.price.toFixed(2)}</td>
              <td className="p-2 text-right text-slate-600">₹ {row.discount.toFixed(2)}</td>
              {showTax && <td className="p-2 text-right text-slate-600">₹ {row.tax.toFixed(2)}</td>}
              <td className="p-2 text-right font-bold text-slate-900">₹ {row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
            <td className="p-2" colSpan={showHsn ? 3 : 2}>Total</td>
            <td className="p-2 text-center">{appSettings.printTotalItemQty !== false ? data.totals.qty : ""}</td>
            <td className="p-2"></td>
            <td className="p-2 text-right">₹ {data.totals.discount.toFixed(2)}</td>
            {showTax && <td className="p-2 text-right">₹ {data.totals.tax.toFixed(2)}</td>}
            <td className="p-2 text-right">₹ {data.totals.finalTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Tax Breakdown & Totals */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-t border-slate-200 pt-3">
        <div>
          {showTax && appSettings.printTaxDetails !== false && (
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-white font-bold" style={{ backgroundColor: hex }}>
                    <th className="p-1.5">Tax Type</th>
                    <th className="p-1.5 text-right">Taxable</th>
                    <th className="p-1.5 text-right">Tax Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  <tr>
                    <td className="p-1.5">GST Summary</td>
                    <td className="p-1.5 text-right">₹ {(data.totals.finalTotal - data.totals.tax).toFixed(2)}</td>
                    <td className="p-1.5 text-right">₹ {data.totals.tax.toFixed(2)}</td>
                  </tr>
                  {data.totals.cess > 0 && (
                    <tr>
                      <td className="p-1.5">Compensation Cess</td>
                      <td className="p-1.5 text-right">-</td>
                      <td className="p-1.5 text-right">₹ {data.totals.cess.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-1.5 text-right text-xs">
          <div className="flex justify-between font-bold" style={{ color: hex }}>
            <span>Amounts</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Sub Total:</span>
            <span>₹ {(data.totals.finalTotal - (showTax ? data.totals.tax : 0)).toFixed(2)}</span>
          </div>
          {showTax && (
            <div className="flex justify-between text-slate-600">
              <span>Tax:</span>
              <span>₹ {data.totals.tax.toFixed(2)}</span>
            </div>
          )}
          {data.totals.tcsAmount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>TCS (+):</span>
              <span className="font-semibold text-slate-800">₹ {data.totals.tcsAmount.toFixed(2)}</span>
            </div>
          )}
          {data.totals.tdsAmount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>TDS Deductible (-):</span>
              <span className="font-semibold text-rose-600">-₹ {data.totals.tdsAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base text-slate-900 border-t border-slate-200 pt-1">
            <span>Total:</span>
            <span>₹ {data.totals.finalTotal.toFixed(2)}</span>
          </div>
          {appSettings.printReceivedAmount !== false && data.totals.received > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Received:</span>
              <span>₹ {data.totals.received.toFixed(2)}</span>
            </div>
          )}
          {appSettings.printBalanceAmount !== false && (
            <div className="flex justify-between font-bold text-rose-600">
              <span>Balance:</span>
              <span>₹ {data.totals.balance.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Amount in Words */}
      <div className="mt-4 rounded px-3 py-2 text-xs flex items-center justify-between text-white font-medium" style={{ backgroundColor: hex }}>
        <span><strong>Amount in Words:</strong> {numberToWords(data.totals.finalTotal)}</span>
      </div>

      {/* Footer Cards: Bank Details, Terms, Signature (Dynamically adjust grid) */}
      <div className={`mt-4 grid gap-3 border-t border-slate-200 pt-3 text-xs ${
        showBank ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
      }`}>
        {/* Bank details completely omitted if printBankDetails is false */}
        {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}

        {showTerms && (
          <div className="border border-slate-200 rounded p-2.5 bg-white">
            <p className="font-bold text-xs" style={{ color: hex }}>Terms and Conditions</p>
            <p className="mt-1 text-slate-600 text-[11px] leading-tight">
              {data.terms || appSettings.termsAndConditions || "Thanks for doing business with us!"}
            </p>
          </div>
        )}

        {showSign && (
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
        )}
      </div>
    </div>
  );
}

// 2. GST Theme 1 - Classic Bordered Grid Layout
export function GSTTheme1({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const hex = color?.hex || appSettings.themeColor || "#1d4ed8";
  const docTitle = appSettings.compositeScheme ? "BILL OF SUPPLY" : appSettings.transactionNames?.saleInvoice || "Tax Invoice";
  const showBank = appSettings.printBankDetails !== false;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] border-2 border-slate-800 bg-white p-6 text-[12px] shadow-lg print:p-6 print:text-xs">
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
        <div>
          <h1 className="text-2xl font-black tracking-wide" style={{ color: hex }}>{companyName}</h1>
          {appSettings.printAddress !== false && companyAddress && <p className="text-slate-600 mt-0.5">{companyAddress}</p>}
          {appSettings.printPhoneNumber !== false && companyPhone && <p className="text-slate-600">Ph: {companyPhone}</p>}
          {appSettings.printGstinOnSale !== false && companyGstin && <p className="font-bold text-slate-900 mt-0.5">GSTIN: {companyGstin}</p>}
        </div>
        <div className="text-right">
          <span className="inline-block px-3 py-1 text-white font-bold rounded text-xs uppercase" style={{ backgroundColor: hex }}>
            {docTitle}
          </span>
          <p className="mt-1.5 font-bold text-sm text-slate-900"># {data.invoiceNumber}</p>
          <p className="text-slate-500 text-xs">Date: {data.invoiceDateFormatted}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b-2 border-slate-800 py-2.5 px-3 my-2 bg-slate-50 text-xs">
        <div><strong>Bill To:</strong> {data.customer} {data.billingAddress && `, ${data.billingAddress}`}</div>
        <div className="text-right"><strong>Place of Supply:</strong> {data.stateOfSupply}</div>
      </div>

      <table className="w-full border border-slate-800 text-xs mt-3">
        <thead>
          <tr className="text-white font-bold" style={{ backgroundColor: hex }}>
            <th className="p-2 text-center w-10 border-r border-slate-700">#</th>
            <th className="p-2 text-left border-r border-slate-700">Item</th>
            {appSettings.enableHsnSacCode !== false && <th className="p-2 text-center border-r border-slate-700">HSN</th>}
            <th className="p-2 text-center border-r border-slate-700">Qty</th>
            <th className="p-2 text-right border-r border-slate-700">Rate</th>
            <th className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {data.rows.map((row, idx) => (
            <tr key={row.id || idx}>
              <td className="p-2 text-center border-r border-slate-200">{idx + 1}</td>
              <td className="p-2 font-semibold border-r border-slate-200">{row.item}</td>
              {appSettings.enableHsnSacCode !== false && <td className="p-2 text-center border-r border-slate-200">{row.hsn || "-"}</td>}
              <td className="p-2 text-center border-r border-slate-200">{row.qty} {row.unit}</td>
              <td className="p-2 text-right border-r border-slate-200">₹{row.price.toFixed(2)}</td>
              <td className="p-2 text-right font-bold">₹{row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-800 font-bold bg-slate-100">
            <td colSpan={appSettings.enableHsnSacCode !== false ? 3 : 2} className="p-2">Grand Total</td>
            <td className="p-2 text-center">{data.totals.qty}</td>
            <td></td>
            <td className="p-2 text-right text-sm" style={{ color: hex }}>₹{data.totals.finalTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-3 text-xs text-slate-600 font-medium">
        <strong>In Words:</strong> {numberToWords(data.totals.finalTotal)}
      </div>

      <div className={`mt-4 grid gap-3 border-t border-slate-200 pt-3 ${showBank ? "grid-cols-2" : "grid-cols-1"}`}>
        {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}
        <div className="flex justify-end">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
        </div>
      </div>
    </div>
  );
}

// 3. GST Theme 2 - Modern Split Header Layout
export function GSTTheme2({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const hex = color?.hex || appSettings.themeColor || "#0284c7";
  const docTitle = appSettings.compositeScheme ? "Bill of Supply" : appSettings.transactionNames?.saleInvoice || "Tax Invoice";
  const showBank = appSettings.printBankDetails !== false;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-7 text-[12px] shadow-xl">
      <div className="flex justify-between items-center rounded-xl p-4 text-white" style={{ backgroundColor: hex }}>
        <div>
          <h1 className="text-xl font-extrabold uppercase">{companyName}</h1>
          <p className="text-xs opacity-90">{companyAddress}</p>
          <p className="text-xs opacity-90">Ph: {companyPhone} | GSTIN: {companyGstin}</p>
        </div>
        <div className="text-right">
          <span className="bg-white/20 px-3 py-1 rounded text-xs font-bold uppercase">{docTitle}</span>
          <div className="text-lg font-bold mt-1">#{data.invoiceNumber}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 my-4">
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
          <p className="text-[11px] font-bold text-slate-400 uppercase">Invoiced To</p>
          <p className="font-bold text-slate-900 mt-1">{data.customer}</p>
          <p className="text-slate-600 text-xs">{data.billingAddress}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-right">
          <p className="text-[11px] font-bold text-slate-400 uppercase">Date &amp; Details</p>
          <p className="text-slate-800 font-semibold mt-1">Date: {data.invoiceDateFormatted}</p>
          <p className="text-slate-600 text-xs">Place of Supply: {data.stateOfSupply}</p>
        </div>
      </div>

      <table className="w-full text-xs rounded-xl overflow-hidden border border-slate-200">
        <thead>
          <tr className="bg-slate-100 text-slate-800 font-bold">
            <th className="p-2.5 text-left">Item</th>
            {appSettings.enableHsnSacCode !== false && <th className="p-2.5 text-center">HSN</th>}
            <th className="p-2.5 text-center">Qty</th>
            <th className="p-2.5 text-right">Price</th>
            <th className="p-2.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.map((row, idx) => (
            <tr key={row.id || idx} className="hover:bg-slate-50">
              <td className="p-2.5 font-semibold text-slate-900">{row.item}</td>
              {appSettings.enableHsnSacCode !== false && <td className="p-2.5 text-center text-slate-500">{row.hsn || "-"}</td>}
              <td className="p-2.5 text-center">{row.qty} {row.unit}</td>
              <td className="p-2.5 text-right">₹{row.price.toFixed(2)}</td>
              <td className="p-2.5 text-right font-bold">₹{row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 bg-slate-50 rounded-xl p-3 border border-slate-200 text-right space-y-1">
          <div className="flex justify-between text-slate-600"><span>Sub Total:</span><span>₹{data.totals.finalTotal.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200" style={{ color: hex }}>
            <span>Total:</span>
            <span>₹{data.totals.finalTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className={`mt-5 grid gap-3 pt-3 border-t border-slate-200 ${showBank ? "grid-cols-2" : "grid-cols-1"}`}>
        {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}
        <div className="flex justify-end">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
        </div>
      </div>
    </div>
  );
}

// 4. GST Theme 3 - Elegant Double-Framed Theme
export function GSTTheme3({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const hex = color?.hex || appSettings.themeColor || "#0f766e";
  const docTitle = appSettings.compositeScheme ? "BILL OF SUPPLY" : appSettings.transactionNames?.saleInvoice || "Tax Invoice";
  const showBank = appSettings.printBankDetails !== false;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] rounded border-4 border-double border-slate-800 bg-white p-7 text-[12px] shadow-lg font-serif">
      <div className="text-center pb-3 border-b-2 border-slate-300">
        <h1 className="text-2xl font-bold uppercase tracking-wider" style={{ color: hex }}>{companyName}</h1>
        <p className="text-xs italic text-slate-600">{companyAddress} | Ph: {companyPhone}</p>
        <span className="inline-block mt-2 border-t border-b border-slate-400 px-4 py-0.5 text-xs font-sans font-bold uppercase tracking-widest text-slate-800">
          {docTitle}
        </span>
      </div>

      <div className="flex justify-between py-3 border-b border-slate-200 font-sans text-xs">
        <div><strong>Bill To:</strong> {data.customer}</div>
        <div className="text-right"><strong>Invoice:</strong> #{data.invoiceNumber} | <strong>Date:</strong> {data.invoiceDateFormatted}</div>
      </div>

      <table className="w-full text-left font-sans text-xs mt-3 border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-800 font-bold">
            <th className="py-2">Description</th>
            {appSettings.enableHsnSacCode !== false && <th className="py-2 text-center">HSN</th>}
            <th className="py-2 text-center">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.map((row, idx) => (
            <tr key={row.id || idx}>
              <td className="py-2 font-medium">{row.item}</td>
              {appSettings.enableHsnSacCode !== false && <td className="py-2 text-center text-slate-500">{row.hsn || "-"}</td>}
              <td className="py-2 text-center">{row.qty} {row.unit}</td>
              <td className="py-2 text-right">₹{row.price.toFixed(2)}</td>
              <td className="py-2 text-right font-bold">₹{row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 border-t-2 border-double border-slate-800 pt-2 text-right font-sans font-bold text-base" style={{ color: hex }}>
        Total Amount: ₹{data.totals.finalTotal.toFixed(2)}
      </div>

      <div className={`mt-5 grid gap-3 pt-3 border-t border-slate-200 font-sans ${showBank ? "grid-cols-2" : "grid-cols-1"}`}>
        {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}
        <div className="flex justify-end">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
        </div>
      </div>
    </div>
  );
}

// 5. GST Theme 4 - Corporate Minimalist Theme
export function GSTTheme4({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const hex = color?.hex || appSettings.themeColor || "#334155";
  const docTitle = appSettings.compositeScheme ? "Bill of Supply" : "Invoice";
  const showBank = appSettings.printBankDetails !== false;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] rounded bg-white p-8 text-[12px] shadow-lg border-t-8" style={{ borderColor: hex }}>
      <div className="flex justify-between items-start pb-5 border-b border-slate-200">
        <div>
          <span className="text-xs font-bold tracking-widest uppercase text-slate-400">{docTitle}</span>
          <h1 className="text-2xl font-black text-slate-900 mt-0.5">{companyName}</h1>
          <p className="text-xs text-slate-500 mt-1">{companyAddress} | Phone: {companyPhone}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-slate-900">#{data.invoiceNumber}</p>
          <p className="text-xs text-slate-500">Date: {data.invoiceDateFormatted}</p>
        </div>
      </div>

      <div className="py-4 text-xs border-b border-slate-200">
        <span className="text-slate-400 font-bold uppercase text-[10px]">Billed To</span>
        <p className="font-bold text-slate-800 text-sm mt-0.5">{data.customer}</p>
        <p className="text-slate-500">{data.billingAddress}</p>
      </div>

      <table className="w-full text-xs mt-4">
        <thead>
          <tr className="text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200 text-left">
            <th className="pb-2">Item</th>
            {appSettings.enableHsnSacCode !== false && <th className="pb-2 text-center">HSN</th>}
            <th className="pb-2 text-center">Qty</th>
            <th className="pb-2 text-right">Price</th>
            <th className="pb-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.map((row, idx) => (
            <tr key={row.id || idx}>
              <td className="py-2.5 font-medium text-slate-800">{row.item}</td>
              {appSettings.enableHsnSacCode !== false && <td className="py-2.5 text-center text-slate-500">{row.hsn || "-"}</td>}
              <td className="py-2.5 text-center">{row.qty} {row.unit}</td>
              <td className="py-2.5 text-right">₹{row.price.toFixed(2)}</td>
              <td className="py-2.5 text-right font-bold text-slate-900">₹{row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-5 flex justify-end">
        <div className="w-56 text-right space-y-1">
          <div className="flex justify-between text-slate-500"><span>Subtotal:</span><span>₹{data.totals.finalTotal.toFixed(2)}</span></div>
          <div className="flex justify-between font-black text-lg text-slate-900 pt-2 border-t border-slate-200">
            <span>Total:</span>
            <span style={{ color: hex }}>₹{data.totals.finalTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className={`mt-6 grid gap-3 pt-4 border-t border-slate-200 ${showBank ? "grid-cols-2" : "grid-cols-1"}`}>
        {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}
        <div className="flex justify-end">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
        </div>
      </div>
    </div>
  );
}

// 6. GST Theme 6 - Premium Bold Header Accent
export function GSTTheme6({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const hex = color?.hex || appSettings.themeColor || "#7e22ce";
  const docTitle = appSettings.compositeScheme ? "Bill of Supply" : appSettings.transactionNames?.saleInvoice || "Tax Invoice";
  const showBank = appSettings.printBankDetails !== false;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden text-[12px]">
      <div className="p-6 text-white" style={{ backgroundColor: hex }}>
        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs uppercase tracking-widest font-bold opacity-80">{docTitle}</span>
            <h1 className="text-2xl font-black mt-1">{companyName}</h1>
            <p className="text-xs opacity-90 mt-1">{companyAddress} | Ph: {companyPhone}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black">#{data.invoiceNumber}</p>
            <p className="text-xs opacity-80">{data.invoiceDateFormatted}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-4 grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-400">Bill To</span>
            <p className="font-bold text-slate-900 mt-0.5">{data.customer}</p>
            <p className="text-slate-500">{data.billingAddress}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-right">
            <span className="text-[10px] font-bold uppercase text-slate-400">Delivery Details</span>
            <p className="text-slate-700 mt-0.5">State: {data.stateOfSupply}</p>
          </div>
        </div>

        <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
          <thead>
            <tr className="text-white font-bold text-left" style={{ backgroundColor: hex }}>
              <th className="p-2.5">Item</th>
              {appSettings.enableHsnSacCode !== false && <th className="p-2.5 text-center">HSN</th>}
              <th className="p-2.5 text-center">Qty</th>
              <th className="p-2.5 text-right">Rate</th>
              <th className="p-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((row, idx) => (
              <tr key={row.id || idx}>
                <td className="p-2.5 font-semibold text-slate-900">{row.item}</td>
                {appSettings.enableHsnSacCode !== false && <td className="p-2.5 text-center text-slate-500">{row.hsn || "-"}</td>}
                <td className="p-2.5 text-center">{row.qty} {row.unit}</td>
                <td className="p-2.5 text-right">₹{row.price.toFixed(2)}</td>
                <td className="p-2.5 text-right font-bold text-slate-900">₹{row.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 bg-slate-50 rounded-xl p-3 border border-slate-200 text-right space-y-1">
            <div className="flex justify-between font-bold text-base" style={{ color: hex }}>
              <span>Grand Total:</span>
              <span>₹{data.totals.finalTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className={`mt-5 grid gap-3 pt-3 border-t border-slate-200 ${showBank ? "grid-cols-2" : "grid-cols-1"}`}>
          {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}
          <div className="flex justify-end">
            <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
          </div>
        </div>
      </div>
    </div>
  );
}

// 7. Bill of Supply (Non-GST / Composition Scheme)
export function BillOfSupplyTheme({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const showBank = appSettings.printBankDetails !== false;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] rounded border-2 border-slate-500 bg-white p-7 text-[12px] shadow-lg">
      <div className="text-center border-b-2 border-slate-800 pb-3">
        <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">BILL OF SUPPLY</h2>
        <p className="text-[11px] text-amber-900 font-bold mt-0.5">
          Composition taxable person, not eligible to collect tax on supplies
        </p>
        <p className="text-[10px] text-slate-500">(Issued under Section 31(3)(c) of CGST Act, 2017)</p>
        <h1 className="text-xl font-bold text-slate-900 mt-2">{companyName}</h1>
        {companyAddress && <p className="text-slate-600 text-xs">{companyAddress}</p>}
        {companyPhone && <p className="text-slate-600 text-xs">Ph: {companyPhone}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 py-3 border-b border-slate-300 text-xs">
        <div>
          <p className="font-bold text-slate-900">Buyer:</p>
          <p className="font-semibold text-slate-800">{data.customer}</p>
          <p className="text-slate-600">{data.billingAddress}</p>
        </div>
        <div className="text-right">
          <p>Bill No: <strong>{data.invoiceNumber}</strong></p>
          <p>Date: {data.invoiceDateFormatted}</p>
        </div>
      </div>

      <table className="w-full text-left text-xs mt-3 border-collapse">
        <thead>
          <tr className="bg-slate-800 text-white font-bold">
            <th className="p-2 text-center w-10">#</th>
            <th className="p-2">Description</th>
            {appSettings.enableHsnSacCode !== false && <th className="p-2 text-center">HSN</th>}
            <th className="p-2 text-center">Qty</th>
            <th className="p-2 text-right">Rate</th>
            <th className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {data.rows.map((row, idx) => (
            <tr key={row.id || idx}>
              <td className="p-2 text-center">{idx + 1}</td>
              <td className="p-2 font-medium">{row.item}</td>
              {appSettings.enableHsnSacCode !== false && <td className="p-2 text-center text-slate-500">{row.hsn || "-"}</td>}
              <td className="p-2 text-center">{row.qty} {row.unit}</td>
              <td className="p-2 text-right">₹{row.price.toFixed(2)}</td>
              <td className="p-2 text-right font-bold">₹{row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-800 font-bold bg-slate-100">
            <td colSpan={appSettings.enableHsnSacCode !== false ? 3 : 2} className="p-2">Total</td>
            <td className="p-2 text-center">{data.totals.qty}</td>
            <td></td>
            <td className="p-2 text-right text-sm">₹{data.totals.finalTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className={`mt-5 grid gap-3 pt-3 border-t border-slate-200 ${showBank ? "grid-cols-2" : "grid-cols-1"}`}>
        {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}
        <div className="flex justify-end">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
        </div>
      </div>
    </div>
  );
}

// 8. Classic Simple - Monochrome Ledger
export function ClassicSimpleTheme({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color, appSettings = {} }) {
  const showBank = appSettings.printBankDetails !== false;

  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] bg-white p-8 text-[12px] shadow-lg font-mono">
      <div className="text-center pb-3 border-b-2 border-black">
        <h1 className="text-xl font-bold uppercase">{companyName}</h1>
        <p className="text-xs text-slate-700">{companyAddress} | Ph: {companyPhone}</p>
        <p className="text-xs font-bold mt-1 uppercase">INVOICE #{data.invoiceNumber} | {data.invoiceDateFormatted}</p>
      </div>

      <div className="py-2 border-b border-black text-xs">
        <p>TO: {data.customer}</p>
      </div>

      <table className="w-full text-xs border-collapse mt-2">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1">ITEM</th>
            <th className="py-1 text-center">QTY</th>
            <th className="py-1 text-right">RATE</th>
            <th className="py-1 text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {data.rows.map((row, idx) => (
            <tr key={row.id || idx}>
              <td className="py-1.5">{row.item}</td>
              <td className="py-1.5 text-center">{row.qty}</td>
              <td className="py-1.5 text-right">{row.price.toFixed(2)}</td>
              <td className="py-1.5 text-right font-bold">{row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td colSpan="2" className="py-1.5">TOTAL</td>
            <td></td>
            <td className="py-1.5 text-right text-sm">₹{data.totals.finalTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className={`mt-5 grid gap-3 pt-3 border-t border-black font-sans ${showBank ? "grid-cols-2" : "grid-cols-1"}`}>
        {showBank && <BankDetailsBlock color={color} appSettings={appSettings} />}
        <div className="flex justify-end">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} appSettings={appSettings} />
        </div>
      </div>
    </div>
  );
}

// Complete theme mapping for all 8 standard themes + legacy fallbacks
const themeComponents = {
  "GST Theme 1": GSTTheme1,
  "GST Theme 2": GSTTheme2,
  "GST Theme 3": GSTTheme3,
  "GST Theme 4": GSTTheme4,
  "GST Theme 5": GSTTheme5,
  "GST Theme 6": GSTTheme6,
  "Bill of Supply": BillOfSupplyTheme,
  "Classic Simple": ClassicSimpleTheme,
  // Legacy aliases
  "Classic Themes": ClassicSimpleTheme,
  "Tally Theme": GSTTheme1,
  "Double Divine": GSTTheme3,
  "French Elite": GSTTheme6,
};

// ─────────────────── MAIN COMPONENT ───────────────────

function SalePreview() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const rawInvoice = state?.invoice || readStoredInvoice();
  const [savedBusiness, setSavedBusiness] = useState(null);

  // App settings state linked directly to storage
  const [appSettings, setAppSettings] = useState(getAppSettings);
  const [selectedTheme, setSelectedTheme] = useState(() => appSettings.selectedTheme || "GST Theme 5");
  const [selectedColorIndex, setSelectedColorIndex] = useState(() => {
    const idx = colorOptions.findIndex((c) => c.hex.toLowerCase() === (appSettings.themeColor || "").toLowerCase());
    return idx !== -1 ? idx : 0;
  });

  // Listen for settings changes across tabs / settings page
  useEffect(() => {
    const handleSettingsUpdated = (e) => {
      const updated = e.detail || getAppSettings();
      setAppSettings(updated);
      if (updated.selectedTheme) setSelectedTheme(updated.selectedTheme);
      if (updated.themeColor) {
        const idx = colorOptions.findIndex((c) => c.hex.toLowerCase() === updated.themeColor.toLowerCase());
        if (idx !== -1) setSelectedColorIndex(idx);
      }
    };
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
  }, []);

  const handleThemeChange = (themeName) => {
    setSelectedTheme(themeName);
    saveAppSettings({ selectedTheme: themeName });
  };

  const handleColorChange = (idx) => {
    setSelectedColorIndex(idx);
    saveAppSettings({ themeColor: colorOptions[idx].hex });
  };

  useEffect(() => {
    let active = true;
    businessGrowthApi.list("online-store")
      .then((rows) => { if (active && rows[0]) setSavedBusiness(normalizePersistedAssetUrls(rows[0])); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (state?.printAfterOpen) window.setTimeout(() => window.print(), 250);
  }, [state?.printAfterOpen]);

  const normalized = useMemo(() => normalizeInvoiceData(rawInvoice), [rawInvoice]);

  if (!normalized) {
    return (
      <div className="grid min-h-[80vh] place-items-center bg-slate-100 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm max-w-md w-full">
          <h1 className="text-xl font-bold text-slate-900">No invoice preview available</h1>
          <p className="mt-2 text-sm text-slate-500">Please select an invoice or create a new sale to preview.</p>
          <Button onClick={() => navigate("/sales/sale-invoices/new")} className="mt-5 w-full justify-center rounded-md bg-blue-600 py-2.5 text-white">
            Create Sale
          </Button>
        </div>
      </div>
    );
  }

  // Company info from profile with fallback protection
  const profile = getCompanyProfile();
  const companyName = getEffectiveCompanyName(profile, savedBusiness, normalized.business);
  const companyLogo = savedBusiness?.logoUrl || profile.logo || normalized.business?.logoUrl || "";
  const companyPhone = savedBusiness?.contactNumber || profile.phoneNumber || normalized.business?.phone || normalized.phone;
  const companyGstin = savedBusiness?.gstin || profile.gstin || normalized.business?.gstin;
  const companyAddress = savedBusiness?.address || profile.businessAddress || normalized.business?.address;
  const companySignature = profile.signature || savedBusiness?.signatureUrl || "";

  const currentColor = colorOptions[selectedColorIndex];
  const ThemeComponent = themeComponents[selectedTheme] || GSTTheme5;

  return (
    <div className="min-h-full bg-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 print:hidden">
        <h1 className="text-xl font-bold text-slate-900">Preview</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-5 w-5 accent-blue-600" />
            Do not show invoice preview again
          </label>
          <button type="button" onClick={() => navigate("/sales/sale-invoices")} className="text-sm font-bold text-blue-600 hover:underline">
            Save &amp; Close
          </button>
          <button type="button" onClick={() => navigate("/sales/sale-invoices/new")} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <FiX className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_240px] print:block print:p-0">
        {/* Theme & Color Selector */}
        <aside className="rounded-lg border border-slate-200 bg-white p-3 print:hidden">
          <h2 className="mb-3 text-[13px] font-bold text-slate-700">Select Theme</h2>
          {themeList.map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => handleThemeChange(theme)}
              className={`block w-full rounded-md px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                selectedTheme === theme ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {theme}
            </button>
          ))}
          <h2 className="mb-3 mt-5 text-[13px] font-bold text-slate-700">Select Color</h2>
          <div className="grid grid-cols-4 gap-2.5">
            {colorOptions.map((color, idx) => (
              <button
                key={color.name}
                type="button"
                onClick={() => handleColorChange(idx)}
                className={`h-8 rounded-md ${color.bg} transition-all ${
                  selectedColorIndex === idx ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "hover:scale-105"
                }`}
                title={color.name}
              />
            ))}
          </div>
        </aside>

        {/* Invoice Preview */}
        <section className="min-w-0 print:block">
          <ThemeComponent
            companyName={appSettings.printCompanyName !== false ? (appSettings.companyNamePrint || companyName) : ""}
            companyPhone={appSettings.printPhoneNumber !== false ? (appSettings.phoneNumberPrint || companyPhone) : ""}
            companyGstin={appSettings.printGstinOnSale !== false ? companyGstin : ""}
            companyAddress={appSettings.printAddress !== false ? (appSettings.addressPrint || companyAddress) : ""}
            companyLogo={appSettings.printCompanyLogo !== false ? companyLogo : ""}
            companySignature={companySignature}
            data={normalized}
            color={currentColor}
            appSettings={appSettings}
          />
        </section>

        {/* Right Sidebar - Share & Actions */}
        <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2 xl:col-span-1 print:hidden">
          <div className="rounded-lg bg-blue-50 p-4 text-center">
            <p className="font-bold text-slate-800">Accept Online Payments</p>
            <Button className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-[13px] text-white">Start Now</Button>
          </div>
          <div>
            <h2 className="mb-3 font-bold text-slate-900">Share Invoice</h2>
            <div className="grid grid-cols-3 gap-2 text-center text-[13px]">
              <button type="button" className="rounded-md p-2 hover:bg-slate-50"><FiMessageCircle className="mx-auto mb-2 h-5 w-5 text-green-500" />Whatsapp</button>
              <button type="button" className="rounded-md p-2 hover:bg-slate-50"><FiMail className="mx-auto mb-2 h-5 w-5 text-red-500" />Gmail</button>
              <button type="button" className="rounded-md p-2 hover:bg-slate-50"><FiShare2 className="mx-auto mb-2 h-5 w-5 text-blue-500" />Message</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center text-[13px]">
            <button type="button" onClick={() => window.print()} className="rounded-md p-2 hover:bg-slate-50"><FiDownload className="mx-auto mb-2 h-5 w-5 text-blue-600" />Download PDF</button>
            <button type="button" onClick={() => window.print()} className="rounded-md p-2 hover:bg-slate-50"><FiPrinter className="mx-auto mb-2 h-5 w-5 text-blue-600" />Print Thermal</button>
            <button type="button" onClick={() => window.print()} className="rounded-md bg-blue-600 p-2 text-white"><FiPrinter className="mx-auto mb-2 h-5 w-5" />Print Normal</button>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default SalePreview;
