import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYMD,
  formatDateDisplay,
  formatMoney,
  resolveItemPurchaseCost,
  calculateInvoiceProfit,
} from "../../utils/billWiseProfit.js";
import { ensureLocalTestData } from "../../services/localTransactionTestData.js";
import { getSaleInvoices } from "../../services/salesStorage.js";
import { getInventoryItems } from "../../services/itemsStorage.js";
import { getPurchaseBills } from "../../services/purchaseBillsStorage.js";

function setupInMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
  };
  return store;
}

test("End-to-End Bill Wise Profit calculation with local test data", () => {
  setupInMemoryStorage();

  // Seed standard local test data
  ensureLocalTestData();

  const inventoryItems = getInventoryItems();
  const sales = getSaleInvoices();
  const purchaseBills = getPurchaseBills();

  assert.ok(sales.length > 0, "Sale invoices should exist");
  assert.ok(inventoryItems.length > 0, "Inventory items should exist");

  const activeSale = sales.find((s) => !s.cancelled && s.status !== "Cancelled");
  assert.ok(activeSale, "Active test sale invoice should exist");

  // Calculate profit breakdown
  const reportRow = calculateInvoiceProfit(activeSale, inventoryItems, purchaseBills);

  // 1. Verify invoice details
  assert.equal(reportRow.invoiceNumber, "TEST-INV-101");
  assert.equal(reportRow.partyName, "TEST Customer Pvt Ltd");
  assert.equal(reportRow.formattedDate, formatDateDisplay(activeSale.date));

  // 2. Verify sale amount
  assert.equal(reportRow.saleAmount, 1900);

  // 3. Verify item costs: TEST Cotton Shirt Finished has purchase price 600, qty 2 => 1200
  assert.equal(reportRow.items.length, 1);
  assert.equal(reportRow.items[0].itemName, "TEST Cotton Shirt Finished");
  assert.equal(reportRow.items[0].qty, 2);
  assert.equal(reportRow.items[0].purchasePrice, 600);
  assert.equal(reportRow.items[0].totalCost, 1200);

  // 4. Verify Total Cost
  assert.equal(reportRow.totalCost, 1200);
  assert.equal(reportRow.hasMissingCost, false);

  // 5. Verify formula: Profit = Sale Amount (1900) - Total Cost (1200) - Tax Payable (0) + TDS Receivable (0)
  // Expected profit = 700
  assert.equal(reportRow.profit, 700);
  assert.equal(reportRow.profitExcludingCharges, 700);
  assert.equal(reportRow.isLoss, false);
});

test("Bill Wise Profit filters work correctly (Date & Party)", () => {
  setupInMemoryStorage();
  ensureLocalTestData();

  const inventoryItems = getInventoryItems();
  const purchaseBills = getPurchaseBills();

  const invoiceA = {
    id: "inv-a",
    invoiceNumber: "INV-A",
    customer: "Party Alpha",
    invoiceDate: "2026-10-10",
    totals: { finalTotal: 1000 },
    rows: [{ item: "TEST Cotton Shirt Finished", qty: 1 }],
  };

  const invoiceB = {
    id: "inv-b",
    invoiceNumber: "INV-B",
    customer: "Party Beta",
    invoiceDate: "2026-10-25",
    totals: { finalTotal: 1500 },
    rows: [{ item: "TEST Cotton Shirt Finished", qty: 1 }],
  };

  const allInvoices = [invoiceA, invoiceB].map((inv) =>
    calculateInvoiceProfit(inv, inventoryItems, purchaseBills)
  );

  // 1. Filter by Party Alpha
  const alphaOnly = allInvoices.filter((inv) => inv.partyName === "Party Alpha");
  assert.equal(alphaOnly.length, 1);
  assert.equal(alphaOnly[0].invoiceNumber, "INV-A");

  // 2. Filter by Date range (2026-10-20 to 2026-10-31)
  const dateFiltered = allInvoices.filter(
    (inv) => inv.dateYmd >= "2026-10-20" && inv.dateYmd <= "2026-10-31"
  );
  assert.equal(dateFiltered.length, 1);
  assert.equal(dateFiltered[0].invoiceNumber, "INV-B");
});

test("Bill Wise Profit modal data matches invoice row exactly", () => {
  setupInMemoryStorage();
  ensureLocalTestData();

  const inventoryItems = getInventoryItems();
  const purchaseBills = getPurchaseBills();

  const multiItemInvoice = {
    id: "inv-multi",
    invoiceNumber: "INV-MULTI-01",
    customer: "Global Traders",
    invoiceDate: "2026-10-20",
    totals: {
      finalTotal: 3000,
      tax: 200,
      additionalCharges: 50,
      tds: 25,
    },
    rows: [
      {
        sourceItemId: "test-item-raw-1",
        item: "TEST Raw Cotton Fabric",
        qty: 4,
        price: 450,
      },
      {
        sourceItemId: "test-item-fin-1",
        item: "TEST Cotton Shirt Finished",
        qty: 1,
        price: 950,
      },
    ],
  };

  const reportRow = calculateInvoiceProfit(multiItemInvoice, inventoryItems, purchaseBills);

  // Item 1: Raw cotton purchase price 350, qty 4 => 1400
  // Item 2: Finished shirt purchase price 600, qty 1 => 600
  // Total Cost = 1400 + 600 = 2000
  assert.equal(reportRow.items.length, 2);
  assert.equal(reportRow.items[0].purchasePrice, 350);
  assert.equal(reportRow.items[0].totalCost, 1400);
  assert.equal(reportRow.items[1].purchasePrice, 600);
  assert.equal(reportRow.items[1].totalCost, 600);
  assert.equal(reportRow.totalCost, 2000);

  // Profit = 3000 - 2000 - 200 + 25 = 825
  assert.equal(reportRow.profit, 825);
  // Profit (Excl. Additional Charges) = 825 - 50 = 775
  assert.equal(reportRow.profitExcludingCharges, 775);

  // Verify modal display format
  assert.equal(formatMoney(reportRow.saleAmount), "₹ 3,000.00");
  assert.equal(formatMoney(reportRow.totalCost), "₹ 2,000.00");
  assert.equal(formatMoney(reportRow.taxPayable), "₹ 200.00");
  assert.equal(formatMoney(reportRow.tdsReceivable), "₹ 25.00");
  assert.equal(formatMoney(reportRow.profit), "₹ 825.00");
  assert.equal(formatMoney(reportRow.profitExcludingCharges), "₹ 775.00");
});
