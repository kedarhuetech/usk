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
} from "../../services/appSettingsStorage.js";
import { getScopedStorageKey } from "../../config/businessConfig.js";
import {
  getEffectiveCompanyInfo,
  buildUnifiedDocumentHtml,
  buildUnifiedStatementHtml,
} from "../../services/unifiedPrintService.js";

test("GSTIN Toggle in General Settings: Controls visibility of GSTIN across print and company info", () => {
  // Set up company profile with a valid GSTIN
  const profileData = {
    businessName: "Test Company Ltd",
    gstin: "27AAPFU0939F1ZV",
    phoneNumber: "9876543210",
  };
  globalThis.window.localStorage.setItem("ledgerly:companyProfile.v1", JSON.stringify(profileData));
  globalThis.window.localStorage.setItem(getScopedStorageKey("ledgerly:companyProfile.v1"), JSON.stringify(profileData));

  // 1. When enableGstin is true (default)
  saveAppSettings({ enableGstin: true, printGstinOnSale: true, companyGstin: "27AAPFU0939F1ZV" });
  assert.equal(getAppSettings().enableGstin, true);

  const compEnabled = getEffectiveCompanyInfo();
  assert.equal(compEnabled.gstin, "27AAPFU0939F1ZV");

  const docHtmlEnabled = buildUnifiedDocumentHtml({
    documentType: "sale",
    title: "Tax Invoice",
    partyName: "ABC Traders",
    partyGstin: "27ABCDE1234F1Z5",
  });
  assert.ok(docHtmlEnabled.includes("27AAPFU0939F1ZV"), "Company GSTIN must be present when enableGstin is true");
  assert.ok(docHtmlEnabled.includes("27ABCDE1234F1Z5"), "Party GSTIN must be present when enableGstin is true");

  const stmtHtmlEnabled = buildUnifiedStatementHtml({
    party: { partyName: "ABC Traders", gstin: "27ABCDE1234F1Z5" },
    rows: [],
  });
  assert.ok(stmtHtmlEnabled.includes("27AAPFU0939F1ZV"), "Statement must include company GSTIN when enabled");
  assert.ok(stmtHtmlEnabled.includes("27ABCDE1234F1Z5"), "Statement must include party GSTIN when enabled");

  // 2. When enableGstin is toggled to FALSE in General Settings
  saveAppSettings({ enableGstin: false });
  assert.equal(getAppSettings().enableGstin, false);

  const compDisabled = getEffectiveCompanyInfo();
  assert.equal(compDisabled.gstin, "", "Company GSTIN must be empty when enableGstin is false");

  const docHtmlDisabled = buildUnifiedDocumentHtml({
    documentType: "sale",
    title: "Tax Invoice",
    partyName: "ABC Traders",
    partyGstin: "27ABCDE1234F1Z5",
  });
  assert.ok(!docHtmlDisabled.includes("27AAPFU0939F1ZV"), "Company GSTIN must be suppressed when enableGstin is false");
  assert.ok(!docHtmlDisabled.includes("27ABCDE1234F1Z5"), "Party GSTIN must be suppressed when enableGstin is false");
  assert.ok(!docHtmlDisabled.includes("GSTIN:"), "GSTIN label must be completely suppressed when enableGstin is false");

  const stmtHtmlDisabled = buildUnifiedStatementHtml({
    party: { partyName: "ABC Traders", gstin: "27ABCDE1234F1Z5" },
    rows: [],
  });
  assert.ok(!stmtHtmlDisabled.includes("27AAPFU0939F1ZV"), "Statement must not include company GSTIN when disabled");
  assert.ok(!stmtHtmlDisabled.includes("27ABCDE1234F1Z5"), "Statement must not include party GSTIN when disabled");

  // 3. When enableGstin is toggled back to TRUE
  saveAppSettings({ enableGstin: true });
  assert.equal(getAppSettings().enableGstin, true);

  const compRestored = getEffectiveCompanyInfo();
  assert.equal(compRestored.gstin, "27AAPFU0939F1ZV", "Company GSTIN must be restored when enableGstin is toggled back on");
});
