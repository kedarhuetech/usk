import assert from "node:assert/strict";
import test from "node:test";

// Test hydration logic for database transactions into edit invoice structures
test("Database transaction object maps correctly to edit form and row fields", () => {
  // Sample database transaction returned from MySQL /api/transactions
  const dbTxn = {
    id: "txn_20261114_test102",
    transactionType: "sale",
    documentNumber: "TEST INV CNCL 102",
    invoiceNumber: "TEST INV CNCL 102",
    transactionDate: "2026-11-14",
    invoiceDate: "2026-11-14",
    partyId: "party-cash",
    partyName: "Cash Sale",
    partyPhone: "9876543210",
    billingAddress: "Shop 4, Market Road",
    shippingAddress: "Shop 4, Market Road",
    subtotal: 950,
    totalAmount: 950,
    paidAmount: 200,
    balanceAmount: 750,
    paymentMode: "Cash",
    notes: "Express delivery remarks",
    terms: "Goods once sold are non-refundable",
    items: [
      {
        id: "item_row_1",
        itemId: "prod_001",
        itemName: "Premium Basmati Rice",
        quantity: 2,
        unit: "BAG",
        unitPrice: 475,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: 5,
        hsnCode: "100630",
        totalAmount: 950,
      },
    ],
  };

  // Re-verify extraction logic
  const customer = dbTxn.form?.customer ?? dbTxn.partyName ?? dbTxn.customerName ?? "";
  const phone = dbTxn.form?.phone ?? dbTxn.partyPhone ?? dbTxn.phone ?? "";
  const invoiceNumber = dbTxn.form?.invoiceNumber ?? dbTxn.documentNumber ?? dbTxn.invoiceNumber ?? "1";
  const invoiceDate = dbTxn.form?.invoiceDate ?? dbTxn.transactionDate ?? dbTxn.invoiceDate ?? "";
  const billingAddress = dbTxn.form?.billingAddress ?? dbTxn.billingAddress ?? "";
  const notes = dbTxn.form?.description ?? dbTxn.notes ?? "";
  const terms = dbTxn.form?.terms ?? dbTxn.terms ?? "";
  const paymentType = dbTxn.form?.paymentType ?? dbTxn.paymentMode ?? "Cash";

  assert.equal(customer, "Cash Sale");
  assert.equal(phone, "9876543210");
  assert.equal(invoiceNumber, "TEST INV CNCL 102");
  assert.equal(invoiceDate, "2026-11-14");
  assert.equal(billingAddress, "Shop 4, Market Road");
  assert.equal(notes, "Express delivery remarks");
  assert.equal(terms, "Goods once sold are non-refundable");
  assert.equal(paymentType, "Cash");

  // Re-verify rows normalization
  const candidateRows = dbTxn.rows || dbTxn.items || [];
  assert.equal(candidateRows.length, 1);

  const row = candidateRows[0];
  const item = row.item || row.itemName || row.name || "";
  const qty = row.qty != null ? String(row.qty) : String(row.quantity);
  const price = row.price != null ? String(row.price) : String(row.unitPrice);
  const unit = row.unit || "PCS";
  const hsn = row.hsn || row.hsnCode || "";

  assert.equal(item, "Premium Basmati Rice");
  assert.equal(qty, "2");
  assert.equal(price, "475");
  assert.equal(unit, "BAG");
  assert.equal(hsn, "100630");

  // Totals mapping
  const received = dbTxn.totals?.received ?? dbTxn.paidAmount ?? 0;
  const roundOff = dbTxn.totals?.roundOffAmount ?? dbTxn.roundOff ?? 0;
  assert.equal(received, 200);
  assert.equal(roundOff, 0);
});
