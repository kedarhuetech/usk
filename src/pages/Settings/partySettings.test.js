import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  getAppSettings,
  saveAppSettings,
} from "../../services/appSettingsStorage.js";
import { getParties, saveParty } from "../../services/partiesStorage.js";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";

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

test("Party settings exist with correct defaults matching USK desktop", () => {
  const settings = getAppSettings();

  // Column 1: Party Settings
  assert.equal(settings.enablePartyGrouping, true, "enablePartyGrouping default is true");
  assert.equal(settings.enableShippingAddress, true, "enableShippingAddress default is true");
  assert.equal(settings.printShippingAddress, true, "printShippingAddress default is true");
  assert.equal(settings.managePartyStatus, true, "managePartyStatus default is true");
  assert.equal(settings.enablePaymentReminder, true, "enablePaymentReminder default is true");
  assert.equal(settings.paymentReminderDays, 1, "paymentReminderDays default is 1");
  assert.equal(typeof settings.paymentReminderAdditionalMessage, "string");

  // Column 2: Additional Fields
  assert.ok(Array.isArray(settings.partyCustomFields), "partyCustomFields is an array");
  assert.equal(settings.partyCustomFields.length, 4, "4 custom fields defined");
  assert.equal(settings.partyCustomFields[0].enabled, true);
  assert.equal(settings.partyCustomFields[0].name, "mrp");
  assert.equal(settings.partyCustomFields[0].showInPrint, true);
});

test("Party settings can be updated and retrieved reactively", () => {
  saveAppSettings({
    enablePartyGrouping: false,
    enableShippingAddress: false,
    printShippingAddress: false,
    managePartyStatus: true,
    paymentReminderDays: 7,
    paymentReminderAdditionalMessage: "Please pay before weekend.",
  });

  const updated = getAppSettings();
  assert.equal(updated.enablePartyGrouping, false);
  assert.equal(updated.enableShippingAddress, false);
  assert.equal(updated.printShippingAddress, false);
  assert.equal(updated.paymentReminderDays, 7);
  assert.equal(updated.paymentReminderAdditionalMessage, "Please pay before weekend.");
});

test("Party storage supports group, status, shippingAddress, and custom fields", () => {
  const newParty = saveParty({
    partyName: "Omkar Provision Stores",
    phone: "9823098230",
    email: "omkar@provisions.com",
    group: "Retailers",
    status: "active",
    billingAddress: "Shop 12, APMC Market",
    shippingAddress: "Warehouse 4, Hinjewadi Phase 1",
    additionalFields: [
      { id: "field-1", fieldName: "mrp", value: "450", showInPrint: true, enabled: true },
      { id: "field-4", fieldName: "Delivery Date", value: "2026-11-15", showInPrint: true, enabled: true },
    ],
  });

  assert.ok(newParty.id, "Saved party has an ID");
  assert.equal(newParty.partyName, "Omkar Provision Stores");
  assert.equal(newParty.group, "Retailers");
  assert.equal(newParty.status, "active");
  assert.equal(newParty.shippingAddress, "Warehouse 4, Hinjewadi Phase 1");
  assert.equal(newParty.additionalFields.length, 2);

  // Test toggling status to inactive
  const inactiveParty = saveParty({
    ...newParty,
    status: "inactive",
  });
  assert.equal(inactiveParty.status, "inactive");

  const parties = getParties();
  const fetched = parties.find((p) => p.id === newParty.id);
  assert.ok(fetched);
  assert.equal(fetched.status, "inactive");
});

test("printShippingAddress controls shipping address appearance in document print", () => {
  // 1. With printShippingAddress enabled
  saveAppSettings({ printShippingAddress: true });
  const htmlWithShipping = buildUnifiedDocumentHtml({
    title: "Sale Invoice",
    documentNumber: "INV-101",
    date: "2026-11-23",
    partyName: "Test Party",
    partyBillingAddress: "Billing Address 123",
    partyShippingAddress: "Shipping Address 456",
    rows: [{ index: 1, item: "Item A", qty: 2, price: 100, amount: 200 }],
    totals: { total: 200 },
  });
  assert.ok(htmlWithShipping.includes("Shipping Address 456"), "Shipping address should appear in print when enabled");

  // 2. With printShippingAddress disabled
  saveAppSettings({ printShippingAddress: false });
  const htmlWithoutShipping = buildUnifiedDocumentHtml({
    title: "Sale Invoice",
    documentNumber: "INV-102",
    date: "2026-11-23",
    partyName: "Test Party",
    partyBillingAddress: "Billing Address 123",
    partyShippingAddress: "Shipping Address 456",
    rows: [{ index: 1, item: "Item A", qty: 2, price: 100, amount: 200 }],
    totals: { total: 200 },
  });
  assert.ok(!htmlWithoutShipping.includes("Shipping Address 456"), "Shipping address should NOT appear in print when disabled");

  // Restore default
  saveAppSettings({ printShippingAddress: true });
});

test("Custom party fields configuration update and toggle showInPrint", () => {
  const customConfig = [
    { id: "field-1", enabled: true, name: "MRP", showInPrint: true, type: "text" },
    { id: "field-2", enabled: true, name: "Region", showInPrint: false, type: "text" },
    { id: "field-3", enabled: false, name: "", showInPrint: false, type: "text" },
    { id: "field-4", enabled: true, name: "Delivery Date", showInPrint: true, type: "date" },
  ];

  saveAppSettings({ partyCustomFields: customConfig });
  const settings = getAppSettings();

  assert.equal(settings.partyCustomFields[0].name, "MRP");
  assert.equal(settings.partyCustomFields[1].name, "Region");
  assert.equal(settings.partyCustomFields[1].enabled, true);
  assert.equal(settings.partyCustomFields[1].showInPrint, false);
  assert.equal(settings.partyCustomFields[3].type, "date");
});

