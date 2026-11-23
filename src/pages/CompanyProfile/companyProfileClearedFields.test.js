import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCompanyProfile, saveCompanyProfile } from "../../services/companyProfileStorage.js";

// Mock localStorage and window events for node environment
if (typeof window === "undefined" || !window.localStorage) {
  const store = new Map();
  const listeners = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    addEventListener: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      const list = listeners.get(event) || [];
      listeners.set(event, list.filter((h) => h !== handler));
    },
    dispatchEvent: (evt) => {
      const handlers = listeners.get(evt?.type || "") || [];
      for (const h of handlers) h(evt);
      return true;
    },
  };
}

test("Regression Protection 1: normalizeCompanyProfile preserves empty fields as empty strings", () => {
  const dbData = {
    company_name: "Test Business",
    trade_name: null,
    gstin: null,
    pan: null,
    phone: null,
    email: null,
    street_address: null,
    city: null,
    state: null,
    pincode: null,
    bank_name: null,
    account_number: null,
    ifsc_code: null,
    branch_name: null,
    upi_id: null,
    terms_and_conditions: null,
    logo_url: null,
    signature_url: null,
  };

  const normalized = normalizeCompanyProfile(dbData);
  assert.equal(normalized.tradeName, "");
  assert.equal(normalized.gstin, "");
  assert.equal(normalized.pan, "");
  assert.equal(normalized.phone, "");
  assert.equal(normalized.phoneNumber, "");
  assert.equal(normalized.email, "");
  assert.equal(normalized.emailId, "");
  assert.equal(normalized.streetAddress, "");
  assert.equal(normalized.businessAddress, "");
  assert.equal(normalized.city, "");
  assert.equal(normalized.state, "");
  assert.equal(normalized.pincode, "");
  assert.equal(normalized.bankName, "");
  assert.equal(normalized.accountNumber, "");
  assert.equal(normalized.ifscCode, "");
  assert.equal(normalized.branchName, "");
  assert.equal(normalized.upiId, "");
  assert.equal(normalized.termsAndConditions, "");
  assert.equal(normalized.logo, "");
  assert.equal(normalized.logoUrl, "");
  assert.equal(normalized.signature, "");
  assert.equal(normalized.signatureUrl, "");
  assert.equal(normalized.bankDetails.bankName, "");
  assert.equal(normalized.bankDetails.accountNumber, "");
});

test("Regression Protection 2: saveCompanyProfile does NOT resurrect cleared aliases from current state", async () => {
  // Pre-seed localStorage with populated company profile
  const initial = {
    companyName: "Acme Corp",
    businessName: "Acme Corp",
    tradeName: "Acme Trade",
    phoneNumber: "9876543210",
    phone: "9876543210",
    emailId: "acme@example.com",
    email: "acme@example.com",
    businessAddress: "456 Market Road",
    streetAddress: "456 Market Road",
    bankName: "HDFC Bank",
    accountNumber: "1234567890",
    ifscCode: "HDFC0001234",
    branchName: "Metro Branch",
    upiId: "acme@hdfc",
    bankDetails: {
      bankName: "HDFC Bank",
      accountNumber: "1234567890",
      ifscCode: "HDFC0001234",
      branchName: "Metro Branch",
      upiId: "acme@hdfc",
    },
  };

  const key = "ledgerly:companyProfile.v1:demo-business";
  window.localStorage.setItem(key, JSON.stringify(initial));

  let sentPayload = null;
  // Mock settingsDb
  const mockSettingsDb = {
    saveCompanyProfile: async (profile) => {
      sentPayload = profile;
      return { success: true };
    },
  };

  // Import settingsDb dynamically or test save logic
  // We can pass the cleared profile:
  const clearedUpdate = {
    companyName: "Acme Corp",
    phoneNumber: "", // User cleared phone
    emailId: "", // User cleared email
    businessAddress: "", // User cleared address
    bankName: "", // User cleared bankName
    accountNumber: "", // User cleared accountNumber
    ifscCode: "",
    branchName: "",
    upiId: "",
  };

  // Mock settingsDb by swapping in saveCompanyProfile
  const { settingsDb } = await import("../../services/databaseRepository.js");
  const originalSave = settingsDb.saveCompanyProfile;
  settingsDb.saveCompanyProfile = async (p) => {
    sentPayload = p;
    return { success: true };
  };

  try {
    const updated = await saveCompanyProfile(clearedUpdate);

    // Verify sent payload has empty values and aliases are not revived
    assert.equal(sentPayload.phoneNumber, "", "sentPayload.phoneNumber must remain empty");
    assert.equal(sentPayload.phone, "", "sentPayload.phone must remain empty");
    assert.equal(sentPayload.emailId, "", "sentPayload.emailId must remain empty");
    assert.equal(sentPayload.email, "", "sentPayload.email must remain empty");
    assert.equal(sentPayload.businessAddress, "", "sentPayload.businessAddress must remain empty");
    assert.equal(sentPayload.streetAddress, "", "sentPayload.streetAddress must remain empty");
    assert.equal(sentPayload.bankName, "", "sentPayload.bankName must remain empty");
    assert.equal(sentPayload.accountNumber, "", "sentPayload.accountNumber must remain empty");
    assert.equal(sentPayload.ifscCode, "", "sentPayload.ifscCode must remain empty");
    assert.equal(sentPayload.branchName, "", "sentPayload.branchName must remain empty");
    assert.equal(sentPayload.upiId, "", "sentPayload.upiId must remain empty");
    assert.equal(sentPayload.bankDetails.bankName, "", "sentPayload.bankDetails.bankName must be empty");
    assert.equal(sentPayload.bankDetails.accountNumber, "", "sentPayload.bankDetails.accountNumber must be empty");

    // Verify returned updated profile also maintains empty values
    assert.equal(updated.phoneNumber, "");
    assert.equal(updated.phone, "");
    assert.equal(updated.emailId, "");
    assert.equal(updated.email, "");
    assert.equal(updated.businessAddress, "");
    assert.equal(updated.streetAddress, "");
    assert.equal(updated.bankName, "");
    assert.equal(updated.bankDetails.bankName, "");
  } finally {
    settingsDb.saveCompanyProfile = originalSave;
  }
});
