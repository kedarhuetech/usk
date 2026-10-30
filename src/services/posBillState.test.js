import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addPosBill,
  closePosBill,
  createPosBillSession,
  createPosDraft,
  switchPosBill,
} from "./posBillState.js";

test("creates fresh uniquely identified empty bills", () => {
  const first = createPosDraft({ id: "bill-a", now: new Date("2026-10-30T10:00:00.000Z") });
  const second = createPosDraft({ id: "bill-b", now: new Date("2026-10-30T10:00:00.000Z") });
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.invoiceNo, second.invoiceNo);
  assert.deepEqual(first.items, []);
  assert.equal(first.customer, "");
  assert.equal(first.amountReceived, "");
  assert.equal(first.billDiscount, 0);
  assert.equal(first.additionalCharges, 0);
});

test("activates each new bill and ignores duplicate bill IDs", () => {
  const first = createPosDraft({ id: "one" });
  const session = createPosBillSession();
  const withFirst = addPosBill(session, first);
  const duplicate = addPosBill(withFirst, first);
  assert.equal(duplicate.bills.length, 1);
  assert.equal(duplicate.activeBillId, "one");
  const second = createPosDraft({ id: "two" });
  const withSecond = addPosBill(duplicate, second);
  assert.equal(withSecond.activeBillId, "two");
  assert.equal(withSecond.bills.length, 2);
});

test("switching bills saves current draft and preserves each bill data", () => {
  const session = createPosBillSession({
    bills: [
      { id: "one", invoiceNo: "INV-1", customer: "A", items: [{ productId: "p1", qty: 2 }] },
      { id: "two", invoiceNo: "INV-2", customer: "B", items: [] },
    ],
    activeBillId: "one",
  });
  const switched = switchPosBill(session, "two", { ...session.bills[0], remarks: "kept" });
  assert.equal(switched.activeBillId, "two");
  assert.equal(switched.bills[0].customer, "A");
  assert.equal(switched.bills[0].remarks, "kept");
  assert.equal(switched.bills[0].items[0].qty, 2);
  assert.equal(switched.bills[1].customer, "B");
});

test("closing one bill preserves others and chooses the prior or next remaining bill", () => {
  const session = createPosBillSession({
    bills: [{ id: "one" }, { id: "two" }, { id: "three" }],
    activeBillId: "two",
  });
  const closedActive = closePosBill(session, "two");
  assert.deepEqual(closedActive.bills.map((bill) => bill.id), ["one", "three"]);
  assert.equal(closedActive.activeBillId, "one");
  const closedFirst = closePosBill(closedActive, "one");
  assert.equal(closedFirst.activeBillId, "three");
  const empty = closePosBill(closedFirst, "three");
  assert.deepEqual(empty, { bills: [], activeBillId: null });
});

test("normalizes invalid active selection and drops duplicate IDs", () => {
  const session = createPosBillSession({
    bills: [{ id: "one" }, { id: "one" }, { id: "two" }],
    activeBillId: "missing",
  });
  assert.deepEqual(session.bills.map((bill) => bill.id), ["one", "two"]);
  assert.equal(session.activeBillId, "one");
});
