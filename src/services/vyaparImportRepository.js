import { inventoryItemsStorageKey, sameInventoryItemIdentity } from "./itemsStorage.js";
import { partiesStorageKey } from "./partiesStorage.js";
import { saleInvoicesStorageKey } from "./salesStorage.js";
import { purchaseBillsStorageKey } from "./purchaseBillsStorage.js";

const COMPANY_PROFILE_KEY = "ledgerly:companyProfile.v1";
const RECEIPTS_KEY = "ledgerly:paymentIns.v1";
const PAYMENTS_KEY = "ledgerly:paymentOuts.v1";

function readArray(storage, key, label) {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  let value;
  try { value = JSON.parse(raw); } catch {
    throw new Error(`Could not read existing ${label}; fix its local data before importing.`);
  }
  if (!Array.isArray(value)) throw new Error(`Existing ${label} data has an invalid format. No import was started.`);
  return value;
}

function partyDuplicate(left, right) {
  if (String(left.id) === String(right.id)) return true;
  const leftSourceIds = new Set(left.sourceIds || [left.sourceId].filter(Boolean));
  if ((right.sourceIds || [right.sourceId].filter(Boolean)).some((id) => leftSourceIds.has(id))) return true;
  const leftName = String(left.partyName || left.name || "").trim().toLocaleLowerCase();
  const rightName = String(right.partyName || right.name || "").trim().toLocaleLowerCase();
  const leftGstin = String(left.gstin || "").replace(/\s/g, "").toLocaleUpperCase();
  const rightGstin = String(right.gstin || "").replace(/\s/g, "").toLocaleUpperCase();
  if (leftGstin && rightGstin) return leftGstin === rightGstin;
  const leftPhone = String(left.phone || "").replace(/\D/g, "");
  const rightPhone = String(right.phone || "").replace(/\D/g, "");
  if (leftName && leftName === rightName && leftPhone && rightPhone && leftPhone === rightPhone) return true;
  const leftAddress = String(left.address || left.billingAddress || "").trim().toLocaleLowerCase();
  const rightAddress = String(right.address || right.billingAddress || "").trim().toLocaleLowerCase();
  const leftPostal = String(left.pincode || "").trim().toLocaleUpperCase();
  const rightPostal = String(right.pincode || "").trim().toLocaleUpperCase();
  return Boolean(leftName && leftName === rightName && (leftAddress || leftPostal)
    && leftAddress === rightAddress && leftPostal === rightPostal);
}

function sameInvoice(left, right) {
  if (String(left.id) === String(right.id)) return true;
  if (left.importSource === "vyapar" && right.importSource === "vyapar"
    && left.sourceId && right.sourceId && String(left.sourceId) === String(right.sourceId)) return true;
  const leftNumber = String(left.form?.invoiceNumber || left.invoiceNumber || "").trim().toLocaleLowerCase();
  const rightNumber = String(right.form?.invoiceNumber || right.invoiceNumber || "").trim().toLocaleLowerCase();
  const leftParty = String(left.form?.customerId || left.form?.partyId || left.form?.customer || "").trim().toLocaleLowerCase();
  const rightParty = String(right.form?.customerId || right.form?.partyId || right.form?.customer || "").trim().toLocaleLowerCase();
  const leftDate = String(left.form?.invoiceDate || "");
  const rightDate = String(right.form?.invoiceDate || "");
  return Boolean(leftNumber && leftNumber === rightNumber && leftParty && leftParty === rightParty && leftDate && leftDate === rightDate);
}

function samePayment(left, right) {
  if (String(left.id) === String(right.id)) return true;
  return left.importSource === "vyapar" && right.importSource === "vyapar"
    && left.sourceId && right.sourceId && String(left.sourceId) === String(right.sourceId);
}

function mergeRecords(existing, incoming, duplicateCheck) {
  const rows = [...existing];
  let duplicateCount = 0;
  const duplicateSamples = [];
  for (const entry of incoming) {
    const matching = rows.find((saved) => duplicateCheck(saved, entry));
    if (matching) {
      duplicateCount += 1;
      duplicateSamples.push({
        id: entry.id,
        label: entry.itemName || entry.partyName || entry.form?.invoiceNumber || entry.id,
        existingId: matching.id,
      });
      continue;
    }
    rows.push(entry);
  }
  return { rows, duplicateCount, duplicateSamples };
}

function resolveIds(existing, incoming, duplicateCheck) {
  const resolved = new Map();
  for (const entry of incoming) {
    const matching = existing.find((saved) => duplicateCheck(saved, entry));
    if (matching) resolved.set(String(entry.id), matching.id);
    else resolved.set(String(entry.id), entry.id);
  }
  return resolved;
}

function getExisting(storage) {
  return {
    items: readArray(storage, inventoryItemsStorageKey, "items"),
    parties: readArray(storage, partiesStorageKey, "parties"),
    salesInvoices: readArray(storage, saleInvoicesStorageKey, "sales invoices"),
    purchaseInvoices: readArray(storage, purchaseBillsStorageKey, "purchase invoices"),
    receipts: readArray(storage, RECEIPTS_KEY, "receipts"),
    payments: readArray(storage, PAYMENTS_KEY, "payments"),
  };
}

function mergeMappedRecords(existing, mapped) {
  const itemMerge = mergeRecords(existing.items, mapped.items, (left, right) =>
    String(left.id) === String(right.id) || sameInventoryItemIdentity(left, right));
  const partyMerge = mergeRecords(existing.parties, mapped.parties, partyDuplicate);
  const itemIdMap = resolveIds(existing.items, mapped.items, (left, right) =>
    String(left.id) === String(right.id) || sameInventoryItemIdentity(left, right));
  const partyIdMap = resolveIds(existing.parties, mapped.parties, partyDuplicate);
  const rebaseInvoice = (invoice) => ({
    ...invoice,
    form: {
      ...invoice.form,
      customerId: partyIdMap.get(String(invoice.form?.customerId)) || invoice.form?.customerId,
      partyId: partyIdMap.get(String(invoice.form?.partyId)) || invoice.form?.partyId,
    },
    rows: (invoice.rows || []).map((row) => ({
      ...row,
      sourceItemId: itemIdMap.get(String(row.sourceItemId)) || row.sourceItemId,
    })),
  });
  const salesInvoices = (mapped.salesInvoices || []).map(rebaseInvoice);
  const purchaseInvoices = (mapped.purchaseInvoices || []).map(rebaseInvoice);
  const salesMerge = mergeRecords(existing.salesInvoices, salesInvoices, sameInvoice);
  const purchaseMerge = mergeRecords(existing.purchaseInvoices, purchaseInvoices, sameInvoice);
  const receiptMerge = mergeRecords(existing.receipts, mapped.receipts || [], samePayment);
  const paymentMerge = mergeRecords(existing.payments, mapped.payments || [], samePayment);
  return {
    itemMerge,
    partyMerge,
    salesMerge,
    purchaseMerge,
    receiptMerge,
    paymentMerge,
    duplicates: {
      items: itemMerge.duplicateCount,
      parties: partyMerge.duplicateCount,
      salesInvoices: salesMerge.duplicateCount,
      purchaseInvoices: purchaseMerge.duplicateCount,
      receipts: receiptMerge.duplicateCount,
      payments: paymentMerge.duplicateCount,
    },
    duplicateSamples: {
      items: itemMerge.duplicateSamples,
      parties: partyMerge.duplicateSamples,
      salesInvoices: salesMerge.duplicateSamples,
      purchaseInvoices: purchaseMerge.duplicateSamples,
      receipts: receiptMerge.duplicateSamples,
      payments: paymentMerge.duplicateSamples,
    },
  };
}

export function createLocalVyaparImportRepository(storage = typeof window !== "undefined" ? window.localStorage : null) {
  function assertStorage() {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("Browser local storage is unavailable. No records were imported.");
    }
  }

  return {
    inspectDuplicates(mapped) {
      assertStorage();
      const merged = mergeMappedRecords(getExisting(storage), mapped);
      return { counts: merged.duplicates, samples: merged.duplicateSamples };
    },

    async importRecords(mapped, { includeCompanyProfile = false, onProgress = () => {} } = {}) {
      assertStorage();
      const existing = getExisting(storage);
      const merged = mergeMappedRecords(existing, mapped);
      const writes = [];
      const addWrite = (key, value, category) => writes.push({ key, value, category });
      if (merged.itemMerge.rows.length !== existing.items.length) addWrite(inventoryItemsStorageKey, merged.itemMerge.rows, "Items");
      if (merged.partyMerge.rows.length !== existing.parties.length) addWrite(partiesStorageKey, merged.partyMerge.rows, "Parties");
      if (merged.salesMerge.rows.length !== existing.salesInvoices.length) addWrite(saleInvoicesStorageKey, merged.salesMerge.rows, "Sales invoices");
      if (merged.purchaseMerge.rows.length !== existing.purchaseInvoices.length) addWrite(purchaseBillsStorageKey, merged.purchaseMerge.rows, "Purchase invoices");
      if (merged.receiptMerge.rows.length !== existing.receipts.length) addWrite(RECEIPTS_KEY, merged.receiptMerge.rows, "Receipts");
      if (merged.paymentMerge.rows.length !== existing.payments.length) addWrite(PAYMENTS_KEY, merged.paymentMerge.rows, "Payments");
      if (includeCompanyProfile && mapped.company) addWrite(COMPANY_PROFILE_KEY, mapped.company, "Company profile");

      const snapshots = new Map();
      try {
        for (const { key } of writes) snapshots.set(key, storage.getItem(key));
        let completed = 0;
        for (const { key, value, category } of writes) {
          const expected = JSON.stringify(value);
          storage.setItem(key, expected);
          if (storage.getItem(key) !== expected) throw new Error(`Could not verify saved data (${key}).`);
          completed += 1;
          await onProgress({ completed, total: writes.length, category });
        }
      } catch (error) {
        for (const [key, value] of snapshots) {
          try {
            if (value === null) storage.removeItem(key);
            else storage.setItem(key, value);
          } catch {
            // Best-effort rollback if browser storage itself became unavailable.
          }
        }
        throw new Error(`Import failed; saved stores were rolled back where possible. ${error.message}`, { cause: error });
      }

      return {
        imported: {
          items: merged.itemMerge.rows.length - existing.items.length,
          parties: merged.partyMerge.rows.length - existing.parties.length,
          salesInvoices: merged.salesMerge.rows.length - existing.salesInvoices.length,
          purchaseInvoices: merged.purchaseMerge.rows.length - existing.purchaseInvoices.length,
          receipts: merged.receiptMerge.rows.length - existing.receipts.length,
          payments: merged.paymentMerge.rows.length - existing.payments.length,
          companyProfile: writes.some(({ key }) => key === COMPANY_PROFILE_KEY) ? 1 : 0,
        },
        duplicates: merged.duplicates,
        skipped: mapped.skipped,
        invalidRecords: mapped.invalidRecords || [],
      };
    },
  };
}
