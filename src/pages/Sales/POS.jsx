import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiCalendar,
  FiCamera,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiDollarSign,
  FiEdit2,
  FiFileText,
  FiInfo,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiSettings,
  FiTag,
  FiTrash2,
  FiUser,
  FiX,
} from "react-icons/fi";
import {
  getInventoryItems,
  saveInventoryItem,
  inventoryItemsStorageKey,
} from "../../services/itemsStorage";
import { getParties, saveParty, partiesStorageKey } from "../../services/partiesStorage";
import { getSaleInvoices, saveSaleInvoice, saleInvoicesStorageKey } from "../../services/salesStorage";
import {
  saveBusinessSaleInvoice,
  saveBusinessItem,
  loadBusinessItems,
  saveBusinessParty,
  loadBusinessParties,
} from "../../services/businessRecords";
import AddItem from "../Items/AddItem";
import AddPartyModal from "../Parties/AddPartyModal";
import BarcodeScanModal from "../../components/items/BarcodeScanModal";
import {
  addPosBill,
  closePosBill,
  createPosBillSession,
  createPosDraft,
  switchPosBill,
  updatePosBill,
} from "../../services/posBillState.js";
import { calculatePosBill } from "../../services/posBillCalculations.js";
import { getAppSettings } from "../../services/appSettingsStorage.js";
import { useAppSettings } from "../../hooks/useAppSettings.js";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";
import {
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";

const STORAGE = {
  draft: "pos_draft_v1",
  bills: "pos_saved_bills_v1",
  openBills: "pos_open_bills_v1",
  activeBillId: "pos_active_bill_id_v1",
};

function validatePosStorage() {
  try {
    for (const key of [inventoryItemsStorageKey, partiesStorageKey, saleInvoicesStorageKey, STORAGE.bills, STORAGE.openBills]) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      if (!Array.isArray(JSON.parse(raw))) return `Saved data in ${key} is not a valid list.`;
    }
    for (const key of [STORAGE.activeBillId, STORAGE.draft]) {
      const raw = localStorage.getItem(key);
      if (raw !== null) JSON.parse(raw);
    }
  } catch (error) {
    return `Could not read saved POS data: ${error.message}`;
  }
  return "";
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("pos-storage-saved"));
    return true;
  } catch (error) {
    console.error("Could not save POS data:", error);
    window.dispatchEvent(new CustomEvent("pos-storage-error", { detail: `Could not save ${key} in browser storage.` }));
    return false;
  }
}

const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function readPosBillSession() {
  const savedBills = readStorage(STORAGE.openBills, null);
  const savedActive = readStorage(STORAGE.activeBillId, null);
  if (Array.isArray(savedBills)) return createPosBillSession({ bills: savedBills, activeBillId: savedActive });
  const legacyDraft = readStorage(STORAGE.draft, null);
  const migrated = legacyDraft && typeof legacyDraft === "object"
    ? [{ ...legacyDraft, id: legacyDraft.id || createPosDraft().id }]
    : [];
  return createPosBillSession({ bills: migrated, activeBillId: migrated[0]?.id || null });
}

function billDraftSignature(bill) {
  return JSON.stringify({
    invoiceNo: bill.invoiceNo,
    date: bill.date,
    customer: bill.customer,
    customerPhone: bill.customerPhone,
    paymentMode: bill.paymentMode,
    amountReceived: bill.amountReceived,
    billDiscount: bill.billDiscount,
    additionalCharges: bill.additionalCharges,
    remarks: bill.remarks,
    loyaltyPointsRedeemed: bill.loyaltyPointsRedeemed,
    items: (bill.items || []).map((item) => ({
      productId: item.productId,
      code: item.code,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      price: item.price,
      taxRate: item.taxRate,
      discount: item.discount,
    })),
  });
}

function ActionButton({ children, primary = false, onClick, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[36px] sm:min-h-[38px] rounded-md border px-2 sm:px-3 py-1.5 text-xs font-semibold transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 text-center flex items-center justify-center ${primary
        ? "border-emerald-500 bg-emerald-200 text-slate-800"
        : "border-blue-300 bg-blue-100 text-slate-700"
        } ${className}`}
    >
      {children}
    </button>
  );
}

// Dedicated isolated printing engine honoring Settings -> Print Settings
function printPosBill(draft, calculations) {
  const settings = getAppSettings() || {};
  const profile = getCompanyProfile() || {};
  const isThermal = (settings.printActiveTab || "thermal") === "thermal";
  const companyName = settings.companyNamePrint || profile.companyName || profile.businessName || "Sai Kirana Stores";
  const phone = settings.phoneNumberPrint || profile.phoneNumber || "";
  const address = settings.addressPrint || profile.address || "";
  const gstin = settings.printGstinOnSale ? (profile.gstin || "") : "";
  const invoiceNo = draft?.invoiceNo || "POS-001";
  const dateStr = draft?.savedAt ? new Date(draft.savedAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN");
  const timeStr = draft?.savedAt ? new Date(draft.savedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const customer = draft?.customer || "Walk-in Customer";
  const customerPhone = draft?.customerPhone || "";
  const paymentMode = draft?.paymentMode || "Cash";
  const lines = calculations?.lines || [];
  const themeColor = settings.themeColor || "#881337";

  let bodyHtml;

  if (isThermal) {
    const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
    const itemRows = lines.map((line) => `
      <div style="padding: 4px 0; border-bottom: 1px dotted #ccc;">
        <div style="font-weight: 700; color: #111; font-size: 11px;">${line.name}</div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-top: 1px;">
          <span>${line.qty} ${line.unit || ""} × ₹${Number(line.price || 0).toFixed(2)}</span>
          <span style="font-weight: 800; color: #000;">₹${Number(line.total || 0).toFixed(2)}</span>
        </div>
        ${line.discount > 0 ? `<div style="font-size: 10px; color: #047857; text-align: right;">(Disc: -₹${Number(line.discount).toFixed(2)})</div>` : ''}
      </div>
    `).join("");

    bodyHtml = `
      <div style="width: 290px; max-width: 100%; margin: 0 auto; font-family: 'Courier New', Courier, monospace, sans-serif; font-size: 11px; line-height: 1.35; color: #000; padding: 6px 4px;">
        ${settings.printCompanyLogo && settings.companyLogo ? `<div style="text-align: center; margin-bottom: 6px;"><img src="${settings.companyLogo}" style="max-height: 48px; max-width: 120px; object-fit: contain;" /></div>` : ''}
        <div style="text-align: center;">
          <div style="font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;">${companyName}</div>
          ${address ? `<div style="font-size: 10px; color: #333; margin-top: 2px;">${address}</div>` : ''}
          ${phone ? `<div style="font-size: 10px; color: #333;">Ph: ${phone}</div>` : ''}
          ${gstin ? `<div style="font-size: 10px; font-weight: 700; margin-top: 2px;">GSTIN: ${gstin}</div>` : ''}
          <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin-top: 6px; font-weight: 900; letter-spacing: 1px; font-size: 11px;">
            ${settings.transactionNames?.saleInvoice || "TAX INVOICE / CASH MEMO"}
          </div>
        </div>

        <div style="margin-top: 6px; font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Bill: <b>${invoiceNo}</b></span>
            <span>${dateStr} ${timeStr}</span>
          </div>
          ${customer ? `
            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span>Cust: ${customer}</span>
              ${customerPhone ? `<span>Ph: ${customerPhone}</span>` : ''}
            </div>` : ''}
          <div style="display: flex; justify-content: space-between; color: #444; margin-top: 2px;">
            <span>Mode: ${paymentMode}</span>
            <span>Counter: POS 1</span>
          </div>
        </div>

        <div style="margin-top: 4px;">
          <div style="display: flex; justify-content: space-between; font-weight: 900; border-bottom: 1px dashed #000; padding-bottom: 3px; font-size: 10px;">
            <span>ITEM</span>
            <span>QTY × PRICE</span>
            <span>TOTAL</span>
          </div>
          <div>${itemRows}</div>
        </div>

        <div style="border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #444;">
            <span>Total Items / Qty:</span>
            <span>${lines.length} items / ${totalQty} pcs</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>Subtotal:</span>
            <span>₹${Number(calculations?.subtotal || 0).toFixed(2)}</span>
          </div>
          ${(Number(calculations?.itemDiscount || 0) + Number(calculations?.billDiscount || 0) + Number(calculations?.loyaltyDiscount || 0)) > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #047857; margin-top: 2px;">
              <span>Total Discount:</span>
              <span>-₹${(Number(calculations?.itemDiscount || 0) + Number(calculations?.billDiscount || 0) + Number(calculations?.loyaltyDiscount || 0)).toFixed(2)}</span>
            </div>` : ''}
          ${Number(calculations?.tax || 0) > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span>GST / Taxes:</span>
              <span>₹${Number(calculations?.tax || 0).toFixed(2)}</span>
            </div>` : ''}
          ${Number(calculations?.charges || 0) > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span>Addl Charges:</span>
              <span>₹${Number(calculations?.charges || 0).toFixed(2)}</span>
            </div>` : ''}
          <div style="border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 6px 0; margin-top: 6px; display: flex; justify-content: space-between; font-size: 14px; font-weight: 900;">
            <span>GRAND TOTAL:</span>
            <span>₹${Number(calculations?.total || 0).toFixed(2)}</span>
          </div>
          ${settings.printReceivedAmount ? `
            <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px;">
              <span>Received:</span>
              <span>₹${Number(calculations?.received || calculations?.total || 0).toFixed(2)}</span>
            </div>` : ''}
          ${Number(calculations?.change || 0) > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 2px; font-size: 11px;">
              <span>Change Returned:</span>
              <span>₹${Number(calculations?.change || 0).toFixed(2)}</span>
            </div>` : ''}
          ${settings.printBalanceAmount && Number(calculations?.balance || 0) > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #be123c; font-weight: 700; margin-top: 2px; font-size: 11px;">
              <span>Balance Due:</span>
              <span>₹${Number(calculations?.balance || 0).toFixed(2)}</span>
            </div>` : ''}
        </div>

        <div style="border-top: 1px dashed #000; margin-top: 10px; padding-top: 8px; text-align: center; font-size: 10px; color: #444;">
          <div style="font-weight: 800; color: #000; text-transform: uppercase;">Thank You! Visit Again</div>
          ${settings.printTermsAndConditions && settings.termsAndConditions ? `<div style="font-size: 8px; font-style: italic; margin-top: 4px; color: #555;">${settings.termsAndConditions}</div>` : ''}
          <div style="font-size: 8px; margin-top: 4px; color: #777;">*** ${companyName} ***</div>
        </div>
      </div>
    `;
  } else {
    // Regular A4 Invoice
    const itemRows = lines.map((line, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px; text-align: left; color: #64748b;">${idx + 1}</td>
        <td style="padding: 8px; text-align: left; font-weight: 700; color: #0f172a;">${line.name}</td>
        <td style="padding: 8px; text-align: center;">${line.qty} ${line.unit || ""}</td>
        <td style="padding: 8px; text-align: right;">₹${Number(line.price || 0).toFixed(2)}</td>
        <td style="padding: 8px; text-align: right; color: #047857;">${line.discount > 0 ? `₹${Number(line.discount).toFixed(2)}` : "-"}</td>
        <td style="padding: 8px; text-align: right;">${line.itemTax > 0 ? `₹${Number(line.itemTax).toFixed(2)}` : "-"}</td>
        <td style="padding: 8px; text-align: right; font-weight: 700;">₹${Number(line.total || 0).toFixed(2)}</td>
      </tr>
    `).join("");

    bodyHtml = `
      <div style="max-width: 800px; margin: 0 auto; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${themeColor}; padding-bottom: 16px;">
          <div>
            ${settings.printCompanyLogo && settings.companyLogo ? `<img src="${settings.companyLogo}" style="max-height: 56px; margin-bottom: 8px; object-fit: contain;" />` : ''}
            <div style="font-size: 22px; font-weight: 900; text-transform: uppercase; color: ${themeColor};">${companyName}</div>
            ${address ? `<div style="font-size: 12px; color: #475569; margin-top: 2px;">${address}</div>` : ''}
            ${phone ? `<div style="font-size: 12px; color: #475569;">Phone: ${phone}</div>` : ''}
            ${gstin ? `<div style="font-size: 12px; font-weight: 700; margin-top: 2px;">GSTIN: ${gstin}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; background: ${themeColor}; color: #ffffff; font-weight: 900; font-size: 13px; padding: 4px 14px; border-radius: 4px; text-transform: uppercase;">
              ${settings.transactionNames?.saleInvoice || "TAX INVOICE"}
            </div>
            <div style="font-size: 13px; font-weight: 800; margin-top: 8px;">Invoice #: ${invoiceNo}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Date: ${dateStr}</div>
            <div style="font-size: 12px; color: #64748b;">Mode: ${paymentMode}</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-top: 16px; font-size: 12px;">
          <div>
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b;">BILL TO:</div>
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${customer}</div>
            ${customerPhone ? `<div style="color: #475569; margin-top: 1px;">Ph: ${customerPhone}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b;">PAYMENT STATUS:</div>
            <div style="font-size: 12px; font-weight: 700; color: ${Number(calculations?.balance || 0) > 0 ? '#be123c' : '#047857'}; margin-top: 2px;">
              ${Number(calculations?.balance || 0) > 0 ? 'PARTIAL / BALANCE DUE' : 'PAID IN FULL'}
            </div>
            <div style="color: #64748b; font-size: 11px; margin-top: 1px;">Via ${paymentMode}</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px;">
          <thead>
            <tr style="background: ${themeColor}; color: #ffffff;">
              <th style="padding: 8px; text-align: left;">#</th>
              <th style="padding: 8px; text-align: left;">ITEM NAME</th>
              <th style="padding: 8px; text-align: center;">QTY</th>
              <th style="padding: 8px; text-align: right;">PRICE</th>
              <th style="padding: 8px; text-align: right;">DISCOUNT</th>
              <th style="padding: 8px; text-align: right;">TAX</th>
              <th style="padding: 8px; text-align: right;">TOTAL</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 16px; font-size: 12px;">
          <div style="width: 50%;">
            ${settings.printTermsAndConditions && settings.termsAndConditions ? `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
                <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b;">TERMS &amp; CONDITIONS:</div>
                <div style="color: #475569; margin-top: 2px; font-size: 11px;">${settings.termsAndConditions}</div>
              </div>` : ''}
            ${settings.printSignature ? `
              <div style="margin-top: 24px; width: 180px; text-align: center;">
                ${settings.signatureImage ? `<img src="${settings.signatureImage}" style="max-height: 44px; margin: 0 auto 4px auto; display: block;" />` : '<div style="height: 40px;"></div>'}
                <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-weight: 700; font-size: 11px; color: #334155;">
                  ${settings.printSignatureText || "Authorized Signatory"}
                </div>
              </div>` : ''}
          </div>

          <div style="width: 280px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>Subtotal:</span>
              <span style="font-weight: 600;">₹${Number(calculations?.subtotal || 0).toFixed(2)}</span>
            </div>
            ${(Number(calculations?.itemDiscount || 0) + Number(calculations?.billDiscount || 0)) > 0 ? `
              <div style="display: flex; justify-content: space-between; color: #047857; margin-bottom: 4px;">
                <span>Total Discount:</span>
                <span>-₹${(Number(calculations?.itemDiscount || 0) + Number(calculations?.billDiscount || 0)).toFixed(2)}</span>
              </div>` : ''}
            ${Number(calculations?.tax || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Tax (GST):</span>
                <span>₹${Number(calculations?.tax || 0).toFixed(2)}</span>
              </div>` : ''}
            ${Number(calculations?.charges || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Addl Charges:</span>
                <span>₹${Number(calculations?.charges || 0).toFixed(2)}</span>
              </div>` : ''}
            <div style="border-top: 2px solid ${themeColor}; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; color: ${themeColor};">
              <span>GRAND TOTAL:</span>
              <span>₹${Number(calculations?.total || 0).toFixed(2)}</span>
            </div>
            ${settings.printReceivedAmount ? `
              <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #475569;">
                <span>Received:</span>
                <span>₹${Number(calculations?.received || calculations?.total || 0).toFixed(2)}</span>
              </div>` : ''}
            ${settings.printBalanceAmount && Number(calculations?.balance || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-top: 3px; font-size: 11px; font-weight: 700; color: #be123c;">
                <span>Balance Due:</span>
                <span>₹${Number(calculations?.balance || 0).toFixed(2)}</span>
              </div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${isThermal ? 'Receipt' : 'Invoice'} - ${invoiceNo}</title>
  <style>
    @page {
      size: ${isThermal ? '80mm auto' : 'A4 portrait'};
      margin: ${isThermal ? '2mm 3mm' : '10mm'};
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

  // Hidden print iframe - guarantees 100% clean print preview without any blank page or main page interference
  let iframe = document.getElementById("pos-print-isolated-iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "pos-print-isolated-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);
  }

  const iframeDoc = iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(fullHtml);
  iframeDoc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
  }, 300);
}
export default function PointOfSale() {
  const navigate = useNavigate();
  const appSettings = useAppSettings() || {};
  const enableBarcodeScanning = appSettings.enableBarcodeScanning ?? true;
  const enableItemCategory = appSettings.enableItemCategory ?? true;
  const [initialStorageError] = useState(validatePosStorage);

  const handleClosePOS = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/sales/sale-invoices");
    }
  }, [navigate]);

  // Load products from localStorage (getInventoryItems)
  const loadProducts = useCallback(() => {
    const inventory = getInventoryItems();
    return inventory.map((item) => ({
      id: item.id,
      isActive: item.isActive !== false,
      code: item.itemCode || item.code || `ITM-${String(item.id || "").slice(-4)}`,
      name: item.itemName || item.name || "Item",
      price: Number(item.salePrice ?? item.price ?? 0),
      taxRate: appSettings.enableGst === false ? 0 : Number(String(item.taxRate ?? "0").match(/\d+(?:\.\d+)?/)?.[0] || 0),
      unit: item.unit || item.baseUnit || "Pcs",
      stock: Number(item.stock ?? item.openingQuantity ?? 0),
      discount: Number(item.discount || 0),
      discountType: item.discountType || "Percentage",
      category: item.category || "",
      barcode: item.barcode || item.barCode || item.itemBarcode || "",
      type: item.type || item.itemType || "product",
    }));
  }, [appSettings.enableGst]);

  // Load customers from localStorage (getParties)
  const loadCustomers = useCallback(() => {
    const parties = getParties();
    return parties.map((p) => ({
      id: p.id,
      name: p.partyName || p.name || "Customer",
      phone: p.phoneNumber || p.phone || "",
      address: p.billingAddress || p.address || "",
      loyaltyPoints: Number(p.loyaltyPoints || p.points || 0),
    }));
  }, []);

  const [products, setProducts] = useState(loadProducts);
  const [customers, setCustomers] = useState(loadCustomers);
  const [bills, setBills] = useState(() => {
    const value = readStorage(STORAGE.bills, []);
    return Array.isArray(value) ? value : [];
  });
  const [billSession, setBillSession] = useState(readPosBillSession);
  const [emptyDraft] = useState(createPosDraft);
  const activeBill = billSession.bills.find((bill) => bill.id === billSession.activeBillId);
  const draft = activeBill || emptyDraft;

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [barcodeModal, setBarcodeModal] = useState(false);

  // Modal State Management
  const [modal, setModal] = useState(null); // { type: string, data?: any }
  const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'warning' | 'info' }
  const [storageError, setStorageError] = useState(initialStorageError);

  const searchRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const newBillLockRef = useRef(false);
  const saveBillLockRef = useRef(false);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Sync with storage & database changes
  useEffect(() => {
    let mounted = true;
    async function syncFromDb() {
      try {
        const [items, parties] = await Promise.all([
          loadBusinessItems(),
          loadBusinessParties(),
        ]);
        if (!mounted) return;
        if (Array.isArray(items)) {
          setProducts(loadProducts());
        }
        if (Array.isArray(parties)) {
          setCustomers(loadCustomers());
        }
      } catch (err) {
        console.warn("POS syncFromDb fallback:", err);
      }
    }
    syncFromDb();

    const handleDataChanged = () => {
      setProducts(loadProducts());
      setCustomers(loadCustomers());
      setStorageError(validatePosStorage());
    };

    window.addEventListener("storage", handleDataChanged);
    window.addEventListener("inventory-items-changed", handleDataChanged);
    window.addEventListener("parties-changed", handleDataChanged);
    window.addEventListener("ledgerly:business-data-changed", handleDataChanged);

    return () => {
      mounted = false;
      window.removeEventListener("storage", handleDataChanged);
      window.removeEventListener("inventory-items-changed", handleDataChanged);
      window.removeEventListener("parties-changed", handleDataChanged);
      window.removeEventListener("ledgerly:business-data-changed", handleDataChanged);
    };
  }, [loadProducts, loadCustomers]);

  useEffect(() => {
    const onError = (event) => setStorageError(event.detail || "POS data could not be saved in browser storage.");
    const onSaved = () => setStorageError(validatePosStorage());
    window.addEventListener("pos-storage-error", onError);
    window.addEventListener("pos-storage-saved", onSaved);
    return () => {
      window.removeEventListener("pos-storage-error", onError);
      window.removeEventListener("pos-storage-saved", onSaved);
    };
  }, []);

  // Persist POS state to localStorage.
  useEffect(() => {
    persist(STORAGE.bills, bills);
  }, [bills]);
  useEffect(() => {
    persist(STORAGE.openBills, billSession.bills);
    persist(STORAGE.activeBillId, billSession.activeBillId);
  }, [billSession]);

  const updateDraft = useCallback((changes) => {
    setBillSession((current) => updatePosBill(current, current.activeBillId, changes));
  }, []);

  // Financial calculations
  const calculations = useMemo(() => calculatePosBill(draft), [draft]);

  // Filter products for search
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const active = products.filter((product) => product.isActive !== false);
    if (!query) return active;
    return active.filter((product) => {
      const matchFields = [product.name, product.code];
      if (enableBarcodeScanning) matchFields.push(product.barcode);
      if (enableItemCategory && product.category) matchFields.push(product.category);
      return matchFields.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [products, search, enableBarcodeScanning, enableItemCategory]);

  // Filter customers for dropdown
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    const list = Array.isArray(customers) ? customers : [];
    if (!query) return list;
    return list.filter((customer) =>
      [customer.name, customer.phone, customer.partyName].some((val) =>
        String(val || "").toLowerCase().includes(query)
      )
    );
  }, [customers, customerSearch]);

  // Get currently selected line item
  const selectedItem = useMemo(() => {
    if (!selectedId && draft.items.length === 1) {
      return draft.items[0];
    }
    return draft.items.find((item) => item.lineId === selectedId) || null;
  }, [draft.items, selectedId]);

  function handleBarcodeScan(scannedCode) {
    const code = String(scannedCode || "").trim();
    if (!code) return;
    setBarcodeModal(false);

    const matched = products.find((product) => {
      if (product.isActive === false) return false;
      const fields = [product.barcode, product.code];
      return fields.some((val) => String(val || "").trim().toLowerCase() === code.toLowerCase());
    });

    if (matched) {
      addProduct(matched);
      showToast(`Scanned & added "${matched.name}" to bill!`);
    } else {
      setModal({
        type: "addProduct",
        name: "",
        code,
        barcode: code,
      });
      showToast(`Barcode "${code}" not found. Add it as a new item now.`, "info");
    }
  }

  // Add product to bill
  function addProduct(product) {
    if (!activeBill) {
      showToast("Start a new bill before adding products.", "warning");
      return;
    }
    if (product.isActive === false) {
      showToast("This item is disabled and cannot be added to a new bill.", "warning");
      return;
    }
    const existing = draft.items.find((item) => item.productId === product.id);
    const requestedQuantity = Number(existing?.qty || 0) + 1;
    if (appSettings.stopSaleOnNegativeStock && product.type !== "service" && requestedQuantity > Number(product.stock || 0)) {
      showToast(`Only ${Number(product.stock || 0)} ${product.unit || "unit(s)"} available.`, "warning");
      return;
    }

    const itemDiscount = appSettings.enableItemDiscount === false ? 0 : String(product.discountType || "").toLowerCase().includes("flat")
      ? Math.min(Number(product.price || 0), Number(product.discount || 0))
      : Math.min(Number(product.price || 0), Number(product.price || 0) * Number(product.discount || 0) / 100);
    if (existing) {
      updateDraft((current) => ({
        ...current,
        items: current.items.map((item) => item.productId === product.id
          ? { ...item, qty: Number(item.qty) + 1, discount: Number(item.discount || 0) + itemDiscount }
          : item),
      }));
    } else {
      const item = {
        lineId: crypto.randomUUID(),
        productId: product.id,
        code: product.code,
        barcode: product.barcode || product.code || "",
        name: product.name,
        qty: 1,
        unit: product.unit || "Pcs",
        price: Number(product.price) || 0,
        taxRate: Number(product.taxRate) || 0,
        discount: itemDiscount,
      };
      updateDraft((current) => ({ ...current, items: [...current.items, item] }));
      setSelectedId(item.lineId);
    }

    setSearch("");
    setProductOpen(false);
    searchRef.current?.focus();
    showToast(`${product.name} added to bill`);
  }

  function updateItem(lineId, changes) {
    updateDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.lineId === lineId ? { ...item, ...changes } : item
      ),
    }));
  }

  // Button Action Handlers with Modal popups (No browser prompts)
  function handleQuantityClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "quantity",
      item,
      qty: String(item.qty),
    });
  }

  function handleDiscountClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "discount",
      item,
      discountType: "flat",
      discountValue: String(item.discount || 0),
    });
  }

  function handleUnitClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "unit",
      item,
      unit: item.unit || "Pcs",
    });
  }

  function handleRemoveItemClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "remove",
      item,
    });
  }

  function handleAdditionalChargesClick() {
    setModal({
      type: "additionalCharges",
      charges: String(draft.additionalCharges || 0),
    });
  }

  function handleBillDiscountClick() {
    setModal({
      type: "billDiscount",
      discountType: "flat",
      discountValue: String(draft.billDiscount || 0),
    });
  }

  function handleLoyaltyClick() {
    const customer = customers.find((entry) => entry.name === draft.customer);
    setModal({
      type: "loyalty",
      customer: draft.customer || "Walk-in Customer",
      availablePoints: Number(customer?.loyaltyPoints || customer?.points || 0),
      pointsToRedeem: String(draft.loyaltyPointsRedeemed || 0),
    });
  }

  function handleRemarksClick() {
    setModal({
      type: "remarks",
      remarks: draft.remarks || "",
    });
  }

  function handleBreakupClick() {
    setModal({
      type: "breakup",
    });
  }

  function handleOtherPaymentsClick() {
    setModal({
      type: "otherPayment",
      paymentMode: draft.paymentMode || "Cash",
      amountReceived: String(draft.amountReceived === "" ? calculations.received : draft.amountReceived),
      reference: "",
      notes: "",
    });
  }

  function handleNewBillClick() {
    if (newBillLockRef.current) return;
    newBillLockRef.current = true;
    window.setTimeout(() => { newBillLockRef.current = false; }, 350);
    executeNewBill();
  }

  function executeNewBill() {
    const next = createPosDraft();
    setBillSession((current) => addPosBill(current, next));
    setSelectedId("");
    setSearch("");
    setCustomerSearch("");
    setCustomerOpen(false);
    showToast("New bill started");
    searchRef.current?.focus();
    setModal(null);
  }

  function hasUnsavedBillData(bill) {
    if (bill.savedAt) return Boolean(bill.savedSnapshot && billDraftSignature(bill) !== bill.savedSnapshot);
    return bill.items?.length > 0 || bill.customer || bill.customerPhone
      || bill.amountReceived !== "" || Number(bill.billDiscount) > 0
      || Number(bill.additionalCharges) > 0 || Number(bill.loyaltyPointsRedeemed) > 0
      || Boolean(bill.remarks) || bill.paymentMode !== "Cash"
      || bill.date !== new Date().toISOString().slice(0, 10);
  }

  function closeActiveBill() {
    if (!activeBill) return;
    requestCloseBill(activeBill.id);
  }

  function requestCloseBill(billId) {
    const bill = billSession.bills.find((entry) => entry.id === billId);
    if (!bill) return;
    if (hasUnsavedBillData(bill)) {
      setModal({ type: "confirmCloseBill", billId });
      return;
    }
    removeOpenBill(billId);
  }

  function removeOpenBill(billId) {
    setBillSession((current) => closePosBill(current, billId));
    setSelectedId("");
    setSearch("");
    setModal(null);
  }

  function activateBill(billId) {
    if (billId === billSession.activeBillId) return;
    setBillSession((current) => switchPosBill(current, billId, draft));
    setSelectedId("");
    setSearch("");
    setCustomerSearch("");
    setModal(null);
  }

  function openSavedBill(bill) {
    const existing = billSession.bills.find((entry) => entry.id === bill.id);
    if (existing) {
      setBillSession((current) => ({ ...current, activeBillId: existing.id }));
    } else {
      const reopened = {
        ...bill,
        id: bill.id || crypto.randomUUID(),
        items: (bill.items || []).map((item) => ({ ...item, lineId: item.lineId || crypto.randomUUID() })),
        savedSnapshot: billDraftSignature(bill),
      };
      setBillSession((current) => addPosBill(current, reopened));
    }
    setSelectedId("");
    setSearch("");
    showToast(`Loaded ${bill.invoiceNo}`);
  }

  async function saveBill(print = false) {
    if (!activeBill) {
      showToast("Start a new bill before saving.", "warning");
      return;
    }
    if (draft.savedAt) {
      showToast(`Bill ${draft.invoiceNo} is already saved.`, "info");
      if (print) printPosBill(draft, calculations);
      return;
    }
    if (draft.items.length === 0) {
      showToast("Add at least one item before saving the bill.", "warning");
      return;
    }
    const inventory = getInventoryItems();
    for (const line of calculations.lines) {
      const product = inventory.find((item) => item.id === line.productId);
      if (!product) {
        showToast(`Product "${line.name}" is no longer available in inventory.`, "warning");
        return;
      }
      const stock = Number(product.stock ?? product.openingQuantity ?? 0);
      const quantityInBill = calculations.lines
        .filter((entry) => entry.productId === line.productId)
        .reduce((sum, entry) => sum + entry.qty, 0);
      if (appSettings.stopSaleOnNegativeStock && (product.type || product.itemType) !== "service" && quantityInBill > stock) {
        showToast(`Insufficient stock for ${line.name}. Available: ${stock}.`, "warning");
        return;
      }
      if (appSettings.enableItemSerialTracking && (product.hasSerialTracking || product.enableSerialTracking || (Array.isArray(product.serialNumbers) && product.serialNumbers.length > 0))) {
        const serials = Array.isArray(line.serialNumbers) ? line.serialNumbers : [];
        if (serials.length < line.qty && Array.isArray(product.serialNumbers) && product.serialNumbers.length > 0) {
          line.serialNumbers = product.serialNumbers.slice(0, line.qty);
        }
      }
    }
    if (saveBillLockRef.current) return;
    saveBillLockRef.current = true;

    const bill = {
      ...draft,
      items: calculations.lines,
      subtotal: calculations.subtotal,
      itemDiscount: calculations.itemDiscount,
      tax: calculations.tax,
      total: calculations.total,
      amountReceived: calculations.received,
      change: calculations.change,
      due: calculations.due,
      savedAt: new Date().toISOString(),
    };

    const transactionId = `pos-sale-${draft.id}`;
    const invoiceTotal = bill.total;
    const received = Math.min(bill.total, bill.amountReceived);
    const saleType = bill.due > 0 || bill.paymentMode === "Credit" ? "credit" : "cash";

    try {
      const savedInvoice = await saveBusinessSaleInvoice({
        id: transactionId,
        transactionType: "sale",
        saleType,
        invoiceNumber: bill.invoiceNo,
        form: {
          invoiceNumber: bill.invoiceNo,
          invoiceDate: bill.date,
          customer: bill.customer || "",
          phone: bill.customerPhone || "",
          paymentType: bill.paymentMode,
        },
        totals: {
          subTotal: bill.subtotal,
          discount: bill.itemDiscount + bill.billDiscount + bill.loyaltyDiscount,
          tax: bill.tax,
          additionalCharges: bill.charges,
          finalTotal: invoiceTotal,
          grandTotal: invoiceTotal,
          received,
          balance: bill.due,
        },
        status: bill.due === 0 ? "Paid" : received > 0 ? "Partially Paid" : "Unpaid",
        rows: bill.items.map((it) => ({
          id: it.lineId,
          sourceItemId: it.productId,
          itemId: it.productId,
          item: it.name,
          itemCode: it.code || "",
          barcode: it.barcode || it.code || "",
          qty: it.qty,
          price: it.price,
          unit: it.unit,
          discount: it.discount,
          taxRate: it.taxRate,
          amount: it.total,
        })),
      });
      if (!savedInvoice?.id) {
        throw new Error("The sale invoice could not be verified after saving.");
      }

      const savedBill = { ...bill, id: draft.id, invoiceId: savedInvoice.id, savedAt: new Date().toISOString(), savedSnapshot: billDraftSignature(draft) };
      setBills((current) => [savedBill, ...current.filter((entry) => entry.id !== savedBill.id && entry.invoiceNo !== savedBill.invoiceNo)]);
      updateDraft({ savedAt: savedBill.savedAt, invoiceId: savedInvoice.id });
      setProducts(loadProducts());
      showToast(`Bill ${bill.invoiceNo} saved successfully!`);

      // Auto-dispatch Meta WhatsApp transaction message if enabled in settings
      try {
        const currentSettings = getAppSettings();
        const sendToParty = currentSettings.txnMsgSendToParty ?? true;
        const isAutoSales = currentSettings.txnMsgAutoSales ?? true;
        const phone = (bill.customerPhone || "").trim();
        if (sendToParty && isAutoSales && phone) {
          const msg = buildTransactionMessage({
            type: "sales",
            number: bill.invoiceNo,
            amount: invoiceTotal,
            balance: bill.due ?? 0,
            settings: currentSettings,
          });
          sendMetaWhatsAppMessage({ phone, message: msg }).catch(() => { });
        }
      } catch {
        // Background dispatch does not interrupt POS checkout
      }
    } catch (e) {
      showToast(`Could not save bill: ${e.message || "Local storage write failed."}`, "warning");
      saveBillLockRef.current = false;
      return;
    }
    saveBillLockRef.current = false;

    if (print) {
      printPosBill(draft, calculations);
    }
  }

  function selectCustomer(customer) {
    updateDraft({ customer: customer.name, customerPhone: customer.phone || "" });
    setCustomerSearch("");
    setCustomerOpen(false);
    showToast(`Customer set to ${customer.name}`);
  }

  // Keyboard shortcut listener
  useEffect(() => {
    function onKeyDown(event) {
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (modal) {
          setModal(null);
          return;
        }
        if (productOpen) {
          setProductOpen(false);
          return;
        }
        if (customerOpen) {
          setCustomerOpen(false);
          return;
        }
        handleClosePOS();
        return;
      }

      if (modal) return;

      const primaryModifier = event.ctrlKey || event.metaKey;
      if (primaryModifier && !event.altKey && !event.shiftKey && key === "t") {
        event.preventDefault();
        if (event.repeat) return;
        handleNewBillClick();
        return;
      }

      if (primaryModifier && !event.altKey && !event.shiftKey && key === "p") {
        event.preventDefault();
        saveBill(true);
        return;
      }

      if (primaryModifier && !event.altKey && !event.shiftKey && key === "f") {
        event.preventDefault();
        handleBreakupClick();
        return;
      }

      if (primaryModifier && !event.altKey && !event.shiftKey && key === "m") {
        event.preventDefault();
        handleOtherPaymentsClick();
        return;
      }

      if (primaryModifier && !event.altKey && !event.shiftKey && key === "w") {
        event.preventDefault();
        if (event.repeat) return;
        closeActiveBill();
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const shortcuts = [
    ["Change Quantity", handleQuantityClick],
    ["Item Discount", handleDiscountClick],
    ["Remove Item", handleRemoveItemClick],
    ["Change Unit", handleUnitClick],
    ["Additional Charges", handleAdditionalChargesClick],
    ["Bill Discount", handleBillDiscountClick],
    ["Remarks", handleRemarksClick],
  ];

  return (
    <main className="flex h-full w-full max-w-full flex-col overflow-hidden bg-[#e8edf5] text-[#41485d]">
      {/* Bill Tabs & Actions Bar */}
      <nav className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-slate-200 bg-white px-2 w-full max-w-full overflow-hidden select-none">
        <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
          {billSession.bills.map((bill) => (
            <div
              key={bill.id}
              className={`flex h-full shrink-0 items-center gap-1 rounded-t border-t-2 px-2 ${
                bill.id === billSession.activeBillId
                  ? "border-blue-600 bg-[#f8f9fc]"
                  : "border-transparent bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => activateBill(bill.id)}
                className="max-w-28 sm:max-w-36 truncate text-xs font-semibold text-slate-800"
                aria-current={bill.id === billSession.activeBillId ? "page" : undefined}
              >
                #{bill.invoiceNo}
              </button>
              <button
                type="button"
                onClick={() => requestCloseBill(bill.id)}
                aria-label={`Close bill ${bill.invoiceNo}`}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <FiX size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleNewBillClick}
            className="flex h-6.5 shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <FiPlus className="text-blue-600" size={12} />
            <span>New Bill</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden text-[11px] text-slate-500 xl:block">
            Saved: <span className="font-semibold text-slate-700">{bills.length}</span>
          </div>
          <button
            type="button"
            title="POS Settings & System Data"
            aria-label="POS Settings"
            onClick={() => setModal({ type: "settings" })}
            className="rounded p-1 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <FiSettings size={15} />
          </button>
          <button
            type="button"
            title="Close POS"
            aria-label="Close POS"
            onClick={handleClosePOS}
            className="flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition cursor-pointer shadow-xs"
          >
            <FiX className="h-3 w-3" />
            <span>Close</span>
          </button>
        </div>
      </nav>

      {storageError && <p role="alert" className="shrink-0 border-b border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700">{storageError}</p>}

      {/* Main Split Grid */}
      <div className="flex-1 min-h-0 w-full max-w-full flex flex-col lg:flex-row gap-1 p-1 overflow-hidden">
        {activeBill ? <>
          {/* Left Section: Search, Table, Shortcuts Bar */}
          <section className="flex flex-col flex-1 min-h-0 min-w-0 max-w-full gap-1 overflow-hidden">
            {/* Item Search Bar */}
            <div className="relative shrink-0">
              <label className="flex h-9 items-center gap-2 rounded-md border-2 border-blue-500 bg-white px-2 shadow-xs">
                <input
                  ref={searchRef}
                  aria-label="Search items"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setProductOpen(true);
                  }}
                  onFocus={() => setProductOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const query = search.trim().toLowerCase();
                      const exactMatch = products.find((product) => {
                        if (product.isActive === false) return false;
                        const fields = [product.code];
                        if (enableBarcodeScanning) fields.push(product.barcode);
                        return fields.some((value) => String(value || "").trim().toLowerCase() === query);
                      });
                      if (exactMatch || filteredProducts[0]) {
                        addProduct(exactMatch || filteredProducts[0]);
                      } else if (search.trim()) {
                        setModal({
                          type: "addProduct",
                          name: search.trim(),
                          price: "",
                          unit: "Pcs",
                          taxRate: "0",
                          code: "",
                          stock: "",
                        });
                        setProductOpen(false);
                      }
                    }
                    if (event.key === "ArrowDown" && filteredProducts[0]) {
                      event.preventDefault();
                      addProduct(filteredProducts[0]);
                    }
                  }}
                  placeholder={enableBarcodeScanning ? "Search item name or code, or scan barcode..." : "Search item name or code..."}
                  className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm outline-none placeholder:font-medium placeholder:text-slate-400"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="rounded p-0.5 text-slate-400 hover:text-slate-600 mr-1"
                  >
                    <FiX size={13} />
                  </button>
                )}
                {enableBarcodeScanning && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBarcodeModal(true);
                    }}
                    title="Scan Barcode (Camera / USB Scanner)"
                    className="flex shrink-0 items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition mr-1"
                  >
                    <FiCamera size={13} />
                    <span>Scan</span>
                  </button>
                )}
                <FiSearch size={16} className="shrink-0 text-blue-500" />
              </label>

              {/* Product Dropdown Results */}
              {productOpen && (
                <div className="absolute left-0 right-0 top-full z-20 max-h-80 overflow-y-auto rounded-md border border-slate-300 bg-white shadow-xl">
                  <div className="bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 border-b">
                    All Items ({filteredProducts.length})
                  </div>
                  {filteredProducts.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-1.5 text-left transition hover:bg-blue-50"
                    >
                      <div>
                        <span className="block font-semibold text-slate-800 text-xs">{product.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {product.code} · {product.unit} · GST {product.taxRate}%
                          {product.type !== "service" ? ` · Stock: ${product.stock}` : ""}
                          {enableItemCategory && product.category ? ` · ${product.category}` : ""}
                          {enableBarcodeScanning && product.barcode ? ` · Barcode: ${product.barcode}` : ""}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900 text-xs">₹{money(product.price)}</span>
                    </button>
                  ))}

                  {filteredProducts.length === 0 && (
                    <div className="p-3 text-xs text-slate-500">
                      No matching item found.
                      <button
                        type="button"
                        onClick={() => {
                          setModal({
                            type: "addProduct",
                            name: search.trim(),
                            price: "",
                            unit: "Pcs",
                            taxRate: "0",
                            code: "",
                            stock: "",
                          });
                          setProductOpen(false);
                        }}
                        className="ml-2 font-bold text-blue-600 hover:underline"
                      >
                        + Add Item
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div
              className="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-auto rounded-md border border-slate-300 bg-white shadow-xs"
              onClick={() => setProductOpen(false)}
            >
              <table className="w-full min-w-[620px] border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#f3f4f6] text-left font-semibold text-slate-600">
                  <tr className="h-7.5">
                    <th className="border border-slate-200 px-2">#</th>
                    <th className="border border-slate-200 px-2">ITEM CODE</th>
                    <th className="border border-slate-200 px-2">ITEM NAME</th>
                    <th className="border border-slate-200 px-1 text-center">QTY</th>
                    <th className="border border-slate-200 px-1">UNIT</th>
                    <th className="border border-slate-200 px-1">PRICE/UNIT (₹)</th>
                    <th className="border border-slate-200 px-1">DISCOUNT (₹)</th>
                    <th className="border border-slate-200 px-1">TAX (₹)</th>
                    <th className="border border-slate-200 px-1">TOTAL (₹)</th>
                    <th className="border border-slate-200 px-1 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {calculations.lines.map((item, index) => {
                    const isSelected = selectedItem?.lineId === item.lineId;
                    return (
                      <tr
                        key={item.lineId}
                        onClick={() => setSelectedId(item.lineId)}
                        className={`h-8 cursor-pointer transition ${isSelected
                          ? "bg-[#e3f1ff] ring-1 ring-blue-300"
                          : "hover:bg-slate-50"
                          }`}
                      >
                        <td className="border border-slate-200 px-2 font-medium">{index + 1}</td>
                        <td className="border border-slate-200 px-2 text-slate-600">{item.code}</td>
                        <td className="border border-slate-200 px-2">
                          <div className="font-semibold text-slate-800 leading-tight">{item.name}</div>
                          <div className="text-[10px] text-slate-500">GST {item.taxRate}%</div>
                        </td>
                        <td className="border border-slate-200 p-0.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(item.lineId);
                              setModal({
                                type: "quantity",
                                item,
                                qty: String(item.qty),
                              });
                            }}
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold hover:border-blue-500 hover:text-blue-600 transition"
                            title="Click to change quantity"
                          >
                            {item.qty}
                          </button>
                        </td>
                        <td className="border border-slate-200 px-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(item.lineId);
                              setModal({
                                type: "unit",
                                item,
                                unit: item.unit,
                              });
                            }}
                            className="hover:text-blue-600 underline font-medium"
                            title="Click to change unit"
                          >
                            {item.unit}
                          </button>
                        </td>
                        <td className="border border-slate-200 px-1 font-medium">
                          ₹{money(item.price)}
                        </td>
                        <td className="border border-slate-200 px-1 text-slate-600">
                          {item.discount > 0 ? (
                            <span className="text-emerald-600 font-semibold">
                              −₹{money(item.discount)}
                            </span>
                          ) : (
                            "0.00"
                          )}
                        </td>
                        <td className="border border-slate-200 px-1 text-slate-600">
                          ₹{money(item.itemTax)}
                        </td>
                        <td className="border border-slate-200 px-1 font-bold text-slate-900">
                          ₹{money(item.total)}
                        </td>
                        <td className="border border-slate-200 p-0.5 text-center">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(item.lineId);
                              setModal({
                                type: "remove",
                                item,
                              });
                            }}
                            title="Remove item"
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {calculations.lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        className="py-4 border border-slate-200 text-center text-slate-400 text-xs"
                      >
                        <FiFileText size={18} className="mx-auto mb-1 opacity-40" />
                        No items added. Search or scan a product above to add.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Action Buttons Bar */}
            <div className="grid shrink-0 grid-cols-4 sm:grid-cols-4 lg:grid-cols-7 gap-1 rounded-md border border-slate-200 bg-white p-1">
              {shortcuts.map(([label, action]) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="h-7 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-slate-700 px-1 text-[11px] font-medium leading-none text-center transition active:scale-[0.98] truncate"
                  title={label}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Backup & Status Bar */}
            <div className="flex shrink-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] shadow-xs">
              <span className="flex items-center gap-1.5 text-slate-600 truncate">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="truncate">All products loaded ({products.length} products).</span>
              </span>
              <div className="flex items-center gap-2 shrink-0 font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setModal({
                      type: "addProduct",
                      name: "",
                      price: "",
                      unit: "Pcs",
                      taxRate: "0",
                      code: "",
                      stock: "",
                    });
                  }}
                  className="text-blue-600 hover:underline"
                >
                  + Add Product
                </button>
                <button
                  type="button"
                  className="text-slate-600 hover:text-blue-600 hover:underline"
                  onClick={() => {
                    const data = JSON.stringify({ products, customers, bills, draft }, null, 2);
                    const blob = new Blob([data], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                    showToast("POS backup exported successfully!");
                  }}
                >
                  Export backup
                </button>
              </div>
            </div>
          </section>

          {/* Right Section: Bill Details, Totals & Payment Controls */}
          <aside className="w-full lg:w-[310px] xl:w-[340px] shrink-0 flex flex-col min-h-0 gap-1 overflow-y-auto">
            {/* Customer & Date Selector (Compact Side-by-Side) */}
            <div className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 shadow-xs">
              <div className="grid grid-cols-[105px_1fr] gap-1.5">
                <label className="flex h-7.5 items-center justify-between rounded border border-slate-300 px-1.5 text-[11px]">
                  <input
                    type="date"
                    aria-label="Bill date"
                    value={draft.date}
                    onChange={(event) => updateDraft({ date: event.target.value })}
                    className="bg-transparent text-[10px] font-medium text-slate-800 outline-none w-full"
                  />
                </label>

                <div className="relative">
                  <div className="flex h-7.5 items-center rounded border border-slate-300 px-1.5">
                    <FiUser className="mr-1 text-slate-400 shrink-0" size={12} />
                    <input
                      value={customerOpen ? customerSearch : draft.customer}
                      onChange={(event) => {
                        setCustomerSearch(event.target.value);
                        setCustomerOpen(true);
                      }}
                      onFocus={() => {
                        setCustomerSearch(draft.customer);
                        setCustomerOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && customerSearch.trim()) {
                          event.preventDefault();
                          const existing = filteredCustomers[0];
                          if (existing) selectCustomer(existing);
                          else {
                            setModal({
                              type: "addCustomer",
                              name: customerSearch.trim(),
                              phone: "",
                              address: "",
                            });
                            setCustomerOpen(false);
                          }
                        }
                      }}
                      placeholder="Customer name / phone"
                      className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomerOpen((open) => !open)}
                      aria-label="Show customers"
                      className="p-0.5"
                    >
                      <FiChevronDown className="text-blue-500 shrink-0" size={13} />
                    </button>
                  </div>

                  {/* Customer Dropdown */}
                  {customerOpen && (
                    <div className="absolute left-0 right-0 top-full z-20 max-h-72 overflow-y-auto rounded-md border border-slate-300 bg-white shadow-xl">
                      <div className="bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 border-b">
                        All Customers ({filteredCustomers.length})
                      </div>
                      {filteredCustomers.map((customer) => (
                        <button
                          type="button"
                          key={customer.id}
                          onClick={() => selectCustomer(customer)}
                          className="block w-full border-b border-slate-100 px-2.5 py-1 text-left hover:bg-blue-50 transition"
                        >
                          <span className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
                            <span>{customer.name}</span>
                            {(customer.status === "Inactive" || customer.isInactive) && (
                              <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-semibold text-amber-800">
                                Inactive
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-500">{customer.phone || "No phone"}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setModal({
                            type: "addCustomer",
                            name: customerSearch.trim(),
                            phone: "",
                            address: "",
                          });
                          setCustomerOpen(false);
                        }}
                        className="w-full px-2.5 py-1.5 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 border-t"
                      >
                        <FiPlus className="mr-1 inline" /> + Add customer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateDraft({ customer: "", customerPhone: "" });
                          setCustomerOpen(false);
                          showToast("Set as Walk-in Customer");
                        }}
                        className="w-full px-2.5 py-1 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                      >
                        Walk-in customer (default)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Total & Breakup Card */}
            <button
              type="button"
              onClick={handleBreakupClick}
              className="flex shrink-0 items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left shadow-xs hover:bg-slate-50 transition"
            >
              <span className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-blue-500 shrink-0">
                  <FiFileText size={15} />
                </span>
                <span>
                  <span className="block text-base font-bold text-slate-900 leading-tight">
                    Total ₹ {money(calculations.total)}
                  </span>
                  <span className="block text-[10px] font-medium text-slate-500">
                    Items: {draft.items.length}, Qty:{" "}
                    {calculations.lines.reduce((sum, item) => sum + item.qty, 0)}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-0.5 text-right text-[11px] font-bold leading-tight text-blue-600">
                <span>Full Breakup</span>
                <FiChevronRight size={14} />
              </span>
            </button>

            {/* Payment & Charges Box */}
            <div className="flex flex-col rounded-md border border-slate-200 bg-white shadow-xs overflow-hidden shrink-0">
              <div className="grid grid-cols-2 gap-1.5 p-1.5 shrink-0">
                <label className="text-[10px] font-semibold text-slate-600">
                  Payment Mode
                  <select
                    value={draft.paymentMode}
                    onChange={(event) => updateDraft({ paymentMode: event.target.value })}
                    className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-1 text-[11px] font-semibold text-slate-700 outline-blue-500"
                  >
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Card</option>
                    <option>Bank Transfer</option>
                    <option>Credit</option>
                  </select>
                </label>
                <label className="text-[10px] font-semibold text-slate-600">
                  Amount Received (₹)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={draft.amountReceived}
                    onChange={(event) => updateDraft({ amountReceived: event.target.value })}
                    placeholder={money(calculations.total)}
                    className="mt-0.5 h-7 w-full rounded border border-slate-300 px-1 text-[11px] font-semibold text-slate-700 outline-blue-500"
                  />
                </label>
              </div>

              <div className="border-t border-slate-100 bg-[#fafafa] px-2 py-1 text-[11px] space-y-0.5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>₹ {money(calculations.subtotal)}</span>
                </div>
                {calculations.itemDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Item discounts</span>
                    <span>− ₹ {money(calculations.itemDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Tax (GST)</span>
                  <span>₹ {money(calculations.tax)}</span>
                </div>
                {calculations.billDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Bill discount</span>
                    <span>− ₹ {money(calculations.billDiscount)}</span>
                  </div>
                )}
                {calculations.loyaltyDiscount > 0 && (
                  <div className="flex justify-between text-purple-700 font-medium">
                    <span>Loyalty Redeemed</span>
                    <span>− ₹ {money(calculations.loyaltyDiscount)}</span>
                  </div>
                )}
                {calculations.charges > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Additional charges</span>
                    <span>₹ {money(calculations.charges)}</span>
                  </div>
                )}
                <div className="mt-0.5 flex justify-between border-t border-slate-200 pt-0.5 font-bold text-slate-800">
                  <span>Change to Return</span>
                  <span className="text-emerald-700">₹ {money(calculations.change)}</span>
                </div>
                {calculations.due > 0 && (
                  <div className="flex justify-between pt-0.5 font-bold text-rose-600">
                    <span>Balance Due</span>
                    <span>₹ {money(calculations.due)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Save / Print Buttons */}
            <div className="shrink-0 space-y-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-xs">
              <button
                type="button"
                onClick={() => saveBill(true)}
                className="flex h-8.5 w-full items-center justify-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs active:scale-[0.99] transition cursor-pointer"
              >
                <FiPrinter size={14} />
                <span>Save &amp; Print Bill</span>
              </button>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={handleOtherPaymentsClick}
                  className="flex h-7.5 items-center justify-center rounded border border-blue-300 bg-blue-50 text-blue-700 font-semibold text-[11px] hover:bg-blue-100 active:scale-[0.99] transition text-center px-1 truncate cursor-pointer"
                >
                  Other/Credit
                </button>
                <button
                  type="button"
                  onClick={() => saveBill(false)}
                  className="flex h-7.5 items-center justify-center rounded border border-slate-300 bg-slate-100 text-slate-800 font-semibold text-[11px] hover:bg-slate-200 active:scale-[0.99] transition cursor-pointer"
                >
                  Save Bill
                </button>
              </div>
            </div>

            {/* Saved Bills Accordion */}
            <details className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] shadow-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Saved bills ({bills.length})
              </summary>
              <div className="mt-1 max-h-24 space-y-0.5 overflow-auto">
                {bills.map((bill) => (
                  <div
                    key={bill.invoiceNo}
                    className="flex items-center justify-between gap-1 border-b border-slate-100 py-0.5 text-[10px]"
                  >
                    <button
                      type="button"
                      onClick={() => openSavedBill(bill)}
                      className="min-w-0 text-left hover:text-blue-600 truncate"
                    >
                      <span className="font-semibold mr-1">#{bill.invoiceNo}</span>
                      <span className="text-slate-500">
                        {bill.customer || "Walk-in"}
                      </span>
                    </button>
                    <span className="shrink-0 font-bold text-slate-800">₹{money(bill.total)}</span>
                  </div>
                ))}
                {bills.length === 0 && <p className="text-slate-400">No saved bills yet.</p>}
              </div>
              {bills.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModal({ type: "clearBills" })}
                  className="mt-1 text-[10px] font-semibold text-rose-600 underline"
                >
                  Clear saved bills
                </button>
              )}
            </details>
          </aside>
        </> : <section className="col-span-full flex min-h-[300px] flex-col items-center justify-center rounded-md border border-slate-200 bg-white text-center shadow-xs">
          <h2 className="text-base font-bold text-slate-800">No open bills</h2>
          <p className="mt-1 text-xs text-slate-500">Start a new bill to add products and take payment.</p>
          <button type="button" onClick={handleNewBillClick} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"><FiPlus /> New Bill</button>
          {bills.length > 0 && <div className="mt-4 max-h-48 w-full max-w-lg overflow-auto rounded border border-slate-200 p-2 text-left"><h3 className="mb-1.5 text-xs font-semibold text-slate-700">Saved bills</h3>{bills.map((bill) => <button key={bill.id || bill.invoiceNo} type="button" onClick={() => openSavedBill(bill)} className="flex w-full items-center justify-between border-t border-slate-100 py-1 text-xs hover:text-blue-600"><span>{bill.invoiceNo} · {bill.customer || "Walk-in"}</span><span>₹{money(bill.total)}</span></button>)}</div>}
        </section>}
      </div>

      {/* Floating Animated Toast Notifications */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-xl animate-bounce-in transition ${toast.type === "warning"
            ? "bg-amber-600"
            : toast.type === "info"
              ? "bg-blue-600"
              : "bg-emerald-600"
            }`}
        >
          {toast.type === "warning" ? (
            <FiAlertCircle size={18} />
          ) : (
            <FiCheck size={18} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* PROPER POPUP MODALS WITH RICH UI (ZERO PROMPT / ALERT DIALOGS) */}
      {/* ============================================================== */}

      {/* Barcode Scanner Modal */}
      {barcodeModal && (
        <BarcodeScanModal
          onClose={() => setBarcodeModal(false)}
          onScan={handleBarcodeScan}
        />
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          {/* 1. Change Quantity Modal */}
          {modal.type === "quantity" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiEdit2 className="text-blue-600" /> Change Quantity
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const qty = Number(modal.qty);
                  const product = products.find((entry) => entry.id === modal.item.productId);
                  if (!Number.isFinite(qty) || qty <= 0) {
                    showToast("Quantity must be greater than zero.", "warning");
                    return;
                  }
                  if (appSettings.stopSaleOnNegativeStock && product && product.type !== "service" && qty > Number(product.stock || 0)) {
                    showToast(`Only ${Number(product.stock || 0)} ${product.unit || "unit(s)"} available.`, "warning");
                    return;
                  }
                  if (qty > 0) {
                    updateItem(modal.item.lineId, { qty });
                    showToast(`Updated quantity to ${qty} ${modal.item.unit}`);
                    setModal(null);
                  }
                }}
                className="p-5 space-y-4"
              >
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-slate-800">{modal.item.name}</span>
                    <span className="block text-xs text-slate-500">Code: {modal.item.code}</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">
                    ₹{money(modal.item.price)} / {modal.item.unit}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Quantity ({modal.item.unit})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setModal((m) => {
                          const currentVal = Number(m.qty) || 1;
                          const nextVal = currentVal > 1 ? currentVal - 1 : Math.max(0.01, Number((currentVal - 0.25).toFixed(2)));
                          return { ...m, qty: String(nextVal) };
                        })
                      }
                      className="h-10 w-10 rounded-lg border bg-slate-100 font-bold text-lg hover:bg-slate-200"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      autoFocus
                      required
                      value={modal.qty}
                      onChange={(e) => setModal((m) => ({ ...m, qty: e.target.value }))}
                      className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-center text-lg font-bold text-slate-800 outline-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setModal((m) => ({
                          ...m,
                          qty: String(Number((Number(m.qty || 0) + 1).toFixed(2))),
                        }))
                      }
                      className="h-10 w-10 rounded-lg border bg-slate-100 font-bold text-lg hover:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[0.25, 0.5, 1, 2, 5, 10].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setModal((m) => ({ ...m, qty: String(step) }))}
                      className="flex-1 min-w-[48px] rounded-md border border-slate-200 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {step} {modal.item.unit}
                    </button>
                  ))}
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Update Quantity
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 2. Item Discount Modal */}
          {modal.type === "discount" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiTag className="text-blue-600" /> Item Discount
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const rawVal = Number(modal.discountValue) || 0;
                  const maxAllowed = Number(modal.item.price) * Number(modal.item.qty);
                  let finalDiscount = rawVal;
                  if (modal.discountType === "percent") {
                    finalDiscount = (maxAllowed * rawVal) / 100;
                  }
                  finalDiscount = Math.min(maxAllowed, Math.max(0, finalDiscount));
                  updateItem(modal.item.lineId, { discount: finalDiscount });
                  showToast(`Applied discount of ₹${money(finalDiscount)}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                  <span className="font-bold text-slate-800">{modal.item.name}</span>
                  <div className="text-xs text-slate-500 mt-1">
                    Qty: {modal.item.qty} × ₹{money(modal.item.price)} = ₹
                    {money(Number(modal.item.qty) * Number(modal.item.price))}
                  </div>
                </div>

                <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "flat" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${modal.discountType === "flat"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600"
                      }`}
                  >
                    Flat Amount (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "percent" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${modal.discountType === "percent"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600"
                      }`}
                  >
                    Percentage (%)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {modal.discountType === "flat" ? "Discount in Rupees (₹)" : "Discount in Percent (%)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    required
                    value={modal.discountValue}
                    onChange={(e) => setModal((m) => ({ ...m, discountValue: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Apply Discount
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 3. Change Unit Modal */}
          {modal.type === "unit" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Change Unit</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (modal.unit?.trim()) {
                    updateItem(modal.item.lineId, { unit: modal.unit.trim() });
                    showToast(`Unit changed to ${modal.unit.trim()}`);
                    setModal(null);
                  }
                }}
                className="p-5 space-y-4"
              >
                <div className="text-sm font-semibold text-slate-800">{modal.item.name}</div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Select Standard Unit
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Pcs", "Kg", "Gm", "Litre", "Ml", "Box", "Pack", "Dozen", "Meter"].map(
                      (u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setModal((m) => ({ ...m, unit: u }))}
                          className={`rounded-lg border py-2 text-xs font-bold transition ${modal.unit === u
                            ? "border-blue-500 bg-blue-50 text-blue-600"
                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                            }`}
                        >
                          {u}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Or Enter Custom Unit
                  </label>
                  <input
                    type="text"
                    value={modal.unit}
                    onChange={(e) => setModal((m) => ({ ...m, unit: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Update Unit
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 4. Remove Item Confirmation Modal */}
          {modal.type === "remove" && (
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-3">
                  <FiTrash2 size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">Remove Item?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Are you sure you want to remove{" "}
                  <strong className="text-slate-700">{modal.item.name}</strong> from this bill?
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft((current) => ({
                        ...current,
                        items: current.items.filter((r) => r.lineId !== modal.item.lineId),
                      }));
                      setSelectedId("");
                      showToast(`Removed ${modal.item.name}`);
                      setModal(null);
                    }}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 shadow-sm"
                  >
                    Remove Item
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. Additional Charges Modal */}
          {modal.type === "additionalCharges" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Additional Charges</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const val = Math.max(0, Number(modal.charges) || 0);
                  updateDraft({ additionalCharges: val });
                  showToast(`Additional charges set to ₹${money(val)}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Charges Amount (₹) (e.g. Delivery, Packing, Service)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    required
                    value={modal.charges}
                    onChange={(e) => setModal((m) => ({ ...m, charges: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  {[20, 50, 100, 150].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setModal((m) => ({ ...m, charges: String(c) }))}
                      className="flex-1 rounded-md border border-slate-200 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      +₹{c}
                    </button>
                  ))}
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Apply Charges
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 6. Bill Discount Modal */}
          {modal.type === "billDiscount" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Bill Discount</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const rawVal = Number(modal.discountValue) || 0;
                  const maxAllowedDiscount = Math.max(0, calculations.subtotal - (calculations.itemDiscount || 0));
                  let finalDiscount = rawVal;
                  if (modal.discountType === "percent") {
                    finalDiscount = (maxAllowedDiscount * rawVal) / 100;
                  }
                  finalDiscount = Math.min(maxAllowedDiscount, Math.max(0, finalDiscount));
                  updateDraft({ billDiscount: finalDiscount });
                  showToast(`Bill discount applied: ₹${money(finalDiscount)}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="p-3 bg-slate-50 rounded-lg text-xs font-medium text-slate-600">
                  Subtotal: <strong className="text-slate-800">₹{money(calculations.subtotal)}</strong>
                </div>

                <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "flat" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${modal.discountType === "flat"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600"
                      }`}
                  >
                    Flat (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "percent" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${modal.discountType === "percent"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600"
                      }`}
                  >
                    Percentage (%)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {modal.discountType === "flat" ? "Discount in Rupees (₹)" : "Discount in Percent (%)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    required
                    value={modal.discountValue}
                    onChange={(e) => setModal((m) => ({ ...m, discountValue: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Apply Bill Discount
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 7. Loyalty Points Modal */}
          {modal.type === "loyalty" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Loyalty Points</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const points = Math.max(0, Math.min(modal.availablePoints, Number(modal.pointsToRedeem) || 0));
                  updateDraft({ loyaltyPointsRedeemed: points });
                  showToast(`Redeemed ${points} points (₹${money(points)} discount)`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="rounded-lg bg-blue-50 p-3.5 border border-blue-100 text-sm">
                  <div className="font-semibold text-blue-900">
                    Customer: {modal.customer}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Available Balance: <strong>{modal.availablePoints} Points</strong> (1 Point = ₹1.00)
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Points to Redeem
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={modal.availablePoints}
                    autoFocus
                    value={modal.pointsToRedeem}
                    onChange={(e) => setModal((m) => ({ ...m, pointsToRedeem: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Redeem Points
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 8. Remarks Modal */}
          {modal.type === "remarks" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Bill Remarks</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  updateDraft({ remarks: modal.remarks });
                  showToast("Remarks saved for this bill");
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Remarks / Terms for Receipt
                  </label>
                  <textarea
                    rows={4}
                    autoFocus
                    value={modal.remarks}
                    onChange={(e) => setModal((m) => ({ ...m, remarks: e.target.value }))}
                    placeholder="e.g. Delivery requested by 5 PM. Goods once sold will not be returned."
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-blue-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Save Remarks
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 9. Add Customer Modal (Official AddPartyModal from Parties Section) */}
          {modal.type === "addCustomer" && (
            <div
              className="w-full max-w-6xl max-h-[88vh] overflow-y-auto"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <AddPartyModal
                embedded
                initialParty={{
                  partyName: modal.name || "",
                  phone: modal.phone || "",
                  billingAddress: modal.address || "",
                }}
                appSettings={appSettings}
                onClose={() => setModal(null)}
                onSave={async (partyData) => {
                  try {
                    const saved = await saveBusinessParty(partyData);
                    const mapped = {
                      id: saved.id,
                      name: saved.partyName || saved.name || "Customer",
                      partyName: saved.partyName || saved.name || "Customer",
                      phone: saved.phoneNumber || saved.phone || "",
                      address: saved.billingAddress || saved.address || "",
                      loyaltyPoints: Number(saved.loyaltyPoints || saved.points || 0),
                      status: saved.status,
                      isActive: saved.isActive !== false && saved.status !== "inactive",
                    };
                    setCustomers((curr) => [...curr.filter((c) => c.id !== mapped.id), mapped]);
                    updateDraft({
                      customer: mapped.name,
                      customerPhone: mapped.phone,
                    });
                    showToast(`Saved party "${mapped.name}" and selected for bill!`);
                    setModal(null);
                    return saved;
                  } catch (error) {
                    showToast(`Could not save party: ${error.message || "Save failed."}`, "warning");
                    throw error;
                  }
                }}
              />
            </div>
          )}

          {/* 10. Add Item Modal (Integrated from Items Section) */}
          {modal.type === "addProduct" && (
            <div
              className="w-full max-w-6xl max-h-[88vh] overflow-y-auto"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <AddItem
                embedded
                mode="add"
                initialItem={{
                  itemName: modal.name || "",
                  salePrice: modal.price || "",
                  barcode: modal.barcode || "",
                  itemCode: modal.code || "",
                }}
                onClose={() => setModal(null)}
                onSave={async (itemPayload) => {
                  try {
                    const saved = await saveBusinessItem(itemPayload);
                    const normalized = {
                      id: saved.id,
                      isActive: saved.isActive !== false,
                      code: saved.itemCode || saved.code || `ITM-${String(saved.id || "").slice(-4)}`,
                      name: saved.itemName || saved.name || "Item",
                      price: Number(saved.salePrice ?? saved.price ?? 0),
                      taxRate: appSettings.enableGst === false ? 0 : Number(String(saved.taxRate ?? "0").match(/\d+(?:\.\d+)?/)?.[0] || 0),
                      unit: saved.unit || saved.baseUnit || "Pcs",
                      stock: Number(saved.currentStock ?? saved.stock ?? saved.openingQuantity ?? 0),
                      discount: Number(saved.discount || 0),
                      discountType: saved.discountType || "Percentage",
                      category: saved.category || "",
                      barcode: saved.barcode || saved.barCode || saved.itemBarcode || "",
                      type: saved.type || saved.itemType || "product",
                    };
                    setProducts((curr) => [...curr.filter((p) => p.id !== normalized.id), normalized]);
                    addProduct(normalized);
                    showToast(`Saved "${normalized.name}" & added to bill!`);
                    setModal(null);
                    return saved;
                  } catch (error) {
                    showToast(`Could not save item: ${error.message || "Save failed"}`, "warning");
                    throw error;
                  }
                }}
              />
            </div>
          )}

          {/* 11. Bill Breakup Modal */}
          {modal.type === "breakup" && (
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiFileText className="text-blue-600" /> Bill Summary &amp; Breakup
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Invoice Number:</span>
                    <strong className="text-slate-800">#{draft.invoiceNo}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <strong className="text-slate-800">{draft.customer || "Walk-in"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <strong className="text-slate-800">{draft.date}</strong>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>₹{money(calculations.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Item Discounts:</span>
                    <span>−₹{money(calculations.itemDiscount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Tax (GST):</span>
                    <span>₹{money(calculations.tax)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Bill Discount:</span>
                    <span>−₹{money(calculations.billDiscount)}</span>
                  </div>
                  {calculations.loyaltyDiscount > 0 && (
                    <div className="flex justify-between text-purple-700 font-medium">
                      <span>Loyalty Points Redeemed:</span>
                      <span>−₹{money(calculations.loyaltyDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Additional Charges:</span>
                    <span>₹{money(calculations.charges)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                    <span>Grand Total:</span>
                    <span>₹{money(calculations.total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Amount Received:</span>
                    <span>₹{money(calculations.received)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Change to Return:</span>
                    <span>₹{money(calculations.change)}</span>
                  </div>
                  {calculations.due > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>Balance Due:</span>
                      <span>₹{money(calculations.due)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      saveBill(true);
                    }}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
                  >
                    Save &amp; Print
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 12. Other / Credit Payments Modal */}
          {modal.type === "otherPayment" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiDollarSign className="text-blue-600" /> Other / Credit Payments
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  updateDraft({
                    paymentMode: modal.paymentMode,
                    amountReceived: modal.amountReceived,
                  });
                  showToast(`Payment mode set to ${modal.paymentMode}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="rounded-lg bg-slate-50 p-3 border text-sm flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Bill Total Payable:</span>
                  <span className="text-lg font-bold text-slate-900">₹{money(calculations.total)}</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Cash", "UPI", "Card", "Bank Transfer", "Credit"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setModal((m) => ({
                          ...m,
                          paymentMode: mode,
                          amountReceived: mode === "Credit" && m.amountReceived === String(calculations.total) ? "0" : m.amountReceived,
                        }))}
                        className={`rounded-lg border py-2 text-xs font-bold transition ${modal.paymentMode === mode
                          ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Amount Received (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={modal.amountReceived}
                    onChange={(e) => setModal((m) => ({ ...m, amountReceived: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Confirm Payment
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Confirm closing an unsaved bill */}
          {modal.type === "confirmCloseBill" && (
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
                  <FiAlertCircle size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">Close this unsaved bill?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  This removes the open draft. Other bills will remain saved and available in their tabs.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOpenBill(modal.billId)}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 shadow-sm"
                  >
                    Discard &amp; Close Bill
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 14. Shortcuts / Help Modal */}
          {modal.type === "shortcuts" && (
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiInfo className="text-blue-600" /> POS Keyboard Shortcuts &amp; Help
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ["Ctrl+T", "Start a new bill"],
                    ["Ctrl+F", "Full bill breakup"],
                    ["Ctrl+P", "Save and print bill"],
                    ["Ctrl+M", "Other & Credit payment options"],
                    ["Ctrl+W", "Close bill tab"],
                  ].map(([k, desc]) => (
                    <div
                      key={k}
                      className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100"
                    >
                      <kbd className="rounded bg-white px-2 py-0.5 font-bold shadow-sm border border-slate-200 text-slate-800">
                        {k}
                      </kbd>
                      <span className="text-slate-600 font-medium">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Got It
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 15. POS Settings Modal */}
          {modal.type === "settings" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiSettings className="text-blue-600" /> POS Settings &amp; Data
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Inventory Items:</span>
                    <strong className="text-slate-900">{products.length} items</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Customers:</span>
                    <strong className="text-slate-900">{customers.length} customers</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Saved POS Invoices:</span>
                    <strong className="text-slate-900">{bills.length} bills</strong>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      navigate("/settings");
                    }}
                    className="w-full rounded-lg bg-blue-50 border border-blue-200 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <FiSettings /> Open All Application Settings (/settings) →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      navigate("/items");
                    }}
                    className="w-full rounded-lg border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Manage Full Inventory in Items Dashboard →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      navigate("/company-profile");
                    }}
                    className="w-full rounded-lg border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Edit Company Profile &amp; Details →
                  </button>
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 16. Clear Saved Bills Confirmation */}
          {modal.type === "clearBills" && (
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-3">
                  <FiTrash2 size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">Clear All Saved Bills?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  This will remove all {bills.length} saved POS bills from this browser.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBills([]);
                      showToast("All saved bills cleared");
                      setModal(null);
                    }}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 shadow-sm"
                  >
                    Clear Bills
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </main>
  );
}
