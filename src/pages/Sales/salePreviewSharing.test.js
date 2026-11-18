import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("SalePreview UI: Accept Online Payments and Message buttons are removed", () => {
  const filePath = path.resolve(__dirname, "SalePreview.jsx");
  const content = fs.readFileSync(filePath, "utf8");

  // Verify 'Accept Online Payments' and 'Start Now' are removed
  assert.ok(
    !content.includes("Accept Online Payments"),
    "SalePreview must not contain 'Accept Online Payments'"
  );
  assert.ok(
    !content.includes("/business-growth/online-store"),
    "SalePreview must not link to online-store 'Start Now'"
  );

  // Verify 'Message' share button and FiShare2 are removed
  assert.ok(
    !content.includes("handleShareSms"),
    "SalePreview must not contain handleShareSms"
  );
  assert.ok(
    !content.includes("<FiShare2"),
    "SalePreview must not render FiShare2 Message icon"
  );
  assert.ok(
    !content.includes(">Message<"),
    "SalePreview must not render 'Message' share button"
  );

  // Verify WhatsApp and Gmail buttons exist
  assert.ok(
    content.includes("handleShareWhatsApp"),
    "SalePreview must contain handleShareWhatsApp"
  );
  assert.ok(
    content.includes("handleShareEmail"),
    "SalePreview must contain handleShareEmail"
  );
  assert.ok(
    content.includes("WhatsApp"),
    "SalePreview must render WhatsApp share button"
  );
  assert.ok(
    content.includes("Gmail"),
    "SalePreview must render Gmail share button"
  );
});

test("SalePreview Sharing: Gmail share builds valid URL with real company name and invoice details", () => {
  const invoice = {
    invoiceNumber: "INV-43",
    customer: "asas",
    email: "customer@example.com",
    totalAmount: 570,
    balanceAmount: 570,
  };
  const effectiveCompany = "USV Test Trade";

  const amountVal = invoice.totalAmount ?? 0;
  const balanceVal = invoice.balanceAmount ?? 0;
  const subject = encodeURIComponent(`Invoice ${invoice.invoiceNumber} from ${effectiveCompany}`);
  const body = encodeURIComponent(
    `Dear ${invoice.customer || "Customer"},\n\nPlease find your invoice details below:\n` +
    `Invoice Number: ${invoice.invoiceNumber}\n` +
    `Date: \n` +
    `Total Amount: ₹${amountVal}\n` +
    `Balance Due: ₹${balanceVal}\n\n` +
    `Thank you for your business!\n` +
    `${effectiveCompany}`
  );
  const targetEmail = invoice.email;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${subject}&body=${body}`;

  assert.ok(gmailUrl.startsWith("https://mail.google.com/mail/?view=cm&fs=1&to=customer%40example.com"));
  assert.ok(gmailUrl.includes("USV%20Test%20Trade"));
  assert.ok(gmailUrl.includes("570"));
  assert.ok(!gmailUrl.includes("undefined"));
  assert.ok(!gmailUrl.includes("Sai%20Kirana%20Stores"));
});

test("SalePreview Sharing: WhatsApp share builds proper link and handles missing phone number gracefully", () => {
  const message = "Dear Customer, invoice INV-43 for amount 570 has been created. Balance: 570.";
  
  // With phone number
  const rawPhone = "+91 98765 43210";
  const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const waUrlWithPhone = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  assert.ok(waUrlWithPhone.includes("919876543210"));
  assert.ok(waUrlWithPhone.includes("INV-43"));

  // Without phone number (opens general WhatsApp text prompt)
  const waUrlGeneral = `https://wa.me/?text=${encodeURIComponent(message)}`;
  assert.equal(waUrlGeneral, `https://wa.me/?text=${encodeURIComponent(message)}`);
});

test("SalePreview Image Sharing: invoice element snapshotting, clipboard copy, and asset upload are wired", () => {
  const filePath = path.resolve(__dirname, "SalePreview.jsx");
  const content = fs.readFileSync(filePath, "utf8");

  // Verify invoice container has ref={invoiceRef}
  assert.ok(
    content.includes("ref={invoiceRef}"),
    "Invoice container must have ref={invoiceRef} for capturing"
  );

  // Verify html2canvas is imported and used
  assert.ok(
    content.includes('import html2canvas from "html2canvas"'),
    "SalePreview must import html2canvas"
  );
  assert.ok(
    content.includes("html2canvas(invoiceRef.current"),
    "captureInvoiceBlob must call html2canvas on invoiceRef.current"
  );

  // Verify clipboard copy and download helpers
  assert.ok(
    content.includes("copyBlobToClipboard"),
    "SalePreview must include copyBlobToClipboard"
  );
  assert.ok(
    content.includes("ClipboardItem"),
    "SalePreview must use ClipboardItem for PNG blob copying"
  );
  assert.ok(
    content.includes("triggerDownload"),
    "SalePreview must include triggerDownload helper"
  );

  // Verify public asset upload and demo-business tenant scoping
  assert.ok(
    content.includes("uploadInvoiceImage"),
    "SalePreview must include uploadInvoiceImage"
  );
  assert.ok(
    content.includes("businessGrowthApi.upload"),
    "uploadInvoiceImage must upload file to businessGrowthApi"
  );
  assert.ok(
    content.includes("businessId=demo-business"),
    "Public asset URL must scope businessId to demo-business"
  );

  // Verify user guidance toast / status notice
  assert.ok(
    content.includes("shareNotice"),
    "SalePreview must render shareNotice toast for user feedback"
  );
  assert.ok(
    content.includes("Ctrl+V"),
    "SalePreview share notice must guide user to paste (Ctrl+V) invoice image"
  );
});

test("buildTransactionMessage includes full items list, customer, bank details, and suppresses dummy links on localhost", async () => {
  const { buildTransactionMessage } = await import("../../services/transactionMessageService.js");

  const sampleItems = [
    { item: "A4 Copier Paper 500 Sheets", qty: 2, unit: "ream", price: 285, amount: 570 },
    { item: "Ballpoint Pens Box", qty: 1, unit: "box", price: 405, amount: 405 },
  ];

  const msg = buildTransactionMessage({
    type: "sales",
    number: "46",
    amount: 975,
    balance: 975,
    received: 0,
    subTotal: 975,
    customer: "asas",
    customerPhone: "8369501991",
    date: "18-11-2026",
    items: sampleItems,
    bankDetails: {
      bankName: "HDFC Bank",
      accountNumber: "50200012345678",
      ifscCode: "HDFC0001234",
    },
    companyName: "USV Test Trade",
    companyPhone: "8369501991",
  });

  // Verify Items section is present and formatted
  assert.ok(msg.includes("Items Purchased:"), "Message must contain 'Items Purchased:'");
  assert.ok(msg.includes("A4 Copier Paper 500 Sheets - 2 ream x ₹285 = ₹570"), "Must format item 1 with qty, price, and amount");
  assert.ok(msg.includes("Ballpoint Pens Box - 1 box x ₹405 = ₹405"), "Must format item 2 with qty, price, and amount");

  // Verify Customer & Date details
  assert.ok(msg.includes("Customer: asas (8369501991)"), "Must include customer name and phone");
  assert.ok(msg.includes("Date: 18-11-2026"), "Must include invoice date");

  // Verify Financial breakdown
  assert.ok(msg.includes("Invoice Amount: 975"), "Must include invoice amount");
  assert.ok(msg.includes("Amount Paid: 0"), "Must include amount paid");
  assert.ok(msg.includes("Balance: 975"), "Must include balance");

  // Verify Bank Details
  assert.ok(msg.includes("Bank Details for Payment:"), "Must include bank details section");
  assert.ok(msg.includes("Bank: HDFC Bank"), "Must include bank name");
  assert.ok(msg.includes("A/c No: 50200012345678"), "Must include account number");
  assert.ok(msg.includes("IFSC: HDFC0001234"), "Must include IFSC code");

  // Verify Company Name
  assert.ok(msg.includes("USV Test Trade"), "Must use active company name");
  assert.ok(!msg.includes("sai kirana"), "Must not use placeholder sai kirana");

  // Verify localhost / dummy links are suppressed
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { hostname: "localhost" },
      localStorage: originalWindow?.localStorage || { getItem: () => null, setItem: () => {} },
    };
    const localMsg = buildTransactionMessage({
      type: "sales",
      number: "46",
      amount: 975,
      balance: 975,
      items: sampleItems,
      webInvoiceLink: "http://localhost:5173/api/invoices/46",
    });
    assert.ok(!localMsg.includes("localhost"), "Must not include localhost links");
    assert.ok(!localMsg.includes("usk.app"), "Must not include dummy usk.app links");
  } finally {
    globalThis.window = originalWindow;
  }
});


