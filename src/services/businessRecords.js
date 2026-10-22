import { businessDataApi } from "./apiClient.js";
import { persistInlineImages, normalizePersistedAssetUrls } from "./businessGrowthData.js";
import { getInventoryItems, normalizeInventoryItem, saveInventoryItem } from "./itemsStorage.js";
import { getSaleInvoices, saveSaleInvoice } from "./salesStorage.js";

function withId(record = {}) {
  return { ...record, id: record.id || crypto.randomUUID() };
}

export async function loadBusinessItems() {
  const rows = await businessDataApi.list("items");
  if (rows.length) {
    const items = rows.map((item) => {
      const normalized = normalizeInventoryItem(normalizePersistedAssetUrls(item));
      saveInventoryItem(normalized);
      return normalized;
    });
    const knownIds = new Set(items.map((item) => item.id));
    for (const localItem of getInventoryItems()) {
      if (!knownIds.has(localItem.id)) items.push(await saveBusinessItem(localItem));
    }
    return items;
  }

  // Move existing browser-only items into MySQL the first time this account loads.
  const localItems = getInventoryItems();
  const migrated = [];
  for (const item of localItems) migrated.push(await saveBusinessItem(item));
  return migrated;
}

export async function saveBusinessItem(value) {
  const item = normalizeInventoryItem(value);
  const persisted = await persistInlineImages(item, "inventory-item", item.id);
  const saved = await businessDataApi.save("items", persisted);
  saveInventoryItem(saved);
  return normalizeInventoryItem(saved);
}

export async function loadBusinessParties() {
  return businessDataApi.list("parties");
}

export async function loadBusinessSummary() {
  return businessDataApi.summary();
}

export async function saveBusinessParty(value) {
  return businessDataApi.save("parties", withId(value));
}

export async function loadSalesInvoices() {
  const rows = await businessDataApi.list("sales-invoices");
  const localInvoices = getSaleInvoices();
  if (rows.length) {
    const invoices = [...rows];
    const knownIds = new Set(invoices.map((invoice) => invoice.id));
    for (const invoice of localInvoices) {
      if (!knownIds.has(invoice.id)) invoices.push(await businessDataApi.save("sales-invoices", invoice));
    }
    return invoices;
  }

  // Preserve existing invoices created before MySQL persistence was enabled.
  const migrated = [];
  for (const invoice of localInvoices) {
    migrated.push(await businessDataApi.save("sales-invoices", invoice));
  }
  return migrated;
}

export async function nextSalesInvoiceNumber() {
  const invoices = await loadSalesInvoices();
  return String(invoices.length + 1);
}

export async function saveBusinessSaleInvoice(value) {
  const localInvoice = saveSaleInvoice(value);
  const saved = await businessDataApi.save("sales-invoices", localInvoice);

  // Keep MySQL inventory quantities in step with the existing sale stock update.
  const changedItems = getInventoryItems();
  const touchedIds = new Set((localInvoice.rows || []).map((row) => row.sourceItemId).filter(Boolean));
  for (const item of changedItems) {
    if (touchedIds.has(item.id)) await saveBusinessItem(item);
  }
  return saved;
}

export async function loadPurchaseBills() {
  return businessDataApi.list("purchase-bills");
}

export async function nextPurchaseBillNumber() {
  const bills = await loadPurchaseBills();
  return String(bills.length + 1);
}

export async function saveBusinessPurchaseBill(value) {
  const bill = withId({ ...value, transactionType: "purchase" });
  const existing = (await loadPurchaseBills()).some((entry) => entry.id === bill.id);
  const saved = await businessDataApi.save("purchase-bills", bill);
  if (!existing) {
    const items = await loadBusinessItems();
    const quantities = new Map();
    for (const row of bill.rows || []) {
      const quantity = Math.max(Number(row.qty || 0), 0);
      if (!row.item || !quantity) continue;
      const item = items.find((candidate) =>
        (row.sourceItemId && candidate.id === row.sourceItemId)
        || (!row.sourceItemId && String(candidate.itemName).trim().toLowerCase() === String(row.item).trim().toLowerCase()),
      );
      if (item) quantities.set(item.id, (quantities.get(item.id) || 0) + quantity);
    }
    for (const item of items) {
      const added = quantities.get(item.id);
      if (added) {
        const current = Number(item.openingQuantity || item.stock || 0) || 0;
        await saveBusinessItem({ ...item, openingQuantity: String(current + added), stock: String(current + added) });
      }
    }
  }
  return saved;
}
