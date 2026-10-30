function nonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function calculatePosBill(draft = {}) {
  let subtotal = 0;
  let itemDiscount = 0;
  let tax = 0;

  const lines = (Array.isArray(draft.items) ? draft.items : []).map((item) => {
    const parsedQty = Number(item.qty);
    const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 0;
    const price = nonNegativeNumber(item.price);
    const discount = Math.min(price * qty, nonNegativeNumber(item.discount));
    const taxable = Math.max(0, price * qty - discount);
    const taxRate = nonNegativeNumber(item.taxRate);
    const itemTax = taxable * taxRate / 100;
    const total = taxable + itemTax;
    subtotal += price * qty;
    itemDiscount += discount;
    tax += itemTax;
    return { ...item, qty, price, discount, taxable, taxRate, itemTax, total };
  });

  const discountableTotal = Math.max(0, subtotal - itemDiscount + tax);
  const billDiscount = Math.min(discountableTotal, nonNegativeNumber(draft.billDiscount));
  const loyaltyDiscount = Math.min(
    Math.max(0, discountableTotal - billDiscount),
    nonNegativeNumber(draft.loyaltyPointsRedeemed),
  );
  const charges = nonNegativeNumber(draft.additionalCharges);
  const total = Math.round(Math.max(0, discountableTotal - billDiscount - loyaltyDiscount + charges) * 100) / 100;
  const defaultReceived = String(draft.paymentMode || "").toLowerCase() === "credit" ? 0 : total;
  const parsedReceived = draft.amountReceived === "" || draft.amountReceived == null
    ? defaultReceived
    : Number(draft.amountReceived);
  const received = Number.isFinite(parsedReceived) ? Math.max(0, parsedReceived) : 0;

  return {
    lines,
    subtotal,
    itemDiscount,
    tax,
    billDiscount,
    loyaltyDiscount,
    charges,
    total,
    received,
    change: Math.max(0, received - total),
    due: Math.max(0, total - received),
  };
}
