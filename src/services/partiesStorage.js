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

// In-memory cache for live database session
let memoryParties = [];

export function deduplicatePartyList(list) {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  const seenNames = new Set();
  const result = [];

  for (const party of list) {
    if (!party) continue;
    const id = String(party.id || "").trim();
    const name = String(party.partyName || party.name || "").trim().toLowerCase();
    if (id && seenIds.has(id)) continue;
    if (name && seenNames.has(name)) continue;

    if (id) seenIds.add(id);
    if (name) seenNames.add(name);
    result.push(party);
  }
  return result;
}

export function setMemoryParties(list) {
  if (Array.isArray(list)) {
    const normalized = list.map((party) => {
      const isInactive = party?.status === "inactive" || party?.isActive === false;
      return {
        ...party,
        status: isInactive ? "inactive" : "active",
        isActive: !isInactive,
      };
    });
    memoryParties = deduplicatePartyList(normalized);
  } else {
    memoryParties = [];
  }
}

// Reads parties.
function readParties() {
  if (memoryParties.length > 0) return memoryParties;
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(PARTIES_KEY) || "[]");
    if (Array.isArray(value) && value.length > 0) {
      const deduplicated = deduplicatePartyList(value);
      if (isDatabaseMode()) memoryParties = deduplicated;
      return deduplicated;
    }
    return [];
  } catch {
    return [];
  }
}

function readList(key) {
  if (isDatabaseMode()) return [];
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

// Gets parties from active cache.
export function getParties() {
  return readParties();
}

// Live fetch directly from MySQL database backend
export async function fetchPartiesFromDb() {
  return await partiesDb.listAll();
}

// Saves party.
export function saveParty(party, options = {}) {
  const isInactive = party?.status === "inactive" || party?.isActive === false;
  const partyName = String(party?.partyName || party?.name || "").trim();
  const currentList = readParties();

  // Find existing by ID or case-insensitive party name
  const existingIndex = currentList.findIndex(
    (entry) =>
      (party.id && String(entry.id) === String(party.id)) ||
      (partyName && String(entry.partyName || entry.name || "").trim().toLowerCase() === partyName.toLowerCase())
  );

  const existingEntry = existingIndex >= 0 ? currentList[existingIndex] : null;
  const id = party.id || existingEntry?.id || crypto.randomUUID();

  const saved = {
    ...(existingEntry || {}),
    ...party,
    id,
    partyName: partyName || existingEntry?.partyName || "",
    name: partyName || existingEntry?.name || "",
    status: isInactive ? "inactive" : "active",
    isActive: !isInactive,
    updatedAt: new Date().toISOString(),
  };

  const next = [
    saved,
    ...currentList.filter(
      (entry) =>
        String(entry.id) !== String(saved.id) &&
        String(entry.partyName || entry.name || "").trim().toLowerCase() !== partyName.toLowerCase()
    ),
  ];
  memoryParties = deduplicatePartyList(next);
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(PARTIES_KEY, JSON.stringify(memoryParties));
  }
  setMemoryParties(memoryParties);
  if (isDatabaseMode() && !options?.skipRemoteSync) {
    partiesDb.save(saved).catch((err) => console.warn("[MySQL] Background party sync notice:", err.message));
  }
  notifyBusinessDataChanged();
  return saved;
}

// Deletes party.
export function deleteParty(partyId, options = {}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const next = readParties().filter((entry) => String(entry.id) !== String(partyId));
  memoryParties = next;
  window.localStorage.setItem(PARTIES_KEY, JSON.stringify(next));
  setMemoryParties(next);
  if (isDatabaseMode() && !options?.skipRemoteSync) {
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
