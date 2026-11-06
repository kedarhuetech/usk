import assert from "node:assert/strict";
import test from "node:test";
import { getSaleInvoices, saveSaleInvoice, saleInvoicesStorageKey, setSaleInvoiceLifecycle } from "./salesStorage.js";
import { calculateInvoiceSettlement } from "./partyBalances.js";
import { APP_SETTINGS_KEY } from "./appSettingsStorage.js";
import { inventoryItemsStorageKey } from "./itemsStorage.js";

test("editing a received amount updates the canonical saved sale and survives reload", () => {
  const previousWindow = globalThis.window;
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.has(key) ? data.get(key) : null,
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
    },
    dispatchEvent: () => true,
  };
  try {
    const invoice = { id: "regression-sale-288", transactionType: "sale", saleType: "credit", totals: { finalTotal: 288, received: 0 }, stockAdjustedAt: "already-adjusted" };
    saveSaleInvoice(invoice);
    assert.equal(calculateInvoiceSettlement(getSaleInvoices()[0], { kind: "sale" }).status, "Unpaid");

    saveSaleInvoice({ ...getSaleInvoices()[0], totals: { finalTotal: 288, received: 288 } });
    const refreshed = getSaleInvoices().find((record) => record.id === invoice.id);
    assert.equal(calculateInvoiceSettlement(refreshed, { kind: "sale" }).status, "Paid");
    assert.equal(calculateInvoiceSettlement(refreshed, { kind: "sale" }).outstanding, 0);
    assert.equal(JSON.parse(data.get(saleInvoicesStorageKey)).filter((record) => record.id === invoice.id).length, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("cancelled invoice lifecycle and payment status persist independently", () => {
  const previousWindow = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }, dispatchEvent: () => true };
  try {
    const initial = saveSaleInvoice({ id: "cancelled-sale-1", transactionType: "sale", totals: { finalTotal: 120, received: 0 }, stockAdjustedAt: "already-adjusted" });
    setSaleInvoiceLifecycle(initial.id, "Cancelled");
    saveSaleInvoice({ ...getSaleInvoices()[0], totals: { finalTotal: 120, received: 120 } });

    const reloaded = getSaleInvoices().find((entry) => entry.id === initial.id);
    const settlement = calculateInvoiceSettlement(reloaded, { kind: "sale" });
    assert.equal(reloaded.invoiceStatus, "Cancelled");
    assert.equal(reloaded.cancelled, true);
    assert.equal(settlement.invoiceStatus, "Cancelled");
    assert.equal(settlement.paymentStatus, "Paid");
    assert.equal(settlement.paid, 120);
    assert.equal(settlement.outstanding, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("batch enabled sale deducts only the selected batch and rejects expired or short batches", () => {
  const previousWindow = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }, dispatchEvent: () => true };
  try {
    data.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    data.set(inventoryItemsStorageKey, JSON.stringify([{ id: "i1", itemName: "Medicine", openingQuantity: "12", stock: "12", batches: [
      { id: "b1", batchNo: "A", expDate: "2000-01-01", openingQty: "5" },
      { id: "b2", batchNo: "B", expDate: "2099-02-01", openingQty: "7" },
    ] }]));
    saveSaleInvoice({ id: "batch-sale-1", transactionType: "sale", rows: [{ id: "r1", sourceItemId: "i1", item: "Medicine", batchNo: "B", expDate: "2099-02-01", qty: "3" }] });
    let item = JSON.parse(data.get(inventoryItemsStorageKey))[0];
    assert.equal(item.batches[0].openingQty, "5");
    assert.equal(item.batches[1].openingQty, "4");
    assert.equal(item.openingQuantity, "9");
    assert.throws(() => saveSaleInvoice({ id: "batch-sale-expired", transactionType: "sale", rows: [{ id: "r2", sourceItemId: "i1", item: "Medicine", batchNo: "A", qty: "1" }] }), /expired/);
    assert.throws(() => saveSaleInvoice({ id: "batch-sale-short", transactionType: "sale", rows: [{ id: "r3", sourceItemId: "i1", item: "Medicine", batchNo: "B", qty: "5" }] }), /only 4 in stock/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("batch sale edit and cancellation reverse the exact allocation once", () => {
  const previousWindow = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: { getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }, dispatchEvent: () => true };
  try {
    data.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    data.set(inventoryItemsStorageKey, JSON.stringify([{ id: "i1", itemName: "Medicine", openingQuantity: "10", stock: "10", batches: [{ id: "b1", batchNo: "A", expDate: "2099-01-01", openingQty: "4" }, { id: "b2", batchNo: "B", expDate: "2099-02-01", openingQty: "6" }] }]));
    let sale = saveSaleInvoice({ id: "batch-sale-edit", transactionType: "sale", rows: [{ id: "r1", sourceItemId: "i1", item: "Medicine", batchNo: "A", qty: "2" }] });
    sale = saveSaleInvoice({ ...sale, rows: [{ id: "r1", sourceItemId: "i1", item: "Medicine", batchNo: "B", qty: "3" }] });
    let item = JSON.parse(data.get(inventoryItemsStorageKey))[0];
    assert.equal(item.batches[0].openingQty, "4");
    assert.equal(item.batches[1].openingQty, "3");
    setSaleInvoiceLifecycle(sale.id, "Cancelled");
    setSaleInvoiceLifecycle(sale.id, "Cancelled");
    item = JSON.parse(data.get(inventoryItemsStorageKey))[0];
    assert.equal(item.batches[1].openingQty, "6");
  } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});
