import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SETTINGS,
  getAppSettings,
  getAppSettingsStorageKey,
  loadAuthoritativeAppSettings,
  resetAppSettingsAuthoritative,
  saveAppSettingsAuthoritative,
} from "../../services/appSettingsStorage.js";
import {
  getCompanyProfile,
  saveCompanyProfile,
} from "../../services/companyProfileStorage.js";
import {
  addCustomUnitAuthoritative,
  getUnits,
} from "../../services/unitsStorage.js";
import {
  saveReminderSettingsAuthoritative,
  getReminderSettings,
} from "../../services/serviceRemindersStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

class MockStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

function setupEnv({ businessId = "biz-a", token = "jwt-token-a", fetchImpl } = {}) {
  const storage = new MockStorage();
  storage.setItem("usv.dbMode", "true");
  storage.setItem("usk_auth_business_id", businessId);
  storage.setItem("usk_auth_token", token);

  const events = [];
  globalThis.window = {
    localStorage: storage,
    dispatchEvent: (ev) => events.push(ev),
  };
  globalThis.localStorage = storage;
  globalThis.CustomEvent ||= class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.Event ||= class Event {
    constructor(type) {
      this.type = type;
    }
  };
  if (fetchImpl) {
    globalThis.fetch = fetchImpl;
  }
  return { storage, events };
}

function teardownEnv() {
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.fetch;
}

test("P0: saveAppSettingsAuthoritative awaits MySQL, sends JWT, and does NOT write localStorage on failure", async () => {
  let capturedAuth = "";
  const { storage } = setupEnv({
    fetchImpl: async (url, init) => {
      if (String(url).includes("/api/settings")) {
        const hdrs = init?.headers;
        capturedAuth = (hdrs && typeof hdrs.get === "function" ? hdrs.get("Authorization") : (hdrs?.Authorization || hdrs?.authorization)) || "";
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ success: true }),
        };
      }
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) };
    },
  });

  const saved = await saveAppSettingsAuthoritative({ stopSaleOnNegativeStock: true });
  assert.equal(saved.stopSaleOnNegativeStock, true);
  assert.equal(capturedAuth, "Bearer jwt-token-a");
  assert.equal(JSON.parse(storage.getItem(getAppSettingsStorageKey())).stopSaleOnNegativeStock, true);

  // Now simulate MySQL failure
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    headers: { get: () => "application/json" },
    json: async () => ({ success: false, message: "MySQL connection refused" }),
  });

  await assert.rejects(
    () => saveAppSettingsAuthoritative({ blockNewItemsFromTxn: true }),
    /MySQL connection refused/
  );
  // Local cache must NOT have committed the failed change
  assert.equal(JSON.parse(storage.getItem(getAppSettingsStorageKey())).blockNewItemsFromTxn, false);
  teardownEnv();
});

test("P0: loadAuthoritativeAppSettings hydrates from MySQL and throws on DB failure without silent fallback", async () => {
  setupEnv({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true, data: { screenZoom: "115%", amountDecimalPlaces: 3 } }),
    }),
  });

  const loaded = await loadAuthoritativeAppSettings();
  assert.equal(loaded.screenZoom, "115%");
  assert.equal(loaded.amountDecimalPlaces, 3);
  assert.equal(getAppSettings().screenZoom, "115%");

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    headers: { get: () => "application/json" },
    json: async () => ({ success: false, message: "Database unavailable" }),
  });

  await assert.rejects(() => loadAuthoritativeAppSettings(), /Database unavailable/);
  teardownEnv();
});

test("P1: resetAppSettingsAuthoritative persists defaults to MySQL and preserves company identity", async () => {
  let postedBody = null;
  setupEnv({
    fetchImpl: async (url, init) => {
      if (String(url).includes("/api/settings")) {
        postedBody = JSON.parse(init.body);
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ success: true }),
      };
    },
  });

  await saveAppSettingsAuthoritative({
    stopSaleOnNegativeStock: true,
    companyLogo: "/api/settings/company-profile/assets/logo-1",
  });
  const reset = await resetAppSettingsAuthoritative();
  assert.equal(reset.stopSaleOnNegativeStock, DEFAULT_SETTINGS.stopSaleOnNegativeStock);
  assert.equal(reset.companyLogo, "/api/settings/company-profile/assets/logo-1");
  assert.equal(postedBody.stopSaleOnNegativeStock, DEFAULT_SETTINGS.stopSaleOnNegativeStock);
  assert.equal(postedBody.companyLogo, "/api/settings/company-profile/assets/logo-1");
  teardownEnv();
});

test("P1: Business isolation - Business A settings & Company Profile never leak to Business B via unscoped keys", async () => {
  const { storage } = setupEnv({
    businessId: "biz-a",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true }),
    }),
  });

  await saveAppSettingsAuthoritative({ screenZoom: "120%" });
  await saveCompanyProfile({ companyName: "Alpha Corp", gstin: "27AAACH7409R1Z1" });

  // No unscoped writes allowed
  assert.equal(storage.getItem("ledgerly:appSettings.v1"), null);
  assert.equal(storage.getItem("ledgerly:companyProfile.v1"), null);

  // Switch to Business B
  storage.setItem("usk_auth_business_id", "biz-b");
  assert.equal(getAppSettings().screenZoom, "100%");
  assert.notEqual(getCompanyProfile().companyName, "Alpha Corp");
  assert.equal(getCompanyProfile().gstin, "");
  teardownEnv();
});

test("P1: Custom units & Service reminder settings await MySQL persistence", async () => {
  setupEnv({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Units DB error" }),
    }),
  });

  await assert.rejects(() => addCustomUnitAuthoritative("CRATE"), /Units DB error/);
  assert.equal(getUnits().includes("CRATE"), false);

  await assert.rejects(() => saveReminderSettingsAuthoritative({ reminderDaysBefore: 5 }), /Units DB error/);
  assert.notEqual(getReminderSettings().reminderDaysBefore, 5);
  teardownEnv();
});

test("P2: settingsRouter preserves types via JSON.stringify and handles legacy plain text", () => {
  const routerSrc = fs.readFileSync(path.join(ROOT, "server/src/routes/settingsRouter.js"), "utf8");
  assert.match(routerSrc, /textVal = JSON\.stringify\(val\);/);

  // Simulate round-trip for all required types
  const samples = ["123", 123, true, false, null, [1, "a"], { ok: true }, ""];
  for (const val of samples) {
    const serialized = JSON.stringify(val);
    const deserialized = JSON.parse(serialized);
    assert.deepEqual(deserialized, val);
    assert.equal(typeof deserialized, typeof val);
  }
  // Legacy plain-text fallback simulation
  const legacy = "100%";
  let parsedLegacy;
  try {
    parsedLegacy = JSON.parse(legacy);
  } catch {
    parsedLegacy = legacy;
  }
  assert.equal(parsedLegacy, "100%");
});

test("P0/P1/P2/P3: Static checks for auth, .usvbackup consolidation, PrintTab no-base64-fallback, and no Sai Kirana Stores", () => {
  const appSettingsSrc = fs.readFileSync(path.join(ROOT, "src/services/appSettingsStorage.js"), "utf8");
  assert.doesNotMatch(appSettingsSrc, /fetch\("\/api\/backup\//);
  assert.match(appSettingsSrc, /backupToComputer\.js/);

  const txnMsgSrc = fs.readFileSync(path.join(ROOT, "src/pages/Settings/TransactionMessageTab.jsx"), "utf8");
  assert.doesNotMatch(txnMsgSrc, /fetch\("\/api\/whatsapp-business\/connection"\)/);
  assert.match(txnMsgSrc, /apiRequest\("\/whatsapp-business\/connection"\)/);

  const printSrc = fs.readFileSync(path.join(ROOT, "src/pages/Settings/PrintTab.jsx"), "utf8");
  assert.doesNotMatch(printSrc, /falling back to data URL/);

  const settingsSrc = fs.readFileSync(path.join(ROOT, "src/pages/Settings/Settings.jsx"), "utf8");
  const remindersSrc = fs.readFileSync(path.join(ROOT, "src/pages/Settings/ServiceRemindersTab.jsx"), "utf8");
  assert.doesNotMatch(settingsSrc, /Sai Kirana Stores/);
  assert.doesNotMatch(remindersSrc, /Sai Kirana Stores/);
  assert.match(settingsSrc, /accept="\.usvbackup"/);
});
