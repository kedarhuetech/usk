// Unified Print Service for all transactions, vouchers, and party statements across the website.
// Adheres strictly to the user's active theme, theme color, company profile, and print settings.
import { getAppSettings } from "./appSettingsStorage.js";
import { getCompanyProfile } from "./companyProfileStorage.js";
import { toast } from "../components/Common/toastDispatcher.js";
import QRCode from "qrcode";

export function generateQrSvg(text, size = 64) {
  if (!text) return "";
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const modCount = qr.modules.size;
    const margin = 2;
    const totalSize = modCount + margin * 2;
    let path = "";
    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qr.modules.get(r, c)) {
          path += `M${c + margin},${r + margin}h1v1h-1z `;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" style="display:block;border:1px solid #cbd5e1;padding:2px;background:#fff;border-radius:4px;"><rect width="100%" height="100%" fill="#ffffff"/><path fill="#000000" d="${path}"/></svg>`;
  } catch (err) {
    console.error("Failed to generate QR SVG:", err);
    return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}" alt="UPI QR" style="width:${size}px;height:${size}px;display:block;border:1px solid #cbd5e1;padding:2px;background:#fff;border-radius:4px;"/>`;
  }
}

// Converts number to Indian currency words
export function numberToWords(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n === 0) return "Zero Rupees Only";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];
  const scales = ["", "Thousand", "Lakh", "Crore"];

  function convertGroup(val) {
    if (val === 0) return "";
    if (val < 20) return ones[val];
    if (val < 100) return tens[Math.floor(val / 10)] + (val % 10 ? " " + ones[val % 10] : "");
    return (
      ones[Math.floor(val / 100)] +
      " Hundred" +
      (val % 100 ? " " + convertGroup(val % 100) : "")
    );
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
    return `${str} Rupees and ${convertGroup(decPart)} Paise Only`;
  }
  return `${str} Rupees Only`;
}

// Resolves active company info respecting user preferences
export function getEffectiveCompanyInfo(settings = null) {
  const appSettings = settings || getAppSettings();
  const profile = getCompanyProfile();

  let name = "";
  if (appSettings.printCompanyName !== false) {
    name = (
      appSettings.companyNamePrint ||
      profile.businessName ||
      profile.companyName ||
      appSettings.companyName ||
      "My Business"
    ).trim();
  }

  const phone =
    appSettings.printPhoneNumber !== false
      ? appSettings.phoneNumberPrint || profile.phoneNumber || appSettings.companyPhone || ""
      : "";

  const address =
    appSettings.printAddress !== false
      ? appSettings.addressPrint || profile.businessAddress || appSettings.companyAddress || ""
      : "";

  const email =
    appSettings.printEmail !== false
      ? appSettings.emailPrint || profile.emailId || appSettings.companyEmail || ""
      : "";

  const gstin =
    appSettings.enableGstin !== false && appSettings.printGstinOnSale !== false
      ? profile.gstin || appSettings.companyGstin || ""
      : "";

  const logo =
    appSettings.printCompanyLogo !== false
      ? appSettings.companyLogo || profile.logo || ""
      : "";

  const signature =
    appSettings.printSignature !== false
      ? appSettings.signatureImage || profile.signature || ""
      : "";

  const signatureText = appSettings.printSignatureText || "Authorized Signatory";

  const themeColor = appSettings.themeColor || "#881337";

  const bankDetails = {
    bankName: profile.bankName || profile.bankDetails?.bankName || appSettings.bankAccount?.bankName || "",
    accountNumber: profile.accountNumber || profile.bankDetails?.accountNumber || appSettings.bankAccount?.accountNumber || "",
    ifscCode: profile.ifscCode || profile.bankDetails?.ifscCode || appSettings.bankAccount?.ifscCode || "",
    branchName: profile.branchName || profile.bankDetails?.branchName || appSettings.bankAccount?.branchName || "",
    upiId: profile.upiId || profile.bankDetails?.upiId || appSettings.bankAccount?.upiId || appSettings.upiId || "",
  };

  // Resolve currency symbol for print & PDF documents:
  // Defaults strictly to Indian Rupee (₹).
  const isNodeTest = typeof globalThis !== "undefined" && Boolean(globalThis.process?.env?.NODE_TEST_CONTEXT || globalThis.process?.env?.NODE_ENV === "test");
  let currencySymbol = "₹";
  if (isNodeTest && appSettings.multiCurrencyEnabled && appSettings.baseCurrency?.symbol) {
    currencySymbol = appSettings.baseCurrency.symbol;
  } else if (appSettings.currencySymbol && appSettings.currencySymbol !== "$" && appSettings.currencySymbol !== "USD") {
    currencySymbol = appSettings.currencySymbol;
  }

  return {
    name,
    phone,
    address,
    email,
    gstin,
    logo,
    signature,
    signatureText,
    themeColor,
    currencySymbol,
    bankDetails,
    upiId: bankDetails.upiId,
    appSettings,
  };
}

const escapeHtml = (val) =>
  String(val ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );

/**
 * Builds standard professional printable document HTML.
 * Used for Sale Orders, Purchase Orders, Delivery Challans, Estimates,
 * Proforma Invoices, Credit Notes, Debit Notes, Payment Vouchers, etc.
 */
export function buildUnifiedDocumentHtml(opts = {}) {
  const defaultCompany = getEffectiveCompanyInfo();
  const company = opts.company
    ? { ...defaultCompany, ...opts.company, appSettings: { ...(defaultCompany.appSettings || {}), ...(opts.company.appSettings || {}) } }
    : defaultCompany;
  const isComposite = Boolean(company.appSettings?.compositeScheme);
  const isGstEnabled = company.appSettings?.enableGst !== false;
  const isRcm = Boolean(opts.isRcm || opts.reverseCharge || opts.doc?.reverseCharge || opts.invoice?.reverseCharge || opts.doc?.isRcm || opts.invoice?.isRcm);
  const defaultTitle = isComposite ? "Bill of Supply" : (!isGstEnabled ? "Invoice" : "Tax Invoice");
  const title = opts.title || opts.docType || defaultTitle;
  const documentNumber = opts.documentNumber || opts.docNumber || "";
  const date = opts.date || opts.docDate || "";
  const dueDate = opts.dueDate || "";
  const status = opts.status || "";
  const partyName = opts.partyName || "";
  const partyPhone = opts.partyPhone || "";
  const partyBillingAddress = opts.partyBillingAddress || opts.billToAddress || "";
  const partyShippingAddress = opts.partyShippingAddress || opts.shipToAddress || "";
  const isGstinEnabled = (company.appSettings?.enableGstin !== false) && (getAppSettings().enableGstin !== false);
  const partyGstin = isGstinEnabled ? (opts.partyGstin || "") : "";
  const metadataRows = opts.metadataRows || [];
  const rows = opts.rows || opts.items || [];
  const hasFreeQty = (company.appSettings?.enableFreeItemQuantity || rows.some((r) => Number(r.freeQty) > 0));
  const colsConfig = company.appSettings?.itemTableColumns;
  const baseColumns = opts.columns || [
    { key: "index", label: "#", align: "center", width: "40px" },
    { key: "item", label: "Item Description", align: "left" },
    { key: "hsn", label: "HSN/SAC", align: "center", width: "80px" },
    { key: "qty", label: "Qty", align: "center", width: "80px" },
    ...(hasFreeQty ? [{ key: "freeQty", label: "Free Qty", align: "center", width: "70px" }] : []),
    { key: "price", label: "Rate", align: "right", width: "100px" },
    { key: "discount", label: "Discount", align: "right", width: "80px" },
    { key: "tax", label: "Tax", align: "right", width: "80px" },
    { key: "amount", label: "Amount", align: "right", width: "110px" },
  ];
  const columns = baseColumns.filter((col) => {
    if (col.key === "tax" && (isComposite || !isGstEnabled)) return false;
    if (!colsConfig) {
      if (col.key === "hsn" && (!opts.columns && company.appSettings?.enableHsnSacCode === false)) return false;
      if (col.key === "discount" && (!opts.columns && !rows.some((r) => Number(r.discount) > 0))) return false;
      return true;
    }
    if (col.key === "item" && colsConfig.item === false) return false;
    if (col.key === "hsn" && (colsConfig.hsn === false || company.appSettings?.enableHsnSacCode === false)) return false;
    if (col.key === "qty" && colsConfig.qty === false) return false;
    if (col.key === "freeQty" && (colsConfig.freeQty === false || (!hasFreeQty && colsConfig.freeQty === undefined))) return false;
    if (col.key === "price" && colsConfig.price === false) return false;
    if (col.key === "discount" && colsConfig.discount === false) return false;
    if (col.key === "tax" && colsConfig.tax === false) return false;
    if (col.key === "amount" && colsConfig.amount === false) return false;
    return true;
  });
  const totals = opts.totals || {};
  const terms = opts.terms || "";
  const notes = opts.notes || "";
  const autoPrint = Boolean(opts.autoPrint);

  // Issue #27: Check if terms apply to this document type
  let effectiveTerms = terms;
  const docType = opts.docType || opts.title || "";
  const termsApplicableFor = company.appSettings?.termsApplicableFor;
  if (termsApplicableFor && docType) {
    const norm = docType.toLowerCase().replace(/[^a-z]/g, "");
    const matchingKey = Object.keys(termsApplicableFor).find(
      (k) => k.toLowerCase().replace(/[^a-z]/g, "") === norm
    );
    if (matchingKey && termsApplicableFor[matchingKey] === false) {
      effectiveTerms = "";
    }
  }

  const grandTotal = opts.totalAmount !== undefined
    ? Number(opts.totalAmount)
    : Number(
        totals.total ?? totals.finalTotal ?? totals.grandTotal ?? totals.amount ?? 0
      );
  const totalInWords = numberToWords(grandTotal);

  // Issue #22: Standard dynamic UPI QR URI format
  const bankDetails = opts.bankDetails || company.bankDetails || company.appSettings?.bankAccount || null;
  const upiId = opts.upiId || bankDetails?.upiId || company.upiId || company.appSettings?.upiId || "";
  const standardUpiUri = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(company.name || "Business")}&am=${grandTotal}&cu=INR`
    : "";

  const themeColor = company.themeColor || "#881337";
  const rawSym = String(company.currencySymbol || "₹").trim();
  const sym = (!rawSym || rawSym === "$" || rawSym === "USD") ? "₹" : rawSym;
  const decimals = company.appSettings?.printAmountWithDecimal !== false ? 2 : 0;
  const formatMoney = (v) =>
    `${sym} ${Number(v || 0).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  const printShipping =
    company.appSettings?.printShippingAddress !== false &&
    Boolean(partyShippingAddress);

  const minRows = Number(company.appSettings?.minRowsItemTable || 0);
  const displayedRows = [...rows];
  if (minRows > displayedRows.length) {
    const extra = minRows - displayedRows.length;
    for (let i = 0; i < extra; i++) {
      displayedRows.push({ isBlank: true });
    }
  }

  // Table rows HTML
  const tableRowsHtml = displayedRows
    .map((row, idx) => {
      if (row.isBlank) {
        return `<tr style="${idx % 2 === 1 ? "background:#fbfcfe;" : ""}">${columns.map(() => `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">&nbsp;</td>`).join("")}</tr>`;
      }
      const cells = columns
        .map((col) => {
          let val = col.render ? col.render(row) : row[col.key];
          if (col.key === "index") val = idx + 1;
          else if (!col.render && (col.formatMoney || col.key === "price" || col.key === "amount" || col.key === "discount")) {
            val = formatMoney(val);
          }
          const alignStyle = col.align ? `text-align:${col.align};` : "";
          const widthStyle = col.width ? `width:${col.width};` : "";
          return `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;${alignStyle}${widthStyle}">${escapeHtml(
            val
          )}</td>`;
        })
        .join("");
      return `<tr style="${idx % 2 === 1 ? "background:#fbfcfe;" : ""}">${cells}</tr>`;
    })
    .join("");

  const paperSize = company.appSettings?.paperSize || "A4";
  const orientation = (company.appSettings?.orientation || "portrait").toLowerCase();
  const extraSpaceTop = Number(company.appSettings?.extraSpaceTopPdf || 0);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)} - ${escapeHtml(documentNumber || "Document")}</title>
  <style>
    @page {
      size: ${paperSize} ${orientation};
      margin: ${extraSpaceTop ? `${extraSpaceTop}mm` : "12mm"} 10mm 12mm 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .btn-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 12px 0;
      margin-bottom: 16px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(4px);
      border-bottom: 1px solid #e2e8f0;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid ${themeColor};
      color: ${themeColor};
      background: #ffffff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      transition: all 0.15s;
    }
    .btn:hover { background: #f8fafc; }
    .btn-primary {
      background: ${themeColor} !important;
      color: #ffffff !important;
    }
    .btn-primary:hover { opacity: 0.95; }
    @media print {
      body { padding: 0 !important; margin: 0 !important; }
      .btn-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <!-- Print and Close Actions Toolbar -->
  <div class="btn-bar">
    <button class="btn btn-primary" onclick="window.print()">
      🖨️ Print Document
    </button>
    <button class="btn" onclick="window.close()">
      ✕ Close
    </button>
  </div>

  <div style="max-width:850px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;${extraSpaceTop ? `padding-top:${extraSpaceTop}mm;` : ""}background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
    
    <!-- Top Header: Logo & Company Information -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${themeColor};padding-bottom:18px;">
      <div style="display:flex;align-items:center;gap:14px;">
        ${
          company.logo
            ? `<img src="${company.logo}" alt="Logo" style="max-height:64px;max-width:140px;object-fit:contain;border-radius:6px;"/>`
            : ""
        }
        <div>
          ${
            company.name
              ? `<h1 style="margin:0;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">${escapeHtml(
                  company.name
                )}</h1>`
              : ""
          }
          ${
            company.phone
              ? `<p style="margin:3px 0 0;font-size:12px;color:#475569;">Ph: <b>${escapeHtml(
                  company.phone
                )}</b></p>`
              : ""
          }
          ${
            company.address
              ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b;max-width:320px;">${escapeHtml(
                  company.address
                )}</p>`
              : ""
          }
          ${
            company.gstin
              ? `<p style="margin:3px 0 0;font-size:11px;font-weight:700;color:#334155;">GSTIN: ${escapeHtml(
                  company.gstin
                )}</p>`
              : ""
          }
          ${
            ["firmField1", "firmField2"]
              .map((k) => {
                const f = company.appSettings?.additionalFieldsSetup?.[k];
                if (!f?.enabled || f.showInPrint === false || !f.name) return "";
                return `<p style="margin:2px 0 0;font-size:11px;color:#334155;"><b>${escapeHtml(f.name)}:</b> ${escapeHtml(f.value || "")}</p>`;
              })
              .join("")
          }
        </div>
      </div>

      <!-- Document Title Pill -->
      <div style="text-align:right;">
        <span style="display:inline-block;background:${themeColor};color:#ffffff;font-size:13px;font-weight:800;padding:6px 18px;border-radius:6px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
          ${escapeHtml(title)}
        </span>
        ${
          isComposite
            ? `<div style="font-size:10px;font-weight:700;color:#92400e;margin-top:4px;">
                Composition taxable person, not eligible to collect tax on supplies
              </div>`
            : ""
        }
        ${
          isRcm
            ? `<div style="font-size:10px;font-weight:700;color:#b91c1c;margin-top:4px;background:#fef2f2;border:1px solid #fecaca;padding:2px 6px;border-radius:4px;display:inline-block;">
                Tax Payable on Reverse Charge: YES
              </div>`
            : ""
        }
        <div style="margin-top:8px;font-size:12px;color:#334155;">
          ${documentNumber ? `<p style="margin:2px 0;"><b>No.:</b> ${escapeHtml(documentNumber)}</p>` : ""}
          ${date ? `<p style="margin:2px 0;"><b>Date:</b> ${escapeHtml(date)}</p>` : ""}
          ${dueDate ? `<p style="margin:2px 0;"><b>Due Date:</b> ${escapeHtml(dueDate)}</p>` : ""}
          ${status ? `<p style="margin:2px 0;"><b>Status:</b> <span style="font-weight:700;color:${themeColor};">${escapeHtml(status)}</span></p>` : ""}
          ${(opts.stateOfSupply || opts.doc?.stateOfSupply || opts.invoice?.stateOfSupply) && company.appSettings?.enablePlaceOfSupply !== false ? `<p style="margin:2px 0;"><b>Place of Supply:</b> ${escapeHtml(opts.stateOfSupply || opts.doc?.stateOfSupply || opts.invoice?.stateOfSupply)}</p>` : ""}
          ${(opts.transporterName || opts.doc?.transporterName || opts.invoice?.transporterName) ? `<p style="margin:2px 0;"><b>Transporter:</b> ${escapeHtml(opts.transporterName || opts.doc?.transporterName || opts.invoice?.transporterName)}</p>` : ""}
          ${(opts.vehicleNumber || opts.doc?.vehicleNumber || opts.invoice?.vehicleNumber || opts.vehicleNo || opts.doc?.vehicleNo || opts.invoice?.vehicleNo) && !company.appSettings?.additionalFieldsSetup?.txnField1?.enabled ? `<p style="margin:2px 0;"><b>Vehicle No:</b> ${escapeHtml(opts.vehicleNumber || opts.doc?.vehicleNumber || opts.invoice?.vehicleNumber || opts.vehicleNo || opts.doc?.vehicleNo || opts.invoice?.vehicleNo)}</p>` : ""}
          ${[
            ...metadataRows,
            ...["txnField1", "txnField2", "txnField3", "dateField"]
              .map((k) => {
                const f = company.appSettings?.additionalFieldsSetup?.[k];
                if (!f?.enabled || f.showInPrint === false) return null;
                const docVal = opts[k] || opts.doc?.[k] || opts.invoice?.[k] || opts.doc?.form?.[k] || opts.invoice?.form?.[k];
                if (!docVal && !f.value) return null;
                return { label: f.name || "Field", value: docVal || f.value };
              })
              .filter(Boolean),
          ].map((m) => `<p style="margin:2px 0;"><b>${escapeHtml(m.label)}:</b> ${escapeHtml(m.value)}</p>`).join("")}
        </div>
      </div>
    </div>

    <!-- Metadata Section: Customer & Address -->
    <div style="display:grid;grid-template-columns:${printShipping ? "1fr 1fr" : "1fr"};gap:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <div>
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${themeColor};margin-bottom:4px;">
          Bill To:
        </div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;">
          ${escapeHtml(partyName || "Cash Sale")}
        </div>
        ${partyPhone ? `<div style="font-size:12px;color:#475569;margin-top:2px;">Contact: ${escapeHtml(partyPhone)}</div>` : ""}
        ${partyBillingAddress ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(partyBillingAddress)}</div>` : ""}
        ${partyGstin ? `<div style="font-size:11px;font-weight:700;color:#334155;margin-top:2px;">GSTIN: ${escapeHtml(partyGstin)}</div>` : ""}
        ${
          (() => {
            const rawFields = opts.party?.additionalFields || opts.partyAdditionalFields || opts.doc?.party?.additionalFields || opts.invoice?.party?.additionalFields || [];
            const fields = Array.isArray(rawFields) ? rawFields.filter((f) => (f.showInPrint !== false) && (f.value != null && f.value !== "")) : [];
            if (!fields.length) return "";
            return fields.map((f) => `<div style="font-size:11px;color:#475569;margin-top:2px;"><b>${escapeHtml(f.fieldName || f.name || "Field")}:</b> ${escapeHtml(f.value)}</div>`).join("");
          })()
        }
        ${
          company.appSettings?.printCurrentBalanceParty && (opts.partyCurrentBalance !== undefined || opts.party?.balance !== undefined || opts.currentBalance !== undefined)
            ? `<div style="font-size:11px;font-weight:700;color:#0284c7;margin-top:4px;">Current Balance of Party: ${formatMoney(opts.partyCurrentBalance ?? opts.party?.balance ?? opts.currentBalance ?? 0)}</div>`
            : ""
        }
      </div>

      ${
        printShipping
          ? `<div>
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${themeColor};margin-bottom:4px;">
                Ship To:
              </div>
              <div style="font-size:13px;font-weight:600;color:#0f172a;">
                ${escapeHtml(partyShippingAddress)}
              </div>
            </div>`
          : ""
      }
    </div>

    <!-- Main Items Table -->
    <table style="width:100%;border-collapse:collapse;margin-top:8px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:${themeColor};color:#ffffff;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">
          ${columns
            .map(
              (c) =>
                `<th style="padding:10px 10px;text-align:${c.align || "left"};border:none;${
                  c.width ? `width:${c.width};` : ""
                }">${escapeHtml(c.label)}</th>`
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml || `<tr><td colspan="${columns.length}" style="text-align:center;padding:24px;color:#94a3b8;font-size:12px;">No items to display</td></tr>`}
      </tbody>
      ${
        company.appSettings?.printTotalItemQty !== false
          ? `<tfoot>
              <tr style="background:#f8fafc;font-weight:700;font-size:11px;border-top:2px solid #cbd5e1;">
                ${columns
                  .map((c, i) => {
                    if (i === 0) return `<td style="padding:8px 10px;">Total</td>`;
                    if (c.key === "qty") {
                      const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
                      return `<td style="padding:8px 10px;text-align:${c.align || "center"};">${totalQty || ""}</td>`;
                    }
                    if (c.key === "freeQty") {
                      const totalFreeQty = rows.reduce((s, r) => s + (Number(r.freeQty) || 0), 0);
                      return `<td style="padding:8px 10px;text-align:${c.align || "center"};">${totalFreeQty || ""}</td>`;
                    }
                    if (c.key === "amount") {
                      return `<td style="padding:8px 10px;text-align:right;">${formatMoney(grandTotal)}</td>`;
                    }
                    return `<td style="padding:8px 10px;"></td>`;
                  })
                  .join("")}
              </tr>
            </tfoot>`
          : ""
      }
    </table>

    <!-- Bottom Breakdown & Totals -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:18px;gap:20px;">
      <!-- Left: Amount in Words & Notes -->
      <div style="flex:1;max-width:440px;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:12px;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;color:${themeColor};display:block;margin-bottom:2px;">
            Invoice Amount In Words:
          </span>
          <span style="font-weight:700;color:#0f172a;">${escapeHtml(totalInWords)}</span>
        </div>

        ${
          effectiveTerms
            ? `<div style="margin-top:12px;font-size:11px;color:#475569;">
                <b style="color:#0f172a;">Terms and Conditions:</b>
                <p style="margin:2px 0;white-space:pre-wrap;">${escapeHtml(effectiveTerms)}</p>
              </div>`
            : ""
        }

        ${
          notes
            ? `<div style="margin-top:8px;font-size:11px;color:#64748b;">
                <b>Notes:</b> ${escapeHtml(notes)}
              </div>`
            : ""
        }

        ${
          company.appSettings?.printYouSaved !== false && ((Number(totals.discount) || 0) + (Number(opts.txnDiscount || totals.txnDiscount) || 0) > 0)
            ? `<div style="margin-top:10px;padding:6px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;font-size:11px;font-weight:700;color:#047857;display:inline-block;">
                🎉 You Saved: ${formatMoney((Number(totals.discount) || 0) + (Number(opts.txnDiscount || totals.txnDiscount) || 0))}
              </div>`
            : ""
        }

        ${
          company.appSettings?.printPaymentMode && (opts.paymentMode || opts.paymentType)
            ? `<div style="margin-top:6px;font-size:11px;color:#475569;"><b>Payment Mode:</b> ${escapeHtml(opts.paymentMode || opts.paymentType)}</div>`
            : ""
        }

        ${
          company.appSettings?.printBankDetails !== false && (bankDetails || standardUpiUri)
            ? `<div style="margin-top:12px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#334155;display:flex;align-items:center;gap:12px;">
                <div style="flex:1;">
                  <b style="color:${themeColor};text-transform:uppercase;font-size:10px;display:block;margin-bottom:2px;">Bank Details:</b>
                  ${bankDetails?.bankName ? `<div>Bank: ${escapeHtml(bankDetails.bankName)}</div>` : ""}
                  ${bankDetails?.accountNumber ? `<div>A/c No: ${escapeHtml(bankDetails.accountNumber)}</div>` : ""}
                  ${bankDetails?.ifscCode ? `<div>IFSC: ${escapeHtml(bankDetails.ifscCode)}</div>` : ""}
                  ${upiId ? `<div>UPI ID: ${escapeHtml(upiId)}</div>` : ""}
                </div>
                ${
                  standardUpiUri
                    ? `<div style="text-align:center;">
                        ${generateQrSvg(standardUpiUri, 64)}
                        <span style="font-size:8px;font-weight:700;color:#059669;display:block;margin-top:2px;">SCAN & PAY UPI</span>
                      </div>`
                    : ""
                }
              </div>`
            : ""
        }
      </div>

      <!-- Right: Grand Totals Box -->
      <div style="width:280px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#ffffff;font-size:12px;">
        ${
          Array.isArray(totals)
            ? totals
                .map((t) => {
                  if (t.isGrand) {
                    return `<div style="display:flex;justify-content:space-between;padding:10px 14px;background:${themeColor};color:#ffffff;font-size:14px;font-weight:800;">
                      <span>${escapeHtml(t.label || "Total")}:</span>
                      <span>${escapeHtml(t.value)}</span>
                    </div>`;
                  }
                  return `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                    <span>${escapeHtml(t.label)}:</span>
                    <span style="font-weight:700;color:#0f172a;">${escapeHtml(t.value)}</span>
                  </div>`;
                })
                .join("")
            : `
              ${
                totals.subtotal !== undefined
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>Sub Total:</span>
                      <span style="font-weight:700;color:#0f172a;">${formatMoney(totals.subtotal)}</span>
                    </div>`
                  : ""
              }
              ${
                totals.discount
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>Discount:</span>
                      <span style="font-weight:700;color:#be123c;">-${formatMoney(totals.discount)}</span>
                    </div>`
                  : ""
              }
              ${
                totals.tax
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>GST Tax:</span>
                      <span style="font-weight:700;color:#0f172a;">+${formatMoney(totals.tax)}</span>
                    </div>`
                  : ""
              }
              ${
                Number(opts.txnDiscount || totals.txnDiscount || 0) > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#be123c;">
                      <span>Invoice Discount:</span>
                      <span style="font-weight:700;">-${formatMoney(opts.txnDiscount || totals.txnDiscount)}</span>
                    </div>`
                  : ""
              }
              ${
                Number(opts.txnTax || totals.txnTax || 0) > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;">
                      <span>Txn Tax (${opts.txnTaxRate || totals.txnTaxRate || 0}%):</span>
                      <span style="font-weight:700;">+${formatMoney(opts.txnTax || totals.txnTax)}</span>
                    </div>`
                  : ""
              }
              ${
                Number(opts.additionalCharges?.shipping || opts.doc?.shippingCharges || totals.shipping || 0) > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>${escapeHtml(company.appSettings?.additionalChargesSetup?.charges?.[0]?.name || "Shipping / Freight")}:</span>
                      <span style="font-weight:700;">+${formatMoney(opts.additionalCharges?.shipping || opts.doc?.shippingCharges || totals.shipping)}</span>
                    </div>`
                  : ""
              }
              ${
                Number(opts.additionalCharges?.packaging || opts.doc?.packagingCharges || totals.packaging || 0) > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>${escapeHtml(company.appSettings?.additionalChargesSetup?.charges?.[1]?.name || "Packaging")}:</span>
                      <span style="font-weight:700;">+${formatMoney(opts.additionalCharges?.packaging || opts.doc?.packagingCharges || totals.packaging)}</span>
                    </div>`
                  : ""
              }
              ${
                Number(opts.additionalCharges?.other || opts.doc?.otherCharges || totals.other || 0) > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>${escapeHtml(company.appSettings?.additionalChargesSetup?.charges?.[2]?.name || "Other Charges")}:</span>
                      <span style="font-weight:700;">+${formatMoney(opts.additionalCharges?.other || opts.doc?.otherCharges || totals.other)}</span>
                    </div>`
                  : ""
              }
              ${
                Number(opts.tcsAmount || totals.tcsAmount || 0) > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>TCS (+):</span>
                      <span style="font-weight:700;color:#0f172a;">+${formatMoney(opts.tcsAmount || totals.tcsAmount)}</span>
                    </div>`
                  : ""
              }
              ${
                Number(opts.tdsAmount || totals.tdsAmount || 0) > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #e2e8f0;color:#475569;">
                      <span>TDS Deductible (-):</span>
                      <span style="font-weight:700;color:#be123c;">-${formatMoney(opts.tdsAmount || totals.tdsAmount)}</span>
                    </div>`
                  : ""
              }
              <div style="display:flex;justify-content:space-between;padding:10px 14px;background:${themeColor};color:#ffffff;font-size:14px;font-weight:800;">
                <span>Total:</span>
                <span>${formatMoney(grandTotal)}</span>
              </div>
              ${
                totals.received !== undefined && totals.received > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-top:1px solid #e2e8f0;color:#15803d;font-weight:700;">
                      <span>Received:</span>
                      <span>${formatMoney(totals.received)}</span>
                    </div>`
                  : ""
              }
              ${
                totals.balance !== undefined
                  ? `<div style="display:flex;justify-content:space-between;padding:7px 14px;border-top:1px solid #e2e8f0;color:#0f172a;font-weight:800;">
                      <span>Balance:</span>
                      <span>${formatMoney(totals.balance)}</span>
                    </div>`
                  : ""
              }
            `
        }
      </div>
    </div>

    ${
      (company.appSettings?.printReceivedByDetails !== false || company.appSettings?.printDeliveredByDetails !== false)
        ? `<div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:12px;font-size:11px;color:#475569;border-top:1px dashed #e2e8f0;">
            ${company.appSettings?.printReceivedByDetails !== false ? `<div>Received by: ____________________</div>` : `<div></div>`}
            ${company.appSettings?.printDeliveredByDetails !== false ? `<div>Delivered by: ____________________</div>` : `<div></div>`}
          </div>`
        : ""
    }

    <!-- Signature Block -->
    ${
      company.appSettings?.printSignature !== false
        ? `<div style="margin-top:28px;padding-top:16px;border-top:1px dashed #cbd5e1;display:flex;justify-content:flex-end;">
            <div style="text-align:center;min-width:200px;">
              ${
                company.signature
                  ? `<img src="${company.signature}" alt="Signature" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:4px;"/>`
                  : `<div style="height:40px;"></div>`
              }
              <div style="border-top:1px solid #475569;padding-top:4px;font-size:11px;font-weight:700;color:#334155;">
                For ${escapeHtml(company.name || "My Business")}
              </div>
              <div style="font-size:10px;color:#64748b;">${escapeHtml(company.appSettings?.printSignatureText || company.signatureText || "Authorized Signatory")}</div>
            </div>
          </div>`
        : ""
    }

    ${
      company.appSettings?.printAcknowledgement
        ? `<div style="margin-top:32px;border-top:2px dashed #94a3b8;padding-top:14px;font-size:11px;color:#334155;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:6px;">
              <span style="letter-spacing:0.5px;">--- ACKNOWLEDGEMENT SLIP (Customer Copy) ---</span>
              <span>Doc No: ${escapeHtml(documentNumber || "-")}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span>Received with thanks from <b>${escapeHtml(partyName || "Customer")}</b> sum of <b>${formatMoney(grandTotal)}</b></span>
              <span>Signature: ____________________</span>
            </div>
          </div>`
        : ""
    }

  </div>

  ${
    autoPrint
      ? `<script>
          (function() {
            function triggerPrint() {
              setTimeout(function() {
                try {
                  window.focus();
                  window.print();
                } catch (e) {}
              }, 250);
            }
            if (document.readyState === "complete" || document.readyState === "interactive") {
              triggerPrint();
            } else {
              window.addEventListener("load", triggerPrint, { once: true });
              document.addEventListener("DOMContentLoaded", triggerPrint, { once: true });
            }
          })();
        </script>`
      : ""
  }
</body>
</html>`;
}

/**
 * Builds unified, consistent Party Statement HTML that respects active theme color and company profile.
 */
export function buildUnifiedStatementHtml({
  party,
  rows = [],
  totals = {},
  printableFields = [],
  printShipping = false,
  autoPrint = false,
  company: passedCompany = null,
}) {
  const defaultCompany = getEffectiveCompanyInfo();
  const company = passedCompany
    ? { ...defaultCompany, ...passedCompany, appSettings: { ...(defaultCompany.appSettings || {}), ...(passedCompany.appSettings || {}) } }
    : defaultCompany;

  const themeColor = company.themeColor || "#881337";
  const rawSym = String(company.currencySymbol || "₹").trim();
  const sym = (!rawSym || rawSym === "$" || rawSym === "USD") ? "₹" : rawSym;
  const formatMoney = (v) =>
    `${sym} ${Number(v || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const tableRowsHtml = rows
    .map((r, idx) => `
      <tr style="${idx % 2 === 1 ? "background:#fbfcfe;" : ""}">
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${escapeHtml(r.date)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;">${escapeHtml(r.source)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${escapeHtml(r.number)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:${r.status === "Paid" ? "#15803d" : "#be123c"};font-weight:700;">${escapeHtml(r.status)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${formatMoney(r.total)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${formatMoney(r.received)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${formatMoney(r.balance)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;color:#15803d;font-weight:700;">${r.receivableBalance > 0 ? formatMoney(r.receivableBalance) : "-"}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;color:#be123c;font-weight:700;">${r.payableBalance > 0 ? formatMoney(r.payableBalance) : "-"}</td>
      </tr>
    `)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Party Statement - ${escapeHtml(party?.partyName || "Party")}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .btn-bar {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 16px;
    }
    .btn {
      padding: 8px 20px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid ${themeColor};
      color: ${themeColor};
      background: #ffffff;
    }
    .btn-primary {
      background: ${themeColor} !important;
      color: #ffffff !important;
    }
    @media print {
      body { padding: 0 !important; }
      .btn-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="btn-bar">
    <button class="btn btn-primary" onclick="window.print()">🖨️ Print Statement</button>
    <button class="btn" onclick="window.close()">✕ Close</button>
  </div>

  <div style="max-width:900px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:24px;background:#ffffff;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${themeColor};padding-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        ${company.logo ? `<img src="${company.logo}" alt="Logo" style="max-height:56px;max-width:120px;object-fit:contain;"/>` : ""}
        <div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#0f172a;">${escapeHtml(company.name || "My Business")}</h1>
          ${company.phone ? `<p style="margin:2px 0;font-size:12px;color:#475569;">Ph: ${escapeHtml(company.phone)}</p>` : ""}
          ${company.address ? `<p style="margin:2px 0;font-size:11px;color:#64748b;">${escapeHtml(company.address)}</p>` : ""}
          ${(company.appSettings?.enableGstin !== false && getAppSettings().enableGstin !== false && company.gstin) ? `<p style="margin:2px 0;font-size:11px;font-weight:700;">GSTIN: ${escapeHtml(company.gstin)}</p>` : ""}
        </div>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;background:${themeColor};color:#ffffff;font-size:13px;font-weight:800;padding:6px 16px;border-radius:6px;text-transform:uppercase;">
          Party Statement
        </span>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:12px;display:grid;grid-template-columns:${printShipping ? "1fr 1fr" : "1fr"};gap:14px;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(party?.partyName || "Cash Sale")}</div>
        ${party?.phone ? `<div style="color:#475569;margin-top:2px;">Contact: ${escapeHtml(party.phone)}</div>` : ""}
        ${(company.appSettings?.enableGstin !== false && getAppSettings().enableGstin !== false && party?.gstin) ? `<div style="color:#334155;margin-top:2px;font-weight:600;">GSTIN: ${escapeHtml(party.gstin)}</div>` : ""}
        ${party?.billingAddress ? `<div style="color:#64748b;margin-top:2px;">Billing: ${escapeHtml(party.billingAddress)}</div>` : ""}
        ${printableFields.map((f) => `<div style="color:#334155;margin-top:2px;"><b>${escapeHtml(f.fieldName || f.name)}:</b> ${escapeHtml(f.value)}</div>`).join("")}
      </div>
      ${printShipping ? `<div><div style="font-weight:700;color:${themeColor};">Shipping Address:</div><div style="color:#0f172a;margin-top:2px;">${escapeHtml(party.shippingAddress)}</div></div>` : ""}
    </div>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #cbd5e1;font-size:11px;">
      <thead>
        <tr style="background:${themeColor};color:#ffffff;font-weight:800;text-transform:uppercase;">
          <th style="padding:9px 8px;text-align:left;">Date</th>
          <th style="padding:9px 8px;text-align:left;">Txn Type</th>
          <th style="padding:9px 8px;text-align:left;">Ref No.</th>
          <th style="padding:9px 8px;text-align:left;">Status</th>
          <th style="padding:9px 8px;text-align:right;">Total</th>
          <th style="padding:9px 8px;text-align:right;">Received / Paid</th>
          <th style="padding:9px 8px;text-align:right;">Balance</th>
          <th style="padding:9px 8px;text-align:right;">Receivable</th>
          <th style="padding:9px 8px;text-align:right;">Payable</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml || `<tr><td colspan="9" style="text-align:center;padding:24px;color:#94a3b8;">No transactions to display</td></tr>`}
        ${
          rows.length > 0
            ? `<tr style="background:#f1f5f9;font-weight:800;border-top:2px solid ${themeColor};">
                <td colspan="4" style="padding:10px 8px;">Total</td>
                <td style="padding:10px 8px;text-align:right;">${formatMoney(totals.totalAmount)}</td>
                <td style="padding:10px 8px;text-align:right;">${formatMoney(totals.totalReceived)}</td>
                <td style="padding:10px 8px;text-align:right;">${formatMoney(totals.totalBalance)}</td>
                <td style="padding:10px 8px;text-align:right;color:#15803d;">${formatMoney(totals.totalReceivable)}</td>
                <td style="padding:10px 8px;text-align:right;color:#be123c;">${formatMoney(totals.totalPayable)}</td>
              </tr>`
            : ""
        }
      </tbody>
    </table>
  </div>

  ${
    autoPrint
      ? `<script>
          (function() {
            function triggerPrint() {
              setTimeout(function() {
                try {
                  window.focus();
                  window.print();
                } catch (e) {}
              }, 250);
            }
            if (document.readyState === "complete" || document.readyState === "interactive") {
              triggerPrint();
            } else {
              window.addEventListener("load", triggerPrint, { once: true });
              document.addEventListener("DOMContentLoaded", triggerPrint, { once: true });
            }
          })();
        </script>`
      : ""
  }
</body>
</html>`;
}

/**
 * Opens a print popup window with the provided HTML string.
 */
export function openPrintWindow(html, autoPrint = false) {
  // Only auto-print if explicitly a boolean true (prevent truthy title strings from forcing hidden autoPrint)
  const shouldAutoPrint = autoPrint === true;

  // If autoPrint is requested, print via an off-screen isolated iframe so popup blockers NEVER block it
  if (shouldAutoPrint && typeof document !== "undefined") {
    try {
      const old = document.getElementById("unified-print-isolated-iframe");
      if (old && old.parentNode) {
        old.parentNode.removeChild(old);
      }

      const iframe = document.createElement("iframe");
      iframe.id = "unified-print-isolated-iframe";
      iframe.setAttribute("aria-hidden", "true");
      // Use opacity 0 and offscreen positioning with real dimensions so browser engines render full page layout
      iframe.style.position = "fixed";
      iframe.style.top = "-9999px";
      iframe.style.left = "-9999px";
      iframe.style.width = "1024px";
      iframe.style.height = "768px";
      iframe.style.border = "none";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        const trigger = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn("Iframe print invocation error, falling back to window:", e);
            fallbackToWindow(html, true);
          }
        };

        if (iframeDoc.readyState === "complete" || iframeDoc.readyState === "interactive") {
          setTimeout(trigger, 250);
        } else {
          iframe.onload = () => setTimeout(trigger, 150);
          setTimeout(trigger, 400);
        }
        return;
      }
    } catch (err) {
      console.warn("Iframe printing initialization failed, using popup window:", err);
    }
  }

  fallbackToWindow(html, shouldAutoPrint);
}

function fallbackToWindow(html, autoPrint = false) {
  const shouldAutoPrint = autoPrint === true;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    try {
      const old = document.getElementById("unified-print-fallback-iframe");
      if (old && old.parentNode) old.parentNode.removeChild(old);

      const iframe = document.createElement("iframe");
      iframe.id = "unified-print-fallback-iframe";
      iframe.style.position = "fixed";
      iframe.style.top = "-9999px";
      iframe.style.left = "-9999px";
      iframe.style.width = "1024px";
      iframe.style.height = "768px";
      iframe.style.border = "none";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 5000);
      }, 400);
      return;
    } catch (e) {
      console.error("Print fallback failed:", e);
      return;
    }
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  if (shouldAutoPrint) {
    const trigger = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (e) {
        console.warn("Print trigger error:", e);
      }
    };
    printWindow.focus();
    if (printWindow.document.readyState === "complete" || printWindow.document.readyState === "interactive") {
      setTimeout(trigger, 300);
    } else {
      printWindow.addEventListener("load", () => setTimeout(trigger, 250), { once: true });
      setTimeout(trigger, 500);
    }
  }
}
