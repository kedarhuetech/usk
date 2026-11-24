import test from "node:test";
import assert from "node:assert/strict";
import { exportRows, rowsToItems } from "../../services/itemImportExport.js";
import { normalizeInventoryItem } from "../../services/itemsStorage.js";

test("item export/import round trip preserves active status, unit, categories, barcode, tax and discount", () => {
  const source = { id: "i1", itemName: "Tea", itemCode: "SKU1", barcode: "89000001", type: "product", description: "Green tea", category: "Grocery", subCategory: "Tea", unit: "KG", salePrice: "120", purchasePrice: "80", saleTaxMode: "Without Tax", purchaseTaxMode: "With Tax", taxRate: "5%", discount: "10", discountType: "Percentage", openingQuantity: "6", minimumStock: "2", location: "A1", isActive: false };
  const exported = exportRows([source]);
  const imported = rowsToItems([exported.headers, ...exported.rows])[0];
  assert.equal(imported.itemName, "Tea");
  assert.equal(imported.barcode, "89000001");
  assert.equal(imported.unit, "KG");
  assert.equal(imported.category, "Grocery");
  assert.equal(imported.subCategory, "Tea");
  assert.equal(imported.taxRate, "5%");
  assert.equal(imported.discount, "10");
  assert.equal(imported.discountType, "Percentage");
  assert.equal(imported.saleTaxMode, "Without Tax");
  assert.equal(imported.purchaseTaxMode, "With Tax");
  assert.equal(imported.minimumStock, "2");
  assert.equal(imported.location, "A1");
  assert.equal(imported.isActive, false);
  assert.equal(imported.description, "Green tea");
});

test("rowsToItems correctly parses HSN Code, Opening Stock, Current Stock, and Minimum Stock with typical Excel headers", () => {
  const excelHeaders = [
    "Item Name", "Item Code", "HSN Code", "Opening Stock", "Current Stock", "Minimum Stock", "Unit", "Sale Price", "Purchase Price", "Tax Rate"
  ];
  const excelRows = [
    ["USB Keyboard", "ACC-KBD-001", "847160", "18", "18", "5", "PCS", "450", "320", "18"],
    ["Cotton Cleaning Cloth", "CLN-CTN-001", "630710", "35", "35", "8", "PCS", "60", "40", "5"],
    ["LED Bulb 9W", "ELE-LED-009", "853950", "60", "60", "15", "PCS", "110", "75", "12"],
    ["A4 Copier Paper", "PAP-A4-001", "480256", "45", "45", "10", "RIM", "240", "190", "12"],
    ["Blue Ball Pen", "PEN-BLU-001", "960810", "150", "150", "25", "BOX", "120", "85", "18"],
  ];

  const items = rowsToItems([excelHeaders, ...excelRows]);
  assert.equal(items.length, 5);

  assert.equal(items[0].itemName, "USB Keyboard");
  assert.equal(items[0].hsnCode, "847160");
  assert.equal(items[0].openingStock, "18");
  assert.equal(items[0].currentStock, "18");
  assert.equal(items[0].minimumStock, "5");
  assert.equal(items[0].minStock, "5");

  assert.equal(items[1].itemName, "Cotton Cleaning Cloth");
  assert.equal(items[1].hsnCode, "630710");
  assert.equal(items[1].openingStock, "35");
  assert.equal(items[1].currentStock, "35");
  assert.equal(items[1].minimumStock, "8");

  assert.equal(items[2].itemName, "LED Bulb 9W");
  assert.equal(items[2].hsnCode, "853950");
  assert.equal(items[2].openingStock, "60");
  assert.equal(items[2].minimumStock, "15");

  assert.equal(items[3].itemName, "A4 Copier Paper");
  assert.equal(items[3].hsnCode, "480256");
  assert.equal(items[3].openingStock, "45");
  assert.equal(items[3].minimumStock, "10");

  assert.equal(items[4].itemName, "Blue Ball Pen");
  assert.equal(items[4].hsnCode, "960810");
  assert.equal(items[4].openingStock, "150");
  assert.equal(items[4].minimumStock, "25");

  // Verify normalizeInventoryItem correctly transforms parsed row
  const normalized = normalizeInventoryItem(items[0]);
  assert.equal(normalized.hsn, "847160");
  assert.equal(normalized.hsnCode, "847160");
  assert.equal(normalized.openingStock, 18);
  assert.equal(normalized.opening_stock, 18);
  assert.equal(normalized.currentStock, 18);
  assert.equal(normalized.minStock, 5);
  assert.equal(normalized.minimumStock, "5");
});

test("rowsToItems correctly parses Description with varied header aliases and normalizeInventoryItem preserves it", () => {
  const testHeaders = [
    ["Item Name", "Item Code", "Description"],
    ["Item Name", "Item Code", "Item Description"],
    ["Item Name", "Item Code", "Product Description"],
    ["Item Name", "Item Code", "Details"],
    ["Item Name", "Item Code", "Item Details"],
    ["Item Name", "Item Code", "Remarks"],
    ["Item Name", "Item Code", "Notes"],
  ];

  for (const headers of testHeaders) {
    const rows = [
      headers,
      ["Wireless Keyboard", "KB-01", "Ergonomic 2.4GHz wireless keyboard"],
    ];
    const [parsed] = rowsToItems(rows);
    assert.equal(parsed.itemName, "Wireless Keyboard");
    assert.equal(parsed.itemCode, "KB-01");
    assert.equal(parsed.description, "Ergonomic 2.4GHz wireless keyboard", `Failed for header "${headers[2]}"`);

    const normalized = normalizeInventoryItem(parsed);
    assert.equal(normalized.description, "Ergonomic 2.4GHz wireless keyboard");
  }
});


