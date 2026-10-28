// Provides the business records application service.
import { businessDataApi } from "./apiClient.js";
import { getInventoryItems, normalizeInventoryItem, saveInventoryItem } from "./itemsStorage.js";
import { getSaleInvoices, saveSaleInvoice } from "./salesStorage.js";
import { getParties, saveParty } from "./partiesStorage.js";
import { savePurchaseBill } from "./purchaseBillsStorage.js";

const LEGACY_ITEMS_MIGRATED_KEY = "ledgerly:inventoryItems.legacyDatabaseMigration.v1";

// This helper handles id logic.
function withId(record = {}) {
  return { ...record, id: record.id || crypto.randomUUID() };
}

// Loads business items.
export async function loadBusinessItems() {
  const localItems = getInventoryItems();
  if (typeof window === "undefined" || !window.localStorage) return localItems;
  if (window.localStorage.getItem(LEGACY_ITEMS_MIGRATED_KEY) === "true") return localItems;

  try {
    // One-time recovery for items saved to MySQL before the local-only switch.
    const legacyItems = await businessDataApi.list("items");
    const keys = new Set(localItems.flatMap((item) => [
      item.itemCode ? `code:${String(item.itemCode).trim().toLowerCase()}` : "",
      `name:${String(item.itemName || "").trim().toLowerCase()}|${String(item.unit || "").trim().toLowerCase()}`,
    ].filter(Boolean)));
    const migratedItems = [...localItems];
    for (const legacyItem of legacyItems) {
      const item = normalizeInventoryItem(legacyItem);
      const codeKey = item.itemCode ? `code:${String(item.itemCode).trim().toLowerCase()}` : "";
      const nameKey = `name:${String(item.itemName || "").trim().toLowerCase()}|${String(item.unit || "").trim().toLowerCase()}`;
      if ((codeKey && keys.has(codeKey)) || keys.has(nameKey)) continue;
      migratedItems.push(saveInventoryItem(item));
      if (codeKey) keys.add(codeKey);
      keys.add(nameKey);
    }
    window.localStorage.setItem(LEGACY_ITEMS_MIGRATED_KEY, "true");
    return migratedItems;
  } catch {
    // Keep the local Items screen usable when the legacy API is offline.
    return localItems;
  }
}

// Saves business item.
export async function saveBusinessItem(value) {
  return saveInventoryItem(normalizeInventoryItem(value));
}

// Loads business parties.
export async function loadBusinessParties() {
  return getParties();
}

// Loads business summary.
export async function loadBusinessSummary() {
  return businessDataApi.summary();
}

// Saves business party.
export async function saveBusinessParty(value) {
  return saveParty(withId(value));
}

// Loads sales invoices.
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

// This helper handles sales invoice number logic.
export async function nextSalesInvoiceNumber() {
  const invoices = await loadSalesInvoices();
  return String(invoices.length + 1);
}

// Saves business sale invoice.
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

// Loads purchase bills.
export async function loadPurchaseBills() {
  const bills = await businessDataApi.list("purchase-bills");
  for (const bill of bills) savePurchaseBill(bill);
  return bills;
}

// This helper handles purchase bill number logic.
export async function nextPurchaseBillNumber() {
  const bills = await loadPurchaseBills();
  return String(bills.length + 1);
}

// Saves business purchase bill.
export async function saveBusinessPurchaseBill(value) {
  const bill = withId({ ...value, transactionType: "purchase" });
  // Handles result.
  const existing = (await loadPurchaseBills()).some((entry) => entry.id === bill.id);
  const saved = await businessDataApi.save("purchase-bills", bill);
  // Keep a browser-local copy for Utilities that need to work without a database read.
  savePurchaseBill(saved);
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
