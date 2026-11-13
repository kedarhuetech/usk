import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  getAppSettings,
  saveAppSettings,
} from "../../services/appSettingsStorage.js";
import {
  TRANSACTION_TYPES_CONFIG,
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";

// Mock localStorage if in Node environment
if (typeof window === "undefined" || !window.localStorage) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
  };
}

test("Transaction Message default settings match Vyapar desktop screenshot", () => {
  const settings = getAppSettings();

  // Channel: Meta WhatsApp (No personal QR login)
  assert.equal(settings.messageChannelType, "meta");

  // Recipient settings
  assert.equal(settings.txnMsgSendToParty, true);
  assert.equal(settings.txnMsgSendUpdateMessage, false);
  assert.equal(settings.txnMsgSendCopyToSelf, false);
  assert.equal(settings.txnMsgAutoShareVyaparNetwork, false);
  assert.equal(settings.txnMsgCredits, 100);

  // Content settings
  assert.equal(settings.txnMsgIncludePartyBalance, false);
  assert.equal(settings.txnMsgIncludeWebInvoiceLink, true);
  assert.equal(settings.txnMsgIncludePaymentLink, false);

  // Automatic message flags (12 types)
  assert.equal(settings.txnMsgAutoSales, true);
  assert.equal(settings.txnMsgAutoPurchase, true);
  assert.equal(settings.txnMsgAutoSalesReturn, true);
  assert.equal(settings.txnMsgAutoPurchaseReturn, true);
  assert.equal(settings.txnMsgAutoPaymentIn, true);
  assert.equal(settings.txnMsgAutoPaymentOut, true);
  assert.equal(settings.txnMsgAutoSaleOrder, true);
  assert.equal(settings.txnMsgAutoPurchaseOrder, false);
  assert.equal(settings.txnMsgAutoEstimate, false);
  assert.equal(settings.txnMsgAutoProformaInvoice, false);
  assert.equal(settings.txnMsgAutoDeliveryChallan, false);
  assert.equal(settings.txnMsgAutoCancelledInvoice, true);

  // Signature
  assert.equal(settings.txnMsgSignature, "sai kirana");
});

test("buildTransactionMessage correctly formats message with templates, amounts, and signature", () => {
  const settings = getAppSettings();

  const msg = buildTransactionMessage({
    type: "sales",
    number: "INV-792",
    amount: 792,
    balance: 492,
    settings,
  });

  assert.ok(msg.includes("Thanks for your purchase with us!!"));
  assert.ok(msg.includes("Purchase Details:"));
  assert.ok(msg.includes("Sale Invoice: INV-792"));
  assert.ok(msg.includes("Invoice Amount: 792"));
  assert.ok(msg.includes("sai kirana"));
  assert.ok(msg.includes("Web Invoice Link:")); // web link enabled by default
  assert.ok(!msg.includes("Party Current Balance:")); // party current balance disabled by default
});

test("buildTransactionMessage includes party balance when enabled", () => {
  const customSettings = {
    ...DEFAULT_SETTINGS,
    txnMsgIncludePartyBalance: true,
    txnMsgIncludePaymentLink: true,
    txnMsgSignature: "Super Store",
  };

  const msg = buildTransactionMessage({
    type: "sales",
    number: "INV-100",
    amount: 1500,
    balance: 500,
    partyCurrentBalance: 2500,
    settings: customSettings,
  });

  assert.ok(msg.includes("Balance: 500"));
  assert.ok(msg.includes("Party Current Balance: 2500"));
  assert.ok(msg.includes("Pay Online:"));
  assert.ok(msg.includes("Super Store"));
});

test("buildTransactionMessage formats other transaction types correctly", () => {
  const settings = getAppSettings();

  const purchaseMsg = buildTransactionMessage({
    type: "purchase",
    number: "PB-45",
    amount: 12000,
    settings,
  });

  assert.ok(purchaseMsg.includes("Purchase Bill: PB-45"));
  assert.ok(purchaseMsg.includes("Invoice Amount: 12000"));

  const paymentInMsg = buildTransactionMessage({
    type: "paymentIn",
    number: "REC-12",
    amount: 5000,
    settings,
  });

  assert.ok(paymentInMsg.includes("Payment-In Receipt: REC-12"));
  assert.ok(paymentInMsg.includes("Invoice Amount: 5000"));
});

test("sendMetaWhatsAppMessage succeeds with Meta Cloud API when backend is connected", async () => {
  let requestedBody = null;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/whatsapp-business/send") {
      requestedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          success: true,
          messageId: "wamid.test_12345",
        }),
      };
    }
    return { ok: false };
  };

  const res = await sendMetaWhatsAppMessage({
    phone: "9876543210",
    message: "Thank you for shopping with us!",
    type: "sales",
  });

  assert.equal(res.success, true);
  assert.equal(res.method, "meta_api");
  assert.equal(res.messageId, "wamid.test_12345");
  assert.equal(requestedBody.recipientPhone, "919876543210");
});

test("sendMetaWhatsAppMessage reports fallback and accurate error when Meta is offline", async () => {
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        message: "Meta WhatsApp is not connected.",
      }),
    };
  };

  const res = await sendMetaWhatsAppMessage({
    phone: "9876543210",
    message: "Test offline message",
  });

  assert.equal(res.success, false);
  assert.equal(res.method, "direct_fallback");
  assert.match(res.error, /Meta WhatsApp is not connected/);
  assert.match(res.fallbackUrl, /https:\/\/wa\.me\/919876543210/);
});
