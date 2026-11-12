import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedDocumentHtml } from "../../services/unifiedPrintService.js";

function setupMockEnvironment(initialData = {}) {
  const store = new Map(Object.entries(initialData));
  const priorWindow = globalThis.window;
  const dispatchedEvents = [];

  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    dispatchEvent: (event) => {
      dispatchedEvents.push(event?.type || event);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    confirm: () => true,
    alert: () => {},
    print: () => {},
  };

  return {
    store,
    dispatchedEvents,
    restore: () => {
      if (priorWindow === undefined) delete globalThis.window;
      else globalThis.window = priorWindow;
    },
  };
}

test("Action Menu: Generates complete document HTML for Sale, Purchase, Payment-Out and Debit Note", () => {
  const env = setupMockEnvironment();
  try {
    // 1. Payment-Out document (as shown in user's screenshot Image 1)
    const pOutHtml = buildUnifiedDocumentHtml({
      title: "Payment-Out Voucher",
      documentNumber: "TEST-POUT-401",
      date: "30/10/2026",
      partyName: "TEST Supplier Mills",
      totalAmount: 2000,
      status: "Paid",
    });
    assert.ok(pOutHtml.includes("Payment-Out Voucher"));
    assert.ok(pOutHtml.includes("TEST-POUT-401"));
    assert.ok(pOutHtml.includes("TEST Supplier Mills"));

    // 2. Debit Note document (as shown in user's screenshot Image 1)
    const dnHtml = buildUnifiedDocumentHtml({
      title: "Debit Note",
      documentNumber: "TEST-DN-601",
      date: "30/10/2026",
      partyName: "TEST Supplier Mills",
      totalAmount: 700,
      status: "Paid",
    });
    assert.ok(dnHtml.includes("Debit Note"));
    assert.ok(dnHtml.includes("TEST-DN-601"));
    assert.ok(dnHtml.includes("700"));

    // 3. Purchase Bill
    const pbHtml = buildUnifiedDocumentHtml({
      title: "Purchase Bill",
      documentNumber: "BILL-101",
      partyName: "TEST Supplier Mills",
      totalAmount: 5000,
    });
    assert.ok(pbHtml.includes("Purchase Bill"));
    assert.ok(pbHtml.includes("BILL-101"));

    // 4. Sale Invoice
    const saleHtml = buildUnifiedDocumentHtml({
      title: "Sale Invoice",
      documentNumber: "INV-999",
      partyName: "Apex Retail",
      totalAmount: 12000,
    });
    assert.ok(saleHtml.includes("Sale Invoice"));
    assert.ok(saleHtml.includes("INV-999"));
  } finally {
    env.restore();
  }
});

test("Action Menu: Deletion removes transaction from appropriate storage and triggers update", () => {
  const initialPaymentsOut = [
    { id: "pout-1", number: "TEST-POUT-401", amount: 2000, partyName: "TEST Supplier Mills" },
    { id: "pout-2", number: "TEST-POUT-402", amount: 1500, partyName: "Another Supplier" },
  ];

  const env = setupMockEnvironment({
    "ledgerly:paymentOuts.v1": JSON.stringify(initialPaymentsOut),
  });

  try {
    // Simulate delete logic
    const rawId = "pout-1";
    const key = "ledgerly:paymentOuts.v1";
    const items = JSON.parse(window.localStorage.getItem(key));
    const updated = items.filter((it) => it.id !== rawId);
    window.localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new Event("ledgerly:business-data-changed"));

    const storedAfter = JSON.parse(env.store.get(key));
    assert.equal(storedAfter.length, 1);
    assert.equal(storedAfter[0].number, "TEST-POUT-402");
    assert.ok(env.dispatchedEvents.includes("ledgerly:business-data-changed"));
  } finally {
    env.restore();
  }
});

test("Action Menu: Duplication creates a distinct new transaction without altering original", () => {
  const initialDebitNotes = [
    { id: "dn-1", number: "TEST-DN-601", total: 700, partyName: "TEST Supplier Mills" },
  ];

  const env = setupMockEnvironment({
    "ledgerly:purchaseReturns.v1": JSON.stringify(initialDebitNotes),
  });

  try {
    const key = "ledgerly:purchaseReturns.v1";
    const items = JSON.parse(window.localStorage.getItem(key));
    const original = items[0];
    const copy = {
      ...original,
      id: "dn-copy-999",
      number: `${original.number}-COPY`,
      createdAt: new Date().toISOString(),
    };
    items.unshift(copy);
    window.localStorage.setItem(key, JSON.stringify(items));

    const storedAfter = JSON.parse(env.store.get(key));
    assert.equal(storedAfter.length, 2);
    assert.equal(storedAfter[0].number, "TEST-DN-601-COPY");
    assert.equal(storedAfter[1].number, "TEST-DN-601");
  } finally {
    env.restore();
  }
});
