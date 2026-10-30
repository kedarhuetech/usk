const transactionTypes = [
  "All Transaction", "Sale", "Purchase", "Payment-In", "Payment-Out", "Credit Note", "Debit Note",
  "Sale Order", "Purchase Order", "Estimate", "Proforma Invoice", "Delivery Challan", "Expense",
  "Party to Party (Received)", "Party to Party (Paid)", "Manufacture", "Sale FA", "Purchase FA",
  "Sale (Cancelled)", "Journal Entry", "Purchase (Job Work)",
];
export { transactionTypes };

function readList(key) {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const raw = window.localStorage.getItem(key);
  if (raw == null) return [];
  let rows;
  try { rows = JSON.parse(raw); }
  catch (error) { throw new Error(`Saved transaction data (${key}) is corrupted: ${error.message}`, { cause: error }); }
  if (!Array.isArray(rows)) throw new Error(`Saved transaction data (${key}) must be a list.`);
  return rows;
}

function toISODate(value) {
  if (!value) return "";
  const text = String(value).trim();
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const dot = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dot) return `${dot[3]}-${dot[2].padStart(2, "0")}-${dot[1].padStart(2, "0")}`;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return "";
}

export function getAllLocalTransactions() {
  let saleInvoiceUi = {};
  try {
    const rawUi = window.localStorage?.getItem("ledgerly:saleInvoiceUiActions.v1");
    if (rawUi) saleInvoiceUi = JSON.parse(rawUi) || {};
  } catch {}

  const map = (key, type, convert = (record) => record) => readList(key).map((source, index) => {
    const record = convert(source);
    const total = Number(record.total ?? record.totals?.finalTotal ?? record.totals?.grandTotal ?? record.totalAmount ?? record.amount ?? 0);
    const received = Number(record.received ?? record.totals?.received ?? record.receivedAmount ?? record.paidAmount ?? 0);
    return {
      id: record.id || record.invoiceId || `${type}:${record.number || record.invoiceNumber || record.createdAt || index}`,
      type: record.type || type,
      date: toISODate(record.date || record.form?.invoiceDate || record.invoiceDate || record.billDate || record.createdAt),
      number: record.number || record.refNo || record.returnNo || record.form?.invoiceNumber || record.invoiceNumber || record.billNumber || "—",
      party: record.party || record.partyName || record.customer || record.supplier || record.form?.customer || record.paidTo || "—",
      total,
      received,
      balance: Number(record.balance ?? record.customerCreditAmount ?? Math.max(0, total - received - Number(record.adjustedAmount || 0))),
      status: record.status || (record.cancelled ? "Cancelled" : "Saved"),
      firm: record.firm || record.companyName || record.businessName || "",
      user: record.user || record.createdBy || "",
      sourceKey: key,
      raw: record,
    };
  });

  const saleInvoices = map("ledgerly:saleInvoices.v1", "Sale", (record) => {
    const isCancelled = Boolean(
      record.cancelled || record.isCancelled || record.status === "Cancelled" || saleInvoiceUi.cancelled?.[record.id]
    );
    const total = Number(record.totals?.finalTotal ?? record.totals?.grandTotal ?? record.total ?? 0);
    const isCash = record.saleType === "cash" || record.form?.paymentType === "Cash";
    const received = Number(record.totals?.received ?? record.receivedAmount ?? (isCash ? total : 0));
    const balance = isCancelled ? 0 : Math.max(0, total - received - Number(record.creditNoteAppliedAmount || 0));
    const status = isCancelled
      ? "Cancelled"
      : record.status || (balance === 0 && total > 0 ? "Paid" : received > 0 ? "Partial" : "Unpaid");
    return {
      ...record,
      type: isCancelled ? "Sale (Cancelled)" : "Sale",
      number: record.form?.invoiceNumber || record.invoiceNumber || record.id || "—",
      party: record.form?.customer || record.customer || record.partyName || record.party || "Cash Sale",
      total,
      received,
      balance,
      status,
    };
  });

  const purchaseBills = map("ledgerly:purchaseBills.v1", "Purchase", (record) => {
    const isCancelled = Boolean(record.cancelled || record.status === "Cancelled");
    const total = Number(record.totals?.finalTotal ?? record.totals?.grandTotal ?? record.totalAmount ?? record.total ?? 0);
    const isCash = record.form?.paymentType === "Cash" || record.paymentType === "Cash";
    const received = Number(record.totals?.received ?? record.paidAmount ?? (isCash ? total : 0));
    const balance = isCancelled ? 0 : Math.max(0, total - received);
    const status = isCancelled
      ? "Cancelled"
      : record.status || (balance === 0 && total > 0 ? "Paid" : received > 0 ? "Partial" : "Unpaid");
    return {
      ...record,
      type: "Purchase",
      number: record.form?.invoiceNumber || record.invoiceNumber || record.billNumber || record.number || "—",
      party: record.form?.customer || record.supplier || record.partyName || record.party || record.customer || "Cash Purchase",
      total,
      received,
      balance,
      status,
    };
  });

  const paymentIns = map("ledgerly:paymentIns.v1", "Payment-In", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    return {
      ...record,
      type: "Payment-In",
      number: record.number || record.refNo || "—",
      party: record.partyName || record.customer || record.party || "—",
      total,
      received: total,
      balance: 0,
      status: record.status || "Settled",
    };
  });

  const paymentOuts = map("ledgerly:paymentOuts.v1", "Payment-Out", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    return {
      ...record,
      type: "Payment-Out",
      number: record.number || record.refNo || "—",
      party: record.partyName || record.supplier || record.party || "—",
      total,
      received: total,
      balance: 0,
      status: record.status || "Paid",
    };
  });

  const creditNotes = map("ledgerly:saleReturns.v1", "Credit Note", (record) => {
    const total = Number(record.total ?? record.totals?.finalTotal ?? 0);
    const received = Number(record.received || 0);
    const adjustedAmount = Number(record.adjustedAmount || 0);
    const balance = Number(record.customerCreditAmount ?? record.balance ?? Math.max(0, total - received - adjustedAmount));
    const isCancelled = Boolean(record.cancelled || record.status === "Cancelled");
    return {
      ...record,
      type: "Credit Note",
      number: record.number || record.returnNo || record.refNo || "—",
      party: record.party || record.customer || record.partyName || "—",
      total,
      received,
      balance,
      status: isCancelled ? "Cancelled" : record.status || (received >= total && total > 0 ? "Refunded" : adjustedAmount >= total && total > 0 ? "Adjusted" : "Customer Credit"),
    };
  });

  const debitNotes = [
    ...map("ledgerly:purchaseReturns.v1", "Debit Note", (record) => {
      const total = Number(record.total ?? record.totals?.finalTotal ?? record.amount ?? 0);
      const received = Number(record.received ?? total);
      const balance = Number(record.balance ?? Math.max(0, total - received));
      return {
        ...record,
        type: "Debit Note",
        number: record.refNo || record.returnNo || record.number || "—",
        party: record.party || record.supplier || record.partyName || "—",
        total,
        received,
        balance,
        status: record.status || (balance <= 0 ? "Paid" : "Unpaid"),
      };
    }),
    ...map("ledgerly:purchaseReturnsDebitNotes.v1", "Debit Note", (record) => {
      const total = Number(record.total ?? record.totals?.finalTotal ?? record.amount ?? 0);
      const received = Number(record.received ?? total);
      const balance = Number(record.balance ?? Math.max(0, total - received));
      return {
        ...record,
        type: "Debit Note",
        number: record.refNo || record.returnNo || record.number || "—",
        party: record.party || record.supplier || record.partyName || "—",
        total,
        received,
        balance,
        status: record.status || (balance <= 0 ? "Paid" : "Unpaid"),
      };
    }),
  ];

  const saleOrders = map("ledgerly:saleOrders.v1", "Sale Order", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    const isConverted = record.status === "Converted to Sale";
    return {
      ...record,
      type: "Sale Order",
      number: record.number || record.refNo || "—",
      party: record.customer || record.party || record.partyName || "—",
      total,
      received: isConverted ? total : Number(record.received || 0),
      balance: isConverted ? 0 : Number(record.balance ?? total),
      status: record.status || "Open",
    };
  });

  const purchaseOrders = map("ledgerly:purchaseOrders.v1", "Purchase Order", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    const isConverted = record.status === "Converted to Purchase";
    return {
      ...record,
      type: "Purchase Order",
      number: record.number || record.refNo || "—",
      party: record.supplier || record.party || record.partyName || record.customer || "—",
      total,
      received: isConverted ? total : Number(record.received || 0),
      balance: isConverted ? 0 : Number(record.balance ?? total),
      status: record.status || "Open",
    };
  });

  const estimates = map("ledgerly:estimateQuotations.v1", "Estimate", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    const isConverted = String(record.status || "").startsWith("Converted");
    return {
      ...record,
      type: "Estimate",
      number: record.number || record.refNo || "—",
      party: record.customer || record.party || record.partyName || "—",
      total,
      received: 0,
      balance: isConverted ? 0 : total,
      status: record.status || "Open",
    };
  });

  const proformaInvoices = map("ledgerly:proformaInvoices.v1", "Proforma Invoice", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    const isConverted = String(record.status || "").startsWith("Converted");
    return {
      ...record,
      type: "Proforma Invoice",
      number: record.number || record.refNo || "—",
      party: record.customer || record.party || record.partyName || "—",
      total,
      received: 0,
      balance: isConverted ? 0 : total,
      status: record.status || "Open",
    };
  });

  const deliveryChallans = map("ledgerly:deliveryChallans.v1", "Delivery Challan", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    const isConverted = record.status === "Converted to Sale";
    return {
      ...record,
      type: "Delivery Challan",
      number: record.number || record.refNo || "—",
      party: record.party || record.customer || record.partyName || "—",
      total,
      received: 0,
      balance: isConverted ? 0 : total,
      status: record.status || "Open",
    };
  });

  const expenses = map("ledgerly:expenses.v1", "Expense", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    const paid = Number(record.paid ?? total);
    return {
      ...record,
      type: "Expense",
      number: record.number || record.expenseNo || record.refNo || "—",
      party: record.party || record.partyName || record.paidTo || record.category || "Expense",
      total,
      received: paid,
      balance: Math.max(0, total - paid),
      status: record.status || (paid >= total ? "Paid" : "Unpaid"),
    };
  });

  const partyToParty = map("ledgerly:partyToParty.v1", "Party to Party (Received)", (record) => {
    const isPaid = /paid|out|payment-out/i.test(String(record.direction || record.type || ""));
    const total = Number(record.amount ?? record.total ?? 0);
    return {
      ...record,
      type: isPaid ? "Party to Party (Paid)" : "Party to Party (Received)",
      number: record.number || record.refNo || "—",
      party: record.party || record.partyName || record.customer || record.fromParty || record.toParty || "—",
      total,
      received: total,
      balance: 0,
      status: record.status || "Transferred",
    };
  });

  const manufacturing = map("ledgerly:manufacturing.v1", "Manufacture", (record) => {
    const total = Number(record.cost ?? record.total ?? record.amount ?? 0);
    return {
      ...record,
      type: "Manufacture",
      number: record.number || record.refNo || record.batchNo || "—",
      party: record.productName || record.item || record.party || "In-House Production",
      total,
      received: total,
      balance: 0,
      status: record.status || "Completed",
    };
  });

  const fixedAssets = map("ledgerly:fixedAssetTransactions.v1", "Sale FA", (record) => {
    const isPurchase = /purchase|buy/i.test(String(record.direction || record.type || ""));
    const total = Number(record.total ?? record.amount ?? 0);
    const received = Number(record.received ?? total);
    return {
      ...record,
      type: isPurchase ? "Purchase FA" : "Sale FA",
      number: record.number || record.refNo || "—",
      party: record.party || record.buyer || record.supplier || record.assetName || "Fixed Asset",
      total,
      received,
      balance: Math.max(0, total - received),
      status: record.status || "Completed",
    };
  });

  const journalEntries = map("ledgerly:journalEntries.v1", "Journal Entry", (record) => {
    const total = Number(record.amount ?? record.total ?? 0);
    return {
      ...record,
      type: "Journal Entry",
      number: record.number || record.entryNo || record.refNo || "—",
      party: record.party || record.account || record.debitAccount || record.creditAccount || "General Ledger",
      total,
      received: total,
      balance: 0,
      status: record.status || "Posted",
    };
  });

  const purchaseJobWorks = map("ledgerly:purchaseJobWorks.v1", "Purchase (Job Work)", (record) => {
    const total = Number(record.charges ?? record.total ?? record.amount ?? 0);
    const received = Number(record.received || 0);
    const balance = Math.max(0, total - received);
    return {
      ...record,
      type: "Purchase (Job Work)",
      number: record.number || record.refNo || "—",
      party: record.party || record.vendor || "—",
      total,
      received,
      balance,
      status: record.status || "Pending",
    };
  });

  const allRows = [
    ...saleInvoices,
    ...purchaseBills,
    ...paymentIns,
    ...paymentOuts,
    ...creditNotes,
    ...debitNotes,
    ...saleOrders,
    ...purchaseOrders,
    ...estimates,
    ...proformaInvoices,
    ...deliveryChallans,
    ...expenses,
    ...partyToParty,
    ...manufacturing,
    ...fixedAssets,
    ...journalEntries,
    ...purchaseJobWorks,
  ];

  const seenIds = new Set();
  return allRows.filter((row) => {
    if (!row.id) return true;
    if (seenIds.has(row.id)) return false;
    seenIds.add(row.id);
    return true;
  });
}
