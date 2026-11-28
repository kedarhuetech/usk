import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import {
  FiAlertCircle,
  FiCheck,
  FiCheckCircle,
  FiDownload,
  FiExternalLink,
  FiLoader,
  FiMail,
  FiPrinter,
  FiSend,
  FiShare2,
  FiX,
} from "react-icons/fi";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";
import { getEffectiveCompanyInfo } from "../../services/unifiedPrintService.js";
import { toast } from "./Toast.jsx";

function parseYMD(val) {
  if (!val) return "";
  const s = String(val).trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const d = new Date(val);
  if (!Number.isNaN(d.getTime()))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return "";
}

function formatDateDMY(val) {
  if (!val) return "—";
  const ymd = parseYMD(val);
  if (!ymd) return String(val);
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

const fmtMoney = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatGeneratedTimestamp(d = new Date()) {
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `Generated on ${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
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
      }[c] || c)
  );

/**
 * Builds standalone, perfectly aligned A4 HTML representation of the report.
 * Completely immune to modal overflow/clipping or empty print previews.
 */
export function buildReportHtml({
  title = "Purchase Bills Report",
  companyName = "USV Test Trade",
  phone = "",
  email = "",
  address = "",
  gstin = "",
  durationStr = "All Dates",
  user = "Admin",
  records = [],
  totalLabel = "Total Purchase:",
  calculatedTotal = 0,
  timestampStr = "",
  themeColor = "#881337",
}) {
  const rowsHtml =
    records.length === 0
      ? `<tr><td colspan="8" style="padding:28px 12px;text-align:center;color:#94a3b8;font-size:12px;">No transactions found for the selected period</td></tr>`
      : records
          .map((record, index) => {
            const rawDate =
              record.form?.invoiceDate ||
              record.form?.billDate ||
              record.invoiceDate ||
              record.date ||
              record.createdAt;
            const displayDate = formatDateDMY(rawDate);
            const invNumber =
              record.form?.invoiceNumber ||
              record.invoiceNumber ||
              record.invoiceNo ||
              record.invoice ||
              record.refNo ||
              record.number ||
              record.id ||
              "—";
            const partyName =
              record.form?.customer ||
              record.form?.party ||
              record.customer ||
              record.customerName ||
              record.partyName ||
              record.supplier ||
              record.party ||
              (title.toLowerCase().includes("purchase")
                ? "Cash Purchase"
                : "Cash Sale");
            const partyGstin =
              record.form?.gstin || record.partyGstin || record.gstin || "";
            const paymentType =
              record.form?.paymentType ||
              record.paymentType ||
              (record.purchaseType === "cash" ? "Cash" : "Credit");

            const totalAmt = Number(
              record.totals?.finalTotal ??
                record.totals?.grandTotal ??
                record.totalAmount ??
                record.total ??
                record.amount ??
                0
            );
            const receivedAmt = Number(
              record.totals?.received ??
                record.totals?.paid ??
                record.paidAmount ??
                record.receivedAmount ??
                record.form?.receivedAmount ??
                record.form?.paidAmount ??
                (paymentType === "Cash" && record.status !== "Unpaid"
                  ? totalAmt
                  : 0)
            );
            const balanceDue =
              record.totals?.balance !== undefined
                ? Number(record.totals.balance)
                : record.balanceAmount !== undefined
                ? Number(record.balanceAmount)
                : Math.max(0, totalAmt - receivedAmt);

            const rawRows =
              Array.isArray(record.rows) && record.rows.length > 0
                ? record.rows
                : Array.isArray(record.items) && record.items.length > 0
                ? record.items
                : [];
            const validRows = rawRows.filter(
              (r) =>
                r && (r.item || r.itemName || r.name || r.qty || r.quantity)
            );
            const hasAnyDiscount = validRows.some(
              (r) =>
                Number(r.discount || r.discountAmount || r.discountPercent || 0) >
                0
            );

            let subTableHtml = "";
            if (validRows.length > 0) {
              const itemRowsHtml = validRows
                .map((r, rIdx) => {
                  const name = r.item || r.itemName || r.name || "—";
                  const hsn = r.hsn || r.hsnSac || r.hsnCode || "";
                  const qty = Number(r.qty ?? r.quantity ?? 1);
                  const unit = r.unit || "PCS";
                  const price = Number(
                    r.price ?? r.rate ?? r.salePrice ?? r.unitPrice ?? 0
                  );
                  const rowTotal = Number(
                    r.amount ??
                      r.total ??
                      (r.calculated?.amount ?? qty * price)
                  );

                  let discountStr = "";
                  const dVal = Number(r.discount || r.discountAmount || 0);
                  const dPct = Number(r.discountPercent || 0);
                  if (dVal > 0 && dPct > 0)
                    discountStr = `₹ ${dVal.toFixed(2)} (${dPct}%)`;
                  else if (dVal > 0) discountStr = `₹ ${dVal.toFixed(2)}`;
                  else if (dPct > 0) discountStr = `${dPct}%`;

                  return `<tr>
              <td style="padding:4px 6px;text-align:center;color:#64748b;border-bottom:1px solid #e2e8f0;width:6%;">${
                rIdx + 1
              }</td>
              <td style="padding:4px 6px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;width:${
                hasAnyDiscount ? "32%" : "38%"
              };">${escapeHtml(name)}</td>
              <td style="padding:4px 6px;color:#64748b;border-bottom:1px solid #e2e8f0;width:14%;">${escapeHtml(
                hsn
              )}</td>
              <td style="padding:4px 6px;text-align:center;font-weight:500;border-bottom:1px solid #e2e8f0;width:10%;">${qty}</td>
              <td style="padding:4px 6px;color:#475569;border-bottom:1px solid #e2e8f0;width:8%;">${escapeHtml(
                unit
              )}</td>
              <td style="padding:4px 6px;text-align:right;border-bottom:1px solid #e2e8f0;width:12%;">${fmtMoney(
                price
              )}</td>
              ${
                hasAnyDiscount
                  ? `<td style="padding:4px 6px;text-align:right;color:#475569;border-bottom:1px solid #e2e8f0;width:14%;">${
                      discountStr || "—"
                    }</td>`
                  : ""
              }
              <td style="padding:4px 6px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;width:${
                hasAnyDiscount ? "14%" : "22%"
              };">${fmtMoney(rowTotal)}</td>
            </tr>`;
                })
                .join("");

              const totalQty = validRows.reduce(
                (sum, r) => sum + Number(r.qty ?? r.quantity ?? 0),
                0
              );
              const totalDisc = validRows.reduce(
                (sum, r) => sum + Number(r.discount || r.discountAmount || 0),
                0
              );
              const totalRowAmt = validRows.reduce(
                (sum, r) =>
                  sum +
                  Number(
                    r.amount ??
                      r.total ??
                      (Number(r.qty || 1) * Number(r.price || 0))
                  ),
                0
              );

              subTableHtml = `<tr>
            <td colspan="8" style="padding:2px 10px 10px 10px;background:#ffffff;border-bottom:1px solid #cbd5e1;">
              <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;margin-top:2px;">
                <table style="width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;">
                  <thead>
                    <tr style="background:#e2e8f0;color:#1e293b;font-weight:700;border-bottom:1px solid #cbd5e1;">
                      <th style="width:6%;padding:5px 6px;text-align:center;">#</th>
                      <th style="width:${
                        hasAnyDiscount ? "32%" : "38%"
                      };padding:5px 6px;text-align:left;">Item name</th>
                      <th style="width:14%;padding:5px 6px;text-align:left;">HSN/SAC</th>
                      <th style="width:10%;padding:5px 6px;text-align:center;">Quantity</th>
                      <th style="width:8%;padding:5px 6px;text-align:left;">Unit</th>
                      <th style="width:12%;padding:5px 6px;text-align:right;">Price/Unit</th>
                      ${
                        hasAnyDiscount
                          ? `<th style="width:14%;padding:5px 6px;text-align:right;">Discount</th>`
                          : ""
                      }
                      <th style="width:${
                        hasAnyDiscount ? "14%" : "22%"
                      };padding:5px 6px;text-align:right;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemRowsHtml}
                    <tr style="background:#eef2f6;font-weight:700;border-top:1px solid #cbd5e1;">
                      <td colspan="3" style="padding:5px 6px;">Total</td>
                      <td style="padding:5px 6px;text-align:center;">${totalQty}</td>
                      <td></td>
                      <td></td>
                      ${
                        hasAnyDiscount
                          ? `<td style="padding:5px 6px;text-align:right;">${fmtMoney(
                              totalDisc
                            )}</td>`
                          : ""
                      }
                      <td style="padding:5px 6px;text-align:right;">${fmtMoney(
                        totalRowAmt
                      )}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>`;
            }

            return `<tr style="background:${
              index % 2 === 0 ? "#ffffff" : "#f8fafc"
            };font-size:11px;border-top:1px solid #cbd5e1;">
          <td style="padding:7px 6px;font-weight:600;white-space:nowrap;width:13%;text-align:left;">${escapeHtml(
            displayDate
          )}</td>
          <td style="padding:7px 6px;font-weight:700;color:#0f172a;white-space:nowrap;width:13%;text-align:left;">${escapeHtml(
            invNumber
          )}</td>
          <td style="padding:7px 6px;font-weight:600;color:#0f172a;width:22%;text-align:left;">${escapeHtml(
            partyName
          )}</td>
          <td style="padding:7px 6px;color:#64748b;width:12%;text-align:left;">${escapeHtml(
            partyGstin || "—"
          )}</td>
          <td style="padding:7px 6px;text-align:right;font-weight:700;color:#0f172a;white-space:nowrap;width:11%;">${fmtMoney(
            totalAmt
          )}</td>
          <td style="padding:7px 6px;text-align:center;color:#334155;white-space:nowrap;width:9%;">${escapeHtml(
            paymentType
          )}</td>
          <td style="padding:7px 6px;text-align:right;font-weight:600;color:#1e293b;white-space:nowrap;width:10%;">${fmtMoney(
            receivedAmt
          )}</td>
          <td style="padding:7px 6px;text-align:right;font-weight:700;color:#0f172a;white-space:nowrap;width:10%;">${fmtMoney(
            balanceDue
          )}</td>
        </tr>${subTableHtml}`;
          })
          .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-actions {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 20px;
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
    }
    .print-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 16px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid ${themeColor};
      color: ${themeColor};
      background: #ffffff;
    }
    .print-btn-primary {
      background: ${themeColor} !important;
      color: #ffffff !important;
    }
    @media print {
      .print-actions { display: none !important; }
      body { padding: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="print-btn print-btn-primary" onclick="window.print()">
      🖨️ Print / Save as PDF
    </button>
    <button class="print-btn" onclick="window.close()">
      ✕ Close
    </button>
  </div>

  <div style="max-width:820px;margin:0 auto;padding:24px;">
    <!-- Company Header -->
    <div style="text-align:center;margin-bottom:18px;">
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">${escapeHtml(
        companyName
      )}</h1>
      ${
        phone
          ? `<p style="margin:3px 0 0 0;font-size:11px;color:#64748b;">Phone no.: ${escapeHtml(
              phone
            )}</p>`
          : ""
      }
      ${
        email
          ? `<p style="margin:1px 0 0 0;font-size:11px;color:#64748b;">Email: ${escapeHtml(
              email
            )}</p>`
          : ""
      }
      ${
        gstin
          ? `<p style="margin:1px 0 0 0;font-size:11px;color:#64748b;">GSTIN: ${escapeHtml(
              gstin
            )}</p>`
          : ""
      }
      <h2 style="margin:12px 0 0 0;font-size:18px;font-weight:800;color:#0f172a;text-decoration:underline;text-underline-offset:4px;">${escapeHtml(
        title
      )}</h2>
    </div>

    <!-- Metadata: Duration -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:11px;font-weight:700;color:#334155;border-bottom:1px solid #cbd5e1;padding-bottom:8px;">
      <div>Duration: <span style="font-weight:600;">${escapeHtml(
        durationStr
      )}</span></div>
    </div>

    <!-- Main Table -->
    <table style="width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed;">
      <thead>
        <tr style="background:${themeColor};color:#ffffff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">
          <th style="width:13%;padding:8px 6px;text-align:left;border:none;">Date</th>
          <th style="width:13%;padding:8px 6px;text-align:left;border:none;">Invoice No.</th>
          <th style="width:22%;padding:8px 6px;text-align:left;border:none;">Party Name</th>
          <th style="width:12%;padding:8px 6px;text-align:left;border:none;">GSTIN</th>
          <th style="width:11%;padding:8px 6px;text-align:right;border:none;">Total</th>
          <th style="width:9%;padding:8px 6px;text-align:center;border:none;">Payment Type</th>
          <th style="width:10%;padding:8px 6px;text-align:right;border:none;">Received / Paid</th>
          <th style="width:10%;padding:8px 6px;text-align:right;border:none;">Balance Due</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Bottom Totals & Timestamp -->
    <div style="margin-top:24px;padding-top:14px;border-top:2px solid #cbd5e1;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:11px;color:#64748b;font-weight:500;">
        ${escapeHtml(timestampStr)}
      </div>
      <div style="text-align:right;">
        <span style="font-size:18px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">
          ${escapeHtml(totalLabel)} ${fmtMoney(calculatedTotal)}
        </span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Prints the document HTML via an isolated hidden iframe.
 * Ensures the print engine gets clean, unclipped, perfectly aligned A4 pages.
 */
function printReportDocument(html) {
  let iframe = document.getElementById("report-print-hidden-iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "report-print-hidden-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    openReportInNewTab(html);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      openReportInNewTab(html);
    }
  }, 350);
}

function openReportInNewTab(html) {
  const win = window.open("", "_blank");
  if (!win) {
    toast.warning("Please allow pop-ups to open the PDF report tab.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function downloadBlobFile(blob, filename = "Report.pdf") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

function hexToRgb(hex) {
  const c = String(hex || "#881337").replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16) || 136,
    parseInt(c.substring(2, 4), 16) || 19,
    parseInt(c.substring(4, 6), 16) || 55,
  ];
}

const fmtPdfMoney = (val) =>
  `Rs. ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Renders the report data directly to a multi-page vector A4 PDF using jsPDF.
 * 100% reliable, runs instantly, and never fails due to CSS oklch colors or DOM canvas limits.
 */
export function generateReportPdfBlob({
  title = "Purchase Bills Report",
  companyName = "USV Test Trade",
  phone = "",
  email = "",
  gstin = "",
  durationStr = "All Dates",
  user = "All Users",
  records = [],
  totalLabel = "Total Purchase:",
  calculatedTotal = 0,
  timestampStr = "",
  themeColor = "#881337",
  filename = "Purchase_Bills_Report.pdf",
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const [tr, tg, tb] = hexToRgb(themeColor);

  const drawHeader = (isFirstPage = false) => {
    let currentY = 12;
    if (isFirstPage) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text(companyName, pageWidth / 2, currentY, { align: "center" });
      currentY += 4.5;

      const metaParts = [];
      if (phone) metaParts.push(`Phone: ${phone}`);
      if (email) metaParts.push(`Email: ${email}`);
      if (gstin) metaParts.push(`GSTIN: ${gstin}`);
      if (metaParts.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(metaParts.join(" | "), pageWidth / 2, currentY, {
          align: "center",
        });
        currentY += 4.5;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.setTextColor(15, 23, 42);
      doc.text(title, pageWidth / 2, currentY, { align: "center" });
      currentY += 5.5;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 65, 85);
      doc.text(`Duration: ${durationStr}`, margin, currentY);
      currentY += 2;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 2;
    } else {
      currentY = 12;
    }

    // Table header bar
    doc.setFillColor(tr, tg, tb);
    doc.rect(margin, currentY, contentWidth, 6.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");

    doc.text("DATE", margin + 2, currentY + 4.5);
    doc.text("INVOICE NO.", margin + 24, currentY + 4.5);
    doc.text("PARTY NAME", margin + 48, currentY + 4.5);
    doc.text("GSTIN", margin + 94, currentY + 4.5);
    doc.text("TOTAL", margin + 126, currentY + 4.5, { align: "right" });
    doc.text("PAYMENT", margin + 140, currentY + 4.5, { align: "center" });
    doc.text("RECEIVED / PAID", margin + 166, currentY + 4.5, { align: "right" });
    doc.text("BALANCE DUE", margin + 188, currentY + 4.5, { align: "right" });

    return currentY + 6.5;
  };

  let y = drawHeader(true);

  if (records.length === 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(
      "No transactions found for the selected period",
      pageWidth / 2,
      y + 10,
      { align: "center" }
    );
    y += 18;
  } else {
    records.forEach((record, index) => {
      const rawDate =
        record.form?.invoiceDate ||
        record.form?.billDate ||
        record.invoiceDate ||
        record.date ||
        record.createdAt;
      const displayDate = formatDateDMY(rawDate);
      const invNumber = String(
        record.form?.invoiceNumber ||
          record.invoiceNumber ||
          record.invoiceNo ||
          record.invoice ||
          record.refNo ||
          record.number ||
          record.id ||
          "—"
      );
      const partyName = String(
        record.form?.customer ||
          record.form?.party ||
          record.customer ||
          record.customerName ||
          record.partyName ||
          record.supplier ||
          record.party ||
          (title.toLowerCase().includes("purchase")
            ? "Cash Purchase"
            : "Cash Sale")
      );
      const partyGstin = String(
        record.form?.gstin || record.partyGstin || record.gstin || "—"
      );
      const paymentType = String(
        record.form?.paymentType ||
          record.paymentType ||
          (record.purchaseType === "cash" ? "Cash" : "Credit")
      );

      const totalAmt = Number(
        record.totals?.finalTotal ??
          record.totals?.grandTotal ??
          record.totalAmount ??
          record.total ??
          record.amount ??
          0
      );
      const receivedAmt = Number(
        record.totals?.received ??
          record.totals?.paid ??
          record.paidAmount ??
          record.receivedAmount ??
          record.form?.receivedAmount ??
          record.form?.paidAmount ??
          (paymentType === "Cash" && record.status !== "Unpaid" ? totalAmt : 0)
      );
      const balanceDue =
        record.totals?.balance !== undefined
          ? Number(record.totals.balance)
          : record.balanceAmount !== undefined
          ? Number(record.balanceAmount)
          : Math.max(0, totalAmt - receivedAmt);

      const rawRows =
        Array.isArray(record.rows) && record.rows.length > 0
          ? record.rows
          : Array.isArray(record.items) && record.items.length > 0
          ? record.items
          : [];
      const validRows = rawRows.filter(
        (r) => r && (r.item || r.itemName || r.name || r.qty || r.quantity)
      );

      const requiredHeight =
        6.5 + (validRows.length > 0 ? (validRows.length + 2) * 4 + 4 : 0);
      if (y + requiredHeight > pageHeight - 18) {
        doc.addPage();
        y = drawHeader(false);
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);

      doc.text(displayDate, margin + 2, y + 4.2);
      doc.setFont("helvetica", "bold");
      doc.text(invNumber.slice(0, 14), margin + 24, y + 4.2);
      doc.setFont("helvetica", "normal");
      doc.text(partyName.slice(0, 24), margin + 48, y + 4.2);
      doc.setTextColor(100, 116, 139);
      doc.text(partyGstin.slice(0, 16), margin + 94, y + 4.2);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(fmtPdfMoney(totalAmt), margin + 126, y + 4.2, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(paymentType.slice(0, 10), margin + 140, y + 4.2, {
        align: "center",
      });
      doc.text(fmtPdfMoney(receivedAmt), margin + 166, y + 4.2, {
        align: "right",
      });
      doc.setFont("helvetica", "bold");
      doc.text(fmtPdfMoney(balanceDue), margin + 188, y + 4.2, {
        align: "right",
      });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 6, pageWidth - margin, y + 6);
      y += 6;

      if (validRows.length > 0) {
        const subX = margin + 4;
        const subW = contentWidth - 8;
        const subHeaderH = 4.5;
        const subRowH = 4;
        const subTotalH = 4.5;
        const subBoxH = subHeaderH + validRows.length * subRowH + subTotalH;

        doc.setFillColor(241, 245, 249);
        doc.rect(subX, y + 1, subW, subHeaderH, "F");

        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);

        doc.text("#", subX + 2, y + 4);
        doc.text("Item name", subX + 8, y + 4);
        doc.text("HSN/SAC", subX + 65, y + 4);
        doc.text("Quantity", subX + 95, y + 4, { align: "center" });
        doc.text("Unit", subX + 115, y + 4);
        doc.text("Price/Unit", subX + 140, y + 4, { align: "right" });
        doc.text("Amount", subX + subW - 2, y + 4, { align: "right" });

        let subY = y + 1 + subHeaderH;
        validRows.forEach((row, rIdx) => {
          const name = String(row.item || row.itemName || row.name || "—");
          const hsn = String(row.hsn || row.hsnSac || row.hsnCode || "—");
          const qty = String(row.qty ?? row.quantity ?? 1);
          const unit = String(row.unit || "PCS");
          const price = Number(
            row.price ?? row.rate ?? row.salePrice ?? row.unitPrice ?? 0
          );
          const rowTotal = Number(
            row.amount ?? row.total ?? Number(qty) * price
          );

          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
          doc.text(String(rIdx + 1), subX + 2, subY + 3);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(15, 23, 42);
          doc.text(name.slice(0, 32), subX + 8, subY + 3);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 116, 139);
          doc.text(hsn.slice(0, 14), subX + 65, subY + 3);
          doc.setTextColor(15, 23, 42);
          doc.text(qty, subX + 95, subY + 3, { align: "center" });
          doc.text(unit, subX + 115, subY + 3);
          doc.text(fmtPdfMoney(price), subX + 140, subY + 3, {
            align: "right",
          });
          doc.setFont("helvetica", "bold");
          doc.text(fmtPdfMoney(rowTotal), subX + subW - 2, subY + 3, {
            align: "right",
          });

          doc.setDrawColor(241, 245, 249);
          doc.line(subX, subY + subRowH, subX + subW, subY + subRowH);
          subY += subRowH;
        });

        doc.setFillColor(248, 250, 252);
        doc.rect(subX, subY, subW, subTotalH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(15, 23, 42);
        doc.text("Total", subX + 8, subY + 3.2);

        const totalQty = validRows.reduce(
          (s, r) => s + Number(r.qty ?? r.quantity ?? 0),
          0
        );
        const totalRowAmt = validRows.reduce(
          (s, r) =>
            s +
            Number(
              r.amount ??
                r.total ??
                Number(r.qty || 1) * Number(r.price || 0)
            ),
          0
        );
        doc.text(String(totalQty), subX + 95, subY + 3.2, { align: "center" });
        doc.text(fmtPdfMoney(totalRowAmt), subX + subW - 2, subY + 3.2, {
          align: "right",
        });

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.rect(subX, y + 1, subW, subBoxH);
        y = subY + subTotalH + 2;
      }
    });
  }

  if (y + 14 > pageHeight - 15) {
    doc.addPage();
    y = 15;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(margin, y + 2, pageWidth - margin, y + 2);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    timestampStr || `Generated on ${new Date().toLocaleDateString()}`,
    margin,
    y + 7
  );

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${totalLabel} ${fmtPdfMoney(calculatedTotal)}`,
    pageWidth - margin,
    y + 7,
    { align: "right" }
  );

  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  return {
    doc,
    pdf: doc,
    blob,
    file,
    url,
    save: (customName) => doc.save(customName || filename),
  };
}

export default function ReportPrintPreviewModal({
  isOpen,
  onClose,
  title = "Sale Report",
  dateFrom,
  dateTo,
  user = "All Users",
  records = [],
  rows = [],
  columns,
  subtitle,
  totalLabel,
  totalAmount,
  printOnOpen = false,
}) {
  const navigate = useNavigate();
  const company = useMemo(() => getEffectiveCompanyInfo(), [isOpen]);
  const companyProfile = useMemo(() => getCompanyProfile(), [isOpen]);
  const senderEmail = (
    companyProfile.emailId ||
    companyProfile.email ||
    company.email ||
    ""
  ).trim();

  const companyName = company.name || "USV Test Trade";
  const phone = company.phone || "";
  const themeColor = company.themeColor || "#881337";

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [gmailGuidanceOpen, setGmailGuidanceOpen] = useState(false);
  const [lastGmailUrl, setLastGmailUrl] = useState("");

  const pdfFileName = `${(title || "Report").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

  const durationStr =
    !dateFrom && !dateTo
      ? "All Dates"
      : dateFrom && dateTo
      ? `From ${formatDateDMY(dateFrom)} to ${formatDateDMY(dateTo)}`
      : dateFrom
      ? `From ${formatDateDMY(dateFrom)}`
      : `Up to ${formatDateDMY(dateTo)}`;

  const effectiveRecords =
    Array.isArray(records) && records.length > 0
      ? records
      : Array.isArray(rows) && rows.length > 0
      ? rows
      : [];

  const isPurchase = title.toLowerCase().includes("purchase");
  const isExpense = title.toLowerCase().includes("expense");
  const resolvedTotalLabel =
    totalLabel ||
    (isPurchase
      ? "Total Purchase:"
      : isExpense
      ? "Total Expenses:"
      : "Total Sale:");

  const parseNum = (v) => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return v;
    const n = parseFloat(String(v).replace(/[^0-9.-]+/g, ""));
    return Number.isNaN(n) ? 0 : n;
  };

  const calculatedTotal =
    totalAmount !== undefined
      ? Number(totalAmount)
      : effectiveRecords.reduce(
          (sum, r) =>
            sum +
            parseNum(
              r.totals?.finalTotal ??
                r.totals?.grandTotal ??
                r.totalAmount ??
                r.total ??
                r.amount
            ),
          0
        );

  const timestampStr = formatGeneratedTimestamp();

  // Keep default email subject in sync with report details
  useEffect(() => {
    if (emailModalOpen) {
      setEmailSubject(`[${companyName}] ${title} (${durationStr})`);
    }
  }, [emailModalOpen, companyName, title, durationStr]);

  const getReportHtmlString = () =>
    buildReportHtml({
      title,
      companyName,
      phone,
      email: senderEmail,
      address: company.address,
      gstin: company.gstin,
      durationStr,
      user,
      records: effectiveRecords,
      totalLabel: resolvedTotalLabel,
      calculatedTotal,
      timestampStr,
      themeColor,
    });

  const handlePrint = () => {
    printReportDocument(getReportHtmlString());
  };

  const getReportPdfDocument = () =>
    generateReportPdfBlob({
      title,
      companyName,
      phone,
      email: senderEmail,
      gstin: company.gstin,
      durationStr,
      user,
      records: effectiveRecords,
      totalLabel: resolvedTotalLabel,
      calculatedTotal,
      timestampStr,
      themeColor,
      filename: pdfFileName,
    });

  const handleOpenPdf = () => {
    try {
      const result = getReportPdfDocument();
      const win = window.open(result.url, "_blank");
      if (!win) {
        downloadBlobFile(result.blob, pdfFileName);
        toast.info(
          `Pop-ups blocked. ${pdfFileName} has been downloaded instead.`
        );
      }
    } catch (err) {
      console.error("Open PDF error:", err);
      toast.error("Could not generate PDF view.");
    }
  };

  const handleSavePdf = () => {
    try {
      const result = getReportPdfDocument();
      result.save();
      toast.success(`✓ ${pdfFileName} saved to your computer!`);
    } catch (err) {
      console.error("Save PDF error:", err);
      toast.error("Direct PDF download failed. Opening print dialog...");
      handlePrint();
    }
  };

  // Keyboard and print on open triggers
  useEffect(() => {
    if (!isOpen || !printOnOpen) return undefined;
    const timer = setTimeout(() => handlePrint(), 350);
    return () => clearTimeout(timer);
  }, [isOpen, printOnOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (gmailGuidanceOpen) {
          setGmailGuidanceOpen(false);
          setEmailModalOpen(false);
        } else if (emailModalOpen) {
          setEmailModalOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, emailModalOpen, gmailGuidanceOpen, onClose]);

  if (!isOpen) return null;

  // Builds formatted email message body with clear summary and attached file note
  const buildEmailBody = (channel = "gmail") => {
    const totalPaid = effectiveRecords.reduce(
      (sum, r) => sum + parseNum(r.paidAmount ?? r.totals?.received ?? 0),
      0
    );
    const totalBalance = Math.max(0, calculatedTotal - totalPaid);

    if (channel === "gmail") {
      return `Dear Customer / Partner,

Please review the ${title} details below from ${companyName}.

==================================================
${title.toUpperCase()}
Company: ${companyName}
Period: ${durationStr}
Generated: ${timestampStr}
==================================================

REPORT SUMMARY:
• Total Invoices: ${effectiveRecords.length}
• ${resolvedTotalLabel} ${fmtMoney(calculatedTotal)}
• Total Paid: ${fmtMoney(totalPaid)}
• Total Balance Due: ${fmtMoney(totalBalance)}

==================================================
REPORT DOCUMENT:
${pdfFileName}

Thank you,
${companyName}
${phone ? `Phone: ${phone}\n` : ""}${senderEmail ? `Email: ${senderEmail}\n` : ""}`;
    }

    return `Dear Customer / Partner,

Please find attached the ${title} (PDF) from ${companyName}.

==================================================
${title.toUpperCase()}
Company: ${companyName}
Period: ${durationStr}
Generated: ${timestampStr}
==================================================

REPORT SUMMARY:
• Total Invoices: ${effectiveRecords.length}
• ${resolvedTotalLabel} ${fmtMoney(calculatedTotal)}
• Total Paid: ${fmtMoney(totalPaid)}
• Total Balance Due: ${fmtMoney(totalBalance)}

ATTACHED DOCUMENT:
📎 ${pdfFileName}

Thank you,
${companyName}
${phone ? `Phone: ${phone}\n` : ""}${senderEmail ? `Email: ${senderEmail}\n` : ""}`;
  };

  const handleSendViaEmailApp = async () => {
    const cleanTo = emailInput.trim();
    if (!cleanTo || !cleanTo.includes("@") || !cleanTo.includes(".")) {
      toast.error("Please enter a valid recipient email address.");
      return;
    }

    if (!senderEmail) {
      toast.error(
        "Please add your business email in the Company Profile first."
      );
      return;
    }

    setIsSendingEmail(true);
    try {
      const result = getReportPdfDocument();

      // Always download a copy directly so user has the PDF file
      downloadBlobFile(result.blob, pdfFileName);

      const subject =
        emailSubject.trim() || `[${companyName}] ${title} (${durationStr})`;
      const body = buildEmailBody("app");

      // Check if Web Share API supports file attachments (Windows Mail / Outlook)
      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [result.file] })
      ) {
        try {
          await navigator.share({
            title: subject,
            text: body,
            files: [result.file],
          });
          toast.success(
            `✓ ${pdfFileName} attached and opened in Mail App!`,
            { duration: 6000 }
          );
          setEmailModalOpen(false);
          return;
        } catch (shareErr) {
          if (shareErr.name === "AbortError") {
            // User dismissed the share flyout
            return;
          }
          console.warn(
            "navigator.share failed, using mailto fallback:",
            shareErr
          );
        }
      }

      // Fallback: mailto link
      const mailtoUrl = `mailto:${encodeURIComponent(
        cleanTo
      )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        body
      )}`;
      window.location.href = mailtoUrl;

      toast.success(
        `✓ ${pdfFileName} downloaded to your PC & Mail App opened for ${cleanTo}!`,
        { duration: 8000 }
      );
      setEmailModalOpen(false);
    } catch (err) {
      console.error("Email send error:", err);
      toast.error("Failed to generate PDF for email.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendViaGmail = () => {
    const cleanTo = emailInput.trim();
    if (!cleanTo || !cleanTo.includes("@") || !cleanTo.includes(".")) {
      toast.error("Please enter a valid recipient email address.");
      return;
    }

    if (!senderEmail) {
      toast.error(
        "Please add your business email in the Company Profile first."
      );
      return;
    }

    try {
      const result = getReportPdfDocument();

      // Automatically download the real PDF to user's computer
      downloadBlobFile(result.blob, pdfFileName);

      const subject =
        emailSubject.trim() || `[${companyName}] ${title} (${durationStr})`;
      const body = buildEmailBody("gmail");

      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        cleanTo
      )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      const win = window.open(gmailUrl, "_blank");
      if (!win) {
        window.location.href = `mailto:${encodeURIComponent(
          cleanTo
        )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
          body
        )}`;
      }

      setLastGmailUrl(gmailUrl);

      toast.success(
        `✓ ${pdfFileName} downloaded! Please attach this downloaded file before sending in Gmail.`,
        { duration: 15000 }
      );

      // Open guidance screen with step-by-step instructions
      setGmailGuidanceOpen(true);
    } catch (err) {
      console.error("Gmail error:", err);
      toast.error("Failed to generate PDF for Gmail.");
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-[1px]">
      <div className="relative flex max-h-[95vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3.5 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Preview
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {effectiveRecords.length} record
              {effectiveRecords.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scrollable Printable Document */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white font-sans text-slate-900 text-sm">
          <div id="report-printable-area" className="mx-auto w-full max-w-4xl">
            {/* Header: Company & Title */}
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-slate-950 tracking-tight">
                {companyName}
              </h1>
              {phone && (
                <p className="text-xs text-slate-600 mt-0.5">Phone no.: {phone}</p>
              )}
              {senderEmail && (
                <p className="text-xs text-slate-600 mt-0.5">Email: {senderEmail}</p>
              )}
              <h2 className="text-2xl font-bold text-slate-950 underline underline-offset-4 mt-3">
                {title}
              </h2>
            </div>

            {/* Metadata: Duration */}
            <div className="mb-4 text-xs font-bold text-slate-900 space-y-1">
              <div>
                Duration: <span className="font-semibold">{durationStr}</span>
              </div>
            </div>

            {/* Main Table */}
            <div className="w-full overflow-x-auto border-t border-slate-200">
              <table className="w-full border-collapse text-left text-xs table-fixed">
                <thead>
                  <tr
                    style={{ backgroundColor: themeColor, color: "#ffffff" }}
                    className="font-bold uppercase text-[11px] tracking-wider"
                  >
                    <th style={{ width: "13%" }} className="py-2.5 px-3 text-left">
                      DATE
                    </th>
                    <th style={{ width: "13%" }} className="py-2.5 px-2 text-left">
                      INVOICE NO.
                    </th>
                    <th style={{ width: "22%" }} className="py-2.5 px-3 text-left">
                      PARTY NAME
                    </th>
                    <th style={{ width: "12%" }} className="py-2.5 px-2 text-left">
                      GSTIN
                    </th>
                    <th style={{ width: "11%" }} className="py-2.5 px-3 text-right">
                      TOTAL
                    </th>
                    <th style={{ width: "9%" }} className="py-2.5 px-3 text-center">
                      PAYMENT TYPE
                    </th>
                    <th style={{ width: "10%" }} className="py-2.5 px-3 text-right">
                      RECEIVED / PAID
                    </th>
                    <th style={{ width: "10%" }} className="py-2.5 px-3 text-right">
                      BALANCE DUE
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {effectiveRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-8 text-center text-slate-400 font-medium"
                      >
                        No transactions found for the selected period
                      </td>
                    </tr>
                  ) : (
                    effectiveRecords.map((record, index) => {
                      const rawDate =
                        record.form?.invoiceDate ||
                        record.form?.billDate ||
                        record.invoiceDate ||
                        record.date ||
                        record.createdAt;
                      const displayDate = formatDateDMY(rawDate);
                      const invNumber =
                        record.form?.invoiceNumber ||
                        record.invoiceNumber ||
                        record.invoiceNo ||
                        record.invoice ||
                        record.refNo ||
                        record.number ||
                        record.id ||
                        "—";
                      const partyName =
                        record.form?.customer ||
                        record.form?.party ||
                        record.customer ||
                        record.customerName ||
                        record.partyName ||
                        record.supplier ||
                        record.party ||
                        (isPurchase ? "Cash Purchase" : "Cash Sale");
                      const gstin =
                        record.form?.gstin || record.partyGstin || record.gstin || "";
                      const paymentType =
                        record.form?.paymentType ||
                        record.paymentType ||
                        (record.saleType === "cash" ||
                        record.purchaseType === "cash"
                          ? "Cash"
                          : "Credit");

                      const totalAmt = parseNum(
                        record.totals?.finalTotal ??
                          record.totals?.grandTotal ??
                          record.totalAmount ??
                          record.total ??
                          record.amount
                      );
                      const receivedAmt =
                        record.totals?.received !== undefined
                          ? parseNum(record.totals.received)
                          : record.totals?.paid !== undefined
                          ? parseNum(record.totals.paid)
                          : record.paidAmount !== undefined
                          ? parseNum(record.paidAmount)
                          : record.receivedAmount !== undefined
                          ? parseNum(record.receivedAmount)
                          : record.form?.receivedAmount !== undefined
                          ? parseNum(record.form.receivedAmount)
                          : record.form?.paidAmount !== undefined
                          ? parseNum(record.form.paidAmount)
                          : paymentType === "Cash" && record.status !== "Unpaid"
                          ? totalAmt
                          : 0;

                      const balanceDue =
                        record.totals?.balance !== undefined
                          ? parseNum(record.totals.balance)
                          : record.balanceAmount !== undefined
                          ? parseNum(record.balanceAmount)
                          : Math.max(0, totalAmt - receivedAmt);

                      // Extract line items
                      const rawRows =
                        Array.isArray(record.rows) && record.rows.length > 0
                          ? record.rows
                          : Array.isArray(record.items) && record.items.length > 0
                          ? record.items
                          : [];
                      const validRows = rawRows.filter(
                        (row) =>
                          row &&
                          (row.item ||
                            row.itemName ||
                            row.name ||
                            row.qty ||
                            row.quantity)
                      );

                      const hasAnyDiscount = validRows.some(
                        (r) =>
                          Number(
                            r.discount ||
                              r.discountAmount ||
                              r.discountPercent ||
                              0
                          ) > 0
                      );

                      const subTotal = Number(
                        record.totals?.subtotal ??
                          record.totals?.subTotal ??
                          totalAmt
                      );
                      const roundOff =
                        record.totals?.roundOff ?? record.totals?.roundoff;

                      return (
                        <React.Fragment key={record.id || index}>
                          {/* Invoice Summary Row */}
                          <tr className="bg-white hover:bg-slate-50/50 font-medium text-slate-900 border-t border-slate-300">
                            <td
                              style={{ width: "13%" }}
                              className="py-2.5 px-3 whitespace-nowrap font-semibold text-left"
                            >
                              {displayDate}
                            </td>
                            <td
                              style={{ width: "13%" }}
                              className="py-2.5 px-2 whitespace-nowrap font-bold text-slate-900 text-left"
                            >
                              {invNumber}
                            </td>
                            <td
                              style={{ width: "22%" }}
                              className="py-2.5 px-3 font-semibold text-slate-950 text-left truncate"
                            >
                              {partyName}
                            </td>
                            <td
                              style={{ width: "12%" }}
                              className="py-2.5 px-2 text-slate-500 text-left truncate"
                            >
                              {gstin || "—"}
                            </td>
                            <td
                              style={{ width: "11%" }}
                              className="py-2.5 px-3 text-right font-bold text-slate-950 whitespace-nowrap"
                            >
                              {fmtMoney(totalAmt)}
                            </td>
                            <td
                              style={{ width: "9%" }}
                              className="py-2.5 px-3 text-center text-slate-800 whitespace-nowrap"
                            >
                              {paymentType}
                            </td>
                            <td
                              style={{ width: "10%" }}
                              className="py-2.5 px-3 text-right font-semibold text-slate-900 whitespace-nowrap"
                            >
                              {fmtMoney(receivedAmt)}
                            </td>
                            <td
                              style={{ width: "10%" }}
                              className="py-2.5 px-3 text-right font-bold text-slate-950 whitespace-nowrap"
                            >
                              {fmtMoney(balanceDue)}
                            </td>
                          </tr>

                          {/* Nested Items Sub-Table */}
                          {validRows.length > 0 && (
                            <tr className="bg-white">
                              <td colSpan={8} className="py-1 px-3 sm:px-6">
                                <div className="my-1 rounded border border-slate-200 overflow-hidden bg-slate-50/40">
                                  <table className="w-full border-collapse text-[11px] text-slate-800 table-fixed">
                                    <thead>
                                      <tr className="bg-[#e2e8f0] text-slate-800 font-bold border-b border-slate-300">
                                        <th
                                          style={{ width: "6%" }}
                                          className="py-1.5 px-2.5 text-center"
                                        >
                                          #
                                        </th>
                                        <th
                                          style={{
                                            width: hasAnyDiscount
                                              ? "32%"
                                              : "38%",
                                          }}
                                          className="py-1.5 px-3 text-left"
                                        >
                                          Item name
                                        </th>
                                        <th
                                          style={{ width: "14%" }}
                                          className="py-1.5 px-2 text-left"
                                        >
                                          HSN/ SAC
                                        </th>
                                        <th
                                          style={{ width: "10%" }}
                                          className="py-1.5 px-3 text-center"
                                        >
                                          Quantity
                                        </th>
                                        <th
                                          style={{ width: "8%" }}
                                          className="py-1.5 px-2 text-left"
                                        >
                                          Unit
                                        </th>
                                        <th
                                          style={{ width: "12%" }}
                                          className="py-1.5 px-3 text-right"
                                        >
                                          Price/ Unit
                                        </th>
                                        {hasAnyDiscount && (
                                          <th
                                            style={{ width: "14%" }}
                                            className="py-1.5 px-3 text-right"
                                          >
                                            Discount
                                          </th>
                                        )}
                                        <th
                                          style={{
                                            width: hasAnyDiscount
                                              ? "14%"
                                              : "22%",
                                          }}
                                          className="py-1.5 px-3 text-right"
                                        >
                                          Amount
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 bg-white">
                                      {validRows.map((row, rIdx) => {
                                        const name =
                                          row.item ||
                                          row.itemName ||
                                          row.name ||
                                          "—";
                                        const hsn =
                                          row.hsn ||
                                          row.hsnSac ||
                                          row.hsnCode ||
                                          "";
                                        const qty = Number(
                                          row.qty ?? row.quantity ?? 1
                                        );
                                        const unit = row.unit || "PCS";
                                        const price = Number(
                                          row.price ??
                                            row.rate ??
                                            row.salePrice ??
                                            row.unitPrice ??
                                            0
                                        );
                                        const rowTotal = Number(
                                          row.amount ??
                                            row.total ??
                                            (row.calculated?.amount ??
                                              qty * price)
                                        );

                                        let discountStr = "";
                                        if (hasAnyDiscount) {
                                          const dVal = Number(
                                            row.discount ||
                                              row.discountAmount ||
                                              0
                                          );
                                          const dPct = Number(
                                            row.discountPercent ||
                                              (row.discountType === "percentage"
                                                ? row.discount
                                                : 0)
                                          );
                                          if (dVal > 0 && dPct > 0) {
                                            discountStr = `₹ ${dVal.toFixed(
                                              2
                                            )} (${dPct}%)`;
                                          } else if (dVal > 0) {
                                            discountStr = `₹ ${dVal.toFixed(2)}`;
                                          } else if (dPct > 0) {
                                            discountStr = `${dPct}%`;
                                          }
                                        }

                                        return (
                                          <tr
                                            key={row.id || rIdx}
                                            className="hover:bg-slate-50"
                                          >
                                            <td
                                              style={{ width: "6%" }}
                                              className="py-1.5 px-2.5 text-center text-slate-500"
                                            >
                                              {rIdx + 1}
                                            </td>
                                            <td
                                              style={{
                                                width: hasAnyDiscount
                                                  ? "32%"
                                                  : "38%",
                                              }}
                                              className="py-1.5 px-3 font-semibold text-slate-900 text-left truncate"
                                            >
                                              {name}
                                            </td>
                                            <td
                                              style={{ width: "14%" }}
                                              className="py-1.5 px-2 text-slate-500 text-left truncate"
                                            >
                                              {hsn || "—"}
                                            </td>
                                            <td
                                              style={{ width: "10%" }}
                                              className="py-1.5 px-3 text-center font-medium"
                                            >
                                              {qty}
                                            </td>
                                            <td
                                              style={{ width: "8%" }}
                                              className="py-1.5 px-2 text-slate-600 text-left"
                                            >
                                              {unit}
                                            </td>
                                            <td
                                              style={{ width: "12%" }}
                                              className="py-1.5 px-3 text-right"
                                            >
                                              {fmtMoney(price)}
                                            </td>
                                            {hasAnyDiscount && (
                                              <td
                                                style={{ width: "14%" }}
                                                className="py-1.5 px-3 text-right text-slate-600"
                                              >
                                                {discountStr || "—"}
                                              </td>
                                            )}
                                            <td
                                              style={{
                                                width: hasAnyDiscount
                                                  ? "14%"
                                                  : "22%",
                                              }}
                                              className="py-1.5 px-3 text-right font-medium"
                                            >
                                              {fmtMoney(rowTotal)}
                                            </td>
                                          </tr>
                                        );
                                      })}

                                      {/* Sub-table Total Row */}
                                      <tr className="border-t-2 border-slate-300 font-bold bg-slate-50 text-slate-900">
                                        <td
                                          colSpan={3}
                                          className="py-1.5 px-3 text-left"
                                        >
                                          Total
                                        </td>
                                        <td className="py-1.5 px-3 text-center">
                                          {validRows.reduce(
                                            (sum, r) =>
                                              sum +
                                              Number(
                                                r.qty ?? r.quantity ?? 0
                                              ),
                                            0
                                          )}
                                        </td>
                                        <td className="py-1.5 px-2"></td>
                                        <td className="py-1.5 px-3"></td>
                                        {hasAnyDiscount && (
                                          <td className="py-1.5 px-3 text-right">
                                            {fmtMoney(
                                              validRows.reduce(
                                                (sum, r) =>
                                                  sum +
                                                  Number(
                                                    r.discount ||
                                                      r.discountAmount ||
                                                      0
                                                  ),
                                                0
                                              )
                                            )}
                                          </td>
                                        )}
                                        <td className="py-1.5 px-3 text-right">
                                          {fmtMoney(
                                            validRows.reduce(
                                              (sum, r) =>
                                                sum +
                                                Number(
                                                  r.amount ??
                                                    r.total ??
                                                    Number(r.qty || 1) *
                                                      Number(r.price || 0)
                                                ),
                                              0
                                            )
                                          )}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>

                                  {/* Sub Total & Round Off Footer Lines */}
                                  <div className="border-t border-slate-200 px-4 py-1.5 bg-slate-50 flex flex-col items-end gap-0.5 text-xs">
                                    <div className="flex justify-between gap-8 min-w-[200px] text-slate-600">
                                      <span>Sub Total</span>
                                      <span className="font-semibold text-slate-900">
                                        {fmtMoney(subTotal)}
                                      </span>
                                    </div>
                                    {roundOff !== undefined &&
                                      roundOff !== null &&
                                      Number(roundOff) !== 0 && (
                                        <div className="flex justify-between gap-8 min-w-[200px] text-slate-600">
                                          <span>Round off</span>
                                          <span className="font-semibold text-slate-900">
                                            {fmtMoney(roundOff)}
                                          </span>
                                        </div>
                                      )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Document Bottom: Grand Total & Timestamp */}
            <div className="mt-8 pt-4 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-medium order-2 sm:order-1">
                {timestampStr}
              </div>
              <div className="text-right order-1 sm:order-2">
                <span className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                  {resolvedTotalLabel} {fmtMoney(calculatedTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Pill Buttons */}
        <div className="border-t border-slate-200 bg-white px-6 py-4 flex flex-wrap items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={handleOpenPdf}
            style={{ borderColor: themeColor, color: themeColor }}
            className="rounded-full border bg-white px-5 py-2 text-sm font-semibold hover:bg-slate-50 transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="Open printable PDF document in a new browser tab"
          >
            {isGeneratingPdf ? (
              <FiLoader className="h-4 w-4 animate-spin" />
            ) : (
              <FiExternalLink className="h-4 w-4" />
            )}
            <span>Open PDF</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              backgroundColor: themeColor,
              borderColor: themeColor,
              color: "#ffffff",
            }}
            className="rounded-full border px-6 py-2 text-sm font-semibold transition shadow-xs cursor-pointer hover:opacity-95 flex items-center gap-1.5"
            title="Print report directly"
          >
            <FiPrinter className="h-4 w-4" /> Print
          </button>
          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={handleSavePdf}
            style={{ borderColor: themeColor, color: themeColor }}
            className="rounded-full border bg-white px-5 py-2 text-sm font-semibold hover:bg-slate-50 transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="Download PDF document directly to your computer"
          >
            {isGeneratingPdf ? (
              <FiLoader className="h-4 w-4 animate-spin" />
            ) : (
              <FiDownload className="h-4 w-4" />
            )}
            <span>Save PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setEmailModalOpen(true)}
            className="rounded-full border border-rose-500 bg-white px-5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition shadow-sm cursor-pointer flex items-center gap-1.5"
            title="Send report with attached PDF via email"
          >
            <FiMail className="h-4 w-4" /> Email PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-rose-600 px-7 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition shadow-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Email PDF Modal Dialog */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <FiMail className="text-rose-600 h-5 w-5" /> Send {title} via Email
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEmailModalOpen(false);
                  setGmailGuidanceOpen(false);
                  setEmailInput("");
                }}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {gmailGuidanceOpen ? (
              <div className="py-3 space-y-4">
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-xs">
                    <FiCheckCircle className="h-7 w-7" />
                  </div>
                  <h4 className="mt-2.5 text-base font-bold text-slate-900 tracking-tight">
                    Gmail Compose Opened!
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Your report file has been downloaded to your computer:
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-900 shadow-2xs">
                    <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                      PDF
                    </span>
                    <span>{pdfFileName}</span>
                  </div>
                </div>

                {/* Specific attachment instruction card */}
                <div className="rounded-xl border-2 border-amber-400 bg-amber-50/95 p-4 text-xs text-amber-950 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
                    <span className="text-lg">📎</span>
                    <span>Action Required: Attach Downloaded File in Gmail</span>
                  </div>
                  <p className="text-xs text-amber-900 font-medium leading-relaxed">
                    When you send the email, <strong>please attach the downloaded file ({pdfFileName})</strong> which has just been downloaded to your computer:
                  </p>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                        1
                      </span>
                      <span className="text-slate-800">
                        In your open Gmail tab, click the <strong>📎 Paperclip (Attach files) icon</strong> at the bottom of the compose window.
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                        2
                      </span>
                      <span className="text-slate-800">
                        Select <strong>{pdfFileName}</strong> from your <strong>Downloads</strong> folder (or simply drag the file from your browser&apos;s download tray directly into Gmail).
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                        3
                      </span>
                      <span className="text-slate-800">
                        Once attached, click <strong>Send</strong> in Gmail.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (lastGmailUrl) window.open(lastGmailUrl, "_blank");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <FiExternalLink className="h-3.5 w-3.5 text-rose-600" /> Re-open Gmail Tab
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePdf}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <FiDownload className="h-3.5 w-3.5" /> Re-download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGmailGuidanceOpen(false);
                      setEmailModalOpen(false);
                      setEmailInput("");
                    }}
                    className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer shadow-sm"
                  >
                    Got it, Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                {/* Missing Sender Email Warning Check */}
                {!senderEmail ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                    <div className="flex items-start gap-3">
                      <FiAlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-amber-900">
                          Sender Email Missing in Profile
                        </h4>
                        <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                          Please add your business email address in the{" "}
                          <strong>Company Profile</strong> first before sending
                          emails. Once your email is saved in your profile, you
                          can easily send reports to any recipient.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setEmailModalOpen(false);
                            onClose();
                            navigate("/company-profile");
                          }}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 cursor-pointer"
                        >
                          Go to Company Profile to Add Email →
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Verified Sender Info */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Sender (From Company Profile)
                      </label>
                      <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-semibold text-slate-900 truncate">
                            {senderEmail}
                          </span>
                        </div>
                        <span className="shrink-0 flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <FiCheck className="h-3 w-3" /> Profile Email
                        </span>
                      </div>
                    </div>

                    {/* Recipient Input */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Recipient Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        autoFocus
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="recipient@example.com"
                        className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSendViaGmail();
                        }}
                      />
                    </div>

                    {/* Subject Line */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-rose-600"
                      />
                    </div>

                    {/* PDF Attachment Box */}
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-600 text-white font-black text-xs tracking-wider shadow-xs">
                            PDF
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                                {pdfFileName}
                              </p>
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                                PDF Document
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              {effectiveRecords.length} records • Total {fmtMoney(calculatedTotal)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isGeneratingPdf || isSendingEmail}
                            onClick={handleOpenPdf}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-xs cursor-pointer"
                            title="Preview PDF file in browser"
                          >
                            <FiExternalLink className="h-3 w-3" /> Preview
                          </button>
                          <button
                            type="button"
                            disabled={isGeneratingPdf || isSendingEmail}
                            onClick={handleSavePdf}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-xs cursor-pointer"
                            title="Download PDF to computer"
                          >
                            <FiDownload className="h-3 w-3" /> Download
                          </button>
                        </div>
                      </div>
                      <div className="rounded-md bg-amber-50/90 border border-amber-200 p-2.5 text-[11px] text-amber-950 leading-relaxed space-y-1">
                        <p className="font-bold flex items-center gap-1.5 text-amber-900">
                          <span>ℹ️ How PDF attachment works:</span>
                        </p>
                        <p>
                          • <strong>Auto-Attach via Email App:</strong> Automatically attaches <strong>{pdfFileName}</strong> directly into your draft in Windows Mail / Outlook.
                        </p>
                        <p>
                          • <strong>Gmail Web:</strong> Due to browser cross-origin security, websites cannot programmatically inject attachments into <code>mail.google.com</code>. <strong>{pdfFileName}</strong> is downloaded to your PC — simply drag the downloaded file from your browser into the Gmail compose window or click 📎.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {!gmailGuidanceOpen && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={isSendingEmail}
                  onClick={() => {
                    setEmailModalOpen(false);
                    setEmailInput("");
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>

                {senderEmail && (
                  <>
                    <button
                      type="button"
                      disabled={isSendingEmail || isGeneratingPdf}
                      onClick={handleSendViaEmailApp}
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      title="Automatically attach PDF and compose in Mail App (Outlook / Windows Mail)"
                    >
                      {isSendingEmail ? (
                        <FiLoader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FiShare2 className="h-3.5 w-3.5" />
                      )}
                      <span>⚡ Auto-Attach in Email App</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSendingEmail || isGeneratingPdf}
                      onClick={handleSendViaGmail}
                      className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      title="Download PDF and compose email in Gmail Web"
                    >
                      {isSendingEmail ? (
                        <FiLoader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FiSend className="h-3.5 w-3.5" />
                      )}
                      <span>Send via Gmail Web</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
