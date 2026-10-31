import { getParties, saveParty } from "./partiesStorage.js";
import { getInventoryItems, saveInventoryItem } from "./itemsStorage.js";
import { getSaleInvoices, saveSaleInvoice } from "./salesStorage.js";
import { getPurchaseBills, savePurchaseBill } from "./purchaseBillsStorage.js";
import { calculateSaleReturnRow, getSaleReturns, saveSaleReturn } from "./saleReturnsStorage.js";
import { getPurchaseJobWorks, savePurchaseJobWork } from "./purchaseJobWorkStorage.js";
import { notifyBusinessDataChanged } from "./businessDataChanged.js";

const today = () => new Date().toISOString().slice(0, 10);

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage) && typeof window.localStorage.setItem === "function";
}

function readStorageList(key) {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeStorageList(key, list) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(list));
}

/**
 * Ensures safe, realistic local test records exist in the development environment
 * for all 21 transaction types when real business data is not yet present.
 *
 * Rules strictly followed:
 * - Never overwrites or deletes existing business data.
 * - Saves test records with an identifiable TEST prefix.
 * - Skips insertion if records already exist for that transaction type.
 * - Completely idempotent (no duplicates on refresh or multiple runs).
 */
export function ensureLocalTestData() {
  if (!canUseStorage()) return;

  let changesMade = false;

  // 1. Ensure realistic test customer and supplier exist in Parties master
  const parties = getParties();
  let testCustomer = parties.find((p) => String(p.partyName || p.name || "").includes("TEST Customer") || p.id === "test-cust-001");
  if (!testCustomer) {
    testCustomer = saveParty({
      id: "test-cust-001",
      partyName: "TEST Customer Pvt Ltd",
      phone: "9876543210",
      email: "billing@testcustomer.local",
      partyType: "customer",
      openingBalanceType: "to-receive",
      state: "Maharashtra",
      billingAddress: "Shop 12, Commercial Complex, Mumbai",
      openingBalance: 5000,
    });
    changesMade = true;
  }

  let testSupplier = parties.find((p) => String(p.partyName || p.name || "").includes("TEST Supplier") || p.id === "test-supp-001");
  if (!testSupplier) {
    testSupplier = saveParty({
      id: "test-supp-001",
      partyName: "TEST Supplier Mills",
      phone: "9876543211",
      email: "orders@testsuppliermills.local",
      partyType: "supplier",
      openingBalanceType: "to-pay",
      state: "Gujarat",
      billingAddress: "Plot 45, GIDC Industrial Area, Surat",
      openingBalance: 3000,
    });
    changesMade = true;
  }

  // 2. Ensure realistic test raw material and finished goods exist in Items master
  const inventory = getInventoryItems();
  let rawCottonItem = inventory.find((i) => i.id === "test-item-raw-1" || String(i.itemName || "").includes("TEST Raw Cotton"));
  if (!rawCottonItem) {
    rawCottonItem = saveInventoryItem({
      id: "test-item-raw-1",
      itemName: "TEST Raw Cotton Fabric",
      itemCode: "TRCF-101",
      type: "product",
      unit: "MTR",
      stock: "150",
      openingQuantity: "150",
      purchasePrice: "350",
      salePrice: "450",
      taxRate: "5",
    });
    changesMade = true;
  }

  let finishedShirtItem = inventory.find((i) => i.id === "test-item-fin-1" || String(i.itemName || "").includes("TEST Cotton Shirt"));
  if (!finishedShirtItem) {
    finishedShirtItem = saveInventoryItem({
      id: "test-item-fin-1",
      itemName: "TEST Cotton Shirt Finished",
      itemCode: "TCSF-202",
      type: "product",
      unit: "PCS",
      stock: "80",
      openingQuantity: "80",
      purchasePrice: "600",
      salePrice: "950",
      taxRate: "12",
    });
    changesMade = true;
  }

  // 3. Sale: Create test sales invoice if no sales invoices exist
  const sales = getSaleInvoices();
  let activeSale = sales.find((s) => !s.cancelled && s.status !== "Cancelled");
  if (!activeSale) {
    activeSale = saveSaleInvoice({
      id: "test-sale-101",
      invoiceNumber: "TEST-INV-101",
      saleType: "credit",
      transactionType: "sale",
      date: today(),
      customer: testCustomer.partyName || "TEST Customer Pvt Ltd",
      partyId: testCustomer.id,
      form: {
        invoiceNumber: "TEST-INV-101",
        invoiceDate: today(),
        customer: testCustomer.partyName || "TEST Customer Pvt Ltd",
        partyId: testCustomer.id,
        phone: testCustomer.phone || "9876543210",
        paymentType: "Credit",
      },
      rows: [
        {
          id: "test-sale-row-1",
          sourceItemId: finishedShirtItem.id,
          itemId: finishedShirtItem.id,
          item: finishedShirtItem.itemName,
          qty: 2,
          quantity: 2,
          price: "950",
          unit: "PCS",
          taxRate: "NONE",
          calculated: { taxable: 1900, tax: 0, discount: 0, amount: 1900 },
        },
      ],
      totals: {
        subtotal: 1900,
        finalTotal: 1900,
        received: 500,
        balance: 1400,
      },
      createdAt: new Date().toISOString(),
    });
    changesMade = true;
  }

  // 4. Sale (Cancelled): Ensure a cancelled sale exists
  const hasCancelledSale = sales.some((s) => s.cancelled || s.status === "Cancelled");
  if (!hasCancelledSale) {
    saveSaleInvoice({
      id: "test-sale-cncl-102",
      invoiceNumber: "TEST-INV-CNCL-102",
      saleType: "credit",
      transactionType: "sale",
      cancelled: true,
      status: "Cancelled",
      date: today(),
      customer: testCustomer.partyName || "TEST Customer Pvt Ltd",
      partyId: testCustomer.id,
      form: {
        invoiceNumber: "TEST-INV-CNCL-102",
        invoiceDate: today(),
        customer: testCustomer.partyName || "TEST Customer Pvt Ltd",
        partyId: testCustomer.id,
        phone: testCustomer.phone || "9876543210",
        paymentType: "Credit",
      },
      rows: [
        {
          id: "test-sale-row-cncl",
          sourceItemId: finishedShirtItem.id,
          itemId: finishedShirtItem.id,
          item: finishedShirtItem.itemName,
          qty: 1,
          quantity: 1,
          price: "950",
          unit: "PCS",
          taxRate: "NONE",
          calculated: { taxable: 950, tax: 0, discount: 0, amount: 950 },
        },
      ],
      totals: {
        subtotal: 950,
        finalTotal: 950,
        received: 0,
        balance: 0,
      },
      createdAt: new Date().toISOString(),
    });
    changesMade = true;
  }

  // 5. Purchase: Create test purchase bill if no purchase bills exist
  const purchases = getPurchaseBills();
  let testPurchase = purchases.find((b) => b.id === "test-purch-201" || String(b.invoiceNumber || "").includes("TEST-BILL"));
  if (!purchases.length) {
    testPurchase = savePurchaseBill({
      id: "test-purch-201",
      invoiceId: "test-purch-201",
      invoiceNumber: "TEST-BILL-201",
      transactionType: "purchase",
      date: today(),
      supplier: testSupplier.partyName || "TEST Supplier Mills",
      form: {
        invoiceNumber: "TEST-BILL-201",
        invoiceDate: today(),
        customer: testSupplier.partyName || "TEST Supplier Mills",
        paymentType: "Cash",
      },
      rows: [
        {
          id: "test-purch-row-1",
          sourceItemId: rawCottonItem.id,
          item: rawCottonItem.itemName,
          qty: 10,
          quantity: 10,
          price: "350",
          unit: "MTR",
          calculated: { amount: 3500 },
        },
      ],
      totals: {
        finalTotal: 3500,
        received: 3500,
        balance: 0,
      },
      createdAt: new Date().toISOString(),
    });
    changesMade = true;
  }

  // 6. Payment-In: Create test payment received if none exist
  const paymentIns = readStorageList("ledgerly:paymentIns.v1");
  if (!paymentIns.length) {
    writeStorageList("ledgerly:paymentIns.v1", [
      {
        id: "test-pi-301",
        number: "TEST-PI-301",
        date: today(),
        partyName: testCustomer.partyName || "TEST Customer Pvt Ltd",
        partyId: testCustomer.id,
        amount: 1500,
        received: 1500,
        paymentType: "UPI",
        status: "Settled",
        description: "TEST Payment received against sales invoice",
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 7. Payment-Out: Create test payment made if none exist
  const paymentOuts = readStorageList("ledgerly:paymentOuts.v1");
  if (!paymentOuts.length) {
    writeStorageList("ledgerly:paymentOuts.v1", [
      {
        id: "test-pout-401",
        number: "TEST-POUT-401",
        date: today(),
        partyName: testSupplier.partyName || "TEST Supplier Mills",
        partyId: testSupplier.id,
        amount: 2000,
        paymentType: "Bank Transfer",
        status: "Paid",
        description: "TEST Advance payment to raw material vendor",
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 8. Credit Note: Link to active sales invoice if none exist
  const creditNotes = getSaleReturns();
  const hasTestCreditNote = creditNotes.some((cn) => cn.number === "TEST-CN-501");
  if (!creditNotes.length && !hasTestCreditNote && activeSale) {
    const saleRow = activeSale.rows?.[0];
    if (saleRow) {
      const soldQty = Number(saleRow.qty ?? saleRow.quantity ?? 1);
      const returnRow = {
        id: "test-cn-row-1",
        sourceRowId: saleRow.id || "test-sale-row-1",
        sourceItemId: saleRow.sourceItemId || saleRow.itemId || finishedShirtItem.id,
        item: saleRow.item || finishedShirtItem.itemName,
        soldQty,
        returnedQty: 0,
        remainingQty: soldQty,
        qty: "1",
        price: String(saleRow.price ?? saleRow.unitPrice ?? "950"),
        unit: saleRow.unit || "PCS",
        priceMode: saleRow.priceMode || "Without Tax",
        discountPercent: String(saleRow.discountPercent ?? saleRow.discount ?? ""),
        discountMode: saleRow.discountMode || "percent",
        sourceDiscountAmount: saleRow.calculated?.discount ?? saleRow.discountAmount ?? 0,
        discountAmount: saleRow.discountMode === "amount" ? String(saleRow.discountAmount || saleRow.calculated?.discount || "") : "",
        taxRate: saleRow.taxRate ?? saleRow.tax ?? "NONE",
        tax: String(saleRow.tax ?? saleRow.taxRate ?? "NONE"),
        restockable: true,
      };

      const calculatedLine = calculateSaleReturnRow(returnRow);
      const total = Number((calculatedLine.amount || 0).toFixed(2));
      const received = 0;
      const adjustedAmount = 0;
      const customerCreditAmount = Number((total - received - adjustedAmount).toFixed(2));

      saveSaleReturn({
        id: "",
        number: "TEST-CN-501",
        type: "Credit Note",
        date: today(),
        party: activeSale.form?.customer || activeSale.customer || testCustomer.partyName,
        partyId: activeSale.partyId || activeSale.form?.partyId || testCustomer.id,
        invoiceId: activeSale.id,
        invoiceNumber: activeSale.invoiceNumber || activeSale.form?.invoiceNumber || "TEST-INV-101",
        invoiceDate: activeSale.form?.invoiceDate || activeSale.date || today(),
        reason: "TEST Item size replacement request",
        settlementMode: "credit",
        total,
        received,
        adjustedAmount,
        customerCreditAmount,
        balance: customerCreditAmount,
        status: "Customer Credit",
        rows: [returnRow],
        createdAt: new Date().toISOString(),
      });
      changesMade = true;
    }
  }

  // 9. Debit Note: Create test debit note linked to purchase bill if none exist
  const debitNotes = readStorageList("ledgerly:purchaseReturns.v1");
  if (!debitNotes.length) {
    writeStorageList("ledgerly:purchaseReturns.v1", [
      {
        id: "test-dn-601",
        refNo: "TEST-DN-601",
        number: "TEST-DN-601",
        type: "Debit Note",
        party: testSupplier.partyName || "TEST Supplier Mills",
        billNumber: testPurchase?.invoiceNumber || "TEST-BILL-201",
        billDate: today(),
        date: today(),
        category: "General",
        paymentType: "Cash",
        total: 700,
        received: 700,
        balance: 0,
        status: "Paid",
        description: "TEST Debit note for returning surplus fabric",
        rows: [
          {
            id: "test-dn-row-1",
            item: rawCottonItem.itemName || "TEST Raw Cotton Fabric",
            qty: "2",
            unit: "MTR",
            price: "350",
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 10. Sale Order: Create test sale order if none exist
  const saleOrders = readStorageList("ledgerly:saleOrders.v1");
  if (!saleOrders.length) {
    writeStorageList("ledgerly:saleOrders.v1", [
      {
        id: "test-so-701",
        number: "TEST-SO-701",
        customer: testCustomer.partyName || "TEST Customer Pvt Ltd",
        date: today(),
        dueDate: today(),
        amount: 4750,
        total: 4750,
        status: "Open",
        paymentType: "Credit",
        description: "TEST Formal sales order for 5 cotton shirts",
        rows: [
          {
            id: "test-so-row-1",
            item: finishedShirtItem.itemName,
            qty: 5,
            unit: "PCS",
            price: 950,
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 11. Purchase Order: Create test purchase order if none exist
  const purchaseOrders = readStorageList("ledgerly:purchaseOrders.v1");
  if (!purchaseOrders.length) {
    writeStorageList("ledgerly:purchaseOrders.v1", [
      {
        id: "test-po-801",
        number: "TEST-PO-801",
        supplier: testSupplier.partyName || "TEST Supplier Mills",
        date: today(),
        dueDate: today(),
        amount: 7000,
        total: 7000,
        status: "Open",
        paymentType: "Credit",
        description: "TEST Purchase order for 20 meters fabric",
        rows: [
          {
            id: "test-po-row-1",
            item: rawCottonItem.itemName,
            qty: 20,
            unit: "MTR",
            price: 350,
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 12. Estimate / Quotation: Create test estimate if none exist
  const estimates = readStorageList("ledgerly:estimateQuotations.v1");
  if (!estimates.length) {
    writeStorageList("ledgerly:estimateQuotations.v1", [
      {
        id: "test-est-901",
        number: "TEST-EST-901",
        customer: testCustomer.partyName || "TEST Customer Pvt Ltd",
        date: today(),
        amount: 2850,
        total: 2850,
        status: "Open",
        description: "TEST Formal quotation for bulk inquiry",
        rows: [
          {
            id: "test-est-row-1",
            item: finishedShirtItem.itemName,
            qty: 3,
            unit: "PCS",
            price: 950,
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 13. Proforma Invoice: Create test proforma invoice if none exist
  const proformas = readStorageList("ledgerly:proformaInvoices.v1");
  if (!proformas.length) {
    writeStorageList("ledgerly:proformaInvoices.v1", [
      {
        id: "test-prof-1001",
        number: "TEST-PI-1001",
        customer: testCustomer.partyName || "TEST Customer Pvt Ltd",
        date: today(),
        amount: 3800,
        total: 3800,
        status: "Open",
        description: "TEST Advance proforma invoice for corporate order",
        rows: [
          {
            id: "test-prof-row-1",
            item: finishedShirtItem.itemName,
            qty: 4,
            unit: "PCS",
            price: 950,
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 14. Delivery Challan: Create test delivery challan if none exist
  const challans = readStorageList("ledgerly:deliveryChallans.v1");
  if (!challans.length) {
    writeStorageList("ledgerly:deliveryChallans.v1", [
      {
        id: "test-dc-1101",
        number: "TEST-DC-1101",
        party: testCustomer.partyName || "TEST Customer Pvt Ltd",
        date: today(),
        amount: 1900,
        total: 1900,
        status: "Open",
        description: "TEST Material dispatch delivery challan",
        rows: [
          {
            id: "test-dc-row-1",
            item: finishedShirtItem.itemName,
            qty: 2,
            unit: "PCS",
            price: 950,
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 15. Expense: Create test expense if none exist
  const expenses = readStorageList("ledgerly:expenses.v1");
  if (!expenses.length) {
    writeStorageList("ledgerly:expenses.v1", [
      {
        id: "test-exp-1201",
        number: "TEST-EXP-1201",
        category: "Transport",
        party: "TEST City Express Logistics",
        date: today(),
        amount: 450,
        paid: 450,
        status: "Paid",
        description: "TEST Freight and cargo shipping charges",
        rows: [
          {
            id: "test-exp-row-1",
            item: "Freight Delivery Charges",
            qty: 1,
            price: 450,
          },
        ],
        payments: [{ id: "test-exp-pay-1", type: "Cash", amount: 450 }],
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 16. Party to Party (Received) & (Paid): Create test records if none exist
  const partyToParty = readStorageList("ledgerly:partyToParty.v1");
  if (!partyToParty.length) {
    writeStorageList("ledgerly:partyToParty.v1", [
      {
        id: "test-p2p-rec-1301",
        number: "TEST-P2P-1301",
        date: today(),
        direction: "received",
        party: testCustomer.partyName || "TEST Customer Pvt Ltd",
        fromParty: testCustomer.partyName || "TEST Customer Pvt Ltd",
        toParty: "Main Operating Cash",
        amount: 1200,
        total: 1200,
        received: 1200,
        status: "Transferred",
        notes: "TEST Inter-party ledger transfer received",
        createdAt: new Date().toISOString(),
      },
      {
        id: "test-p2p-paid-1302",
        number: "TEST-P2P-1302",
        date: today(),
        direction: "paid",
        party: testSupplier.partyName || "TEST Supplier Mills",
        fromParty: "Main Operating Bank",
        toParty: testSupplier.partyName || "TEST Supplier Mills",
        amount: 800,
        total: 800,
        received: 800,
        status: "Transferred",
        notes: "TEST Supplier ledger direct settlement paid",
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 17. Manufacture: Create test manufacturing record if none exist
  const manufacturing = readStorageList("ledgerly:manufacturing.v1");
  if (!manufacturing.length) {
    writeStorageList("ledgerly:manufacturing.v1", [
      {
        id: "test-mfg-1401",
        number: "TEST-MFG-1401",
        date: today(),
        productName: finishedShirtItem.itemName || "TEST Cotton Shirt Finished",
        item: finishedShirtItem.itemName || "TEST Cotton Shirt Finished",
        party: "In-House Garment Production",
        batchNo: "BATCH-2026-01",
        outputQty: 20,
        cost: 5200,
        total: 5200,
        received: 5200,
        balance: 0,
        status: "Completed",
        notes: "TEST Batch manufacturing run: 20 cotton shirts produced",
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 18. Sale FA & Purchase FA: Create test fixed asset records if none exist
  const fixedAssets = readStorageList("ledgerly:fixedAssetTransactions.v1");
  if (!fixedAssets.length) {
    writeStorageList("ledgerly:fixedAssetTransactions.v1", [
      {
        id: "test-fa-sale-1501",
        number: "TEST-FA-S1",
        date: today(),
        direction: "sale",
        type: "Sale FA",
        assetName: "TEST Office Desktop Computer",
        party: "TEST Electronics Scrap Buyer",
        total: 4500,
        amount: 4500,
        received: 4500,
        balance: 0,
        status: "Completed",
        notes: "TEST Sale of depreciated office computer",
        createdAt: new Date().toISOString(),
      },
      {
        id: "test-fa-buy-1502",
        number: "TEST-FA-B1",
        date: today(),
        direction: "purchase",
        type: "Purchase FA",
        assetName: "TEST Industrial Sewing Machine",
        party: "TEST Machinery Corp",
        total: 28000,
        amount: 28000,
        received: 28000,
        balance: 0,
        status: "Completed",
        notes: "TEST Capital asset acquisition: sewing machine",
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 19. Journal Entry: Create test journal adjustment if none exist
  const journalEntries = readStorageList("ledgerly:journalEntries.v1");
  if (!journalEntries.length) {
    writeStorageList("ledgerly:journalEntries.v1", [
      {
        id: "test-je-1601",
        number: "TEST-JE-1601",
        date: today(),
        party: "Depreciation & Machinery Adjustment",
        debitAccount: "Depreciation Expense",
        creditAccount: "Accumulated Depreciation",
        amount: 1500,
        total: 1500,
        received: 1500,
        balance: 0,
        status: "Posted",
        notes: "TEST Monthly equipment depreciation entry",
        createdAt: new Date().toISOString(),
      },
    ]);
    changesMade = true;
  }

  // 20. Purchase (Job Work): Create test job-work record if none exist
  const jobWorks = getPurchaseJobWorks();
  if (!jobWorks.length) {
    savePurchaseJobWork({
      id: "",
      number: "TEST-JW-1701",
      party: testSupplier.partyName || "TEST Supplier Mills",
      partyId: testSupplier.id,
      date: today(),
      charges: 750,
      status: "Pending",
      sentRows: [
        {
          id: "test-jw-sent-1",
          itemId: rawCottonItem.id,
          item: rawCottonItem.itemName,
          qty: 10,
        },
      ],
      receivedRows: [],
      notes: "TEST Dyeing and textile processing work",
    });
    changesMade = true;
  }

  if (changesMade) {
    notifyBusinessDataChanged();
  }
}
