import test from "node:test";
import assert from "node:assert/strict";
import { CHEQUE_STORAGE_KEY, createCheque, deleteOrCancelCheque, getAllCheques, getChequeById, updateCheque, updateChequeStatus } from "./chequesRepository.js";
import { filterCheques, validateCheque, validateChequeStatusChange } from "./cheques.js";

const validCheque = (overrides = {}) => ({
  type: "Received",
  partyName: "Customer One",
  chequeNumber: "000123",
  bankName: "Example Bank",
  amount: 1500.5,
  chequeDate: "2026-10-28",
  expectedDate: "2026-10-30",
  notes: "",
  status: "Pending",
  ...overrides,
});

function withLocalStorage(run) {
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  return Promise.resolve().then(() => run(values)).finally(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
}

test("received and issued cheques validate required fields, amount and calendar dates", () => {
  assert.equal(validateCheque(validCheque()), "");
  assert.equal(validateCheque(validCheque({ type: "Issued", status: "Issued" })), "");
  assert.match(validateCheque(validCheque({ chequeDate: "2026-02-30" })), /cheque date/);
  assert.match(validateCheque(validCheque({ amount: 0 })), /amount/);
  assert.match(validateCheque(validCheque({ partyName: " " })), /Party name/);
});

test("status workflow allows only sensible received and issued transitions", () => {
  assert.equal(validateChequeStatusChange(validCheque(), "Deposited"), "");
  assert.match(validateChequeStatusChange(validCheque(), "Cleared"), /cannot move/);
  assert.equal(validateChequeStatusChange(validCheque({ type: "Issued", status: "Issued" }), "Cleared"), "");
});

test("create, edit, status updates and cancel persist while retaining history", async () => withLocalStorage(async () => {
  const created = await createCheque(validCheque({ id: "cheque-1" }));
  assert.equal((await getChequeById(created.id)).status, "Pending");
  const edited = await updateCheque(created.id, { ...validCheque(), partyName: "Updated Customer", amount: 1800 });
  assert.equal(edited.partyName, "Updated Customer");
  assert.equal(edited.history.length, 1);
  await updateChequeStatus(created.id, "Deposited");
  const cancelled = await deleteOrCancelCheque(created.id);
  assert.equal(cancelled.status, "Cancelled");
  assert.deepEqual(cancelled.history.map((entry) => entry.status), ["Pending", "Deposited", "Cancelled"]);
  assert.equal((await getAllCheques()).length, 1);
}));

test("records survive repository reload and duplicate IDs do not add a second cheque", async () => withLocalStorage(async () => {
  const cheque = await createCheque(validCheque({ id: "refresh-id" }));
  await assert.rejects(() => createCheque(validCheque({ id: cheque.id })), /already saved/);
  assert.equal((await getAllCheques()).length, 1);
  assert.ok(CHEQUE_STORAGE_KEY.startsWith("usv.cheques.v1"));
}));

test("malformed local storage content is handled as an empty register", async () => withLocalStorage(async (values) => {
  values.set(CHEQUE_STORAGE_KEY, "{bad json");
  assert.deepEqual(await getAllCheques(), []);
}));

test("cheque search and filters narrow records", () => {
  const records = [validCheque({ id: "a", chequeNumber: "001", status: "Pending" }), validCheque({ id: "b", type: "Issued", status: "Issued", chequeNumber: "002", partyName: "Vendor" })];
  assert.deepEqual(filterCheques(records, { type: "Issued" }).map((entry) => entry.id), ["b"]);
  assert.deepEqual(filterCheques(records, { query: "001", status: "Pending" }).map((entry) => entry.id), ["a"]);
});
