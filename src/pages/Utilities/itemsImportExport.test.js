import test from "node:test";
import assert from "node:assert/strict";
import { exportRows, rowsToItems } from "../../services/itemImportExport.js";

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
});
