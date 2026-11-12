const INVENTORY_ITEMS_KEY = "ledgerly:inventoryItems.v1";
export const csvImportedItemsStorageKey = "ledgerly:itemsCsvImports.v1";
export const itemUiOverridesStorageKey = "ledgerly:itemsUiOverrides.v1";
export const itemTransactionActionsStorageKey = "ledgerly:itemsTransactionActions.v1";

// This helper handles parse logic.
function safeParse(value, fallback) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

// Checks whether use storage.
function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

// Reads items.
function readItems() {
  if (!canUseStorage()) return [];
  return safeParse(window.localStorage.getItem(INVENTORY_ITEMS_KEY), []);
}

// Writes items.
function writeItems(items) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(INVENTORY_ITEMS_KEY, JSON.stringify(items));
  try {
    window.dispatchEvent(new CustomEvent("inventory-items-changed", { detail: items }));
  } catch {}
}

// This helper handles number logic.
function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Checks whether value.
function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

// This helper handles type logic.
function itemType(item = {}) {
  return String(item.type || "product").toLowerCase();
}

// Makes the discount type value consistent.
function normalizeDiscountType(value = "") {
  const type = String(value || "").toLowerCase();
  if (type.includes("%") || type.includes("percent")) return "Percentage";
  if (type.includes("₹") || type.includes("rs") || type.includes("rupee")) return "Flat Amount";
  if (type.includes("flat") || type.includes("amount") || type.includes("fixed")) return "Flat Amount";
  return "Percentage";
}

// Makes the batch value consistent.
function normalizeBatch(row = {}) {
  return {
    id: row.id || crypto.randomUUID(),
    batchNo: row.batchNo || "",
    manufacturer: row.manufacturer || "",
    mfgDate: row.mfgDate || "",
    expDate: row.expDate || "",
    remarks: row.remarks || row.dosage || "",
    openingQty: row.openingQty || row.quantity || row.qty || "",
  };
}

// This helper handles quantity logic.
function batchQuantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

// This helper handles batches logic.
function filledBatches(batches = []) {
  return batches
    .map(normalizeBatch)
    .filter((row) => Object.entries(row).some(([key, value]) => key !== "id" && String(value || "").trim()));
}

// This helper handles opening total logic.
function batchOpeningTotal(batches = []) {
  return batches.reduce((total, row) => total + batchQuantity(row.openingQty), 0);
}

// Normalizes serial numbers array / string input into unique trimmed values
function normalizeSerialNumbers(serials) {
  if (!serials) return [];
  const rawList = Array.isArray(serials)
    ? serials
    : String(serials).split(/[\n,]/);
  const seen = new Set();
  const cleaned = [];
  for (const s of rawList) {
    const trimmed = String(s || "").trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}

// Makes the inventory item value consistent.
export function normalizeInventoryItem(itemForm = {}) {
  const type = itemType(itemForm);
  const itemName = itemForm.itemName?.trim() || itemForm.serviceName?.trim() || itemForm.name?.trim() || "New Item";
  const id = itemForm.id || `item-${crypto.randomUUID()}`;
  const unit = itemForm.unit || itemForm.baseUnit || "";
  const imageUrl = itemForm.imageUrl || itemForm.image || "";
  const itemCode = itemForm.itemCode || itemForm.serviceCode || itemForm.code || "";
  const barcode = itemForm.barcode || itemForm.barCode || itemForm.itemBarcode || itemCode || "";
  const subCategory = itemForm.subCategory || itemForm.sub_category || "";
  const serialNumbers = normalizeSerialNumbers(itemForm.serialNumbers);
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
      : serialNumbers.length
        ? String(serialNumbers.length)
        : manualOpeningQuantity;
  const initialOpeningQuantity = hasValue(itemForm.initialOpeningQuantity)
    ? String(itemForm.initialOpeningQuantity)
    : manualOpeningQuantity;
  const discount = hasValue(itemForm.discount) ? itemForm.discount : itemForm.discountValue || "";

  return {
    id,
    isActive: itemForm.isActive !== false,
    type,
    itemName,
    serviceName: type === "service" ? itemName : "",
    name: itemName,
    hsn,
    sac: type === "service" ? hsn : "",
    category: itemForm.category || "",
    subCategory,
    itemCode,
    serviceCode: type === "service" ? itemCode : "",
    code: itemCode,
    barcode,
    serialNumbers,
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
    initialOpeningQuantity,
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

// Calculates inventory item pricing.
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

// Gets inventory item availability.
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

// Batch quantities are stored on the existing item record. `openingQty` is retained
// as the persisted quantity field for compatibility with existing item forms.
export function applyBatchStockMovement(item, row, direction, { allowCreate = false } = {}) {
  const quantity = Math.max(toNumber(row.qty ?? row.quantity), 0);
  if (!quantity) return item;
  const batchNo = String(row.batchNo || "").trim();
  if (!batchNo) throw new Error(`Enter a batch number for ${row.item || item.itemName}.`);
  const batches = (item.batches || []).map((batch) => ({ ...batch, openingQty: String(batch.openingQty ?? batch.quantity ?? 0) }));
  const index = batches.findIndex((batch) => String(batch.batchNo || "").trim().toLowerCase() === batchNo.toLowerCase());
  if (direction === "add" && index < 0 && allowCreate) {
    batches.push({ id: crypto.randomUUID(), batchNo, manufacturer: row.manufacturer || "", mfgDate: row.mfgDate || "", expDate: row.expDate || "", remarks: "", openingQty: String(quantity) });
  } else {
    if (index < 0) throw new Error(`Batch ${batchNo} is not available for ${row.item || item.itemName}.`);
    const batch = batches[index];
    if (direction === "reduce" && row.expDate && batch.expDate && row.expDate !== batch.expDate) throw new Error(`Expiry date does not match batch ${batchNo}.`);
    const current = Math.max(toNumber(batch.openingQty), 0);
    if (direction === "reduce" && current < quantity) throw new Error(`Batch ${batchNo} has only ${current} in stock.`);
    batches[index] = { ...batch, openingQty: String(direction === "add" ? current + quantity : current - quantity) };
  }
  const currentAggregate = Math.max(toNumber(hasValue(item.openingQuantity) ? item.openingQuantity : item.stock), 0);
  const nextAggregate = String(direction === "add" ? currentAggregate + quantity : Math.max(currentAggregate - quantity, 0));
  return { ...item, batches, openingQuantity: nextAggregate, stock: nextAggregate, updatedAt: new Date().toISOString() };
}

export function applyBatchRowsToInventory(rows = [], direction, { allowCreate = false } = {}) {
  const items = readItems().map((item) => normalizeInventoryItem(item));
  const nextItems = items.map((item) => {
    const matchedRows = rows.filter((row) => saleRowItemId(row) === item.id || (!saleRowItemId(row) && normalizedName(row.item) === normalizedName(item.itemName)));
    if (!matchedRows.length || itemType(item) === "service") return item;
    const batchTotal = (item.batches || []).reduce((sum, batch) => sum + Math.max(toNumber(batch.openingQty ?? batch.quantity), 0), 0);
    const aggregate = Math.max(toNumber(hasValue(item.openingQuantity) ? item.openingQuantity : item.stock), 0);
    if (direction === "reduce" && Math.abs(batchTotal - aggregate) > 1e-9) throw new Error(`Batch stock for ${item.itemName} does not reconcile with aggregate stock (${batchTotal} batch / ${aggregate} total). Review historical stock before moving this item.`);
    return matchedRows.reduce((updated, row) => applyBatchStockMovement(updated, row, direction, { allowCreate }), item);
  });
  writeItems(nextItems);
  return nextItems;
}

// Gets inventory items.
export function getInventoryItems() {
  return readItems().map((item) => normalizeInventoryItem(item));
}

// Saves inventory item.
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

// Deletes an inventory item from the active storage adapter.
export function sameInventoryItemIdentity(left = {}, right = {}) {
  const leftBarcode = String(left.barcode || "").trim().toLowerCase();
  const rightBarcode = String(right.barcode || "").trim().toLowerCase();
  if (leftBarcode && rightBarcode && leftBarcode === rightBarcode) return true;
  const leftCode = String(left.itemCode || left.code || left.serviceCode || "").trim().toLowerCase();
  const rightCode = String(right.itemCode || right.code || right.serviceCode || "").trim().toLowerCase();
  if (leftCode || rightCode) return Boolean(leftCode && rightCode && leftCode === rightCode);
  const leftName = normalizedName(left.itemName || left.name || left.serviceName);
  const rightName = normalizedName(right.itemName || right.name || right.serviceName);
  return Boolean(leftName && leftName === rightName
    && normalizedName(left.unit || left.baseUnit) === normalizedName(right.unit || right.baseUnit)
    && normalizedName(left.category) === normalizedName(right.category));
}

export function deleteInventoryItem(itemOrId) {
  const target = typeof itemOrId === "object" ? itemOrId : null;
  const itemId = target?.id || itemOrId;
  const nextItems = readItems().filter((item) => item.id !== itemId && !(target && sameInventoryItemIdentity(item, target)));
  writeItems(nextItems);
  return nextItems;
}

// This helper handles name logic.
function normalizedName(value = "") {
  return String(value || "").trim().toLowerCase();
}

// This helper handles row item id logic.
function saleRowItemId(row = {}) {
  return row.sourceItemId || row.itemId || row.inventoryItemId || "";
}

// This helper handles row quantity logic.
function saleRowQuantity(row = {}) {
  const qty = Math.max(toNumber(row.qty ?? row.quantity), 0);
  const freeQty = Math.max(toNumber(row.freeQty), 0);
  return qty + freeQty;
}

// Applies sale invoice stock update.
export function applySaleInvoiceStockUpdate(invoice = {}) {
  if (String(invoice.transactionType || "sale").toLowerCase() !== "sale") return [];

  // Handles rows.
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

    const matchingRows = saleRows.filter((row) => saleRowItemId(row) === item.id || (!saleRowItemId(row) && normalizedName(row.item) === normalizedName(item.itemName)));
    const usesBatches = matchingRows.some((row) => String(row.batchNo || "").trim());
    if (usesBatches) {
      let updated = item;
      matchingRows.forEach((row) => { updated = applyBatchStockMovement(updated, row, "reduce"); });
      changed = true;
      return updated;
    }
    const soldQuantity = (quantityByItemId.get(item.id) || 0) + (quantityByItemId.has(item.id) ? 0 : quantityByItemName.get(normalizedName(item.itemName)) || 0);

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

// Applies purchase bill stock update for non-batch rows.
export function applyPurchaseBillStockUpdate(bill = {}, direction = "add") {
  const purchaseRows = (bill.rows || []).filter((row) => row.item && saleRowQuantity(row) > 0);
  if (!purchaseRows.length) return [];

  const timestamp = new Date().toISOString();
  const normalizedItems = readItems().map((item) => normalizeInventoryItem(item));
  const quantityByItemId = new Map();
  const quantityByItemName = new Map();

  purchaseRows.forEach((row) => {
    if (String(row.batchNo || "").trim()) return;
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

    const qty = (quantityByItemId.get(item.id) || 0) + (quantityByItemId.has(item.id) ? 0 : quantityByItemName.get(normalizedName(item.itemName)) || 0);
    if (!qty) return item;

    const currentQuantity = Math.max(toNumber(hasValue(item.openingQuantity) ? item.openingQuantity : item.stock), 0);
    const nextQuantity = String(direction === "add" ? currentQuantity + qty : Math.max(currentQuantity - qty, 0));
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

export function applyPurchaseBatchStockUpdate(invoice = {}) {
  const normalizedItems = readItems().map((item) => normalizeInventoryItem(item));
  let changed = false;
  const rows = (invoice.rows || []).filter((row) => row.item && saleRowQuantity(row) > 0 && String(row.batchNo || "").trim());
  const nextItems = normalizedItems.map((item) => {
    const matching = rows.filter((row) => saleRowItemId(row) === item.id || (!saleRowItemId(row) && normalizedName(row.item) === normalizedName(item.itemName)));
    if (!matching.length) return item;
    let updated = item;
    matching.forEach((row) => { updated = applyBatchStockMovement(updated, row, "add", { allowCreate: true }); });
    changed = true;
    return updated;
  });
  if (changed) writeItems(nextItems);
  return nextItems;
}

export const inventoryItemsStorageKey = INVENTORY_ITEMS_KEY;
