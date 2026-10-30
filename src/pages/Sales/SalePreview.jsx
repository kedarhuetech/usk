// Implements the sale preview page with multiple themes and color selection.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiDownload, FiMail, FiMessageCircle, FiPrinter, FiShare2, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import { getCompanyProfile } from "../../services/companyProfileStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import { businessGrowthApi } from "../../services/apiClient.js";
import { normalizePersistedAssetUrls } from "../../services/businessGrowthData.js";

// Color palette for accent colors.
const colorOptions = [
  { name: "Indigo", bg: "bg-indigo-600", text: "text-indigo-600", border: "border-indigo-600", hex: "#4f46e5", bgLight: "bg-indigo-50", textLight: "text-indigo-700", borderLight: "border-indigo-200" },
  { name: "Sky", bg: "bg-sky-600", text: "text-sky-600", border: "border-sky-600", hex: "#0284c7", bgLight: "bg-sky-50", textLight: "text-sky-700", borderLight: "border-sky-200" },
  { name: "Slate", bg: "bg-slate-600", text: "text-slate-600", border: "border-slate-600", hex: "#475569", bgLight: "bg-slate-50", textLight: "text-slate-700", borderLight: "border-slate-200" },
  { name: "Zinc", bg: "bg-zinc-700", text: "text-zinc-700", border: "border-zinc-700", hex: "#3f3f46", bgLight: "bg-zinc-50", textLight: "text-zinc-700", borderLight: "border-zinc-200" },
  { name: "Emerald", bg: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-600", hex: "#059669", bgLight: "bg-emerald-50", textLight: "text-emerald-700", borderLight: "border-emerald-200" },
  { name: "Orange", bg: "bg-orange-600", text: "text-orange-600", border: "border-orange-600", hex: "#ea580c", bgLight: "bg-orange-50", textLight: "text-orange-700", borderLight: "border-orange-200" },
  { name: "Rose", bg: "bg-rose-600", text: "text-rose-600", border: "border-rose-600", hex: "#e11d48", bgLight: "bg-rose-50", textLight: "text-rose-700", borderLight: "border-rose-200" },
  { name: "Purple", bg: "bg-purple-600", text: "text-purple-600", border: "border-purple-600", hex: "#9333ea", bgLight: "bg-purple-50", textLight: "text-purple-700", borderLight: "border-purple-200" },
];

const themeList = ["Classic Themes", "Tally Theme", "GST Theme 1", "GST Theme 3", "Double Divine", "French Elite"];

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
function numberToWords(num) {
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

  // Rows normalization
  const rawRows = Array.isArray(raw.rows) && raw.rows.length ? raw.rows : Array.isArray(raw.items) ? raw.items : [];
  const rows = rawRows
    .filter((r) => r && (r.item || r.itemName || r.name || r.qty || r.price))
    .map((r, idx) => {
      const item = r.item || r.itemName || r.name || `Item ${idx + 1}`;
      const qty = Number(r.calculated?.qty ?? r.qty ?? r.quantity ?? 1);
      const unit = r.unit || "PCS";
      const price = Number(r.price ?? r.rate ?? r.salePrice ?? 0);
      const discount = Number(r.calculated?.discount ?? r.discountAmount ?? r.discount ?? 0);
      const tax = Number(r.calculated?.tax ?? r.taxAmount ?? r.tax ?? 0);
      const amount = Number(r.calculated?.amount ?? r.amount ?? r.total ?? (qty * price - discount + tax));

      return {
        id: r.id || `row-${idx}`,
        item,
        qty,
        unit,
        price,
        discount,
        tax,
        amount,
      };
    });

  // Totals normalization
  const rawTotals = raw.totals || {};
  const totalQty = Number(rawTotals.qty ?? rows.reduce((s, r) => s + r.qty, 0));
  const totalDiscount = Number(rawTotals.discount ?? rows.reduce((s, r) => s + r.discount, 0));
  const totalTax = Number(rawTotals.tax ?? rows.reduce((s, r) => s + r.tax, 0));
  const finalTotal = Number(rawTotals.finalTotal ?? rawTotals.amount ?? raw.total ?? raw.amount ?? rows.reduce((s, r) => s + r.amount, 0));

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
    rows: rows.length > 0 ? rows : [{ id: "empty", item: "Sample Item", qty: 1, unit: "PCS", price: finalTotal || 0, discount: 0, tax: 0, amount: finalTotal || 0 }],
    totals: {
      qty: totalQty || 1,
      discount: totalDiscount,
      tax: totalTax,
      finalTotal: Math.max(0, finalTotal),
    },
    business,
  };
}

// ─────────────────── SIGNATURE BLOCK ───────────────────

function SignatureBlock({ companyName, signature, color }) {
  return (
    <div className="inline-block min-w-[170px] text-center">
      <p className="text-xs font-semibold text-slate-800">For, {companyName}</p>
      <div className="my-1.5 flex h-14 items-center justify-center">
        {signature ? (
          <img src={signature} alt="Authorized Signature" className="max-h-12 max-w-[140px] object-contain" />
        ) : (
          <div className="mt-9 w-36 border-b border-dashed border-slate-400" />
        )}
      </div>
      <p className="text-[11px] font-medium text-slate-500">Authorized Signatory</p>
    </div>
  );
}

// ─────────────────── THEME RENDERERS ───────────────────

// Classic Theme - Clean minimal black/white design.
function ClassicTheme({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color }) {
  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] bg-white p-8 text-[13px] shadow-lg print:min-h-0 print:max-w-none print:p-7 print:text-sm print:shadow-none">
      <div className="flex justify-between gap-4 pb-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 print:text-3xl">{companyName}</h2>
          {companyPhone && <p className="mt-1 text-slate-600">Phone: {companyPhone}</p>}
          {companyGstin && <p className="text-slate-600">GSTIN: {companyGstin}</p>}
          {companyAddress && <p className="text-slate-600">{companyAddress}</p>}
        </div>
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 text-xs font-bold text-slate-400 print:h-20 print:w-20">
          {companyLogo ? <img src={companyLogo} alt="" className="h-full w-full object-contain" /> : "LOGO"}
        </div>
      </div>
      <div className="h-px bg-slate-900" />

      <h3 className="my-5 text-center text-lg font-bold uppercase tracking-widest text-slate-800 print:text-xl">Tax Invoice</h3>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Bill To</p>
          <p className="font-semibold text-slate-900">{data.customer}</p>
          {data.billingAddress && <p className="text-slate-600">{data.billingAddress}</p>}
          {data.phone && <p className="text-slate-600">Ph: {data.phone}</p>}
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Ship To</p>
          <p className="text-slate-600">{data.shippingAddress || data.billingAddress}</p>
        </div>
        <div className="text-left md:text-right">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Invoice Details</p>
          <p className="text-slate-700">Invoice No.: {data.invoiceNumber}</p>
          <p className="text-slate-700">Date: {data.invoiceDateFormatted}</p>
          <p className="text-slate-700">State: {data.stateOfSupply}</p>
        </div>
      </div>

      <table className="mt-6 w-full table-fixed border-collapse text-xs print:mt-7 print:text-sm">
        <thead>
          <tr className="border-y-2 border-slate-900 text-left">
            <th className="w-[5%] px-2 py-2.5">#</th>
            <th className="w-[25%] px-2 py-2.5">Item name</th>
            <th className="w-[11%] px-2 py-2.5 text-right">Quantity</th>
            <th className="w-[10%] px-2 py-2.5">Unit</th>
            <th className="w-[14%] px-2 py-2.5 text-right">Price/Unit</th>
            <th className="w-[13%] px-2 py-2.5 text-right">Discount</th>
            <th className="w-[10%] px-2 py-2.5 text-right">GST</th>
            <th className="w-[12%] px-2 py-2.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={row.id} className="border-b border-slate-100">
              <td className="px-2 py-2.5">{index + 1}</td>
              <td className="break-words px-2 py-2.5 font-medium">{row.item}</td>
              <td className="px-2 py-2.5 text-right">{row.qty}</td>
              <td className="break-words px-2 py-2.5">{row.unit}</td>
              <td className="px-2 py-2.5 text-right">Rs. {row.price.toFixed(2)}</td>
              <td className="px-2 py-2.5 text-right">Rs. {row.discount.toFixed(2)}</td>
              <td className="px-2 py-2.5 text-right">Rs. {row.tax.toFixed(2)}</td>
              <td className="px-2 py-2.5 text-right">Rs. {row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-y-2 border-slate-900 font-bold">
            <td className="px-2 py-2.5" colSpan="2">Total</td>
            <td className="px-2 py-2.5 text-right">{data.totals.qty}</td>
            <td colSpan="2" />
            <td className="px-2 py-2.5 text-right">Rs. {data.totals.discount.toFixed(2)}</td>
            <td className="px-2 py-2.5 text-right">Rs. {data.totals.tax.toFixed(2)}</td>
            <td className="px-2 py-2.5 text-right">Rs. {data.totals.finalTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-xs text-slate-600"><span className="font-semibold">Amount in words:</span> {numberToWords(data.totals.finalTotal)}</p>

      {data.terms && (
        <div className="mt-6 border-t border-slate-200 pt-4 print:mt-8">
          <p className="font-bold text-slate-700">{data.termsTitle}</p>
          <p className="mt-1 text-slate-600">{data.terms}</p>
        </div>
      )}

      <div className="mt-10 flex justify-end print:mt-16">
        <SignatureBlock companyName={companyName} signature={companySignature} color={color} />
      </div>
    </div>
  );
}

// Tally Theme - Traditional bordered layout.
function TallyTheme({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color }) {
  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] border-2 border-slate-800 bg-white text-[13px] shadow-lg print:min-h-0 print:max-w-none print:text-sm print:shadow-none">
      <div className="border-b-2 border-slate-800 p-4 text-center">
        <div className="flex items-center justify-center gap-4">
          {companyLogo && <img src={companyLogo} alt="" className="h-12 w-12 object-contain" />}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{companyName}</h2>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 text-xs text-slate-600">
              {companyPhone && <span>Ph: {companyPhone}</span>}
              {companyGstin && <span>GSTIN: {companyGstin}</span>}
            </div>
            {companyAddress && <p className="mt-0.5 text-xs text-slate-600">{companyAddress}</p>}
          </div>
        </div>
      </div>

      <div className="border-b border-slate-800 py-1.5 text-center">
        <h3 className="text-sm font-bold uppercase tracking-wider">Tax Invoice</h3>
      </div>

      <div className="grid grid-cols-2 border-b border-slate-800 text-xs">
        <div className="border-r border-slate-800 p-3">
          <p><span className="font-semibold">Invoice No.:</span> {data.invoiceNumber}</p>
          <p><span className="font-semibold">Date:</span> {data.invoiceDateFormatted}</p>
        </div>
        <div className="p-3">
          <p><span className="font-semibold">State:</span> {data.stateOfSupply}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-slate-800 text-xs">
        <div className="border-r border-slate-800 p-3">
          <p className="font-bold">Bill To:</p>
          <p className="font-semibold">{data.customer}</p>
          {data.billingAddress && <p>{data.billingAddress}</p>}
          {data.phone && <p>Ph: {data.phone}</p>}
        </div>
        <div className="p-3">
          <p className="font-bold">Ship To:</p>
          <p>{data.shippingAddress || data.billingAddress}</p>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-50 text-left font-bold">
            <th className="w-[5%] border-r border-slate-300 px-2 py-2">#</th>
            <th className="w-[25%] border-r border-slate-300 px-2 py-2">Particulars</th>
            <th className="w-[11%] border-r border-slate-300 px-2 py-2 text-right">Qty</th>
            <th className="w-[10%] border-r border-slate-300 px-2 py-2">Unit</th>
            <th className="w-[14%] border-r border-slate-300 px-2 py-2 text-right">Rate</th>
            <th className="w-[13%] border-r border-slate-300 px-2 py-2 text-right">Disc.</th>
            <th className="w-[10%] border-r border-slate-300 px-2 py-2 text-right">GST</th>
            <th className="w-[12%] px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={row.id} className="border-b border-slate-200">
              <td className="border-r border-slate-200 px-2 py-2">{index + 1}</td>
              <td className="break-words border-r border-slate-200 px-2 py-2">{row.item}</td>
              <td className="border-r border-slate-200 px-2 py-2 text-right">{row.qty}</td>
              <td className="break-words border-r border-slate-200 px-2 py-2">{row.unit}</td>
              <td className="border-r border-slate-200 px-2 py-2 text-right">Rs. {row.price.toFixed(2)}</td>
              <td className="border-r border-slate-200 px-2 py-2 text-right">Rs. {row.discount.toFixed(2)}</td>
              <td className="border-r border-slate-200 px-2 py-2 text-right">Rs. {row.tax.toFixed(2)}</td>
              <td className="px-2 py-2 text-right">Rs. {row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-800 font-bold">
            <td className="border-r border-slate-300 px-2 py-2.5" colSpan="2">Total</td>
            <td className="border-r border-slate-300 px-2 py-2.5 text-right">{data.totals.qty}</td>
            <td className="border-r border-slate-300" colSpan="2" />
            <td className="border-r border-slate-300 px-2 py-2.5 text-right">Rs. {data.totals.discount.toFixed(2)}</td>
            <td className="border-r border-slate-300 px-2 py-2.5 text-right">Rs. {data.totals.tax.toFixed(2)}</td>
            <td className="px-2 py-2.5 text-right">Rs. {data.totals.finalTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="border-t border-slate-800 px-3 py-2 text-xs">
        <p><span className="font-bold">Amount in words:</span> {numberToWords(data.totals.finalTotal)}</p>
      </div>

      <div className="grid grid-cols-2 border-t border-slate-800">
        <div className="border-r border-slate-800 p-3 text-xs">
          {data.terms && (
            <>
              <p className="font-bold">{data.termsTitle}</p>
              <p className="mt-1 text-slate-600">{data.terms}</p>
            </>
          )}
        </div>
        <div className="flex justify-end p-3">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} />
        </div>
      </div>
    </div>
  );
}

// GST Theme 1 - Colored header table.
function GSTTheme1({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color }) {
  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] bg-white p-5 text-[13px] shadow-lg print:min-h-0 print:max-w-none print:p-7 print:text-sm print:shadow-none">
      <div className={`flex min-w-0 justify-between gap-4 border-b pb-4 ${color.borderLight}`}>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold text-slate-950 print:text-2xl">{companyName}</h2>
          {companyPhone && <p className="mt-1.5">Phone no.: {companyPhone}</p>}
          {companyGstin && <p>GSTIN: {companyGstin}</p>}
          {companyAddress && <p className="break-words">{companyAddress}</p>}
        </div>
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden bg-slate-400 text-xs font-bold text-white print:h-20 print:w-20 print:text-sm">
          {companyLogo ? <img src={companyLogo} alt="" className="h-full w-full object-contain" /> : "LOGO"}
        </div>
      </div>

      <h3 className={`my-4 text-center text-xl font-bold print:my-5 print:text-2xl ${color.text}`}>Tax Invoice</h3>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <div className="min-w-0">
          <p className="mb-2 font-bold">Bill To</p>
          <p className="font-semibold">{data.customer}</p>
          {data.billingAddress && <p className="break-words">{data.billingAddress}</p>}
          {data.phone && <p>Contact No.: {data.phone}</p>}
        </div>
        <div className="min-w-0">
          <p className="mb-2 font-bold">Ship To</p>
          <p className="break-words">{data.shippingAddress || data.billingAddress}</p>
        </div>
        <div className="min-w-0 text-left md:text-right">
          <p className="mb-2 font-bold">Invoice Details</p>
          <p>Invoice No.: {data.invoiceNumber}</p>
          <p>Date: {data.invoiceDateFormatted}</p>
          <p>State of Supply: {data.stateOfSupply}</p>
        </div>
      </div>

      <table className="mt-6 w-full table-fixed border-collapse text-xs print:mt-7 print:text-sm">
        <thead>
          <tr className={`text-left text-white ${color.bg}`}>
            <th className="w-[5%] px-1.5 py-2">#</th>
            <th className="w-[25%] px-1.5 py-2">Item name</th>
            <th className="w-[11%] px-1.5 py-2 text-right">Quantity</th>
            <th className="w-[10%] px-1.5 py-2">Unit</th>
            <th className="w-[14%] px-1.5 py-2 text-right">Price/Unit</th>
            <th className="w-[13%] px-1.5 py-2 text-right">Discount</th>
            <th className="w-[10%] px-1.5 py-2 text-right">GST</th>
            <th className="w-[12%] px-1.5 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={row.id} className="border-b border-slate-100">
              <td className="px-1.5 py-2.5">{index + 1}</td>
              <td className="break-words px-1.5 py-2.5 font-semibold">{row.item}</td>
              <td className="px-1.5 py-2.5 text-right">{row.qty}</td>
              <td className="break-words px-1.5 py-2.5">{row.unit}</td>
              <td className="px-1.5 py-2.5 text-right">Rs. {row.price.toFixed(2)}</td>
              <td className="px-1.5 py-2.5 text-right">Rs. {row.discount.toFixed(2)}</td>
              <td className="px-1.5 py-2.5 text-right">Rs. {row.tax.toFixed(2)}</td>
              <td className="px-1.5 py-2.5 text-right">Rs. {row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-400 font-bold">
            <td className="px-1.5 py-2.5" colSpan="2">Total</td>
            <td className="px-1.5 py-2.5 text-right">{data.totals.qty}</td>
            <td colSpan="2" />
            <td className="px-1.5 py-2.5 text-right">Rs. {data.totals.discount.toFixed(2)}</td>
            <td className="px-1.5 py-2.5 text-right">Rs. {data.totals.tax.toFixed(2)}</td>
            <td className="px-1.5 py-2.5 text-right">Rs. {data.totals.finalTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-xs text-slate-600"><span className="font-semibold">Amount in words:</span> {numberToWords(data.totals.finalTotal)}</p>

      {data.terms && (
        <div className="mt-6 rounded-md border border-slate-200 p-3 print:mt-8 print:p-4">
          <p className="font-bold">{data.termsTitle}</p>
          <p className="mt-2 text-slate-600">{data.terms}</p>
        </div>
      )}

      <div className="mt-8 flex justify-end print:mt-14">
        <SignatureBlock companyName={companyName} signature={companySignature} color={color} />
      </div>
    </div>
  );
}

// GST Theme 3 - Striped rows with colored accents.
function GSTTheme3({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color }) {
  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] bg-white text-[13px] shadow-lg print:min-h-0 print:max-w-none print:text-sm print:shadow-none">
      <div className={`h-2 ${color.bg}`} />
      <div className="p-6">
        <div className="flex justify-between gap-4">
          <div>
            <h2 className={`text-2xl font-bold ${color.text}`}>{companyName}</h2>
            <div className="mt-2 text-xs text-slate-600">
              {companyPhone && <p>Phone: {companyPhone}</p>}
              {companyGstin && <p>GSTIN: {companyGstin}</p>}
              {companyAddress && <p>{companyAddress}</p>}
            </div>
          </div>
          <div className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg text-xs font-bold text-white print:h-20 print:w-20 ${color.bg}`}>
            {companyLogo ? <img src={companyLogo} alt="" className="h-full w-full object-contain" /> : "LOGO"}
          </div>
        </div>

        <div className={`my-5 rounded-lg p-3 text-center ${color.bgLight}`}>
          <h3 className={`text-lg font-bold uppercase tracking-wider ${color.textLight}`}>Tax Invoice</h3>
        </div>

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className={`rounded-lg border p-3 ${color.borderLight}`}>
            <p className={`mb-1 text-xs font-bold uppercase ${color.textLight}`}>Bill To</p>
            <p className="font-semibold text-slate-900">{data.customer}</p>
            {data.billingAddress && <p className="text-slate-600">{data.billingAddress}</p>}
            {data.phone && <p className="text-slate-600">Ph: {data.phone}</p>}
          </div>
          <div className={`rounded-lg border p-3 ${color.borderLight}`}>
            <p className={`mb-1 text-xs font-bold uppercase ${color.textLight}`}>Ship To</p>
            <p className="text-slate-600">{data.shippingAddress || data.billingAddress}</p>
          </div>
          <div className={`rounded-lg border p-3 ${color.borderLight}`}>
            <p className={`mb-1 text-xs font-bold uppercase ${color.textLight}`}>Invoice Details</p>
            <p>No.: {data.invoiceNumber}</p>
            <p>Date: {data.invoiceDateFormatted}</p>
            <p>State: {data.stateOfSupply}</p>
          </div>
        </div>

        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className={`text-left text-white ${color.bg}`}>
              <th className="w-[5%] rounded-tl-md px-2 py-2.5">#</th>
              <th className="w-[25%] px-2 py-2.5">Item name</th>
              <th className="w-[11%] px-2 py-2.5 text-right">Qty</th>
              <th className="w-[10%] px-2 py-2.5">Unit</th>
              <th className="w-[14%] px-2 py-2.5 text-right">Price</th>
              <th className="w-[13%] px-2 py-2.5 text-right">Discount</th>
              <th className="w-[10%] px-2 py-2.5 text-right">GST</th>
              <th className="w-[12%] rounded-tr-md px-2 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={row.id} className={index % 2 === 0 ? "bg-white" : color.bgLight}>
                <td className="px-2 py-2.5">{index + 1}</td>
                <td className="break-words px-2 py-2.5 font-medium">{row.item}</td>
                <td className="px-2 py-2.5 text-right">{row.qty}</td>
                <td className="break-words px-2 py-2.5">{row.unit}</td>
                <td className="px-2 py-2.5 text-right">Rs. {row.price.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right">Rs. {row.discount.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right">Rs. {row.tax.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right">Rs. {row.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={`font-bold text-white ${color.bg}`}>
              <td className="rounded-bl-md px-2 py-2.5" colSpan="2">Total</td>
              <td className="px-2 py-2.5 text-right">{data.totals.qty}</td>
              <td colSpan="2" />
              <td className="px-2 py-2.5 text-right">Rs. {data.totals.discount.toFixed(2)}</td>
              <td className="px-2 py-2.5 text-right">Rs. {data.totals.tax.toFixed(2)}</td>
              <td className="rounded-br-md px-2 py-2.5 text-right">Rs. {data.totals.finalTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-4 text-xs text-slate-600"><span className="font-semibold">Amount in words:</span> {numberToWords(data.totals.finalTotal)}</p>

        {data.terms && (
          <div className="mt-5 text-xs">
            <p className="font-bold text-slate-700">{data.termsTitle}</p>
            <p className="mt-1 text-slate-600">{data.terms}</p>
          </div>
        )}

        <div className="mt-8 flex justify-end print:mt-14">
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} />
        </div>
      </div>
      <div className={`h-2 ${color.bg}`} />
    </div>
  );
}

// Double Divine - Split header with elegant dividers.
function DoubleDivineTheme({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color }) {
  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] bg-white text-[13px] shadow-lg print:min-h-0 print:max-w-none print:text-sm print:shadow-none">
      <div className={`h-1.5 ${color.bg}`} />
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 pb-4">
          <div className="flex items-center gap-4">
            <div className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-bold text-white ${color.bg}`}>
              {companyLogo ? <img src={companyLogo} alt="" className="h-full w-full object-contain" /> : companyName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{companyName}</h2>
              <p className="text-xs text-slate-500">{companyAddress}</p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-600">
            {companyPhone && <p>Ph: {companyPhone}</p>}
            {companyGstin && <p>GSTIN: {companyGstin}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 py-3">
          <div className={`h-px flex-1 ${color.bg} opacity-30`} />
          <h3 className={`text-sm font-bold uppercase tracking-[0.2em] ${color.text}`}>Tax Invoice</h3>
          <div className={`h-px flex-1 ${color.bg} opacity-30`} />
        </div>

        <div className="my-4 grid grid-cols-3 gap-4 text-xs">
          <div>
            <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${color.text}`}>Bill To</p>
            <p className="font-semibold">{data.customer}</p>
            {data.billingAddress && <p className="text-slate-600">{data.billingAddress}</p>}
            {data.phone && <p className="text-slate-500">Ph: {data.phone}</p>}
          </div>
          <div>
            <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${color.text}`}>Ship To</p>
            <p className="text-slate-600">{data.shippingAddress || data.billingAddress}</p>
          </div>
          <div className="text-right">
            <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${color.text}`}>Invoice Info</p>
            <p>#{data.invoiceNumber}</p>
            <p>{data.invoiceDateFormatted}</p>
            <p className="text-slate-500">{data.stateOfSupply}</p>
          </div>
        </div>

        <table className="mt-4 w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className={`border-b-2 ${color.border} text-left`}>
              <th className="w-[5%] px-2 py-2.5 text-slate-500">#</th>
              <th className={`w-[25%] px-2 py-2.5 ${color.text}`}>Item</th>
              <th className="w-[11%] px-2 py-2.5 text-right text-slate-500">Qty</th>
              <th className="w-[10%] px-2 py-2.5 text-slate-500">Unit</th>
              <th className="w-[14%] px-2 py-2.5 text-right text-slate-500">Price</th>
              <th className="w-[13%] px-2 py-2.5 text-right text-slate-500">Disc.</th>
              <th className="w-[10%] px-2 py-2.5 text-right text-slate-500">GST</th>
              <th className={`w-[12%] px-2 py-2.5 text-right ${color.text}`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="px-2 py-2.5 text-slate-400">{index + 1}</td>
                <td className="break-words px-2 py-2.5 font-medium">{row.item}</td>
                <td className="px-2 py-2.5 text-right">{row.qty}</td>
                <td className="break-words px-2 py-2.5 text-slate-500">{row.unit}</td>
                <td className="px-2 py-2.5 text-right">₹{row.price.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right">₹{row.discount.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right">₹{row.tax.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right font-medium">₹{row.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={`border-t-2 ${color.border} font-bold`}>
              <td className="px-2 py-3" colSpan="2">Total</td>
              <td className="px-2 py-3 text-right">{data.totals.qty}</td>
              <td colSpan="2" />
              <td className="px-2 py-3 text-right">₹{data.totals.discount.toFixed(2)}</td>
              <td className="px-2 py-3 text-right">₹{data.totals.tax.toFixed(2)}</td>
              <td className={`px-2 py-3 text-right ${color.text}`}>₹{data.totals.finalTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-3 text-xs text-slate-500"><span className="font-semibold text-slate-700">In words:</span> {numberToWords(data.totals.finalTotal)}</p>

        {data.terms && (
          <div className={`mt-5 rounded-md border-l-4 ${color.border} py-2 pl-3 text-xs`}>
            <p className="font-bold text-slate-700">{data.termsTitle}</p>
            <p className="mt-1 text-slate-500">{data.terms}</p>
          </div>
        )}

        <div className="mt-8 flex items-end justify-between print:mt-14">
          <p className="text-xs text-slate-400">Generated by {companyName}</p>
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} />
        </div>
      </div>
      <div className={`h-1.5 ${color.bg}`} />
    </div>
  );
}

// French Elite - Premium gradient header design.
function FrenchEliteTheme({ companyName, companyPhone, companyGstin, companyAddress, companyLogo, companySignature, data, color }) {
  return (
    <div className="mx-auto min-h-[680px] w-full max-w-[920px] overflow-hidden bg-white text-[13px] shadow-lg print:min-h-0 print:max-w-none print:text-sm print:shadow-none">
      <div className={`px-6 py-5 text-white ${color.bg}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{companyName}</h2>
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs opacity-90">
              {companyPhone && <span>☎ {companyPhone}</span>}
              {companyGstin && <span>GSTIN: {companyGstin}</span>}
            </div>
            {companyAddress && <p className="mt-0.5 text-xs opacity-80">{companyAddress}</p>}
          </div>
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/20 text-sm font-bold backdrop-blur-sm">
            {companyLogo ? <img src={companyLogo} alt="" className="h-full w-full object-contain" /> : "LOGO"}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className={`text-lg font-bold uppercase tracking-widest ${color.text}`}>Tax Invoice</h3>
          <div className="text-right text-xs">
            <p className="font-bold">#{data.invoiceNumber}</p>
            <p className="text-slate-500">{data.invoiceDateFormatted}</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className={`mb-2 text-[11px] font-bold uppercase tracking-wider ${color.text}`}>Bill To</p>
            <p className="font-semibold text-slate-900">{data.customer}</p>
            {data.billingAddress && <p className="text-slate-500">{data.billingAddress}</p>}
            {data.phone && <p className="mt-1 text-slate-500">Ph: {data.phone}</p>}
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className={`mb-2 text-[11px] font-bold uppercase tracking-wider ${color.text}`}>Ship To</p>
            <p className="text-slate-500">{data.shippingAddress || data.billingAddress}</p>
            <p className="mt-2 text-slate-400">State: {data.stateOfSupply}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className={`text-left text-white ${color.bg}`}>
                <th className="w-[5%] px-3 py-3">#</th>
                <th className="w-[25%] px-3 py-3">Item</th>
                <th className="w-[11%] px-3 py-3 text-right">Qty</th>
                <th className="w-[10%] px-3 py-3">Unit</th>
                <th className="w-[14%] px-3 py-3 text-right">Price</th>
                <th className="w-[13%] px-3 py-3 text-right">Discount</th>
                <th className="w-[10%] px-3 py-3 text-right">GST</th>
                <th className="w-[12%] px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={row.id} className={`border-b border-slate-100 ${index % 2 === 1 ? "bg-slate-50/50" : ""}`}>
                  <td className="px-3 py-3 text-slate-400">{index + 1}</td>
                  <td className="break-words px-3 py-3 font-semibold text-slate-900">{row.item}</td>
                  <td className="px-3 py-3 text-right">{row.qty}</td>
                  <td className="break-words px-3 py-3 text-slate-500">{row.unit}</td>
                  <td className="px-3 py-3 text-right">₹{row.price.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-slate-500">₹{row.discount.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-slate-500">₹{row.tax.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-semibold">₹{row.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={`flex items-center justify-between px-3 py-3 font-bold text-white ${color.bg}`}>
            <span>Grand Total</span>
            <span className="text-base">₹{data.totals.finalTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-3 flex justify-between text-xs">
          <p className="text-slate-500"><span className="font-semibold text-slate-700">In words:</span> {numberToWords(data.totals.finalTotal)}</p>
          <div className="text-right text-slate-500">
            <span>Qty: {data.totals.qty}</span>
            <span className="mx-2">|</span>
            <span>Disc: ₹{data.totals.discount.toFixed(2)}</span>
            <span className="mx-2">|</span>
            <span>Tax: ₹{data.totals.tax.toFixed(2)}</span>
          </div>
        </div>

        {data.terms && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs">
            <p className="font-bold text-slate-700">{data.termsTitle}</p>
            <p className="mt-1 text-slate-500">{data.terms}</p>
          </div>
        )}

        <div className="mt-8 flex items-end justify-between print:mt-14">
          <p className="text-[10px] text-slate-400">Thank you for your business!</p>
          <SignatureBlock companyName={companyName} signature={companySignature} color={color} />
        </div>
      </div>
    </div>
  );
}

// Theme mapping.
const themeComponents = {
  "Classic Themes": ClassicTheme,
  "Tally Theme": TallyTheme,
  "GST Theme 1": GSTTheme1,
  "GST Theme 3": GSTTheme3,
  "Double Divine": DoubleDivineTheme,
  "French Elite": FrenchEliteTheme,
};

// ─────────────────── MAIN COMPONENT ───────────────────

function SalePreview() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const rawInvoice = state?.invoice || readStoredInvoice();
  const [savedBusiness, setSavedBusiness] = useState(null);
  const [selectedTheme, setSelectedTheme] = useState("GST Theme 1");
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);

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
  const ThemeComponent = themeComponents[selectedTheme] || GSTTheme1;

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
              onClick={() => setSelectedTheme(theme)}
              className={`block w-full rounded-md px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${selectedTheme === theme ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
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
                onClick={() => setSelectedColorIndex(idx)}
                className={`h-8 rounded-md ${color.bg} transition-all ${selectedColorIndex === idx ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "hover:scale-105"}`}
                title={color.name}
              />
            ))}
          </div>
        </aside>

        {/* Invoice Preview */}
        <section className="min-w-0 print:block">
          <ThemeComponent
            companyName={companyName}
            companyPhone={companyPhone}
            companyGstin={companyGstin}
            companyAddress={companyAddress}
            companyLogo={companyLogo}
            companySignature={companySignature}
            data={normalized}
            color={currentColor}
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
