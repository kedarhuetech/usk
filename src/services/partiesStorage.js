import { notifyBusinessDataChanged } from "./businessDataChanged.js";

const PARTIES_KEY = "ledgerly:parties.v1";

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
  notifyBusinessDataChanged();
  return saved;
}

// Deletes party.
export function deleteParty(partyId) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const next = readParties().filter((entry) => String(entry.id) !== String(partyId));
  window.localStorage.setItem(PARTIES_KEY, JSON.stringify(next));
  notifyBusinessDataChanged();
}

export const partiesStorageKey = PARTIES_KEY;
