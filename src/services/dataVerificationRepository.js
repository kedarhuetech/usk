import { getInventoryItems } from "./itemsStorage.js";
import { getParties } from "./partiesStorage.js";
import { getSaleInvoices } from "./salesStorage.js";
import { getPurchaseBills } from "./purchaseBillsStorage.js";
import { transactionsDb } from "./databaseRepository.js";
import {
  loadBusinessItems,
  loadBusinessParties,
  loadSalesInvoices,
  loadPurchaseBills,
} from "./businessRecords.js";

function readRecords(name, read) {
  let records;
  try { records = read(); }
  catch (error) { throw new Error(`${name} local data could not be read: ${error.message || "invalid stored data"}`, { cause: error }); }
  if (!Array.isArray(records)) throw new Error(`${name} local data is malformed; expected a list of records.`);
  return records;
}

// Relational & Local adapter for Verify My Data. Synchronizes with company-scoped
// business data while maintaining seamless offline fallback.
export const dataVerificationRepository = {
  async getItems() {
    try {
      const live = await loadBusinessItems();
      if (Array.isArray(live) && live.length > 0) return live;
    } catch {}
    return readRecords("Items", getInventoryItems);
  },
  async getParties() {
    try {
      const live = await loadBusinessParties();
      if (Array.isArray(live) && live.length > 0) return live;
    } catch {}
    return readRecords("Parties", getParties);
  },
  async getSales() {
    try {
      const allTx = await transactionsDb.listAll();
      if (Array.isArray(allTx)) {
        const sales = allTx.filter((t) => t.transactionType === "sale" || t.transactionType === "pos" || t.type === "sale" || t.type === "pos");
        if (sales.length > 0) return sales;
      }
    } catch {}
    return readRecords("Sales", getSaleInvoices);
  },
  async getPurchases() {
    try {
      const live = await loadPurchaseBills();
      if (Array.isArray(live) && live.length > 0) return live;
    } catch {}
    return readRecords("Purchases", getPurchaseBills);
  },
};
