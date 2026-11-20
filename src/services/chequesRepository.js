import { initialChequeStatus, validateCheque, validateChequeStatusChange } from "./cheques.js";
import { cashBankDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { getActiveBusinessId } from "../config/businessConfig.js";

export const CHEQUE_STORAGE_KEY = "usv.cheques.v1";

export function getChequeStorageKey() {
  const companyId = getActiveBusinessId();
  return companyId ? `${CHEQUE_STORAGE_KEY}:${encodeURIComponent(companyId)}` : CHEQUE_STORAGE_KEY;
}

const storageKey = getChequeStorageKey;

function localStorageRef() {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser local storage is unavailable.");
  return window.localStorage;
}

function readRecords() {
  const raw = localStorageRef().getItem(storageKey());
  const fallbackRaw = storageKey() !== CHEQUE_STORAGE_KEY ? localStorageRef().getItem(CHEQUE_STORAGE_KEY) : null;
  const content = raw || fallbackRaw;
  if (!content) return [];
  try {
    const records = JSON.parse(content);
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

export function toDbPayload(cheque) {
  const isReceived = String(cheque.type || "").toLowerCase() === "received";
  const nowSqlDate = new Date().toISOString().slice(0, 10);
  const statusLower = String(cheque.status || "pending").toLowerCase();

  let depositDate = cheque.depositDate || (isReceived ? cheque.expectedDate : null) || null;
  if (statusLower === "deposited" && !depositDate) {
    depositDate = nowSqlDate;
  }

  let clearanceDate = cheque.clearanceDate || (!isReceived ? cheque.expectedDate : null) || null;
  if (statusLower === "cleared" && !clearanceDate) {
    clearanceDate = nowSqlDate;
  }

  return {
    id: cheque.id,
    partyId: cheque.partyId || null,
    partyName: (cheque.partyName || "Party").trim(),
    chequeNumber: (cheque.chequeNumber || "").trim(),
    bankName: (cheque.bankName || "Bank").trim(),
    amount: parseFloat(cheque.amount) || 0,
    chequeDate: cheque.chequeDate ? String(cheque.chequeDate).slice(0, 10) : nowSqlDate,
    chequeType: isReceived ? "received" : "issued",
    status: statusLower,
    depositDate: depositDate ? String(depositDate).slice(0, 10) : null,
    clearanceDate: clearanceDate ? String(clearanceDate).slice(0, 10) : null,
    notes: cheque.notes || "",
  };
}

export async function getAllCheques() {
  if (isDatabaseMode()) {
    try {
      const res = await cashBankDb.getCheques();
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list)) {
        const localRecords = readRecords();
        const localMap = new Map(localRecords.map((r) => [r.id, r]));
        const mapped = list.map((r) => {
          const local = localMap.get(r.id) || {};
          const isReceived = String(r.chequeType || local.type || "received").toLowerCase() === "received";
          const rawStatus = String(r.status || local.status || "pending").toLowerCase();
          const normalizedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
          const type = isReceived ? "Received" : "Issued";
          const chequeDate = r.chequeDate ? String(r.chequeDate).slice(0, 10) : (local.chequeDate || "");
          const depositDate = r.depositDate ? String(r.depositDate).slice(0, 10) : (local.depositDate || null);
          const clearanceDate = r.clearanceDate ? String(r.clearanceDate).slice(0, 10) : (local.clearanceDate || null);
          const expectedDate = local.expectedDate || (isReceived ? (depositDate || chequeDate) : (clearanceDate || chequeDate));

          return {
            ...local,
            ...r,
            id: r.id,
            partyId: r.partyId || local.partyId || null,
            partyName: r.partyName || local.partyName || "Party",
            chequeNumber: r.chequeNumber || local.chequeNumber || "",
            bankName: r.bankName || local.bankName || "",
            amount: parseFloat(r.amount) || local.amount || 0,
            chequeDate,
            depositDate,
            clearanceDate,
            expectedDate,
            type,
            status: normalizedStatus,
            notes: r.notes ?? local.notes ?? "",
            createdAt: r.createdAt || local.createdAt || new Date().toISOString(),
            updatedAt: r.updatedAt || local.updatedAt || new Date().toISOString(),
            history: Array.isArray(local.history) && local.history.length > 0
              ? local.history
              : [{ status: normalizedStatus, at: r.updatedAt || r.createdAt || new Date().toISOString(), note: "" }],
          };
        });
        writeRecords(mapped);
        return mapped.sort((left, right) => String(right.updatedAt || right.chequeDate || "").localeCompare(String(left.updatedAt || left.chequeDate || "")));
      }
    } catch (err) {
      console.warn("[Cheques] Failed to fetch from MySQL:", err.message);
    }
  }
  return readRecords().sort((left, right) => String(right.updatedAt || right.chequeDate || "").localeCompare(String(left.updatedAt || left.chequeDate || "")));
}

export async function getChequeById(id) {
  const local = readRecords().find((record) => record.id === id);
  if (local) return local;
  if (isDatabaseMode()) {
    const all = await getAllCheques();
    return all.find((record) => record.id === id) || null;
  }
  return null;
}

export async function createCheque(cheque) {
  const candidate = { ...cheque, status: initialChequeStatus(cheque.type) };
  const validation = validateCheque(candidate);
  if (validation) throw new Error(validation);
  const records = readRecords();
  const now = new Date().toISOString();
  const saved = {
    ...candidate,
    id: cheque.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `chq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    createdAt: now,
    updatedAt: now,
    history: [event(candidate.status)],
  };
  if (records.some((record) => record.id === saved.id)) throw new Error("This cheque was already saved.");

  if (isDatabaseMode()) {
    await cashBankDb.saveCheque(toDbPayload(saved));
  }
  writeRecords([saved, ...records]);
  return saved;
}

export async function updateCheque(id, changes) {
  let records = readRecords();
  let index = records.findIndex((record) => record.id === id);
  if (index < 0) {
    await getAllCheques();
    records = readRecords();
    index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("Cheque record not found.");
  }
  const current = records[index];
  const editableChanges = Object.fromEntries(
    Object.entries(changes || {}).filter(
      ([key]) => !["status", "history", "id", "createdAt", "updatedAt"].includes(key)
    )
  );
  const updated = {
    ...current,
    ...editableChanges,
    id,
    updatedAt: new Date().toISOString(),
  };
  const validation = validateCheque(updated);
  if (validation) throw new Error(validation);

  if (isDatabaseMode()) {
    await cashBankDb.saveCheque(toDbPayload(updated));
  }

  records[index] = updated;
  writeRecords(records);
  return updated;
}

import { saveBankTransaction } from "./bankAccounts.js";

export async function updateChequeStatus(id, status) {
  let records = readRecords();
  let index = records.findIndex((record) => record.id === id);
  if (index < 0) {
    await getAllCheques();
    records = readRecords();
    index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("Cheque record not found.");
  }
  const current = records[index];
  const validation = validateChequeStatusChange(current, status);
  if (validation) throw new Error(validation);

  const nowIso = new Date().toISOString();
  const nowDate = nowIso.slice(0, 10);
  const dateUpdates = {};
  if (status === "Deposited" && !current.depositDate) {
    dateUpdates.depositDate = nowDate;
  }
  if (status === "Cleared" && !current.clearanceDate) {
    dateUpdates.clearanceDate = nowDate;
  }

  const updated = {
    ...current,
    ...dateUpdates,
    status,
    updatedAt: nowIso,
    history: [...(current.history || []), event(status)],
  };

  if (isDatabaseMode()) {
    await cashBankDb.saveCheque(toDbPayload(updated));
  }

  records[index] = updated;
  writeRecords(records);

  if (status === "Cleared" && Number(records[index].amount) > 0) {
    try {
      const isReceived = records[index].type === "Received";
      saveBankTransaction({
        id: `txn-cheque-${records[index].id}`,
        accountId: records[index].bankAccountId || records[index].accountId || "bank-1",
        amount: Number(records[index].amount),
        type: isReceived ? "money-in" : "money-out",
        date: new Date().toISOString().slice(0, 10),
        description: isReceived
          ? `Cheque cleared: #${records[index].chequeNumber || records[index].number || ""} from ${records[index].partyName || ""}`
          : `Issued cheque cleared: #${records[index].chequeNumber || records[index].number || ""} to ${records[index].partyName || ""}`,
      }).catch(() => {});
    } catch {}
  }

  return updated;
}

export async function deleteOrCancelCheque(id) {
  return updateChequeStatus(id, "Cancelled");
}
