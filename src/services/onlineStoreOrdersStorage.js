import { businessGrowthApi } from "./apiClient.js";
// This helper handles number logic.
function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Makes the status value consistent.
function normalizeStatus(status = "new") {
  const value = String(status || "new").toLowerCase();
  if (value === "accepted") return "accepted";
  if (value === "rejected") return "rejected";
  return "new";
}

// Makes the order item value consistent.
function normalizeOrderItem(item = {}, index = 0) {
  const finalUnitPrice = toNumber(item.finalUnitPrice ?? item.itemPrice ?? item.unitPrice);
  const quantity = Math.max(toNumber(item.quantity), 0);

  return {
    id: item.id || `order-item-${index + 1}`,
    itemId: item.itemId || "",
    itemName: item.itemName || item.itemNameSnapshot || "Item",
    itemNameSnapshot: item.itemNameSnapshot || item.itemName || "Item",
    quantity,
    unitPrice: toNumber(item.unitPrice ?? item.itemPrice ?? finalUnitPrice),
    itemPrice: toNumber(item.itemPrice ?? item.unitPrice ?? finalUnitPrice),
    discountAmount: toNumber(item.discountAmount),
    finalUnitPrice,
    unit: item.unit || "",
    priceMode: item.priceMode || "Without Tax",
    taxRate: item.taxRate || item.taxRateSnapshot || "NONE",
    taxRateSnapshot: item.taxRateSnapshot || item.taxRate || "NONE",
    lineTotal: toNumber(item.lineTotal || finalUnitPrice * quantity),
  };
}

// Makes the order value consistent.
function normalizeOrder(order = {}) {
  const items = (order.items || []).map(normalizeOrderItem);
  const additionalCharge = toNumber(order.additionalCharge ?? order.additionalChargeAmount);
  const subtotal = order.subtotal !== undefined
    ? toNumber(order.subtotal)
    : items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = order.total !== undefined ? toNumber(order.total) : subtotal + additionalCharge;

  return {
    ...order,
    id: order.id || `ORD-${Date.now().toString(36).toUpperCase()}`,
    storeId: order.storeId || "",
    customerName: order.customerName || order.name || "",
    mobile: order.mobile || order.mobileNumber || "",
    mobileNumber: order.mobileNumber || order.mobile || "",
    address: order.address || "",
    items,
    subtotal,
    additionalChargeName: order.additionalChargeName || "",
    additionalCharge,
    additionalChargeAmount: toNumber(order.additionalChargeAmount ?? additionalCharge),
    total,
    status: normalizeStatus(order.status),
    convertedToSale: Boolean(order.convertedToSale),
    saleId: order.saleId || order.invoiceId || "",
    invoiceId: order.invoiceId || order.saleId || "",
    invoiceNumber: order.invoiceNumber || "",
    convertedAt: order.convertedAt || "",
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || order.createdAt || new Date().toISOString(),
  };
}

// Gets online store orders.
export function getOnlineStoreOrders() {
  return businessGrowthApi.list("orders").then((orders) => orders.map(normalizeOrder));
}

// Saves online store order.
export async function saveOnlineStoreOrder(order) {
  const timestamp = new Date().toISOString();
  const nextOrder = normalizeOrder({
    ...order,
    id: order.id || `ORD-${Date.now().toString(36).toUpperCase()}`,
    status: order.status || "new",
    createdAt: order.createdAt || timestamp,
    updatedAt: timestamp,
  });

  return businessGrowthApi.save("orders", nextOrder);
}

// Updates online store order status.
export async function updateOnlineStoreOrderStatus(orderId, status) {
  const timestamp = new Date().toISOString();
  const orders = await getOnlineStoreOrders();
  const order = orders.find((row) => row.id === orderId);
  return order ? businessGrowthApi.save("orders", normalizeOrder({ ...order, status, updatedAt: timestamp })) : null;
}

// This helper handles online store order converted logic.
export async function markOnlineStoreOrderConverted(orderId, saleReference) {
  const timestamp = new Date().toISOString();
  const orders = await getOnlineStoreOrders();
  const order = orders.find((row) => row.id === orderId);
  if (!order) return null;
  return businessGrowthApi.save("orders", normalizeOrder({
      ...order,
      convertedToSale: true,
      saleId: saleReference.saleId || saleReference.invoiceId || "",
      invoiceId: saleReference.invoiceId || saleReference.saleId || "",
      invoiceNumber: saleReference.invoiceNumber || "",
      convertedAt: timestamp,
      updatedAt: timestamp,
    }));
}
