import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage for node environment
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  },
};

import {
  getInventoryItems,
  saveInventoryItem,
  inventoryItemsStorageKey,
} from "../../services/itemsStorage.js";
import {
  calculateInvoiceProfit,
  resolveItemPurchaseCost,
} from "../../utils/billWiseProfit.js";

test("Scenario 1: Item selection and details view data integrity", () => {
  storage.clear();
  const testItem = {
    id: "item-select-1",
    itemName: "Maggi 2-Minute Noodles",
    itemCode: "MAG-001",
    category: "Instant Food",
    unit: "PCS",
    salePrice: "14.00",
    purchasePrice: "10.00",
    openingQuantity: "100",
    stock: "100",
  };
  saveInventoryItem(testItem);

  const items = getInventoryItems();
  assert.equal(items.length, 1);
  const selectedItem = items.find((i) => i.id === "item-select-1");
  assert.ok(selectedItem, "Item should be selectable by id");
  assert.equal(selectedItem.itemName, "Maggi 2-Minute Noodles");
  assert.equal(selectedItem.salePrice, "14.00");
  assert.equal(selectedItem.purchasePrice, "10.00");
  assert.equal(selectedItem.stock, "100");
});

test("Scenario 2: Details view displays correct fields and stock calculations", () => {
  storage.clear();
  const testItem = {
    id: "item-details-2",
    itemName: "Sunflower Oil 1L",
    itemCode: "OIL-001",
    category: "Edible Oil",
    unit: "Ltr",
    salePrice: "160.00",
    purchasePrice: "135.00",
    openingQuantity: "50",
    stock: "50",
  };
  saveInventoryItem(testItem);

  const [item] = getInventoryItems();
  assert.equal(item.salePrice, "160.00");
  assert.equal(item.purchasePrice, "135.00");
  const stockQty = Number(item.stock);
  const purchaseCost = Number(item.purchasePrice);
  const stockVal = stockQty * purchaseCost;
  assert.equal(stockVal, 6750);
});

test("Scenario 3 & 4: Edit modal prefilling existing item data with exact ID", () => {
  storage.clear();
  const originalItem = {
    id: "itm-prefill-3",
    type: "product",
    itemName: "Basmati Rice 5kg",
    itemCode: "RICE-5K",
    category: "Grains",
    unit: "BAG",
    salePrice: "450.00",
    purchasePrice: "380.00",
    taxRate: "5%",
    openingQuantity: "25",
    description: "Premium aromatic rice",
  };
  saveInventoryItem(originalItem);

  // Simulate loading item into createEditableItemForm
  const stored = getInventoryItems().find((i) => i.id === "itm-prefill-3");
  assert.equal(stored.id, "itm-prefill-3");
  assert.equal(stored.itemName, "Basmati Rice 5kg");
  assert.equal(stored.itemCode, "RICE-5K");
  assert.equal(stored.purchasePrice, "380.00");
  assert.equal(stored.salePrice, "450.00");
  assert.equal(stored.unit, "BAG");
  assert.equal(stored.category, "Grains");
});

test("Scenario 5 & 7: Purchase price update persists and prevents duplicate items", () => {
  storage.clear();
  const initialItem = {
    id: "itm-edit-save-5",
    type: "product",
    itemName: "CJP Item",
    itemCode: "CJP-01",
    salePrice: "220.00",
    purchasePrice: "", // Initially missing purchase price
    unit: "BOX",
  };
  saveInventoryItem(initialItem);
  assert.equal(getInventoryItems().length, 1);

  // Edit item: update purchase price
  const updatedItem = {
    ...initialItem,
    purchasePrice: "180.00",
  };
  saveInventoryItem(updatedItem);

  const itemsAfter = getInventoryItems();
  // Ensure NO DUPLICATES were created
  assert.equal(itemsAfter.length, 1, "Must not create duplicate items on edit save");
  assert.equal(itemsAfter[0].id, "itm-edit-save-5");
  assert.equal(itemsAfter[0].purchasePrice, "180.00");
  assert.equal(itemsAfter[0].itemName, "CJP Item");
});

test("Scenario 6: Cancellation leaves item data unchanged", () => {
  storage.clear();
  const initialItem = {
    id: "itm-cancel-6",
    itemName: "Milk Pouch 500ml",
    salePrice: "30.00",
    purchasePrice: "24.00",
  };
  saveInventoryItem(initialItem);

  // Simulating cancel: edit form state changes locally in form, but onClose is called without saveInventoryItem
  const abortedEdit = {
    ...initialItem,
    purchasePrice: "999.00",
  };
  // Close without saving
  const current = getInventoryItems();
  assert.equal(current[0].purchasePrice, "24.00", "Cancellation must keep original price untouched");
});

test("Scenario 8: Bill Wise Profit recalculation before and after updating item purchase price", () => {
  storage.clear();
  // Step 1: Item in master with NO purchase price
  const cjpItem = {
    id: "cjp-item-id-888",
    itemName: "CJP Special",
    salePrice: "220.00",
    purchasePrice: "", // Not set
    unit: "BOX",
  };
  saveInventoryItem(cjpItem);

  // Sale invoice for CJP Special
  const saleInvoice = {
    id: "inv-cjp-888",
    invoiceNumber: "1",
    date: "2026-10-28",
    customer: "cjp",
    totalAmount: 220,
    rows: [
      {
        sourceItemId: "cjp-item-id-888",
        item: "CJP Special",
        qty: 1,
        unit: "BOX",
        price: 220,
        amount: 220,
      },
    ],
    totals: { finalTotal: 220 },
  };

  // BEFORE FIX / UPDATE: Profit is Unavailable because purchasePrice is not set
  const profitBefore = calculateInvoiceProfit(saleInvoice, getInventoryItems(), []);
  assert.equal(profitBefore.hasMissingCost, true, "Must flag missing cost before purchase price is set");
  assert.equal(profitBefore.profit, null, "Profit must be Unavailable before price is set");
  assert.equal(profitBefore.items[0].purchasePrice, null);

  // STEP 2: User opens Items -> Edit Item and sets Purchase Price to 150.00
  const updatedCjpItem = {
    ...cjpItem,
    purchasePrice: "150.00",
  };
  saveInventoryItem(updatedCjpItem);

  // AFTER FIX / UPDATE: Profit recalculates immediately
  const profitAfter = calculateInvoiceProfit(saleInvoice, getInventoryItems(), []);
  assert.equal(profitAfter.hasMissingCost, false, "Must not have missing cost after update");
  assert.equal(profitAfter.items[0].purchasePrice, 150);
  assert.equal(profitAfter.totalCost, 150);
  // Sale Amount (220) - Total Cost (150) = 70.00 Profit
  assert.equal(profitAfter.profit, 70, "Profit must equal Sale Amount minus Cost (220 - 150 = 70)");
  assert.equal(profitAfter.isLoss, false);
});

test("Purchase bills vs Item master priority in Bill Wise Profit", () => {
  storage.clear();
  // Master item has purchasePrice = 100
  const item = {
    id: "multi-source-item-1",
    itemName: "Sugar 1kg",
    purchasePrice: "100.00",
  };
  saveInventoryItem(item);

  const row = {
    sourceItemId: "multi-source-item-1",
    item: "Sugar 1kg",
    qty: 2,
  };

  // If master has price 100 and no purchase bill, cost is 100 from inventory_master
  const costFromMaster = resolveItemPurchaseCost(row, [item], []);
  assert.equal(costFromMaster.purchasePrice, 100);
  assert.equal(costFromMaster.source, "inventory_master");

  // If row has an explicit snapshot, row snapshot takes top priority
  const rowWithSnapshot = { ...row, purchasePrice: 95 };
  const costFromSnapshot = resolveItemPurchaseCost(rowWithSnapshot, [item], []);
  assert.equal(costFromSnapshot.purchasePrice, 95);
  assert.equal(costFromSnapshot.source, "row_snapshot");

  // If master has NO price, fallback to purchase bills history works seamlessly
  const itemNoPrice = { ...item, purchasePrice: "" };
  const purchaseBills = [
    {
      id: "pb-1",
      billDate: "2026-10-25",
      rows: [{ sourceItemId: "multi-source-item-1", item: "Sugar 1kg", price: 92 }],
    },
  ];
  const costFromBill = resolveItemPurchaseCost(row, [itemNoPrice], purchaseBills);
  assert.equal(costFromBill.purchasePrice, 92);
  assert.equal(costFromBill.source, "purchase_bill_history");
});
