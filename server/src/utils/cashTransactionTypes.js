/**
 * Shared transaction type normalization and cash direction helpers.
 * Keeps transactionsRouter, cashBankRouter, and backupRestoreService consistent.
 */

export const CASH_OUTFLOW_TYPES = new Set([
  "purchase",
  "expense",
  "payment_out",
  "sale_return",
  "credit_note",
]);

export const CASH_INFLOW_TYPES = new Set([
  "sale",
  "pos",
  "payment_in",
  "purchase_return",
  "debit_note",
]);

/**
 * Returns true if either payment_status or status indicates a cancelled transaction.
 */
export function isCancelledStatus(paymentStatus, status) {
  return (
    String(paymentStatus || "").trim().toLowerCase() === "cancelled" ||
    String(status || "").trim().toLowerCase() === "cancelled"
  );
}

/**
 * Normalizes transaction type strings across spaces, hyphens, and underscores.
 */
export function normalizeTransactionTypeKey(rawType) {
  return String(rawType || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Returns "out" or "in" for a cash-producing transaction type.
 */
export function resolveCashEntryDirection(rawType) {
  const norm = normalizeTransactionTypeKey(rawType);
  return CASH_OUTFLOW_TYPES.has(norm) ? "out" : "in";
}

/**
 * Returns true if the transaction type is a supported cash-producing type.
 */
export function isCashProducingTransactionType(rawType) {
  const norm = normalizeTransactionTypeKey(rawType);
  return CASH_OUTFLOW_TYPES.has(norm) || CASH_INFLOW_TYPES.has(norm);
}

/**
 * Valid provenance values for cash_in_hand rows.
 */
export const CASH_PROVENANCE = Object.freeze({
  MANUAL_ADJUSTMENT: "manual_adjustment",
  TRANSACTION: "transaction",
  RESTORED_HISTORY: "restored_history",
});
