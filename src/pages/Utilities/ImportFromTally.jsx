// Multi-step TallyPrime XML Data Interchange importer with MySQL persistence, tabbed preview, duplicate control, and batch audit history.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiInfo,
  FiUpload,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { parseTallyXml, tallyXmlMaxBytes } from "../../services/tallyImportParser";
import { mapAndValidateTallyRecords } from "../../services/tallyImportValidation";
import {
  checkTallyFileHash,
  getTallyImportBatches,
  importRecords,
  previewImport,
} from "../../services/tallyImportStorage";

async function sha256Hex(text) {
  try {
    if (!globalThis.crypto?.subtle) return "";
    const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ImportFromTally() {
  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [fileMeta, setFileMeta] = useState(null);
  const [xmlMeta, setXmlMeta] = useState(null);
  const [records, setRecords] = useState([]);
  const [unsupportedTypes, setUnsupportedTypes] = useState([]);
  const [activeTab, setActiveTab] = useState("customers");
  const [duplicateAction, setDuplicateAction] = useState("skip");
  const [updateConfirmed, setUpdateConfirmed] = useState(false);
  const [fileError, setFileError] = useState("");
  const [repeatWarning, setRepeatWarning] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [batches, setBatches] = useState([]);

  const refreshBatches = async () => {
    const list = await getTallyImportBatches(10);
    setBatches(list);
  };

  useEffect(() => {
    let active = true;
    getTallyImportBatches(10).then((list) => {
      if (active) setBatches(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const chooseFile = async (file) => {
    if (!file) return;
    setFileMeta({ name: file.name, size: file.size, hash: "" });
    setXmlMeta(null);
    setFileError("");
    setRepeatWarning(null);
    setRecords([]);
    setUnsupportedTypes([]);
    setSummary(null);
    setAcknowledged(false);
    setDuplicateAction("skip");
    setUpdateConfirmed(false);

    if (!file.name.toLowerCase().endsWith(".xml")) {
      setFileError("Choose a Tally Data Interchange .xml export. Other formats are not supported.");
      return;
    }
    if (file.size > tallyXmlMaxBytes) {
      setFileError("XML files must be 10 MB or smaller.");
      return;
    }

    try {
      const xmlText = await file.text();
      const hash = await sha256Hex(xmlText);
      setFileMeta({ name: file.name, size: file.size, hash });

      if (hash) {
        const hashCheck = await checkTallyFileHash(hash);
        if (hashCheck.alreadyImported) {
          setRepeatWarning(hashCheck.match);
        }
      }

      const parsed = parseTallyXml(xmlText);
      const mapped = mapAndValidateTallyRecords(parsed.records);
      const preview = await previewImport(mapped);
      setXmlMeta(parsed.metadata || {});
      setRecords(preview.records);
      setUnsupportedTypes(parsed.unsupportedTypes);

      const hasCust = preview.records.some((r) => r.recordType === "party" && r.partyType === "customer" && r.status !== "invalid");
      const hasSupp = preview.records.some((r) => r.recordType === "party" && r.partyType === "supplier" && r.status !== "invalid");
      const hasItems = preview.records.some((r) => r.recordType === "item" && r.status !== "invalid");
      if (hasCust) setActiveTab("customers");
      else if (hasSupp) setActiveTab("suppliers");
      else if (hasItems) setActiveTab("items");
      else if (preview.records.some((r) => r.status === "invalid")) setActiveTab("errors");
      else setActiveTab("unsupported");

      if (!mapped.length && parsed.unsupportedTypes.length) {
        setFileError("This XML contains no supported customer, supplier, or stock item masters. Unsupported records are listed below.");
      }
    } catch (error) {
      setFileError(error.message || "Could not read this XML file.");
    }
  };

  const cancelPreview = () => {
    setFileMeta(null);
    setXmlMeta(null);
    setRecords([]);
    setUnsupportedTypes([]);
    setAcknowledged(false);
    setDuplicateAction("skip");
    setUpdateConfirmed(false);
    setRepeatWarning(null);
    setSummary(null);
    setFileError("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const customers = useMemo(() => records.filter((r) => r.recordType === "party" && r.partyType === "customer" && r.status !== "invalid"), [records]);
  const suppliers = useMemo(() => records.filter((r) => r.recordType === "party" && r.partyType === "supplier" && r.status !== "invalid"), [records]);
  const stockItems = useMemo(() => records.filter((r) => r.recordType === "item" && r.status !== "invalid"), [records]);
  const errorRecords = useMemo(() => records.filter((r) => r.status === "invalid"), [records]);

  const readyCount = records.filter((r) => r.status === "ready").length;
  const duplicateCount = records.filter((r) => r.status === "duplicate").length;
  const invalidCount = errorRecords.length;
  const unsupportedCount = unsupportedTypes.reduce((sum, entry) => sum + entry.count, 0);
  const hasWarnings = records.some((r) => r.warnings.length) || unsupportedTypes.length > 0;
  const actionableCount = readyCount + (duplicateAction === "update" ? duplicateCount : 0);

  const confirmImport = async () => {
    setSaving(true);
    setSummary(null);
    setProgress({ done: 0, total: records.length });
    try {
      const result = await importRecords(records, {
        duplicateAction,
        fileName: fileMeta?.name || "tally-export.xml",
        fileHash: fileMeta?.hash || "",
        tallyCompanyName: xmlMeta?.companyName || "",
        unsupportedCount,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setSummary(result);
      await refreshBatches();
    } catch (error) {
      setFileError(`Import could not be completed: ${error.message || "Storage error"}`);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "customers", label: `Customers (${customers.length})` },
    { id: "suppliers", label: `Suppliers (${suppliers.length})` },
    { id: "items", label: `Stock Items (${stockItems.length})` },
    { id: "unsupported", label: `Skipped / Unsupported (${unsupportedCount})` },
    { id: "errors", label: `Errors (${invalidCount})` },
  ];

  const currentTabRows = activeTab === "customers"
    ? customers
    : activeTab === "suppliers"
      ? suppliers
      : activeTab === "items"
        ? stockItems
        : activeTab === "errors"
          ? errorRecords
          : [];

  const hasAnalysis = records.length > 0 || unsupportedTypes.length > 0;

  return (
    <div className="min-h-full bg-slate-100 p-5 sm:p-6">
      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Import From Tally</h1>
        </header>

        {/* Step 1: Upload Tally XML */}
        <div className={hasAnalysis ? "space-y-5" : "grid gap-5 lg:grid-cols-12 items-stretch"}>
          <Card className={`p-5 sm:p-6 flex flex-col justify-between space-y-4 ${hasAnalysis ? "" : "lg:col-span-8"}`}>
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                <div className="flex items-start gap-2.5">
                  <FiInfo className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <strong>How to export from TallyPrime:</strong> Open TallyPrime &rarr; <b>Alt+G</b> (List of Accounts) &rarr; <b>Alt+E</b> (Export &rarr; Current) &rarr; Configure <b>File Format: XML (Data Interchange)</b> &amp; <b>Type of Master: All Masters</b> &rarr; Send &amp; upload the saved <code>.xml</code> file below.
                  </div>
                </div>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const dropped = e.dataTransfer?.files?.[0];
                  if (dropped) chooseFile(dropped);
                }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition ${
                  hasAnalysis ? "p-5" : "min-h-[250px] p-8"
                } ${
                  dragging ? "border-[#FF5A1F] bg-orange-50/60" : "border-slate-300 bg-slate-50/70"
                }`}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  className="hidden"
                  onChange={(event) => {
                    chooseFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200">
                  <FiUpload className="h-5 w-5 text-[#1A1F71]" />
                </div>
                <p className="mt-3 text-base font-semibold text-slate-800">
                  Drag &amp; drop your Tally XML export here
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Supports TallyPrime &amp; Tally.ERP 9 XML Data Interchange files up to 10 MB
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <Button onClick={() => fileInput.current?.click()} className="bg-[#1A1F71] text-white hover:bg-[#14185D]">
                    <FiUpload /> Choose Tally XML
                  </Button>
                  {fileMeta && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200">
                      <FiFileText /> {fileMeta.name} ({formatBytes(fileMeta.size)})
                      <button type="button" onClick={cancelPreview} aria-label="Clear file" className="ml-1 text-slate-400 hover:text-rose-600">
                        <FiX />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {repeatWarning && (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <FiAlertCircle className="mt-0.5 shrink-0 text-amber-600" />
                <span>
                  This exact XML file (<code>{repeatWarning.fileName}</code>) was already imported on{" "}
                  <b>{new Date(repeatWarning.createdAt).toLocaleString()}</b> ({repeatWarning.importedCount} imported, {repeatWarning.updatedCount} updated). Existing records will be skipped unless you choose to update them.
                </span>
              </div>
            )}

            {fileError && (
              <p role="alert" className="flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                <FiAlertCircle className="mt-0.5 shrink-0" />
                {fileError}
              </p>
            )}
          </Card>

          {!hasAnalysis && (
            <Card className="p-5 sm:p-6 lg:col-span-4 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                    What Gets Imported
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Records are previewed and checked for duplicates before anything is saved.
                  </p>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="font-semibold text-emerald-900">Customers</div>
                    <p className="mt-0.5 text-emerald-800/90">
                      Customer accounts from Tally (Sundry Debtors) — imports name, GSTIN, phone, email, address &amp; opening balance.
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                    <div className="font-semibold text-blue-900">Suppliers</div>
                    <p className="mt-0.5 text-blue-800/90">
                      Supplier / vendor accounts from Tally (Sundry Creditors) — imports contact, tax &amp; opening balance details.
                    </p>
                  </div>
                  <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3">
                    <div className="font-semibold text-violet-900">Stock Items</div>
                    <p className="mt-0.5 text-violet-800/90">
                      Products with name, item code, unit, HSN, GST %, opening stock, and rates.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="font-semibold text-slate-700">Safely Skipped</div>
                    <p className="mt-0.5 text-slate-600">
                      Bills/vouchers, payments, cash/tax ledgers, godowns, and batches are skipped so your existing records stay safe.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Step 2: Analysis Summary */}
        {(records.length > 0 || unsupportedTypes.length > 0) && (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-800">XML Analysis</h2>
              {xmlMeta?.companyName && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Tally Company: {xmlMeta.companyName}
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Customers", customers.length, "bg-emerald-50 text-emerald-800"],
                ["Suppliers", suppliers.length, "bg-blue-50 text-blue-800"],
                ["Stock Items", stockItems.length, "bg-violet-50 text-violet-800"],
                ["Duplicates", duplicateCount, "bg-amber-50 text-amber-800"],
                ["Unsupported", unsupportedCount, "bg-slate-100 text-slate-700"],
                ["Errors", invalidCount, "bg-rose-50 text-rose-800"],
              ].map(([label, count, cls]) => (
                <div key={label} className={`rounded-lg px-3 py-2.5 ${cls}`}>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-lg font-bold">{count}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Step 3 & 4: Tabbed Preview + Duplicate Policy + Confirm */}
        {(records.length > 0 || unsupportedTypes.length > 0) && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="flex flex-wrap gap-1.5">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      activeTab === tab.id
                        ? "bg-[#1A1F71] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button disabled={saving} onClick={cancelPreview} className="border border-slate-300 text-slate-700 hover:bg-white">
                  Cancel
                </Button>
                <Button
                  disabled={saving || !actionableCount || (hasWarnings && !acknowledged) || (duplicateAction === "update" && duplicateCount > 0 && !updateConfirmed)}
                  onClick={confirmImport}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {saving ? `Importing (${progress.done}/${progress.total})...` : `Confirm Import (${actionableCount})`}
                </Button>
              </div>
            </div>

            {duplicateCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50/70 px-4 py-3 text-sm">
                <div>
                  <strong className="text-amber-900">Duplicate Handling ({duplicateCount} matching existing Udyog record{duplicateCount === 1 ? "" : "s"}):</strong>
                  <div className="mt-1 flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="duplicateAction"
                        checked={duplicateAction === "skip"}
                        onChange={() => { setDuplicateAction("skip"); setUpdateConfirmed(false); }}
                      />
                      <span>Skip existing records (recommended)</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="duplicateAction"
                        checked={duplicateAction === "update"}
                        onChange={() => setDuplicateAction("update")}
                      />
                      <span>Update existing matching records</span>
                    </label>
                  </div>
                </div>
                {duplicateAction === "update" && (
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-rose-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateConfirmed}
                      onChange={(e) => setUpdateConfirmed(e.target.checked)}
                      className="accent-rose-600"
                    />
                    <span>I confirm updating {duplicateCount} existing record(s) in MySQL</span>
                  </label>
                )}
              </div>
            )}

            {activeTab === "unsupported" ? (
              <div className="p-5">
                {unsupportedTypes.length === 0 ? (
                  <p className="text-sm text-slate-500">No unsupported record types detected.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      These Tally XML elements are not imported or silently converted into invoices/transactions:
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {unsupportedTypes.map(({ type, count }) => (
                        <li key={type} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                          {type}: {count}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-[920px] w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      {["Tally Name", "Group / Unit", "Mapped Fields", "Status & Notes"].map((label) => (
                        <th key={label} className="border-b border-slate-200 px-4 py-3">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentTabRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          No records in this category.
                        </td>
                      </tr>
                    ) : currentTabRows.map((record) => {
                      const detail = record.recordType === "party" ? record.party : record.item;
                      const grouping = record.recordType === "party"
                        ? record.sourceGroup || "Ledger group missing"
                        : detail.unit || "Unit missing";
                      const mappedFields = record.recordType === "party"
                        ? [
                            detail.partyType && `Type: ${detail.partyType}`,
                            detail.gstin && `GSTIN: ${detail.gstin}`,
                            detail.pan && `PAN: ${detail.pan}`,
                            detail.phone && `Phone: ${detail.phone}`,
                            detail.email && `Email: ${detail.email}`,
                            detail.openingBalance && `Opening: ${detail.openingBalance} (${detail.openingBalanceType === "to-pay" ? "Payable" : "Receivable"})`,
                            detail.billingAddress && "Address",
                          ]
                        : [
                            detail.itemCode && `Code: ${detail.itemCode}`,
                            detail.hsn && `HSN: ${detail.hsn}`,
                            detail.taxRate && `Tax: ${detail.taxRate}`,
                            detail.purchasePrice && `Rate: ${detail.purchasePrice}`,
                            detail.salePrice && `Sale: ${detail.salePrice}`,
                            detail.openingQuantity && `Opening Qty: ${detail.openingQuantity}`,
                            detail.description && "Description",
                          ];
                      const notes = [...record.errors, ...record.warnings];
                      const statusLabel = record.status === "duplicate"
                        ? (duplicateAction === "update" ? "Duplicate · will update" : "Duplicate · will skip")
                        : record.status === "invalid"
                          ? "Invalid"
                          : record.warnings.length
                            ? "Ready · review note"
                            : "Ready";

                      return (
                        <tr key={`${record.recordType}-${record.sourceIndex}`} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {record.sourceName || "(missing name)"}
                            {record.sourceReference && <span className="block text-xs font-normal text-slate-400">{record.sourceReference}</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{grouping}</td>
                          <td className="px-4 py-3 text-slate-700">{mappedFields.filter(Boolean).join(" · ") || "Name only"}</td>
                          <td className={`max-w-[380px] px-4 py-3 ${
                            record.status === "invalid"
                              ? "text-rose-700"
                              : record.status === "duplicate" || notes.length
                                ? "text-amber-800"
                                : "text-emerald-700"
                          }`}>
                            <strong>{statusLabel}</strong>
                            {notes.length > 0 && (
                              <ul className="mt-1 list-inside list-disc text-xs">
                                {notes.map((msg) => <li key={msg}>{msg}</li>)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {hasWarnings && (
              <label className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-1 accent-amber-700"
                />
                <span>I reviewed the mapped fields, warnings, and unsupported record types above.</span>
              </label>
            )}
          </Card>
        )}

        {/* Step 6: Import Results */}
        {summary && (
          <Card className={`p-5 ${summary.failed ? "border border-amber-300" : "border border-emerald-200"}`}>
            <h2 className="flex items-center gap-2 font-bold text-slate-800">
              {summary.failed ? <FiAlertCircle className="text-amber-600" /> : <FiCheckCircle className="text-emerald-600" />}
              Import Summary
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              Imported: <b>{summary.imported}</b> · Updated: <b>{summary.updated}</b> · Duplicate skipped: <b>{summary.duplicate}</b> · Invalid skipped: <b>{summary.invalid}</b> · Failed: <b>{summary.failed}</b> · Unsupported: <b>{unsupportedCount}</b>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Storage: {summary.mode === "database" ? "Saved permanently in MySQL (Parties & Items)" : `Local browser cache (${summary.fallbackReason || "offline mode"})`}
            </p>
            {summary.failures.length > 0 && (
              <ul className="mt-3 list-inside list-disc text-sm text-rose-700">
                {summary.failures.map((failure) => <li key={failure}>{failure}</li>)}
              </ul>
            )}
          </Card>
        )}

        {/* Import History Audit Log */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <FiClock className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-800">Recent Tally Import History</h2>
            </div>
            {batches.length > 0 && (
              <span className="text-xs text-slate-500">{batches.length} recent batch{batches.length === 1 ? "" : "es"}</span>
            )}
          </div>
          {batches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    {["Date", "File Name", "Tally Company", "Imported", "Updated", "Skipped", "Failed", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{new Date(b.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{b.fileName}</td>
                      <td className="px-4 py-2.5 text-slate-600">{b.tallyCompanyName || "—"}</td>
                      <td className="px-4 py-2.5 text-emerald-700 font-semibold">{b.importedCount}</td>
                      <td className="px-4 py-2.5 text-blue-700 font-semibold">{b.updatedCount}</td>
                      <td className="px-4 py-2.5 text-slate-600">{b.skippedCount}</td>
                      <td className="px-4 py-2.5 text-rose-700 font-semibold">{b.failedCount}</td>
                      <td className="px-4 py-2.5 capitalize">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-6 text-center text-xs text-slate-500">
              No Tally imports recorded yet. Completed XML imports will appear here for audit tracking.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default ImportFromTally;
