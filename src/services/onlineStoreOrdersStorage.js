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
}// Makes the payment status value consistent.
function normalizePaymentStatus(status = "pending_verification") {
  const value = String(status || "pending_verification").toLowerCase();
  if (value === "paid") return "paid";
  if (value === "rejected" || value === "failed") return "rejected";
  return "pending_verification";
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
    paymentMethod: order.paymentMethod || "upi_manual", 
    paymentStatus: normalizePaymentStatus(order.paymentStatus), 
    transactionRef: String(order.transactionRef || order.utr || "").trim(),
    convertedToSale: Boolean(order.convertedToSale),
    saleId: order.saleId || order.invoiceId || "",
    invoiceId: order.invoiceId || order.saleId || "",
    invoiceNumber: order.invoiceNumber || "",
    convertedAt: order.convertedAt || "",
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || order.createdAt || new Date().toISOString(),
  };
}

import { getScopedStorageKey } from "../config/businessConfig.js";

const BASE_ONLINE_ORDERS_KEY = "ledgerly:onlineStoreOrders.v1";
const getOnlineOrdersKey = () => getScopedStorageKey(BASE_ONLINE_ORDERS_KEY);

function readLocalOrders() {
  try {
    const raw = localStorage.getItem(getOnlineOrdersKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalOrders(orders) {
  try {
    localStorage.setItem(getOnlineOrdersKey(), JSON.stringify(orders));
  } catch {}
}

// Gets online store orders with MySQL backend and local cache fallback.
export async function getOnlineStoreOrders() {
  try {
    const orders = await businessGrowthApi.list("orders");
    const normalized = (orders || []).map(normalizeOrder);
    writeLocalOrders(normalized);
    return normalized;
  } catch (err) {
    console.warn("[OnlineStoreOrders] Fetching from local fallback:", err?.message);
    return readLocalOrders().map(normalizeOrder);
  }
}

// Saves online store order to MySQL and updates local cache.
export async function saveOnlineStoreOrder(order) {
  const timestamp = new Date().toISOString();
  const nextOrder = normalizeOrder({
    ...order,
    id: order.id || `ORD-${Date.now().toString(36).toUpperCase()}`,
    status: order.status || "new",
    createdAt: order.createdAt || timestamp,
    updatedAt: timestamp,
  });

  const local = readLocalOrders();
  const existingIdx = local.findIndex((o) => o.id === nextOrder.id);
  const updatedLocal = existingIdx >= 0
    ? local.map((o, idx) => (idx === existingIdx ? nextOrder : o))
    : [nextOrder, ...local];
  writeLocalOrders(updatedLocal);

  try {
    const saved = await businessGrowthApi.save("orders", nextOrder);
    return saved || nextOrder;
  } catch (err) {
    console.warn("[OnlineStoreOrders] Saved to local cache, backend error:", err?.message);
    return nextOrder;
  }
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

// Updates online store order payment status.
export async function updateOnlineStoreOrderPaymentStatus(orderId, paymentStatus) {
  const timestamp = new Date().toISOString();
  const orders = await getOnlineStoreOrders();
  const order = orders.find((row) => row.id === orderId);
  return order
    ? businessGrowthApi.save(
      "orders",
      normalizeOrder({
        ...order,
        paymentStatus: normalizePaymentStatus(paymentStatus),
        updatedAt: timestamp,
      })
    )
    : null;
}