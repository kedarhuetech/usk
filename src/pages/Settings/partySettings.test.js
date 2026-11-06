import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  getAppSettings,
  saveAppSettings,
} from "../../services/appSettingsStorage.js";
import { getParties, saveParty } from "../../services/partiesStorage.js";

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

test("Party settings exist with correct defaults matching Vyapar desktop", () => {
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

