import assert from "node:assert/strict";
import { test } from "node:test";
import { getSaleInvoices, saveSaleInvoice } from "./salesStorage.js";

test("POS-shaped sale invoices are persisted once and stock is deducted only once", () => {
  const values = new Map([
    ["ledgerly:inventoryItems.v1", JSON.stringify([{ id: "item-1", itemName: "Saved Item", stock: "10", openingQuantity: "10", type: "product" }])],
    ["ledgerly:saleInvoices.v1", "[]"],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    dispatchEvent: () => true,
  };

  const invoice = {
    id: "pos-sale-bill-1",
    transactionType: "sale",
    saleType: "credit",
    invoiceNumber: "POS-TEST-1",
    form: { invoiceNumber: "POS-TEST-1", invoiceDate: "2026-10-30", customer: "Customer A", paymentType: "Cash" },
    totals: { finalTotal: 100, received: 40, balance: 60 },
    rows: [{ itemId: "item-1", sourceItemId: "item-1", item: "Saved Item", qty: 2, price: 50, unit: "Pcs", amount: 100 }],
  };

  const saved = saveSaleInvoice(invoice);
  assert.equal(saved.id, "pos-sale-bill-1");
  assert.equal(getSaleInvoices().length, 1);
  assert.equal(getSaleInvoices()[0].totals.finalTotal, 100);
  assert.equal(getSaleInvoices()[0].totals.received, 40);
  assert.equal(getSaleInvoices()[0].saleType, "credit");
  assert.equal(JSON.parse(values.get("ledgerly:inventoryItems.v1"))[0].stock, "8");

  saveSaleInvoice(invoice);
  assert.equal(getSaleInvoices().length, 1);
  assert.equal(JSON.parse(values.get("ledgerly:inventoryItems.v1"))[0].stock, "8");
  delete globalThis.window;
});

test("failed invoice persistence rolls back the inventory change", () => {
  let failSaleWrite = false;
  const values = new Map([
    ["ledgerly:inventoryItems.v1", JSON.stringify([{ id: "item-1", itemName: "Saved Item", stock: "10", openingQuantity: "10" }])],
    ["ledgerly:saleInvoices.v1", "[]"],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === "ledgerly:saleInvoices.v1" && failSaleWrite) {
          failSaleWrite = false;
          throw new Error("write failed");
        }
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    },
    dispatchEvent: () => true,
  };
  failSaleWrite = true;
  assert.throws(() => saveSaleInvoice({
    id: "pos-sale-failed",
    transactionType: "sale",
    rows: [{ itemId: "item-1", item: "Saved Item", qty: 3 }],
    totals: { finalTotal: 30, received: 30 },
  }), /write failed/);
  assert.equal(JSON.parse(values.get("ledgerly:inventoryItems.v1"))[0].stock, "10");
  assert.equal(JSON.parse(values.get("ledgerly:saleInvoices.v1")).length, 0);
  delete globalThis.window;
});
