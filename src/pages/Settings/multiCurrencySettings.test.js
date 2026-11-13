import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  getAppSettings,
  saveAppSettings,
} from "../../services/appSettingsStorage.js";
import { STANDARD_CURRENCIES } from "../../constants/multiCurrencyData.js";

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

test("Multi Currency default settings match USK desktop empty state", () => {
  const settings = getAppSettings();

  assert.equal(settings.multiCurrencyEnabled, false);
  assert.equal(settings.multiCurrencyGetLiveRate, false);
  assert.equal(settings.baseCurrency, null);
  assert.ok(Array.isArray(settings.multiCurrencyList));
  assert.equal(settings.multiCurrencyList.length, 0);
});

test("STANDARD_CURRENCIES contains key world currencies", () => {
  const inr = STANDARD_CURRENCIES.find((c) => c.code === "INR");
  const usd = STANDARD_CURRENCIES.find((c) => c.code === "USD");
  const aed = STANDARD_CURRENCIES.find((c) => c.code === "AED");

  assert.ok(inr, "INR exists");
  assert.equal(inr.symbol, "₹");
  assert.ok(usd, "USD exists");
  assert.equal(usd.symbol, "$");
  assert.ok(aed, "AED exists");
});

test("Multi Currency settings can save base currency and secondary currencies", () => {
  const baseCurr = {
    id: "base-inr",
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    exchangeRate: 1,
    setOnDate: "06/11/2026",
    isBase: true,
  };

  const usdCurr = {
    id: "curr-usd",
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    exchangeRate: 86.5,
    setOnDate: "06/11/2026",
    isBase: false,
  };

  saveAppSettings({
    multiCurrencyEnabled: true,
    multiCurrencyGetLiveRate: true,
    baseCurrency: baseCurr,
    multiCurrencyBase: baseCurr,
    multiCurrencyList: [baseCurr, usdCurr],
  });

  const updated = getAppSettings();
  assert.equal(updated.multiCurrencyEnabled, true);
  assert.equal(updated.multiCurrencyGetLiveRate, true);
  assert.equal(updated.baseCurrency?.code, "INR");
  assert.equal(updated.multiCurrencyList.length, 2);
  assert.equal(updated.multiCurrencyList[1].code, "USD");
  assert.equal(updated.multiCurrencyList[1].exchangeRate, 86.5);
});
