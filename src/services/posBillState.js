function makeId() {
  return globalThis.crypto?.randomUUID?.() || `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPosDraft({ id = makeId(), now = new Date() } = {}) {
  const datePart = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return {
    id,
    invoiceNo: `POS-${datePart}-${id.slice(-6).toUpperCase()}`,
    date: now.toISOString().slice(0, 10),
    customer: "",
    customerPhone: "",
    items: [],
    paymentMode: "Cash",
    amountReceived: "",
    billDiscount: 0,
    additionalCharges: 0,
    remarks: "",
    loyaltyPointsRedeemed: 0,
  };
}

export function createPosBillSession({ bills = [], activeBillId = null } = {}) {
  const uniqueBills = [];
  const seen = new Set();
  for (const bill of bills) {
    if (!bill || typeof bill !== "object" || !bill.id || seen.has(String(bill.id))) continue;
    seen.add(String(bill.id));
    uniqueBills.push({ ...bill, id: String(bill.id), items: Array.isArray(bill.items) ? bill.items : [] });
  }
  const active = uniqueBills.some((bill) => bill.id === activeBillId)
    ? String(activeBillId)
    : uniqueBills[0]?.id || null;
  return { bills: uniqueBills, activeBillId: active };
}

export function addPosBill(session, draft = createPosDraft()) {
  if (session.bills.some((bill) => bill.id === draft.id)) return session;
  return { bills: [...session.bills, draft], activeBillId: draft.id };
}

export function updatePosBill(session, billId, updater) {
  return {
    ...session,
    bills: session.bills.map((bill) => {
      if (bill.id !== billId) return bill;
      const updated = typeof updater === "function" ? updater(bill) : { ...bill, ...updater };
      return { ...updated, id: bill.id };
    }),
  };
}

export function switchPosBill(session, billId, currentDraft) {
  if (!session.bills.some((bill) => bill.id === billId)) return session;
  const saved = updatePosBill(session, session.activeBillId, currentDraft);
  return { ...saved, activeBillId: billId };
}

export function closePosBill(session, billId) {
  const index = session.bills.findIndex((bill) => bill.id === billId);
  if (index < 0) return session;
  const bills = session.bills.filter((bill) => bill.id !== billId);
  const activeBillId = session.activeBillId !== billId
    ? session.activeBillId
    : bills[Math.max(0, index - 1)]?.id || bills[0]?.id || null;
  return { bills, activeBillId };
}
