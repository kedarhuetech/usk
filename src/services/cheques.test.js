import test from "node:test";
import assert from "node:assert/strict";
import {
  CHEQUE_STORAGE_KEY,
  createCheque,
  deleteOrCancelCheque,
  getAllCheques,
  getChequeById,
  toDbPayload,
  updateCheque,
  updateChequeStatus,
} from "./chequesRepository.js";
import { filterCheques, validateCheque, validateChequeStatusChange } from "./cheques.js";
import { cashBankDb } from "./databaseRepository.js";
import { STORAGE_MODE_KEY } from "./dataStorageConfig.js";

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

function withLocalStorage(run, { mode = "local" } = {}) {
  const originalWindow = globalThis.window;
  const values = new Map();
  values.set(STORAGE_MODE_KEY, mode);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  return Promise.resolve()
    .then(() => run(values))
    .finally(() => {
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

test("toDbPayload maps frontend cheque model to database schema", () => {
  const payload = toDbPayload({
    id: "chq-123",
    type: "Received",
    partyName: " Acme Corp ",
    chequeNumber: " 987654 ",
    bankName: " HDFC Bank ",
    amount: "2500.75",
    chequeDate: "2026-11-01",
    expectedDate: "2026-11-05",
    status: "Pending",
    notes: "Advance payment",
  });
  assert.equal(payload.id, "chq-123");
  assert.equal(payload.partyName, "Acme Corp");
  assert.equal(payload.chequeNumber, "987654");
  assert.equal(payload.bankName, "HDFC Bank");
  assert.equal(payload.amount, 2500.75);
  assert.equal(payload.chequeType, "received");
  assert.equal(payload.status, "pending");
  assert.equal(payload.depositDate, "2026-11-05");
  assert.equal(payload.notes, "Advance payment");
});

test("offline mode: create, edit, status updates and cancel persist while retaining history", async () =>
  withLocalStorage(async () => {
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
  }, { mode: "local" }));

test("offline mode: records survive repository reload and duplicate IDs do not add a second cheque", async () =>
  withLocalStorage(async () => {
    const cheque = await createCheque(validCheque({ id: "refresh-id" }));
    await assert.rejects(() => createCheque(validCheque({ id: cheque.id })), /already saved/);
    assert.equal((await getAllCheques()).length, 1);
    assert.ok(CHEQUE_STORAGE_KEY.startsWith("usv.cheques.v1"));
  }, { mode: "local" }));

test("offline mode: malformed local storage content is handled as an empty register", async () =>
  withLocalStorage(async (values) => {
    values.set(CHEQUE_STORAGE_KEY, "{bad json");
    assert.deepEqual(await getAllCheques(), []);
  }, { mode: "local" }));

test("database mode: createCheque awaits and persists to MySQL via cashBankDb.saveCheque", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveCheque;
    const savedCalls = [];
    cashBankDb.saveCheque = async (payload) => {
      savedCalls.push(payload);
      return { success: true, data: payload };
    };

    try {
      const created = await createCheque(validCheque({ id: "db-chq-1" }));
      assert.equal(savedCalls.length, 1);
      assert.equal(savedCalls[0].id, "db-chq-1");
      assert.equal(savedCalls[0].chequeType, "received");
      assert.equal(savedCalls[0].status, "pending");
      assert.equal(created.id, "db-chq-1");
      assert.equal(created.status, "Pending");
    } finally {
      cashBankDb.saveCheque = originalSave;
    }
  }, { mode: "database" }));

test("database mode: updateCheque persists updates to MySQL and preserves history", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveCheque;
    const savedCalls = [];
    cashBankDb.saveCheque = async (payload) => {
      savedCalls.push(payload);
      return { success: true, data: payload };
    };

    try {
      const created = await createCheque(validCheque({ id: "db-chq-2", amount: 1000 }));
      assert.equal(savedCalls.length, 1);

      const updated = await updateCheque("db-chq-2", { partyName: "Modified Client", amount: 2000 });
      assert.equal(savedCalls.length, 2);
      assert.equal(savedCalls[1].partyName, "Modified Client");
      assert.equal(savedCalls[1].amount, 2000);
      assert.equal(updated.partyName, "Modified Client");
      assert.equal(updated.amount, 2000);
      assert.equal(updated.history.length, 1); // original status event preserved
    } finally {
      cashBankDb.saveCheque = originalSave;
    }
  }, { mode: "database" }));

test("database mode: updateCheque fails and does not mutate local state if MySQL fails", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveCheque;
    let callCount = 0;
    cashBankDb.saveCheque = async (payload) => {
      callCount++;
      if (callCount === 1) return { success: true };
      throw new Error("MySQL connection dropped");
    };

    try {
      await createCheque(validCheque({ id: "db-chq-3", partyName: "Original Name" }));
      await assert.rejects(
        () => updateCheque("db-chq-3", { partyName: "Should Not Save" }),
        /MySQL connection dropped/
      );
      // Local cache should still have the original name
      const record = await getChequeById("db-chq-3");
      assert.equal(record.partyName, "Original Name");
    } finally {
      cashBankDb.saveCheque = originalSave;
    }
  }, { mode: "database" }));

test("database mode: updateChequeStatus persists new status and history to MySQL", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveCheque;
    const savedCalls = [];
    cashBankDb.saveCheque = async (payload) => {
      savedCalls.push(payload);
      return { success: true, data: payload };
    };

    try {
      await createCheque(validCheque({ id: "db-chq-4" }));
      assert.equal(savedCalls.length, 1);

      const statusUpdated = await updateChequeStatus("db-chq-4", "Deposited");
      assert.equal(savedCalls.length, 2);
      assert.equal(savedCalls[1].status, "deposited");
      assert.equal(statusUpdated.status, "Deposited");
      assert.equal(statusUpdated.history.length, 2);
      assert.equal(statusUpdated.history[1].status, "Deposited");
    } finally {
      cashBankDb.saveCheque = originalSave;
    }
  }, { mode: "database" }));

test("database mode: updateChequeStatus does not mutate local state if MySQL fails", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveCheque;
    let callCount = 0;
    cashBankDb.saveCheque = async () => {
      callCount++;
      if (callCount === 1) return { success: true };
      throw new Error("Database deadlock");
    };

    try {
      await createCheque(validCheque({ id: "db-chq-5" }));
      await assert.rejects(
        () => updateChequeStatus("db-chq-5", "Deposited"),
        /Database deadlock/
      );
      const record = await getChequeById("db-chq-5");
      assert.equal(record.status, "Pending");
      assert.equal(record.history.length, 1);
    } finally {
      cashBankDb.saveCheque = originalSave;
    }
  }, { mode: "database" }));

test("database mode: deleteOrCancelCheque cancels the cheque, persists to MySQL, and retains the record", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveCheque;
    const savedCalls = [];
    cashBankDb.saveCheque = async (payload) => {
      savedCalls.push(payload);
      return { success: true, data: payload };
    };

    try {
      await createCheque(validCheque({ id: "db-chq-6" }));
      const cancelled = await deleteOrCancelCheque("db-chq-6");
      assert.equal(savedCalls.length, 2);
      assert.equal(savedCalls[1].status, "cancelled");
      assert.equal(cancelled.status, "Cancelled");

      // Verify the record is preserved, not deleted
      const retrieved = await getChequeById("db-chq-6");
      assert.ok(retrieved, "Record must be retained");
      assert.equal(retrieved.status, "Cancelled");
      assert.deepEqual(retrieved.history.map((h) => h.status), ["Pending", "Cancelled"]);
    } finally {
      cashBankDb.saveCheque = originalSave;
    }
  }, { mode: "database" }));

test("database mode: getAllCheques merges MySQL data without losing local history or dates", async () =>
  withLocalStorage(async () => {
    const originalSave = cashBankDb.saveCheque;
    const originalGet = cashBankDb.getCheques;

    cashBankDb.saveCheque = async () => ({ success: true });
    cashBankDb.getCheques = async () => ({
      success: true,
      data: [
        {
          id: "db-chq-sync",
          partyId: "p-1",
          partyName: "Server Party",
          chequeNumber: "999888",
          bankName: "Server Bank",
          amount: 5000,
          chequeDate: "2026-11-10",
          chequeType: "received",
          status: "deposited",
          depositDate: "2026-11-12",
          clearanceDate: null,
          notes: "Synchronized notes",
        },
      ],
    });

    try {
      // First create locally with history
      await createCheque(validCheque({ id: "db-chq-sync", partyName: "Old Name" }));
      await updateChequeStatus("db-chq-sync", "Deposited");

      // Now fetch from DB
      const loaded = await getAllCheques();
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0].id, "db-chq-sync");
      assert.equal(loaded[0].partyName, "Server Party");
      assert.equal(loaded[0].status, "Deposited");
      // History from local transitions is preserved
      assert.equal(loaded[0].history.length, 2);
      assert.deepEqual(loaded[0].history.map((h) => h.status), ["Pending", "Deposited"]);
    } finally {
      cashBankDb.saveCheque = originalSave;
      cashBankDb.getCheques = originalGet;
    }
  }, { mode: "database" }));

test("cheque search and filters narrow records", () => {
  const records = [
    validCheque({ id: "a", chequeNumber: "001", status: "Pending" }),
    validCheque({ id: "b", type: "Issued", status: "Issued", chequeNumber: "002", partyName: "Vendor" }),
  ];
  assert.deepEqual(filterCheques(records, { type: "Issued" }).map((entry) => entry.id), ["b"]);
  assert.deepEqual(filterCheques(records, { query: "001", status: "Pending" }).map((entry) => entry.id), ["a"]);
});
