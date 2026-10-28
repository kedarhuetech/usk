import { initialChequeStatus, validateCheque, validateChequeStatusChange } from "./cheques.js";

export const CHEQUE_STORAGE_KEY = "usv.cheques.v1";

function storageKey() {
  const companyId = String(import.meta.env?.VITE_BUSINESS_ID || "").trim();
  return companyId ? `${CHEQUE_STORAGE_KEY}:${encodeURIComponent(companyId)}` : CHEQUE_STORAGE_KEY;
}

function localStorageRef() {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser local storage is unavailable.");
  return window.localStorage;
}

function readRecords() {
  const raw = localStorageRef().getItem(storageKey());
  if (!raw) return [];
  try {
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    return records.filter((record) => {
      if (!record || typeof record !== "object" || typeof record.id !== "string" || validateCheque(record)) return false;
      const validStatuses = record.type === "Received" ? ["Pending", "Deposited", "Cleared", "Bounced", "Cancelled"] : ["Issued", "Cleared", "Bounced", "Cancelled"];
      return validStatuses.includes(record.status);
    });
  } catch {
    return [];
  }
}

function writeRecords(records) {
  localStorageRef().setItem(storageKey(), JSON.stringify(records));
}

function event(status, note = "") {
  return { status, at: new Date().toISOString(), note };
}

export async function getAllCheques() {
  return readRecords().sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

export async function getChequeById(id) {
  return readRecords().find((record) => record.id === id) || null;
}

export async function createCheque(cheque) {
  const candidate = { ...cheque, status: initialChequeStatus(cheque.type) };
  const validation = validateCheque(candidate);
  if (validation) throw new Error(validation);
  const records = readRecords();
  const now = new Date().toISOString();
  const saved = {
    ...candidate,
    id: cheque.id || crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    history: [event(cheque.status)],
  };
  if (records.some((record) => record.id === saved.id)) throw new Error("This cheque was already saved.");
  writeRecords([saved, ...records]);
  return saved;
}

export async function updateCheque(id, changes) {
  const records = readRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) throw new Error("Cheque record not found.");
  const editableChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => !["status", "history", "id", "createdAt", "updatedAt"].includes(key)));
  const updated = { ...records[index], ...editableChanges, id, updatedAt: new Date().toISOString() };
  const validation = validateCheque(updated);
  if (validation) throw new Error(validation);
  records[index] = updated;
  writeRecords(records);
  return updated;
}

export async function updateChequeStatus(id, status) {
  const records = readRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) throw new Error("Cheque record not found.");
  const validation = validateChequeStatusChange(records[index], status);
  if (validation) throw new Error(validation);
  const updated = { ...records[index], status, updatedAt: new Date().toISOString(), history: [...(records[index].history || []), event(status)] };
  records[index] = updated;
  writeRecords(records);
  return updated;
}

export async function deleteOrCancelCheque(id) {
  return updateChequeStatus(id, "Cancelled");
}
