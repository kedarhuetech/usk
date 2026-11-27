import { applySaleInvoiceStockUpdate, applyBatchRowsToInventory, inventoryItemsStorageKey, isItemBatchTracked } from "./itemsStorage.js";
import { batchMovementStorageKey, localDateOnly, moveBatchRows, reverseBatchMovement } from "./batchInventoryService.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { getAppSettings } from "./appSettingsStorage.js";
import { recordAuditTrail } from "./auditTrailStorage.js";
import { readTransactionCollection, writeTransactionCollection, transactionStorageKeys } from "./transactionRepository.js";
import { transactionsDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { getPurchaseBills } from "./purchaseBillsStorage.js";
import { getParties } from "./partiesStorage.js";

const SALE_INVOICES_KEY = transactionStorageKeys.sales;
export const saleInvoicesStorageKey = SALE_INVOICES_KEY;

// This helper handles parse logic.
// Checks whether use storage.
function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

// Reads invoices.
function readInvoices() {
  try { return readTransactionCollection(SALE_INVOICES_KEY); }
  catch (error) { throw new Error(`${error.message}; no invoice was changed.`, { cause: error }); }
}

// Writes invoices.
function writeInvoices(invoices) {
  if (!canUseStorage()) throw new Error("Browser storage is unavailable; the invoice was not saved.");
  writeTransactionCollection(SALE_INVOICES_KEY, invoices);
}

function normalizeDateStr(val, fallback) {
  if (!val) return fallback || "";
  if (typeof val === "string") {
    const s = val.trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      const [y, m, d] = s.split("-");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmySlash) return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
    if (s.includes("T") || s.includes("Z") || s.includes(" ")) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
    }
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    return s.slice(0, 10);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
  }
  return String(val);
}

// Makes the invoice value consistent.
export function normalizeInvoice(invoice = {}) {
  const timestamp = invoice.createdAt || new Date().toISOString();
  const invoiceNumber = String(
    invoice.form?.invoiceNumber ||
    invoice.invoiceNumber ||
    invoice.documentNumber ||
    invoice.number ||
    "1"
  );
  const id = invoice.id || invoice.invoiceId || `sale-${crypto.randomUUID()}`;

  const isGenuineCash =
    invoice.saleType === "cash" &&
    (!invoice.form?.customer && !invoice.customer && !invoice.partyName && !invoice.customerName);

  const partyName =
    invoice.form?.customer ||
    invoice.customer ||
    invoice.partyName ||
    invoice.party_name ||
    invoice.customerName ||
    invoice.customer_name ||
    invoice.party ||
    (isGenuineCash ? "Cash Sale" : (invoice.saleType === "cash" ? "Cash Sale" : ""));

  const partyId =
    invoice.partyId ||
    invoice.party_id ||
    invoice.form?.partyId ||
    invoice.customerId ||
    null;

  const phone =
    invoice.partyPhone ||
    invoice.party_phone ||
    invoice.phone ||
    invoice.customerPhone ||
    invoice.customer_phone ||
    invoice.form?.phone ||
    "";

  const rawInvoiceDate =
    invoice.form?.invoiceDate ||
    invoice.invoiceDate ||
    invoice.transactionDate ||
    invoice.date ||
    timestamp;

  const invoiceDate = normalizeDateStr(rawInvoiceDate, timestamp.slice(0, 10));

  const totalAmount = Number(
    invoice.totals?.finalTotal ??
    invoice.totalAmount ??
    invoice.total ??
    invoice.amount ??
    0
  );

  const paidAmount = Number(
    invoice.totals?.received ??
    invoice.paidAmount ??
    invoice.receivedAmount ??
    invoice.paid ??
    (invoice.saleType === "cash" ? totalAmount : 0)
  );

  const balanceAmount = Number(
    invoice.totals?.balance ??
    invoice.balanceAmount ??
    Math.max(0, totalAmount - paidAmount)
  );

  const paymentMode =
    invoice.form?.paymentType ||
    invoice.paymentMode ||
    invoice.paymentType ||
    (invoice.saleType === "cash" ? "Cash" : "Credit");

  // Reconcile rows & items
  const rawRows = Array.isArray(invoice.rows) && invoice.rows.length > 0
    ? invoice.rows
    : (Array.isArray(invoice.items) ? invoice.items : []);

  const rows = rawRows.map((r, idx) => {
    const itemName = r.item || r.itemName || r.name || `Item ${idx + 1}`;
    const itemId = r.sourceItemId || r.itemId || r.item_id || "";
    const qty = r.qty ?? r.quantity ?? 1;
    const price = r.price ?? r.unitPrice ?? 0;
    return {
      ...r,
      id: r.id || `row-${idx}`,
      item: itemName,
      name: itemName,
      itemName,
      itemId,
      sourceItemId: itemId,
      qty: String(qty),
      quantity: Number(qty),
      price: String(price),
      unitPrice: Number(price),
      unit: r.unit || "PCS",
    };
  });

  const cleanStr = (val) => {
    if (val == null) return "";
    const s = String(val).trim();
    return s === "null" || s === "undefined" ? "" : s;
  };

  const terms = cleanStr(invoice.terms || invoice.form?.terms || "");
  const termsTitle = cleanStr(invoice.termsTitle || invoice.terms_title || invoice.form?.termsTitle || "");
  const notes = cleanStr(invoice.notes || invoice.description || invoice.form?.description || "");
  const paymentTerms = cleanStr(invoice.paymentTerms || invoice.payment_terms || invoice.form?.paymentTerms || "Due on Receipt");
  const dueDate = invoice.dueDate || invoice.due_date || invoice.form?.dueDate || null;
  const vehicleNumber = cleanStr(invoice.vehicleNumber || invoice.vehicleNo || invoice.vehicle_no || invoice.form?.vehicleNumber || "");
  const driverName = cleanStr(invoice.driverName || invoice.driver_name || invoice.form?.driverName || "");
  const ewayBillNo = cleanStr(invoice.ewayBillNo || invoice.eWayBillNo || invoice.e_way_bill_no || invoice.form?.ewayBillNo || "");
  const poNumber = cleanStr(invoice.poNumber || invoice.po_number || invoice.form?.poNumber || "");
  const poDate = cleanStr(invoice.poDate || invoice.po_date || invoice.form?.poDate || "");
  const stateOfSupply = cleanStr(invoice.stateOfSupply || invoice.state_of_supply || invoice.form?.stateOfSupply || "None");
  const reverseCharge = Boolean(invoice.reverseCharge || invoice.reverse_charge || invoice.form?.reverseCharge);
  const additionalCharges = invoice.additionalCharges || {
    shipping: Number(invoice.shippingCharges ?? invoice.shipping_charges ?? 0),
    packaging: Number(invoice.packagingCharges ?? invoice.packaging_charges ?? 0),
    other: Number(invoice.otherCharges ?? invoice.other_charges ?? 0),
  };
  const files = invoice.files || {
    image: invoice.image || invoice.image_url || "",
    document: invoice.document || invoice.document_url || "",
    imageName: invoice.imageName || invoice.image_name || "",
    documentName: invoice.documentName || invoice.document_name || "",
  };

  const form = {
    customer: partyName,
    partyId,
    partyName,
    phone,
    invoiceNumber,
    invoiceDate,
    billingAddress: cleanStr(invoice.billingAddress || invoice.billing_address || invoice.form?.billingAddress || ""),
    shippingAddress: cleanStr(invoice.shippingAddress || invoice.shipping_address || invoice.form?.shippingAddress || invoice.billingAddress || invoice.billing_address || ""),
    paymentType: paymentMode,
    paymentTerms,
    dueDate,
    terms,
    termsTitle,
    showTerms: Boolean(terms),
    notes,
    description: notes,
    showDescription: Boolean(notes),
    vehicleNumber,
    driverName,
    ewayBillNo,
    poNumber,
    poDate,
    stateOfSupply,
    reverseCharge,
    ...(invoice.form || {}),
  };
  if (!form.customer && partyName) form.customer = partyName;
  if (!form.partyId && partyId) form.partyId = partyId;

  const totals = {
    subtotal: Number(invoice.totals?.subtotal ?? invoice.subtotal ?? totalAmount),
    discount: Number(invoice.totals?.discount ?? invoice.discountAmount ?? 0),
    tax: Number(invoice.totals?.tax ?? invoice.taxAmount ?? 0),
    roundOffAmount: Number(invoice.totals?.roundOffAmount ?? invoice.roundOff ?? 0),
    finalTotal: totalAmount,
    grandTotal: totalAmount,
    received: paidAmount,
    balance: balanceAmount,
    ...(invoice.totals || {}),
  };

  return {
    ...invoice,
    id,
    invoiceId: invoice.invoiceId || id,
    invoiceNumber,
    documentNumber: invoiceNumber,
    transactionType: invoice.transactionType || invoice.type || invoice.reportType || "sale",
    partyId,
    partyName,
    customer: partyName,
    customerName: partyName,
    phone,
    partyPhone: phone,
    invoiceDate,
    transactionDate: invoiceDate,
    date: invoiceDate,
    dueDate,
    paymentTerms,
    terms,
    termsTitle,
    notes,
    description: notes,
    vehicleNumber,
    vehicleNo: vehicleNumber,
    driverName,
    ewayBillNo,
    eWayBillNo: ewayBillNo,
    poNumber,
    poDate,
    stateOfSupply,
    reverseCharge,
    additionalCharges,
    shippingCharges: Number(additionalCharges.shipping || 0),
    packagingCharges: Number(additionalCharges.packaging || 0),
    otherCharges: Number(additionalCharges.other || 0),
    files,
    image: files.image,
    document: files.document,
    imageName: files.imageName,
    documentName: files.documentName,
    totalAmount,
    total: totalAmount,
    paidAmount,
    balanceAmount,
    paymentMode,
    paymentType: paymentMode,
    form,
    rows,
    items: rows,
    totals,
    stockAdjustedAt: invoice.stockAdjustedAt || (invoice.createdAt ? invoice.createdAt : undefined),
    createdAt: timestamp,
    updatedAt: invoice.updatedAt || timestamp,
  };
}

// Gets sale invoices.
export function getSaleInvoices() {
  return readInvoices().map(normalizeInvoice).filter((invoice) => invoice.transactionType === "sale");
}

// Gets next sale invoice number.
export function getNextSaleInvoiceNumber() {
  const nextNumber = getSaleInvoices().length + 1;
  return String(nextNumber);
}

// Saves sale invoice.
export function saveSaleInvoice(invoice, options = {}) {
  if (!canUseStorage()) throw new Error("Browser storage is unavailable; the invoice was not saved.");
  const previousInvoices = window.localStorage.getItem(SALE_INVOICES_KEY);
  const previousItems = window.localStorage.getItem(inventoryItemsStorageKey);
  const previousMovements = window.localStorage.getItem(batchMovementStorageKey);
  try {
  let normalized = normalizeInvoice({ ...invoice, updatedAt: new Date().toISOString() });
  const appSettings = getAppSettings();
  if (normalized.transactionType === "sale" && appSettings.enableBatchTracking) {
    const inventory = JSON.parse(window.localStorage.getItem(inventoryItemsStorageKey) || "[]");
    normalized = { ...normalized, rows: (normalized.rows || []).map((row) => {
      const item = inventory.find((entry) => entry.id === (row.sourceItemId || row.itemId) || String(entry.itemName || "").trim().toLowerCase() === String(row.item || "").trim().toLowerCase());
      if (!item || item.type === "service" || !Number(row.qty ?? row.quantity)) return row;
      const batchTracked = isItemBatchTracked(item);
      if (!batchTracked) {
        return row;
      }
      if (!(item.batches || []).length) throw new Error(`Batch tracking is enabled, but ${item.itemName} has no batch stock. Add stock with a batch before selling.`);
      const rawBatchNo = String(row.batchNo || "").trim();
      if (!rawBatchNo) throw new Error(`Select a valid batch for ${item.itemName}.`);
      const batch = (item.batches || []).find((entry) => String(entry.batchNo || "").trim().toLowerCase() === rawBatchNo.toLowerCase());
      if (!batch) throw new Error(`Select a valid batch for ${item.itemName}.`);
      const today = localDateOnly();
      if (batch.expDate && batch.expDate < today) throw new Error(`Batch ${batch.batchNo} for ${item.itemName} has expired.`);
      const available = Number(batch.openingQty ?? batch.quantity ?? 0);
      const reqQty = Number(row.qty ?? row.quantity ?? 0);
      if (reqQty > available) throw new Error(`Batch ${batch.batchNo} for ${item.itemName} has only ${available} in stock (requested: ${reqQty}).`);
      return { ...row, batchNo: batch.batchNo, expDate: batch.expDate || "", batchId: batch.id || "" };
    }) };
  }
  const existing = readInvoices();
  const existingInvoice = existing.find((current) => current.id === normalized.id || current.invoiceId === normalized.invoiceId);

  // Enforce Settings: Stop Sale on Negative Stock
  if (normalized.transactionType === "sale" && appSettings.stopSaleOnNegativeStock) {
    const rawItems = window.localStorage.getItem(inventoryItemsStorageKey);
    let inventory = [];
    try { inventory = rawItems ? JSON.parse(rawItems) : []; } catch {}
    for (const row of normalized.rows || []) {
      const match = inventory.find((i) => i.id === row.sourceItemId || i.id === row.itemId || (i.itemName && i.itemName.toLowerCase() === (row.item || "").toLowerCase()));
      if (match) {
        let available = Number(match.openingQuantity ?? match.stock ?? 0);
        if (existingInvoice) {
          const origRow = (existingInvoice.rows || []).find(
            (r) => r.sourceItemId === match.id || r.itemId === match.id || (r.item && r.item.toLowerCase() === (match.itemName || "").toLowerCase())
          );
          if (origRow) {
            available += Number(origRow.qty ?? origRow.quantity ?? 0);
          }
        }
        const reqQty = Number(row.qty ?? row.quantity ?? 0);
        if (reqQty > available) {
          throw new Error(`Stop Sale on Negative Stock is enabled: "${match.itemName || row.item}" has only ${available} in stock (requested: ${reqQty}).`);
        }
      }
    }
  }

  // Enforce Settings: Block New Items From Transaction
  if (normalized.transactionType === "sale" && appSettings.blockNewItemsFromTxn) {
    const rawItems = window.localStorage.getItem(inventoryItemsStorageKey);
    let inventory = [];
    try { inventory = rawItems ? JSON.parse(rawItems) : []; } catch {}
    for (const row of normalized.rows || []) {
      const name = (row.item || "").trim().toLowerCase();
      if (!name) continue;
      const match = inventory.find(
        (i) => i.id === row.sourceItemId || i.id === row.itemId || (i.itemName && i.itemName.toLowerCase() === name)
      );
      if (!match) {
        throw new Error(`Creating new items from transactions is blocked in Settings: "${row.item}" is not registered in Item master.`);
      }
    }
  }

  // Enforce Settings: Block New Parties From Transaction
  if (normalized.transactionType === "sale" && appSettings.blockNewPartiesFromTxn) {
    const customer = (normalized.form?.customer || normalized.customer || "").trim();
    if (customer && customer.toLowerCase() !== "cash sale") {
      const parties = getParties();
      const match = parties.find(
        (p) => (p.partyName || p.name || "").trim().toLowerCase() === customer.toLowerCase()
      );
      if (!match) {
        throw new Error(`Creating new parties from transactions is blocked in Settings: "${customer}" is not registered in Party master.`);
      }
    }
  }

  const shouldAdjustStock =
    normalized.transactionType === "sale" &&
    !normalized.stockAdjustedAt &&
    !existingInvoice?.stockAdjustedAt;

  const wasCancelled = Boolean(existingInvoice?.cancelled || existingInvoice?.invoiceStatus === "Cancelled" || existingInvoice?.status === "Cancelled");
  const isCancelled = Boolean(normalized.cancelled || normalized.invoiceStatus === "Cancelled" || normalized.status === "Cancelled");
  const hasBatchRows = (normalized.rows || []).some((r) => r.batchNo && String(r.batchNo).trim() && Number(r.qty ?? r.quantity) > 0);
  const hadBatchRows = (existingInvoice?.batchAllocationRows || existingInvoice?.rows || []).some((r) => r.batchNo && String(r.batchNo).trim() && Number(r.qty ?? r.quantity) > 0);
  const batchMode = normalized.transactionType === "sale" && Boolean(existingInvoice?.batchStockAdjustedAt || (appSettings.enableBatchTracking && (hasBatchRows || hadBatchRows)));

  if (existingInvoice && !wasCancelled) {
    if (existingInvoice.batchStockAdjustedAt) {
      const reversalRows = existingInvoice.batchAllocationRows || existingInvoice.rows || [];
      if (existingInvoice.batchMovementId) reverseBatchMovement(existingInvoice.batchMovementId, "sale");
      else applyBatchRowsToInventory(reversalRows, "add", { allowCreate: false });
    } else if (existingInvoice.stockAdjustedAt) {
      let invItems = [];
      try {
        invItems = JSON.parse(window.localStorage.getItem(inventoryItemsStorageKey) || "[]");
        if (!Array.isArray(invItems)) invItems = [];
      } catch {
        invItems = [];
      }
      const restored = invItems.map((item) => {
        const matching = (existingInvoice.rows || []).filter((r) => r.sourceItemId === item.id || (!r.sourceItemId && (r.item || "").trim().toLowerCase() === (item.itemName || "").trim().toLowerCase()));
        if (!matching.length) return item;
        const addQty = matching.reduce((s, r) => s + Math.max(0, Number(r.qty ?? r.quantity ?? 0)), 0);
        const cur = Number(item.openingQuantity ?? item.stock ?? 0);
        return { ...item, openingQuantity: String(cur + addQty), stock: String(cur + addQty) };
      });
      window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(restored));
    }
  }

  if (batchMode && !isCancelled && (!existingInvoice || wasCancelled || existingInvoice.batchStockAdjustedAt || existingInvoice.stockAdjustedAt)) {
    const batchMovementId = `${normalized.id}:${Date.now()}:${crypto.randomUUID()}`;
    const batchRows = (normalized.rows || []).filter((r) => r.batchNo && String(r.batchNo).trim() && Number(r.qty ?? r.quantity) > 0);
    if (batchRows.length > 0) {
      moveBatchRows(batchRows, "reduce", { referenceId: batchMovementId, sourceType: "sale" });
      normalized = { ...normalized, batchMovementId, batchStockAdjustedAt: new Date().toISOString(), batchStockRestoredAt: "", batchAllocationRows: batchRows.map((row) => ({ ...row })) };
    }
    const nonBatchRows = (normalized.rows || []).filter((r) => (!r.batchNo || !String(r.batchNo).trim()) && Number(r.qty ?? r.quantity) > 0);
    if (nonBatchRows.length > 0) {
      applySaleInvoiceStockUpdate({ ...normalized, rows: nonBatchRows });
      normalized = { ...normalized, stockAdjustedAt: new Date().toISOString() };
    }
  } else if (batchMode && isCancelled && existingInvoice && !wasCancelled && existingInvoice.batchStockAdjustedAt) {
    normalized = { ...normalized, batchStockRestoredAt: new Date().toISOString() };
  } else if (!batchMode && (shouldAdjustStock || (existingInvoice?.stockAdjustedAt && !isCancelled))) {
    applySaleInvoiceStockUpdate(normalized);
    normalized = {
      ...normalized,
      stockAdjustedAt: new Date().toISOString(),
    };
  }

  const nextInvoices = [normalized, ...existing.filter((current) => current.id !== normalized.id)];
  writeInvoices(nextInvoices);
  if (!readInvoices().some((current) => current.id === normalized.id)) {
    throw new Error("The invoice could not be verified after saving.");
  }
  notifyBusinessDataChanged();
  if (isDatabaseMode() && !options?.skipRemoteSync) {
    transactionsDb.save(normalized).catch((err) => console.warn("[MySQL] Background sale sync notice:", err.message));
  }
  recordAuditTrail({
    action: existingInvoice ? "Sale Invoice Updated" : "Sale Invoice Created",
    entity: "Sales",
    details: `Invoice #${normalized.invoiceNumber} for ${normalized.form?.customer || 'Cash'} · Amount ${normalized.totals?.finalTotal || normalized.totalAmount || 0}`,
    user: "User",
  });
  return normalized;
  } catch (error) {
    try {
      if (previousInvoices === null) window.localStorage.removeItem(SALE_INVOICES_KEY);
      else window.localStorage.setItem(SALE_INVOICES_KEY, previousInvoices);
      if (previousItems === null) window.localStorage.removeItem(inventoryItemsStorageKey);
      else window.localStorage.setItem(inventoryItemsStorageKey, previousItems);
      if (previousMovements === null) window.localStorage.removeItem(batchMovementStorageKey);
      else window.localStorage.setItem(batchMovementStorageKey, previousMovements);
    } catch (rollbackError) {
      throw new Error(`${error.message} Rollback could not fully restore local data: ${rollbackError.message}`, { cause: rollbackError });
    }
    throw error;
  }
}

// Deletes sale invoice.
export function deleteSaleInvoice(invoiceId, options = {}) {
  if (!canUseStorage()) return;
  const beforeItems = window.localStorage.getItem(inventoryItemsStorageKey);
  const beforeMovements = window.localStorage.getItem(batchMovementStorageKey);
  const invoices = readInvoices();
  const target = invoices.find((invoice) => invoice.id === invoiceId || invoice.invoiceId === invoiceId);
  try {
    if (target?.stockAdjustedAt && !target.batchStockAdjustedAt) {
      const inventory = JSON.parse(window.localStorage.getItem(inventoryItemsStorageKey) || "[]");
      const updated = inventory.map((item) => {
        const rows = (target.rows || []).filter((r) => r.sourceItemId === item.id || (!r.sourceItemId && (r.item || "").trim().toLowerCase() === (item.itemName || "").trim().toLowerCase()));
        if (!rows.length) return item;
        const addQty = rows.reduce((s, r) => s + Math.max(0, Number(r.qty ?? r.quantity ?? 0)), 0);
        const cur = Number(item.openingQuantity ?? item.stock ?? 0);
        return { ...item, openingQuantity: String(cur + addQty), stock: String(cur + addQty) };
      });
      window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(updated));
    }
    if (target?.batchStockAdjustedAt && !target.batchStockRestoredAt) {
      if (target.batchMovementId) reverseBatchMovement(target.batchMovementId, "sale");
      else applyBatchRowsToInventory(target.batchAllocationRows || target.rows || [], "add");
    }
    writeInvoices(invoices.filter((invoice) => invoice.id !== invoiceId && invoice.invoiceId !== invoiceId));
  } catch (error) {
    if (beforeItems === null) window.localStorage.removeItem(inventoryItemsStorageKey); else window.localStorage.setItem(inventoryItemsStorageKey, beforeItems);
    if (beforeMovements === null) window.localStorage.removeItem(batchMovementStorageKey); else window.localStorage.setItem(batchMovementStorageKey, beforeMovements);
    throw error;
  }
  notifyBusinessDataChanged();
  if (isDatabaseMode() && !options?.skipRemoteSync && invoiceId) {
    transactionsDb.remove(invoiceId).catch((err) => console.warn("[MySQL] Background sale delete notice:", err.message));
  }
  recordAuditTrail({
    action: "Sale Invoice Deleted",
    entity: "Sales",
    details: `Invoice ID ${invoiceId}`,
    user: "User",
  });
}

export function setSaleInvoiceLifecycle(invoiceId, invoiceStatus) {
  if (!["Draft", "Active", "Cancelled"].includes(invoiceStatus)) throw new Error("Invalid invoice status.");
  const invoice = readInvoices().find((entry) => String(entry.id || entry.invoiceId) === String(invoiceId));
  if (!invoice) throw new Error("Sale invoice not found.");
  return saveSaleInvoice({ ...invoice, invoiceStatus, cancelled: invoiceStatus === "Cancelled", status: invoiceStatus, updatedAt: new Date().toISOString() });
}

export function applyPaymentToSaleInvoice(invoiceId, paymentAmount = 0) {
  if (!invoiceId) return null;
  const currentInvoices = getSaleInvoices();
  const index = currentInvoices.findIndex((inv) =>
    String(inv.id || "").toLowerCase() === String(invoiceId).toLowerCase() ||
    String(inv.invoiceNumber || inv.form?.invoiceNumber || "").toLowerCase() === String(invoiceId).toLowerCase()
  );
  if (index < 0) return null;

  const inv = currentInvoices[index];
  const total = Number(inv.totals?.finalTotal ?? inv.totalAmount ?? inv.total ?? 0);
  const currentPaid = Number(inv.totals?.received ?? inv.receivedAmount ?? inv.paidAmount ?? 0);
  const newPaid = currentPaid + Number(paymentAmount || 0);
  const newBalance = Math.max(0, total - newPaid);

  const updatedInvoice = {
    ...inv,
    receivedAmount: newPaid,
    balanceAmount: newBalance,
    totals: {
      ...(inv.totals || {}),
      received: newPaid,
      paid: newPaid,
      balance: newBalance,
    },
    status: newBalance <= 0.01 ? "Paid" : "Partially Paid",
    updatedAt: new Date().toISOString(),
  };

  currentInvoices[index] = updatedInvoice;
  writeTransactionCollection(SALE_INVOICES_KEY, currentInvoices);
  notifyBusinessDataChanged();

  // Sync to MySQL
  try {
    transactionsDb.save({
      ...updatedInvoice,
      transactionType: "sale",
      type: "sale",
      receivedAmount: newPaid,
      balanceAmount: newBalance,
      status: updatedInvoice.status,
    }).catch(() => {});
  } catch {}

  return updatedInvoice;
}


// Gets last 5 distinct prices for an item from sales or purchases
export function getLast5PricesForItem(itemName, isPurchase = false) {
  if (!itemName || !String(itemName).trim()) return [];
  const normalizedTarget = String(itemName).trim().toLowerCase();
  try {
    const txns = isPurchase ? getPurchaseBills() : getSaleInvoices();
    const prices = [];
    const seen = new Set();
    const sorted = [...(txns || [])].sort((a, b) => new Date(b.date || b.invoiceDate || b.createdAt || 0) - new Date(a.date || a.invoiceDate || a.createdAt || 0));
    for (const txn of sorted) {
      const rows = txn.rows || txn.items || [];
      for (const r of rows) {
        const rName = String(r.item || r.name || r.itemName || "").trim().toLowerCase();
        const p = Number(r.price ?? r.unitPrice ?? r.rate ?? 0);
        if (rName === normalizedTarget && p > 0 && !seen.has(p)) {
          seen.add(p);
          prices.push(p);
          if (prices.length >= 5) return prices;
        }
      }
    }
    return prices;
  } catch {
    return [];
  }
}

