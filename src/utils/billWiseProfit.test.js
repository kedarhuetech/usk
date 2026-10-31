import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYMD,
  formatDateDisplay,
  resolveItemPurchaseCost,
  calculateInvoiceProfit,
} from "./billWiseProfit.js";

test("parseYMD correctly converts date variations", () => {
  assert.equal(parseYMD("2026-10-24"), "2026-10-24");
  assert.equal(parseYMD("24/10/2026"), "2026-10-24");
  assert.equal(parseYMD("24-10-2026"), "2026-10-24");
  assert.equal(parseYMD("2026-10-24T10:00:00.000Z"), "2026-10-24");
});

test("formatDateDisplay formats YMD into DD/MM/YYYY", () => {
  assert.equal(formatDateDisplay("2026-10-24"), "24/10/2026");
});

test("resolveItemPurchaseCost prioritizes row snapshot then inventory master then purchase bills", () => {
  const inventory = [
    { id: "item-1", itemName: "Widget A", purchasePrice: "100" },
    { id: "item-2", itemName: "Widget B", atPrice: "150" },
  ];
  const purchaseBills = [
    {
      rows: [{ item: "Widget C", price: "200" }],
    },
  ];

  // 1. Direct row snapshot
  const rowWithSnapshot = { item: "Widget A", sourceItemId: "item-1", purchasePrice: 90 };
  assert.deepEqual(resolveItemPurchaseCost(rowWithSnapshot, inventory, purchaseBills), {
    purchasePrice: 90,
    source: "row_snapshot",
  });

  // 2. Inventory master by id
  const rowFromInventory = { item: "Widget A", sourceItemId: "item-1" };
  assert.deepEqual(resolveItemPurchaseCost(rowFromInventory, inventory, purchaseBills), {
    purchasePrice: 100,
    source: "inventory_master",
  });

  // 3. Inventory master atPrice
  const rowWithAtPrice = { item: "Widget B", sourceItemId: "item-2" };
  assert.deepEqual(resolveItemPurchaseCost(rowWithAtPrice, inventory, purchaseBills), {
    purchasePrice: 150,
    source: "inventory_at_price",
  });

  // 4. Purchase bill fallback
  const rowFromBills = { item: "Widget C" };
  assert.deepEqual(resolveItemPurchaseCost(rowFromBills, inventory, purchaseBills), {
    purchasePrice: 200,
    source: "purchase_bill_history",
  });

  // 5. Unknown item - DO NOT ASSUME ZERO!
  const unknownRow = { item: "Unknown Gadget" };
  assert.deepEqual(resolveItemPurchaseCost(unknownRow, inventory, purchaseBills), {
    purchasePrice: null,
    source: "missing",
  });
});

test("calculateInvoiceProfit computes profit correctly with standard formula", () => {
  // Formula: Profit = Sale Amount - Total Cost - Tax Payable + TDS Receivable
  // Invoice with 2 items:
  // Item 1: 2 x 600 cost = 1200 cost, sold for 1900
  // Sale Amount: 2000 (includes 100 tax)
  // Tax Payable: 100
  // TDS Receivable: 50
  // Additional Charges: 30
  // Total Cost = 1200
  // Profit = 2000 - 1200 - 100 + 50 = 750
  // Profit (Excl. Additional Charges) = 750 - 30 = 720
  const inventory = [
    { id: "item-1", itemName: "Shirt", purchasePrice: 600 },
  ];
  const invoice = {
    id: "inv-1",
    invoiceNumber: "INV-101",
    customer: "Acme Corp",
    invoiceDate: "2026-10-24",
    totals: {
      finalTotal: 2000,
      tax: 100,
      additionalCharges: 30,
      tds: 50,
    },
    rows: [
      {
        sourceItemId: "item-1",
        item: "Shirt",
        qty: 2,
        price: 950,
      },
    ],
  };

  const result = calculateInvoiceProfit(invoice, inventory, []);
  assert.equal(result.hasMissingCost, false);
  assert.equal(result.saleAmount, 2000);
  assert.equal(result.totalCost, 1200);
  assert.equal(result.taxPayable, 100);
  assert.equal(result.tdsReceivable, 50);
  assert.equal(result.additionalCharges, 30);
  assert.equal(result.profit, 750);
  assert.equal(result.profitExcludingCharges, 720);
  assert.equal(result.isLoss, false);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].purchasePrice, 600);
  assert.equal(result.items[0].totalCost, 1200);
});

test("calculateInvoiceProfit reports loss when costs exceed sale", () => {
  const inventory = [
    { id: "item-1", itemName: "Costly Item", purchasePrice: 500 },
  ];
  const invoice = {
    id: "inv-loss",
    invoiceNumber: "INV-LOSS",
    customer: "Loss Customer",
    totals: {
      finalTotal: 400,
      tax: 0,
    },
    rows: [
      {
        sourceItemId: "item-1",
        item: "Costly Item",
        qty: 1,
        price: 400,
      },
    ],
  };

  const result = calculateInvoiceProfit(invoice, inventory, []);
  assert.equal(result.hasMissingCost, false);
  assert.equal(result.totalCost, 500);
  assert.equal(result.saleAmount, 400);
  assert.equal(result.profit, -100);
  assert.equal(result.isLoss, true);
});

test("calculateInvoiceProfit does NOT assume 0 when cost is missing", () => {
  const inventory = [];
  const invoice = {
    id: "inv-missing",
    invoiceNumber: "INV-MISSING",
    customer: "No Cost Party",
    totals: {
      finalTotal: 1500,
      tax: 0,
    },
    rows: [
      {
        item: "Mystery Item",
        qty: 3,
        price: 500,
      },
    ],
  };

  const result = calculateInvoiceProfit(invoice, inventory, []);
  assert.equal(result.hasMissingCost, true);
  assert.equal(result.totalCost, null);
  assert.equal(result.profit, null);
  assert.equal(result.profitExcludingCharges, null);
  assert.equal(result.items[0].purchasePrice, null);
  assert.equal(result.items[0].totalCost, null);
  assert.equal(result.items[0].isCostMissing, true);
});

test("calculateInvoiceProfit ignores blank default template rows and calculates profit from valid item", () => {
  const purchaseBills = [
    {
      id: "pb-245",
      rows: [{ sourceItemId: "item-245", item: "Widget Pro", price: "245", qty: "10" }],
    },
  ];
  const inventory = [{ id: "item-245", itemName: "Widget Pro", purchasePrice: "" }];

  // Invoice with 1 valid item (sold for 400, cost 245) and 1 blank template row
  const invoice = {
    id: "inv-with-blank",
    invoiceNumber: "INV-245",
    customer: "Test Buyer",
    totals: { finalTotal: 400, tax: 0 },
    rows: [
      { sourceItemId: "item-245", item: "Widget Pro", qty: "1", price: "400" },
      { item: "", qty: "", price: "" }, // Default empty row from AddSale
    ],
  };

  const result = calculateInvoiceProfit(invoice, inventory, purchaseBills);
  assert.equal(result.hasMissingCost, false);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].purchasePrice, 245);
  assert.equal(result.items[0].totalCost, 245);
  assert.equal(result.totalCost, 245);
  assert.equal(result.saleAmount, 400);
  assert.equal(result.profit, 155); // 400 - 245 = 155
});

test("resolveItemPurchaseCost matches purchase bill by item ID even if name differs", () => {
  const purchaseBills = [
    {
      id: "pb-id-match",
      rows: [{ sourceItemId: "item-uuid-99", item: "Item Name Renamed Later", price: 245 }],
    },
  ];

  const saleRow = {
    sourceItemId: "item-uuid-99",
    item: "Item Original Name In Sale",
  };

  const resolved = resolveItemPurchaseCost(saleRow, [], purchaseBills);
  assert.equal(resolved.purchasePrice, 245);
  assert.equal(resolved.source, "purchase_bill_history");
});

test("resolveItemPurchaseCost reads candidate fields: price, rate, unitPrice, purchasePrice", () => {
  const bills = [
    { rows: [{ sourceItemId: "item-rate", rate: "245" }] },
    { rows: [{ sourceItemId: "item-unitprice", unitPrice: "180" }] },
    { rows: [{ sourceItemId: "item-pprice", purchasePrice: "320" }] },
  ];

  assert.equal(resolveItemPurchaseCost({ sourceItemId: "item-rate" }, [], bills).purchasePrice, 245);
  assert.equal(resolveItemPurchaseCost({ sourceItemId: "item-unitprice" }, [], bills).purchasePrice, 180);
  assert.equal(resolveItemPurchaseCost({ sourceItemId: "item-pprice" }, [], bills).purchasePrice, 320);
});

test("CJP sale invoice calculates correct profit when matching new purchase bill for CJP", () => {
  const saleInvoice = {
    id: "sale-cjp",
    invoiceNumber: "INV-CJP-1",
    customer: "CJP",
    invoiceDate: "2026-10-25",
    totals: { finalTotal: 1000, tax: 0 },
    rows: [
      { item: "CJP", qty: "2", price: "500" },
      { item: "", qty: "", price: "" }, // Default empty row from AddSale
    ],
  };

  const purchaseBills = [
    {
      id: "pb-cjp-old",
      form: { invoiceDate: "2026-01-01", customer: "Old Supplier" },
      rows: [{ item: "CJP", qty: "1", price: "100" }],
    },
    {
      id: "pb-cjp-new",
      form: { invoiceDate: "2026-10-31", customer: "CJP Supplier" },
      rows: [{ item: "CJP", qty: "5", price: "245" }],
    },
  ];

  const result = calculateInvoiceProfit(saleInvoice, [], purchaseBills);
  assert.equal(result.hasMissingCost, false);
  assert.equal(result.items.length, 1);
  // Must pick the latest purchase bill (245)
  assert.equal(result.items[0].purchasePrice, 245);
  assert.equal(result.items[0].totalCost, 490); // 2 * 245
  assert.equal(result.saleAmount, 1000);
  assert.equal(result.profit, 510); // 1000 - 490
  assert.equal(result.isLoss, false);
});

test("resolveItemPurchaseCost prefers latest purchase bill by date", () => {
  const bills = [
    {
      id: "b1",
      form: { invoiceDate: "2026-05-01" },
      rows: [{ item: "Item Z", price: 100 }],
    },
    {
      id: "b2",
      form: { invoiceDate: "2026-10-30" },
      rows: [{ item: "Item Z", price: 245 }],
    },
  ];

  const cost = resolveItemPurchaseCost({ item: "Item Z" }, [], bills);
  assert.equal(cost.purchasePrice, 245);
});
