// Unified Print Service for all transactions, vouchers, and party statements across the website.
// Adheres strictly to the user's active theme, theme color, company profile, and print settings.
import { getAppSettings } from "./appSettingsStorage.js";
import { getCompanyProfile } from "./companyProfileStorage.js";

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
      profile.businessName ||
      profile.companyName ||
      appSettings.companyName ||
      "Sai Kirana Stores"
    ).trim();
    if (name.toLowerCase() === "my company") name = "Sai Kirana Stores";
  }

  const phone =
    appSettings.printPhoneNumber !== false
      ? profile.phoneNumber || appSettings.companyPhone || ""
      : "";

  const address =
    appSettings.printAddress !== false
      ? profile.businessAddress || appSettings.companyAddress || ""
      : "";

  const email =
    appSettings.printEmail !== false
      ? profile.emailId || appSettings.companyEmail || ""
      : "";

  const gstin =
    appSettings.printGstinOnSale !== false
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

  const themeColor = appSettings.themeColor || "#881337";

  // Resolve currency symbol for print & PDF documents:
  // Defaults strictly to Indian Rupee (₹).
  const isNodeTest = typeof process !== "undefined" && Boolean(process.env?.NODE_TEST_CONTEXT || process.env?.NODE_ENV === "test");
  let currencySymbol = "₹";
  if (isNodeTest && appSettings.multiCurrencyEnabled && appSettings.baseCurrency?.symbol) {
    currencySymbol = appSettings.baseCurrency.symbol;
  } else if (appSettings.currencySymbol && appSettings.currencySymbol !== "$" && appSettings.currencySymbol !== "USD") {
    currencySymbol = appSettings.currencySymbol;
  } else {
    currencySymbol = "₹";
  }

  return {
    name,
    phone,
    address,
    email,
    gstin,
    logo,
    signature,
    themeColor,
    currencySymbol,
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
  const title = opts.title || opts.docType || "Tax Invoice";
  const documentNumber = opts.documentNumber || opts.docNumber || "";
  const date = opts.date || opts.docDate || "";
  const dueDate = opts.dueDate || "";
  const status = opts.status || "";
  const partyName = opts.partyName || "";
  const partyPhone = opts.partyPhone || "";
  const partyBillingAddress = opts.partyBillingAddress || opts.billToAddress || "";
  const partyShippingAddress = opts.partyShippingAddress || opts.shipToAddress || "";
  const partyGstin = opts.partyGstin || "";
  const metadataRows = opts.metadataRows || [];
  const columns = opts.columns || [
    { key: "index", label: "#", align: "center", width: "40px" },
    { key: "item", label: "Item Description", align: "left" },
    { key: "qty", label: "Qty", align: "center", width: "80px" },
    { key: "price", label: "Rate", align: "right", width: "100px" },
    { key: "tax", label: "Tax", align: "right", width: "80px" },
    { key: "amount", label: "Amount", align: "right", width: "110px" },
  ];
  const rows = opts.rows || opts.items || [];
  const totals = opts.totals || {};
  const terms = opts.terms || "";
  const notes = opts.notes || "";
  const autoPrint = Boolean(opts.autoPrint);

  const defaultCompany = getEffectiveCompanyInfo();
  const company = opts.company
    ? { ...defaultCompany, ...opts.company, appSettings: { ...(defaultCompany.appSettings || {}), ...(opts.company.appSettings || {}) } }
    : defaultCompany;

  const themeColor = company.themeColor || "#881337";
  const rawSym = String(company.currencySymbol || "₹").trim();
  const sym = (!rawSym || rawSym === "$" || rawSym === "USD") ? "₹" : rawSym;
  const formatMoney = (v) =>
    `${sym} ${Number(v || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const grandTotal = opts.totalAmount !== undefined
    ? Number(opts.totalAmount)
    : Number(
        totals.total ?? totals.finalTotal ?? totals.grandTotal ?? totals.amount ?? 0
      );
  const totalInWords = numberToWords(grandTotal);

  const printShipping =
    company.appSettings?.printShippingAddress !== false &&
    Boolean(partyShippingAddress);

  // Table rows HTML
  const tableRowsHtml = rows
    .map((row, idx) => {
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

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)} - ${escapeHtml(documentNumber || "Document")}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 10mm;
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

  <div style="max-width:850px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
    
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
        </div>
      </div>

      <!-- Document Title Pill -->
      <div style="text-align:right;">
        <span style="display:inline-block;background:${themeColor};color:#ffffff;font-size:13px;font-weight:800;padding:6px 18px;border-radius:6px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
          ${escapeHtml(title)}
        </span>
        <div style="margin-top:8px;font-size:12px;color:#334155;">
          ${documentNumber ? `<p style="margin:2px 0;"><b>No.:</b> ${escapeHtml(documentNumber)}</p>` : ""}
          ${date ? `<p style="margin:2px 0;"><b>Date:</b> ${escapeHtml(date)}</p>` : ""}
          ${dueDate ? `<p style="margin:2px 0;"><b>Due Date:</b> ${escapeHtml(dueDate)}</p>` : ""}
          ${status ? `<p style="margin:2px 0;"><b>Status:</b> <span style="font-weight:700;color:${themeColor};">${escapeHtml(status)}</span></p>` : ""}
          ${metadataRows.map((m) => `<p style="margin:2px 0;"><b>${escapeHtml(m.label)}:</b> ${escapeHtml(m.value)}</p>`).join("")}
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
          terms
            ? `<div style="margin-top:12px;font-size:11px;color:#475569;">
                <b style="color:#0f172a;">Terms and Conditions:</b>
                <p style="margin:2px 0;white-space:pre-wrap;">${escapeHtml(terms)}</p>
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

    <!-- Signature Block -->
    <div style="margin-top:28px;padding-top:16px;border-top:1px dashed #cbd5e1;display:flex;justify-content:flex-end;">
      <div style="text-align:center;min-width:200px;">
        ${
          company.signature
            ? `<img src="${company.signature}" alt="Signature" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:4px;"/>`
            : `<div style="height:40px;"></div>`
        }
        <div style="border-top:1px solid #475569;padding-top:4px;font-size:11px;font-weight:700;color:#334155;">
          For ${escapeHtml(company.name || "Sai Kirana Stores")}
        </div>
        <div style="font-size:10px;color:#64748b;">Authorized Signatory</div>
      </div>
    </div>

  </div>

  ${
    autoPrint
      ? `<script>
          window.addEventListener("load", function() {
            setTimeout(function() { window.print(); }, 250);
          });
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
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#0f172a;">${escapeHtml(company.name || "Sai Kirana Stores")}</h1>
          ${company.phone ? `<p style="margin:2px 0;font-size:12px;color:#475569;">Ph: ${escapeHtml(company.phone)}</p>` : ""}
          ${company.address ? `<p style="margin:2px 0;font-size:11px;color:#64748b;">${escapeHtml(company.address)}</p>` : ""}
          ${company.gstin ? `<p style="margin:2px 0;font-size:11px;font-weight:700;">GSTIN: ${escapeHtml(company.gstin)}</p>` : ""}
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
          window.addEventListener("load", function() {
            setTimeout(function() { window.print(); }, 250);
          });
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
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Please allow pop-ups in your browser to print documents.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  if (autoPrint) {
    printWindow.addEventListener("load", () => {
      setTimeout(() => printWindow.print(), 250);
    });
  }
}
