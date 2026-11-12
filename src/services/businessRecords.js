import { businessDataApi, businessGrowthApi } from "./apiClient.js";
import { getInventoryItems, normalizeInventoryItem, saveInventoryItem } from "./itemsStorage.js";
import { getSaleInvoices, saveSaleInvoice } from "./salesStorage.js";
import { getParties, saveParty } from "./partiesStorage.js";
import { getPurchaseBills, savePurchaseBill } from "./purchaseBillsStorage.js";
import { getAppSettings } from "./appSettingsStorage.js";
import { loadLocalDashboardSummary } from "./dashboardSummary.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

// This helper handles id logic.
function withId(record = {}) {
  return { ...record, id: record.id || crypto.randomUUID() };
}

// Loads business items.
export async function loadBusinessItems() {
  return getInventoryItems();
}

// Saves business item.
export async function saveBusinessItem(value) {
  const normalized = normalizeInventoryItem(value);
  const saved = saveInventoryItem(normalized);
  if (isDatabaseMode()) {
    try {
      businessGrowthApi.save("items", saved).catch(() => {});
    } catch {}
  }
  return saved;
}

// Loads business parties.
export async function loadBusinessParties() {
  return getParties();
}

// Loads business summary.
export async function loadBusinessSummary() {
  return loadLocalDashboardSummary();
}

// Saves business party.
export async function saveBusinessParty(value) {
  return saveParty(withId(value));
}

// Loads sales invoices.
export async function loadSalesInvoices() {
  const localInvoices = getSaleInvoices();
  if (!isDatabaseMode()) return localInvoices;

  let rows;
  try {
    rows = await businessDataApi.list("sales-invoices");
  } catch (error) {
    if (localInvoices.length) {
      console.warn("Backend invoice list unavailable; using saved local sale invoices.", error);
      return localInvoices;
    }
    return localInvoices;
  }

  if (rows.length) {
    const invoices = [...rows];
    const knownIds = new Set(invoices.map((invoice) => invoice.id));
    for (const invoice of localInvoices) {
      if (!knownIds.has(invoice.id)) {
        try {
          invoices.push(await businessDataApi.save("sales-invoices", invoice));
        } catch (error) {
          console.warn("Could not migrate a local invoice to the backend; showing its local copy.", error);
          invoices.push(invoice);
        }
      }
    }
    for (const invoice of invoices) {
      try {
        saveSaleInvoice(invoice);
      } catch {}
    }
    return invoices;
  }

  const migrated = [];
  for (const invoice of localInvoices) {
    try {
      migrated.push(await businessDataApi.save("sales-invoices", invoice));
    } catch (error) {
      console.warn("Could not migrate a local invoice to the backend; showing its local copy.", error);
      migrated.push(invoice);
    }
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
  if (!isDatabaseMode()) return localInvoice;

  let saved = localInvoice;
  try {
    saved = await businessDataApi.save("sales-invoices", localInvoice);
  } catch (error) {
    console.warn("Backend unavailable; saved sale invoice to local storage.", error);
  }

  const changedItems = getInventoryItems();
  const touchedIds = new Set((localInvoice.rows || []).map((row) => row.sourceItemId).filter(Boolean));
  for (const item of changedItems) {
    if (touchedIds.has(item.id)) await saveBusinessItem(item);
  }
  return saved;
}

// Loads purchase bills.
export async function loadPurchaseBills() {
  const localBills = getPurchaseBills();
  if (!isDatabaseMode()) return localBills;

  try {
    const bills = await businessDataApi.list("purchase-bills");
    for (const bill of bills) savePurchaseBill(bill);
    return bills;
  } catch (error) {
    console.warn("Backend unavailable; using local purchase bills.", error);
    return localBills;
  }
}

// This helper handles purchase bill number logic.
export async function nextPurchaseBillNumber() {
  const bills = await loadPurchaseBills();
  return String(bills.length + 1);
}

// Saves business purchase bill.
export async function saveBusinessPurchaseBill(value) {
  const bill = withId({ ...value, transactionType: "purchase" });
  // Always commit to local storage first so transactions and inventory update instantly!
  const localSaved = savePurchaseBill(bill);

  if (!isDatabaseMode()) return localSaved;

  try {
    await businessDataApi.save("purchase-bills", localSaved);
    const changedItems = getInventoryItems();
    const touchedItemIds = new Set((bill.rows || []).map((row) => row.sourceItemId).filter(Boolean));
    for (const item of changedItems) {
      if (touchedItemIds.has(item.id)) {
        try {
          await saveBusinessItem(item);
        } catch {}
      }
    }
  } catch (error) {
    console.warn("Backend unavailable; saved purchase bill to local storage.", error);
  }

  return localSaved;
}
