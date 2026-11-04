const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const recordId = (record) => String(record?.id || record?.invoiceId || "");
const partyId = (record) => String(record?.partyId || record?.form?.partyId || record?.customerId || record?.supplierId || "");
const partyName = (record) => String(record?.partyName || record?.customerName || record?.customer || record?.supplier || record?.party || record?.form?.customer || record?.form?.party || "").trim();
const normalizedName = (value) => String(value || "").trim().toLocaleLowerCase();
const isInvoiceCancelled = (record) => Boolean(record?.cancelled || record?.isCancelled || record?.invoiceStatus === "Cancelled" || String(record?.status || "").trim().toLowerCase() === "cancelled");
const isVoided = (record) => Boolean(record?.deleted || record?.isDeleted || record?.isReturn || ["canceled", "void", "deleted"].includes(String(record?.status || "").trim().toLowerCase()));
const uniqueRecords = (records = []) => {
  const map = new Map();
  records.forEach((record, index) => {
    if (!record || isVoided(record)) return;
    const key = recordId(record) || `${partyKey(record)}:${record.number || record.form?.invoiceNumber || record.date || record.createdAt || index}`;
    map.set(key, record);
  });
  return [...map.values()];
};

export function transactionMatchesParty(record, party) {
  const transactionPartyId = partyId(record);
  if (transactionPartyId && party?.id != null && String(party.id)) return transactionPartyId === String(party.id);
  return Boolean(normalizedName(partyName(record)) && normalizedName(partyName(record)) === normalizedName(party?.partyName || party?.name));
}

function invoiceTotal(record) {
  return amount(record?.totals?.finalTotal ?? record?.totals?.grandTotal ?? record?.totals?.amount ?? record?.totalAmount ?? record?.total ?? record?.grandTotal ?? record?.amount);
}

function explicitPaid(record, kind) {
  const declaredSettlement = String(record?.saleType || record?.purchaseType || "").trim().toLowerCase();
  if ((kind === "sale" || kind === "purchase") && declaredSettlement === "cash") return invoiceTotal(record);
  const explicit = record?.totals?.received ?? record?.totals?.paid ?? record?.paidAmount ?? record?.receivedAmount ?? record?.received ?? record?.form?.receivedAmount ?? record?.form?.paidAmount;
  if (explicit !== undefined && explicit !== null && explicit !== "") return amount(explicit);
  const paymentType = String(record?.form?.paymentType || record?.paymentType || "").trim().toLowerCase();
  if (kind === "sale" && (String(record?.saleType || "").toLowerCase() === "cash" || paymentType === "cash")) return invoiceTotal(record);
  if (kind === "purchase" && (String(record?.purchaseType || "").toLowerCase() === "cash" || paymentType === "cash")) return invoiceTotal(record);
  return 0;
}

function allocationFor(payment, invoice) {
  const invoiceKey = recordId(invoice);
  const allocations = [payment?.allocations, payment?.invoices, payment?.appliedTo].find(Array.isArray);
  if (allocations) {
    return allocations.reduce((sum, allocation) => {
      const ref = String(allocation.invoiceId || allocation.billId || allocation.transactionId || allocation.id || "");
      return sum + (ref === invoiceKey ? amount(allocation.amount ?? allocation.allocatedAmount) : 0);
    }, 0);
  }
  const linkedId = String(payment?.linkedInvoiceId || payment?.linkedBillId || payment?.invoiceId || payment?.billId || payment?.purchaseId || "");
  return linkedId === invoiceKey ? amount(payment?.amount ?? payment?.total ?? payment?.received ?? payment?.paid) : 0;
}

function uniquePayments(payments = []) {
  const seen = new Set();
  return payments.filter((payment, index) => {
    if (isVoided(payment) || isInvoiceCancelled(payment)) return false;
    const id = recordId(payment) || `${payment.number || "payment"}:${payment.date || payment.createdAt || index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function calculateInvoiceSettlement(invoice, { kind = "sale", payments = [], adjustments = [] } = {}) {
  const total = invoiceTotal(invoice);
  const invoiceStatus = isInvoiceCancelled(invoice) ? "Cancelled" : invoice?.invoiceStatus || (invoice?.status === "Draft" ? "Draft" : "Active");
  const invoiceKey = recordId(invoice);
  const linkedAmount = uniquePayments(payments).reduce((sum, payment) => sum + allocationFor(payment, invoice), 0);
  const recordedPaid = explicitPaid(invoice, kind);
  const rawPaid = Math.max(recordedPaid, linkedAmount);
  const paid = Math.min(total, rawPaid);
  const noteField = kind === "sale" ? invoice?.creditNoteAppliedAmount : invoice?.debitNoteAppliedAmount ?? invoice?.purchaseReturnAppliedAmount;
  const invoiceRefs = new Set([invoiceKey, invoice?.invoiceId, invoice?.form?.invoiceNumber, invoice?.invoiceNumber, invoice?.billNumber].filter(Boolean).map(String));
  const linkedAdjustments = adjustments.filter((entry) => {
    if (isVoided(entry) || isInvoiceCancelled(entry)) return false;
    const linked = [entry.invoiceId, entry.billId, entry.purchaseId, entry.linkedInvoiceId, entry.billNumber, entry.invoiceNumber].filter(Boolean).map(String);
    return linked.some((reference) => invoiceRefs.has(reference));
  }).reduce((sum, entry) => sum + amount(kind === "sale" ? entry.adjustedAmount : entry.adjustedAmount ?? entry.appliedAmount ?? entry.total ?? entry.amount), 0);
  const adjustment = Math.min(Math.max(amount(noteField), linkedAdjustments), Math.max(0, total - paid));
  const outstanding = invoiceStatus === "Cancelled" ? 0 : Math.max(0, total - paid - adjustment);
  const paymentStatus = rawPaid > total ? "Overpaid / Advance" : paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
  const status = invoiceStatus === "Cancelled" ? paymentStatus : rawPaid > total ? "Overpaid / Advance" : outstanding <= 0 && total > 0 ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
  return { total, paid, appliedPayments: linkedAmount, adjustments: adjustment, outstanding, status, paymentStatus, invoiceStatus, overpayment: Math.max(0, rawPaid - total) };
}

function partyKey(record) {
  const id = partyId(record);
  return id ? `id:${id}` : `name:${normalizedName(partyName(record))}`;
}

function makePartyKeyedMap(parties, records) {
  const map = new Map();
  for (const party of parties) {
    const id = party?.id == null ? "" : String(party.id);
    const key = id ? `id:${id}` : `name:${normalizedName(party?.partyName || party?.name)}`;
    if (key !== "name:") map.set(key, { ...party, id: id || `legacy:${normalizedName(party.partyName || party.name)}`, partyName: party.partyName || party.name || "Unnamed party" });
  }
  for (const record of records) {
    const key = partyKey(record);
    const name = partyName(record);
    if (key !== "name:" && !map.has(key)) map.set(key, { id: partyId(record) || `legacy:${normalizedName(name)}`, partyName: name || "Unnamed party", openingBalance: 0, openingBalanceType: "to-receive" });
  }
  return map;
}

export function calculatePartyBalances({ parties = [], sales = [], purchases = [], paymentIns = [], paymentOuts = [], creditNotes = [], debitNotes = [], saleUi = {}, from = "", to = "" } = {}) {
  const deletedSales = new Set(Array.isArray(saleUi.deleted) ? saleUi.deleted.map(String) : []);
  const saleEdits = saleUi.edits && typeof saleUi.edits === "object" ? saleUi.edits : {};
  const saleCancelled = saleUi.cancelled && typeof saleUi.cancelled === "object" ? saleUi.cancelled : {};
  const saleRecords = uniqueRecords([...sales.map((record) => saleEdits[record.id] ? { ...record, ...saleEdits[record.id] } : record), ...(Array.isArray(saleUi.duplicates) ? saleUi.duplicates : [])]
    .filter((record) => !deletedSales.has(recordId(record)) && !saleCancelled[recordId(record)]));
  const purchaseRecords = uniqueRecords(purchases);
  const liveReceipts = uniquePayments(paymentIns);
  const livePayments = uniquePayments(paymentOuts);
  const liveCredits = creditNotes.filter((record) => !isVoided(record));
  const liveDebits = debitNotes.filter((record) => !isVoided(record));
  const allRecords = [...saleRecords, ...purchaseRecords, ...liveReceipts, ...livePayments, ...liveCredits, ...liveDebits];
  const partyMap = makePartyKeyedMap(parties, allRecords);
  const inRange = (record) => {
    if (!from && !to) return true;
    const value = String(record?.form?.invoiceDate || record?.form?.billDate || record?.date || record?.createdAt || "").slice(0, 10);
    if (!value) return true;
    return (!from || value >= from) && (!to || value <= to);
  };
  const results = [...partyMap.entries()].map(([key, party]) => {
    const partySales = saleRecords.filter((record) => inRange(record) && (partyKey(record) === key || (!partyId(record) && transactionMatchesParty(record, party))));
    const partyPurchases = purchaseRecords.filter((record) => inRange(record) && (partyKey(record) === key || !partyId(record) && transactionMatchesParty(record, party)));
    const receivableInvoices = partySales.map((invoice) => ({ invoice, settlement: calculateInvoiceSettlement(invoice, { kind: "sale", payments: liveReceipts, adjustments: liveCredits }) }));
    const payableInvoices = partyPurchases.map((invoice) => ({ invoice, settlement: calculateInvoiceSettlement(invoice, { kind: "purchase", payments: livePayments, adjustments: liveDebits }) }));
    const ob = amount(party.openingBalance);
    const partyType = String(party.partyType || "").trim().toLowerCase();
    const obType = String(party.openingBalanceType || ((partyType === "supplier" || partyType === "vendor") ? "to-pay" : "to-receive")).toLowerCase();
    let openingReceivable = obType === "to-pay" ? 0 : ob;
    let openingPayable = obType === "to-pay" ? ob : 0;
    if (ob === 0 && party.balance != null && party.balance !== "") {
      const raw = Number(party.balance);
      if (Number.isFinite(raw)) {
        if (obType === "to-pay" || raw < 0) openingPayable = Math.max(openingPayable, Math.abs(raw));
        else openingReceivable = Math.max(openingReceivable, raw);
      }
    }
    const salesReceivable = receivableInvoices.reduce((sum, row) => sum + row.settlement.outstanding, 0);
    const purchasesPayable = payableInvoices.reduce((sum, row) => sum + row.settlement.outstanding, 0);
    const customerOverpayments = receivableInvoices.reduce((sum, row) => sum + row.settlement.overpayment, 0);
    const supplierOverpayments = payableInvoices.reduce((sum, row) => sum + row.settlement.overpayment, 0);
    const customerAdvances = liveReceipts.filter((payment) => (partyKey(payment) === key || (!partyId(payment) && transactionMatchesParty(payment, party))) && !payment.linkedInvoiceId && !payment.invoiceId && !(Array.isArray(payment.allocations) && payment.allocations.length)).reduce((sum, payment) => sum + amount(payment.amount ?? payment.total ?? payment.received), 0) + customerOverpayments;
    const supplierAdvances = livePayments.filter((payment) => (partyKey(payment) === key || (!partyId(payment) && transactionMatchesParty(payment, party))) && !payment.linkedInvoiceId && !payment.linkedBillId && !payment.invoiceId && !payment.billId && !payment.purchaseId && !payment.linkedCreditNoteId && !(Array.isArray(payment.allocations) && payment.allocations.length)).reduce((sum, payment) => sum + amount(payment.amount ?? payment.total ?? payment.paid), 0) + supplierOverpayments;
    const customerCredits = liveCredits.filter((note) => (partyKey(note) === key || (!partyId(note) && transactionMatchesParty(note, party)))).reduce((sum, note) => sum + amount(note.customerCreditAmount ?? Math.max(0, invoiceTotal(note) - amount(note.adjustedAmount) - amount(note.received))), 0);
    const supplierCredits = liveDebits.filter((note) => (partyKey(note) === key || (!partyId(note) && transactionMatchesParty(note, party)))).filter((note) => !note.billId && !note.purchaseId && !note.linkedInvoiceId).reduce((sum, note) => sum + amount(note.balance ?? Math.max(0, invoiceTotal(note) - amount(note.received))), 0);
    const receivable = openingReceivable + salesReceivable + supplierAdvances + supplierCredits;
    const payable = openingPayable + purchasesPayable + customerAdvances + customerCredits;
    return { ...party, openingReceivable, openingPayable, salesReceivable, purchasesPayable, customerAdvances: customerAdvances + customerCredits, supplierAdvances: supplierAdvances + supplierCredits, receivable, payable, net: receivable - payable, sales: receivableInvoices, purchases: payableInvoices };
  });
  const transactionReceivable = results.reduce((sum, party) => sum + party.salesReceivable + party.supplierAdvances, 0);
  const transactionPayable = results.reduce((sum, party) => sum + party.purchasesPayable + party.customerAdvances, 0);
  const assignedKeys = new Set(partyMap.keys());
  const unassignedSalesReceivable = saleRecords.filter((record) => !partyId(record) && !partyName(record) && !assignedKeys.has(partyKey(record)) && inRange(record))
    .reduce((sum, invoice) => sum + calculateInvoiceSettlement(invoice, { kind: "sale", payments: liveReceipts, adjustments: liveCredits }).outstanding, 0);
  const unassignedPurchasesPayable = purchaseRecords.filter((record) => !partyId(record) && !partyName(record) && !assignedKeys.has(partyKey(record)) && inRange(record))
    .reduce((sum, invoice) => sum + calculateInvoiceSettlement(invoice, { kind: "purchase", payments: livePayments, adjustments: liveDebits }).outstanding, 0);
  const openingReceivable = results.reduce((sum, party) => sum + party.openingReceivable, 0);
  const openingPayable = results.reduce((sum, party) => sum + party.openingPayable, 0);
  return { parties: results, receivable: transactionReceivable + unassignedSalesReceivable + openingReceivable, payable: transactionPayable + unassignedPurchasesPayable + openingPayable, transactionReceivable: transactionReceivable + unassignedSalesReceivable, transactionPayable: transactionPayable + unassignedPurchasesPayable, salesReceivable: results.reduce((sum, party) => sum + party.salesReceivable, 0) + unassignedSalesReceivable, purchasesPayable: results.reduce((sum, party) => sum + party.purchasesPayable, 0) + unassignedPurchasesPayable, openingReceivable, openingPayable };
}
