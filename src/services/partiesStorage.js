import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { partiesDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

const PARTIES_KEY = "ledgerly:parties.v1";
const linkedPartySources = [
  ["ledgerly:saleInvoices.v1", "sales invoices"],
  ["ledgerly:purchaseBills.v1", "purchase bills"],
  ["ledgerly:paymentIns.v1", "payment history"],
  ["ledgerly:paymentOuts.v1", "payment history"],
  ["ledgerly:saleReturns.v1", "credit notes"],
  ["ledgerly:purchaseReturns.v1", "debit notes"],
  ["ledgerly:estimateQuotations.v1", "estimates"],
  ["ledgerly:proformaInvoices.v1", "proforma invoices"],
];

// Reads parties.
function readParties() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(PARTIES_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readList(key) {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function recordMatchesParty(record, party) {
  const partyId = String(party.id || "");
  const recordId = String(record?.partyId || record?.form?.partyId || record?.customerId || record?.supplierId || "");
  if (partyId && recordId && partyId === recordId) return true;
  const partyName = String(party.partyName || party.name || "").trim().toLowerCase();
  const recordName = String(record?.partyName || record?.customerName || record?.customer || record?.supplier || record?.party || record?.form?.customer || record?.form?.party || "").trim().toLowerCase();
  return Boolean(partyName && recordName && partyName === recordName);
}

// Gets parties.
export function getParties() {
  return readParties();
}

// Saves party.
export function saveParty(party) {
  const saved = { ...party, id: party.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
  const next = [saved, ...readParties().filter((entry) => String(entry.id) !== String(saved.id))];
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(PARTIES_KEY, JSON.stringify(next));
  }
  if (isDatabaseMode()) {
    partiesDb.save(saved).catch((err) => console.warn("[MySQL] Background party sync notice:", err.message));
  }
  notifyBusinessDataChanged();
  return saved;
}

// Deletes party.
export function deleteParty(partyId) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const next = readParties().filter((entry) => String(entry.id) !== String(partyId));
  window.localStorage.setItem(PARTIES_KEY, JSON.stringify(next));
  if (isDatabaseMode()) {
    partiesDb.remove(partyId).catch((err) => console.warn("[MySQL] Background party delete notice:", err.message));
  }
  notifyBusinessDataChanged();
}

export function getPartyDeletionBlockReason(party) {
  if (!party?.id) return "This party has no valid ID.";
  if (Number(party.openingBalance || 0) !== 0) {
    return "This party has an outstanding opening balance.";
  }
  const linkedSources = linkedPartySources
    .filter(([key]) => readList(key).some((record) => recordMatchesParty(record, party)))
    .map(([, label]) => label);
  if (linkedSources.length) {
    return `This party has existing transaction history (${[...new Set(linkedSources)].join(", ")}). Historical records must be preserved.`;
  }
  return "";
}

export const partiesStorageKey = PARTIES_KEY;
