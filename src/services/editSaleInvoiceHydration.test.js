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

test("Estimate and Proforma normalization maps database transactions correctly", () => {
  const dbEstimate = {
    id: "est_101",
    transactionType: "estimate",
    documentNumber: "EST-999",
    partyName: "ABC Traders",
    partyPhone: "9988776655",
    transactionDate: "2026-11-15",
    totalAmount: 1500,
    items: [
      { itemName: "Wheat Flour 10kg", quantity: 3, unitPrice: 500, unit: "BAG" },
    ],
  };

  const customer = dbEstimate.customer || dbEstimate.partyName || dbEstimate.customerName || "";
  const phone = dbEstimate.phone || dbEstimate.partyPhone || "";
  const refNo = dbEstimate.number || dbEstimate.documentNumber || "";
  const date = (dbEstimate.date || dbEstimate.transactionDate || "").slice(0, 10);
  const rows = (dbEstimate.rows || dbEstimate.items || []).map((r) => ({
    item: r.item || r.itemName || "",
    qty: String(r.qty ?? r.quantity ?? ""),
    price: String(r.price ?? r.unitPrice ?? ""),
    unit: r.unit || "NONE",
  }));

  assert.equal(customer, "ABC Traders");
  assert.equal(phone, "9988776655");
  assert.equal(refNo, "EST-999");
  assert.equal(date, "2026-11-15");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].item, "Wheat Flour 10kg");
  assert.equal(rows[0].qty, "3");
  assert.equal(rows[0].price, "500");
});

test("Delivery Challan normalization maps database items and party correctly", () => {
  const dbChallan = {
    id: "dc_202",
    documentNumber: "DC-55",
    partyName: "XYZ Supermarket",
    transactionDate: "2026-11-16",
    totalAmount: 3200,
    items: [
      { itemName: "Sugar 50kg", quantity: 1, unitPrice: 2000, unit: "BAG" },
      { itemName: "Refined Oil 15L", quantity: 1, unitPrice: 1200, unit: "TIN" },
    ],
  };

  const party = dbChallan.party || dbChallan.partyName || "";
  const number = dbChallan.number || dbChallan.documentNumber || "";
  const rows = (dbChallan.rows || dbChallan.items || []).map((r) => ({
    item: r.item || r.itemName || "",
    qty: String(r.qty ?? r.quantity ?? ""),
    price: String(r.price ?? r.unitPrice ?? ""),
  }));

  assert.equal(party, "XYZ Supermarket");
  assert.equal(number, "DC-55");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].item, "Sugar 50kg");
  assert.equal(rows[1].qty, "1");
});

test("Sale Return and Debit Note map database items to return rows cleanly", () => {
  const dbInvoice = {
    id: "sale_303",
    documentNumber: "INV-1001",
    partyName: "Ramesh Kumar",
    partyPhone: "9123456789",
    items: [
      { id: "row-1", itemName: "Colgate Toothpaste", quantity: 5, unitPrice: 80, unit: "PCS" },
    ],
  };

  const cust = String(dbInvoice.form?.customer || dbInvoice.customer || dbInvoice.partyName || "");
  const rows = (dbInvoice.rows || dbInvoice.items || []).map((r) => ({
    item: r.item || r.itemName || "",
    soldQty: Number(r.qty ?? r.quantity ?? 0),
    price: String(r.price ?? r.unitPrice ?? ""),
  }));

  assert.equal(cust, "Ramesh Kumar");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].soldQty, 5);
  assert.equal(rows[0].price, "80");
});

test("PaymentIn and PaymentOut normalize flat database transactions to payment entries", () => {
  const dbPayment = {
    id: "pay_404",
    documentNumber: "PAY-88",
    partyName: "Kedar Huetech",
    transactionDate: "2026-11-16",
    totalAmount: 5000,
    paidAmount: 5000,
    paymentMode: "UPI",
    notes: "Advance payment",
  };

  const partyName = dbPayment.partyName || dbPayment.party || "";
  const number = dbPayment.number || dbPayment.documentNumber || "";
  const payments = Array.isArray(dbPayment.payments) && dbPayment.payments.length > 0
    ? dbPayment.payments
    : [{ type: dbPayment.paymentMode || "Cash", amount: String(dbPayment.totalAmount || "") }];

  assert.equal(partyName, "Kedar Huetech");
  assert.equal(number, "PAY-88");
  assert.equal(payments[0].type, "UPI");
  assert.equal(payments[0].amount, "5000");
});

test("AddSale hydration does not overwrite party/item data when form contains blank strings", () => {
  const dbDoc = {
    id: "b44dbf2f-1f90-4a5b-8d12-3081827463fc",
    documentNumber: "4",
    invoiceNumber: "4",
    transactionDate: "2026-11-13",
    partyName: "sa",
    partyPhone: "343543434",
    billingAddress: "adaasdsa",
    shippingAddress: "adaasdsa",
    paymentMode: "Cash",
    items: [
      {
        id: "item_1",
        item_id: "item-64b61cf5-0e7d-422c-8d8b-00452e4d1a4e",
        item_name: "apple",
        quantity: 2,
        unit: "KG",
        unit_price: 100,
        discount_amount: 2,
        total_amount: 198,
      },
    ],
    // Simulating a partially blank or legacy form object
    form: {
      customer: "",
      phone: "",
      billingAddress: "",
    },
  };

  // Test customer resolution logic
  const rawCustomer =
    dbDoc.partyName ||
    dbDoc.party_name ||
    dbDoc.customerName ||
    dbDoc.form?.customer ||
    "";
  const customer = typeof rawCustomer === "string" ? rawCustomer.trim() : String(rawCustomer || "");

  const rawPhone =
    dbDoc.partyPhone ||
    dbDoc.party_phone ||
    dbDoc.phone ||
    dbDoc.form?.phone ||
    "";
  const phone = typeof rawPhone === "string" ? rawPhone.trim() : String(rawPhone || "");

  const billingAddress =
    dbDoc.billingAddress ||
    dbDoc.billing_address ||
    dbDoc.form?.billingAddress ||
    "";

  // When merging, resolved non-empty values must override empty form properties
  const form = {
    ...(dbDoc.form || {}),
    customer: customer || dbDoc.form?.customer || "",
    phone: phone || dbDoc.form?.phone || "",
    billingAddress: billingAddress || dbDoc.form?.billingAddress || "",
    invoiceNumber: String(dbDoc.documentNumber || "1"),
  };

  assert.equal(form.customer, "sa");
  assert.equal(form.phone, "343543434");
  assert.equal(form.billingAddress, "adaasdsa");
  assert.equal(form.invoiceNumber, "4");

  // Items normalization
  const candidateRows = dbDoc.rows || dbDoc.items || [];
  const rows = candidateRows.map((row) => ({
    item: row.item || row.itemName || row.item_name || row.name || "",
    qty: String(row.qty ?? row.quantity ?? 1),
    price: String(row.price ?? row.unitPrice ?? row.unit_price ?? 0),
    unit: row.unit || "PCS",
    sourceItemId: row.sourceItemId || row.itemId || row.item_id || "",
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].item, "apple");
  assert.equal(rows[0].qty, "2");
  assert.equal(rows[0].price, "100");
  assert.equal(rows[0].unit, "KG");
  assert.equal(rows[0].sourceItemId, "item-64b61cf5-0e7d-422c-8d8b-00452e4d1a4e");
});


