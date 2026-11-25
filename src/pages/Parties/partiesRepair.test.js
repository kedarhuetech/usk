import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  executePartyDeletionPolicy,
  normalizePartyName,
  normalizePartyNameKey,
} from "../../../server/src/routes/partiesRouter.js";
import {
  clearMemoryParties,
  getParties,
  setMemoryParties,
} from "../../services/partiesStorage.js";
import { partyFormDefaults } from "../../constants/partiesData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

function createMockConn({ partyRow = null, counts = {}, failOnTable = null } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes("FROM parties") && sql.includes("FOR UPDATE")) {
        if (!partyRow || partyRow.business_id !== params[0] || partyRow.id !== params[1]) {
          return [[]];
        }
        return [[partyRow]];
      }
      for (const tbl of ["transactions", "cash_in_hand", "cheques", "service_reminders", "purchase_job_works"]) {
        if (sql.includes(`FROM ${tbl}`)) {
          if (failOnTable === tbl) throw new Error(`DB error reading ${tbl}`);
          return [[{ cnt: counts[tbl] || 0 }]];
        }
      }
      return [{ affectedRows: 1 }];
    },
  };
}

test("Deletion Policy: party with transactions or settled history is deactivated, never deleted", async () => {
  const conn = createMockConn({
    partyRow: { id: "p1", business_id: "biz-1", party_name: "Acme", opening_balance: 0, current_balance: 0, is_active: 1 },
    counts: { transactions: 3 },
  });
  const res = await executePartyDeletionPolicy(conn, "biz-1", "p1");
  assert.equal(res.action, "deactivated");
  assert.ok(res.referencedIn.includes("transactions"));
  assert.ok(conn.queries.some((q) => q.sql.includes("UPDATE parties SET is_active = 0")));
  assert.equal(conn.queries.some((q) => q.sql.includes("DELETE FROM parties")), false);
});

test("Deletion Policy: party with cheques/reminders/job-works or non-zero balance is deactivated", async () => {
  const connCheque = createMockConn({
    partyRow: { id: "p2", business_id: "biz-1", party_name: "Beta", opening_balance: 0, current_balance: 0, is_active: 1 },
    counts: { cheques: 1 },
  });
  const resCheque = await executePartyDeletionPolicy(connCheque, "biz-1", "p2");
  assert.equal(resCheque.action, "deactivated");
  assert.ok(resCheque.referencedIn.includes("cheques"));

  const connBal = createMockConn({
    partyRow: { id: "p3", business_id: "biz-1", party_name: "Gamma", opening_balance: 0, current_balance: 250, is_active: 1 },
    counts: {},
  });
  const resBal = await executePartyDeletionPolicy(connBal, "biz-1", "p3");
  assert.equal(resBal.action, "deactivated");
  assert.equal(resBal.hasOutstandingBalance, true);
  assert.equal(connBal.queries.some((q) => q.sql.includes("DELETE FROM parties")), false);
});

test("Deletion Policy: unreferenced zero-balance party is permanently deleted", async () => {
  const conn = createMockConn({
    partyRow: { id: "p4", business_id: "biz-1", party_name: "Clean Party", opening_balance: 0, current_balance: 0, is_active: 1 },
    counts: {},
  });
  const res = await executePartyDeletionPolicy(conn, "biz-1", "p4");
  assert.equal(res.action, "deleted");
  assert.ok(conn.queries.some((q) => q.sql.includes("DELETE FROM parties WHERE business_id = ? AND id = ?")));
});

test("Deletion Policy: DB verification failure blocks deletion & respects business isolation", async () => {
  const connFail = createMockConn({
    partyRow: { id: "p5", business_id: "biz-1", party_name: "FailCheck", opening_balance: 0, current_balance: 0, is_active: 1 },
    failOnTable: "cheques",
  });
  await assert.rejects(() => executePartyDeletionPolicy(connFail, "biz-1", "p5"), /DB error reading cheques/);
  assert.equal(connFail.queries.some((q) => q.sql.includes("DELETE FROM parties")), false);

  const connOtherBiz = createMockConn({
    partyRow: { id: "p1", business_id: "biz-a", party_name: "Alpha", opening_balance: 0, current_balance: 0, is_active: 1 },
  });
  const resOther = await executePartyDeletionPolicy(connOtherBiz, "biz-b", "p1");
  assert.equal(resOther.notFound, true);
});

test("Duplicate Normalization: trims, collapses internal spaces, and ignores case", () => {
  const variants = ["ABC Traders", "abc traders", " ABC Traders ", "ABC  Traders"];
  const keys = new Set(variants.map(normalizePartyNameKey));
  assert.equal(keys.size, 1);
  assert.equal(normalizePartyName("  ABC   Traders "), "ABC Traders");
});

test("Business Isolation: partiesStorage never writes unscoped ledgerly:parties.v1 and isolates tenants", () => {
  clearMemoryParties();
  const map = new Map([["usk_auth_business_id", "biz-a"]]);
  globalThis.window = {
    localStorage: {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
  };

  setMemoryParties([{ id: "pa-1", partyName: "Alpha Customer" }]);
  assert.equal(map.get("ledgerly:parties.v1"), undefined);
  assert.equal(getParties().length, 1);

  // Switch tenant to biz-b and clear in-memory cache (simulating reload/logout)
  clearMemoryParties();
  map.set("usk_auth_business_id", "biz-b");
  assert.equal(getParties().length, 0);

  clearMemoryParties();
  delete globalThis.window;
});

test("Persistence, Classification, Loading, Search & Fallback static checks", () => {
  assert.equal(partyFormDefaults.partyType, "customer");

  const schemaSrc = fs.readFileSync(path.join(ROOT, "server/src/db/initSchema.js"), "utf8");
  for (const col of ["party_group", "gst_type", "as_of_date", "credit_limit_type", "additional_fields"]) {
    assert.match(schemaSrc, new RegExp(col));
  }

  const routerSrc = fs.readFileSync(path.join(ROOT, "server/src/routes/partiesRouter.js"), "utf8");
  assert.match(routerSrc, /party_group/);
  assert.match(routerSrc, /gst_type/);
  assert.match(routerSrc, /as_of_date/);
  assert.match(routerSrc, /credit_limit_type/);
  assert.match(routerSrc, /additional_fields/);

  const addModalSrc = fs.readFileSync(path.join(ROOT, "src/pages/Parties/AddPartyModal.jsx"), "utf8");
  assert.match(addModalSrc, /aria-label="Party Type"/);
  assert.match(addModalSrc, /value="supplier"/);
  assert.match(addModalSrc, /value="both"/);

  const detailsSrc = fs.readFileSync(path.join(ROOT, "src/pages/Parties/PartyDetails.jsx"), "utf8");
  assert.doesNotMatch(detailsSrc, /loadBusinessParties\(\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(detailsSrc, /Sai Kirana Stores/);
  assert.match(detailsSrc, /await saveBusinessParty\(/);
  assert.match(detailsSrc, /!normName\.includes\(q\) && !phone\.includes\(q\) && !gstin\.includes\(q\)/);
});
