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

// Calculates row with GST, Cess, and Composition scheme considerations.
export function calculateRow(row, customSettings) {
  const settings = customSettings || getAppSettings();
  const qty = Math.max(toNumber(row.qty), 0);
  const freeQty = Math.max(toNumber(row.freeQty), 0);
  const price = Math.max(toNumber(row.price), 0);

  // If GST is disabled globally or composite scheme is active, tax collected from customer is 0
  const isTaxApplicable = settings.enableGst !== false && !settings.compositeScheme;
  const rate = isTaxApplicable ? taxPercent(row.taxRate) / 100 : 0;

  const gross = qty * price;
  const baseAmount = row.priceMode === "With Tax" && rate > 0 ? gross / (1 + rate) : gross;
  const percentDiscount = baseAmount * (Math.min(Math.max(toNumber(row.discountPercent), 0), 100) / 100);
  const fixedDiscount = Math.min(Math.max(toNumber(row.discountAmount), 0), baseAmount);
  const discount = row.discountMode === "amount" && row.discountAmount !== "" ? fixedDiscount : percentDiscount;
  const taxable = Math.max(baseAmount - discount, 0);
  const baseTax = taxable * rate;

  // Additional Cess calculation
  let cess = 0;
  if (settings.additionalCessOnItem) {
    const cessPct = Math.max(toNumber(row.cessPercent || row.cessRate), 0) / 100;
    const cessFixed = Math.max(toNumber(row.cessAmount), 0);
    cess = (taxable * cessPct) + cessFixed;
  }

  const tax = baseTax + cess;
  const amount = taxable + tax;

  return {
    qty,
    freeQty,
    totalQty: qty + freeQty,
    baseAmount,
    discount,
    taxable,
    baseTax,
    cess,
    tax,
    amount,
  };
}

// Calculates invoice totals with rounding modes, steps, additional charges, transaction-wise taxes/discounts, TCS, and TDS.
export function calculateInvoiceTotals(
  rows,
  roundOff,
  roundOffValue,
  receivedAmount,
  additionalCharges = {},
  txnDiscount = 0,
  txnTaxRate = 0,
  taxAddons = {}
) {
  const settings = getAppSettings();
  const isTaxApplicable = settings.enableGst !== false && !settings.compositeScheme;

  const totals = (rows || []).reduce(
    (sum, row) => {
      const calculated = calculateRow(row, settings);
      return {
        qty: sum.qty + calculated.qty,
        freeQty: sum.freeQty + calculated.freeQty,
        taxable: sum.taxable + calculated.taxable,
        discount: sum.discount + calculated.discount,
        baseTax: sum.baseTax + calculated.baseTax,
        cess: sum.cess + calculated.cess,
        tax: sum.tax + calculated.tax,
        amount: sum.amount + calculated.amount,
      };
    },
    { qty: 0, freeQty: 0, taxable: 0, discount: 0, baseTax: 0, cess: 0, tax: 0, amount: 0 }
  );

  // Apply Transaction-wise discount if any
  const tDiscount = Math.max(toNumber(txnDiscount), 0);
  const subTotalAfterTxnDiscount = Math.max(totals.amount - tDiscount, 0);

  // Apply Transaction-wise tax if any (only when GST enabled)
  const effectiveTxnTaxRate = isTaxApplicable ? txnTaxRate : 0;
  const tTax = effectiveTxnTaxRate > 0 ? (subTotalAfterTxnDiscount * (effectiveTxnTaxRate / 100)) : 0;
  const totalWithTxnTax = subTotalAfterTxnDiscount + tTax;

  // Additional charges sum
  const additionalChargesSum = Object.values(additionalCharges || {}).reduce(
    (sum, val) => sum + Math.max(toNumber(val), 0),
    0
  );

  const baseBeforeRound = totalWithTxnTax + additionalChargesSum;

  const manualRoundOff = roundOffValue !== "";
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
  let finalTotal = Math.max(baseBeforeRound + roundOffAmount, 0);

  // TCS (Tax Collected at Source): Adds to payable invoice total
  let tcsAmount = 0;
  if (settings.enableTcs || taxAddons.tcsEnabled) {
    if (taxAddons.tcsAmount != null && taxAddons.tcsAmount !== "") {
      tcsAmount = Math.max(toNumber(taxAddons.tcsAmount), 0);
    } else {
      const tcsRate = toNumber(taxAddons.tcsRate ?? settings.tcsRate ?? 0.1);
      tcsAmount = (finalTotal * tcsRate) / 100;
    }
    finalTotal += tcsAmount;
  }

  // TDS (Tax Deducted at Source): Deducted by customer on purchase invoice, reduces balance
  let tdsAmount = 0;
  if (settings.enableTds || taxAddons.tdsEnabled) {
    if (taxAddons.tdsAmount != null && taxAddons.tdsAmount !== "") {
      tdsAmount = Math.max(toNumber(taxAddons.tdsAmount), 0);
    } else {
      const tdsRate = toNumber(taxAddons.tdsRate ?? settings.tdsRate ?? 0.1);
      tdsAmount = (totals.taxable * tdsRate) / 100;
    }
  }

  const received = Math.max(toNumber(receivedAmount), 0);
  const balance = Math.max(finalTotal - received - tdsAmount, 0);

  return {
    ...totals,
    txnDiscount: tDiscount,
    txnTax: tTax,
    additionalChargesSum,
    roundOffAmount,
    tcsAmount,
    tdsAmount,
    finalTotal,
    received,
    balance,
  };
}
