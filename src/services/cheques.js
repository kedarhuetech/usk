export const CHEQUE_TYPES = { RECEIVED: "Received", ISSUED: "Issued" };
export const CHEQUE_STATUSES = ["Pending", "Deposited", "Issued", "Cleared", "Bounced", "Cancelled"];

const transitions = {
  Received: {
    Pending: ["Deposited", "Bounced", "Cancelled"],
    Deposited: ["Cleared", "Bounced", "Cancelled"],
    Bounced: ["Cancelled"],
    Cleared: [],
    Cancelled: [],
  },
  Issued: {
    Issued: ["Cleared", "Bounced", "Cancelled"],
    Bounced: ["Cancelled"],
    Cleared: [],
    Cancelled: [],
  },
};

export function initialChequeStatus(type) {
  return type === CHEQUE_TYPES.RECEIVED ? "Pending" : "Issued";
}

export function allowedChequeStatuses(cheque) {
  return transitions[cheque?.type]?.[cheque?.status] || [];
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCheque(cheque = {}) {
  if (![CHEQUE_TYPES.RECEIVED, CHEQUE_TYPES.ISSUED].includes(cheque.type)) return "Choose whether this cheque was received or issued.";
  if (!String(cheque.partyName || "").trim()) return "Party name is required.";
  if (String(cheque.partyName).trim().length > 160) return "Party name must be 160 characters or fewer.";
  if (!String(cheque.chequeNumber || "").trim()) return "Cheque number is required.";
  if (String(cheque.chequeNumber).trim().length > 50) return "Cheque number must be 50 characters or fewer.";
  if (!String(cheque.bankName || "").trim()) return "Bank name is required.";
  if (String(cheque.bankName).trim().length > 120) return "Bank name must be 120 characters or fewer.";
  const amount = Number(cheque.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) return "Enter a cheque amount greater than zero.";
  if (!validDate(cheque.chequeDate)) return "Enter a valid cheque date.";
  if (!validDate(cheque.expectedDate)) return cheque.type === CHEQUE_TYPES.RECEIVED ? "Enter a valid expected deposit date." : "Enter a valid expected payment date.";
  if (cheque.notes && String(cheque.notes).length > 1000) return "Notes must be 1,000 characters or fewer.";
  return "";
}

export function validateChequeStatusChange(cheque, nextStatus) {
  return allowedChequeStatuses(cheque).includes(nextStatus)
    ? ""
    : `A ${cheque?.type?.toLowerCase() || "cheque"} cannot move from ${cheque?.status || "its current status"} to ${nextStatus}.`;
}

export function summarizeCheques(cheques = []) {
  const active = cheques.filter((cheque) => cheque.status !== "Cancelled");
  const sum = (records) => Math.round(records.reduce((total, cheque) => total + Math.round(Number(cheque.amount || 0) * 100), 0)) / 100;
  return {
    receivedAmount: sum(active.filter((cheque) => cheque.type === CHEQUE_TYPES.RECEIVED)),
    issuedAmount: sum(active.filter((cheque) => cheque.type === CHEQUE_TYPES.ISSUED)),
    pendingCount: active.filter((cheque) => ["Pending", "Deposited", "Issued"].includes(cheque.status)).length,
    clearedCount: active.filter((cheque) => cheque.status === "Cleared").length,
  };
}

export function filterCheques(cheques = [], { query = "", type = "all", status = "all" } = {}) {
  const needle = query.trim().toLowerCase();
  return cheques.filter((cheque) => (type === "all" || cheque.type === type)
    && (status === "all" || cheque.status === status)
    && (!needle || [cheque.partyName, cheque.chequeNumber, cheque.bankName, cheque.notes].some((value) => String(value || "").toLowerCase().includes(needle))))
    .sort((left, right) => String(right.chequeDate).localeCompare(String(left.chequeDate)) || String(right.createdAt).localeCompare(String(left.createdAt)));
}

export function formatChequeAmount(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
