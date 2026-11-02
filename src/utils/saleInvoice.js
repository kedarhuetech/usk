import { getAppSettings } from "../services/appSettingsStorage.js";

// This helper handles number logic.
export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// This helper handles percent logic.
export function taxPercent(option = "") {
  const match = String(option || "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

// Calculates row.
export function calculateRow(row) {
  const qty = Math.max(toNumber(row.qty), 0);
  const freeQty = Math.max(toNumber(row.freeQty), 0);
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

  return { qty, freeQty, totalQty: qty + freeQty, baseAmount, discount, taxable, tax, amount };
}

// Calculates invoice totals with rounding modes, steps, additional charges, and transaction-wise taxes/discounts.
export function calculateInvoiceTotals(
  rows,
  roundOff,
  roundOffValue,
  receivedAmount,
  additionalCharges = {},
  txnDiscount = 0,
  txnTaxRate = 0
) {
  const totals = (rows || []).reduce(
    (sum, row) => {
      const calculated = calculateRow(row);
      return {
        qty: sum.qty + calculated.qty,
        freeQty: sum.freeQty + calculated.freeQty,
        taxable: sum.taxable + calculated.taxable,
        discount: sum.discount + calculated.discount,
        tax: sum.tax + calculated.tax,
        amount: sum.amount + calculated.amount,
      };
    },
    { qty: 0, freeQty: 0, taxable: 0, discount: 0, tax: 0, amount: 0 }
  );

  // Apply Transaction-wise discount if any
  const tDiscount = Math.max(toNumber(txnDiscount), 0);
  const subTotalAfterTxnDiscount = Math.max(totals.amount - tDiscount, 0);

  // Apply Transaction-wise tax if any
  const tTax = txnTaxRate > 0 ? (subTotalAfterTxnDiscount * (txnTaxRate / 100)) : 0;
  const totalWithTxnTax = subTotalAfterTxnDiscount + tTax;

  // Additional charges sum
  const additionalChargesSum = Object.values(additionalCharges || {}).reduce(
    (sum, val) => sum + Math.max(toNumber(val), 0),
    0
  );

  const baseBeforeRound = totalWithTxnTax + additionalChargesSum;

  const manualRoundOff = roundOffValue !== "";
  const settings = getAppSettings();
  const step = Number(settings.roundOffTo) || 1;
  let autoRounded = baseBeforeRound;
  if (settings.roundOffMode === "Upward") {
    autoRounded = Math.ceil(baseBeforeRound / step) * step;
  } else if (settings.roundOffMode === "Downward") {
    autoRounded = Math.floor(baseBeforeRound / step) * step;
  } else {
    autoRounded = Math.round(baseBeforeRound / step) * step;
  }
  const roundOffAmount = roundOff ? (manualRoundOff ? toNumber(roundOffValue) : autoRounded - baseBeforeRound) : 0;
  const finalTotal = Math.max(baseBeforeRound + roundOffAmount, 0);
  const received = Math.max(toNumber(receivedAmount), 0);

  return {
    ...totals,
    txnDiscount: tDiscount,
    txnTax: tTax,
    additionalChargesSum,
    roundOffAmount,
    finalTotal,
    received,
    balance: Math.max(finalTotal - received, 0),
  };
}
