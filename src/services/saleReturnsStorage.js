import { calculateRow, toNumber } from "../utils/saleInvoice.js";
import { inventoryItemsStorageKey } from "./itemsStorage.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";

export const saleReturnsStorageKey = "ledgerly:saleReturns.v1";
const inventoryHistoryKey = "ledgerly:inventoryAdjustments.v1";
const invoicesKey = "ledgerly:saleInvoices.v1";
const paymentsOutKey = "ledgerly:paymentOuts.v1";

function returnSummaryForInvoice(invoiceId, records) {
  const active = records.filter((record) => String(record.invoiceId) === String(invoiceId) && !record.cancelled);
  const returnedQuantities = {};
  active.forEach((record) => (record.rows || []).forEach((row) => {
    const key = String(row.sourceRowId || row.sourceItemId || row.item || "");
    returnedQuantities[key] = (returnedQuantities[key] || 0) + toNumber(row.qty);
  }));
  return {
    creditNoteAppliedAmount: active.reduce((sum, record) => sum + toNumber(record.adjustedAmount), 0),
    creditNoteReturnedQuantities: returnedQuantities,
    creditNoteIds: active.map((record) => record.id),
  };
}

function inventoryKey(row) {
  const id = row.sourceItemId || row.itemId || row.inventoryItemId;
  if (id) return `id:${id}`;
  const name = String(row.item || row.itemName || "").trim().toLowerCase();
  return name ? `name:${name}|unit:${String(row.unit || "").trim().toLowerCase()}` : "";
}

function itemInventoryKey(item) {
  const id = item.id;
  if (id) return `id:${id}`;
  const name = String(item.itemName || item.name || "").trim().toLowerCase();
  return name ? `name:${name}|unit:${String(item.unit || item.baseUnit || "").trim().toLowerCase()}` : "";
}

function readList(key) {
  const raw = window.localStorage.getItem(key);
  if (raw == null) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error(`Saved ${key} data is invalid.`);
  return value;
}

export function getSaleReturns() {
  try { return readList(saleReturnsStorageKey); }
  catch (error) { throw new Error(`Unable to read saved sales returns: ${error.message}`, { cause: error }); }
}

export function calculateSaleReturnRow(row) {
  return calculateRow({
    ...row,
    qty: row.qty ?? row.quantity,
    discountMode: row.discountMode || (row.discountAmount != null && row.discountAmount !== "" ? "amount" : "percent"),
    discountPercent: row.discount ?? row.discountPercent ?? "",
    discountAmount: row.discountMode === "amount" && row.sourceDiscountAmount != null && Number(row.soldQty) > 0
      ? toNumber(row.sourceDiscountAmount) * toNumber(row.qty ?? row.quantity) / Number(row.soldQty)
      : row.discountAmount ?? "",
    taxRate: row.tax ?? row.taxRate ?? "NONE",
    priceMode: row.priceMode || "Without Tax",
  });
}

export function saveSaleReturn(input) {
  if (!window.localStorage) throw new Error("Browser storage is unavailable.");
  const keys = [saleReturnsStorageKey, invoicesKey, inventoryItemsStorageKey, inventoryHistoryKey, paymentsOutKey];
  const before = Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)]));
  try {
    const records = readList(saleReturnsStorageKey);
    const invoices = readList(invoicesKey);
    const inventory = readList(inventoryItemsStorageKey);
    const existingRecord = input.id ? records.find((record) => record.id === input.id) : null;
    if (input.id && !existingRecord) throw new Error("This Credit Note no longer exists. Refresh the list and try again.");
    if (existingRecord?.cancelled) throw new Error("A cancelled Credit Note cannot be edited.");
    if (existingRecord?.type === "Credit Note" && input.type !== "Credit Note") throw new Error("The type of a saved Credit Note cannot be changed.");
    if (!String(input.number || "").trim()) throw new Error("Enter a Credit Note number.");
    if (input.type === "Credit Note" && !(input.rows || []).length) throw new Error("A Credit Note must contain at least one returned item.");
    if (records.some((record) => record.type === input.type && String(record.number) === String(input.number) && record.id !== input.id)) {
      throw new Error(`A ${input.type} with number ${input.number} already exists.`);
    }
    const original = input.invoiceId ? invoices.find((invoice) => String(invoice.id || invoice.invoiceId) === String(input.invoiceId)) : null;
    if (input.type === "Credit Note" && !original) throw new Error("A Credit Note must be linked to a saved sales invoice.");
    if (original) {
      if (original.cancelled || original.deleted || original.isDeleted || String(original.status || "").toLowerCase() === "cancelled") throw new Error("A cancelled or deleted invoice cannot receive a Credit Note.");
      const invoiceCustomer = String(original.form?.customer || original.customer || "").trim().toLowerCase();
      if (invoiceCustomer && invoiceCustomer !== String(input.party || "").trim().toLowerCase()) throw new Error("The selected customer does not match the original invoice.");
      const invoicePartyId = original.partyId || original.form?.partyId || "";
      if (invoicePartyId && input.partyId && String(invoicePartyId) !== String(input.partyId)) throw new Error("The selected customer ID does not match the original invoice.");
      const priorByRow = new Map();
      records.filter((record) => record.id !== input.id && record.invoiceId === original.id && !record.cancelled)
        .forEach((record) => (record.rows || []).forEach((row) => {
          const key = String(row.sourceRowId || row.sourceItemId || row.item || "");
          priorByRow.set(key, (priorByRow.get(key) || 0) + toNumber(row.qty));
        }));
      for (const row of input.rows || []) {
        const source = (original.rows || []).find((saleRow) => String(saleRow.id || saleRow.sourceItemId || saleRow.item || "") === String(row.sourceRowId || row.sourceItemId || row.item || ""));
        if (!source) throw new Error(`Returned item “${row.item || "Item"}” is not present on the original invoice.`);
        const sold = toNumber(source.qty ?? source.quantity);
        const returned = priorByRow.get(String(source.id || source.sourceItemId || source.item || "")) || 0;
        const qty = toNumber(row.qty);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("Return quantities must be greater than zero.");
        if (qty > sold - returned + 1e-9) throw new Error(`Return quantity for “${row.item}” exceeds the remaining returnable quantity (${Math.max(sold - returned, 0)}).`);
      }
    }

    const total = (input.rows || []).reduce((sum, row) => sum + calculateSaleReturnRow(row).amount, 0);
    if (!Number.isFinite(toNumber(input.received)) || toNumber(input.received) < 0 || toNumber(input.received) > total + 1e-9) {
      throw new Error("Refund amount must be between zero and the Credit Note total.");
    }
    const adjustedAmount = toNumber(input.adjustedAmount);
    const customerCreditAmount = toNumber(input.customerCreditAmount);
    if (input.type === "Credit Note" && (adjustedAmount < 0 || adjustedAmount + toNumber(input.received) > total + 1e-9
      || Math.abs(customerCreditAmount - Math.max(total - adjustedAmount - toNumber(input.received), 0)) > 0.02)) {
      throw new Error("Refund, invoice adjustment and remaining customer credit must match the Credit Note total.");
    }
    if (original) {
      const invoiceTotal = toNumber(original.totals?.finalTotal ?? original.totals?.grandTotal ?? original.totalAmount ?? original.total);
      const invoiceReceived = original.saleType === "cash" ? invoiceTotal : toNumber(original.totals?.received ?? original.receivedAmount);
      const previouslyApplied = records.filter((record) => record.id !== input.id && String(record.invoiceId) === String(original.id) && !record.cancelled)
        .reduce((sum, record) => sum + toNumber(record.adjustedAmount), 0);
      const remainingInvoiceBalance = Math.max(invoiceTotal - invoiceReceived - previouslyApplied, 0);
      if (adjustedAmount > remainingInvoiceBalance + 1e-9) throw new Error(`Applied amount exceeds the invoice's remaining balance (${remainingInvoiceBalance.toFixed(2)}).`);
    } else if (adjustedAmount > 0) throw new Error("An invoice adjustment requires a linked sales invoice.");
    const saved = { ...input, id: input.id || crypto.randomUUID(), total, updatedAt: new Date().toISOString() };
    const paymentOuts = readList(paymentsOutKey);
    const existingRefund = paymentOuts.find((entry) => entry.linkedCreditNoteId === saved.id);
    if (existingRefund && toNumber(saved.received) < toNumber(existingRefund.amount)) {
      throw new Error("Refunded money cannot be removed from an edited Credit Note.");
    }
    if (toNumber(saved.received) > 0) {
      if (!original) throw new Error("A refund must be linked to its original invoice.");
      const invoiceTotal = toNumber(original.totals?.finalTotal ?? original.totals?.grandTotal ?? original.totalAmount ?? original.total);
      const receivedOnInvoice = original.saleType === "cash" ? invoiceTotal : toNumber(original.totals?.received ?? original.receivedAmount);
      const earlierCredits = records.filter((record) => record.id !== saved.id && record.invoiceId === original.id && !record.cancelled)
        .reduce((sum, record) => sum + toNumber(record.total), 0);
      const earlierCreditIds = new Set(records.filter((record) => record.invoiceId === original.id && !record.cancelled).map((record) => record.id));
      const previouslyRefunded = paymentOuts.filter((entry) => earlierCreditIds.has(entry.linkedCreditNoteId) && entry.linkedCreditNoteId !== saved.id).reduce((sum, entry) => sum + toNumber(entry.amount), 0);
      const refundable = Math.max(0, earlierCredits + total - Math.max(invoiceTotal - receivedOnInvoice, 0) - previouslyRefunded);
      if (toNumber(saved.received) > refundable + 1e-9) throw new Error(`Refund exceeds the credit remaining after the invoice balance. Maximum refundable: ₹${refundable.toFixed(2)}.`);
      const refund = {
        id: `credit-note-refund-${saved.id}`,
        number: `CN-REF-${saved.number}`,
        date: saved.date,
        partyId: saved.partyId || "",
        partyName: saved.party,
        amount: toNumber(saved.received),
        received: toNumber(saved.received),
        paymentType: saved.paymentType || "Cash",
        payments: [{ id: crypto.randomUUID(), type: saved.paymentType || "Cash", amount: toNumber(saved.received) }],
        description: `Refund for Credit Note ${saved.number}`,
        status: "Used",
        linkedCreditNoteId: saved.id,
        createdAt: new Date().toISOString(),
      };
      if (existingRefund) {
        const index = paymentOuts.findIndex((entry) => entry.id === existingRefund.id);
        paymentOuts[index] = { ...existingRefund, ...refund, id: existingRefund.id, createdAt: existingRefund.createdAt, updatedAt: new Date().toISOString() };
      } else paymentOuts.unshift(refund);
    }
    const nextRecords = saved.id === input.id && input.id
      ? records.map((record) => record.id === saved.id ? saved : record)
      : [saved, ...records];
    const nextInvoices = original ? invoices.map((invoice) => String(invoice.id || invoice.invoiceId) === String(original.id)
      ? { ...invoice, ...returnSummaryForInvoice(original.id, nextRecords), updatedAt: new Date().toISOString() }
      : invoice) : invoices;
    let nextInventory = inventory;
    const history = readList(inventoryHistoryKey);
    const historyEntries = [];
    if (["Credit Note", "Sale Return"].includes(input.type)) {
      const qtyByItem = (rows, sign) => (rows || []).filter((row) => row.restockable)
        .forEach((row) => { const key = inventoryKey(row); if (key) qtyByItemMap.set(key, (qtyByItemMap.get(key) || 0) + sign * toNumber(row.qty)); });
      const qtyByItemMap = new Map();
      if (["Credit Note", "Sale Return"].includes(existingRecord?.type)) qtyByItem(existingRecord.rows, -1);
      qtyByItem(saved.rows, 1);
      nextInventory = inventory.map((item) => {
        const delta = qtyByItemMap.get(itemInventoryKey(item)) || 0;
        if (!delta) return item;
        const current = toNumber(item.openingQuantity != null && item.openingQuantity !== "" ? item.openingQuantity : item.stock);
        if (delta < 0 && current + delta < -1e-9) throw new Error(`Cannot reduce restocked quantity for ${item.itemName || item.name}; some returned stock is no longer available.`);
        const quantity = String(Math.max(0, current + delta));
        historyEntries.push({ id: crypto.randomUUID(), itemId: item.id, itemName: item.itemName || item.name, type: "Sales Return", direction: delta > 0 ? "add" : "reduce", quantity: Math.abs(delta), note: `${delta > 0 ? "Credit Note" : "Credit Note edit"} ${saved.number}`, reference: saved.number, returnId: saved.id, createdAt: new Date().toISOString() });
        return { ...item, openingQuantity: quantity, stock: quantity, updatedAt: new Date().toISOString() };
      });
    }
    window.localStorage.setItem(saleReturnsStorageKey, JSON.stringify(nextRecords));
    if (original) window.localStorage.setItem(invoicesKey, JSON.stringify(nextInvoices));
    if (toNumber(saved.received) > 0 || existingRefund) window.localStorage.setItem(paymentsOutKey, JSON.stringify(paymentOuts));
    if (nextInventory !== inventory) window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(nextInventory));
    if (historyEntries.length) window.localStorage.setItem(inventoryHistoryKey, JSON.stringify([...history, ...historyEntries]));
    if (!readList(saleReturnsStorageKey).some((record) => record.id === saved.id)) throw new Error("Credit Note could not be verified after saving.");
    notifyBusinessDataChanged();
    return saved;
  } catch (error) {
    let rollbackError = null;
    for (const [key, value] of Object.entries(before)) {
      try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); }
      catch (failure) { rollbackError ||= failure; }
    }
    if (rollbackError) throw new Error(`${error.message} Storage rollback was incomplete: ${rollbackError.message}`, { cause: error });
    throw error;
  }
}

export function cancelSaleReturn(returnId) {
  const keys = [saleReturnsStorageKey, invoicesKey, inventoryItemsStorageKey, inventoryHistoryKey];
  const before = Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)]));
  try {
    const records = readList(saleReturnsStorageKey);
    const invoices = readList(invoicesKey);
    const record = records.find((entry) => String(entry.id) === String(returnId));
    if (!record || !["Credit Note", "Sale Return"].includes(record.type)) throw new Error("Sales return was not found.");
    if (record.cancelled) throw new Error("This Credit Note is already cancelled.");
    if (toNumber(record.received) > 0) throw new Error("This Credit Note has a recorded refund. Reverse the refund before cancelling it.");
    const inventory = readList(inventoryItemsStorageKey);
    const history = readList(inventoryHistoryKey);
    const returnQtyByItem = new Map();
    (record.rows || []).filter((row) => row.restockable).forEach((row) => {
      const key = inventoryKey(row);
      if (key) returnQtyByItem.set(key, (returnQtyByItem.get(key) || 0) + toNumber(row.qty));
    });
    const nextInventory = inventory.map((item) => {
      const qty = returnQtyByItem.get(itemInventoryKey(item)) || 0;
      if (!qty) return item;
      const current = toNumber(item.openingQuantity != null && item.openingQuantity !== "" ? item.openingQuantity : item.stock);
      if (current + 1e-9 < qty) throw new Error(`Cannot cancel this return because ${item.itemName || item.name} stock has since been used.`);
      const next = String(Math.max(0, current - qty));
      return { ...item, openingQuantity: next, stock: next, updatedAt: new Date().toISOString() };
    });
    const cancelled = { ...record, cancelled: true, status: "Cancelled", cancelledAt: new Date().toISOString() };
    const nextRecords = records.map((entry) => entry.id === record.id ? cancelled : entry);
    window.localStorage.setItem(saleReturnsStorageKey, JSON.stringify(nextRecords));
    if (record.invoiceId) {
      const nextInvoices = invoices.map((invoice) => String(invoice.id || invoice.invoiceId) === String(record.invoiceId)
        ? { ...invoice, ...returnSummaryForInvoice(record.invoiceId, nextRecords), updatedAt: new Date().toISOString() }
        : invoice);
      window.localStorage.setItem(invoicesKey, JSON.stringify(nextInvoices));
    }
    window.localStorage.setItem(inventoryItemsStorageKey, JSON.stringify(nextInventory));
    if (returnQtyByItem.size) {
      const historyEntries = [...returnQtyByItem].flatMap(([key, quantity]) => {
        const item = inventory.find((entry) => itemInventoryKey(entry) === key);
        return item ? [{ id: crypto.randomUUID(), itemId: item.id, itemName: item.itemName || item.name, type: "Sales Return", direction: "reduce", quantity, note: `Credit Note cancellation ${record.number}`, reference: record.number, returnId: record.id, createdAt: new Date().toISOString() }] : [];
      });
      window.localStorage.setItem(inventoryHistoryKey, JSON.stringify([...history, ...historyEntries]));
    }
    notifyBusinessDataChanged();
    return cancelled;
  } catch (error) {
    let rollbackError = null;
    for (const [key, value] of Object.entries(before)) {
      try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); }
      catch (failure) { rollbackError ||= failure; }
    }
    if (rollbackError) throw new Error(`${error.message} Storage rollback was incomplete: ${rollbackError.message}`, { cause: error });
    throw error;
  }
}
