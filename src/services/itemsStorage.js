const INVENTORY_ITEMS_KEY = "ledgerly:inventoryItems.v1";

function safeParse(value, fallback) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readItems() {
  if (!canUseStorage()) return [];
  return safeParse(window.localStorage.getItem(INVENTORY_ITEMS_KEY), []);
}

function writeItems(items) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(INVENTORY_ITEMS_KEY, JSON.stringify(items));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

function itemType(item = {}) {
  return String(item.type || "product").toLowerCase();
}

function normalizeDiscountType(value = "") {
  const type = String(value || "").toLowerCase();
  if (type.includes("%") || type.includes("percent")) return "Percentage";
  if (type.includes("₹") || type.includes("rs") || type.includes("rupee")) return "Flat Amount";
  if (type.includes("flat") || type.includes("amount") || type.includes("fixed")) return "Flat Amount";
  return "Percentage";
}

function normalizeBatch(row = {}) {
  return {
    id: row.id || crypto.randomUUID(),
    batchNo: row.batchNo || "",
    manufacturer: row.manufacturer || "",
    mfgDate: row.mfgDate || "",
    expDate: row.expDate || "",
    remarks: row.remarks || row.dosage || "",
    openingQty: row.openingQty || "",
  };
}

function batchQuantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function filledBatches(batches = []) {
  return batches
    .map(normalizeBatch)
    .filter((row) => Object.entries(row).some(([key, value]) => key !== "id" && String(value || "").trim()));
}

function batchOpeningTotal(batches = []) {
  return batches.reduce((total, row) => total + batchQuantity(row.openingQty), 0);
}

export function normalizeInventoryItem(itemForm = {}) {
  const type = itemType(itemForm);
  const itemName = itemForm.itemName?.trim() || itemForm.serviceName?.trim() || itemForm.name?.trim() || "New Item";
  const id = itemForm.id || `item-${crypto.randomUUID()}`;
  const unit = itemForm.unit || itemForm.baseUnit || "";
  const imageUrl = itemForm.imageUrl || itemForm.image || "";
  const itemCode = itemForm.itemCode || itemForm.serviceCode || itemForm.code || "";
  const hsn = itemForm.hsn || itemForm.sac || "";
  const wholesale = itemForm.wholesale || null;
  const batches = filledBatches(itemForm.batches || []);
  const batchTotal = batchOpeningTotal(batches);
  const manualOpeningQuantity = hasValue(itemForm.openingQuantity)
    ? String(itemForm.openingQuantity)
    : hasValue(itemForm.stock)
      ? String(itemForm.stock)
      : "";
  const openingQuantity = hasValue(itemForm.openingQuantity)
    ? String(itemForm.openingQuantity)
    : batches.length
      ? String(batchTotal)
      : manualOpeningQuantity;
  const discount = hasValue(itemForm.discount) ? itemForm.discount : itemForm.discountValue || "";

  return {
    id,
    type,
    itemName,
    serviceName: type === "service" ? itemName : "",
    name: itemName,
    hsn,
    sac: type === "service" ? hsn : "",
    category: itemForm.category || "",
    itemCode,
    serviceCode: type === "service" ? itemCode : "",
    code: itemCode,
    description: itemForm.description || "",
    unit,
    baseUnit: itemForm.baseUnit || "",
    secondaryUnit: itemForm.secondaryUnit || "",
    salePrice: itemForm.salePrice || "",
    price: itemForm.salePrice || itemForm.price || "",
    saleTaxMode: itemForm.saleTaxMode || "Without Tax",
    purchasePrice: itemForm.purchasePrice || "",
    purchaseTaxMode: itemForm.purchaseTaxMode || "Without Tax",
    discount,
    discountValue: discount,
    discountType: normalizeDiscountType(itemForm.discountType),
    wholesale,
    wholesalePrice: itemForm.wholesalePrice || wholesale?.price || "",
    wholesaleTaxMode: itemForm.wholesaleTaxMode || wholesale?.taxMode || "",
    minimumWholesaleQuantity: itemForm.minimumWholesaleQuantity || wholesale?.minimumQty || "",
    taxRate: itemForm.taxRate || "None",
    openingQuantity,
    stock: openingQuantity || "0",
    atPrice: itemForm.atPrice || "",
    asOfDate: itemForm.asOfDate || "",
    location: itemForm.location || "",
    minimumStock: itemForm.minimumStock || "",
    batches,
    image: imageUrl,
    imageUrl,
    updatedAt: new Date().toISOString(),
    createdAt: itemForm.createdAt || new Date().toISOString(),
  };
}

export function calculateInventoryItemPricing(item = {}) {
  const originalPrice = Math.max(toNumber(item.salePrice || item.price), 0);
  const discountValue = Math.max(toNumber(item.discount), 0);
  const discountType = normalizeDiscountType(item.discountType);

  if (!originalPrice || !discountValue) {
    return {
      originalPrice,
      finalPrice: originalPrice,
      discountAmount: 0,
      discountValue: 0,
      discountType,
      discountLabel: "",
      hasDiscount: false,
    };
  }

  const discountAmount =
    discountType === "Percentage"
      ? Math.min(originalPrice, originalPrice * (Math.min(discountValue, 100) / 100))
      : Math.min(originalPrice, discountValue);
  const finalPrice = Math.max(originalPrice - discountAmount, 0);
  const discountLabel =
    discountType === "Percentage"
      ? `${Math.round(Math.min(discountValue, 100) * 100) / 100}% OFF`
      : `Rs ${Math.round(discountAmount * 100) / 100} OFF`;

  return {
    originalPrice,
    finalPrice,
    discountAmount,
    discountValue,
    discountType,
    discountLabel,
    hasDiscount: discountAmount > 0,
  };
}

export function getInventoryItemAvailability(item = {}) {
  if (itemType(item) === "service") {
    return { showStock: false, label: "", inStock: true, quantity: null };
  }

  const quantity = Math.max(toNumber(hasValue(item.openingQuantity) ? item.openingQuantity : item.stock), 0);
  return {
    showStock: true,
    label: quantity > 0 ? "In Stock" : "Out of Stock",
    inStock: quantity > 0,
    quantity,
  };
}

export function getInventoryItems() {
  return readItems().map((item) => normalizeInventoryItem(item));
}

export function saveInventoryItem(itemForm) {
  const item = normalizeInventoryItem(itemForm);
  const existingItems = readItems();
  const exists = existingItems.some((current) => current.id === item.id);
  const nextItems = exists
    ? existingItems.map((current) => (current.id === item.id ? item : current))
    : [...existingItems, item];

  writeItems(nextItems);
  return item;
}

function normalizedName(value = "") {
  return String(value || "").trim().toLowerCase();
}

function saleRowItemId(row = {}) {
  return row.sourceItemId || row.itemId || row.inventoryItemId || "";
}

function saleRowQuantity(row = {}) {
  return Math.max(toNumber(row.qty ?? row.quantity), 0);
}

export function applySaleInvoiceStockUpdate(invoice = {}) {
  if (String(invoice.transactionType || "sale").toLowerCase() !== "sale") return [];

  const saleRows = (invoice.rows || []).filter((row) => row.item && saleRowQuantity(row) > 0);
  if (!saleRows.length) return [];

  const timestamp = new Date().toISOString();
  const normalizedItems = readItems().map((item) => normalizeInventoryItem(item));
  const quantityByItemId = new Map();
  const quantityByItemName = new Map();

  saleRows.forEach((row) => {
    const quantity = saleRowQuantity(row);
    const itemId = saleRowItemId(row);
    if (itemId) {
      quantityByItemId.set(itemId, (quantityByItemId.get(itemId) || 0) + quantity);
      return;
    }

    const name = normalizedName(row.item);
    if (name) quantityByItemName.set(name, (quantityByItemName.get(name) || 0) + quantity);
  });

  let changed = false;
  const nextItems = normalizedItems.map((item) => {
    if (itemType(item) === "service") return item;

    const soldQuantity =
      (quantityByItemId.get(item.id) || 0) +
      (quantityByItemId.has(item.id) ? 0 : quantityByItemName.get(normalizedName(item.itemName)) || 0);

    if (!soldQuantity) return item;

    const currentQuantity = Math.max(toNumber(hasValue(item.openingQuantity) ? item.openingQuantity : item.stock), 0);
    const nextQuantity = String(Math.max(currentQuantity - soldQuantity, 0));
    changed = true;

    return {
      ...item,
      openingQuantity: nextQuantity,
      stock: nextQuantity,
      updatedAt: timestamp,
    };
  });

  if (changed) writeItems(nextItems);
  return nextItems;
}

export const inventoryItemsStorageKey = INVENTORY_ITEMS_KEY;
