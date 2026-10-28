import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiAlertCircle, FiCheckCircle, FiCloud, FiInfo, FiLoader, FiLogOut } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import {
  collectBackupData,
  createBackupPayload,
  validateBackupPayload,
} from "../../services/backupToComputer.js";
import {
  disconnectGoogleDrive,
  getGoogleDriveBackupStatus,
  startGoogleDriveSignIn,
  uploadBackupToGoogleDrive,
} from "../../services/googleDriveBackupClient.js";

function BackupToDrive() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(null);
  const [profile, setProfile] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryPayload, setRetryPayload] = useState(null);
  const [uploaded, setUploaded] = useState(null);
  const [callbackResult] = useState(() => {
    const query = new URLSearchParams(location.search);
    const flowStatus = query.get("googleDrive");
    if (flowStatus === "connected") return { notice: "Google account connected. You can now upload a backup." };
    if (flowStatus === "denied") return { error: "Google sign-in was cancelled or access was denied." };
    if (flowStatus === "error") return { error: query.get("message") || "Google sign-in failed. Check the setup and try again." };
    return null;
  });
  const operationLock = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const result = await getGoogleDriveBackupStatus();
      setConfigured(Boolean(result.configured));
      setProfile(result.connected ? result.profile : null);
      setError("");
    } catch (statusError) {
      setError(statusError.message || "Could not check the Google Drive connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshStatus(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.has("googleDrive")) navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const uploadPayload = async (payload) => {
    if (operationLock.current) return;
    operationLock.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    setUploaded(null);
    setRetryPayload(payload);
    try {
      const validation = validateBackupPayload(payload);
      if (!validation.valid) throw new Error(validation.error);
      const result = await uploadBackupToGoogleDrive(payload);
      setUploaded(result.file);
      setRetryPayload(null);
      setNotice("Google Drive confirmed the backup upload.");
    } catch (uploadError) {
      setError(uploadError.message || "Backup upload failed. You can retry.");
      if (uploadError.message?.includes("session expired") || uploadError.message?.includes("Sign in again")) {
        setProfile(null);
      }
    } finally {
      operationLock.current = false;
      setWorking(false);
    }
  };

  const createAndUpload = async () => {
    if (working) return;
    setError("");
    try {
      const payload = createBackupPayload(collectBackupData());
      await uploadPayload(payload);
    } catch (backupError) {
      setError(backupError.message || "Could not create the backup from browser storage.");
    }
  };

  const signOut = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    setWorking(true);
    setError("");
    try {
      await disconnectGoogleDrive();
      setProfile(null);
      setUploaded(null);
      setRetryPayload(null);
      setNotice("Google Drive disconnected from this USV session.");
    } catch (disconnectError) {
      setError(disconnectError.message || "Could not disconnect Google Drive.");
    } finally {
      operationLock.current = false;
      setWorking(false);
    }
  };

  return (
    <main className="min-h-full bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <p className="text-sm font-semibold text-blue-700">Sync, Share &amp; Backup</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Backup To Drive</h1>
          <p className="mt-2 text-sm text-slate-600">Connect your Google account and upload a fresh USV backup to your Drive.</p>
        </header>

        <Card className="p-5 md:p-7">
          {loading ? <div className="flex items-center gap-3 py-5 text-slate-600"><FiLoader className="animate-spin" /> Checking Google Drive connection…</div> : profile ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {profile.picture ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full bg-slate-100" /> : <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-800"><FiCloud className="h-7 w-7" /></span>}
                <div><h2 className="font-semibold text-slate-900">Connected to Google Drive</h2><p className="mt-1 text-sm text-slate-600">{profile.name}{profile.email ? ` · ${profile.email}` : ""}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={createAndUpload} disabled={working} className="bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:cursor-wait disabled:opacity-60"><FiCloud className={working ? "animate-pulse" : ""} />{working ? "Uploading backup…" : "Upload Backup to Google Drive"}</Button>
                <Button onClick={signOut} disabled={working} className="border border-slate-300 bg-white text-slate-700 disabled:opacity-60"><FiLogOut /> Disconnect</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-semibold text-slate-900">Connect Google Drive</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Sign in with Google to authorize USV to create backup files in your Drive. USV requests permission to create and manage files it creates, not to browse your entire Drive.</p></div>
              <Button onClick={startGoogleDriveSignIn} disabled={configured !== true || working} className="shrink-0 bg-[#1A1F71] text-white hover:bg-[#14185D] disabled:cursor-not-allowed disabled:opacity-50"><FiCloud /> Sign in with Google</Button>
            </div>
          )}
          {!loading && configured === false && <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Google Drive sign-in is not configured on the backend. Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and <code>GOOGLE_DRIVE_REDIRECT_URI</code>, then restart the backend.</p>}
        </Card>

        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><FiInfo className="mt-0.5 shrink-0" /><p>USV creates a new timestamped <code>.usvbackup</code> for each upload. Only records saved in the browser are included; records stored only in the backend are not part of this backup.</p></div>

        {(notice || callbackResult?.notice) && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><FiCheckCircle className="mt-0.5 shrink-0" /><div><p>{notice || callbackResult.notice}</p>{uploaded && <p className="mt-1">{uploaded.name} · {new Date(uploaded.uploadedAt).toLocaleString()}{uploaded.webViewLink && <> · <a className="font-semibold underline" href={uploaded.webViewLink} target="_blank" rel="noreferrer">Open in Google Drive</a></>}</p>}</div></div>}
        {(error || callbackResult?.error) && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" /><p>{error || callbackResult.error}</p></div>}
        {retryPayload && profile && <div role="status" className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700"><span>The last backup upload did not finish. Retry that backup?</span><Button onClick={() => void uploadPayload(retryPayload)} disabled={working} className="bg-[#1A1F71] text-white disabled:opacity-60">Retry Upload</Button></div>}

        <Card className="flex items-start gap-3 p-5 text-sm text-slate-600"><FiInfo className="mt-0.5 shrink-0 text-blue-700" /><p>The upload is sent to Google Drive only after you connect an account and click Upload. Google access tokens stay on the backend and are not placed in browser storage or the backup file.</p></Card>
      </div>
    </main>
  );
}

export default BackupToDrive;
