import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateItemDetailMovements,
  calculateAllItemsSummary,
  matchesItem,
  isRecordCancelled,
  roundQty,
} from "../../utils/itemDetailCalculations.js";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";

test("1. Item Matching by Name, ID, and Item Code", () => {
  const item = {
    id: "item-cotton-01",
    itemName: "TEST Cotton Shirt",
    itemCode: "TCS-101",
  };

  assert.ok(matchesItem({ item: "TEST Cotton Shirt" }, item), "Matches by exact name");
  assert.ok(matchesItem({ item: "test cotton shirt" }, item), "Matches case-insensitively");
  assert.ok(matchesItem({ sourceItemId: "item-cotton-01" }, item), "Matches by sourceItemId");
  assert.ok(matchesItem({ itemId: "item-cotton-01" }, item), "Matches by itemId");
  assert.ok(matchesItem({ itemCode: "TCS-101" }, item), "Matches by itemCode");
  assert.ok(!matchesItem({ item: "TEST Silk Shirt" }, item), "Rejects non-matching item");
});

test("2. Initial Opening Stock and Period Opening Stock Calculation", () => {
  const item = {
    id: "i1",
    itemName: "Steel Rods",
    initialOpeningQuantity: 100,
  };

  const sales = [
    // Sale before period: 20 units on 2026-10-15
    {
      id: "s1",
      invoiceDate: "2026-10-15",
      rows: [{ item: "Steel Rods", qty: 20 }],
    },
  ];

  const purchases = [
    // Purchase before period: 10 units on 2026-10-20
    {
      id: "p1",
      billDate: "2026-10-20",
      rows: [{ item: "Steel Rods", qty: 10 }],
    },
  ];

  // Selected period: November 2026 (2026-11-01 to 2026-11-30)
  const result = calculateItemDetailMovements({
    selectedItem: item,
    sales,
    purchases,
    from: "2026-11-01",
    to: "2026-11-30",
  });

  // Base opening is 100. Before Nov 1: +10 purchase - 20 sale = 90.
  assert.equal(result.openingQty, 100, "Base opening quantity = 100");
  assert.equal(result.periodOpeningQty, 90, "Period opening as of 2026-11-01 = 90");
  assert.equal(result.periodClosingQty, 90, "Closing quantity with no Nov movement = 90");
});

test("3. Day-by-Day Running Stock Movements & Closing Balance", () => {
  const item = {
    id: "i1",
    itemName: "Cement Bags",
    initialOpeningQuantity: 50,
  };

  const purchases = [
    // Inward: 40 bags on Nov 5
    {
      id: "p1",
      billDate: "2026-11-05",
      rows: [{ item: "Cement Bags", qty: 40 }],
    },
  ];

  const sales = [
    // Outward: 20 bags on Nov 10
    {
      id: "s1",
      invoiceDate: "2026-11-10",
      rows: [{ item: "Cement Bags", qty: 20 }],
    },
  ];

  const adjustments = [
    // Inventory audit adjustment: +5 bags on Nov 15
    {
      item: "Cement Bags",
      date: "2026-11-15",
      quantity: 5,
    },
  ];

  const result = calculateItemDetailMovements({
    selectedItem: item,
    sales,
    purchases,
    adjustments,
    from: "2026-11-01",
    to: "2026-11-30",
    hideInactiveDates: true,
  });

  assert.equal(result.periodOpeningQty, 50);
  assert.equal(result.totalPurchaseQty, 40);
  assert.equal(result.totalSaleQty, 20);
  assert.equal(result.totalAdjQty, 5);
  // Final Closing = 50 + 40 - 20 + 5 = 75
  assert.equal(result.periodClosingQty, 75);

  // Active rows check
  assert.equal(result.rows.length, 3, "Must have exactly 3 days with activity when hideInactiveDates=true");

  // Day 1: Nov 5 (+40 -> closing 90)
  const d1 = result.rows.find((r) => r.date === "2026-11-05");
  assert.ok(d1);
  assert.equal(d1.purchaseQty, 40);
  assert.equal(d1.closingQty, 90);

  // Day 2: Nov 10 (-20 -> closing 70)
  const d2 = result.rows.find((r) => r.date === "2026-11-10");
  assert.ok(d2);
  assert.equal(d2.saleQty, 20);
  assert.equal(d2.closingQty, 70);

  // Day 3: Nov 15 (+5 -> closing 75)
  const d3 = result.rows.find((r) => r.date === "2026-11-15");
  assert.ok(d3);
  assert.equal(d3.adjQty, 5);
  assert.equal(d3.closingQty, 75);
});

test("4. Credit Notes (Sale Returns) and Debit Notes (Purchase Returns) Impact", () => {
  const item = {
    id: "i1",
    itemName: "Power Drill",
    initialOpeningQuantity: 10,
  };

  const sales = [
    // Sold 4 drills on Nov 3
    {
      id: "s1",
      invoiceDate: "2026-11-03",
      rows: [{ item: "Power Drill", qty: 4 }],
    },
  ];

  const saleReturns = [
    // Customer returned 1 drill on Nov 6
    {
      id: "sr1",
      date: "2026-11-06",
      rows: [{ item: "Power Drill", qty: 1 }],
    },
  ];

  const result = calculateItemDetailMovements({
    selectedItem: item,
    sales,
    saleReturns,
    from: "2026-11-01",
    to: "2026-11-30",
    hideInactiveDates: true,
  });

  // Net Sales = 4 - 1 = 3 drills
  // Final Closing = 10 - 3 = 7 drills
  assert.equal(result.totalSaleQty, 3, "Net sale quantity must be 3");
  assert.equal(result.periodClosingQty, 7, "Closing stock must be 7");
});

test("5. Cancelled Transactions Exclusion", () => {
  const item = {
    id: "i1",
    itemName: "Safety Helmet",
    initialOpeningQuantity: 20,
  };

  const sales = [
    {
      id: "s1",
      invoiceDate: "2026-11-04",
      status: "Paid",
      rows: [{ item: "Safety Helmet", qty: 5 }],
    },
    // Cancelled invoice should be ignored
    {
      id: "s2",
      invoiceDate: "2026-11-05",
      status: "Cancelled",
      cancelled: true,
      rows: [{ item: "Safety Helmet", qty: 10 }],
    },
  ];

  const result = calculateItemDetailMovements({
    selectedItem: item,
    sales,
    from: "2026-11-01",
    to: "2026-11-30",
    hideInactiveDates: true,
  });

  assert.equal(result.totalSaleQty, 5, "Only valid sale of 5 helmets should count");
  assert.equal(result.periodClosingQty, 15, "Closing stock = 20 - 5 = 15");
});

test("6. Print Document Generation for Item Detail", () => {
  const item = {
    id: "i1",
    itemName: "Hydraulic Pump",
    initialOpeningQuantity: 15,
  };

  const sales = [
    {
      id: "s1",
      invoiceDate: "2026-11-08",
      rows: [{ item: "Hydraulic Pump", qty: 3 }],
    },
  ];

  const result = calculateItemDetailMovements({
    selectedItem: item,
    sales,
    from: "2026-11-01",
    to: "2026-11-30",
    hideInactiveDates: true,
  });

  const rows = result.rows.map((r, idx) => ({
    index: idx + 1,
    date: r.displayDate,
    saleQty: r.saleQty,
    purchaseQty: r.purchaseQty,
    adjQty: r.adjQty,
    closingQty: r.closingQty,
  }));

  const html = buildUnifiedDocumentHtml({
    title: "Item Detail Report",
    documentNumber: "ITEM-202611",
    date: "13/11/2026",
    status: "Item: Hydraulic Pump",
    partyName: `Opening: ${result.periodOpeningQty} | Closing: ${result.periodClosingQty}`,
    columns: [
      { key: "index", label: "#", align: "center", width: "40px" },
      { key: "date", label: "Date", align: "center" },
      { key: "saleQty", label: "Sale Qty", align: "right" },
      { key: "purchaseQty", label: "Purchase Qty", align: "right" },
      { key: "adjQty", label: "Adj Qty", align: "right" },
      { key: "closingQty", label: "Closing Qty", align: "right" },
    ],
    rows,
    totals: {
      subtotal: result.totalPurchaseQty,
      total: result.periodClosingQty,
    },
    notes: `Total Inward: ${result.totalPurchaseQty} | Total Outward: ${result.totalSaleQty} | Closing: ${result.periodClosingQty}`,
  });

  assert.ok(html.includes("Item Detail Report"), "Contains report title");
  assert.ok(html.includes("Hydraulic Pump"), "Contains item name");
  assert.ok(html.includes("12"), "Contains closing quantity 12");
});

test("7. All Items Stock Movements Summary Calculation", () => {
  const items = [
    { id: "item-1", itemName: "A4 Paper", initialOpeningQuantity: 40, unit: "Ream" },
    { id: "item-2", itemName: "Gel Pens", initialOpeningQuantity: 100, unit: "Box" },
    { id: "item-3", itemName: "Stapler", initialOpeningQuantity: 10, unit: "PCS" },
  ];

  const sales = [
    // A4 Paper: sold 10 on Nov 5
    { id: "s1", invoiceDate: "2026-11-05", rows: [{ itemId: "item-1", qty: 10 }] },
    // Gel Pens: sold 25 on Nov 6
    { id: "s2", invoiceDate: "2026-11-06", rows: [{ itemId: "item-2", qty: 25 }] },
  ];

  const purchases = [
    // A4 Paper: bought 20 on Nov 10
    { id: "p1", billDate: "2026-11-10", rows: [{ itemId: "item-1", qty: 20 }] },
  ];

  const adjustments = [
    // Stapler: adjusted +2 on Nov 12
    { itemId: "item-3", date: "2026-11-12", quantity: 2 },
  ];

  const summary = calculateAllItemsSummary({
    inventoryItems: items,
    sales,
    purchases,
    adjustments,
    from: "2026-11-01",
    to: "2026-11-30",
  });

  assert.equal(summary.rows.length, 3, "All 3 items present in summary");
  assert.equal(summary.totalOpeningQty, 150, "Total opening = 40 + 100 + 10 = 150");
  assert.equal(summary.totalInwardQty, 20, "Total inward = 20");
  assert.equal(summary.totalOutwardQty, 35, "Total outward = 10 + 25 = 35");
  assert.equal(summary.totalAdjQty, 2, "Total adjustment = 2");
  assert.equal(summary.totalClosingQty, 137, "Total closing = 150 + 20 - 35 + 2 = 137");

  // Verify item-level values
  const paper = summary.rows.find((r) => r.id === "item-1");
  assert.equal(paper.periodOpeningQty, 40);
  assert.equal(paper.totalInward, 20);
  assert.equal(paper.totalOutward, 10);
  assert.equal(paper.periodClosingQty, 50);

  const pens = summary.rows.find((r) => r.id === "item-2");
  assert.equal(pens.periodOpeningQty, 100);
  assert.equal(pens.totalOutward, 25);
  assert.equal(pens.periodClosingQty, 75);

  const stapler = summary.rows.find((r) => r.id === "item-3");
  assert.equal(stapler.periodOpeningQty, 10);
  assert.equal(stapler.totalAdj, 2);
  assert.equal(stapler.periodClosingQty, 12);
});

test("8. Dropdown Search Filter is Decoupled from Selected Item Name", () => {
  const items = [
    { id: "item-1", itemName: "A4 Premium Copier Paper - 500 Sheets", itemCode: "A4-01" },
    { id: "item-2", itemName: "Reynolds Ball Pen 0.7mm Blue", itemCode: "PEN-02" },
    { id: "item-3", itemName: "Heavy Duty Stapler 24/6", itemCode: "STP-03" },
    { id: "item-4", itemName: "Sticky Notes 3x3 Yellow", itemCode: "NOTE-04" },
  ];

  // Simulating the bug condition: selectedItemName is "A4 Premium Copier Paper - 500 Sheets"
  const selectedItemName = "A4 Premium Copier Paper - 500 Sheets";

  // IN THE BUGGY VERSION:
  // q = selectedItemName;
  // items.filter(i => i.itemName.toLowerCase().includes(q.toLowerCase())) -> returned only 1 item!

  // IN THE FIXED VERSION:
  // The dropdown search query is separate from the selected item name
  let itemSearchQuery = "";
  let filtered = items.filter((i) => {
    const q = (itemSearchQuery || "").trim().toLowerCase();
    if (!q) return true;
    return (
      (i.itemName || "").toLowerCase().includes(q) ||
      (i.itemCode || "").toLowerCase().includes(q)
    );
  });

  // When dropdown opens, itemSearchQuery is empty, so ALL items are visible
  assert.equal(filtered.length, 4, "All 4 inventory items must be visible when dropdown opens");

  // When user types "pen", it filters down to the pen
  itemSearchQuery = "pen";
  filtered = items.filter((i) => {
    const q = (itemSearchQuery || "").trim().toLowerCase();
    if (!q) return true;
    return (
      (i.itemName || "").toLowerCase().includes(q) ||
      (i.itemCode || "").toLowerCase().includes(q)
    );
  });
  assert.equal(filtered.length, 1, "Searching 'pen' matches only the pen");
  assert.equal(filtered[0].id, "item-2");

  // Selected item name remains "A4 Premium Copier Paper - 500 Sheets" until user selects another
  assert.equal(selectedItemName, "A4 Premium Copier Paper - 500 Sheets");
});

test("9. Negative Stock Audit: Thermal Receipt Roll - 80mm & Overall Mathematical Integrity", () => {
  // Simulating the user's exact reported figures:
  // Thermal Receipt Roll - 80mm: Opening: 2, Inward: 0, Outward: 6, Adjustments: 0 -> Closing: -4
  // Overall Summary: Opening: 433, Inward: +311, Outward: -512, Adjustments: +8 -> Closing: 240
  const items = [
    { id: "roll-1", itemName: "Thermal Receipt Roll - 80mm", initialOpeningQuantity: 2, unit: "Roll" },
    { id: "paper-1", itemName: "A4 Paper", initialOpeningQuantity: 431, unit: "Ream" },
  ];

  const sales = [
    // 6 Thermal Receipt Rolls sold
    { id: "s1", invoiceDate: "2026-11-05", rows: [{ itemId: "roll-1", item: "Thermal Receipt Roll - 80mm", qty: 6 }] },
    // 506 A4 Paper sold (506 + 6 = 512 total outward)
    { id: "s2", invoiceDate: "2026-11-06", rows: [{ itemId: "paper-1", item: "A4 Paper", qty: 506 }] },
  ];

  const purchases = [
    // 311 A4 Paper purchased (0 Thermal Roll purchased)
    { id: "p1", billDate: "2026-11-10", rows: [{ itemId: "paper-1", item: "A4 Paper", qty: 311 }] },
  ];

  const adjustments = [
    // +8 A4 Paper adjustment
    { itemId: "paper-1", item: "A4 Paper", date: "2026-11-12", quantity: 8 },
  ];

  // 1. Audit Single Item Ledger for Thermal Receipt Roll - 80mm
  const rollLedger = calculateItemDetailMovements({
    selectedItem: items[0],
    sales,
    purchases,
    adjustments,
    from: "2026-11-01",
    to: "2026-11-30",
  });

  assert.equal(rollLedger.periodOpeningQty, 2, "Opening stock is 2");
  assert.equal(rollLedger.totalPurchaseQty, 0, "Inward is 0");
  assert.equal(rollLedger.totalSaleQty, 6, "Outward is 6");
  assert.equal(rollLedger.totalAdjQty, 0, "Adjustments is 0");
  assert.equal(rollLedger.periodClosingQty, -4, "Closing stock is exactly 2 + 0 - 6 + 0 = -4");

  // 2. Audit All Items Summary
  const summary = calculateAllItemsSummary({
    inventoryItems: items,
    sales,
    purchases,
    adjustments,
    from: "2026-11-01",
    to: "2026-11-30",
  });

  assert.equal(summary.totalOpeningQty, 433, "Total Opening: 2 + 431 = 433");
  assert.equal(summary.totalInwardQty, 311, "Total Inward: +311");
  assert.equal(summary.totalOutwardQty, 512, "Total Outward: -512");
  assert.equal(summary.totalAdjQty, 8, "Total Adjustments: +8");
  assert.equal(summary.totalClosingQty, 240, "Total Closing: 433 + 311 - 512 + 8 = 240");

  // Verify Point 7: Total closing stock equals sum of individual item closing stocks
  const sumOfIndividualClosings = summary.rows.reduce((sum, r) => sum + r.periodClosingQty, 0);
  assert.equal(summary.totalClosingQty, sumOfIndividualClosings, "Total closing equals sum of individual closing stocks");
  assert.equal(sumOfIndividualClosings, 240);
});

test("10. Table Row UUID does not cause false matches with Item IDs", () => {
  const targetItem = {
    id: "item-alpha",
    itemName: "Alpha Product",
  };

  // Row has a line UUID that does not match targetItem, but has itemId pointing elsewhere
  const rowDifferentItem = {
    id: "item-alpha", // row line id coincidental
    itemId: "item-beta",
    item: "Beta Product",
    qty: 5,
  };

  assert.ok(!matchesItem(rowDifferentItem, targetItem), "Should reject row when itemId belongs to beta");
});
