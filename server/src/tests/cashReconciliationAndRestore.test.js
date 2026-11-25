import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCashEntryDirection,
  isCashProducingTransactionType,
  CASH_PROVENANCE,
} from "../utils/cashTransactionTypes.js";
import {
  restoreUsvToDatabase,
  SUPPORTED_BACKUP_FORMAT,
  SUPPORTED_BACKUP_VERSION,
} from "../services/backupRestoreService.js";
import { syncCashTransactions } from "../routes/cashBankRouter.js";

test("cashTransactionTypes maps every supported transaction type and alias to correct direction", () => {
  assert.equal(resolveCashEntryDirection("sale"), "in");
  assert.equal(resolveCashEntryDirection("pos"), "in");
  assert.equal(resolveCashEntryDirection("payment_in"), "in");
  assert.equal(resolveCashEntryDirection("payment-in"), "in");
  assert.equal(resolveCashEntryDirection("debit_note"), "in");
  assert.equal(resolveCashEntryDirection("debit note"), "in");
  assert.equal(resolveCashEntryDirection("purchase_return"), "in");
  assert.equal(resolveCashEntryDirection("delivery_challan"), "in");
  assert.equal(resolveCashEntryDirection("proforma"), "in");
  assert.equal(resolveCashEntryDirection("estimate"), "in");

  assert.equal(resolveCashEntryDirection("purchase"), "out");
  assert.equal(resolveCashEntryDirection("expense"), "out");
  assert.equal(resolveCashEntryDirection("payment_out"), "out");
  assert.equal(resolveCashEntryDirection("payment-out"), "out");
  assert.equal(resolveCashEntryDirection("sale_return"), "out");
  assert.equal(resolveCashEntryDirection("credit_note"), "out");
  assert.equal(resolveCashEntryDirection("credit note"), "out");

  assert.equal(isCashProducingTransactionType("delivery_challan"), true);
  assert.equal(isCashProducingTransactionType("proforma"), true);
  assert.equal(isCashProducingTransactionType("credit note"), true);
});

function createCashMockConnection(initial = {}) {
  const clone = (s) => ({
    transactions: (s.transactions || []).map((r) => ({ ...r })),
    transaction_items: (s.transaction_items || []).map((r) => ({ ...r })),
    cash_in_hand: (s.cash_in_hand || []).map((r) => ({ ...r })),
  });
  let state = clone(initial);
  let snapshot = null;
  let failOnSql = null;
  const executed = [];

  return {
    executed,
    getState: () => clone(state),
    setState(next) {
      state = clone(next);
    },
    setFailOnSql(sub) {
      failOnSql = sub;
    },
    async beginTransaction() {
      snapshot = clone(state);
    },
    async commit() {
      snapshot = null;
    },
    async rollback() {
      if (snapshot) {
        state = snapshot;
        snapshot = null;
      }
    },
    async query(sql, params = []) {
      const trimmed = sql.trim();
      executed.push({ sql: trimmed, params });
      if (failOnSql && trimmed.includes(failOnSql)) {
        throw new Error(`Simulated failure on ${failOnSql}`);
      }

      if (trimmed.startsWith("DELETE ti FROM transaction_items")) {
        return [{ affectedRows: 0 }];
      }
      if (trimmed.startsWith("DELETE FROM transactions WHERE business_id = ?")) {
        const bizId = params[0];
        const types = new Set(params.slice(1).map((t) => String(t).toLowerCase()));
        state.transactions = state.transactions.filter(
          (t) => !(t.business_id === bizId && types.has(String(t.transaction_type).toLowerCase()))
        );
        return [{ affectedRows: 1 }];
      }
      if (trimmed.startsWith("DELETE FROM cash_in_hand")) {
        const bizId = params[0];
        if (trimmed.includes("provenance = ?")) {
          const prov = params[1];
          const cashTxnIds = new Set(
            state.transactions
              .filter((t) => t.business_id === bizId && String(t.payment_mode || "").toLowerCase() === "cash")
              .map((t) => t.id)
          );
          state.cash_in_hand = state.cash_in_hand.filter((c) => {
            if (c.business_id !== bizId) return true;
            if (c.provenance !== prov) return true;
            if (String(c.reference_type || "").trim().toLowerCase() === "adjustment") return true;
            return cashTxnIds.has(c.id);
          });
        } else {
          state.cash_in_hand = state.cash_in_hand.filter((c) => c.business_id !== bizId);
        }
        return [{ affectedRows: 1 }];
      }

      const selConflict = trimmed.match(/^SELECT id FROM `(transactions|transaction_items|cash_in_hand)` WHERE id IN/);
      if (selConflict) {
        const tbl = selConflict[1];
        const idSet = new Set(params.map(String));
        return [state[tbl].filter((r) => idSet.has(String(r.id))).map((r) => ({ id: r.id }))];
      }

      if (trimmed.startsWith("SELECT t.id, t.business_id, t.transaction_type")) {
        const bizId = params[0];
        const rows = state.transactions.filter(
          (t) => t.business_id === bizId && String(t.payment_mode || "").toLowerCase() === "cash"
        );
        return [rows];
      }

      if (trimmed.startsWith("INSERT INTO transactions")) {
        const [id, business_id, transaction_type, document_number, transaction_date] = params;
        const total_amount = params[17];
        const paid_amount = params[18];
        const payment_mode = params[20];
        const party_id = params[6];
        const party_name = params[7];
        const notes = params[23];
        state.transactions.push({
          id,
          business_id,
          transaction_type,
          document_number,
          transaction_date,
          party_id,
          party_name,
          total_amount,
          paid_amount,
          payment_mode,
          notes,
        });
        return [{ affectedRows: 1 }];
      }

      if (trimmed.startsWith("INSERT INTO cash_in_hand")) {
        const [
          id,
          business_id,
          entry_date,
          entry_type,
          amount,
          party_id,
          party_name,
          reference_type,
          reference_no,
          description,
          provenance,
        ] = params;
        const existingIdx = state.cash_in_hand.findIndex((c) => c.id === id);
        const row = {
          id,
          business_id,
          entry_date,
          entry_type,
          amount,
          party_id,
          party_name,
          reference_type,
          reference_no,
          description,
          provenance,
        };
        if (existingIdx >= 0) {
          state.cash_in_hand[existingIdx] = row;
        } else {
          state.cash_in_hand.push(row);
        }
        return [{ affectedRows: 1 }];
      }

      return [[]];
    },
  };
}

test("restoreUsvToDatabase links remapped txnIdMap IDs, marks omitted parents as restored_history, and preserves reference_type", async () => {
  const conn = createCashMockConnection({
    transactions: [
      { id: "sale-collide", business_id: "source-biz", transaction_type: "sale", payment_mode: "Cash" },
    ],
    cash_in_hand: [
      { id: "sale-collide", business_id: "source-biz", entry_type: "in", amount: 500, reference_type: "sale", provenance: "transaction" },
      { id: "purch-omitted", business_id: "source-biz", entry_type: "out", amount: 200, reference_type: "purchase", provenance: "transaction" },
      { id: "local-adjustment", business_id: "source-biz", entry_type: "in", amount: 2, reference_type: "adjustment", provenance: "manual_adjustment" },
    ],
  });

  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:saleInvoices.v1": [
        { id: "sale-collide", documentNumber: "INV-1", totalAmount: 500, paidAmount: 500, paymentMode: "Cash" },
        { id: "sale-clean", documentNumber: "INV-2", totalAmount: 300, paidAmount: 300, paymentMode: "Cash" },
      ],
      "ledgerly:cashAdjustments.v1": [
        { id: "sale-collide", entryDate: "2026-11-20", entryType: "in", amount: 500, referenceType: "sale", referenceNo: "INV-1" },
        { id: "sale-clean", entryDate: "2026-11-20", entryType: "in", amount: 300, referenceType: "sale", referenceNo: "INV-2" },
        { id: "purch-omitted", entryDate: "2026-11-19", entryType: "out", amount: 200, referenceType: "purchase", referenceNo: "BILL-1" },
        { id: "local-adjustment", entryDate: "2026-10-28", entryType: "in", amount: 2, referenceType: "adjustment", referenceNo: "ADJUSTMENT" },
      ],
    },
  };

  await restoreUsvToDatabase(conn, "target-biz", payload);

  const state = conn.getState();
  const targetTxns = state.transactions.filter((t) => t.business_id === "target-biz");
  const targetCash = state.cash_in_hand.filter((c) => c.business_id === "target-biz");
  assert.equal(targetTxns.length, 2);
  assert.equal(targetCash.length, 4);

  const remappedSale = targetTxns.find((t) => t.document_number === "INV-1");
  assert.notEqual(remappedSale.id, "sale-collide");

  // Remapped cash ID must equal remapped transaction ID!
  const remappedCash = targetCash.find((c) => c.reference_no === "INV-1");
  assert.equal(remappedCash.id, remappedSale.id);
  assert.equal(remappedCash.provenance, CASH_PROVENANCE.TRANSACTION);
  assert.equal(remappedCash.reference_type, "sale");

  // Non-colliding cash ID keeps link
  const cleanCash = targetCash.find((c) => c.reference_no === "INV-2");
  assert.equal(cleanCash.id, "sale-clean");
  assert.equal(cleanCash.provenance, CASH_PROVENANCE.TRANSACTION);

  // Omitted parent preserves original reference_type and gets restored_history provenance
  const omittedCash = targetCash.find((c) => c.reference_no === "BILL-1");
  assert.equal(omittedCash.reference_type, "purchase");
  assert.equal(omittedCash.provenance, CASH_PROVENANCE.RESTORED_HISTORY);

  // Manual adjustment keeps manual_adjustment provenance
  const adjCash = targetCash.find((c) => c.reference_type === "adjustment");
  assert.equal(adjCash.provenance, CASH_PROVENANCE.MANUAL_ADJUSTMENT);

  // Run syncCashTransactions: all 4 target records must survive, and source-biz untouched!
  await syncCashTransactions("target-biz", conn);
  const afterSync = conn.getState().cash_in_hand.filter((c) => c.business_id === "target-biz");
  assert.equal(afterSync.length, 4);
  assert.equal(conn.getState().cash_in_hand.filter((c) => c.business_id === "source-biz").length, 3);
});

test("syncCashTransactions is idempotent, handles all cash types, preserves restored_history/manual_adjustment, and cleans genuine orphans", async () => {
  const conn = createCashMockConnection({
    transactions: [
      { id: "t-sale", business_id: "biz-1", transaction_type: "sale", document_number: "S1", total_amount: 100, paid_amount: 100, payment_mode: "Cash" },
      { id: "t-dc", business_id: "biz-1", transaction_type: "delivery_challan", document_number: "DC1", total_amount: 50, paid_amount: 50, payment_mode: "Cash" },
      { id: "t-prof", business_id: "biz-1", transaction_type: "proforma", document_number: "P1", total_amount: 40, paid_amount: 40, payment_mode: "Cash" },
      { id: "t-cn", business_id: "biz-1", transaction_type: "credit note", document_number: "CN1", total_amount: 20, paid_amount: 20, payment_mode: "Cash" },
      { id: "t-credit", business_id: "biz-1", transaction_type: "sale", document_number: "S2", total_amount: 500, paid_amount: 0, payment_mode: "Credit" },
      { id: "t-other", business_id: "biz-2", transaction_type: "sale", document_number: "O1", total_amount: 999, paid_amount: 999, payment_mode: "Cash" },
    ],
    cash_in_hand: [
      { id: "orphan-deleted-txn", business_id: "biz-1", entry_type: "in", amount: 75, reference_type: "sale", provenance: "transaction" },
      { id: "hist-omitted", business_id: "biz-1", entry_type: "out", amount: 30, reference_type: "purchase", provenance: "restored_history" },
      { id: "adj-1", business_id: "biz-1", entry_type: "in", amount: 10, reference_type: "adjustment", provenance: "manual_adjustment" },
      { id: "other-orphan", business_id: "biz-2", entry_type: "in", amount: 88, reference_type: "sale", provenance: "transaction" },
    ],
  });

  await syncCashTransactions("biz-1", conn);
  await syncCashTransactions("biz-1", conn); // Idempotent second call

  const biz1Cash = conn.getState().cash_in_hand.filter((c) => c.business_id === "biz-1");
  const ids = new Set(biz1Cash.map((c) => c.id));
  assert.equal(ids.has("t-sale"), true);
  assert.equal(ids.has("t-dc"), true);
  assert.equal(ids.has("t-prof"), true);
  assert.equal(ids.has("t-cn"), true);
  assert.equal(ids.has("t-credit"), false, "Non-cash transaction must not create cash row");
  assert.equal(ids.has("hist-omitted"), true, "Historical unlinked record must survive");
  assert.equal(ids.has("adj-1"), true, "Manual adjustment must survive");
  assert.equal(ids.has("orphan-deleted-txn"), false, "Genuine orphan must be cleaned up");

  // Credit note must be outflow
  const cnRow = biz1Cash.find((c) => c.id === "t-cn");
  assert.equal(cnRow.entry_type, "out");

  // Tenant isolation: biz-2 untouched
  const biz2Cash = conn.getState().cash_in_hand.filter((c) => c.business_id === "biz-2");
  assert.equal(biz2Cash.length, 1);
  assert.equal(biz2Cash[0].id, "other-orphan");
});

test("restoreUsvToDatabase rolls back cash_in_hand on failure and handles missing vs empty cash datasets", async () => {
  const initial = {
    transactions: [],
    transaction_items: [],
    cash_in_hand: [
      { id: "keep-1", business_id: "target-biz", entry_type: "in", amount: 100, reference_type: "adjustment", provenance: "manual_adjustment" },
      { id: "other-1", business_id: "other-biz", entry_type: "in", amount: 200, reference_type: "adjustment", provenance: "manual_adjustment" },
    ],
  };

  // 1. Missing dataset preserves target-biz
  const conn = createCashMockConnection(initial);
  await restoreUsvToDatabase(conn, "target-biz", {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {},
  });
  assert.equal(conn.getState().cash_in_hand.length, 2);

  // 2. Rollback on simulated insertion failure preserves target-biz
  conn.setFailOnSql("INSERT INTO cash_in_hand");
  await conn.beginTransaction();
  try {
    await restoreUsvToDatabase(conn, "target-biz", {
      format: SUPPORTED_BACKUP_FORMAT,
      formatVersion: SUPPORTED_BACKUP_VERSION,
      data: {
        "ledgerly:cashAdjustments.v1": [{ id: "new-1", amount: 50, entryType: "in" }],
      },
    });
    await conn.commit();
    assert.fail("Expected simulated error");
  } catch {
    await conn.rollback();
  }
  conn.setFailOnSql(null);
  assert.deepEqual(conn.getState().cash_in_hand, initial.cash_in_hand);

  // 3. Explicit empty dataset clears target-biz only
  await restoreUsvToDatabase(conn, "target-biz", {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:cashAdjustments.v1": [],
    },
  });
  assert.deepEqual(
    conn.getState().cash_in_hand.map((c) => c.id),
    ["other-1"]
  );
});
