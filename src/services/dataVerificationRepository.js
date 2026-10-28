import { getInventoryItems } from "./itemsStorage.js";
import { getParties } from "./partiesStorage.js";
import { getSaleInvoices } from "./salesStorage.js";
import { getPurchaseBills } from "./purchaseBillsStorage.js";

function readRecords(name, read) {
  let records;
  try { records = read(); }
  catch (error) { throw new Error(`${name} local data could not be read: ${error.message || "invalid stored data"}`, { cause: error }); }
  if (!Array.isArray(records)) throw new Error(`${name} local data is malformed; expected a list of records.`);
  return records;
}

// Local adapter for Verify My Data. Replace these methods with the existing
// company-scoped API later without changing verification rules or the page.
export const dataVerificationRepository = {
  async getItems() { return readRecords("Items", getInventoryItems); },
  async getParties() { return readRecords("Parties", getParties); },
  async getSales() { return readRecords("Sales", getSaleInvoices); },
  async getPurchases() { return readRecords("Purchases", getPurchaseBills); },
};
