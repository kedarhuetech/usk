import { useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiDatabase, FiInfo, FiUpload } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { previewBackupPayload, restoreBackupPayload } from "../../services/backupToComputer.js";
import { VYAPAR_BACKUP_MAX_BYTES } from "../../services/vyaparBackupParser.js";
import { importVyaparPreview, previewVyaparImport } from "../../services/vyaparImportService.js";
import { openVyaparSqlite } from "../../services/vyaparSqliteBrowser.js";

const MAX_USV_BACKUP_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".usvbackup")) return "USV backup";
  if (name.endsWith(".vyb")) return "Vyapar backup";
  return null;
}

function RestoreBackup() {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [format, setFormat] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);
  const [includeCompanyProfile, setIncludeCompanyProfile] = useState(false);
  const [progress, setProgress] = useState("");

  async function selectBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setSelectedFile(file || null);
    setFormat(file ? detectFormat(file) : null);
    setPreview(null);
    setError("");
    setResult(null);
    setIncludeCompanyProfile(false);
    setProgress("");
    if (!file) return;
    const detectedFormat = detectFormat(file);
    if (!detectedFormat) {
      setError("Unsupported file type. Choose a .usvbackup or .vyb file.");
      return;
    }
    if (!file.size) {
      setError("This backup file is empty.");
      return;
    }
    const maxBytes = detectedFormat === "USV backup" ? MAX_USV_BACKUP_BYTES : VYAPAR_BACKUP_MAX_BYTES;
    if (file.size > maxBytes) {
      setError(detectedFormat === "USV backup"
        ? "This backup is larger than the 50 MB browser restore limit."
        : "This Vyapar backup exceeds the 100 MB import limit.");
      return;
    }

    setWorking(true);
    try {
      if (detectedFormat === "USV backup") {
        const payload = JSON.parse(await file.text());
        setPreview({ type: "usv", payload, ...previewBackupPayload(payload) });
      } else {
        setProgress("Checking archive and database format…");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const analyzed = await previewVyaparImport(bytes, { openDatabase: openVyaparSqlite });
        setPreview({ type: "vyapar", ...analyzed });
      }
    } catch (parseError) {
      setError(parseError.message || "This backup is corrupted or unsupported.");
    } finally {
      setWorking(false);
      setProgress("");
    }
  }

  function restoreUsv() {
    if (!preview || preview.type !== "usv" || working) return;
    const summary = preview.entries.map((entry) => `${entry.category}: ${entry.recordCount}`).join("\n");
    if (!window.confirm(`Restore USV backup from ${new Date(preview.createdAt).toLocaleString()}?\n\n${summary || "No business records"}\n\nMatching local data will be replaced. Take a fresh backup first if you need to preserve it.`)) return;
    setWorking(true);
    setError("");
    setResult(null);
    try {
      const restored = restoreBackupPayload(preview.payload);
      setResult(`USV restore completed: ${restored.restoredCount} records saved across ${restored.entries.length} local data stores.`);
    } catch (restoreError) {
      setError(restoreError.message || "Could not restore this backup.");
    } finally {
      setWorking(false);
    }
  }

  async function importVyapar() {
    if (!preview || preview.type !== "vyapar" || working) return;
    const importCount = preview.items.length + preview.parties.length + preview.salesInvoices.length + preview.purchaseInvoices.length
      + preview.receipts.length + preview.payments.length + (includeCompanyProfile && preview.company ? 1 : 0);
    if (!importCount) return;
    const transactionsToImport = preview.salesInvoices.length + preview.purchaseInvoices.length + preview.receipts.length + preview.payments.length;
    if (!window.confirm(`Import ${preview.items.length} products, ${preview.parties.length} parties, and ${transactionsToImport} verified transactions from ${selectedFile.name}?${includeCompanyProfile ? " The current company profile will be replaced." : " Existing records will be kept; duplicates will be skipped."}\n\nInvalid, incomplete, unsupported, and duplicate records will not be imported.`)) return;
    setWorking(true);
    setError("");
    setResult(null);
    setProgress("Saving imported records…");
    try {
      const imported = await importVyaparPreview(preview, {
        includeCompanyProfile,
        onProgress: ({ completed, total, category }) => {
          setProgress(`Saved ${completed} of ${total} local data groups · ${category}`);
          return new Promise((resolve) => requestAnimationFrame(resolve));
        },
      });
      const saved = Object.values(imported.imported).reduce((sum, count) => sum + count, 0);
      const duplicates = Object.values(imported.duplicates).reduce((sum, count) => sum + count, 0);
      const skipped = imported.skipped.reduce((sum, entry) => sum + entry.count, 0);
      setResult(`Vyapar import completed: ${saved} records saved, ${duplicates} duplicates skipped, ${imported.invalidRecords.length} invalid or incomplete records skipped, ${skipped} unsupported records skipped.`);
    } catch (importError) {
      setError(importError.message || "Could not import the Vyapar records.");
    } finally {
      setWorking(false);
      setProgress("");
    }
  }

  const importableCount = preview?.type === "vyapar"
    ? preview.items.length + preview.parties.length + preview.salesInvoices.length + preview.purchaseInvoices.length
      + preview.receipts.length + preview.payments.length + (includeCompanyProfile && preview.company ? 1 : 0)
    : 0;

  return (
    <main className="min-h-full bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <p className="text-sm font-semibold text-blue-700">Sync, Share &amp; Backup</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Restore Backup</h1>
          <p className="mt-2 text-sm text-slate-600">Restore your business data from a USV or Vyapar backup file.</p>
        </header>

        <Card className="p-5 md:p-6">
          <div className="flex items-center gap-3"><FiDatabase className="text-xl text-blue-700" /><h2 className="font-semibold text-slate-900">Restore Backup</h2></div>
          <p className="mt-2 text-sm text-slate-600">Choose a backup to validate it and preview its supported records before restoring.</p>
          <input ref={inputRef} className="sr-only" type="file" accept=".usvbackup,.vyb,application/json,application/octet-stream" onChange={selectBackup} />
          <Button onClick={() => inputRef.current?.click()} disabled={working} className="mt-5 bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:opacity-60"><FiUpload /> Choose Backup File</Button>
          {selectedFile && <div className="mt-3 space-y-1 text-sm text-slate-600"><p className="break-all">{selectedFile.name}</p><p>File size: {formatBytes(selectedFile.size)} · Detected format: {format || "Unsupported"}</p></div>}
          {progress && <p role="status" className="mt-3 text-sm text-blue-800">{progress}</p>}

          {preview?.type === "usv" && <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">Backup preview</h3>
            <p className="mt-1 text-sm text-slate-600">Company: {preview.companyName} · Created: {new Date(preview.createdAt).toLocaleString()}</p>
            {preview.entries.length ? <ul className="mt-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">{preview.entries.map((entry) => <li key={entry.key}>{entry.category}: {entry.recordCount}</li>)}</ul> : <p className="mt-3 text-sm text-slate-600">This backup contains no supported local records.</p>}
            <Button onClick={restoreUsv} disabled={working} className="mt-4 bg-[#1A1F71] text-white disabled:opacity-60">{working ? "Restoring…" : "Restore Records"}</Button>
          </div>}

          {preview?.type === "vyapar" && <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div><h3 className="font-semibold text-slate-900">Backup preview</h3><p className="mt-1 text-sm text-slate-600">Detected company: {preview.company?.companyName || "Not specified"}</p></div>
            {preview.company && <details className="rounded-md border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-slate-800">Company profile details</summary><dl className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">{[["Phone", preview.company.phoneNumber], ["Email", preview.company.emailId], ["GSTIN", preview.company.gstin], ["State", preview.company.state], ["PIN code", preview.company.pincode], ["Address", preview.company.businessAddress], ["Business type", preview.company.businessType], ["Category", preview.company.businessCategory], ["Bank", preview.company.bankName], ["Bank account", preview.company.bankAccountNumber], ["IFSC", preview.company.bankIfscCode]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="inline font-medium">{label}: </dt><dd className="inline">{value}</dd></div>)}</dl></details>}
            <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p>Customers: {preview.counts.customers}</p><p>Suppliers: {preview.counts.suppliers}</p><p>Products ready: {preview.readyCounts.items}</p>
              <p>Sales invoices: {preview.counts.salesInvoices} total · {preview.readyCounts.salesInvoices} ready</p>
              <p>Purchase invoices: {preview.counts.purchaseInvoices} total · {preview.readyCounts.purchaseInvoices} ready</p>
              <p>Receipts: {preview.counts.receipts} · Payments: {preview.counts.payments}</p>
              <p>Returns: {preview.counts.returns}</p><p>Unclassified transactions: {preview.counts.unclassifiedTransactions}</p>
              <p>Unsupported records: {preview.skipped.reduce((sum, entry) => sum + entry.count, 0)}</p>
              <p>Invalid or incomplete records: {preview.invalidRecords.length}</p>
              <p>Already exist in this browser: {Object.values(preview.duplicates).reduce((sum, count) => sum + count, 0)}</p>
            </div>
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <details className="rounded-md border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-slate-800">Products · {preview.items.length} supported</summary><ul className="mt-2 space-y-1 text-sm text-slate-600">{preview.items.slice(0, 20).map((item) => <li key={item.id}>{item.itemName} · code {item.itemCode || "—"} · unit {item.unit || "—"} · sale {item.salePrice || "—"} · purchase {item.purchasePrice || "—"} · stock {item.openingQuantity || "—"} · tax type code {item.sourceTaxType ?? "—"}</li>)}</ul></details>
              <details className="rounded-md border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-slate-800">Parties · {preview.parties.length} supported</summary><ul className="mt-2 space-y-1 text-sm text-slate-600">{preview.parties.slice(0, 20).map((party) => <li key={party.id}>{party.partyName} · {(party.partyTypes || [party.partyType]).join(" & ")} · {party.phone || "no phone"} · GSTIN {party.gstin || "—"} · {party.address || "no address"}</li>)}</ul></details>
              <details className="rounded-md border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-slate-800">Sales invoices · {preview.salesInvoices.length} ready</summary><ul className="mt-2 space-y-2 text-sm text-slate-600">{preview.salesInvoices.slice(0, 20).map((invoice) => <li key={invoice.id}>No. {invoice.form.invoiceNumber} · {invoice.form.invoiceDate} · {invoice.form.customer} · received {invoice.totals.received} · balance {invoice.totals.balance}<ul className="ml-4 list-disc">{invoice.rows.map((row) => <li key={row.id}>{row.item} · {row.qty} {row.unit} × {row.price} · discount {row.discountAmount || row.discountPercent || 0} · tax {row.taxRate} · line total {row.sourceTotalAmount}</li>)}</ul></li>)}</ul></details>
            </div>
            {Object.values(preview.duplicateSamples).some((entries) => entries.length > 0) && <details className="rounded-md border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-slate-800">Duplicate records already in this browser</summary><ul className="mt-2 space-y-1 text-sm text-slate-600">{Object.entries(preview.duplicateSamples).flatMap(([category, entries]) => entries.map((entry) => <li key={category + "-" + entry.id}>{category}: {entry.label}</li>))}</ul></details>}
            {preview.invalidRecords.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-3"><h4 className="font-semibold text-amber-900">Invalid or incomplete records</h4><ul className="mt-2 space-y-1 text-sm text-amber-900">{preview.invalidRecords.map((entry, index) => <li key={`${entry.category}-${entry.sourceId}-${index}`}><strong>{entry.category} · source {entry.sourceId}:</strong> {entry.reason}</li>)}</ul></div>}
            {preview.company && <label className="flex items-start gap-2 border-t border-slate-200 pt-3 text-sm text-slate-700"><input type="checkbox" checked={includeCompanyProfile} onChange={(event) => setIncludeCompanyProfile(event.target.checked)} className="mt-1 accent-blue-700" /><span>Replace this browser’s current company profile with the detected Vyapar profile. This will be included in the confirmation.</span></label>}
            {preview.skipped.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-3"><h4 className="font-semibold text-amber-900">Unsupported records and reasons</h4><ul className="mt-2 space-y-1 text-sm text-amber-900">{preview.skipped.map((entry, index) => <li key={`${entry.category}-${index}`}><strong>{entry.category} · {entry.count}:</strong> {entry.reason}</li>)}</ul></div>}
            <Button onClick={importVyapar} disabled={working || importableCount === 0 || importableCount <= Object.values(preview.duplicates).reduce((sum, count) => sum + count, 0)} className="bg-[#1A1F71] text-white disabled:opacity-60">{working ? "Importing…" : "Import Supported Records"}</Button>
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><FiInfo className="mt-0.5 shrink-0" /><p>Only validated company, party, product, and verified sales invoice records are imported. Unverified transaction types and unsupported data are listed with their reasons.</p></div>
          </div>}
        </Card>

        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</div>}
        {result && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><FiCheckCircle className="mt-0.5 shrink-0" />{result}</div>}
        <Card className="flex items-start gap-3 p-4 text-sm text-slate-600"><FiInfo className="mt-0.5 shrink-0 text-blue-700" /><p>USV restore replaces matching backup data stores after confirmation. Vyapar import keeps existing records and skips duplicates. Both use verified local browser storage writes with rollback on failure.</p></Card>
      </div>
    </main>
  );
}

export default RestoreBackup;
