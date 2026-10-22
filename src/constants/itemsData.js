export const units = ["PCS", "BOX", "KG", "GRAM", "LTR", "MTR", "PACK", "BAG"];

export const taxOptions = [
  "None",
  "GST 0%",
  "IGST 0%",
  "GST 5%",
  "IGST 5%",
  "GST 12%",
  "IGST 12%",
  "GST 18%",
  "IGST 18%",
  "GST 28%",
  "IGST 28%",
  "GST 40%",
  "IGST 40%",
  "Exempt",
];

export const taxModes = ["Without Tax", "With Tax"];
export const discountTypes = ["Percentage", "Flat Amount"];
export const defaultCategories = ["General", "Electronics", "Grocery", "Services"];

export const itemDefaults = {
  type: "product",
  itemName: "",
  hsn: "",
  category: "",
  itemCode: "",
  unit: "",
  baseUnit: "",
  secondaryUnit: "",
  salePrice: "",
  saleTaxMode: taxModes[0],
  purchasePrice: "",
  purchaseTaxMode: taxModes[0],
  discount: "",
  discountType: discountTypes[0],
  taxRate: taxOptions[0],
  openingQuantity: "",
  atPrice: "",
  asOfDate: "2026-07-24",
  location: "",
  minimumStock: "",
};
