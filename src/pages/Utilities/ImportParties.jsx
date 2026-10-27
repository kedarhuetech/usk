// Implements the import parties page.
import { useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiDownload, FiTrash2, FiUpload } from "react-icons/fi";
import * as XLSX from "xlsx";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { businessDataApi } from "../../services/apiClient";

const columns = [
  ["partyName", "Party Name", true],
  ["gstin", "GSTIN", false],
  ["phone", "Phone", false],
  ["gstType", "GST Type", false],
  ["state", "State", false],
  ["email", "Email", false],
  ["billingAddress", "Billing Address", false],
  ["shippingAddress", "Shipping Address", false],
  ["openingBalance", "Opening Balance", false],
  ["openingBalanceType", "Opening Balance Type", false],
  ["asOfDate", "As Of Date", false],
  ["creditLimitType", "Credit Limit Type", false],
  ["creditLimit", "Credit Limit", false],
];

// This helper handles result logic.
const normalized = (value) => String(value ?? "").trim();
// This helper handles key logic.
const headerKey = (value) => normalized(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const fieldAliases = {
  partyName: ["party name", "name", "customer name", "supplier name", "vendor name", "business name", "contact name"],
  gstin: ["gstin", "gst number", "gst identification number", "gst no", "gstin number"],
  phone: ["phone", "phone number", "phone no", "mobile", "mobile number", "contact number", "contact no"],
  gstType: ["gst type", "gst registration type", "gst status"],
  state: ["state", "state name"],
  email: ["email", "email address", "e-mail", "e-mail address"],
  billingAddress: ["billing address", "bill to address", "bill address"],
  shippingAddress: ["shipping address", "ship to address", "delivery address", "shipping addr"],
  openingBalance: ["opening balance", "opening bal", "opening amount"],
  openingBalanceType: ["opening balance type", "balance type", "opening bal type"],
  asOfDate: ["as of date", "as on date", "opening balance date", "balance date"],
  creditLimitType: ["credit limit type", "limit type"],
  creditLimit: ["credit limit", "credit limit amount", "credit amount"],
};

const fieldByHeader = new Map();
columns.forEach(([key, label]) => {
  [key, label, ...(fieldAliases[key] || [])].forEach((alias) => fieldByHeader.set(headerKey(alias), key));
});

// Resolves column mappings.
function resolveColumnMappings(headerRow) {
  const mappedFields = new Map();
  const mapping = [];
  headerRow.forEach((header) => {
    const originalHeader = normalized(header);
    if (!originalHeader) return;
    const key = fieldByHeader.get(headerKey(originalHeader));
    if (!key) return;
    if (mappedFields.has(key)) {
      throw new Error(`The columns "${mappedFields.get(key)}" and "${originalHeader}" both map to ${columns.find(([field]) => field === key)?.[1] || key}. Keep only one of these columns.`);
    }
    mappedFields.set(key, originalHeader);
    mapping.push({ key, label: columns.find(([field]) => field === key)?.[1] || key, header: originalHeader });
  });
  if (!mappedFields.has("partyName")) {
    throw new Error("The spreadsheet must include a party name column. Accepted examples: Name, Party Name, Customer Name, Supplier Name, or Vendor Name.");
  }
  return {
    indexes: columns.map(([key]) => ({ key, index: headerRow.findIndex((header) => fieldByHeader.get(headerKey(header)) === key) })),
    mapping,
  };
}

// Parses rows.
function parseRows(rows) {
  if (!rows.length) throw new Error("The spreadsheet is empty.");
  const { indexes, mapping } = resolveColumnMappings(rows[0]);
  const parsedRows = rows.slice(1).filter((row) => row.some((value) => normalized(value))).map((row, index) => {
    const party = {};
    indexes.forEach(({ key, index: columnIndex }) => { party[key] = columnIndex < 0 ? "" : normalized(row[columnIndex]); });
    return { rowNumber: index + 2, ...party };
  });
  return { rows: parsedRows, mapping };
}

// Validates rows.
function validateRows(rows) {
  const seen = new Set();
  return rows.map((row) => {
    const errors = [];
    if (!row.partyName) errors.push("Party Name is required");
    const key = `${row.partyName.toLowerCase()}|${row.phone.replace(/\D/g, "") || row.email.toLowerCase()}`;
    if (seen.has(key)) errors.push("Duplicate party in this file");
    seen.add(key);
    return { ...row, errors };
  });
}

// Renders the import parties interface.
function ImportParties() {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columnMapping, setColumnMapping] = useState([]);
  const [fileError, setFileError] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  // Downloads template.
  const downloadTemplate = () => {
    const headers = columns.map(([, label, required]) => required ? `${label} *` : label);
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(18, header.length + 2) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Parties");
    XLSX.writeFile(workbook, "USV_Parties_Template.xlsx");
  };

  // Handles file.
  const chooseFile = async (file) => {
    if (!file) return;
    setFileError("");
    setStatus({ type: "", message: "" });
    setRows([]);
    setColumnMapping([]);
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setFileError("Choose an .xls or .xlsx party spreadsheet.");
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The workbook does not contain a worksheet.");
      const parsed = parseRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }));
      setRows(validateRows(parsed.rows));
      setColumnMapping(parsed.mapping);
      setFileName(file.name);
    } catch (error) {
      setFileError(error.message || "Could not read this spreadsheet.");
    }
  };

  // Imports rows.
  const importRows = async () => {
    const validRows = rows.filter((row) => !row.errors.length);
    if (!validRows.length) {
      setStatus({ type: "error", message: "There are no valid party rows to import." });
      return;
    }
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      const existing = await businessDataApi.list("parties");
      const keys = new Set(existing.map((party) => `${normalized(party.partyName).toLowerCase()}|${String(party.phone || "").replace(/\D/g, "") || normalized(party.email).toLowerCase()}`));
      let imported = 0;
      let duplicates = 0;
      let failed = 0;
      for (const row of validRows) {
        const key = `${row.partyName.toLowerCase()}|${row.phone.replace(/\D/g, "") || row.email.toLowerCase()}`;
        if (keys.has(key)) {
          duplicates += 1;
          continue;
        }
        try {
          const party = { ...row };
          delete party.rowNumber;
          delete party.errors;
          await businessDataApi.save("parties", { ...party, id: undefined });
          keys.add(key);
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      setStatus({ type: imported ? "success" : "error", message: `Imported ${imported}; skipped ${rows.length - validRows.length} invalid, ${duplicates} duplicate, and ${failed} failed row${failed === 1 ? "" : "s"}.` });
    } catch (error) {
      setStatus({ type: "error", message: `Import stopped before saving because parties could not be checked: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const validCount = rows.filter((row) => !row.errors.length).length;
  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <header><h1 className="text-2xl font-bold text-slate-900">Import Parties</h1><p className="mt-1 text-sm text-slate-500">Upload customer, supplier, or other party records using the existing party database service.</p></header>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5"><h2 className="text-lg font-bold text-slate-800">Download Excel Template</h2><p className="mt-2 text-sm text-slate-500">Use the template columns for supported party fields. <strong>Party Name</strong> is required.</p><Button onClick={downloadTemplate} className="mt-5 bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiDownload /> Download Template</Button></Card>
          <Card className="p-5"><h2 className="text-lg font-bold text-slate-800">Upload your .xls / .xlsx file</h2><p className="mt-2 text-sm text-slate-500">Drag a party spreadsheet here or browse for a file.</p><div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }} className="mt-4 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-7 text-center"><FiUpload className="mx-auto h-8 w-8 text-slate-400" /><Button onClick={() => inputRef.current?.click()} className="mt-3 border border-slate-300 text-slate-700 hover:bg-white">Browse</Button><input ref={inputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} /></div>{fileName && <div className="mt-3 flex items-center justify-between rounded bg-slate-100 p-3 text-sm"><span>{fileName}</span><button type="button" aria-label="Remove selected file" onClick={() => { setFileName(""); setRows([]); setFileError(""); }} className="text-rose-600"><FiTrash2 /></button></div>}</Card>
        </div>
        {fileError && <p role="alert" className="flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle />{fileError}</p>}
        {status.message && <p role={status.type === "error" ? "alert" : "status"} className={`flex gap-2 rounded-lg p-3 text-sm ${status.type === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}><FiCheckCircle />{status.message}</p>}
        {rows.length > 0 &&         <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-slate-800">Preview before import</h2><p className="text-sm text-slate-500">{rows.length} rows · {validCount} valid · {rows.length - validCount} invalid</p></div><div className="flex gap-3"><Button onClick={() => { setRows([]); setFileName(""); setColumnMapping([]); }} className="border border-slate-300 text-slate-700 hover:bg-white">Cancel</Button><Button onClick={importRows} disabled={saving || !validCount} className="bg-emerald-600 text-white hover:bg-emerald-700">{saving ? "Importing..." : "Confirm Import"}</Button></div></div>{columnMapping.length > 0 && <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600"><strong>Detected columns:</strong> {columnMapping.map(({ header, label }) => `${header} → ${label}`).join(" · ")}</div>}<div className="max-h-96 overflow-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Row</th><th className="px-5 py-3">Party Name</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Validation</th></tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber} className="border-t border-slate-100"><td className="px-5 py-3">{row.rowNumber}</td><td className="px-5 py-3">{row.partyName || "-"}</td><td className="px-5 py-3">{row.phone || "-"}</td><td className="px-5 py-3">{row.email || "-"}</td><td className="px-5 py-3">{row.partyType || "Party"}</td><td className={`px-5 py-3 ${row.errors.length ? "text-rose-700" : "text-emerald-700"}`}>{row.errors.length ? row.errors.join("; ") : "Ready"}</td></tr>)}</tbody></table></div></Card>}
      </div>
    </div>
  );
}

export default ImportParties;
