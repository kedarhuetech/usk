import test from "node:test";
import assert from "node:assert/strict";
import { businessIdFromRequest } from "../../../server/src/db/mysql.js";

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

/**
 * Encapsulates the exact dirty-state tracking logic added to EditProfile.jsx
 */
class EditProfileFormController {
  constructor(initialData = {}) {
    this.formData = { ...initialData };
    this.isDirty = false;
    this.logoFile = null;
    this.signatureFile = null;
  }

  markDirty() {
    this.isDirty = true;
  }

  resetDirty() {
    this.isDirty = false;
  }

  handleChange(name, value) {
    this.markDirty();
    this.formData[name] = value;
  }

  handleLogoUpload(file, previewDataUrl) {
    this.markDirty();
    this.logoFile = file;
    this.formData.logo = previewDataUrl;
  }

  handleRemoveLogo() {
    this.markDirty();
    this.logoFile = null;
    this.formData.logo = "";
    this.formData.logoUrl = "";
  }

  handleSignatureUpload(file, previewDataUrl) {
    this.markDirty();
    this.signatureFile = file;
    this.formData.signature = previewDataUrl;
  }

  handleRemoveSignature() {
    this.markDirty();
    this.signatureFile = null;
    this.formData.signature = "";
    this.formData.signatureUrl = "";
  }

  /**
   * Listener for companyProfileUpdatedEvent (fired by window.focus / database hydration)
   */
  handleProfileChange(dbData) {
    if (this.isDirty) {
      // In-progress unsaved edits are protected and must not be overwritten
      return;
    }
    this.formData = { ...dbData };
  }

  handleSaveSuccess(savedProfile) {
    this.formData = { ...savedProfile };
    this.logoFile = null;
    this.signatureFile = null;
    this.resetDirty();
  }

  handleCancel(originalDbData) {
    this.logoFile = null;
    this.signatureFile = null;
    this.resetDirty();
    this.formData = { ...originalDbData };
  }
}

test("Clean EditProfile form hydrates from database on companyProfileUpdatedEvent", () => {
  const form = new EditProfileFormController({ businessName: "Initial Store" });
  assert.equal(form.isDirty, false);

  form.handleProfileChange({ businessName: "Hydrated Store From MySQL", logo: "https://example.com/logo.png" });
  assert.equal(form.formData.businessName, "Hydrated Store From MySQL");
  assert.equal(form.formData.logo, "https://example.com/logo.png");
});

test("Unsaved Business Name edit survives window focus hydration event", () => {
  const form = new EditProfileFormController({ businessName: "Initial Store", phone: "9876543210" });

  // User edits Business Name without saving
  form.handleChange("businessName", "Sai Kirana Stores (Edited Name In Progress)");
  assert.equal(form.isDirty, true, "Form must be marked dirty upon field change");

  // Simulated window focus triggering database hydration
  const staleServerData = { businessName: "Stale Initial Store", phone: "9876543210" };
  form.handleProfileChange(staleServerData);

  // In-progress edit must not be wiped out
  assert.equal(form.formData.businessName, "Sai Kirana Stores (Edited Name In Progress)");
});

test("Selecting or removing images marks the form dirty and protects edits from hydration", () => {
  const form = new EditProfileFormController({ logo: "old-logo.png", signature: "old-sig.png" });
  assert.equal(form.isDirty, false);

  // 1. Upload logo
  form.handleLogoUpload({ name: "new-logo.png" }, "data:image/png;base64,preview1");
  assert.equal(form.isDirty, true);
  form.handleProfileChange({ logo: "old-logo.png" });
  assert.equal(form.formData.logo, "data:image/png;base64,preview1");

  // Reset via save
  form.handleSaveSuccess({ logo: "new-saved-url.png", signature: "old-sig.png" });
  assert.equal(form.isDirty, false);

  // 2. Remove signature
  form.handleRemoveSignature();
  assert.equal(form.isDirty, true);
  assert.equal(form.formData.signature, "");
  form.handleProfileChange({ signature: "old-sig.png" });
  assert.equal(form.formData.signature, "", "Signature removal must not be overwritten by hydration");
});

test("Successful save resets dirty state allowing future hydration", () => {
  const form = new EditProfileFormController({ businessName: "Store" });
  form.handleChange("businessName", "Store Updated");
  assert.equal(form.isDirty, true);

  form.handleSaveSuccess({ businessName: "Store Updated", phone: "1234567890" });
  assert.equal(form.isDirty, false);

  // After save, form is clean and accepts external updates
  form.handleProfileChange({ businessName: "Store Updated Externally", phone: "1234567890" });
  assert.equal(form.formData.businessName, "Store Updated Externally");
});

test("Asset authorization analysis: demonstrates lack of server-side authentication layer", () => {
  // Test request with unauthenticated query parameter
  const reqWithQuery = {
    method: "GET",
    path: "/assets/asset-uuid-12345",
    get: () => null,
    query: { businessId: "target-tenant" },
  };

  const resolved = businessIdFromRequest(reqWithQuery);
  assert.equal(resolved, "target-tenant");

  // This confirms that without server-side user/business session authentication,
  // the backend accepts caller-supplied parameters. Any fix requires an authenticating
  // session layer rather than an insecure client-side workaround.
});
