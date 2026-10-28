const PURCHASE_BILLS_KEY = "ledgerly:purchaseBills.v1";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readBills() {
  if (!canUseStorage()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(PURCHASE_BILLS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeBill(bill = {}) {
  const timestamp = bill.createdAt || new Date().toISOString();
  const id = bill.id || bill.invoiceId || `purchase-${crypto.randomUUID()}`;
  return {
    ...bill,
    id,
    invoiceId: bill.invoiceId || id,
    transactionType: "purchase",
    createdAt: timestamp,
    updatedAt: bill.updatedAt || timestamp,
  };
}

export function getPurchaseBills() {
  return readBills().map(normalizeBill);
}

export function savePurchaseBill(value) {
  const bill = normalizeBill({ ...value, updatedAt: new Date().toISOString() });
  const next = [bill, ...readBills().filter((entry) => entry.id !== bill.id && entry.invoiceId !== bill.invoiceId)];
  if (canUseStorage()) window.localStorage.setItem(PURCHASE_BILLS_KEY, JSON.stringify(next));
  return bill;
}

export const purchaseBillsStorageKey = PURCHASE_BILLS_KEY;
