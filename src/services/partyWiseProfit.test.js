import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePartyWiseProfit,
  matchPartyForInvoice,
  evaluateInvoiceLineItems,
} from "./partyWiseProfitService.js";

// Sample test master data
const mockParties = [
  { id: "cust-01", partyName: "Alpha Enterprises", partyType: "Customer", phone: "9876543210" },
  { id: "cust-02", partyName: "Beta Traders", partyType: "Customer", phone: "9876543211" },
  { id: "cust-03", partyName: "Gamma Solutions", partyType: "Customer", phone: "9876543212" },
  { id: "cust-04", partyName: "Delta Retailers (No Sales)", partyType: "Customer", phone: "9876543213" },
];

const mockItems = [
  { id: "item-101", itemName: "Wireless Keyboard", purchasePrice: 500, salePrice: 800 },
  { id: "item-102", itemName: "Optical Mouse", purchasePrice: 200, salePrice: 350 },
  { id: "item-103", itemName: "USB-C Cable", purchasePrice: 80, salePrice: 150 },
  { id: "item-104", itemName: "Custom Item No Cost", purchasePrice: null, salePrice: 400 },
];

test("Scenario A & D: One customer with one sales invoice yielding profit", () => {
  const salesInvoices = [
    {
      id: "inv-01",
      invoiceNumber: "INV-101",
      partyId: "cust-01",
      invoiceDate: "2026-11-05",
      rows: [
        { sourceItemId: "item-101", item: "Wireless Keyboard", qty: 2, price: 800, discount: 0 }, // gross 1600, cogs 2*500=1000
      ],
      totals: { finalTotal: 1600 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  assert.equal(result.rows.length, 1);
  const party = result.rows[0];
  assert.equal(party.partyId, "cust-01");
  assert.equal(party.invoicesCount, 1);
  assert.equal(party.totalSales, 1600);
  assert.equal(party.cogs, 1000);
  assert.equal(party.grossProfit, 600);
  assert.equal(party.profitMargin, 37.5);
  assert.equal(party.isProfit, true);
  assert.equal(party.isLoss, false);
});

test("Scenario B & K: One customer with multiple sales invoices and multiple items", () => {
  const salesInvoices = [
    {
      id: "inv-01",
      invoiceNumber: "INV-101",
      partyId: "cust-01",
      invoiceDate: "2026-11-05",
      rows: [
        { sourceItemId: "item-101", item: "Wireless Keyboard", qty: 2, price: 800 }, // cogs 1000, sale 1600
        { sourceItemId: "item-102", item: "Optical Mouse", qty: 3, price: 350 }, // cogs 600, sale 1050
      ],
      totals: { finalTotal: 2650 },
    },
    {
      id: "inv-02",
      invoiceNumber: "INV-102",
      partyId: "cust-01",
      invoiceDate: "2026-11-08",
      rows: [
        { sourceItemId: "item-103", item: "USB-C Cable", qty: 10, price: 150 }, // cogs 800, sale 1500
      ],
      totals: { finalTotal: 1500 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  const party = result.rows.find((r) => r.partyId === "cust-01");
  assert.ok(party);
  assert.equal(party.invoicesCount, 2);
  assert.equal(party.totalSales, 4150); // 2650 + 1500
  assert.equal(party.cogs, 2400); // 1600 + 800
  assert.equal(party.grossProfit, 1750); // 4150 - 2400
  assert.equal(Number(party.profitMargin.toFixed(2)), 42.17);
});

test("Scenario C: Multiple customers with different sales amounts", () => {
  const salesInvoices = [
    {
      id: "inv-01",
      invoiceNumber: "INV-101",
      partyId: "cust-01",
      invoiceDate: "2026-11-05",
      rows: [{ sourceItemId: "item-101", qty: 1, price: 1000 }], // cogs 500, sale 1000
      totals: { finalTotal: 1000 },
    },
    {
      id: "inv-02",
      invoiceNumber: "INV-102",
      partyId: "cust-02",
      invoiceDate: "2026-11-06",
      rows: [{ sourceItemId: "item-102", qty: 2, price: 400 }], // cogs 400, sale 800
      totals: { finalTotal: 800 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.summary.totalSales, 1800);
  assert.equal(result.summary.totalCost, 900);
  assert.equal(result.summary.totalGrossProfit, 900);
  assert.equal(result.summary.overallMargin, 50);
});

test("Scenario E: Customer with a loss (selling below purchase price)", () => {
  const salesInvoices = [
    {
      id: "inv-loss",
      invoiceNumber: "INV-LOSS",
      partyId: "cust-03",
      invoiceDate: "2026-11-07",
      rows: [
        { sourceItemId: "item-101", item: "Wireless Keyboard", qty: 2, price: 400 }, // cogs 2*500=1000, sale 800 -> loss -200
      ],
      totals: { finalTotal: 800 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  const party = result.rows[0];
  assert.equal(party.grossSales, 800);
  assert.equal(party.cogs, 1000);
  assert.equal(party.grossProfit, -200);
  assert.equal(party.profitMargin, -25);
  assert.equal(party.isProfit, false);
  assert.equal(party.isLoss, true);
});

test("Scenario F: Sales invoice with discounts correctly reduces net sales", () => {
  const salesInvoices = [
    {
      id: "inv-disc",
      invoiceNumber: "INV-DISC",
      partyId: "cust-01",
      invoiceDate: "2026-11-08",
      rows: [
        { sourceItemId: "item-101", item: "Wireless Keyboard", qty: 2, price: 1000, discount: 10 }, // gross 2000, disc 200, net 1800, cogs 1000
      ],
      totals: { finalTotal: 1800, discount: 200 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  const party = result.rows[0];
  assert.equal(party.totalSales, 1800);
  assert.equal(party.totalDiscount, 200);
  assert.equal(party.cogs, 1000);
  assert.equal(party.grossProfit, 800);
});

test("Scenario G: Sales returns and cancelled invoices handled accurately", () => {
  const salesInvoices = [
    {
      id: "inv-normal",
      invoiceNumber: "INV-NORM",
      partyId: "cust-02",
      invoiceDate: "2026-11-02",
      rows: [{ sourceItemId: "item-101", qty: 2, price: 1000 }], // cogs 1000, sale 2000
      totals: { finalTotal: 2000 },
    },
    {
      id: "inv-cancelled",
      invoiceNumber: "INV-CANC",
      partyId: "cust-02",
      invoiceDate: "2026-11-03",
      cancelled: true, // Should be ignored completely
      rows: [{ sourceItemId: "item-101", qty: 5, price: 1000 }],
      totals: { finalTotal: 5000 },
    },
  ];

  const saleReturns = [
    {
      id: "ret-01",
      partyId: "cust-02",
      returnDate: "2026-11-04",
      rows: [{ sourceItemId: "item-101", qty: 1, price: 1000 }], // returned 1 unit: reduces sale by 1000, cogs by 500
      totals: { finalTotal: 1000 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    saleReturns,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  const party = result.rows[0];
  assert.equal(party.grossSales, 2000);
  assert.equal(party.returnAmount, 1000);
  assert.equal(party.totalSales, 1000); // 2000 - 1000
  assert.equal(party.cogs, 500); // 1000 - 500
  assert.equal(party.grossProfit, 500);
  assert.equal(party.returnsCount, 1);
});

test("Scenario H: Customer without any sales included when onlyWithSales=false", () => {
  const result = calculatePartyWiseProfit({
    salesInvoices: [],
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: false,
  });

  assert.equal(result.rows.length, 4);
  const delta = result.rows.find((r) => r.partyId === "cust-04");
  assert.ok(delta);
  assert.equal(delta.invoicesCount, 0);
  assert.equal(delta.totalSales, 0);
  assert.equal(delta.cogs, 0);
  assert.equal(delta.grossProfit, 0);
  assert.equal(delta.profitMargin, 0);
});

test("Scenario I: Date filter applied correctly excludes out-of-range invoices", () => {
  const salesInvoices = [
    {
      id: "inv-oct",
      partyId: "cust-01",
      invoiceDate: "2026-10-25",
      rows: [{ sourceItemId: "item-101", qty: 1, price: 1000 }],
      totals: { finalTotal: 1000 },
    },
    {
      id: "inv-nov",
      partyId: "cust-01",
      invoiceDate: "2026-11-05",
      rows: [{ sourceItemId: "item-101", qty: 2, price: 1000 }],
      totals: { finalTotal: 2000 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    from: "2026-11-01",
    to: "2026-11-30",
    onlyWithSales: true,
  });

  const party = result.rows[0];
  assert.equal(party.invoicesCount, 1);
  assert.equal(party.totalSales, 2000);
});

test("Scenario J: Missing item purchase cost transparently flagged", () => {
  const salesInvoices = [
    {
      id: "inv-unknown-cost",
      invoiceNumber: "INV-UNC",
      partyId: "cust-01",
      invoiceDate: "2026-11-10",
      rows: [
        { sourceItemId: "item-104", item: "Custom Item No Cost", qty: 2, price: 400 },
      ],
      totals: { finalTotal: 800 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  const party = result.rows[0];
  assert.equal(party.hasMissingCost, true);
  assert.ok(party.missingCostItems.includes("Custom Item No Cost"));
  assert.equal(result.summary.missingCostCount, 1);
});

test("Scenario L: Overall summary strictly reconciles with sum of party records", () => {
  const salesInvoices = [
    {
      id: "inv-1",
      partyId: "cust-01",
      invoiceDate: "2026-11-02",
      rows: [{ sourceItemId: "item-101", qty: 1, price: 1000 }], // cogs 500, profit 500
      totals: { finalTotal: 1000 },
    },
    {
      id: "inv-2",
      partyId: "cust-02",
      invoiceDate: "2026-11-03",
      rows: [{ sourceItemId: "item-102", qty: 4, price: 300 }], // cogs 800, profit 400
      totals: { finalTotal: 1200 },
    },
    {
      id: "inv-3",
      partyId: "cust-03",
      invoiceDate: "2026-11-04",
      rows: [{ sourceItemId: "item-103", qty: 10, price: 120 }], // cogs 800, profit 400
      totals: { finalTotal: 1200 },
    },
  ];

  const result = calculatePartyWiseProfit({
    salesInvoices,
    partiesMaster: mockParties,
    inventoryItems: mockItems,
    onlyWithSales: true,
  });

  const rowSumSales = result.rows.reduce((sum, r) => sum + r.totalSales, 0);
  const rowSumCost = result.rows.reduce((sum, r) => sum + r.cogs, 0);
  const rowSumProfit = result.rows.reduce((sum, r) => sum + r.grossProfit, 0);

  assert.equal(result.summary.totalSales, rowSumSales);
  assert.equal(result.summary.totalCost, rowSumCost);
  assert.equal(result.summary.totalGrossProfit, rowSumProfit);
  assert.equal(result.summary.totalSales, 3400);
  assert.equal(result.summary.totalCost, 2100);
  assert.equal(result.summary.totalGrossProfit, 1300);
});
