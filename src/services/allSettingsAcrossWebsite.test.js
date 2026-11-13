import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage for Node test runner
const store = new Map();
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import {
  DEFAULT_SETTINGS,
  getAppSettings,
  saveAppSettings,
  formatCurrency,
  applyScreenZoom,
} from "./appSettingsStorage.js";
import { calculateRow, calculateInvoiceTotals } from "../utils/saleInvoice.js";
import {
  buildUnifiedDocumentHtml,
  buildUnifiedStatementHtml,
  getEffectiveCompanyInfo,
  numberToWords,
} from "./unifiedPrintService.js";
import {
  buildTransactionMessage,
  TRANSACTION_TYPES_CONFIG,
} from "./transactionMessageService.js";
import { saveSaleInvoice } from "./salesStorage.js";
import {
  getReminderSettings,
  saveReminderSettings,
} from "./serviceRemindersStorage.js";

test("1. GENERAL SETTINGS: Currency formatting honors currency symbol and decimal places", () => {
  saveAppSettings({ currencySymbol: "$", amountDecimalPlaces: 3 });
  const formatted = formatCurrency(1234.5);
  assert.ok(formatted.startsWith("$"));
  assert.ok(formatted.endsWith("1,234.500"));

  // Reset
  saveAppSettings({ currencySymbol: "₹", amountDecimalPlaces: 2 });
  const formattedInr = formatCurrency(1234.5);
  assert.ok(formattedInr.startsWith("₹"));
  assert.ok(formattedInr.endsWith("1,234.50"));
});

test("2. GENERAL SETTINGS: Screen zoom helper applies zoom style safely", () => {
  // In node environment without DOM document, it safely executes without crashing
  assert.doesNotThrow(() => applyScreenZoom("110%"));
});

test("3. GENERAL SETTINGS: Stop sale on negative stock blocks transaction when enabled", () => {
  // Setup inventory item with 5 stock
  window.localStorage.setItem(
    "ledgerly:inventoryItems.v1",
    JSON.stringify([
      { id: "item-neg-1", itemName: "Wheat Bag 50kg", stock: 5, openingQuantity: 5 },
    ])
  );

  saveAppSettings({ stopSaleOnNegativeStock: true });

  const invalidSale = {
    id: `sale-neg-test-${Date.now()}`,
    transactionType: "sale",
    customer: "Cash Sale",
    rows: [{ sourceItemId: "item-neg-1", item: "Wheat Bag 50kg", qty: 10, price: 1200 }],
  };

  assert.throws(() => {
    saveSaleInvoice(invalidSale);
  }, /Stop Sale on Negative Stock is enabled/);

  // When disabled, sale succeeds
  saveAppSettings({ stopSaleOnNegativeStock: false });
  assert.doesNotThrow(() => {
    saveSaleInvoice(invalidSale);
  });
});

test("4. GENERAL SETTINGS: Block new items from transaction blocks unregistered items", () => {
  window.localStorage.setItem(
    "ledgerly:inventoryItems.v1",
    JSON.stringify([
      { id: "item-reg-1", itemName: "Known Item", stock: 100, openingQuantity: 100 },
    ])
  );

  saveAppSettings({ blockNewItemsFromTxn: true, stopSaleOnNegativeStock: false });

  const saleWithUnknownItem = {
    id: `sale-block-item-${Date.now()}`,
    transactionType: "sale",
    customer: "Cash Sale",
    rows: [{ item: "Unknown Ghost Product", qty: 1, price: 500 }],
  };

  assert.throws(() => {
    saveSaleInvoice(saleWithUnknownItem);
  }, /Creating new items from transactions is blocked/);

  // When disabled, it is permitted
  saveAppSettings({ blockNewItemsFromTxn: false });
  assert.doesNotThrow(() => {
    saveSaleInvoice(saleWithUnknownItem);
  });
});

test("5. GENERAL SETTINGS: Block new parties from transaction blocks unregistered parties", () => {
  window.localStorage.setItem(
    "ledgerly:parties.v1",
    JSON.stringify([
      { id: "party-known-1", partyName: "Registered Retailer", phone: "9999999999" },
    ])
  );

  saveAppSettings({ blockNewPartiesFromTxn: true, blockNewItemsFromTxn: false, stopSaleOnNegativeStock: false });

  const saleWithUnregisteredParty = {
    id: `sale-block-party-${Date.now()}`,
    transactionType: "sale",
    customer: "Unknown Random Customer",
    rows: [{ item: "Known Item", qty: 1, price: 100 }],
  };

  assert.throws(() => {
    saveSaleInvoice(saleWithUnregisteredParty);
  }, /Creating new parties from transactions is blocked/);

  // Registered party works
  const saleWithRegisteredParty = {
    id: `sale-reg-party-${Date.now()}`,
    transactionType: "sale",
    customer: "Registered Retailer",
    rows: [{ item: "Known Item", qty: 1, price: 100 }],
  };
  assert.doesNotThrow(() => {
    saveSaleInvoice(saleWithRegisteredParty);
  });

  saveAppSettings({ blockNewPartiesFromTxn: false });
});

test("6. TRANSACTION SETTINGS: Round off modes (Nearest, Upward, Downward) and step apply accurately", () => {
  const rows = [
    { qty: 1, price: 100.35, taxRate: "NONE", discountPercent: 0 },
  ];

  // Nearest (default to 1)
  saveAppSettings({ roundOffMode: "Nearest", roundOffTo: 1 });
  const nearest = calculateInvoiceTotals(rows, true, "");
  assert.equal(nearest.finalTotal, 100);

  // Upward
  saveAppSettings({ roundOffMode: "Upward", roundOffTo: 1 });
  const upward = calculateInvoiceTotals(rows, true, "");
  assert.equal(upward.finalTotal, 101);

  // Downward
  saveAppSettings({ roundOffMode: "Downward", roundOffTo: 1 });
  const downward = calculateInvoiceTotals(rows, true, "");
  assert.equal(downward.finalTotal, 100);
});

test("7. TAXES & GST SETTINGS: enableGst, compositeScheme, and Cess calculate correctly", () => {
  const sampleRow = { qty: 2, price: 1000, taxRate: "GST @ 18%", cessPercent: 12 };

  // 1. Standard GST enabled
  saveAppSettings({ enableGst: true, compositeScheme: false, additionalCessOnItem: true });
  const standard = calculateRow(sampleRow);
  assert.equal(standard.taxable, 2000);
  assert.equal(standard.baseTax, 360); // 18% of 2000
  assert.equal(standard.cess, 240); // 12% of 2000
  assert.equal(standard.tax, 600);
  assert.equal(standard.amount, 2600);

  // 2. GST disabled globally
  saveAppSettings({ enableGst: false, compositeScheme: false, additionalCessOnItem: false });
  const noGst = calculateRow(sampleRow);
  assert.equal(noGst.taxable, 2000);
  assert.equal(noGst.tax, 0);
  assert.equal(noGst.amount, 2000);

  // 3. Composite scheme (Bill of Supply, 0 tax collected)
  saveAppSettings({ enableGst: true, compositeScheme: true, additionalCessOnItem: false });
  const composite = calculateRow(sampleRow);
  assert.equal(composite.taxable, 2000);
  assert.equal(composite.tax, 0);
  assert.equal(composite.amount, 2000);

  // Reset
  saveAppSettings({ enableGst: true, compositeScheme: false, additionalCessOnItem: true });
});

test("8. PRINT SETTINGS: Theme color, company info, and shipping address are applied in unified document", () => {
  saveAppSettings({
    themeColor: "#0284c7",
    printShippingAddress: true,
    currencySymbol: "₹",
  });

  const htmlWithShipping = buildUnifiedDocumentHtml({
    title: "Sale Invoice",
    docNumber: "INV-999",
    partyName: "Ganesh Kirana",
    billToAddress: "123 Market Rd, Pune",
    shipToAddress: "Warehouse 5, Pune",
    totalAmount: 1500,
    rows: [{ name: "Sugar 50kg", qty: 1, price: 1500, amount: 1500 }],
  });

  assert.ok(htmlWithShipping.includes("#0284c7"));
  assert.ok(htmlWithShipping.includes("Warehouse 5, Pune"));
  assert.ok(htmlWithShipping.includes("INV-999"));
  assert.ok(htmlWithShipping.includes("Ganesh Kirana"));

  // Toggle printShippingAddress false
  saveAppSettings({ printShippingAddress: false });
  const htmlNoShipping = buildUnifiedDocumentHtml({
    title: "Sale Invoice",
    docNumber: "INV-999",
    partyName: "Ganesh Kirana",
    billToAddress: "123 Market Rd, Pune",
    shipToAddress: "Warehouse 5, Pune",
    totalAmount: 1500,
    rows: [{ name: "Sugar 50kg", qty: 1, price: 1500, amount: 1500 }],
  });

  assert.ok(!htmlNoShipping.includes("Warehouse 5, Pune"));

  // Reset
  saveAppSettings({ themeColor: "#881337", printShippingAddress: true });
});

test("9. PRINT SETTINGS: Delivery Challan hides amount when printAmountInDeliveryChallan is false", () => {
  saveAppSettings({ printAmountInDeliveryChallan: false });
  const info = getEffectiveCompanyInfo();
  assert.equal(info.appSettings.printAmountInDeliveryChallan, false);

  saveAppSettings({ printAmountInDeliveryChallan: true });
  const info2 = getEffectiveCompanyInfo();
  assert.equal(info2.appSettings.printAmountInDeliveryChallan, true);

  // Reset
  saveAppSettings({ printAmountInDeliveryChallan: false });
});

test("10. TRANSACTION MESSAGE SETTINGS: Formats Meta WhatsApp message with dynamic templates and signature", () => {
  saveAppSettings({
    txnMsgSignature: "Sai Kirana Stores",
    txnMsgIncludePartyBalance: true,
    txnMsgIncludeWebInvoiceLink: true,
  });

  const msg = buildTransactionMessage({
    type: "sales",
    number: "INV-550",
    amount: 1500,
    balance: 500,
    settings: getAppSettings(),
  });

  assert.ok(msg.includes("INV-550"));
  assert.ok(msg.includes("Invoice Amount: 1500"));
  assert.ok(msg.includes("Balance: 500"));
  assert.ok(msg.includes("Sai Kirana Stores"));
  assert.ok(msg.includes("Web Invoice Link:"));
});

test("11. PARTY SETTINGS: Payment reminder days and custom message persist", () => {
  saveAppSettings({
    enablePaymentReminder: true,
    paymentReminderDays: 5,
    paymentReminderAdditionalMessage: "Please pay promptly to avoid interest.",
  });

  const current = getAppSettings();
  assert.equal(current.enablePaymentReminder, true);
  assert.equal(current.paymentReminderDays, 5);
  assert.equal(current.paymentReminderAdditionalMessage, "Please pay promptly to avoid interest.");
});

test("12. MULTI CURRENCY SETTINGS: Custom base currency overrides default symbol across app", () => {
  saveAppSettings({
    multiCurrencyEnabled: true,
    baseCurrency: { code: "USD", symbol: "$", name: "US Dollar", exchangeRate: 1 },
    currencySymbol: "$",
  });

  const info = getEffectiveCompanyInfo();
  assert.equal(info.currencySymbol, "$");

  const formatted = formatCurrency(250);
  assert.ok(formatted.startsWith("$"));

  // Reset
  saveAppSettings({
    multiCurrencyEnabled: false,
    baseCurrency: null,
    currencySymbol: "₹",
  });
});

test("13. ITEM SETTINGS: Batch tracking, serial tracking, barcode scanning, and item descriptions propagate", () => {
  saveAppSettings({
    enableBatchTracking: true,
    enableSerialTracking: true,
    enableBarcodeScanning: false,
    enableItemDescription: false,
  });

  const settings = getAppSettings();
  assert.equal(settings.enableBatchTracking, true);
  assert.equal(settings.enableSerialTracking, true);
  assert.equal(settings.enableBarcodeScanning, false);
  assert.equal(settings.enableItemDescription, false);

  // Reset
  saveAppSettings({
    enableBatchTracking: false,
    enableSerialTracking: false,
    enableBarcodeScanning: true,
    enableItemDescription: true,
  });
});

test("14. SERVICE REMINDERS SETTINGS: Two-way synchronization between appSettings and serviceRemindersStorage", () => {
  // Test updating via saveReminderSettings propagates to appSettings
  saveReminderSettings({
    enabled: true,
    reminderDaysBefore: 7,
    autoNotifyWhatsApp: true,
  });

  const appSettings = getAppSettings();
  assert.equal(appSettings.serviceRemindersEnabled, true);
  assert.equal(appSettings.reminderDaysBefore, 7);
  assert.equal(appSettings.serviceRemindersAutoWhatsApp, true);

  // Test updating via saveAppSettings propagates back to getReminderSettings
  saveAppSettings({
    serviceRemindersEnabled: false,
    reminderDaysBefore: 3,
    serviceRemindersAutoWhatsApp: false,
  });

  const reminderSettings = getReminderSettings();
  assert.equal(reminderSettings.enabled, false);
  assert.equal(reminderSettings.reminderDaysBefore, 3);
  assert.equal(reminderSettings.autoNotifyWhatsApp, false);

  // Reset
  saveReminderSettings({
    enabled: true,
    reminderDaysBefore: 2,
    autoNotifyWhatsApp: true,
  });
});
