import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCalendar, FiMoreHorizontal, FiPlus, FiPrinter, FiSearch, FiX, FiEye } from "react-icons/fi";
import * as XLSX from "xlsx";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { getParties } from "../../services/partiesStorage";
import { getInventoryItems } from "../../services/itemsStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import { calculateSaleReturnRow, cancelSaleReturn, getSaleReturns, saveSaleReturn } from "../../services/saleReturnsStorage";
import { savePurchaseJobWork } from "../../services/purchaseJobWorkStorage";
import { getAllLocalTransactions, transactionTypes } from "../../services/transactionRecordsStorage";
import { ensureLocalTestData } from "../../services/localTransactionTestData";
import { taxPercent } from "../../utils/saleInvoice";

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB") : "—";
const invoiceCustomer = (invoice) => String(invoice.form?.customer || invoice.customer || invoice.partyName || "").trim();
const rowIdentity = (row) => String(row.id || row.sourceRowId || row.sourceItemId || row.item || "");
const blankRow = (row, returned = 0) => {
  const soldQty = Number(row.qty ?? row.quantity ?? 0);
  const taxRate = row.taxRate || row.tax || "NONE";
  return {
    ...row,
    id: crypto.randomUUID(),
    sourceRowId: rowIdentity(row),
    sourceItemId: row.sourceItemId || row.itemId || "",
    item: row.item || row.itemName || "Item",
    soldQty,
    returnedQty: returned,
    remainingQty: Math.max(0, soldQty - returned),
    qty: "",
    price: String(row.price || row.unitPrice || ""),
    unit: row.unit || "",
    priceMode: row.priceMode || "Without Tax",
    discountPercent: String(row.discountPercent ?? row.discount ?? ""),
    discountMode: row.discountMode || "percent",
    sourceDiscountAmount: row.calculated?.discount ?? row.discountAmount ?? 0,
    discountAmount: row.discountMode === "amount" ? String(row.discountAmount || row.calculated?.discount || "") : "",
    taxRate,
    tax: taxRate === "NONE" || taxRate === "None" ? "NONE" : String(taxPercent(taxRate)),
    restockable: true,
  };
};
const newReturn = (type, records) => ({
  id: "",
  type,
  number: String(Math.max(0, ...records.map((record) => Number(record.number) || 0)) + 1),
  date: today(),
  party: "",
  partyId: "",
  phone: "",
  invoiceId: "",
  invoiceNumber: "",
  invoiceDate: "",
  rows: [],
  reason: "",
  settlementMode: "apply",
  paymentType: "Cash",
  received: "",
});
const readSavedReturns = () => {
  try { return { records: getSaleReturns(), error: "" }; }
  catch (error) { return { records: [], error: error.message }; }
};

function calculateBreakdown(rows = []) {
  return rows.reduce((sum, row) => {
    const line = calculateSaleReturnRow(row);
    return { quantity: sum.quantity + Number(row.qty || 0), taxable: sum.taxable + line.taxable, discount: sum.discount + line.discount, tax: sum.tax + line.tax, total: sum.total + line.amount };
  }, { quantity: 0, taxable: 0, discount: 0, tax: 0, total: 0 });
}

function printCreditNote(record) {
  const popup = window.open("", "_blank", "width=950,height=760");
  if (!popup) { window.alert("Allow pop-ups to print the Credit Note."); return; }
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const breakdown = calculateBreakdown(record.rows);
  const rows = (record.rows || []).map((row) => {
    const line = calculateSaleReturnRow(row);
    return `<tr><td>${escape(row.item)}</td><td>${escape(row.qty)} ${escape(row.unit)}</td><td>${money(row.price)}</td><td>${money(line.discount)}</td><td>${money(line.tax)}</td><td>${money(line.amount)}</td></tr>`;
  }).join("");
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(record.type)} ${escape(record.number)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:36px}h1{text-align:center;margin:0}header{border-bottom:2px solid #1e3a8a;padding-bottom:16px;margin-bottom:24px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #cbd5e1;padding:9px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#eff6ff}.summary{margin:18px 0 0 auto;width:300px}.summary div{display:flex;justify-content:space-between;padding:5px}.grand{border-top:2px solid #334155;font-size:18px;font-weight:bold;margin-top:8px;padding-top:10px}@media print{button{display:none}body{margin:15mm}}</style></head><body><header><h1>${escape(record.type)}</h1><p style="text-align:center">No. ${escape(record.number)} · ${dateLabel(record.date)}</p></header><div class="meta"><div><b>Customer</b><br>${escape(record.party)}</div><div><b>Original invoice</b><br>${escape(record.invoiceNumber || "—")}</div><div><b>Phone</b><br>${escape(record.phone || "—")}</div><div><b>Status</b><br>${escape(record.status || "Credit Available")}</div></div><table><thead><tr><th>Item</th><th>Return quantity</th><th>Price</th><th>Discount</th><th>GST</th><th>Credit</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><div><span>Taxable value</span><b>${money(breakdown.taxable)}</b></div><div><span>Discount</span><b>${money(breakdown.discount)}</b></div><div><span>GST</span><b>${money(breakdown.tax)}</b></div><div><span>Refunded</span><b>${money(record.received)}</b></div><div><span>Applied to invoice</span><b>${money(record.adjustedAmount)}</b></div><div><span>Customer credit</span><b>${money(record.customerCreditAmount)}</b></div><div class="grand"><span>Total credit</span><b>${money(record.total)}</b></div></div><p><b>Reason:</b> ${escape(record.reason || "—")}</p><button onclick="window.print()">Print / Save PDF</button></body></html>`);
  popup.document.close();
}

function CreditNoteEditor({ value, mode, records, parties, invoices, onChange, onClose, onSave }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedInvoice = invoices.find((invoice) => String(invoice.id) === String(value.invoiceId));
  const availableInvoices = invoices.filter((invoice) => {
    const customerMatches = !value.party || invoiceCustomer(invoice).toLowerCase() === value.party.toLowerCase();
    const active = !invoice.cancelled && !invoice.deleted && !invoice.isDeleted && String(invoice.status || "").toLowerCase() !== "cancelled";
    return customerMatches && active;
  });
  const breakdown = calculateBreakdown(value.rows);
  const invoiceTotal = selectedInvoice ? Number(selectedInvoice.totals?.finalTotal ?? selectedInvoice.totals?.grandTotal ?? selectedInvoice.totalAmount ?? selectedInvoice.total ?? 0) : 0;
  const invoiceReceived = selectedInvoice ? (selectedInvoice.saleType === "cash" ? invoiceTotal : Number(selectedInvoice.totals?.received ?? selectedInvoice.receivedAmount ?? 0)) : 0;
  const outstanding = selectedInvoice
    ? Math.max(0, invoiceTotal - invoiceReceived - Number(selectedInvoice.creditNoteAppliedAmount || 0))
    : 0;
  const priorRefunded = records.filter((record) => record.invoiceId === value.invoiceId && record.id !== value.id && !record.cancelled).reduce((sum, record) => sum + Number(record.received || 0), 0);
  const priorCredit = records.filter((record) => record.invoiceId === value.invoiceId && record.id !== value.id && !record.cancelled).reduce((sum, record) => sum + Number(record.total || 0), 0);
  const refundableLimit = Math.max(0, priorCredit + breakdown.total - Math.max(outstanding, 0) - priorRefunded);
  const received = value.settlementMode === "refund" ? Number(value.received || 0) : 0;
  const adjustedAmount = value.settlementMode === "apply" ? Math.min(breakdown.total, outstanding) : 0;
  const customerCreditAmount = Math.max(0, breakdown.total - received - adjustedAmount);

  const change = (key, nextValue) => onChange({ ...value, [key]: nextValue });
  const changeRow = (rowId, patch) => change("rows", value.rows.map((row) => row.id === rowId ? { ...row, ...patch } : row));
  const chooseCustomer = (partyId) => {
    const party = parties.find((entry) => String(entry.id) === String(partyId));
    onChange({ ...value, partyId: party?.id || "", party: party?.partyName || party?.name || "", phone: party?.phone || "", invoiceId: "", invoiceNumber: "", invoiceDate: "", rows: [] });
  };
  const chooseInvoice = (invoiceId) => {
    const invoice = invoices.find((entry) => String(entry.id) === String(invoiceId));
    if (!invoice) { change("invoiceId", ""); return; }
    const prior = records.filter((record) => record.invoiceId === invoice.id && record.id !== value.id && !record.cancelled).flatMap((record) => record.rows || []);
    const rows = (invoice.rows || []).map((row) => {
      const id = rowIdentity(row);
      const returnedQty = prior.filter((returnRow) => String(returnRow.sourceRowId || returnRow.sourceItemId || returnRow.item || "") === id).reduce((sum, returnRow) => sum + Number(returnRow.qty || 0), 0);
      return blankRow(row, returnedQty);
    }).filter((row) => row.remainingQty > 0);
    onChange({ ...value, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber || invoice.form?.invoiceNumber || "", invoiceDate: invoice.form?.invoiceDate || invoice.invoiceDate || "", party: invoiceCustomer(invoice), partyId: invoice.partyId || value.partyId || "", phone: invoice.form?.phone || value.phone || "", rows });
  };
  const submit = () => {
    setError("");
    const selectedRows = value.rows.filter((row) => Number(row.qty) > 0);
    if (!value.partyId || !parties.some((party) => String(party.id) === String(value.partyId))) { setError("Select an existing customer."); return; }
    if (!selectedInvoice) { setError("Select an active sales invoice for this customer."); return; }
    if (!selectedRows.length) { setError("Enter a return quantity for at least one item."); return; }
    if (selectedRows.some((row) => !Number.isFinite(Number(row.qty)) || Number(row.qty) <= 0 || Number(row.qty) > row.remainingQty)) { setError("Each return quantity must be positive and no greater than its remaining quantity."); return; }
    if (value.settlementMode === "refund" && (received <= 0 || received > refundableLimit)) { setError(`Refund must be greater than zero and no more than ${money(refundableLimit)}.`); return; }
    const saved = {
      ...value,
      rows: selectedRows,
      received,
      adjustedAmount,
      customerCreditAmount,
      total: breakdown.total,
      balance: customerCreditAmount,
      status: received > 0 ? (received + adjustedAmount >= breakdown.total ? "Refunded" : "Partially Refunded") : adjustedAmount >= breakdown.total ? "Adjusted" : adjustedAmount > 0 ? "Partially Adjusted / Credit" : "Customer Credit",
      reason: String(value.reason || "").trim(),
    };
    setSaving(true);
    try { onSave(saved); }
    catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  };
  const readOnly = mode === "view";

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
    <section role="dialog" aria-modal="true" aria-labelledby="credit-note-title" className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Sales · Returns</p><h2 id="credit-note-title" className="mt-1 text-xl font-bold text-slate-900">{mode === "new" ? `Create ${value.type}` : readOnly ? `View ${value.type}` : `Edit ${value.type}`} <span className="text-slate-400">#{value.number}</span></h2></div>
        <button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><FiX size={20}/></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 px-4 py-5 sm:px-7">
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">Customer and original invoice</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Customer <span className="text-rose-600">*</span><select disabled={readOnly} value={value.partyId || ""} onChange={(event) => chooseCustomer(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"><option value="">Select customer</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.partyName || party.name}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Original invoice <span className="text-rose-600">*</span><select disabled={readOnly || !value.partyId} value={value.invoiceId || ""} onChange={(event) => chooseInvoice(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"><option value="">{value.partyId ? "Select sales invoice" : "Select customer first"}</option>{availableInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>#{invoice.invoiceNumber || invoice.form?.invoiceNumber || invoice.id} · {dateLabel(invoice.form?.invoiceDate || invoice.invoiceDate || invoice.createdAt)} · {money(invoice.totals?.finalTotal ?? invoice.totalAmount ?? invoice.total)}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Credit Note number<input disabled={readOnly} value={value.number} onChange={(event) => change("number", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"/></label>
              <label className="text-sm font-medium text-slate-700">Date<input disabled={readOnly} type="date" value={value.date || today()} onChange={(event) => change("date", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"/></label>
            </div>
            {selectedInvoice && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">Invoice <b>#{value.invoiceNumber}</b> · Customer {value.party} · Previously returned {records.filter((record) => record.invoiceId === value.invoiceId && record.id !== value.id && !record.cancelled).reduce((sum, record) => sum + Number(record.total || 0), 0) > 0 ? "quantities are deducted below" : "no items returned yet"}</p>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">Credit settlement</h3>
            <label className="mt-4 block text-sm font-medium text-slate-700">How should the credit be settled?<select disabled={readOnly} value={value.settlementMode || "apply"} onChange={(event) => change("settlementMode", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="apply">Apply to the original invoice</option><option value="credit">Keep as customer credit</option><option value="refund">Refund customer</option></select></label>
            {value.settlementMode === "refund" && <><label className="mt-3 block text-sm font-medium text-slate-700">Refund amount<input disabled={readOnly} type="number" min="0" max={refundableLimit} step="0.01" value={value.received || ""} onChange={(event) => change("received", event.target.value)} placeholder={`Up to ${money(refundableLimit)}`} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3"/></label><label className="mt-3 block text-sm font-medium text-slate-700">Refund method<select disabled={readOnly} value={value.paymentType || "Cash"} onChange={(event) => change("paymentType", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3">{["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Other"].map((method) => <option key={method}>{method}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">Maximum refundable after invoice balance and previous returns: {money(refundableLimit)}.</p></>}
            <label className="mt-4 block text-sm font-medium text-slate-700">Reason for return<textarea disabled={readOnly} rows="3" value={value.reason || ""} onChange={(event) => change("reason", event.target.value)} placeholder="Add a short reason" className="mt-1.5 w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-blue-500"/></label>
          </section>
        </div>

        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 sm:px-5"><div><h3 className="font-semibold text-slate-900">Items being returned</h3><p className="mt-1 text-xs text-slate-500">Only quantities available from the selected invoice can be returned.</p></div>{selectedInvoice && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{value.rows.length} returnable line{value.rows.length === 1 ? "" : "s"}</span>}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Item", "Sold", "Previously returned", "Available", "Return now", "Price", "Discount", "GST", "Restock"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
              <tbody>
                {value.rows.map((row) => <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-3"><div className="font-medium text-slate-900">{row.item}</div><div className="mt-0.5 text-xs text-slate-500">{row.description || row.itemCode || "—"}</div></td>
                  <td className="px-3 py-3 text-slate-700">{row.soldQty} {row.unit}</td><td className="px-3 py-3 text-slate-600">{row.returnedQty}</td><td className="px-3 py-3 font-semibold text-slate-900">{row.remainingQty}</td>
                  <td className="px-3 py-3"><input aria-label={`Return quantity for ${row.item}`} disabled={readOnly} type="number" min="0" max={row.remainingQty} step="any" value={row.qty} onChange={(event) => changeRow(row.id, { qty: event.target.value })} className="h-9 w-24 rounded-md border border-slate-300 px-2 outline-none focus:border-blue-500"/></td>
                  <td className="px-3 py-3 text-slate-700">{money(row.price)}</td><td className="px-3 py-3 text-slate-700">{row.discountMode === "amount" ? money(calculateSaleReturnRow(row).discount) : `${row.discountPercent || 0}%`}</td><td className="px-3 py-3 text-slate-700">{row.taxRate || "None"}</td>
                  <td className="px-3 py-3"><label className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" disabled={readOnly} checked={Boolean(row.restockable)} onChange={(event) => changeRow(row.id, { restockable: event.target.checked })} className="h-4 w-4 accent-blue-600"/>Restock</label></td>
                </tr>)}
                {!value.rows.length && <tr><td colSpan="9" className="px-4 py-12 text-center text-sm text-slate-500">{selectedInvoice ? "All invoice quantities have already been returned." : "Select a customer and invoice to load the original items."}</td></tr>}
              </tbody>
            </table>
          </div>
          {value.rows.length > 0 && <div className="grid gap-4 border-t border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-5"><Summary label="Return quantity" value={breakdown.quantity}/><Summary label="Taxable value" value={money(breakdown.taxable)}/><Summary label="Discount" value={money(breakdown.discount)}/><Summary label="GST" value={money(breakdown.tax)}/><Summary label="Credit Note total" value={money(breakdown.total)} emphasis/></div>}
        </section>
        {selectedInvoice && breakdown.total > 0 && <section className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm sm:grid-cols-3"><Summary label="Refund" value={money(received)}/><Summary label="Applied to original invoice" value={money(adjustedAmount)}/><Summary label="Customer credit remaining" value={money(customerCreditAmount)} emphasis/></section>}
        {error && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-7">
        <Button onClick={onClose} className="rounded-lg border border-slate-300 px-5 text-slate-700">{readOnly ? "Close" : "Cancel"}</Button>
        {!readOnly && <Button disabled={saving} onClick={submit} className="rounded-lg bg-blue-700 px-6 text-white hover:bg-blue-800 disabled:opacity-60">{saving ? "Saving…" : `Save ${value.type}`}</Button>}
      </footer>
    </section>
  </div>;
}

function Summary({ label, value, emphasis = false }) {
  return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1 ${emphasis ? "text-lg font-bold text-blue-900" : "font-semibold text-slate-800"}`}>{value}</p></div>;
}

function PurchaseJobWorkEditor({ initial, parties, items, onClose, onSave }) {
  const [value, setValue] = useState(() => initial ? { ...initial, sentRows: (initial.sentRows || []).map((row) => ({ ...row, id: row.id || crypto.randomUUID() })), receivedRows: (initial.receivedRows || []).map((row) => ({ ...row, id: row.id || crypto.randomUUID() })) } : { number: `JW-${Date.now()}`, date: today(), partyId: "", party: "", sentRows: [{ id: crypto.randomUUID(), itemId: "", item: "", qty: "" }], receivedRows: [], charges: "", status: "Pending", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const updateRow = (collection, id, patch) => setValue((current) => ({ ...current, [collection]: current[collection].map((row) => row.id === id ? { ...row, ...patch } : row) }));
  const addRow = (collection) => setValue((current) => ({ ...current, [collection]: [...current[collection], { id: crypto.randomUUID(), itemId: "", item: "", qty: "" }] }));
  const makeRows = (rows) => rows.map((row) => ({ ...row, id: row.id || crypto.randomUUID() }));
  const submit = () => {
    const party = parties.find((entry) => String(entry.id) === String(value.partyId));
    if (!party) { setError("Select an existing vendor/party."); return; }
    const draft = { ...value, party: party.partyName || party.name, sentRows: makeRows(value.sentRows), receivedRows: makeRows(value.receivedRows) };
    setSaving(true);
    try { onSave(savePurchaseJobWork(draft)); }
    catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"><section role="dialog" aria-modal="true" className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Purchase · Job Work</p><h2 className="mt-1 text-xl font-bold">Record Job Work</h2></div><button onClick={onClose} aria-label="Close job work" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><FiX/></button></header><div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50 p-4 sm:p-6"><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-medium">Job-work reference<input value={value.number} onChange={(event) => setValue({ ...value, number: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3"/></label><label className="text-sm font-medium">Date<input type="date" value={value.date} onChange={(event) => setValue({ ...value, date: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3"/></label><label className="text-sm font-medium">Vendor / party<select value={value.partyId} onChange={(event) => setValue({ ...value, partyId: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3"><option value="">Select existing party</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.partyName || party.name}</option>)}</select></label></div>
    {[{ key: "sentRows", title: "Materials sent for processing" }, { key: "receivedRows", title: "Processed goods received" }].map(({ key, title }) => <section key={key} className="rounded-xl border bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button type="button" onClick={() => addRow(key)} className="text-sm font-semibold text-blue-700">+ Add item</button></div>{value[key].map((row) => <div key={row.id} className="mb-2 grid gap-2 sm:grid-cols-[1fr_150px]"><select value={row.itemId} onChange={(event) => { const item = items.find((entry) => String(entry.id) === event.target.value); updateRow(key, row.id, { itemId: item?.id || "", item: item?.itemName || item?.name || "" }); }} className="h-10 rounded-lg border bg-white px-3"><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.itemName || item.name} · Stock {item.openingQuantity || item.stock || 0}</option>)}</select><input type="number" min="0" step="any" value={row.qty} onChange={(event) => updateRow(key, row.id, { qty: event.target.value })} placeholder="Quantity" className="h-10 rounded-lg border px-3"/></div>)}{key === "receivedRows" && !value.receivedRows.length && <p className="text-sm text-slate-500">No processed goods received yet.</p>}</section>)}
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Job-work charges<input type="number" min="0" step="0.01" value={value.charges} onChange={(event) => setValue({ ...value, charges: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3"/></label><label className="text-sm font-medium">Progress status<select value={value.status} onChange={(event) => setValue({ ...value, status: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3"><option>Pending</option><option>Partially Completed</option><option>Completed</option></select></label></div><label className="block text-sm font-medium">Notes<textarea rows="2" value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} className="mt-1.5 w-full rounded-lg border bg-white p-3"/></label>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}</div><footer className="flex justify-end gap-3 border-t px-5 py-4"><Button onClick={onClose} className="rounded-lg border px-4 text-slate-700">Cancel</Button><Button disabled={saving} onClick={submit} className="rounded-lg bg-blue-700 px-5 text-white">{saving ? "Saving…" : "Save Job Work"}</Button></footer></section></div>;
}

function ViewTransactionModal({ record, onClose }) {
  if (!record) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">{record.type}</p>
            <h2 className="text-lg font-bold text-slate-900">Transaction #{record.number}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <FiX size={20} />
          </button>
        </header>
        <div className="space-y-4 p-6 bg-slate-50/50 text-sm">
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div><span className="text-xs text-slate-500">Date</span><p className="font-semibold text-slate-800">{dateLabel(record.date)}</p></div>
            <div><span className="text-xs text-slate-500">Party / Reference</span><p className="font-semibold text-slate-800">{record.party}</p></div>
            <div><span className="text-xs text-slate-500">Status</span><p className="font-semibold text-slate-800">{record.status}</p></div>
            <div><span className="text-xs text-slate-500">Firm / Branch</span><p className="font-semibold text-slate-800">{record.firm || "Main Store"}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-center">
            <div><span className="text-xs text-slate-500">Total Amount</span><p className="text-base font-bold text-slate-900">{money(record.total)}</p></div>
            <div><span className="text-xs text-slate-500">Received / Paid</span><p className="text-base font-bold text-slate-900">{money(record.received)}</p></div>
            <div><span className="text-xs text-slate-500">Balance</span><p className="text-base font-bold text-slate-900">{money(record.balance)}</p></div>
          </div>
          {record.raw?.notes && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <span className="text-xs font-semibold text-slate-500">Notes / Details</span>
              <p className="mt-1 text-slate-700">{record.raw.notes}</p>
            </div>
          )}
          {record.raw?.description && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <span className="text-xs font-semibold text-slate-500">Description</span>
              <p className="mt-1 text-slate-700">{record.raw.description}</p>
            </div>
          )}
        </div>
        <footer className="flex justify-end border-t border-slate-200 bg-white px-6 py-3.5">
          <Button onClick={onClose} className="rounded-lg bg-blue-700 px-5 text-white">Close</Button>
        </footer>
      </div>
    </div>
  );
}

export default function SaleReturns() {
  const navigate = useNavigate();
  const [initial] = useState(readSavedReturns);
  const [records, setRecords] = useState(initial.records);
  const [loadError] = useState(initial.error);
  const [editor, setEditor] = useState(null);
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState("");
  const [jobWorkEditor, setJobWorkEditor] = useState(null);
  const [viewDetailModal, setViewDetailModal] = useState(null);
  const [fromDate, setFromDate] = useState(`${today().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(today());
  const [datePreset, setDatePreset] = useState("This Month");
  const [recordType, setRecordType] = useState("Credit Note");
  const displayedRecordType = recordType === "Sale Return" ? "Credit Note" : recordType;
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [customerFilter, setCustomerFilter] = useState("All customers");
  const [firmFilter, setFirmFilter] = useState("ALL FIRMS");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    ensureLocalTestData();
    const refresh = () => {
      setRefreshTrigger((value) => value + 1);
      const { records: latest, error } = readSavedReturns();
      if (!error) setRecords(latest);
    };
    window.addEventListener("ledgerly:business-data-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const parties = useMemo(() => getParties(), [refreshTrigger]);
  const inventoryItems = useMemo(() => getInventoryItems().filter((item) => item.type !== "service"), [refreshTrigger]);
  const invoices = useMemo(() => getSaleInvoices(), [refreshTrigger]);
  const transactionLoad = useMemo(() => {
    try { return { rows: getAllLocalTransactions(), error: "" }; }
    catch (error) { return { rows: [], error: error.message }; }
  }, [refreshTrigger]);

  const transactionRows = transactionLoad.rows;
  const firmNames = [...new Set(transactionRows.map((row) => row.firm).filter(Boolean))].sort();
  const partyNames = [...new Set([...parties.map((party) => party.partyName || party.name), ...transactionRows.map((row) => row.party)].filter(Boolean))].sort();
  const transactionStatuses = [...new Set([...records.map((record) => record.status), ...transactionRows.map((row) => row.status)].filter(Boolean))].sort();

  const filtered = records.filter((record) =>
    ["Credit Note", "Sale Return"].includes(record.type)
    && (!fromDate || (record.date && record.date >= fromDate))
    && (!toDate || (record.date && record.date <= toDate))
    && (customerFilter === "All customers" || record.party === customerFilter)
    && (statusFilter === "All statuses" || record.status === statusFilter)
    && `${record.party || ""} ${record.number || ""} ${record.invoiceNumber || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  const filteredTransactions = transactionRows.filter((row) =>
    (displayedRecordType === "All Transaction" || row.type === displayedRecordType)
    && (!fromDate || (row.date && row.date >= fromDate))
    && (!toDate || (row.date && row.date <= toDate))
    && (customerFilter === "All customers" || row.party === customerFilter)
    && (firmFilter === "ALL FIRMS" || row.firm === firmFilter)
    && (statusFilter === "All statuses" || row.status === statusFilter)
    && `${row.party || ""} ${row.number || ""} ${row.type || ""} ${row.status || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  const visibleTransactions = displayedRecordType === "Credit Note" ? filtered : filteredTransactions;

  const totalSum = displayedRecordType === "Credit Note"
    ? visibleTransactions.filter((r) => !r.cancelled).reduce((sum, r) => sum + Number(r.total || 0), 0)
    : visibleTransactions.filter((r) => r.type !== "Sale (Cancelled)" && !r.cancelled).reduce((sum, r) => sum + Number(r.total || 0), 0);

  const balanceSum = displayedRecordType === "Credit Note"
    ? visibleTransactions.filter((r) => !r.cancelled).reduce((sum, r) => sum + Number(r.customerCreditAmount ?? r.balance ?? 0), 0)
    : visibleTransactions.filter((r) => r.type !== "Sale (Cancelled)" && !r.cancelled).reduce((sum, r) => sum + Number(r.balance ?? 0), 0);

  const openNew = () => setEditor({ mode: "new", value: newReturn(displayedRecordType, records) });

  const save = (value) => {
    const result = saveSaleReturn(value);
    setRecords((current) => value.id ? current.map((record) => record.id === result.id ? result : record) : [result, ...current]);
    setEditor(null);
  };

  const runAction = (action, record) => {
    setMenuId("");
    if (action === "View") setEditor({ mode: "view", value: record });
    if (action === "Edit") setEditor({ mode: "edit", value: record });
    if (action === "Print") printCreditNote(record);
    if (action === "Cancel" && window.confirm(`Cancel ${record.type} ${record.number}? Linked stock and balance effects will be reversed.`)) {
      try {
        const next = cancelSaleReturn(record.id);
        setRecords((current) => current.map((entry) => entry.id === next.id ? next : entry));
      } catch (error) {
        window.alert(`Could not cancel ${record.type}: ${error.message}`);
      }
    }
  };

  const handleOpenRow = (record) => {
    const type = record.type;
    if (type === "Credit Note" || type === "Sale Return") {
      setEditor({ mode: "view", value: record.raw || record });
    } else if (type === "Purchase (Job Work)") {
      setJobWorkEditor(record.raw || record);
    } else if (type === "Debit Note") {
      navigate("/purchase-expense/purchase-return-debit-note");
    } else if (type === "Sale Order") {
      navigate("/sales/sale-order");
    } else if (type === "Purchase Order") {
      navigate("/purchase-expense/purchase-order");
    } else if (type === "Estimate") {
      navigate("/sales/estimate-quotation");
    } else if (type === "Proforma Invoice") {
      navigate("/sales/proforma-invoice");
    } else if (type === "Delivery Challan") {
      navigate("/sales/delivery-challan");
    } else if (type === "Expense") {
      navigate("/purchase-expense/expenses");
    } else if (type === "Payment-In") {
      navigate("/sales/payment-in");
    } else if (type === "Payment-Out") {
      navigate("/purchase-expense/payment-out");
    } else if (type === "Purchase") {
      navigate("/purchase-expense/purchase-bills");
    } else if (type === "Sale" || type === "Sale (Cancelled)") {
      navigate("/sales/sale-invoices");
    } else if (type.startsWith("Party to Party")) {
      navigate("/parties/party-details");
    } else {
      setViewDetailModal(record);
    }
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const data = visibleTransactions.map((record) => ({
      Date: record.date,
      Type: record.type || displayedRecordType,
      Reference: record.number,
      Party: record.party || record.partyName,
      Total: record.total,
      "Received / Paid": record.received,
      Balance: record.balance ?? record.customerCreditAmount,
      Status: record.status,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Transactions");
    XLSX.writeFile(workbook, `Transactions_${displayedRecordType.replace(/\s+/g, "_")}_${today()}.xlsx`);
  };

  const changeDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === "All time") { setFromDate(""); setToDate(""); }
    else if (preset === "Today") { setFromDate(today()); setToDate(today()); }
    else { setFromDate(`${today().slice(0, 7)}-01`); setToDate(today()); }
  };

  return <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-slate-100 p-3 text-slate-800 sm:p-5">
    {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load saved sales returns: {loadError}</div>}
    {displayedRecordType !== "Credit Note" && transactionLoad.error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load transactions: {transactionLoad.error}</div>}
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Transactions</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{displayedRecordType === "Credit Note" ? "Sales Return / Credit Note" : `${displayedRecordType} Transactions`}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {displayedRecordType === "Credit Note"
            ? "Record returned goods and apply or refund the customer credit."
            : `Track, filter, and inspect verified ${displayedRecordType} business records.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {displayedRecordType === "Credit Note" && <Button onClick={openNew} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Credit Note</Button>}
        {displayedRecordType === "Debit Note" && <Button onClick={() => navigate("/purchase-expense/purchase-return-debit-note")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Debit Note</Button>}
        {displayedRecordType === "Purchase (Job Work)" && <Button onClick={() => setJobWorkEditor({})} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Record Job Work</Button>}
        {displayedRecordType === "Sale" && <Button onClick={() => navigate("/sales/sale-invoices/new")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Sale</Button>}
        {displayedRecordType === "Purchase" && <Button onClick={() => navigate("/purchase-expense/purchase-bills/new")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Purchase</Button>}
        {displayedRecordType === "Payment-In" && <Button onClick={() => navigate("/sales/payment-in")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Payment-In</Button>}
        {displayedRecordType === "Payment-Out" && <Button onClick={() => navigate("/purchase-expense/payment-out")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Payment-Out</Button>}
        {displayedRecordType === "Expense" && <Button onClick={() => navigate("/purchase-expense/expenses")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Expense</Button>}
        {displayedRecordType === "Sale Order" && <Button onClick={() => navigate("/sales/sale-order")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Sale Order</Button>}
        {displayedRecordType === "Purchase Order" && <Button onClick={() => navigate("/purchase-expense/purchase-order")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Purchase Order</Button>}
        {displayedRecordType === "Estimate" && <Button onClick={() => navigate("/sales/estimate-quotation")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Estimate</Button>}
        {displayedRecordType === "Proforma Invoice" && <Button onClick={() => navigate("/sales/proforma-invoice")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Proforma</Button>}
        {displayedRecordType === "Delivery Challan" && <Button onClick={() => navigate("/sales/delivery-challan")} className="h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"><FiPlus/> Add Challan</Button>}
      </div>
    </header>

    <Card className="shrink-0 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_1fr_1fr_200px_200px_200px]">
        <label className="text-xs font-semibold text-slate-500">TRANSACTION TYPE<select value={displayedRecordType} onChange={(event) => setRecordType(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800">{transactionTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500">DATE RANGE<select value={datePreset} onChange={(event) => changeDatePreset(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option>This Month</option><option>Today</option><option>All time</option><option>Custom</option></select></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-500">FROM<input aria-label="From date" type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setDatePreset("Custom"); }} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"/></label><label className="text-xs font-semibold text-slate-500">TO<input aria-label="To date" type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setDatePreset("Custom"); }} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"/></label></div>
        <label className="text-xs font-semibold text-slate-500">PARTY<select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option>All customers</option>{partyNames.map((party) => <option key={party}>{party}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500">FIRM<select value={firmFilter} onChange={(event) => setFirmFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option>ALL FIRMS</option>{firmNames.map((firm) => <option key={firm}>{firm}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500">STATUS<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option>All statuses</option>{transactionStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
    </Card>

    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
        <label className="relative w-full max-w-md"><FiSearch className="absolute left-3 top-3 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, party or transaction" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></label>
        <div className="flex items-center gap-2"><Button onClick={exportExcel} className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-700">Export</Button><Button onClick={() => window.print()} className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-700"><FiPrinter/> Print list</Button></div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>{(displayedRecordType === "Credit Note" ? ["Credit Note No.", "Date", "Customer", "Original invoice", "Total amount", "Refunded", "Adjusted / credit", "Status", "Actions"] : ["Date", "Transaction Type", "Reference No.", "Party", "Total", "Received / Paid", "Balance", "Status", "Actions"]).map((label) => <th key={label} className="border-b border-slate-200 px-4 py-3">{label}</th>)}</tr></thead>
          <tbody>{visibleTransactions.map((record) => displayedRecordType === "Credit Note" ? <tr key={record.id} className="border-b border-slate-100 hover:bg-blue-50/60"><td className="px-4 py-3 font-semibold text-slate-900">{record.number}</td><td className="px-4 py-3 text-slate-600">{dateLabel(record.date)}</td><td className="px-4 py-3 text-slate-700">{record.party || "—"}</td><td className="px-4 py-3 text-slate-700">{record.invoiceNumber || "—"}</td><td className="px-4 py-3 text-right font-semibold">{money(record.total)}</td><td className="px-4 py-3 text-right">{money(record.received)}</td><td className="px-4 py-3 text-right">{money(Number(record.adjustedAmount || 0) + Number(record.customerCreditAmount || 0))}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${record.cancelled ? "bg-slate-100 text-slate-500" : record.status === "Refunded" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{record.cancelled ? "Cancelled" : record.status || "Customer Credit"}</span></td><td className="relative px-4 py-3"><button type="button" aria-label={`Actions for Credit Note ${record.number}`} onClick={() => setMenuId(menuId === record.id ? "" : record.id)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><FiMoreHorizontal/></button>{menuId === record.id && <div className="absolute right-4 top-12 z-30 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">{["View", ...(!record.cancelled ? ["Edit", "Print", "Cancel"] : ["Print"])].map((action) => <button key={action} type="button" onClick={() => runAction(action, record)} className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">{action}</button>)}</div>}</td></tr> : <tr key={record.id} className="border-b border-slate-100 hover:bg-blue-50/60"><td className="px-4 py-3 text-slate-600">{dateLabel(record.date)}</td><td className="px-4 py-3 font-medium">{record.type}</td><td className="px-4 py-3">{record.number}</td><td className="px-4 py-3">{record.party}</td><td className="px-4 py-3 text-right">{money(record.total)}</td><td className="px-4 py-3 text-right">{money(record.received)}</td><td className="px-4 py-3 text-right">{money(record.balance)}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${record.status === "Paid" || record.status === "Settled" || record.status === "Completed" ? "bg-emerald-50 text-emerald-700" : record.status === "Cancelled" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{record.status}</span></td><td className="px-4 py-3"><button type="button" onClick={() => handleOpenRow(record)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">{record.type === "Purchase (Job Work)" ? "Edit / Update" : "Open"}</button></td></tr>)}</tbody>
        </table>
        {!visibleTransactions.length && <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700"><FiCalendar size={22}/></div><h2 className="mt-4 font-semibold text-slate-900">No data is available for {displayedRecordType}.</h2><p className="mt-1 max-w-md text-sm text-slate-500">Saved records from the matching USV modules will appear here.</p>{displayedRecordType === "Credit Note" && <Button onClick={openNew} className="mt-4 h-10 rounded-lg bg-blue-700 px-4 text-white"><FiPlus/> Add Credit Note</Button>}</div>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:px-5"><span className="text-slate-600">{visibleTransactions.length} record{visibleTransactions.length === 1 ? "" : "s"}</span><div className="flex gap-6"><span className="text-slate-600">Total amount <b className="ml-1 text-slate-900">{money(totalSum)}</b></span><span className="text-slate-600">Balance <b className="ml-1 text-slate-900">{money(balanceSum)}</b></span></div></footer>
    </Card>

    {editor && <CreditNoteEditor value={editor.value} mode={editor.mode} records={records} parties={parties} invoices={invoices} onChange={(value) => setEditor((current) => ({ ...current, value }))} onClose={() => setEditor(null)} onSave={save}/>}
    {jobWorkEditor && <PurchaseJobWorkEditor initial={jobWorkEditor.id ? jobWorkEditor : null} parties={parties} items={inventoryItems} onClose={() => setJobWorkEditor(null)} onSave={() => setJobWorkEditor(null)}/>}
    {viewDetailModal && <ViewTransactionModal record={viewDetailModal} onClose={() => setViewDetailModal(null)}/>}
  </main>;
}
