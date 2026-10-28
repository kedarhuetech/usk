import { useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiDownload, FiInfo, FiShield } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import {
  BACKUP_LAST_CREATED_KEY,
  collectBackupData,
  createBackupPayload,
  downloadBackupFile,
} from "../../services/backupToComputer.js";

function readLastBackup() {
  try {
    return window.localStorage.getItem(BACKUP_LAST_CREATED_KEY) || "";
  } catch {
    return "";
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function BackupToComputer() {
  const [lastBackupAt, setLastBackupAt] = useState(readLastBackup);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const createBackup = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const payload = createBackupPayload(collectBackupData());
      const result = await downloadBackupFile(payload);
      setLastBackupAt(payload.createdAt);
      try {
        window.localStorage.setItem(BACKUP_LAST_CREATED_KEY, payload.createdAt);
      } catch {
        // The download has already started; keep the successful state for this page session.
      }
      setStatus({ type: "success", text: `Backup download started: ${result.filename}`, payload });
    } catch (error) {
      if (error.name === "AbortError") {
        setStatus({ type: "info", text: "Backup cancelled. No file was saved." });
      } else {
        setStatus({ type: "error", text: error.message || "Could not create the backup file." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-full bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <p className="text-sm font-semibold text-blue-700">Sync, Share &amp; Backup</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Backup To Computer</h1>
          <p className="mt-2 text-sm text-slate-600">Save a portable copy of supported USV business records currently stored in this browser.</p>
        </header>

        <Card className="p-5 md:p-7">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Create a local data backup</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">The backup includes available company profile, items, parties, sales, purchases, payments, cash adjustments, cheques, and loan records. Data saved only in the backend is not included.</p>
              <p className="mt-3 text-sm text-slate-500">Last backup: <strong className="font-medium text-slate-700">{lastBackupAt ? formatDate(lastBackupAt) : "Not created yet"}</strong></p>
            </div>
            <Button onClick={createBackup} disabled={busy} className="shrink-0 bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:cursor-wait disabled:opacity-60">
              <FiDownload className={busy ? "animate-pulse" : ""} /> {busy ? "Preparing backup…" : "Create Backup"}
            </Button>
          </div>
        </Card>

        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <FiInfo className="mt-0.5 shrink-0" />
          <p>USV creates a <code>.usvbackup</code> file. When supported, your browser opens a Save dialog; otherwise, it starts a normal browser download using your download settings. Creating a backup does not change your saved records.</p>
        </div>

        {status && <div role={status.type === "error" ? "alert" : "status"} className={`rounded-lg border p-4 text-sm ${status.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-700"}`}>
          <div className="flex items-start gap-2">{status.type === "success" ? <FiCheckCircle className="mt-0.5 shrink-0" /> : status.type === "error" ? <FiAlertCircle className="mt-0.5 shrink-0" /> : <FiInfo className="mt-0.5 shrink-0" />}<div><p>{status.text}</p>{status.payload && <><p className="mt-2 font-semibold">Included categories: {status.payload.manifest.categories.join(", ") || "No saved categories"}</p><p className="mt-1 text-xs">{status.payload.manifest.included.length} storage entries included. Credential-like fields were removed ({status.payload.manifest.redactedFields.length}).</p></>}</div></div>
        </div>}

        <Card className="flex items-start gap-3 p-5 text-sm text-slate-600">
          <FiShield className="mt-0.5 shrink-0 text-emerald-700" />
          <p>The backup is assembled from an explicit list of USV LocalStorage repositories. Passcodes, tokens, API secrets, and backend-only bank account data are excluded. Restore is not part of this feature.</p>
        </Card>
      </div>
    </main>
  );
}

export default BackupToComputer;
