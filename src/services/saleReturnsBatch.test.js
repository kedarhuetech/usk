import test from "node:test";
import assert from "node:assert/strict";
import { APP_SETTINGS_KEY } from "./appSettingsStorage.js";
import { inventoryItemsStorageKey } from "./itemsStorage.js";
import { cancelSaleReturn, saveSaleReturn, saleReturnsStorageKey } from "./saleReturnsStorage.js";

test("restockable sales return restores its sold batch and cancellation reverses it once", () => {
  const prior = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }, dispatchEvent: () => true };
  try {
    data.set(APP_SETTINGS_KEY, JSON.stringify({ enableBatchTracking: true }));
    data.set(inventoryItemsStorageKey, JSON.stringify([{ id: "i", itemName: "Item", openingQuantity: "3", stock: "3", batches: [{ id: "b", batchNo: "A", expDate: "2099-01-01", openingQty: "3" }] }]));
    data.set("ledgerly:saleInvoices.v1", JSON.stringify([{ id: "s", transactionType: "sale", invoiceNumber: "S1", form: { customer: "C" }, totals: { finalTotal: 10, received: 10 }, rows: [{ id: "r", sourceItemId: "i", item: "Item", batchNo: "A", expDate: "2099-01-01", qty: 2, price: 1 }] }]));
    const record = saveSaleReturn({ id: "", type: "Credit Note", number: "1", invoiceId: "s", party: "C", date: "2026-11-06", received: 0, adjustedAmount: 0, customerCreditAmount: 1, rows: [{ id: "rr", sourceRowId: "r", sourceItemId: "i", item: "Item", batchNo: "A", expDate: "2099-01-01", qty: 1, price: 1, taxRate: "NONE", restockable: true }] });
    assert.equal(JSON.parse(data.get(inventoryItemsStorageKey))[0].batches[0].openingQty, "4");
    cancelSaleReturn(record.id);
    cancelSaleReturn(record.id);
    assert.equal(JSON.parse(data.get(inventoryItemsStorageKey))[0].batches[0].openingQty, "3");
    assert.equal(JSON.parse(data.get(saleReturnsStorageKey))[0].cancelled, true);
  } finally { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; }
});
