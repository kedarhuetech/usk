import test from "node:test";
import assert from "node:assert/strict";
import { buildCashLedger, calculateCashBalance, loadCashInHandData, saveCashAdjustment, validateCashAdjustment } from "./cashInHand.js";

const sale = (overrides = {}) => ({ id: "s1", saleType: "credit", form: { paymentType: "Cash", invoiceDate: "2026-10-28" }, totals: { finalTotal: 100, received: 25 }, ...overrides });
const purchase = (overrides = {}) => ({ id: "p1", form: { paymentType: "Cash", invoiceDate: "2026-10-28" }, totals: { finalTotal: 80, received: 30 }, ...overrides });

test("cash sales include received amounts while bank, credit and void sales are excluded", () => {
  const entries = buildCashLedger([
    sale(),
    sale({ id: "s2", saleType: "cash", totals: { finalTotal: 100, received: 0 } }),
    sale({ id: "s3", form: { paymentType: "Bank A/C" } }),
    sale({ id: "s4", cancelled: true }),
  ]);
  assert.deepEqual(entries.map((entry) => entry.amount).sort((left, right) => left - right), [25, 100]);
  assert.equal(calculateCashBalance(entries), 125);
});

test("cash supplier payments decrease cash and non-cash purchases do not", () => {
  const entries = buildCashLedger([], [purchase(), purchase({ id: "p2", form: { paymentType: "Cheque" } })]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].direction, "out");
  assert.equal(calculateCashBalance(entries), -30);
});

test("adjustments retain signed amount in cash balance", () => {
  const entries = buildCashLedger([], [], [{ id: "a1", amount: -2.15, date: "2026-10-28", reason: "Count" }]);
  assert.equal(entries[0].amount, 2.15);
  assert.equal(calculateCashBalance(entries), -2.15);
});

test("cash adjustment validation requires a real difference and reason", () => {
  assert.match(validateCashAdjustment({ recordedBalance: 100, actualBalance: 95, reason: "Counted" }), /^$/);
  assert.match(validateCashAdjustment({ recordedBalance: 100, actualBalance: 100, reason: "Counted" }), /matches/);
  assert.match(validateCashAdjustment({ recordedBalance: 100, actualBalance: 95, reason: "" }), /reason/);
});

test("cash adjustments persist in browser local storage and load after a refresh", async () => {
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } };
  try {
    const record = { id: "local-adjustment", date: "2026-10-28", actualBalance: 12, recordedBalance: 10, amount: 2, reason: "Cash count" };
    saveCashAdjustment(record);
    saveCashAdjustment(record);
    const result = await loadCashInHandData();
    assert.equal(result.complete, true);
    assert.equal(result.entries.filter((entry) => entry.sourceId === record.id).length, 1);
    assert.equal(calculateCashBalance(result.entries), 2);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
