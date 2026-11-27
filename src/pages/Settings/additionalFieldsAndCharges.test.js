import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";
import { calculateInvoiceTotals } from "../../utils/saleInvoice.js";

test("1. Additional Fields propagate into unified print document", () => {
  const company = {
    name: "Patil and Mane Pvt Ltd",
    appSettings: {
      additionalFieldsSetup: {
        firmField1: { enabled: true, name: "FSSAI Lic No", value: "11521019000123", showInPrint: true },
        txnField1: { enabled: true, name: "Vehicle Reg", value: "", showInPrint: true },
        txnField2: { enabled: true, name: "Driver", value: "", showInPrint: true },
      },
    },
  };

  const html = buildUnifiedDocumentHtml({
    company,
    txnField1: "MH-12-DE-9999",
    txnField2: "Ramesh Kumar",
    rows: [{ item: "Item 1", qty: 1, price: 100 }],
    totals: { finalTotal: 100 },
  });

  assert.ok(html.includes("FSSAI Lic No"), "Firm additional field label must be present in print");
  assert.ok(html.includes("11521019000123"), "Firm additional field value must be present in print");
  assert.ok(html.includes("Vehicle Reg"), "Txn field 1 label must be present in print");
  assert.ok(html.includes("MH-12-DE-9999"), "Txn field 1 value must be present in print");
  assert.ok(html.includes("Driver"), "Txn field 2 label must be present in print");
  assert.ok(html.includes("Ramesh Kumar"), "Txn field 2 value must be present in print");
});

test("2. Transportation Details propagate into print document", () => {
  const company = {
    name: "Patil and Mane Pvt Ltd",
    appSettings: {
      transportationDetails: {
        transporterName: "VRL Logistics",
        vehicleNumber: "MH-14-AA-1234",
      },
    },
  };

  const html = buildUnifiedDocumentHtml({
    company,
    transporterName: "VRL Logistics",
    vehicleNumber: "MH-14-AA-1234",
    rows: [{ item: "Item 1", qty: 1, price: 100 }],
    totals: { finalTotal: 100 },
  });

  assert.ok(html.includes("Transporter:"), "Transporter label must appear in metadata");
  assert.ok(html.includes("VRL Logistics"), "Transporter name must appear in metadata");
  assert.ok(html.includes("Vehicle No:"), "Vehicle No label must appear in metadata");
  assert.ok(html.includes("MH-14-AA-1234"), "Vehicle Number must appear in metadata");
});

test("3. Additional Charges calculate in totals and render in print", () => {
  const company = {
    name: "Patil and Mane Pvt Ltd",
    appSettings: {
      additionalChargesEnabled: true,
      additionalChargesSetup: {
        enabled: true,
        charges: [
          { id: "charge1", name: "Freight Charges", selected: true },
          { id: "charge2", name: "Special Packing", selected: true },
          { id: "charge3", name: "Delivery Fee", selected: true },
        ],
      },
    },
  };

  const additionalCharges = {
    shipping: 150,
    packaging: 50,
    other: 25,
  };

  const rows = [{ qty: 2, price: 500, priceMode: "Without Tax", taxRate: "NONE" }];
  const totals = calculateInvoiceTotals(rows, false, 0, 0, additionalCharges);

  // 1000 + 150 + 50 + 25 = 1225
  assert.equal(totals.finalTotal, 1225);

  const html = buildUnifiedDocumentHtml({
    company,
    additionalCharges,
    rows,
    totals,
  });

  assert.ok(html.includes("Freight Charges"), "Custom Charge 1 name must render");
  assert.ok(html.includes("Special Packing"), "Custom Charge 2 name must render");
  assert.ok(html.includes("Delivery Fee"), "Custom Charge 3 name must render");
});
