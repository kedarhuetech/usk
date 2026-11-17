import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Isolated unit tests for Sale Order and Purchase Order backend routing and data mapping logic
 */

function getPartyBalanceImpact(type, balAmt, pdAmt) {
  const normType = String(type || "").toLowerCase();
  if (normType === "sale" || normType === "pos") {
    return Number(balAmt) || 0;
  }
  if (normType === "payment_in") {
    return -(Number(pdAmt) || 0);
  }
  if (normType === "purchase") {
    return -(Number(balAmt) || 0);
  }
  if (normType === "payment_out") {
    return Number(pdAmt) || 0;
  }
  return 0;
}

test("Backend Orders: Orders carry zero party balance impact", () => {
  // Sale Orders do NOT impact customer balance until converted to an invoice
  assert.equal(getPartyBalanceImpact("sale_order", 1500, 0), 0);
  assert.equal(getPartyBalanceImpact("SALE_ORDER", 2500, 500), 0);

  // Purchase Orders do NOT impact supplier balance until converted to a bill
  assert.equal(getPartyBalanceImpact("purchase_order", 3000, 0), 0);
  assert.equal(getPartyBalanceImpact("PURCHASE_ORDER", 4500, 1000), 0);
});

test("Backend Orders: Stock delta is strictly 0 for orders until converted", () => {
  function getStockDelta(transactionType, quantity, freeQty) {
    let stockDelta = 0;
    if (transactionType === "sale" || transactionType === "pos" || transactionType === "delivery_challan") {
      stockDelta = -(quantity + freeQty);
    } else if (transactionType === "purchase" || transactionType === "sale_return") {
      stockDelta = (quantity + freeQty);
    }
    return stockDelta;
  }

  assert.equal(getStockDelta("sale_order", 10, 2), 0, "Sale Order must not deduct physical stock");
  assert.equal(getStockDelta("purchase_order", 20, 5), 0, "Purchase Order must not increase physical stock");
});

test("Backend Orders: Party name resolution correctly identifies customer and supplier", () => {
  function resolvePartyName(body, transactionType) {
    return (body.partyName || body.party || body.customerName || body.customer || body.supplierName || body.supplier || body.form?.customer || body.form?.supplier || body.form?.partyName || body.form?.party || "").trim() ||
      ((body.paymentMode === "Cash" || body.paymentType === "Cash" || body.form?.paymentType === "Cash" || transactionType === "pos") ? "Cash Sale" : null);
  }

  // Sale Order with customer
  const soBody = { customer: "Anand Traders", phone: "9876543210" };
  assert.equal(resolvePartyName(soBody, "sale_order"), "Anand Traders");

  // Purchase Order with supplier
  const poBody = { supplier: "Bharat Heavy Goods", phone: "9123456780" };
  assert.equal(resolvePartyName(poBody, "purchase_order"), "Bharat Heavy Goods");

  // Purchase Order with form.supplier
  const poFormBody = { form: { supplier: "National Distributors" } };
  assert.equal(resolvePartyName(poFormBody, "purchase_order"), "National Distributors");
});

test("Backend Orders: Round off value parses cleanly without NaN from boolean flag", () => {
  function parseRoundOff(body) {
    return parseFloat(body.roundOffValue ?? (typeof body.roundOff === 'number' ? body.roundOff : null) ?? body.round_off ?? body.totals?.roundOffAmount ?? 0) || 0;
  }

  // Boolean flag with explicit roundOffValue string
  assert.equal(parseRoundOff({ roundOff: true, roundOffValue: "-0.40" }), -0.40);
  assert.equal(parseRoundOff({ roundOff: true, roundOffValue: "0.25" }), 0.25);
  // Numeric roundOff
  assert.equal(parseRoundOff({ roundOff: 0.50 }), 0.50);
  // Default when absent
  assert.equal(parseRoundOff({ roundOff: true }), 0);
});

test("Backend Orders: Line items normalization preserves item, size, description, discount, and tax", () => {
  const rawRows = [
    {
      item: "Cotton Shirt",
      size: "XL",
      description: "Blue color, long sleeve",
      qty: "5",
      price: "1200",
      discount: "10",
      tax: "18",
      cess: "20",
    },
    {
      itemName: "Raw Fabric Roll",
      itemCode: "FAB-01",
      quantity: 2,
      unitPrice: 5000,
      discountPercent: 5,
      taxRate: 5,
    }
  ];

  const normalized = rawRows.map((item, idx) => {
    const itemName = (item.item || item.itemName || item.name || "Item").trim();
    const itemCode = item.itemCode || item.code || item.size || item.item_code || null;
    const serialNo = Array.isArray(item.serialNumbers)
      ? item.serialNumbers.join(",")
      : (item.serialNo || item.serial || item.description || null);
    const quantity = parseFloat(item.qty ?? item.quantity ?? 1) || 1;
    const unitPrice = parseFloat(item.price ?? item.unitPrice ?? item.rate ?? 0) || 0;
    const itemDiscountPercent = parseFloat(item.discountPercent ?? item.discount_percent ?? (item.discountMode !== "amount" && item.discountType !== "amount" ? item.discount : 0) ?? 0) || 0;
    const itemTaxRate = parseFloat(item.taxRate ?? item.tax_rate ?? (item.tax && item.tax !== "NONE" ? String(item.tax).replace(/[^0-9.]/g, "") : 0) ?? 0) || 0;
    const cessAmount = parseFloat(item.cessAmount ?? item.cess ?? 0) || 0;

    return {
      itemName,
      itemCode,
      serialNo,
      quantity,
      unitPrice,
      itemDiscountPercent,
      itemTaxRate,
      cessAmount,
    };
  });

  assert.equal(normalized[0].itemName, "Cotton Shirt");
  assert.equal(normalized[0].itemCode, "XL", "Size should be mapped to itemCode");
  assert.equal(normalized[0].serialNo, "Blue color, long sleeve", "Description should be mapped to serialNo");
  assert.equal(normalized[0].quantity, 5);
  assert.equal(normalized[0].unitPrice, 1200);
  assert.equal(normalized[0].itemDiscountPercent, 10);
  assert.equal(normalized[0].itemTaxRate, 18);
  assert.equal(normalized[0].cessAmount, 20);

  assert.equal(normalized[1].itemName, "Raw Fabric Roll");
  assert.equal(normalized[1].itemCode, "FAB-01");
  assert.equal(normalized[1].quantity, 2);
  assert.equal(normalized[1].unitPrice, 5000);
  assert.equal(normalized[1].itemDiscountPercent, 5);
  assert.equal(normalized[1].itemTaxRate, 5);
});
