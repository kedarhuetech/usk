import { useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiDatabase, FiInfo, FiUpload } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { previewBackupPayload, restoreBackupPayload } from "../../services/backupToComputer.js";
import { toast } from "../../components/Common/Toast.jsx";
import ConfirmModal from "../../components/Common/ConfirmModal.jsx";

const MAX_USV_BACKUP_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".usvbackup")) return "USV backup";
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
  const [progress, setProgress] = useState("");
  const [confirmModalData, setConfirmModalData] = useState(null);

  async function selectBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setSelectedFile(file || null);
    setFormat(file ? detectFormat(file) : null);
    setPreview(null);
    setError("");
    setResult(null);
    setProgress("");
    if (!file) return;

    const detectedFormat = detectFormat(file);
    if (!detectedFormat) {
      setError("Unsupported file type. Choose a .usvbackup file.");
      return;
    }
    if (!file.size) {
      setError("This backup file is empty.");
      return;
    }
    if (file.size > MAX_USV_BACKUP_BYTES) {
      setError("This backup is larger than the 50 MB restore limit.");
      return;
    }

    setWorking(true);
    setProgress("Validating backup file…");
    try {
      const payload = JSON.parse(await file.text());
      const previewData = previewBackupPayload(payload);
      setPreview({ type: "usv", payload, ...previewData });
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
    setConfirmModalData({
      title: "Restore USV Backup",
      message: `Restore USV backup from ${new Date(preview.createdAt).toLocaleString()}?\n\n${summary || "No business records"}\n\nIncluded datasets will be saved directly to the MySQL database. Datasets not included in this backup will be preserved. Take a fresh backup first if you need to keep current data.`,
      confirmText: "Restore Backup",
      cancelText: "Cancel",
      danger: true,
      onConfirm: () => {
        setConfirmModalData(null);
        void executeRestoreUsv();
      },
      onCancel: () => setConfirmModalData(null),
    });
  }

  async function executeRestoreUsv() {
    setWorking(true);
    setError("");
    setResult(null);
    setProgress("Restoring records to MySQL database…");
    try {
      const restored = await restoreBackupPayload(preview.payload);
      const replacedCount = restored.replacedStores?.length || restored.entries.length;
      const msg = `USV restore completed: ${restored.restoredCount} records saved to MySQL database across ${replacedCount} data stores.`;
      setResult(msg);
      toast.success(msg);
    } catch (restoreError) {
      const msg = restoreError.message || "Could not restore this backup to the database.";
      setError(msg);
      toast.error(msg);
    } finally {
      setWorking(false);
      setProgress("");
    }
  }

  return (
    <main className="min-h-full bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <p className="text-sm font-semibold text-blue-700">Sync, Share &amp; Backup</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Restore Backup</h1>
          <p className="mt-2 text-sm text-slate-600">Restore your business records from a USV backup file into the MySQL database.</p>
        </header>

        <Card className="p-5 md:p-6">
          <div className="flex items-center gap-3">
            <FiDatabase className="text-xl text-blue-700" />
            <h2 className="font-semibold text-slate-900">Restore Backup</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">Choose a <code>.usvbackup</code> file to validate its contents and preview supported records before restoring.</p>
          
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".usvbackup"
            onChange={selectBackup}
          />
          
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={working}
            className="mt-5 bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:opacity-60"
          >
            <FiUpload /> Choose Backup File
          </Button>

          {selectedFile && (
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p className="break-all font-medium text-slate-800">{selectedFile.name}</p>
              <p>File size: {formatBytes(selectedFile.size)} · Format: {format || "Unsupported"}</p>
            </div>
          )}

          {progress && (
            <div role="status" className="mt-3 flex items-center gap-2 text-sm text-blue-800">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-800 border-t-transparent" />
              <span>{progress}</span>
            </div>
          )}

          {preview?.type === "usv" && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">Backup preview</h3>
              <p className="mt-1 text-sm text-slate-600">
                Company: <strong className="text-slate-800">{preview.companyName}</strong> · Created: {new Date(preview.createdAt).toLocaleString()}
              </p>
              
              {preview.entries.length > 0 ? (
                <ul className="mt-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                  {preview.entries.map((entry) => (
                    <li key={entry.key} className="flex justify-between rounded bg-white px-3 py-1.5 border border-slate-100">
                      <span>{entry.category}</span>
                      <strong className="text-slate-900">{entry.recordCount}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-600">This backup contains no supported records.</p>
              )}

              <Button
                onClick={restoreUsv}
                disabled={working || preview.entries.length === 0}
                className="mt-4 bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:opacity-60"
              >
                {working ? "Restoring to Database…" : "Restore Records to MySQL"}
              </Button>
            </div>
          )}
        </Card>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <FiAlertCircle className="mt-0.5 shrink-0 text-rose-600 text-lg" />
            <div>
              <p className="font-semibold">Restoration could not proceed</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <FiCheckCircle className="mt-0.5 shrink-0 text-emerald-600 text-lg" />
            <div>
              <p className="font-semibold">Database Restoration Successful</p>
              <p className="mt-0.5">{result}</p>
            </div>
          </div>
        )}

        <Card className="flex items-start gap-3 p-4 text-sm text-slate-600">
          <FiInfo className="mt-0.5 shrink-0 text-blue-700 text-lg" />
          <p>
            USV restore replaces the included business datasets directly in the MySQL database within an atomic transaction.
            Datasets not included in the backup are preserved. All changes are permanently saved to MySQL and immediately available across all devices and sessions.
          </p>
        </Card>
      </div>

      {confirmModalData && (
        <ConfirmModal
          isOpen={Boolean(confirmModalData)}
          title={confirmModalData.title}
          message={confirmModalData.message}
          confirmText={confirmModalData.confirmText}
          cancelText={confirmModalData.cancelText}
          danger={confirmModalData.danger}
          onConfirm={confirmModalData.onConfirm}
          onCancel={confirmModalData.onCancel}
        />
      )}
    </main>
  );
}

export default RestoreBackup;
