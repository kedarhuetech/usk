// Tests Tally field mapping, validation, and duplicate detection rules.
import test from "node:test";
import assert from "node:assert/strict";
import { mapAndValidateTallyRecords, markStoredDuplicates } from "./tallyImportValidation.js";

test("maps customer ledger balances and contact fields into the supported party model", () => {
  // Negative Tally balance becomes a positive amount payable to the party.
  const [record] = mapAndValidateTallyRecords([{
    type: "LEDGER",
    name: "Northwind Stores",
    parent: "Sundry Debtors",
    raw: { phone: "9876543210", email: "accounts@example.test", gstin: "27ABCDE1234F1Z5", state: "Maharashtra", address: "Pune", openingBalance: "-1250.50", hasTallyIdentifier: true },
  }]);
  assert.equal(record.status, "ready");
  // Check the canonical fields exactly as the database adapter will receive them.
  assert.deepEqual(record.party, {
    partyName: "Northwind Stores",
    partyType: "customer",
    group: "Sundry Debtors",
    gstin: "27ABCDE1234F1Z5",
    gstType: "Registered - Regular",
    phone: "9876543210",
    email: "accounts@example.test",
    state: "Maharashtra",
    billingAddress: "Pune",
    openingBalance: "1250.5",
    openingBalanceType: "to-pay",
  });
  assert.match(record.warnings.join(" "), /USV creates its own ID/);
});

test("maps stock item unit, HSN, code, and only a matching opening quantity", () => {
  // Matching item units allow the Tally opening quantity to be kept.
  const [record] = mapAndValidateTallyRecords([{
    type: "STOCKITEM",
    name: "Steel Bolt",
    parent: "Fasteners",
    raw: { unit: "Nos", hsn: "73181500", code: "B-01", openingQuantity: "12 Nos", hasTax: true },
  }]);
  assert.equal(record.status, "ready");
  assert.equal(record.item.itemCode, "B-01");
  assert.equal(record.item.unit, "Nos");
  assert.equal(record.item.hsn, "73181500");
  assert.equal(record.item.openingQuantity, "12");
  assert.match(record.warnings.join(" "), /GST\/tax details are not mapped/);

  // A different unit must not be converted or saved as an opening quantity.
  const [unsafe] = mapAndValidateTallyRecords([{
    type: "STOCKITEM", name: "Mixed Unit", parent: "Fasteners",
    raw: { unit: "Nos", openingQuantity: "12 Kg" },
  }]);
  assert.equal(unsafe.item.openingQuantity, undefined);
  assert.match(unsafe.warnings.join(" "), /could not be safely mapped/);
});

test("rejects unsupported ledger groups and missing names, and identifies repeated rows", () => {
  // Cash ledgers and nameless items cannot become supported USV records.
  const rows = mapAndValidateTallyRecords([
    { type: "LEDGER", name: "Cash Account", parent: "Cash-in-Hand", raw: {} },
    { type: "STOCKITEM", name: "", parent: "Products", raw: {} },
    { type: "STOCKITEM", name: "Bolt", parent: "Products", raw: { unit: "Nos" } },
    { type: "STOCKITEM", name: "Bolt", parent: "Products", raw: { unit: "Nos" } },
  ]);
  assert.equal(rows[0].status, "invalid");
  assert.match(rows[0].errors.join(" "), /not a supported customer\/supplier group/);
  assert.equal(rows[1].status, "invalid");
  assert.equal(rows[2].status, "ready");
  assert.match(rows[3].errors.join(" "), /Duplicate record in this file/);
});

test("treats the same GSTIN as a duplicate even when Tally uses a different ledger name", () => {
  // A matching GSTIN takes priority over a changed ledger display name.
  const rows = mapAndValidateTallyRecords([
    { type: "LEDGER", name: "Ocean Retail", parent: "Sundry Debtors", raw: { gstin: "27ABCDE1234F1Z5" } },
    { type: "LEDGER", name: "Ocean Retail Pune", parent: "Sundry Debtors", raw: { gstin: "27ABCDE1234F1Z5" } },
  ]);
  assert.equal(rows[1].status, "invalid");
  assert.match(rows[1].errors.join(" "), /Duplicate record in this file/);
});

test("marks existing matching records as duplicates without changing them", () => {
  // Existing matches are skipped rather than overwritten with imported values.
  const [party, item] = mapAndValidateTallyRecords([
    { type: "LEDGER", name: "Northwind Stores", parent: "Sundry Debtors", raw: { phone: "12345" } },
    { type: "STOCKITEM", name: "Steel Bolt", parent: "Fasteners", raw: { unit: "Nos", code: "B-01" } },
  ]);
  const checked = markStoredDuplicates([party, item], [{ partyName: "Northwind Stores", phone: "12345" }], [{ itemName: "Other", itemCode: "B-01" }]);
  assert.deepEqual(checked.map((record) => record.status), ["duplicate", "duplicate"]);
  assert.match(checked[0].warnings.join(" "), /skipped by default unless you choose to update/);
});

test("classifies Sundry Debtors as customer, Sundry Creditors as supplier, and resolves GROUP sub-groups", () => {
  const rows = mapAndValidateTallyRecords([
    {
      type: "LEDGER",
      name: "Metro Traders",
      parent: "North Debtors",
      resolvedGroup: "Sundry Debtors",
      raw: { gstin: "27AABCM1234F1Z5", pan: "AABCM1234F", gstType: "Regular", phone: "9811122233", city: "Mumbai", pincode: "400001", state: "Maharashtra", address: "Andheri East", openingBalance: "5000 Dr", creditLimit: "50000" },
    },
    {
      type: "LEDGER",
      name: "Apex Suppliers",
      parent: "Sundry Creditors",
      resolvedGroup: "Sundry Creditors",
      raw: { gstin: "29AABCA5678G1Z2", phone: "9822233344", state: "Karnataka", openingBalance: "12000 Cr" },
    },
  ]);

  assert.equal(rows[0].status, "ready");
  assert.equal(rows[0].partyType, "customer");
  assert.equal(rows[0].party.partyType, "customer");
  assert.equal(rows[0].party.pan, "AABCM1234F");
  assert.equal(rows[0].party.gstType, "Registered - Regular");
  assert.equal(rows[0].party.billingCity, "Mumbai");
  assert.equal(rows[0].party.billingPincode, "400001");
  assert.equal(rows[0].party.openingBalanceType, "to-receive");

  assert.equal(rows[1].status, "ready");
  assert.equal(rows[1].partyType, "supplier");
  assert.equal(rows[1].party.partyType, "supplier");
  assert.equal(rows[1].party.openingBalanceType, "to-pay");
});

test("maps stock item GST rate, opening rate, sale price, and Unicode names safely", () => {
  const [item] = mapAndValidateTallyRecords([
    {
      type: "STOCKITEM",
      name: "तांबा तार (Copper Wire)",
      parent: "Electrical",
      raw: {
        unit: "Mtr",
        code: "CW-99",
        hsn: "740811",
        gstRate: "18",
        taxability: "Taxable",
        openingQuantity: "25 Mtr",
        openingRate: "120.50/Mtr",
        salePrice: "160",
      },
    },
  ]);

  assert.equal(item.status, "ready");
  assert.equal(item.item.itemName, "तांबा तार (Copper Wire)");
  assert.equal(item.item.taxRate, "GST 18%");
  assert.equal(item.item.purchasePrice, "120.5");
  assert.equal(item.item.salePrice, "160");
  assert.equal(item.item.openingQuantity, "25");
});
