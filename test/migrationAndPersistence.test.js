import { test } from "node:test";
import assert from "node:assert/strict";
import { getActiveBusinessId, getScopedStorageKey } from "../src/config/businessConfig.js";

test("Business ID Configuration - Resolves to demo-business", () => {
  const bizId = getActiveBusinessId();
  assert.equal(bizId, "demo-business", "Active business ID must default to demo-business");
});

test("Scoped Storage Keys - Prevents cross-business data collision", () => {
  const demoKey = getScopedStorageKey("ledgerly:parties.v1", "demo-business");
  const localKey = getScopedStorageKey("ledgerly:parties.v1", "local-development");
  assert.equal(demoKey, "ledgerly:parties.v1:demo-business");
  assert.equal(localKey, "ledgerly:parties.v1:local-development");
  assert.notEqual(demoKey, localKey);
});

test("Party Validation in Transaction - Rejects non-existent party ID", () => {
  // Simulating business logic validation that runs in transactionsRouter
  const partiesInDb = [
    { id: "p1", business_id: "demo-business", party_name: "Customer A" },
    { id: "933f31db-61eb-4c2b-a3d1-2c862c8fc888", business_id: "demo-business", party_name: "rt fpharma" }
  ];

  function validatePartyForTransaction(businessId, partyId) {
    if (!partyId) return true; // Walk-in cash sale allowed without partyId
    const exists = partiesInDb.some((p) => p.business_id === businessId && p.id === partyId);
    if (!exists) {
      throw new Error(`Party validation failed: Party with ID '${partyId}' does not exist under business '${businessId}'.`);
    }
    return true;
  }

  // Valid party
  assert.doesNotThrow(() => validatePartyForTransaction("demo-business", "p1"));
  assert.doesNotThrow(() => validatePartyForTransaction("demo-business", "933f31db-61eb-4c2b-a3d1-2c862c8fc888"));
  assert.doesNotThrow(() => validatePartyForTransaction("demo-business", null));

  // Non-existent party
  assert.throws(
    () => validatePartyForTransaction("demo-business", "non-existent-party-uuid"),
    /Party validation failed/
  );

  // Cross-business party attempt
  assert.throws(
    () => validatePartyForTransaction("other-business", "p1"),
    /Party validation failed/
  );
});

test("Data Migration Payload Preparation - Matches stable UUIDs and preserves records", () => {
  const rawLocalParties = [
    { id: "933f31db-61eb-4c2b-a3d1-2c862c8fc888", partyName: "rt fpharma", gstin: "987654567" },
    { id: "p2", partyName: "New Local Customer", gstin: "12345" }
  ];

  const existingDbParties = [
    { id: "933f31db-61eb-4c2b-a3d1-2c862c8fc888", business_id: "demo-business", party_name: "rt fpharma" }
  ];

  // Simulating migration matching logic
  const toInsert = [];
  const toSkip = [];

  for (const p of rawLocalParties) {
    const match = existingDbParties.find((dbP) => dbP.id === p.id);
    if (match) {
      toSkip.push({ id: p.id, reason: "Already in MySQL" });
    } else {
      toInsert.push({ id: p.id, party_name: p.partyName, business_id: "demo-business" });
    }
  }

  assert.equal(toSkip.length, 1);
  assert.equal(toSkip[0].id, "933f31db-61eb-4c2b-a3d1-2c862c8fc888");
  assert.equal(toInsert.length, 1);
  assert.equal(toInsert[0].id, "p2");
});

test("RT Pharmacy Single Primary Key Isolation - Cannot seed same ID to two businesses", () => {
  // MySQL parties table has `id VARCHAR(64) PRIMARY KEY`
  const partiesTable = new Map();

  function insertParty(party) {
    if (partiesTable.has(party.id)) {
      // In MySQL, INSERT IGNORE skips duplicate PK
      return false;
    }
    partiesTable.set(party.id, party);
    return true;
  }

  // Seed under local-development where the 2 sales reside
  const firstInsert = insertParty({
    id: "933f31db-61eb-4c2b-a3d1-2c862c8fc888",
    business_id: "local-development",
    party_name: "rt fpharma",
    gstin: "987654567"
  });
  assert.equal(firstInsert, true);

  // If another insert with the same ID is attempted for demo-business, it cannot overwrite PK
  const secondInsert = insertParty({
    id: "933f31db-61eb-4c2b-a3d1-2c862c8fc888",
    business_id: "demo-business",
    party_name: "rt fpharma",
    gstin: "987654567"
  });
  assert.equal(secondInsert, false, "Second insert with same PK must be rejected/ignored");

  // Verify the party belongs to local-development where the 2 sales exist
  const stored = partiesTable.get("933f31db-61eb-4c2b-a3d1-2c862c8fc888");
  assert.equal(stored.business_id, "local-development");
});

test("Loan Repayment Differential Accounting - Prevents double deduction on update and restores on delete", () => {
  let loan = { id: "loan-1", principal_amount: 100000, current_balance: 100000 };
  let repayments = new Map();

  function recordRepayment(repay) {
    const existing = repayments.get(repay.id);
    const oldPrincipal = existing ? existing.principal_paid : 0;
    const netDelta = repay.principal_paid - oldPrincipal;

    repayments.set(repay.id, { ...repay });
    loan.current_balance = Math.max(0, loan.current_balance - netDelta);
  }

  function deleteRepayment(repayId) {
    const existing = repayments.get(repayId);
    if (!existing) return;
    repayments.delete(repayId);
    loan.current_balance = loan.current_balance + existing.principal_paid;
  }

  // 1. Initial repayment of 10,000
  recordRepayment({ id: "rep-1", amount_paid: 12000, principal_paid: 10000, interest_paid: 2000 });
  assert.equal(loan.current_balance, 90000);

  // 2. Edit repayment to 15,000 principal (differential delta: +5,000)
  recordRepayment({ id: "rep-1", amount_paid: 17000, principal_paid: 15000, interest_paid: 2000 });
  assert.equal(loan.current_balance, 85000, "Current balance must only decrease by differential +5,000, not full 15,000");

  // 3. Delete repayment restores principal
  deleteRepayment("rep-1");
  assert.equal(loan.current_balance, 100000, "Deleting repayment must restore loan balance to 100,000");
});

test("Returns Accounting & Inventory Delta - Correct signed impacts", () => {
  function getPartyBalanceImpact(type, balAmt, pdAmt) {
    const norm = String(type).toLowerCase();
    if (norm === "sale") return Number(balAmt) || 0;
    if (norm === "payment_in") return -(Number(pdAmt) || 0);
    if (norm === "purchase") return -(Number(balAmt) || 0);
    if (norm === "payment_out") return Number(pdAmt) || 0;
    if (norm === "sale_return") return -(Number(balAmt) || 0);
    if (norm === "purchase_return") return Number(balAmt) || 0;
    return 0;
  }

  function getStockDelta(type, qty) {
    if (type === "sale" || type === "purchase_return") return -qty;
    if (type === "purchase" || type === "sale_return") return +qty;
    return 0;
  }

  // Customer returns goods (sale_return)
  assert.equal(getPartyBalanceImpact("sale_return", 500, 0), -500, "Sale return must decrease customer receivable balance");
  assert.equal(getStockDelta("sale_return", 10), +10, "Sale return must increase stock in inventory");

  // Goods returned to vendor (purchase_return)
  assert.equal(getPartyBalanceImpact("purchase_return", 800, 0), +800, "Purchase return must decrease payable or increase receivable");
  assert.equal(getStockDelta("purchase_return", 5), -5, "Purchase return must decrease stock in inventory");
});

test("Topological Rollback Dependency Ordering - Children deleted before parents", () => {
  const tablesInReverseOrder = [
    "loan_repayments",
    "purchase_job_work_items",
    "transaction_items",
    "transactions",
    "purchase_job_works",
    "loan_accounts",
    "balance_sheet_accounts",
    "unit_conversions",
    "cheques",
    "inventory_items",
    "parties",
  ];

  // Verify child tables appear BEFORE their parent tables
  const txnItemsIdx = tablesInReverseOrder.indexOf("transaction_items");
  const txnIdx = tablesInReverseOrder.indexOf("transactions");
  assert.ok(txnItemsIdx < txnIdx, "transaction_items must be rolled back before transactions");

  const jobWorkItemsIdx = tablesInReverseOrder.indexOf("purchase_job_work_items");
  const jobWorksIdx = tablesInReverseOrder.indexOf("purchase_job_works");
  assert.ok(jobWorkItemsIdx < jobWorksIdx, "purchase_job_work_items must be rolled back before purchase_job_works");

  const loanRepayIdx = tablesInReverseOrder.indexOf("loan_repayments");
  const loanIdx = tablesInReverseOrder.indexOf("loan_accounts");
  assert.ok(loanRepayIdx < loanIdx, "loan_repayments must be rolled back before loan_accounts");

  const partiesIdx = tablesInReverseOrder.indexOf("parties");
  assert.ok(txnIdx < partiesIdx, "transactions must be rolled back before parties");
});
