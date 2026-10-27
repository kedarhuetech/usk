// Implements the export to tally page.
import { useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiDownload } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { businessDataApi } from "../../services/apiClient";

const transactionTypes = [
  { value: "sale", label: "Sale", resource: "sales-invoices" },
  { value: "purchase", label: "Purchase", resource: "purchase-bills" },
];

// This helper handles escape logic.
const xmlEscape = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

// This helper handles result logic.
const text = (value) => String(value ?? "").trim();

// This helper handles date logic.
function recordDate(record) {
  return text(record.form?.invoiceDate || record.invoiceDate || record.date || record.createdAt).slice(0, 10);
}

// This helper handles number logic.
function recordNumber(record) {
  return text(record.form?.invoiceNumber || record.invoiceNumber || record.billNumber || record.number);
}

// This helper handles name logic.
function partyName(record) {
  return text(record.form?.customer || record.customer || record.partyName || record.party || record.supplier);
}

// This helper handles result logic.
function amount(record) {
  return Number(record.totals?.finalTotal ?? record.totals?.amount ?? record.total ?? record.amount);
}

// Makes the record value consistent.
function normalizeRecord(record, type) {
  return {
    ...record,
    exportType: type,
    exportTypeLabel: transactionTypes.find((entry) => entry.value === type)?.label || type,
    exportDate: recordDate(record),
    exportNumber: recordNumber(record),
    exportParty: partyName(record),
    exportAmount: amount(record),
  };
}

// Validates record.
function validateRecord(record) {
  const errors = [];
  if (!/^\d{8}$/.test(record.exportDate.replace(/-/g, ""))) errors.push("valid date is missing");
  if (!record.exportNumber) errors.push("invoice/bill number is missing");
  if (!record.exportParty) errors.push("party/customer is missing");
  if (!Number.isFinite(record.exportAmount) || record.exportAmount < 0) errors.push("total amount is invalid");
  if (!Array.isArray(record.rows) || !record.rows.some((row) => text(row.item) && Number(row.qty || row.calculated?.qty) > 0)) errors.push("valid item rows are missing");
  return errors;
}

// Downloads xml.
function downloadXml(name, content) {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

// This helper handles xml logic.
function masterXml(records) {
  const parties = [...new Set(records.map((record) => record.exportParty).filter(Boolean))];
  const items = [...new Set(records.flatMap((record) => (record.rows || []).map((row) => text(row.item)).filter(Boolean)))];
  const partyMasters = parties.map((name) => `<LEDGER NAME="${xmlEscape(name)}" ACTION="Create"><NAME.LIST><NAME>${xmlEscape(name)}</NAME></NAME.LIST><PARENT> sundry debtors </PARENT></LEDGER>`).join("");
  const itemMasters = items.map((name) => `<STOCKITEM NAME="${xmlEscape(name)}" ACTION="Create"><NAME.LIST><NAME>${xmlEscape(name)}</NAME></NAME.LIST><BASEUNITS>pcs</BASEUNITS></STOCKITEM>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY></SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${partyMasters}${itemMasters}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

// This helper handles xml logic.
function voucherXml(records) {
  const vouchers = records.map((record) => {
    const isPurchase = record.exportType === "purchase";
    // Handles result.
    const rows = (record.rows || []).filter((row) => text(row.item) && Number(row.qty || row.calculated?.qty) > 0);
    const inventory = rows.map((row) => {
      const quantity = Number(row.qty || row.calculated?.qty || 0);
      const lineAmount = Number(row.calculated?.amount ?? row.amount ?? 0);
      return `<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>${xmlEscape(row.item)}</STOCKITEMNAME><ISDEEMEDPOSITIVE>${isPurchase ? "No" : "Yes"}</ISDEEMEDPOSITIVE><ACTUALQTY>${quantity} pcs</ACTUALQTY><BILLEDQTY>${quantity} pcs</BILLEDQTY><RATE>${lineAmount / quantity}</RATE><AMOUNT>${isPurchase ? lineAmount : -lineAmount}</AMOUNT></ALLINVENTORYENTRIES.LIST>`;
    }).join("");
    const total = isPurchase ? record.exportAmount : -record.exportAmount;
    return `<TALLYMESSAGE><VOUCHER VCHTYPE="${isPurchase ? "Purchase" : "Sales"}" ACTION="Create"><DATE>${record.exportDate.replace(/-/g, "")}</DATE><VOUCHERNUMBER>${xmlEscape(record.exportNumber)}</VOUCHERNUMBER><VOUCHERTYPENAME>${isPurchase ? "Purchase" : "Sales"}</VOUCHERTYPENAME><PARTYLEDGERNAME>${xmlEscape(record.exportParty)}</PARTYLEDGERNAME><PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW><ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(record.exportParty)}</LEDGERNAME><ISDEEMEDPOSITIVE>${isPurchase ? "No" : "Yes"}</ISDEEMEDPOSITIVE><AMOUNT>${total}</AMOUNT></ALLLEDGERENTRIES.LIST>${inventory}</VOUCHER></TALLYMESSAGE>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY></SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${vouchers}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

// Renders the export to tally interface.
function ExportToTally() {
  const [records, setRecords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: "", message: "" });

  useEffect(() => {
    let active = true;
    Promise.all(transactionTypes.map(async ({ value, resource }) => (
      (await businessDataApi.list(resource)).map((record) => normalizeRecord(record, value))
    ))).then((groups) => {
      if (active) setRecords(groups.flat());
    }).catch((error) => {
      if (active) setStatus({ type: "error", message: `Transactions could not be loaded: ${error.message}` });
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => records.filter((record) => (
    (typeFilter === "all" || record.exportType === typeFilter)
    && (!fromDate || record.exportDate >= fromDate)
    && (!toDate || record.exportDate <= toDate)
  )), [records, typeFilter, fromDate, toDate]);

  const selected = useMemo(() => selectedIds.size
    ? filtered.filter((record) => selectedIds.has(record.id))
    : filtered, [filtered, selectedIds]);
  const invalid = selected.map((record) => ({ record, errors: validateRecord(record) })).filter((entry) => entry.errors.length);
  const valid = selected.filter((record) => !validateRecord(record).length);

  // Toggles result.
  const toggle = (id) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // Exports tally.
  const exportTally = () => {
    if (!valid.length) {
      setStatus({ type: "error", message: `No valid records to export. ${invalid.length} record${invalid.length === 1 ? "" : "s"} skipped.` });
      return;
    }
    downloadXml("USV_Tally_Master.xml", masterXml(valid));
    downloadXml("USV_Tally_Vouchers.xml", voucherXml(valid));
    setStatus({ type: "success", message: `Exported ${valid.length} record${valid.length === 1 ? "" : "s"}; skipped ${invalid.length}. Masters and vouchers XML files downloaded. Import them manually into Tally.` });
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header><h1 className="text-2xl font-bold text-slate-900">Export to Tally</h1><p className="mt-1 text-sm text-slate-500">Review saved USV sales and purchases before downloading Tally-compatible XML files.</p></header>
        <Card className="p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">From date<input aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-300 px-2 font-normal" /></label>
            <label className="text-sm font-semibold text-slate-700">To date<input aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-300 px-2 font-normal" /></label>
            <label className="text-sm font-semibold text-slate-700">Transaction type<select aria-label="Transaction type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-300 px-2 font-normal"><option value="all">All supported types</option><option value="sale">Sale</option><option value="purchase">Purchase</option></select></label>
            <div className="flex items-end"><Button onClick={exportTally} disabled={loading || !selected.length} className="w-full bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiDownload /> Export to Tally</Button></div>
          </div>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Only saved Sale and Purchase records are supported. Tally import is manual; importing the same vouchers again may create duplicates.</p>
          {status.message && <p role={status.type === "error" ? "alert" : "status"} className={`mt-4 flex gap-2 rounded-lg p-3 text-sm ${status.type === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{status.type === "error" ? <FiAlertCircle /> : <FiCheckCircle />}{status.message}</p>}
        </Card>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-slate-800">Transactions for export</h2><p className="text-sm text-slate-500">{loading ? "Loading transactions..." : `${filtered.length} shown · ${valid.length} valid · ${invalid.length} skipped`}</p></div></div>
          {!loading && invalid.length > 0 && <div className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Records requiring attention:</strong> {invalid.map(({ record, errors }) => `${record.exportTypeLabel} ${record.exportNumber || record.id}: ${errors.join(", ")}`).join(" | ")}</div>}
          {loading ? <p className="p-5 text-sm text-slate-500">Loading saved transactions...</p> : !filtered.length ? <p className="p-5 text-sm text-slate-500">No saved transactions match these filters.</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Select</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Number</th><th className="px-5 py-3">Party</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Total</th></tr></thead><tbody>{filtered.map((record) => <tr key={`${record.exportType}-${record.id}`} className="border-t border-slate-100"><td className="px-5 py-3"><input type="checkbox" checked={selectedIds.has(record.id)} onChange={() => toggle(record.id)} className="accent-blue-600" /></td><td className="px-5 py-3">{record.exportDate || "-"}</td><td className="px-5 py-3">{record.exportNumber || "-"}</td><td className="px-5 py-3">{record.exportParty || "-"}</td><td className="px-5 py-3">{record.exportTypeLabel}</td><td className="px-5 py-3">{record.form?.paymentType || record.paymentType || "-"}</td><td className="px-5 py-3">{Number.isFinite(record.exportAmount) ? record.exportAmount.toFixed(2) : "-"}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>
    </div>
  );
}

export default ExportToTally;
