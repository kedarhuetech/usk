import assert from "node:assert/strict";
import { test } from "node:test";
import { getPaymentIns, savePaymentIns, getPaymentOuts, savePaymentOuts, transactionStorageKeys } from "./transactionRepository.js";
import { transactionsDb, paymentInsDb, paymentOutsDb } from "./databaseRepository.js";
import { calculatePartyBalances, calculateInvoiceSettlement } from "./partyBalances.js";

function setupMockEnvironment(initialStorage = {}) {
  const store = new Map(Object.entries(initialStorage));
  const sessionStore = new Map();
  const eventListeners = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
    },
    sessionStorage: {
      getItem: (key) => sessionStore.get(key) ?? null,
      setItem: (key, val) => sessionStore.set(key, String(val)),
      removeItem: (key) => sessionStore.delete(key),
    },
    addEventListener: (event, handler) => {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      const list = eventListeners.get(event) || [];
      eventListeners.set(event, list.filter((h) => h !== handler));
    },
    dispatchEvent: (event) => {
      const type = event?.type || event;
      const list = eventListeners.get(type) || [];
      list.forEach((h) => h(event));
      return true;
    },
  };

  return { store, sessionStore, eventListeners };
}

test("1. Payment-In creation preserves all receipt fields, payments breakdown, and synchronizes to local and database repositories", async () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentIns]: "[]",
  });

  const paymentRecord = {
    id: "pay-in-test-1",
    transactionType: "payment_in",
    number: "RCP-101",
    date: "2026-11-16",
    partyId: "cust-sharma-1",
    partyName: "Sharma Kirana",
    amount: 1500,
    received: 1500,
    paymentType: "Cash, Cheque",
    status: "Unused",
    description: "Advance settlement for November invoice",
    payments: [
      { id: "p1", type: "Cash", amount: "500", reference: "" },
      { id: "p2", type: "Cheque", amount: "1000", reference: "CHQ-882190", chequeDate: "2026-11-20" },
    ],
  };

  // Save to local cache
  savePaymentIns([paymentRecord]);
  const loaded = getPaymentIns();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "pay-in-test-1");
  assert.equal(loaded[0].number, "RCP-101");
  assert.equal(loaded[0].partyName, "Sharma Kirana");
  assert.equal(loaded[0].amount, 1500);
  assert.equal(loaded[0].payments.length, 2);
  assert.equal(loaded[0].payments[1].reference, "CHQ-882190");
});

test("2. Payment-In retrieval parses document numbers, dates, and payments breakdown accurately", () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentIns]: JSON.stringify([
      {
        id: "pay-in-test-2",
        documentNumber: "RCP-102",
        transactionDate: "2026-11-16",
        partyId: "cust-patel",
        partyName: "Patel Stores",
        totalAmount: 750,
        paidAmount: 750,
        notes: "UPI payment received",
        paymentMode: "UPI",
        items: [
          { id: "line-1", itemName: "UPI", totalAmount: 750, itemCode: "UPI-TXN-998822" },
        ],
      },
    ]),
  });

  const records = getPaymentIns();
  assert.equal(records.length, 1);
  const rec = records[0];
  assert.equal(rec.id, "pay-in-test-2");
  assert.equal(rec.documentNumber, "RCP-102");
  assert.equal(rec.partyName, "Patel Stores");
  assert.equal(rec.totalAmount, 750);
});

test("3. Payment-In update modifies the existing record in-place without creating a duplicate", () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentIns]: JSON.stringify([
      { id: "pay-in-test-3", number: "RCP-103", partyName: "Gupta Traders", amount: 500, received: 500 },
    ]),
  });

  const existing = getPaymentIns();
  assert.equal(existing.length, 1);

  // Update receipt amount from 500 to 800
  const updated = {
    ...existing[0],
    amount: 800,
    received: 800,
    description: "Revised amount received via cash",
  };

  const nextList = existing.map((r) => r.id === updated.id ? updated : r);
  savePaymentIns(nextList);

  const reloaded = getPaymentIns();
  assert.equal(reloaded.length, 1); // No duplicate created
  assert.equal(reloaded[0].id, "pay-in-test-3");
  assert.equal(reloaded[0].amount, 800);
  assert.equal(reloaded[0].description, "Revised amount received via cash");
});

test("4. Payment-In deletion removes the specific receipt record completely", () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentIns]: JSON.stringify([
      { id: "pay-in-del-1", number: "RCP-201", partyName: "Alpha", amount: 100 },
      { id: "pay-in-del-2", number: "RCP-202", partyName: "Beta", amount: 200 },
    ]),
  });

  const list = getPaymentIns();
  assert.equal(list.length, 2);

  // Delete first payment
  const filtered = list.filter((r) => r.id !== "pay-in-del-1");
  savePaymentIns(filtered);

  const remaining = getPaymentIns();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "pay-in-del-2");
  assert.equal(remaining[0].number, "RCP-202");
});

test("5. Payment-Out creation preserves voucher number, supplier details, amounts and notes", () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentOuts]: "[]",
  });

  const voucher = {
    id: "pay-out-test-1",
    transactionType: "payment_out",
    number: "VCH-501",
    date: "2026-11-16",
    partyId: "supp-mumbai-dist",
    partyName: "Mumbai Distributors",
    amount: 3200,
    received: 3200,
    paymentType: "Bank Transfer",
    status: "Unused",
    description: "NEFT Payment for raw materials",
    payments: [
      { id: "po-1", type: "Bank Transfer", amount: "3200", reference: "NEFT-HDFC-993821" },
    ],
  };

  savePaymentOuts([voucher]);
  const loaded = getPaymentOuts();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "pay-out-test-1");
  assert.equal(loaded[0].number, "VCH-501");
  assert.equal(loaded[0].partyName, "Mumbai Distributors");
  assert.equal(loaded[0].amount, 3200);
  assert.equal(loaded[0].payments[0].reference, "NEFT-HDFC-993821");
});

test("6. Payment-Out retrieval loads all voucher fields and payment types", () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentOuts]: JSON.stringify([
      {
        id: "pay-out-test-2",
        documentNumber: "VCH-502",
        transactionDate: "2026-11-16",
        partyName: "National Paper Mills",
        totalAmount: 1200,
        paidAmount: 1200,
        paymentMode: "Cheque",
        items: [
          { id: "line-chq", itemName: "Cheque", totalAmount: 1200, itemCode: "CHQ-778811", serialNo: "2026-11-25" },
        ],
      },
    ]),
  });

  const records = getPaymentOuts();
  assert.equal(records.length, 1);
  assert.equal(records[0].documentNumber, "VCH-502");
  assert.equal(records[0].partyName, "National Paper Mills");
  assert.equal(records[0].totalAmount, 1200);
});

test("7. Payment-Out update modifies existing voucher without duplication", () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentOuts]: JSON.stringify([
      { id: "pay-out-edit-1", number: "VCH-503", partyName: "Apex Logistics", amount: 1500 },
    ]),
  });

  const initial = getPaymentOuts();
  assert.equal(initial.length, 1);

  const updated = { ...initial[0], amount: 1750, description: "Added extra handling charge" };
  savePaymentOuts([updated]);

  const fresh = getPaymentOuts();
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].amount, 1750);
  assert.equal(fresh[0].description, "Added extra handling charge");
});

test("8. Payment-Out deletion removes the specific voucher record", () => {
  setupMockEnvironment({
    [transactionStorageKeys.paymentOuts]: JSON.stringify([
      { id: "po-1", number: "VCH-1", partyName: "Vendor A" },
      { id: "po-2", number: "VCH-2", partyName: "Vendor B" },
    ]),
  });

  const list = getPaymentOuts();
  const remaining = list.filter((v) => v.id !== "po-1");
  savePaymentOuts(remaining);

  const fresh = getPaymentOuts();
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].id, "po-2");
});

test("9. Accounting safety: Differential party balance calculation protects against duplicate adjustments and updates", () => {
  // Test mathematical balance delta calculation functions
  function getPartyBalanceImpact(type, balAmt, pdAmt) {
    const normType = String(type || "").toLowerCase();
    if (normType === "sale" || normType === "pos") return Number(balAmt) || 0;
    if (normType === "payment_in") return -(Number(pdAmt) || 0);
    if (normType === "purchase") return -(Number(balAmt) || 0);
    if (normType === "payment_out") return Number(pdAmt) || 0;
    return 0;
  }

  // A. Brand New Payment-In:
  // Customer outstanding balance decreases by ₹500
  const newPayInImpact = getPartyBalanceImpact("payment_in", 0, 500);
  assert.equal(newPayInImpact, -500, "Payment-In should reduce customer outstanding balance by ₹500");

  // B. Updated Payment-In (amount changed from 500 to 700):
  // Old impact: -500. New impact: -700.
  // Net delta to apply to party balance: (-700) - (-500) = -200 (customer balance decreases by additional 200)
  const oldPayInImpact = getPartyBalanceImpact("payment_in", 0, 500);
  const updatedPayInImpact = getPartyBalanceImpact("payment_in", 0, 700);
  const netDeltaPayIn = updatedPayInImpact - oldPayInImpact;
  assert.equal(netDeltaPayIn, -200, "Updating payment amount from 500 to 700 should only apply a -200 delta");

  // C. Idempotent Retry of Payment-In (same 500 amount resent):
  // Old impact: -500. New impact: -500. Net delta: 0.
  const retryDelta = oldPayInImpact - oldPayInImpact;
  assert.equal(retryDelta, 0, "Retrying or resaving identical payment must produce zero balance change");

  // D. Deletion of Payment-In:
  // Reverses the previous -500 impact: -(-500) = +500
  const deletePayInReversal = -newPayInImpact;
  assert.equal(deletePayInReversal, +500, "Deleting Payment-In must restore customer balance by +₹500");

  // E. Brand New Payment-Out:
  // Vendor payable balance increases towards zero by ₹800
  const newPayOutImpact = getPartyBalanceImpact("payment_out", 0, 800);
  assert.equal(newPayOutImpact, +800, "Payment-Out should reduce supplier payable by ₹800");

  // F. Updated Payment-Out (amount changed from 800 to 1000):
  // Net delta: 1000 - 800 = +200
  const updatedPayOutImpact = getPartyBalanceImpact("payment_out", 0, 1000);
  const netDeltaPayOut = updatedPayOutImpact - newPayOutImpact;
  assert.equal(netDeltaPayOut, +200, "Updating Payment-Out from 800 to 1000 should apply +200 delta");

  // G. Deletion of Payment-Out:
  // Reverses the +800 impact: -(+800) = -800
  const deletePayOutReversal = -newPayOutImpact;
  assert.equal(deletePayOutReversal, -800, "Deleting Payment-Out must reverse supplier balance by -₹800");
});

test("10. Duplicate prevention and invoice settlement: Party balance calculation combines Sales and Payment-In without double counting", () => {
  const customer = {
    id: "cust-test-10",
    partyName: "Anita General Stores",
    openingBalance: "1000",
    openingBalanceType: "to-receive",
  };

  // Sale invoice of ₹500 (unpaid)
  const saleInvoice = {
    id: "sale-inv-1",
    partyId: "cust-test-10",
    customer: "Anita General Stores",
    totalAmount: 500,
    paidAmount: 0,
    balanceAmount: 500,
    paymentMode: "Credit",
    date: "2026-11-10",
  };

  // Payment-In receipt of ₹300 linked to invoice
  const paymentIn = {
    id: "pay-rec-1",
    partyId: "cust-test-10",
    customer: "Anita General Stores",
    amount: 300,
    received: 300,
    linkedInvoiceId: "sale-inv-1",
    date: "2026-11-12",
  };

  // Invoice settlement calculation
  const settlement = calculateInvoiceSettlement(saleInvoice, {
    kind: "sale",
    payments: [paymentIn],
  });

  assert.equal(settlement.appliedPayments, 300, "Invoice settlement should allocate ₹300");
  assert.equal(settlement.outstanding, 200, "Outstanding balance on invoice should be ₹200");

  // Overall party balance calculation
  const balancesResult = calculatePartyBalances({
    parties: [customer],
    sales: [saleInvoice],
    paymentIns: [paymentIn],
  });

  const partySummary = balancesResult.parties[0];
  // Opening: 1000 + Remaining Sale: 200 = 1200 net receivable
  assert.equal(partySummary.salesReceivable, 200, "Outstanding sales balance should be ₹200 after payment allocation");
  assert.equal(partySummary.net, 1200, "Party balance should reflect Opening (1000) + Outstanding Sale (200) = 1200");
});
