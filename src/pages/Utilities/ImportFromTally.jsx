// Lets users preview, validate, and confirm supported Tally master imports.
import { useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiDatabase, FiUpload } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { parseTallyXml } from "../../services/tallyImportParser";
import { mapAndValidateTallyRecords } from "../../services/tallyImportValidation";
import { activateDatabaseTallyImportStorage, getImportedLocalDemoRecords, getTallyImportStorageMode, importRecords, migrateLocalDemoRecords, previewImport } from "../../services/tallyImportStorage";

// Renders the import from tally interface.
function ImportFromTally() {
  // Lets the visible upload button open the file picker.
  const fileInput = useRef(null);
  // These values track the selected file, preview, storage mode, and result.
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState([]);
  const [unsupportedTypes, setUnsupportedTypes] = useState([]);
  const [fileError, setFileError] = useState("");
  const [fallbackReason, setFallbackReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const [localDemoCount, setLocalDemoCount] = useState(0);
  const [storageMessage, setStorageMessage] = useState("");
  const [storageMode, setStorageMode] = useState(getTallyImportStorageMode());

  // Load the local demo count and ignore updates after the page closes.
  useEffect(() => {
    let active = true;
    getImportedLocalDemoRecords().then((local) => {
      if (active) setLocalDemoCount(local.length);
    }).catch((error) => {
      if (active) setFileError(`Local demo records could not be read: ${error.message}`);
    });
    return () => { active = false; };
  }, []);

  // Reads the selected XML and prepares a duplicate-checked preview.
  const chooseFile = async (file) => {
    if (!file) return;
    // Clear old state so a new upload cannot reuse a previous preview.
    setFileName(file.name);
    setFileError("");
    setRecords([]);
    setUnsupportedTypes([]);
    setFallbackReason("");
    setSummary(null);
    setAcknowledged(false);
    if (!file.name.toLowerCase().endsWith(".xml")) {
      setFileError("Choose a Tally Data Interchange .xml export. Other formats are not supported.");
      return;
    }
    try {
      // Parse, map, and check duplicates before showing the preview.
      const parsed = parseTallyXml(await file.text());
      const mapped = mapAndValidateTallyRecords(parsed.records);
      const preview = await previewImport(mapped);
      setRecords(preview.records);
      setUnsupportedTypes(parsed.unsupportedTypes);
      setStorageMode(preview.mode);
      setFallbackReason(preview.fallbackReason || "");
      if (!mapped.length && parsed.unsupportedTypes.length) {
        setFileError("This XML contains no supported party or stock item masters. Unsupported records are listed below.");
      }
    } catch (error) {
      setFileError(error.message || "Could not read this XML file.");
    }
  };

  // Clears the preview without saving any records.
  const cancelPreview = () => {
    setFileName("");
    setRecords([]);
    setUnsupportedTypes([]);
    setAcknowledged(false);
    setSummary(null);
    setFileError("");
    if (fileInput.current) fileInput.current.value = "";
  };

  // Sends only ready records to the selected storage adapter.
  const confirmImport = async () => {
    // Show a busy state while the storage service saves approved rows.
    setSaving(true);
    setSummary(null);
    try {
      const result = await importRecords(records);
      setSummary(result);
      setStorageMode(result.mode);
      if (result.fallbackReason) setFallbackReason(result.fallbackReason);
      if (result.mode === "local-demo") {
        const local = await getImportedLocalDemoRecords();
        setLocalDemoCount(local.length);
      }
    } catch (error) {
      setFileError(`Import could not be completed: ${error.message || "Storage error"}`);
    } finally {
      setSaving(false);
    }
  };

  // Copies local demo records to the database after checking duplicates.
  const migrateLocalRecords = async () => {
    setSaving(true);
    setFileError("");
    try {
      // Keep local source records even after a successful database migration.
      const result = await migrateLocalDemoRecords();
      setSummary({ ...result, mode: result.failed || result.invalid ? "local-demo" : "database", failures: result.failures || [] });
      setStorageMode(result.failed || result.invalid ? "local-demo" : "database");
      const local = await getImportedLocalDemoRecords();
      setLocalDemoCount(local.length);
    } catch (error) {
      setFileError(`Local records were left in demo storage. Database migration could not start: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Checks the backend before selecting it for future imports.
  const switchToDatabase = async () => {
    setSaving(true);
    setStorageMessage("");
    try {
      await activateDatabaseTallyImportStorage();
      setStorageMode("database");
      setStorageMessage("Database is available for future imports. Existing local demo records remain separate until you explicitly migrate them.");
    } catch (error) {
      setStorageMessage(`Database is still unavailable. Local demo records were not changed. ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Use the same row statuses for the preview totals and the confirm button.
  const readyCount = records.filter((record) => record.status === "ready").length;
  const invalidCount = records.filter((record) => record.status === "invalid").length;
  const duplicateCount = records.filter((record) => record.status === "duplicate").length;
  const hasWarnings = records.some((record) => record.warnings.length) || unsupportedTypes.length > 0;
  const isLocalDemo = storageMode === "local-demo";

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Import From Tally</h1>
          <p className="mt-1 text-sm text-slate-500">Upload a Tally XML export to review supported master records before importing.</p>
        </header>

        <Card className="p-5">
          {/* Tell users whether records go to the API or stay in browser storage. */}
          <div className={`mb-4 flex items-start gap-3 rounded-lg p-4 text-sm ${isLocalDemo ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-900"}`}>
            {isLocalDemo ? <FiAlertCircle className="mt-0.5 shrink-0" /> : <FiDatabase className="mt-0.5 shrink-0" />}
            <div>
              <strong>{isLocalDemo ? "Local Demo Storage — Not Synced to Database" : "USV database storage"}</strong>
              <p className="mt-1">{isLocalDemo
                ? "Imports stay in this browser in a separate Tally demo store, outside the application's item and party lists. They are not synced automatically; this page provides an explicit duplicate-checked migration when database storage is available."
                : "Records are saved through the existing USV item and party APIs. This is a file import, not a live connection to Tally."}</p>
              {fallbackReason && <p className="mt-1">The existing database could not be reached during preview ({fallbackReason}); this feature is pinned to local demo storage for this browser.</p>}
            </div>
          </div>
          <p className="text-sm text-slate-600">Supported masters: <strong>customer/supplier ledgers</strong> under Sundry Debtors/Creditors (or Accounts Receivable/Payable), and <strong>stock items</strong>. Tally vouchers, payments, tax ledgers, units, groups, godowns, batches, and other record types are not imported.</p>
          <p className="mt-2 text-sm text-slate-500">Supported file: Tally Data Interchange XML (.xml), up to 10 MB. Excel, CSV, report XML, and direct Tally connections are not supported here.</p>
          {/* Reset the input so selecting the same file again triggers onChange. */}
          <input ref={fileInput} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
          <Button onClick={() => fileInput.current?.click()} className="mt-5 bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiUpload /> Choose Tally XML</Button>
          {fileName && <span className="ml-3 text-sm text-slate-600">{fileName}</span>}
          {fileError && <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{fileError}</p>}
        </Card>

        {/* Keep local records separate and make migration a deliberate action. */}
        {(isLocalDemo || localDemoCount > 0) && <Card className="border border-amber-200 p-5">
          <h2 className="font-bold text-slate-800">Local demo imports on this browser</h2>
          <p className="mt-1 text-sm text-slate-600">{localDemoCount} record{localDemoCount === 1 ? " is" : "s are"} stored separately from {isLocalDemo ? "the database" : "active database records"}. They are never merged automatically.</p>
          {localDemoCount > 0 && <><p className="mt-1 text-sm text-slate-600">When database storage is available, explicitly migrate these records. Existing records are checked; duplicates are skipped and local copies are retained.</p><Button onClick={migrateLocalRecords} disabled={saving} className="mt-4 bg-[#1A1F71] text-white hover:bg-[#14185D]">{saving ? "Checking and migrating..." : "Check duplicates and migrate to database"}</Button></>}
          {isLocalDemo && <Button onClick={switchToDatabase} disabled={saving} className="mt-4 border border-slate-300 text-slate-700 hover:bg-white">{saving ? "Checking database..." : "Use database for future imports"}</Button>}
          {storageMessage && <p role="status" className="mt-3 text-sm text-slate-700">{storageMessage}</p>}
        </Card>}

        {/* List unsupported Tally records so the user sees what will be skipped. */}
        {unsupportedTypes.length > 0 && <Card className="border border-amber-200 p-5">
          <h2 className="font-bold text-amber-900">Unsupported records detected</h2>
          <p className="mt-1 text-sm text-amber-800">These Tally records are not saved or silently converted. Export them separately or review them manually.</p>
          <ul className="mt-3 flex flex-wrap gap-2">{unsupportedTypes.map(({ type, count }) => <li key={type} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{type}: {count}</li>)}</ul>
        </Card>}

        {/* Show mapped values and warnings before any data is saved. */}
        {records.length > 0 && <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div><h2 className="font-bold text-slate-800">Review detected masters</h2><p className="text-sm text-slate-500">{records.length} detected · {readyCount} ready · {invalidCount} invalid · {duplicateCount} duplicate</p></div>
            {/* Enable confirmation only when ready rows exist and warnings are accepted. */}
            <div className="flex gap-2"><Button disabled={saving} onClick={cancelPreview} className="border border-slate-300 text-slate-700 hover:bg-white">Cancel</Button><Button disabled={saving || !readyCount || (hasWarnings && !acknowledged)} onClick={confirmImport} className="bg-emerald-600 text-white hover:bg-emerald-700">{saving ? "Importing..." : "Confirm Import"}</Button></div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Type", "Tally name", "Tally ref", "Group / unit", "Mapped data", "Review"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
              <tbody>{records.map((record) => {
                // Pick the party or item object so one table can display both types.
                const detail = record.recordType === "party" ? record.party : record.item;
                const grouping = record.recordType === "party" ? record.sourceGroup || "Ledger group missing" : detail.unit || "Unit missing";
                const fields = record.recordType === "party"
                  ? [detail.gstin && `GSTIN ${detail.gstin}`, detail.phone && `Phone ${detail.phone}`, detail.openingBalance && `Opening ${detail.openingBalance} ${detail.openingBalanceType === "to-pay" ? "payable" : "receivable"}`, detail.billingAddress && "Address"]
                  : [detail.itemCode && `Code ${detail.itemCode}`, detail.hsn && `HSN ${detail.hsn}`, detail.openingQuantity && `Opening qty ${detail.openingQuantity}`, detail.description && "Description"];
                const review = [...record.errors, ...record.warnings];
                const label = record.status === "duplicate" ? "Duplicate · skip" : record.status === "invalid" ? "Invalid" : record.warnings.length ? "Ready · review warning" : "Ready";
                return <tr key={`${record.recordType}-${record.sourceIndex}`} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 capitalize">{record.recordType}</td><td className="px-4 py-3">{record.sourceName || "(missing name)"}</td><td className="px-4 py-3">{record.sourceReference || "—"}</td><td className="px-4 py-3">{grouping}</td><td className="px-4 py-3">{fields.filter(Boolean).join(" · ") || "Name only"}</td><td className={`max-w-[380px] px-4 py-3 ${record.status === "invalid" ? "text-rose-700" : record.status === "duplicate" || review.length ? "text-amber-800" : "text-emerald-700"}`}><strong>{label}</strong>{review.length > 0 && <ul className="mt-1 list-inside list-disc">{review.map((message) => <li key={message}>{message}</li>)}</ul>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {/* The checkbox confirms the user reviewed fields that will not be imported. */}
          {hasWarnings && <label className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 accent-amber-700" /><span>I reviewed the unsupported fields and record types above. They will not be imported.</span></label>}
        </Card>}

        {/* Report saved, skipped, and failed rows separately. */}
        {summary && <Card className={`p-5 ${summary.failed ? "border border-amber-300" : ""}`}>
          <h2 className="flex items-center gap-2 font-bold text-slate-800">{summary.failed ? <FiAlertCircle className="text-amber-600" /> : <FiCheckCircle className="text-emerald-600" />}Import summary</h2>
          <p className="mt-2 text-sm text-slate-700">Imported: {summary.imported} · Duplicate skipped: {summary.duplicate} · Invalid skipped: {summary.invalid} · Failed: {summary.failed}</p>
          <p className="mt-1 text-xs text-slate-500">Storage: {summary.mode === "local-demo" ? "Local Demo Storage — Not Synced to Database" : "USV database API"}</p>
          {summary.failures.length > 0 && <ul className="mt-3 list-inside list-disc text-sm text-rose-700">{summary.failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}
        </Card>}
      </div>
    </div>
  );
}

export default ImportFromTally;
