import test from "node:test";
import assert from "node:assert/strict";
import { getPurchaseJobWorks, savePurchaseJobWork } from "./purchaseJobWorkStorage.js";

const data = new Map();
const keys = { jobs: "ledgerly:purchaseJobWorks.v1", items: "ledgerly:inventoryItems.v1", history: "ledgerly:inventoryAdjustments.v1" };
function setup() {
  data.clear();
  globalThis.window = { localStorage: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }, dispatchEvent: () => true };
  globalThis.Event ||= class Event {};
  window.localStorage.setItem(keys.items, JSON.stringify([
    { id: "raw", itemName: "Raw material", openingQuantity: "5", stock: "5" },
    { id: "finished", itemName: "Finished goods", openingQuantity: "0", stock: "0" },
  ]));
}

test("job work saves actual movements, charges and progress status", () => {
  setup();
  const saved = savePurchaseJobWork({ number: "JW-1", date: "2026-10-30", party: "Vendor", sentRows: [{ itemId: "raw", item: "Raw material", qty: "2" }], receivedRows: [{ itemId: "finished", item: "Finished goods", qty: "1.5" }], charges: "75", status: "Partially Completed" });
  assert.equal(saved.type, "Purchase (Job Work)");
  assert.equal(getPurchaseJobWorks().length, 1);
  const inventory = JSON.parse(window.localStorage.getItem(keys.items));
  assert.equal(inventory.find((item) => item.id === "raw").stock, "3");
  assert.equal(inventory.find((item) => item.id === "finished").stock, "1.5");
  const history = JSON.parse(window.localStorage.getItem(keys.history));
  assert.deepEqual(history.map((entry) => entry.direction).sort(), ["add", "reduce"]);
});

test("insufficient material stock rejects job work without partial writes", () => {
  setup();
  assert.throws(() => savePurchaseJobWork({ number: "JW-2", party: "Vendor", sentRows: [{ itemId: "raw", item: "Raw material", qty: "8" }] }), /Insufficient stock/);
  assert.equal(window.localStorage.getItem(keys.jobs), null);
  assert.equal(JSON.parse(window.localStorage.getItem(keys.items))[0].stock, "5");
});

test("updating a pending job to partial receipt applies only the new movement", () => {
  setup();
  const pending = savePurchaseJobWork({ number: "JW-3", date: "2026-10-30", party: "Vendor", sentRows: [{ itemId: "raw", item: "Raw material", qty: "2" }], receivedRows: [], status: "Pending" });
  const updated = savePurchaseJobWork({ ...pending, status: "Partially Completed", receivedRows: [{ itemId: "finished", item: "Finished goods", qty: "1" }] });
  assert.equal(updated.status, "Partially Completed");
  const inventory = JSON.parse(window.localStorage.getItem(keys.items));
  assert.equal(inventory.find((item) => item.id === "raw").stock, "3");
  assert.equal(inventory.find((item) => item.id === "finished").stock, "1");
  assert.equal(JSON.parse(window.localStorage.getItem(keys.history)).length, 2);
});
