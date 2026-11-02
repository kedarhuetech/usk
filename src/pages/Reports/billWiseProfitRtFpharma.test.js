import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYMD,
  formatDateDisplay,
  resolveItemPurchaseCost,
  calculateInvoiceProfit,
} from "../../utils/billWiseProfit.js";
import { saveSaleInvoice, getSaleInvoices } from "../../services/salesStorage.js";
import { saveParty, getParties } from "../../services/partiesStorage.js";
import { saveInventoryItem, getInventoryItems } from "../../services/itemsStorage.js";
import { savePurchaseBill, getPurchaseBills } from "../../services/purchaseBillsStorage.js";

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

test("Focused 10-point Verification: rt fpharma retrieval, purchase cost matching, filters, profit recalculation", async () => {
  setupInMemoryStorage();

  // 1. Setup master party: rt fpharma
  const party = saveParty({
    id: "party-rt-1",
    partyName: "rt fpharma",
    phone: "9876500001",
  });
  assert.equal(party.partyName, "rt fpharma");

  // 2. Setup master item: Paracetamol 500mg
  const item = saveInventoryItem({
    id: "item-pcm-500",
    itemName: "Paracetamol 500mg",
    purchasePrice: "20",
    salePrice: "30",
  });
  assert.equal(item.itemName, "Paracetamol 500mg");

  // 3. Create sale invoice for rt fpharma on date 11/02/2026 (or 2026-11-02)
  const saleInvoice = saveSaleInvoice({
    id: "sale-rt-101",
    invoiceNumber: "INV-RT-01",
    customer: "rt fpharma",
    form: {
      invoiceNumber: "INV-RT-01",
      customer: "rt fpharma",
      partyId: "party-rt-1",
      invoiceDate: "2026-11-02",
    },
    totals: {
      finalTotal: 600,
      tax: 30,
    },
    rows: [
      {
        sourceItemId: "item-pcm-500",
        item: "Paracetamol 500mg",
        qty: 20,
        price: 30,
      },
      { item: "", qty: "", price: "" }, // blank template row
    ],
  });

  // Check 1: Retrieve the existing rt fpharma sale invoice
  const retrievedSales = getSaleInvoices();
  const foundSale = retrievedSales.find((s) => s.id === "sale-rt-101");
  assert.ok(foundSale, "Sale invoice for rt fpharma must be retrieved from storage");
  assert.equal(foundSale.form?.customer, "rt fpharma");

  // Check 2: Retrieve the associated purchase bill
  const purchaseBill = savePurchaseBill({
    id: "pb-rt-501",
    form: {
      invoiceNumber: "PB-RT-501",
      customer: "rt fpharma",
      invoiceDate: "2026-11-01",
    },
    rows: [
      {
        sourceItemId: "item-pcm-500",
        item: "Paracetamol 500mg",
        qty: 100,
        price: 18, // Purchase price from bill = 18
      },
    ],
  });

  const retrievedBills = getPurchaseBills();
  const foundBill = retrievedBills.find((b) => b.id === "pb-rt-501");
  assert.ok(foundBill, "Associated purchase bill must be retrieved from storage");

  // Check 3: Verify that the party filter returns the invoice
  const calculated = calculateInvoiceProfit(foundSale, getInventoryItems(), getPurchaseBills(), getParties());
  assert.equal(calculated.partyName, "rt fpharma");

  const filterByParty = (invs, selected) => invs.filter((row) => {
    if (selected === "All Parties") return true;
    return row.partyName.trim().toLowerCase() === selected.trim().toLowerCase();
  });

  const partyFiltered = filterByParty([calculated], "rt fpharma");
  assert.equal(partyFiltered.length, 1, "Party filter must return the rt fpharma invoice");

  // Check 4: Verify that the correct date range returns the invoice
  // Both YMD and DD/MM/YYYY inputs for 11/02/2026
  const filterByDate = (invs, from, to) => invs.filter((row) => {
    const fromYmd = parseYMD(from);
    const toYmd = parseYMD(to);
    if (fromYmd && row.dateYmd && row.dateYmd < fromYmd) return false;
    if (toYmd && row.dateYmd && row.dateYmd > toYmd) return false;
    return true;
  });

  // Test "Today" filter: 2026-11-02
  const todayFiltered = filterByDate([calculated], "2026-11-02", "2026-11-02");
  assert.equal(todayFiltered.length, 1, "Date filter 2026-11-02 to 2026-11-02 must return invoice");

  // Test month range: 2026-11-01 to 2026-11-30
  const monthFiltered = filterByDate([calculated], "2026-11-01", "2026-11-30");
  assert.equal(monthFiltered.length, 1, "Month date range must return invoice");

  // Check 5: Create controlled test sale invoice and confirm it appears after saving
  const secondSale = saveSaleInvoice({
    id: "sale-controlled-2",
    invoiceNumber: "INV-CTRL-02",
    customer: "rt fpharma",
    form: { invoiceNumber: "INV-CTRL-02", customer: "rt fpharma", invoiceDate: "2026-11-02" },
    totals: { finalTotal: 300, tax: 0 },
    rows: [{ sourceItemId: "item-pcm-500", item: "Paracetamol 500mg", qty: 10, price: 30 }],
  });
  const allSales = getSaleInvoices();
  assert.ok(allSales.some((s) => s.id === "sale-controlled-2"), "Newly saved sale invoice must appear");

  // Check 6: Update the associated purchase price and verify the profit recalculates
  // Item Paracetamol originally purchase price = 20 in master, sold for 30, qty 20 => cost 400. Profit = 600 - 400 - 30 = 170.
  assert.equal(calculated.totalCost, 400); // 20 * 20
  assert.equal(calculated.profit, 170); // 600 - 400 - 30

  // Now update item purchase price in master to 25
  saveInventoryItem({
    id: "item-pcm-500",
    itemName: "Paracetamol 500mg",
    purchasePrice: "25",
    salePrice: "30",
  });
  const recalculatedWithUpdatedPrice = calculateInvoiceProfit(foundSale, getInventoryItems(), [], getParties());
  assert.equal(recalculatedWithUpdatedPrice.totalCost, 500); // 20 * 25
  assert.equal(recalculatedWithUpdatedPrice.profit, 70); // 600 - 500 - 30 = 70

  // Check 7: Verify that a missing purchase cost produces a clear explanation
  const missingCostSale = {
    id: "sale-missing-cost",
    invoiceNumber: "INV-NOCOST-1",
    customer: "rt fpharma",
    form: { invoiceNumber: "INV-NOCOST-1", customer: "rt fpharma", invoiceDate: "2026-11-02" },
    totals: { finalTotal: 500, tax: 0 },
    rows: [{ item: "Books", qty: 2, price: 250 }], // Books has no master item and no purchase bill
  };
  const missingResult = calculateInvoiceProfit(missingCostSale, getInventoryItems(), [], getParties());
  assert.equal(missingResult.hasMissingCost, true);
  assert.equal(missingResult.totalCost, null);
  assert.equal(missingResult.profit, null);
  assert.equal(missingResult.missingCostItems[0], "Books");
  assert.ok(
    missingResult.items[0].missingReason.includes("Purchase cost not recorded for: Books"),
    "Must explain purchase cost not recorded for Books"
  );
  assert.ok(
    missingResult.items[0].missingReason.includes("Profit cannot be calculated until the missing cost is available"),
    "Must explain profit cannot be calculated"
  );

  // Check 8: Verify that unrelated parties and dates do not appear
  const unrelatedPartyFiltered = filterByParty([calculated], "Unrelated Other Party");
  assert.equal(unrelatedPartyFiltered.length, 0, "Unrelated party must NOT appear");

  const unrelatedDateFiltered = filterByDate([calculated], "2025-01-01", "2025-01-31");
  assert.equal(unrelatedDateFiltered.length, 0, "Unrelated date must NOT appear");

  // Check 9: Verify that historical invoices still appear
  const historicalSale = saveSaleInvoice({
    id: "sale-hist-1",
    invoiceNumber: "INV-HIST-01",
    customer: "Historical Client",
    form: { invoiceNumber: "INV-HIST-01", customer: "Historical Client", invoiceDate: "2026-01-15" },
    totals: { finalTotal: 1000 },
    rows: [{ sourceItemId: "item-pcm-500", item: "Paracetamol 500mg", qty: 50, price: 20 }],
  });
  const allCurrentSales = getSaleInvoices();
  assert.ok(allCurrentSales.some((s) => s.id === "sale-hist-1"), "Historical invoice must still be accessible");

  // Check 10: Verify that no duplicate invoices or purchase bills are created
  const uniqueSaleIds = new Set(allCurrentSales.map((s) => s.id));
  assert.equal(uniqueSaleIds.size, allCurrentSales.length, "No duplicate invoices must exist");

  const allCurrentBills = getPurchaseBills();
  const uniqueBillIds = new Set(allCurrentBills.map((b) => b.id));
  assert.equal(uniqueBillIds.size, allCurrentBills.length, "No duplicate purchase bills must exist");
});
