export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function taxPercent(option = "") {
  const match = option.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function calculateRow(row) {
  const qty = Math.max(toNumber(row.qty), 0);
  const price = Math.max(toNumber(row.price), 0);
  const rate = taxPercent(row.taxRate) / 100;
  const gross = qty * price;
  const baseAmount = row.priceMode === "With Tax" && rate > 0 ? gross / (1 + rate) : gross;
  const percentDiscount = baseAmount * (Math.min(Math.max(toNumber(row.discountPercent), 0), 100) / 100);
  const fixedDiscount = Math.min(Math.max(toNumber(row.discountAmount), 0), baseAmount);
  const discount = row.discountMode === "amount" && row.discountAmount !== "" ? fixedDiscount : percentDiscount;
  const taxable = Math.max(baseAmount - discount, 0);
  const tax = taxable * rate;
  const amount = taxable + tax;

  return { qty, baseAmount, discount, taxable, tax, amount };
}

export function calculateInvoiceTotals(rows, roundOff, roundOffValue, receivedAmount) {
  const totals = rows.reduce(
    (sum, row) => {
      const calculated = calculateRow(row);
      return {
        qty: sum.qty + calculated.qty,
        taxable: sum.taxable + calculated.taxable,
        discount: sum.discount + calculated.discount,
        tax: sum.tax + calculated.tax,
        amount: sum.amount + calculated.amount,
      };
    },
    { qty: 0, taxable: 0, discount: 0, tax: 0, amount: 0 }
  );

  const manualRoundOff = roundOffValue !== "";
  const roundOffAmount = roundOff ? (manualRoundOff ? toNumber(roundOffValue) : Math.round(totals.amount) - totals.amount) : 0;
  const finalTotal = totals.amount + roundOffAmount;
  const received = Math.max(toNumber(receivedAmount), 0);

  return {
    ...totals,
    roundOffAmount,
    finalTotal,
    received,
    balance: Math.max(finalTotal - received, 0),
  };
}
