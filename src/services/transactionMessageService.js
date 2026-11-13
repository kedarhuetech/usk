// Formats and sends automated transaction messages via Meta WhatsApp Cloud API.
import { getCompanyProfile } from "./companyProfileStorage.js";
import { getAppSettings } from "./appSettingsStorage.js";

export const TRANSACTION_TYPES_CONFIG = {
  sales: {
    label: "Sales Transaction",
    title: "Sale Invoice",
    sampleAmount: 792,
    sampleBalance: 492,
    defaultHeader: "Thanks for your purchase with us!! Purchase Details:",
  },
  purchase: {
    label: "Purchase Transaction",
    title: "Purchase Bill",
    sampleAmount: 1450,
    sampleBalance: 0,
    defaultHeader: "Purchase order confirmed with us. Details:",
  },
  salesReturn: {
    label: "Sales Return",
    title: "Credit Note",
    sampleAmount: 320,
    sampleBalance: 320,
    defaultHeader: "Your sales return has been processed. Return Details:",
  },
  purchaseReturn: {
    label: "Purchase Return",
    title: "Debit Note",
    sampleAmount: 480,
    sampleBalance: 480,
    defaultHeader: "Purchase return / debit note details:",
  },
  paymentIn: {
    label: "Payment In",
    title: "Payment-In Receipt",
    sampleAmount: 500,
    sampleBalance: 0,
    defaultHeader: "Payment received successfully with thanks!! Receipt Details:",
  },
  paymentOut: {
    label: "Payment Out",
    title: "Payment-Out Voucher",
    sampleAmount: 850,
    sampleBalance: 0,
    defaultHeader: "Payment made successfully. Payment Details:",
  },
  saleOrder: {
    label: "Sale Order",
    title: "Sale Order",
    sampleAmount: 1250,
    sampleBalance: 1250,
    defaultHeader: "Your sale order has been booked. Order Details:",
  },
  purchaseOrder: {
    label: "Purchase Order",
    title: "Purchase Order",
    sampleAmount: 2400,
    sampleBalance: 2400,
    defaultHeader: "Purchase order placed. Order Details:",
  },
  estimate: {
    label: "Estimate",
    title: "Estimate / Quotation",
    sampleAmount: 960,
    sampleBalance: 960,
    defaultHeader: "Here is your quotation / estimate. Quotation Details:",
  },
  proformaInvoice: {
    label: "Proforma Invoice",
    title: "Proforma Invoice",
    sampleAmount: 1100,
    sampleBalance: 1100,
    defaultHeader: "Proforma invoice details:",
  },
  deliveryChallan: {
    label: "Delivery Challan",
    title: "Delivery Challan",
    sampleAmount: 0,
    sampleBalance: 0,
    defaultHeader: "Goods dispatched under Delivery Challan. Details:",
  },
  cancelledInvoice: {
    label: "Cancelled Invoice",
    title: "Cancelled Invoice",
    sampleAmount: 792,
    sampleBalance: 0,
    defaultHeader: "Invoice has been cancelled. Details:",
  },
};

/**
 * Builds the text message body for a given transaction based on the user's settings.
 */
export function buildTransactionMessage({
  type = "sales",
  number = "INV-792",
  amount = 792,
  balance = 492,
  partyCurrentBalance = 1250,
  webInvoiceLink = "",
  paymentLink = "",
  settings = null,
} = {}) {
  const currentSettings = settings || getAppSettings();
  const config = TRANSACTION_TYPES_CONFIG[type] || TRANSACTION_TYPES_CONFIG.sales;

  const header =
    currentSettings.txnMsgTemplates?.[type] ||
    config.defaultHeader;

  const signature =
    currentSettings.txnMsgSignature ||
    (() => {
      try {
        return getCompanyProfile().companyName || "sai kirana";
      } catch {
        return "sai kirana";
      }
    })();

  const lines = [header, ""];
  lines.push(`${config.title}: ${number || ""}`.trim());
  lines.push("");
  if (amount !== undefined && amount !== null) {
    lines.push(`Invoice Amount: ${amount}`);
  }
  if (balance !== undefined && balance !== null) {
    lines.push(`Balance: ${balance}`);
  }

  if (currentSettings.txnMsgIncludePartyBalance && (partyCurrentBalance || partyCurrentBalance === 0)) {
    lines.push(`Party Current Balance: ${partyCurrentBalance}`);
  }

  if (currentSettings.txnMsgIncludeWebInvoiceLink) {
    lines.push(`Web Invoice Link: ${webInvoiceLink || "https://usk.app/i/" + (number || "792")}`);
  }

  if (currentSettings.txnMsgIncludePaymentLink) {
    lines.push(`Pay Online: ${paymentLink || "https://pay.usk.app/i/" + (number || "792")}`);
  }

  lines.push("");
  lines.push(signature);

  return lines.join("\n");
}

/**
 * Sends a transaction message via Meta WhatsApp Cloud API.
 * Returns delivery status and fallback URL if Meta is offline.
 */
export async function sendMetaWhatsAppMessage({
  phone,
  message,
  mediaUrl = null,
  type = "sales",
  openFallback = false,
}) {
  const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
  if (!cleanPhone || cleanPhone.length < 7) {
    return { success: false, error: "Recipient phone number is missing or invalid." };
  }
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;

  try {
    const response = await fetch("/api/whatsapp-business/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientPhone: formattedPhone,
        message,
        mediaUrl,
        type,
        channel: "meta",
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      return {
        success: true,
        method: "meta_api",
        messageId: result.messageId || "wamid.sent",
        result,
      };
    }

    if (openFallback && typeof window !== "undefined") {
      window.open(waUrl, "_blank");
    }

    return {
      success: false,
      method: "direct_fallback",
      error: result.message || "Meta WhatsApp is not connected or template pending approval.",
      templateAbsent: result.templateAbsent || false,
      templateRequested: result.templateRequested || false,
      fallbackUrl: waUrl,
    };
  } catch (err) {
    if (openFallback && typeof window !== "undefined") {
      window.open(waUrl, "_blank");
    }
    return {
      success: false,
      method: "direct_fallback",
      error: err.message || "Could not reach backend Meta service.",
      fallbackUrl: waUrl,
    };
  }
}
