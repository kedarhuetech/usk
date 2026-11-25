import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isCashProducingTransactionType,
  isCancelledStatus,
  resolveCashEntryDirection,
} from "../utils/cashTransactionTypes.js";
import { getIstDateString, toIstSqlDate } from "../utils/dateUtils.js";
import { parseYMD, getIstTodayYMD, getFinancialYearRange } from "../../../src/utils/dateUtils.js";
import { calculatePartyBalances } from "../../../src/services/partyBalances.js";
import { normalizeExpense, calculateExpenseMetrics } from "../../../src/utils/expenseCalculations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

test("Phase 1: Tenant isolation guards across routers", () => {
  const txRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/transactionsRouter.js"), "utf8");
  assert.match(txRouter, /LEFT JOIN parties p ON t\.party_id = p\.id AND p\.business_id = t\.business_id/);

  const itemsRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/itemsRouter.js"), "utf8");
  assert.doesNotMatch(itemsRouter, /allowAnyBusiness\s*:\s*true/);

  const settingsRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/settingsRouter.js"), "utf8");
  assert.match(settingsRouter, /FROM business_growth_assets WHERE id = \? AND business_id = \?/);

  const expItemsRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/expenseItemsRouter.js"), "utf8");
  assert.match(expItemsRouter, /JOIN transactions t ON ti\.transaction_id = t\.id AND ti\.business_id = t\.business_id/);
  assert.equal(fs.existsSync(path.join(ROOT, "server/src/routes/parties.js")), false);
});

test("Phase 2: Cash transaction types exclude non-posting docs & detect cancelled status", () => {
  assert.equal(isCashProducingTransactionType("delivery_challan"), false);
  assert.equal(isCashProducingTransactionType("proforma"), false);
  assert.equal(isCashProducingTransactionType("sale"), true);
  assert.equal(isCashProducingTransactionType("credit note"), true);
  assert.equal(resolveCashEntryDirection("credit note"), "out");
  assert.equal(resolveCashEntryDirection("debit note"), "in");

  assert.equal(isCancelledStatus("Cancelled", "Completed"), true);
  assert.equal(isCancelledStatus("Paid", "cancelled"), true);
  assert.equal(isCancelledStatus("Paid", "Completed"), false);
});

test("Phase 2: No totalAmount fallback for unpaid Cash sales & Cancelled preserved on restore", () => {
  const cashBankRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/cashBankRouter.js"), "utf8");
  assert.doesNotMatch(cashBankRouter, /amount\s*=\s*parseFloat\(txn\.total_amount\)/);

  const txRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/transactionsRouter.js"), "utf8");
  assert.doesNotMatch(txRouter, /cashAmt\s*=\s*parseFloat\(totalAmount\)/);

  const backupSvc = fs.readFileSync(path.join(ROOT, "server/src/services/backupRestoreService.js"), "utf8");
  assert.match(backupSvc, /paymentStatus\s*=\s*isCancelled\s*\?\s*"Cancelled"/);
});

test("Phase 3: Party balances date-range parity & cancelled exclusion", () => {
  const res = calculatePartyBalances({
    parties: [{ id: "p1", partyName: "Acme", partyType: "customer", openingBalance: 100 }],
    sales: [
      { id: "s1", partyId: "p1", partyName: "Acme", date: "2026-11-10", total: 500, received: 100 },
      { id: "s2", partyId: "p1", partyName: "Acme", date: "2026-11-15", total: 300, received: 0, paymentStatus: "Cancelled" },
    ],
    paymentIns: [
      { id: "pay1", partyId: "p1", partyName: "Acme", date: "2026-11-01", amount: 50 },
      { id: "pay2", partyId: "p1", partyName: "Acme", date: "2026-11-12", amount: 25 },
    ],
    from: "2026-11-10",
    to: "2026-11-20",
  });
  // Opening 100 + s1 outstanding (400) = 500; s2 cancelled excluded; pay1 out of range excluded; pay2 unlinked (25) in payable
  assert.equal(res.receivable, 500);
  assert.equal(res.payable, 25);
});

test("Phase 4: Inventory unit conversion column & adjustment validation", () => {
  const migrationRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/migrationRouter.js"), "utf8");
  assert.doesNotMatch(migrationRouter, /conversion_factor/);

  const adjRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/inventoryAdjustmentsRouter.js"), "utf8");
  assert.match(adjRouter, /Item not found for this business/);
  assert.match(adjRouter, /SELECT item_id, adjustment_type, quantity FROM inventory_adjustments/);
});

test("Phase 5 & 7: IST date standardization & no fabricated PnL fallbacks", () => {
  // 2026-11-24T20:00:00Z is 2026-11-25 01:30 IST
  const lateUtc = new Date("2026-11-24T20:00:00.000Z");
  assert.equal(getIstDateString(lateUtc), "2026-11-25");
  assert.equal(toIstSqlDate("2026-11-24T20:00:00.000Z"), "2026-11-25");
  assert.equal(getIstTodayYMD(lateUtc), "2026-11-25");

  const parsed = parseYMD("2026-11-25");
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 10);
  assert.equal(parsed.getDate(), 25);

  assert.deepEqual(getFinancialYearRange("2026-02-15"), { startDate: "2025-04-01", endDate: "2026-03-31" });
  assert.deepEqual(getFinancialYearRange("2026-04-01"), { startDate: "2026-04-01", endDate: "2027-03-31" });

  const pnl = fs.readFileSync(path.join(ROOT, "src/pages/Reports/ProfitAndLossReport.jsx"), "utf8");
  assert.doesNotMatch(pnl, /0\.7268/);
  assert.doesNotMatch(pnl, /openingStock\s*=\s*2160/);

  const exp1 = normalizeExpense({ id: "e1", amount: 500, paymentStatus: "Cancelled" }, 0);
  const exp2 = normalizeExpense({ id: "e2", amount: 200, status: "Paid" }, 1);
  assert.equal(exp1.status, "Cancelled");
  const metrics = calculateExpenseMetrics([exp1, exp2]);
  assert.equal(metrics.totalExpenses, 200);
});

test("Phase 6, 8, 9: Scoped storage, error propagation, read-only GETs, loan balance preservation", () => {
  const authSvc = fs.readFileSync(path.join(ROOT, "src/services/authService.js"), "utf8");
  assert.match(authSvc, /k\.startsWith\("usv\."\)/);

  const txRepo = fs.readFileSync(path.join(ROOT, "src/services/transactionRepository.js"), "utf8");
  assert.match(txRepo, /export function readTransactionValue[\s\S]*?getScopedStorageKey\(key\)/);

  const expCatRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/expenseCategoriesRouter.js"), "utf8");
  assert.doesNotMatch(expCatRouter, /router\.get\("\/"[\s\S]*?seedDefaultCategories/);

  const expItemsRouter = fs.readFileSync(path.join(ROOT, "server/src/routes/expenseItemsRouter.js"), "utf8");
  assert.doesNotMatch(expItemsRouter, /router\.get\("\/"[\s\S]*?syncFromTransactionItems/);
});
