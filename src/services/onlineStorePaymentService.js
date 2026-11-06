// Provides UPI QR and WhatsApp sharing utilities for the Online Store.
import QRCode from "qrcode";

export const PAYMENT_METHODS = {
  MANUAL_UPI: "upi_manual",
  COD: "cod",
  GATEWAY: "gateway",
};

export const PAYMENT_STATUSES = {
  PENDING_VERIFICATION: "pending_verification",
  PAID: "paid",
  REJECTED: "rejected",
};

// Builds a standard NPCI UPI URI scheme.
export function generateUpiUri({ upiId, payeeName = "Store", amount = 0, note = "Online Order" }) {
  if (!upiId) return "";
  const cleanUpi = String(upiId).trim();
  const cleanName = String(payeeName).trim().slice(0, 50) || "Store";
  const safeAmount = Number(amount || 0).toFixed(2);
  const cleanNote = String(note).trim().slice(0, 40) || "Online Order";

  const params = new URLSearchParams({
    pa: cleanUpi,
    pn: cleanName,
    am: safeAmount,
    cu: "INR",
    tn: cleanNote,
  });

  return `upi://pay?${params.toString()}`;
}

// Generates a base64 Data URL for the QR code image.
export async function generateUpiQrCode(upiUri) {
  if (!upiUri) return "";
  try {
    return await QRCode.toDataURL(upiUri, {
      width: 240,
      margin: 1,
      color: {
        dark: "#0f172a", // slate-900
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });
  } catch (error) {
    console.error("Failed to generate UPI QR code:", error);
    return "";
  }
}

// Cleans phone numbers and ensures Indian country code (91) if 10 digits.
export function sanitizeWhatsAppPhone(phone = "") {
  const digits = String(phone).replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// Prepares a clean, professional order message for WhatsApp.
export function formatWhatsAppOrderMessage({ order, storeState }) {
  const itemsText = (order.items || [])
    .map(
      (item) =>
        `• ${item.quantity}x ${item.itemNameSnapshot || item.itemName} (Rs ${item.lineTotal})`
    )
    .join("\n");

  const lines = [
    `🛍️ *NEW ONLINE ORDER*`,
    `*Store:* ${storeState.storeName || "Online Store"}`,
    `*Order ID:* ${order.id}`,
    ``,
    `*Items:*`,
    itemsText || "• No items",
    ``,
    `*Subtotal:* Rs ${order.subtotal || 0}`,
  ];

  if ((order.additionalCharge || order.additionalChargeAmount) > 0) {
    lines.push(
      `*${order.additionalChargeName || "Additional Charge"}:* Rs ${
        order.additionalCharge || order.additionalChargeAmount
      }`
    );
  }

  lines.push(
    `*Grand Total:* Rs ${order.total || 0}`,
    ``,
    `*Customer Details:*`,
    `• Name: ${order.customerName || "-"}`,
    `• Mobile: ${order.mobile || order.mobileNumber || "-"}`,
    `• Address: ${order.address || "-"}`,
    ``,
    `*Payment Mode:* UPI (Manual Verification)`,
    `*Payment Status:* ${order.paymentStatus === "paid" ? "✅ Paid" : "⏳ Pending Verification"}`
  );

  if (order.transactionRef) {
    lines.push(`*UPI Ref / UTR:* ${order.transactionRef}`);
  }

  lines.push(``, `_Please verify and confirm my order. Thank you!_`);

  return lines.join("\n");
}

// Generates the wa.me link to open WhatsApp directly with pre-filled message.
export function createWhatsAppShareUrl({ phoneNumber, message }) {
  const cleanPhone = sanitizeWhatsAppPhone(phoneNumber);
  if (!cleanPhone || !message) return "";
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
