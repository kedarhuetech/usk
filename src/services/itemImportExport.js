export const itemExportFieldDefinitions = [
  ["itemName", "Item Name"], ["itemCode", "Item Code"], ["type", "Type"], ["description", "Description"],
  ["category", "Category"], ["subCategory", "Sub-Category"], ["barcode", "Barcode"], ["unit", "Unit"],
  ["hsn", "HSN"], ["salePrice", "Sale Price"], ["purchasePrice", "Purchase Price"], ["discount", "Discount"],
  ["discountType", "Discount Type"], ["stock", "Current Stock"], ["isActive", "Active"],
  ["minimumStock", "Minimum Stock"], ["location", "Item Location"], ["taxRate", "Tax Rate"],
  ["saleTaxMode", "Sale Tax Type"], ["purchaseTaxMode", "Purchase Tax Type"],
];

const itemExportValue = (item, key) => key === "stock" ? item.openingQuantity ?? item.stock ?? "" : item[key] ?? "";

export function exportRows(items, options = {}) {
  const { enableItemCategory = true, enableBarcodeScanning = true } = options;
  const fields = itemExportFieldDefinitions.filter(([key]) => {
    if (key === "category" && !enableItemCategory) return false;
    if (key === "barcode" && !enableBarcodeScanning) return false;
    return key === "itemName" || items.some((item) => String(itemExportValue(item, key)).trim());
  });
  return {
    headers: fields.map(([, label]) => label),
    rows: items.map((item) => fields.map(([key]) => String(itemExportValue(item, key) ?? ""))),
  };
}

export function rowsToItems(rows) {
  const cleanedRows = rows.map((row) => row.map((value) => String(value ?? "").trim()));
  const rowsWithValues = cleanedRows.filter((row) => row.some(Boolean));
  if (rowsWithValues.length < 2) throw new Error("The file must include a header row and at least one item.");
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = rowsWithValues[0].map(normalize);
  const column = (...names) => headers.findIndex((header) => names.includes(header));
  const indexes = {
    name: column("item", "itemname", "name", "product", "productname", "itemname", "productname"),
    code: column("itemcode", "code", "sku", "productcode", "itemcode", "productcode"),
    barcode: column("barcode", "itembarcode", "upc", "ean", "barcode"),
    type: column("type", "itemtype"),
    category: column("category", "itemcategory", "categoryname"),
    subCategory: column("subcategory", "itemsubcategory"),
    unit: column("unit", "baseunit", "measurementunit", "uom"),
    salePrice: column("saleprice", "sellingprice", "price", "rate", "mrp", "unitprice"),
    purchasePrice: column("purchaseprice", "costprice", "purchasecost", "cost", "buyingprice"),
    openingStock: column("openingstock", "openingquantity", "openingqty", "initialstock", "openingbalance", "opening"),
    currentStock: column("currentstock", "stock", "quantity", "qty", "closingstock", "availablestock"),
    hsn: column("hsn", "hsncode", "hsnsac", "sac", "hsncode", "hsnsaccode", "saccode", "hsnno", "hsnnumber", "codehsn"),
    taxRate: column("taxrate", "tax", "gst", "gstrate", "vat"),
    cessRate: column("cess", "cessrate"),
    discount: column("discount", "discountvalue"),
    discountType: column("discounttype"),
    saleTaxMode: column("saletaxtype", "saletaxmode"),
    purchaseTaxMode: column("purchasetaxtype", "purchasetaxmode"),
    minimumStock: column("minimumstock", "minimumquantity", "minstock", "minquantity", "minimumstock", "minstock", "reorderpoint", "reorderlevel", "alertquantity"),
    location: column("itemlocation", "location", "rack", "shelf"),
    isActive: column("active", "isactive", "enabled"),
    description: column("description", "itemdescription", "productdescription", "details", "itemdetails", "productdetails", "desc", "notes", "itemnotes", "note", "itemnote", "remarks", "itemremarks"),
  };
  if (indexes.name < 0) throw new Error("The file must include an Item Name column.");
  return rowsWithValues.slice(1).map((values, rowIndex) => {
    const get = (key) => indexes[key] < 0 ? "" : String(values[indexes[key]] || "").trim();

    const rawOpening = get("openingStock");
    const rawCurrent = get("currentStock");
    const effectiveOpening = rawOpening !== "" ? rawOpening : rawCurrent;
    const effectiveCurrent = rawCurrent !== "" ? rawCurrent : rawOpening;
    const hsnValue = get("hsn");
    const minStockValue = get("minimumStock");

    return {
      rowNumber: rowIndex + 2,
      itemName: get("name"),
      itemCode: get("code"),
      barcode: get("barcode"),
      type: get("type").toLowerCase() === "service" ? "service" : "product",
      category: get("category"),
      subCategory: get("subCategory"),
      unit: get("unit"),
      salePrice: get("salePrice"),
      purchasePrice: get("purchasePrice"),
      openingQuantity: effectiveOpening,
      openingStock: effectiveOpening,
      currentStock: effectiveCurrent,
      stock: effectiveCurrent,
      hsn: hsnValue,
      hsnCode: hsnValue,
      hsn_code: hsnValue,
      taxRate: get("taxRate"),
      cessRate: get("cessRate"),
      discount: get("discount"),
      discountType: get("discountType") || "Percentage",
      saleTaxMode: get("saleTaxMode"),
      purchaseTaxMode: get("purchaseTaxMode"),
      minimumStock: minStockValue,
      minStock: minStockValue,
      min_stock: minStockValue,
      location: get("location"),
      isActive: !["false", "0", "no", "inactive", "disabled"].includes(get("isActive").toLowerCase()),
      description: get("description"),
    };
  });
}
