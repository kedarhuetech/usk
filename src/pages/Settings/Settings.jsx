import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiBell,
  FiBook,
  FiCheck,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiDollarSign,
  FiDownload,
  FiEdit,
  FiFileText,
  FiGlobe,
  FiInfo,
  FiLock,
  FiMessageSquare,
  FiPackage,
  FiPercent,
  FiPlus,
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiSliders,
  FiTrash2,
  FiUpload,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useAppPasscode } from "../../components/Passcode/passcodeContext.js";
import { APP_PASSCODE_STORAGE_LABEL } from "../../services/appPasscodeRepository.js";
import { validatePasscodeForm } from "../../services/appPasscodeValidation.js";
import { addCustomUnit, getUnits } from "../../services/unitsStorage.js";
import {
  applyScreenZoom,
  createAutoBackupSnapshot,
  exportBackupData,
  getAppSettings,
  getAutoBackupHistory,
  restoreBackupData,
  restoreSnapshot,
  saveAppSettings,
} from "../../services/appSettingsStorage.js";
import {
  clearAuditTrailLogs,
  getAuditTrailLogs,
} from "../../services/auditTrailStorage.js";
import PrintTab from "./PrintTab";
import TaxesTab from "./TaxesTab";
import PartyTab from "./PartyTab";
import TransactionMessageTab from "./TransactionMessageTab";
import MultiCurrencyTab from "./MultiCurrencyTab";
import HsnAutocomplete from "../../components/Common/HsnAutocomplete";
import { matchGstRateToOption } from "../../services/hsnService.js";

const TABS = [
  { id: "general", label: "GENERAL", icon: FiSliders },
  { id: "transaction", label: "TRANSACTION", icon: FiFileText },
  { id: "print", label: "PRINT", icon: FiPrinter },
  { id: "taxes", label: "TAXES & GST", icon: FiPercent },
  { id: "messages", label: "TRANSACTION MESSAGE", icon: FiMessageSquare },
  { id: "party", label: "PARTY", icon: FiUsers },
  { id: "item", label: "ITEM", icon: FiPackage },
  { id: "service_reminders", label: "SERVICE REMINDERS", icon: FiBell },
  { id: "accounting", label: "ACCOUNTING", icon: FiBook },
  { id: "multi_currency", label: "MULTI CURRENCY", icon: FiDollarSign },
];

const ZOOM_LEVELS = ["70%", "80%", "90%", "100%", "110%", "115%", "120%", "130%"];
const settingsTabFromSearch = (search) => {
  const requestedTab = new URLSearchParams(search).get("tab");
  return TABS.some((tab) => tab.id === requestedTab) ? requestedTab : "general";
};

function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => settingsTabFromSearch(location.search));
  const [settings, setSettings] = useState(getAppSettings);
  const [toast, setToast] = useState("");
  const [selectedZoom, setSelectedZoom] = useState(settings.screenZoom || "100%");

  // Modals
  const [firmModal, setFirmModal] = useState(null);
  const [newFirmName, setNewFirmName] = useState("");
  const [godownModal, setGodownModal] = useState(false);
  const [newGodownName, setNewGodownName] = useState("");
  const [backupHistoryModal, setBackupHistoryModal] = useState(false);
  const [auditTrailModal, setAuditTrailModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState(getAuditTrailLogs);
  const [backupHistory, setBackupHistory] = useState(getAutoBackupHistory);
  const [auditFilter, setAuditFilter] = useState("");

  // Passcode context
  const { enabled: passcodeEnabled, setup: setupPasscode, change: changePasscode, disable: disablePasscode, lock: lockApp } = useAppPasscode();
  const [passcodeMode, setPasscodeMode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [passcodeSaving, setPasscodeSaving] = useState(false);
  const currentPassInput = useRef(null);
  const newPassInput = useRef(null);
  const confirmPassInput = useRef(null);

  useEffect(() => {
    if (settings.screenZoom) {
      applyScreenZoom(settings.screenZoom);
    }
  }, [settings.screenZoom]);

  useEffect(() => {
    setActiveTab(settingsTabFromSearch(location.search));
  }, [location.search]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  };

  const update = (key, value) => {
    const updated = saveAppSettings({ [key]: value });
    setSettings(updated);
    showToast("Settings updated");
  };

  const updateMultiple = (patch) => {
    const updated = saveAppSettings(patch);
    setSettings(updated);
    showToast("Settings updated");
  };

  // Passcode submission
  const handlePasscodeSubmit = async (e) => {
    e.preventDefault();
    setPasscodeError("");
    const currentPasscode = currentPassInput.current?.value || "";
    const nextPasscode = newPassInput.current?.value || "";
    const confirmation = confirmPassInput.current?.value || "";
    const validationError = validatePasscodeForm({
      mode: passcodeMode,
      currentPasscode,
      newPasscode: nextPasscode,
      confirmation,
    });
    if (validationError) {
      setPasscodeError(validationError);
      return;
    }
    setPasscodeSaving(true);
    try {
      if (passcodeMode === "setup") await setupPasscode(nextPasscode);
      if (passcodeMode === "change") await changePasscode(currentPasscode, nextPasscode);
      if (passcodeMode === "disable") await disablePasscode(currentPasscode);
      setPasscodeMode("");
      showToast("App Passcode updated successfully");
    } catch (err) {
      setPasscodeError(err.message || "Failed to update passcode");
    } finally {
      if (currentPassInput.current) currentPassInput.current.value = "";
      if (newPassInput.current) newPassInput.current.value = "";
      if (confirmPassInput.current) confirmPassInput.current.value = "";
      setPasscodeSaving(false);
    }
  };

  const cancelPasscodeDialog = () => {
    if (currentPassInput.current) currentPassInput.current.value = "";
    if (newPassInput.current) newPassInput.current.value = "";
    if (confirmPassInput.current) confirmPassInput.current.value = "";
    setPasscodeMode("");
    setPasscodeError("");
  };

  // Zoom handling
  const handleApplyZoom = (zoom) => {
    setSelectedZoom(zoom);
    update("screenZoom", zoom);
    applyScreenZoom(zoom);
  };

  // Backup & Restore
  const handleBackupNow = () => {
    const dateFormatted = exportBackupData();
    if (dateFormatted) {
      update("lastBackupDate", dateFormatted);
      showToast("Backup exported successfully!");
    }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (window.confirm("Restoring a backup will merge saved records and reload the page. Continue?")) {
      try {
        await restoreBackupData(file);
        showToast("Data restored! Reloading...");
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        alert("Failed to restore backup: " + err.message);
      }
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-100 font-sans text-slate-800">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all animate-in fade-in slide-in-from-bottom-3">
          <FiCheck className="h-4 w-4" />
          <span>{toast}</span>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
        {/* Top Header Bar with Close Button */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold uppercase tracking-wide text-slate-800">
              {TABS.find((t) => t.id === activeTab)?.label || "SETTINGS"}
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
              Auto-saves changes
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset all settings to default values?")) {
                  saveAppSettings({ screenZoom: "100%" });
                  setSettings(getAppSettings());
                  applyScreenZoom("100%");
                  showToast("Settings reset to defaults");
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              <FiRefreshCw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>

            {/* Circular Close Button (Matches user screenshot) */}
            <button
              type="button"
              aria-label="Close Settings"
              title="Close Settings"
              onClick={() => navigate(-1)}
              className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-slate-700 shadow-sm transition hover:bg-slate-300 hover:text-slate-900 active:scale-95"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {activeTab === "general" && (
            <GeneralTab
              settings={settings}
              update={update}
              updateMultiple={updateMultiple}
              selectedZoom={selectedZoom}
              onApplyZoom={handleApplyZoom}
              passcodeEnabled={passcodeEnabled}
              onTogglePasscode={() => {
                setPasscodeError("");
                setPasscodeMode(passcodeEnabled ? "disable" : "setup");
              }}
              onChangePasscode={() => {
                setPasscodeError("");
                setPasscodeMode("change");
              }}
              onLockApp={lockApp}
              onBackupNow={handleBackupNow}
              onRestoreFile={handleRestoreFile}
              onOpenFirmModal={() => {
                setNewFirmName(settings.firms?.[0]?.name || "Sai Kirana Stores");
                setFirmModal(true);
              }}
              onOpenGodownModal={() => setGodownModal(true)}
              onOpenBackupHistory={() => {
                setBackupHistory(getAutoBackupHistory());
                setBackupHistoryModal(true);
              }}
              onOpenAuditTrail={() => {
                setAuditLogs(getAuditTrailLogs());
                setAuditTrailModal(true);
              }}
              backupCount={getAutoBackupHistory().length}
            />
          )}

          {activeTab === "transaction" && <TransactionTab settings={settings} update={update} />}
          {activeTab === "print" && <PrintTab settings={settings} update={update} />}
          {activeTab === "taxes" && <TaxesTab settings={settings} update={update} />}
          {activeTab === "messages" && <TransactionMessageTab settings={settings} update={update} />}
          {activeTab === "party" && <PartyTab settings={settings} update={update} />}
          {activeTab === "item" && <ItemTab settings={settings} update={update} />}
          {activeTab === "service_reminders" && <ServiceRemindersTab settings={settings} update={update} />}
          {activeTab === "accounting" && <AccountingTab settings={settings} update={update} />}
          {activeTab === "multi_currency" && <MultiCurrencyTab settings={settings} update={update} />}
        </div>
      </main>

      {/* Passcode Modal Dialog */}
      {passcodeMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">
              {passcodeMode === "setup"
                ? "Create App Passcode"
                : passcodeMode === "change"
                ? "Change App Passcode"
                : "Disable App Passcode"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {passcodeMode === "setup"
                ? "Choose a 4-digit passcode to lock the application on this device."
                : passcodeMode === "change"
                ? "Verify your current 4-digit passcode, then create a new one."
                : "Enter your 4-digit passcode to disable the lock screen."}
            </p>
            <form onSubmit={handlePasscodeSubmit} className="mt-4 space-y-3">
              {(passcodeMode === "change" || passcodeMode === "disable") && (
                <label className="block text-xs font-semibold text-slate-700">
                  Current Passcode
                  <input
                    ref={currentPassInput}
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="••••"
                    required
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-center text-lg tracking-[0.5em] outline-none focus:border-blue-500"
                  />
                </label>
              )}
              {(passcodeMode === "setup" || passcodeMode === "change") && (
                <>
                  <label className="block text-xs font-semibold text-slate-700">
                    New 4-digit Passcode
                    <input
                      ref={newPassInput}
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      placeholder="••••"
                      required
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-center text-lg tracking-[0.5em] outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Confirm New Passcode
                    <input
                      ref={confirmPassInput}
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      placeholder="••••"
                      required
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-center text-lg tracking-[0.5em] outline-none focus:border-blue-500"
                    />
                  </label>
                </>
              )}
              {passcodeError && (
                <p className="rounded bg-rose-50 p-2.5 text-xs font-medium text-rose-600">{passcodeError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={passcodeSaving}
                  onClick={cancelPasscodeDialog}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passcodeSaving}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {passcodeSaving ? "Saving…" : passcodeMode === "disable" ? "Disable Lock" : "Save Passcode"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Firm Edit Modal */}
      {firmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Manage Default Firm</h3>
            <p className="mt-1 text-xs text-slate-500">Edit your default company / firm display name</p>
            <input
              type="text"
              value={newFirmName}
              onChange={(e) => setNewFirmName(e.target.value)}
              className="mt-4 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
              placeholder="Firm name"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFirmModal(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newFirmName.trim()) {
                    update("firms", [
                      { id: "firm-1", name: newFirmName.trim(), isDefault: true, devices: "ALL DEVICES" },
                    ]);
                    setFirmModal(false);
                  }
                }}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup History Modal */}
      {backupHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Auto Backup History & Snapshots</h3>
                <p className="text-xs text-slate-500">Automated rolling snapshots taken according to your schedule</p>
              </div>
              <button
                type="button"
                onClick={() => setBackupHistoryModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
              <div className="flex items-center justify-between rounded-xl bg-blue-50/70 p-3.5 text-xs text-blue-900">
                <span>
                  Auto backup is set to run every <b>{settings.autoBackupDays || 13} days</b>. Snapshots are stored in this browser workspace.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    createAutoBackupSnapshot("Manual On-Demand Snapshot");
                    setBackupHistory(getAutoBackupHistory());
                    showToast("Snapshot created!");
                  }}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700"
                >
                  Take Snapshot Now
                </button>
              </div>

              {!backupHistory.length && (
                <div className="p-8 text-center text-xs text-slate-400">
                  No snapshots recorded yet. Click "Take Snapshot Now" or "Backup Now" to create your first snapshot.
                </div>
              )}

              {backupHistory.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300"
                >
                  <div>
                    <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      {snap.label || "Auto Snapshot"}
                    </span>
                    <h4 className="mt-1 text-sm font-semibold text-slate-800">{snap.date}</h4>
                    <p className="text-[11px] text-slate-400">{snap.keysCount} database collections archived</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(snap.data, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `USV_Snapshot_${snap.date.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <FiDownload className="h-3 w-3" /> Download JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Restore all records to snapshot from ${snap.date}? Current data will be replaced.`)) {
                          restoreSnapshot(snap.id);
                          showToast("Snapshot restored! Reloading...");
                          setTimeout(() => window.location.reload(), 1000);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      <FiRefreshCw className="h-3 w-3" /> Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <footer className="flex justify-end border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setBackupHistoryModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {auditTrailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Audit Trail Timeline</h3>
                <p className="text-xs text-slate-500">Immutable chronological log of changes across the company workspace</p>
              </div>
              <button
                type="button"
                onClick={() => setAuditTrailModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </header>

            <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Filter audit logs..."
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  className="h-8 flex-1 rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Clear all audit logs?")) {
                      clearAuditTrailLogs();
                      setAuditLogs([]);
                      showToast("Audit logs cleared");
                    }
                  }}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-6">
              {auditLogs
                .filter(
                  (log) =>
                    !auditFilter.trim() ||
                    `${log.action} ${log.entity} ${log.details} ${log.user}`
                      .toLowerCase()
                      .includes(auditFilter.trim().toLowerCase())
                )
                .map((log) => (
                  <div key={log.id} className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          {log.entity}
                        </span>
                        <span className="font-semibold text-slate-900">{log.action}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-[11px] text-slate-500">{log.user}</span>
                      </div>
                      <p className="text-slate-600">{log.details}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {new Date(log.timestamp).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                ))}
            </div>

            <footer className="flex justify-end border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setAuditTrailModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Godown Modal */}
      {godownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Add Warehouse / Godown</h3>
            <p className="mt-1 text-xs text-slate-500">Create a new godown to track inventory storage and transfer</p>
            <input
              type="text"
              value={newGodownName}
              onChange={(e) => setNewGodownName(e.target.value)}
              className="mt-4 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. North Warehouse / Godown 2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGodownModal(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newGodownName.trim()) {
                    const existing = settings.godowns || [];
                    update("godowns", [
                      ...existing,
                      { id: `godown-${Date.now()}`, name: newGodownName.trim(), isDefault: false },
                    ]);
                    setNewGodownName("");
                    setGodownModal(false);
                  }
                }}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Add Godown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// GENERAL TAB (Matches user screenshot with 3 distinct columns)
// -------------------------------------------------------------
function GeneralTab({
  settings,
  update,
  updateMultiple,
  selectedZoom,
  onApplyZoom,
  passcodeEnabled,
  onTogglePasscode,
  onChangePasscode,
  onLockApp,
  onBackupNow,
  onRestoreFile,
  onOpenFirmModal,
  onOpenGodownModal,
  onOpenBackupHistory,
  onOpenAuditTrail,
  backupCount = 0,
}) {
  const firm = settings.firms?.[0] || { name: "Sai Kirana Stores", isDefault: true, devices: "ALL DEVICES" };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* COLUMN 1: Application & More Transactions */}
      <div className="space-y-6">
        {/* Application Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Application</h3>

          <div className="mt-4 space-y-4">
            {/* Enable Passcode */}
            <div>
              <label className="flex cursor-pointer items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={passcodeEnabled}
                    onChange={onTogglePasscode}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  Enable Passcode
                  <InfoTooltip text="Secure this workspace with a 4-digit passcode lock." />
                </span>
                {passcodeEnabled && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                    Active
                  </span>
                )}
              </label>
              {passcodeEnabled && (
                <div className="ml-6 mt-2 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={onChangePasscode}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Change Passcode
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={onLockApp}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"
                  >
                    <FiLock className="h-3 w-3" /> Lock Now
                  </button>
                </div>
              )}
            </div>

            {/* Business Currency */}
            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                Business Currency
                <InfoTooltip text="Select the default primary currency symbol." />
              </span>
              <select
                value={settings.currencySymbol || "₹"}
                onChange={(e) => {
                  const sym = e.target.value;
                  const code = sym === "₹" ? "INR" : sym === "$" ? "USD" : sym === "€" ? "EUR" : "GBP";
                  updateMultiple({ currencySymbol: sym, currency: code });
                }}
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500"
              >
                <option value="₹">₹ (INR)</option>
                <option value="$">$ (USD)</option>
                <option value="€">€ (EUR)</option>
                <option value="£">£ (GBP)</option>
                <option value="AED">AED</option>
              </select>
            </div>

            {/* Amount Decimal Places */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                  Amount
                  <InfoTooltip text="Specify the number of decimal digits for currency amounts." />
                </span>
                <span className="block text-[10px] text-slate-400">(upto Decimal Places)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="4"
                  value={settings.amountDecimalPlaces ?? 2}
                  onChange={(e) => update("amountDecimalPlaces", Math.max(0, Math.min(4, Number(e.target.value) || 0)))}
                  className="h-8 w-14 rounded-md border border-slate-300 text-center text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                />
                <span className="text-xs text-slate-400">
                  e.g. {(0).toFixed(settings.amountDecimalPlaces ?? 2)}
                </span>
              </div>
            </div>

            {/* GSTIN Number */}
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.enableGstin ?? true}
                onChange={(e) => update("enableGstin", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              GSTIN Number
              <InfoTooltip text="Show and validate GSTIN numbers on parties and invoices." />
            </label>

            {/* Stop Sale on Negative Stock */}
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.stopSaleOnNegativeStock || false}
                onChange={(e) => update("stopSaleOnNegativeStock", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Stop Sale on Negative Stock
              <InfoTooltip text="Prevent creating sales when inventory reaches zero." />
            </label>

            {/* Block New Items from Txn Form */}
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.blockNewItemsFromTxn || false}
                onChange={(e) => update("blockNewItemsFromTxn", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Block New Items from Txn Form
              <InfoTooltip text="Items can only be created from the Items menu, not within invoice forms." />
            </label>

            {/* Block New Parties from Txn Form */}
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.blockNewPartiesFromTxn || false}
                onChange={(e) => update("blockNewPartiesFromTxn", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Block New Parties from Txn Form
              <InfoTooltip text="Parties can only be created from the Parties menu, not within invoice forms." />
            </label>
          </div>
        </section>

        {/* More Transactions Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">More Transactions</h3>

          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.enableEstimateQuotation ?? true}
                onChange={(e) => update("enableEstimateQuotation", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Estimate/Quotation
              <InfoTooltip text="Enable Estimate and Quotation voucher creation." />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.enableProformaInvoice ?? true}
                onChange={(e) => update("enableProformaInvoice", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Proforma Invoice
              <InfoTooltip text="Enable Proforma Invoice workflow." />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.enableSalePurchaseOrder ?? true}
                onChange={(e) => update("enableSalePurchaseOrder", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Sale/Purchase Order
              <InfoTooltip text="Track open Sales and Purchase Orders." />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.enableOtherIncome || false}
                onChange={(e) => update("enableOtherIncome", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Other Income
              <InfoTooltip text="Record direct other income entries." />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.enableFixedAssets || false}
                onChange={(e) => update("enableFixedAssets", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Fixed Assets (FA)
              <InfoTooltip text="Manage depreciation and fixed asset transactions." />
            </label>

            {/* Delivery Challan with Nested options */}
            <div className="pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enableDeliveryChallan ?? true}
                  onChange={(e) => update("enableDeliveryChallan", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Delivery Challan
                <InfoTooltip text="Generate Delivery Challans for goods movement." />
              </label>

              {settings.enableDeliveryChallan && (
                <div className="ml-6 mt-2.5 space-y-2 border-l-2 border-slate-200 pl-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={settings.goodsReturnOnDeliveryChallan || false}
                      onChange={(e) => update("goodsReturnOnDeliveryChallan", e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Goods return on Delivery Challan
                    <InfoTooltip text="Allow receiving return quantities on challans." />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={settings.printAmountInDeliveryChallan || false}
                      onChange={(e) => update("printAmountInDeliveryChallan", e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Print amount in Delivery Challan
                    <InfoTooltip text="Show valuation prices on printed delivery challan copies." />
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* COLUMN 2: Multi Firm & Stock Transfer Between Godowns */}
      <div className="space-y-6">
        {/* Multi Firm Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
              <input
                type="checkbox"
                checked={settings.multiFirmEnabled || false}
                onChange={(e) => update("multiFirmEnabled", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Multi Firm
              <InfoTooltip text="Manage multiple businesses/firms inside a single account." />
            </label>
          </div>

          {/* Active Firm Card (Matches screenshot) */}
          <div className="mt-4 rounded-lg border-2 border-blue-500 bg-blue-50/40 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-blue-600 bg-white">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                </span>
                <div>
                  <span className="text-xs font-bold uppercase text-slate-800">{firm.name}</span>
                  <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">DEFAULT</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenFirmModal}
                className="rounded p-1 text-slate-500 hover:bg-white hover:text-blue-600"
                title="Edit firm name"
              >
                <FiEdit className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 pl-6 text-[11px] font-medium text-blue-700">
              <FiGlobe className="h-3 w-3" />
              <span>{firm.devices || "ALL DEVICES"}</span>
            </div>
          </div>

          {settings.multiFirmEnabled && (
            <button
              type="button"
              onClick={onOpenFirmModal}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
            >
              <FiPlus className="h-3.5 w-3.5" /> Add Another Firm
            </button>
          )}
        </section>

        {/* Stock Transfer Between Godowns Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Stock Transfer Between Godowns
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Manage all your stores/godowns and transfer stock seamlessly between them. Using this feature, you can
            transfer stock between stores/godowns and manage your inventory more efficiently.
          </p>

          <div className="mt-4 pt-2">
            <label className="flex cursor-pointer items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.godownManagementEnabled || false}
                  onChange={(e) => update("godownManagementEnabled", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Godown management & Stock transfer
                <InfoTooltip text="Track stock locations and transfers across godowns/branches." />
              </span>
            </label>

            {settings.godownManagementEnabled && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Registered Godowns</span>
                  <button
                    type="button"
                    onClick={onOpenGodownModal}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    + Add Godown
                  </button>
                </div>
                <div className="space-y-1.5">
                  {(settings.godowns || [{ id: "godown-1", name: "Main Store", isDefault: true }]).map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
                    >
                      <span>{g.name}</span>
                      {g.isDefault && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          Primary
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* COLUMN 3: Backup & History & Customize Your View */}
      <div className="space-y-6">
        {/* Backup & History Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Backup & History</h3>

          <div className="mt-4 space-y-4">
            {/* Auto Backup */}
            <div>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.autoBackup ?? true}
                    onChange={(e) => update("autoBackup", e.target.checked)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  Auto Backup
                  <InfoTooltip text="Automatically backup all invoice and business databases." />
                </label>
                <button
                  type="button"
                  onClick={onOpenBackupHistory}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  Snapshots History ({backupCount})
                </button>
              </div>

              <div className="ml-6 mt-2 space-y-2 text-xs text-slate-600">
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  Last Backup: <b className="text-slate-800">{settings.lastBackupDate || "22/10/2026 | 10:10 AM"}</b>
                  <InfoTooltip text="Time of the most recent snapshot." />
                </p>

                <div className="flex items-center gap-2">
                  <span>Auto Backup every</span>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={settings.autoBackupDays || 13}
                    onChange={(e) => update("autoBackupDays", Math.max(1, Number(e.target.value) || 1))}
                    className="h-7 w-12 rounded border border-slate-300 text-center text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                  />
                  <span>days</span>
                  <InfoTooltip text="Scheduled backup frequency." />
                </div>
              </div>
            </div>

            {/* Audit Trail */}
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.auditTrail ?? true}
                  onChange={(e) => update("auditTrail", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Audit Trail
                <InfoTooltip text="Keep an uneditable timeline log of every transaction modification and cancellation." />
              </label>
              <button
                type="button"
                onClick={onOpenAuditTrail}
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                View Audit Log
              </button>
            </div>

            {/* Backup Actions */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={onBackupNow}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <FiDownload className="h-3.5 w-3.5 text-blue-600" />
                Backup Now
              </button>
              <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                <FiUpload className="h-3.5 w-3.5 text-emerald-600" />
                Restore
                <input type="file" accept=".json" onChange={onRestoreFile} className="hidden" />
              </label>
            </div>
          </div>
        </section>

        {/* Customize Your View (Zoom Slider matching screenshot) */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Customize Your View</h3>

          <div className="mt-3">
            <h4 className="text-xs font-semibold text-slate-700">Choose Your Screen Zoom/Scale</h4>
            <p className="mt-1 text-xs text-slate-500">
              You can use this setting to resize the USV screen, making it larger or smaller to fit your
              preferences.
            </p>

            {/* Stepped Scale Control */}
            <div className="mt-5 space-y-3">
              {/* Scale points */}
              <div className="relative flex items-center justify-between px-1">
                <div className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 bg-slate-200" />
                {ZOOM_LEVELS.map((level) => {
                  const isSelected = selectedZoom === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => onApplyZoom(level)}
                      className={`relative z-10 grid h-4 w-4 place-items-center rounded-full border-2 transition ${
                        isSelected
                          ? "border-blue-600 bg-blue-600"
                          : "border-slate-300 bg-white hover:border-blue-400"
                      }`}
                    >
                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </div>

              {/* Labels */}
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                {ZOOM_LEVELS.map((level) => (
                  <span
                    key={level}
                    className={`cursor-pointer ${selectedZoom === level ? "font-bold text-blue-600" : ""}`}
                    onClick={() => onApplyZoom(level)}
                  >
                    {level}
                  </span>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3">
                {selectedZoom !== "100%" && (
                  <button
                    type="button"
                    onClick={() => onApplyZoom("100%")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Reset (100%)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onApplyZoom(selectedZoom)}
                  className="rounded-lg bg-blue-600 px-5 py-1.5 text-xs font-bold text-white shadow hover:bg-blue-700 active:scale-95"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// TRANSACTION TAB
// -------------------------------------------------------------
// -------------------------------------------------------------
// TRANSACTION TAB (Matches Vyapar layout with 3 columns & modals)
// -------------------------------------------------------------

// Renders the PrefixDropdown component matching Vyapar screenshot
function PrefixDropdown({ label, value, onChange, firmName = "sai kirana stores", docCode }) {
  const [open, setOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const dropdownRef = useRef(null);

  const firmInitials = (firmName || "SKS")
    .split(" ")
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join("") || "SKS";

  const currentYear = new Date().getFullYear();
  const nextYearShort = String(currentYear + 1).slice(-2);
  const fyFull = `${currentYear}-${nextYearShort}`;
  const fyShort = `FY${String(currentYear).slice(-2)}-${nextYearShort}`;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectValue = (val) => {
    onChange(val);
    setOpen(false);
  };

  const handleAddCustom = () => {
    if (customText.trim()) {
      onChange(customText.trim());
      setCustomText("");
      setOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 shadow-2xs hover:border-blue-400 focus:border-blue-500 focus:outline-none transition cursor-pointer"
      >
        <span className="font-semibold text-slate-800 truncate">{value || "None"}</span>
        <FiChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* None option */}
          <div
            onClick={() => selectValue("None")}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition ${
              (!value || value === "None") ? "bg-slate-100 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>None</span>
          </div>

          {/* 2026-27 (MOST USED) */}
          <div
            onClick={() => selectValue(fyFull)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition ${
              value === fyFull ? "bg-slate-100 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="font-medium text-slate-800">{fyFull}</span>
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 tracking-wider">
              MOST USED
            </span>
          </div>

          {/* FY26-27 (Financial Year) */}
          <div
            onClick={() => selectValue(fyShort)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition ${
              value === fyShort ? "bg-slate-100 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="font-medium text-slate-800">{fyShort}</span>
            <span className="text-[11px] text-slate-400">Financial Year</span>
          </div>

          {/* Doc code (e.g. INV) */}
          {docCode && (
            <div
              onClick={() => selectValue(docCode.code)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition ${
                value === docCode.code ? "bg-slate-100 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="font-medium text-slate-800">{docCode.code}</span>
              <span className="text-[11px] text-slate-400 truncate max-w-[130px]">{docCode.desc}</span>
            </div>
          )}

          {/* Firm Initials (e.g. SKS) */}
          <div
            onClick={() => selectValue(firmInitials)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition ${
              value === firmInitials ? "bg-slate-100 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="font-medium text-slate-800">{firmInitials}</span>
            <span className="text-[11px] text-slate-400">(Firm name initials)</span>
          </div>

          {/* Custom added prefix if not in defaults */}
          {value && !["None", fyFull, fyShort, docCode?.code, firmInitials].includes(value) && (
            <div
              onClick={() => selectValue(value)}
              className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs bg-slate-100 font-bold text-slate-900"
            >
              <span>{value}</span>
              <span className="text-[10px] text-blue-600 font-semibold">(Custom)</span>
            </div>
          )}

          {/* Input + ADD button */}
          <div className="mt-2 border-t border-slate-100 pt-2 flex items-center gap-1.5 px-1">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustom();
              }}
              placeholder="Custom prefix..."
              className="h-8 flex-1 rounded-md border border-slate-300 px-2 text-xs outline-none focus:border-blue-500 text-slate-800"
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="h-8 rounded-md bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
            >
              ADD
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionTab({ settings, update, updateMultiple }) {
  // Modal states
  const [termsModal, setTermsModal] = useState(false);
  const [termsTitle, setTermsTitle] = useState(settings.termsTitle || "Standard Terms");
  const [termsText, setTermsText] = useState(settings.termsAndConditions || "");
  const [termsApplies, setTermsApplies] = useState(
    settings.termsApplicableFor || {
      saleInvoice: true,
      saleOrder: false,
      deliveryChallan: false,
      estimateQuotation: false,
      purchaseBill: false,
      purchaseOrder: false,
      proformaInvoice: false,
    }
  );

  const [additionalFieldsModal, setAdditionalFieldsModal] = useState(false);
  const [transportModal, setTransportModal] = useState(false);
  const [additionalChargesModal, setAdditionalChargesModal] = useState(false);
  const [countModal, setCountModal] = useState(false);
  const [countLabel, setCountLabel] = useState(settings.itemCountLabel || "Count");

  const firmName = settings.firms?.[0]?.name || "sai kirana stores";

  const handleSaveTerms = () => {
    update("termsTitle", termsTitle);
    update("termsAndConditions", termsText);
    update("termsApplicableFor", termsApplies);
    setTermsModal(false);
  };

  return (
    <div className="space-y-6">
      {/* 3-Column Layout matching Vyapar screenshot */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* =========================================
            COLUMN 1: Transaction Header & More Features
            ========================================= */}
        <div className="space-y-6">
          {/* Card: Transaction Header */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Transaction Header
            </h3>

            <div className="mt-4 space-y-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enableInvoiceBillNo ?? true}
                  onChange={(e) => update("enableInvoiceBillNo", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Invoice/Bill No.
                <InfoTooltip text="Enable manual or automatic invoice numbering sequence." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.addTimeOnTransactions || false}
                  onChange={(e) => update("addTimeOnTransactions", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Add Time on Transactions
                <InfoTooltip text="Include exact hour and minute timestamp on invoice dates." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.cashSaleByDefault || false}
                  onChange={(e) => update("cashSaleByDefault", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Cash Sale by default
                <InfoTooltip text="Automatically select Cash Sale party when opening a new sale invoice." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.billingNameOfParties || false}
                  onChange={(e) => update("billingNameOfParties", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Billing Name of Parties
                <InfoTooltip text="Display and print secondary billing/trade name for customers." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.customerPoDetails || false}
                  onChange={(e) => update("customerPoDetails", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Customers P.O. Details on Transactions
                <InfoTooltip text="Record customer Purchase Order number and PO date on invoices." />
              </label>
            </div>
          </section>

          {/* Card: More Transaction Features */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              More Transaction Features
            </h3>

            <div className="mt-4 space-y-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enableEwayBillNo ?? true}
                  onChange={(e) => update("enableEwayBillNo", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                E-way bill no
                <InfoTooltip text="Enable entering government E-way bill number on sale invoices." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enableQuickEntry || false}
                  onChange={(e) => update("enableQuickEntry", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Quick Entry
                <InfoTooltip text="Enable fast barcode/item code keyboard entry mode without modal selection." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.doNotShowInvoicePreview || false}
                  onChange={(e) => update("doNotShowInvoicePreview", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Do not Show Invoice Preview
                <InfoTooltip text="Skip the invoice print preview screen and return directly to invoice list after saving." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enableRepeatInvoices || false}
                  onChange={(e) => update("enableRepeatInvoices", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Repeat Invoices
                <InfoTooltip text="Automate recurring periodic invoices for regular subscribers or clients." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.passcodeForTxnEditDelete || false}
                  onChange={(e) => update("passcodeForTxnEditDelete", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Enable Passcode for transaction edit/delete
                <InfoTooltip text="Require 4-digit passcode authentication before editing or deleting transactions." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.discountDuringPayments || false}
                  onChange={(e) => update("discountDuringPayments", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Discount During Payments
                <InfoTooltip text="Allow recording cash/settlement discounts directly on payment vouchers." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.linkPaymentsToInvoices ?? true}
                  onChange={(e) => update("linkPaymentsToInvoices", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Link Payments to Invoices
                <InfoTooltip text="Link payment receipts to specific unpaid invoices to settle balances bill-wise." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.dueDatesAndPaymentTerms || false}
                  onChange={(e) => update("dueDatesAndPaymentTerms", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Due Dates and Payment Terms
                <InfoTooltip text="Set credit terms (e.g. Net 15, Net 30) and track overdue dates." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.showProfitWhileMakingSaleInvoice || false}
                  onChange={(e) => update("showProfitWhileMakingSaleInvoice", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Show Profit while making Sale Invoice
                <InfoTooltip text="Display real-time estimated profit margin on the sale creation screen." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.showWholesalePriceToggle || false}
                  onChange={(e) => update("showWholesalePriceToggle", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Show 'Wholesale Price' toggle on Invoice
                <InfoTooltip text="Easily switch line items to wholesale price with one click during billing." />
              </label>

              <div>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.enableTermsAndConditions ?? true}
                    onChange={(e) => update("enableTermsAndConditions", e.target.checked)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  Terms and Conditions
                  <InfoTooltip text="Include printed terms, return policy, and legal conditions at bottom of bill." />
                </label>
                {settings.enableTermsAndConditions !== false && (
                  <button
                    type="button"
                    onClick={() => setTermsModal(true)}
                    className="ml-6 mt-1 block text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Set Terms and Conditions
                  </button>
                )}
              </div>

              {/* Sub-feature Action Pills (matching screenshot) */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setAdditionalFieldsModal(true)}
                  className="flex w-full items-center justify-between rounded-lg bg-sky-50/80 px-3.5 py-2.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
                >
                  <span>Additional Fields</span>
                  <span className="text-slate-400">&gt;</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTransportModal(true)}
                  className="flex w-full items-center justify-between rounded-lg bg-sky-50/80 px-3.5 py-2.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
                >
                  <span>Transportation Details</span>
                  <span className="text-slate-400">&gt;</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdditionalChargesModal(true)}
                  className="flex w-full items-center justify-between rounded-lg bg-sky-50/80 px-3.5 py-2.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
                >
                  <span>Additional Charges</span>
                  <span className="text-slate-400">&gt;</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* =========================================
            COLUMN 2: Items Table & Transaction Prefixes
            ========================================= */}
        <div className="space-y-6">
          {/* Card: Items Table */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Items Table
            </h3>

            <div className="mt-4 space-y-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.inclusiveTaxOnRate ?? true}
                  onChange={(e) => update("inclusiveTaxOnRate", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Inclusive/Exclusive Tax on Rate(Price/Unit)
                <InfoTooltip text="Toggle whether item rate entered already includes tax or is exclusive." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.displayPurchasePriceOfItems ?? true}
                  onChange={(e) => update("displayPurchasePriceOfItems", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Display Purchase Price of Items
                <InfoTooltip text="Show reference cost price when picking items to prevent under-pricing." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.showLast5SalePrice || false}
                  onChange={(e) => update("showLast5SalePrice", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Show last 5 Sale Price of Items
                <InfoTooltip text="View the 5 most recent sale prices charged to this customer." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.showLast5PurchasePrice || false}
                  onChange={(e) => update("showLast5PurchasePrice", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Show last 5 Purchase Price of Items
                <InfoTooltip text="View the 5 most recent purchase prices paid to suppliers." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enableFreeItemQuantity || false}
                  onChange={(e) => update("enableFreeItemQuantity", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Free Item Quantity
                <InfoTooltip text="Add a separate Free Quantity column for promotional Buy-1-Get-1 schemes." />
              </label>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.enableItemCount || false}
                    onChange={(e) => update("enableItemCount", e.target.checked)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  <span>{settings.itemCountLabel || "Count"}</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCountLabel(settings.itemCountLabel || "Count");
                    setCountModal(true);
                  }}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Change Text
                </button>
                <InfoTooltip text="Display distinct item count in bill summary footer." />
              </div>
            </div>
          </section>

          {/* Card: Transaction Prefixes */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Transaction Prefixes
            </h3>

            {/* Firm Dropdown */}
            <div className="mt-4">
              <label className="block text-[11px] font-semibold text-slate-500">Firm</label>
              <select
                value={settings.selectedPrefixFirm || "firm-1"}
                onChange={(e) => update("selectedPrefixFirm", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="firm-1">{firmName}</option>
              </select>
            </div>

            {/* Prefixes Inner Group Container */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Prefixes
              </span>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <PrefixDropdown
                  label="Sale"
                  value={settings.salePrefix || "None"}
                  onChange={(val) => update("salePrefix", val)}
                  firmName={firmName}
                  docCode={{ code: "INV", desc: "(INV- for Invoice)" }}
                />

                <PrefixDropdown
                  label="Credit Note"
                  value={settings.creditNotePrefix || "None"}
                  onChange={(val) => update("creditNotePrefix", val)}
                  firmName={firmName}
                  docCode={{ code: "CN", desc: "(CN- for Credit Note)" }}
                />

                <PrefixDropdown
                  label="Sale Order"
                  value={settings.saleOrderPrefix || "None"}
                  onChange={(val) => update("saleOrderPrefix", val)}
                  firmName={firmName}
                  docCode={{ code: "SO", desc: "(SO- for Sale Order)" }}
                />

                <PrefixDropdown
                  label="Purchase Order"
                  value={settings.purchaseOrderPrefix || "None"}
                  onChange={(val) => update("purchaseOrderPrefix", val)}
                  firmName={firmName}
                  docCode={{ code: "PO", desc: "(PO- for Purchase Order)" }}
                />

                <PrefixDropdown
                  label="Proforma Invoice"
                  value={settings.proformaInvoicePrefix || "None"}
                  onChange={(val) => update("proformaInvoicePrefix", val)}
                  firmName={firmName}
                  docCode={{ code: "PR", desc: "(PR- for Proforma)" }}
                />

                <PrefixDropdown
                  label="Delivery Challan"
                  value={settings.deliveryChallanPrefix || "None"}
                  onChange={(val) => update("deliveryChallanPrefix", val)}
                  firmName={firmName}
                  docCode={{ code: "DC", desc: "(DC- for Challan)" }}
                />

                <PrefixDropdown
                  label="Payment In"
                  value={settings.paymentInPrefix || "None"}
                  onChange={(val) => update("paymentInPrefix", val)}
                  firmName={firmName}
                  docCode={{ code: "PI", desc: "(PI- for Payment In)" }}
                />
              </div>
            </div>
          </section>
        </div>

        {/* =========================================
            COLUMN 3: Taxes, Discount & Totals & Billing Type
            ========================================= */}
        <div className="space-y-6">
          {/* Card: Taxes, Discount & Totals */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Taxes, Discount & Totals
            </h3>

            <div className="mt-4 space-y-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.transactionWiseTax || false}
                  onChange={(e) => update("transactionWiseTax", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Transaction wise Tax
                <InfoTooltip text="Apply overall tax percentage across invoice rather than per item." />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.transactionWiseDiscount || false}
                  onChange={(e) => update("transactionWiseDiscount", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Transaction wise Discount
                <InfoTooltip text="Allow applying total invoice discount before tax." />
              </label>

              <div>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.roundOffTotal ?? true}
                    onChange={(e) => update("roundOffTotal", e.target.checked)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  Round Off Total
                  <InfoTooltip text="Automatically round final invoice payable total." />
                </label>

                {settings.roundOffTotal !== false && (
                  <div className="ml-6 mt-3 flex items-center gap-2 text-xs">
                    <select
                      value={settings.roundOffMode || "Nearest"}
                      onChange={(e) => update("roundOffMode", e.target.value)}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500"
                    >
                      <option value="Nearest">Nearest</option>
                      <option value="Upward">Upward</option>
                      <option value="Downward">Downward</option>
                    </select>

                    <span className="text-xs text-slate-500">To</span>

                    <select
                      value={settings.roundOffTo ?? 1}
                      onChange={(e) => update("roundOffTo", Number(e.target.value))}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500"
                    >
                      <option value="1">1</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="0.5">0.5</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Card: Billing Type */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Billing Type
            </h3>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-slate-700">
                <input
                  type="radio"
                  name="billingType"
                  value="Lite Sale"
                  checked={settings.billingType === "Lite Sale"}
                  onChange={() => update("billingType", "Lite Sale")}
                  className="h-4 w-4 accent-blue-600"
                />
                Lite Sale
              </label>

              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-slate-700">
                <input
                  type="radio"
                  name="billingType"
                  value="Full Sale"
                  checked={settings.billingType !== "Lite Sale"}
                  onChange={() => update("billingType", "Full Sale")}
                  className="h-4 w-4 accent-blue-600"
                />
                Full Sale
              </label>
            </div>
          </section>
        </div>
      </div>

      {/* ========================================================
          MODAL: Add Terms & Conditions (Matches Screenshot 3)
          ======================================================== */}
      {termsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTermsModal(false)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <span className="text-base font-bold">&larr;</span>
                </button>
                <h3 className="text-base font-bold text-slate-900">Add Terms & Conditions</h3>
              </div>
              <button
                type="button"
                onClick={() => setTermsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </header>

            {/* Modal Body */}
            <div className="space-y-4 p-6">
              {/* Title input */}
              <div>
                <label className="block text-xs font-bold text-slate-700">Title</label>
                <input
                  type="text"
                  value={termsTitle}
                  onChange={(e) => setTermsTitle(e.target.value)}
                  placeholder="e.g. Standard Terms / Delivery Policy"
                  className="mt-1 h-10 w-full rounded-lg border border-blue-400 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  You can select the term based on the header you select here
                </p>
              </div>

              {/* Terms Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-700">Terms</label>
                <textarea
                  rows="5"
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  placeholder="Paste/Write your terms and conditions here"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* Applicable For Checkboxes */}
              <div>
                <span className="block text-xs font-bold text-slate-700">Applicable for:</span>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsApplies.saleInvoice ?? true}
                      onChange={(e) =>
                        setTermsApplies((prev) => ({ ...prev, saleInvoice: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Sale Invoice
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsApplies.saleOrder || false}
                      onChange={(e) =>
                        setTermsApplies((prev) => ({ ...prev, saleOrder: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Sale Order
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsApplies.deliveryChallan || false}
                      onChange={(e) =>
                        setTermsApplies((prev) => ({ ...prev, deliveryChallan: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Delivery Challan
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsApplies.estimateQuotation || false}
                      onChange={(e) =>
                        setTermsApplies((prev) => ({ ...prev, estimateQuotation: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Estimation/Quotation
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsApplies.purchaseBill || false}
                      onChange={(e) =>
                        setTermsApplies((prev) => ({ ...prev, purchaseBill: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Purchase Bill
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsApplies.purchaseOrder || false}
                      onChange={(e) =>
                        setTermsApplies((prev) => ({ ...prev, purchaseOrder: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Purchase Order
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsApplies.proformaInvoice || false}
                      onChange={(e) =>
                        setTermsApplies((prev) => ({ ...prev, proformaInvoice: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    Proforma Invoice
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <footer className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setTermsModal(false)}
                className="rounded-lg bg-slate-200 px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-300"
              >
                No, Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTerms}
                className="rounded-lg bg-blue-600 px-6 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Save Changes
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: Additional Fields Setup (Matches Vyapar Screenshots)
          ======================================================== */}
      {additionalFieldsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4">
          <div className="flex flex-col h-[92vh] max-h-[820px] w-full max-w-5xl rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            {/* Lavender / Soft Blue Header matching screenshot */}
            <header className="flex h-12 shrink-0 items-center justify-between bg-[#dbe5f1] px-5 border-b border-[#cbd8e6]">
              <h3 className="text-sm font-bold text-[#1f385c] tracking-wide">
                Additional Fields Setup
              </h3>
              <button
                type="button"
                onClick={() => setAdditionalFieldsModal(false)}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/80 text-slate-500 hover:bg-white hover:text-slate-800 transition"
              >
                <FiX className="h-4 w-4" />
              </button>
            </header>

            {/* Modal Body: 2 Columns */}
            <div className="flex flex-1 overflow-hidden">
              {/* LEFT COLUMN: Controls & Checkboxes (with scrollbar) */}
              <div className="w-80 sm:w-88 md:w-96 shrink-0 border-r border-slate-200 p-5 overflow-y-auto space-y-5 bg-white text-xs">
                {/* Select Firm */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select Firm</label>
                  <select
                    value={settings.selectedPrefixFirm || "firm-1"}
                    onChange={(e) => update("selectedPrefixFirm", e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="firm-1">{firmName}</option>
                  </select>
                </div>

                {/* Firm additional fields */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <span>Firm additional fields</span>
                    <InfoTooltip text="Fields printed in company header such as DL No, FSSAI, or MSME registration." />
                  </div>

                  {["firmField1", "firmField2"].map((key, idx) => {
                    const current = settings.additionalFieldsSetup?.[key] || {
                      enabled: false,
                      name: "",
                      value: "",
                      showInPrint: true,
                    };
                    return (
                      <div key={key} className="space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={current.enabled}
                            onChange={(e) => {
                              const setup = { ...(settings.additionalFieldsSetup || {}) };
                              setup[key] = {
                                ...current,
                                enabled: e.target.checked,
                                name: current.name || `Additional Field ${idx + 1}`,
                              };
                              update("additionalFieldsSetup", setup);
                            }}
                            className="h-4 w-4 rounded accent-blue-600"
                          />
                          <span>{current.name || `Additional Field ${idx + 1}`}</span>
                        </label>

                        {/* Expandable Form matching screenshot */}
                        {current.enabled && (
                          <div className="ml-6 mt-1.5 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-2xs animate-in fade-in duration-100">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700">
                                Field Name <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={current.name || ""}
                                onChange={(e) => {
                                  const setup = { ...(settings.additionalFieldsSetup || {}) };
                                  setup[key] = { ...current, name: e.target.value };
                                  update("additionalFieldsSetup", setup);
                                }}
                                placeholder="Enter Field Name"
                                className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700">Value</label>
                              <input
                                type="text"
                                value={current.value || ""}
                                onChange={(e) => {
                                  const setup = { ...(settings.additionalFieldsSetup || {}) };
                                  setup[key] = { ...current, value: e.target.value };
                                  update("additionalFieldsSetup", setup);
                                }}
                                placeholder="Enter Value"
                                className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <span className="text-[11px] text-slate-600 font-medium">Show in print</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const setup = { ...(settings.additionalFieldsSetup || {}) };
                                  setup[key] = { ...current, showInPrint: current.showInPrint === false ? true : false };
                                  update("additionalFieldsSetup", setup);
                                }}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                                  current.showInPrint !== false ? "bg-indigo-600" : "bg-slate-300"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                                    current.showInPrint !== false ? "translate-x-4.5" : "translate-x-0.5"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Transaction additional fields */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <span>Transaction additional fields</span>
                    <InfoTooltip text="Extra custom fields printed in invoice details (e.g. Vehicle No, Driver, Delivery Date)." />
                  </div>

                  {[
                    { id: "txnField1", defaultName: "Additional Field 1" },
                    { id: "txnField2", defaultName: "Additional Field 2" },
                    { id: "txnField3", defaultName: "Additional Field 3" },
                    { id: "dateField", defaultName: "Date Field" },
                  ].map((f) => {
                    const current = settings.additionalFieldsSetup?.[f.id] || {
                      enabled: false,
                      name: "",
                      value: "",
                      showInPrint: true,
                    };
                    return (
                      <div key={f.id} className="space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={current.enabled}
                            onChange={(e) => {
                              const setup = { ...(settings.additionalFieldsSetup || {}) };
                              setup[f.id] = {
                                ...current,
                                enabled: e.target.checked,
                                name: current.name || f.defaultName,
                              };
                              update("additionalFieldsSetup", setup);
                            }}
                            className="h-4 w-4 rounded accent-blue-600"
                          />
                          <span>{current.name || f.defaultName}</span>
                        </label>

                        {/* Expandable Form matching screenshot */}
                        {current.enabled && (
                          <div className="ml-6 mt-1.5 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-2xs animate-in fade-in duration-100">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700">
                                Field Name <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={current.name || ""}
                                onChange={(e) => {
                                  const setup = { ...(settings.additionalFieldsSetup || {}) };
                                  setup[f.id] = { ...current, name: e.target.value };
                                  update("additionalFieldsSetup", setup);
                                }}
                                placeholder="Enter Field Name"
                                className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700">Value</label>
                              <input
                                type="text"
                                value={current.value || ""}
                                onChange={(e) => {
                                  const setup = { ...(settings.additionalFieldsSetup || {}) };
                                  setup[f.id] = { ...current, value: e.target.value };
                                  update("additionalFieldsSetup", setup);
                                }}
                                placeholder="Enter Value"
                                className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <span className="text-[11px] text-slate-600 font-medium">Show in print</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const setup = { ...(settings.additionalFieldsSetup || {}) };
                                  setup[f.id] = { ...current, showInPrint: current.showInPrint === false ? true : false };
                                  update("additionalFieldsSetup", setup);
                                }}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                                  current.showInPrint !== false ? "bg-indigo-600" : "bg-slate-300"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                                    current.showInPrint !== false ? "translate-x-4.5" : "translate-x-0.5"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Show fields on (list of voucher types) */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <span className="block font-bold text-slate-700">Show fields on</span>
                  <div className="space-y-2">
                    {[
                      { id: "sales", label: "Sales" },
                      { id: "purchase", label: "Purchase" },
                      { id: "expense", label: "Expense" },
                      { id: "paymentIn", label: "Payment In" },
                      { id: "paymentOut", label: "Payment Out" },
                      { id: "debitNote", label: "Debit Note" },
                      { id: "creditNote", label: "Credit Note" },
                      { id: "deliveryChallan", label: "Delivery Challan" },
                      { id: "proformaInvoice", label: "Proforma Invoice" },
                      { id: "saleOrder", label: "Sale Order" },
                      { id: "purchaseOrder", label: "Purchase Order" },
                    ].map((v) => {
                      const showOn = settings.additionalFieldsSetup?.showOn || { sales: true };
                      const checked = Boolean(showOn[v.id]);
                      return (
                        <label key={v.id} className="flex items-center gap-2 cursor-pointer font-medium text-slate-600">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const setup = { ...(settings.additionalFieldsSetup || {}) };
                              setup.showOn = { ...(setup.showOn || { sales: true }), [v.id]: e.target.checked };
                              update("additionalFieldsSetup", setup);
                            }}
                            className="h-4 w-4 rounded accent-blue-600"
                          />
                          <span>{v.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Live Interactive Invoice Preview matching Screenshot */}
              <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto p-4 sm:p-6">
                {/* Theme Selector */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="w-48">
                    <select
                      value={settings.additionalFieldsSetup?.theme || "Theme 1"}
                      onChange={(e) => {
                        const setup = { ...(settings.additionalFieldsSetup || {}) };
                        setup.theme = e.target.value;
                        update("additionalFieldsSetup", setup);
                      }}
                      className="h-9 w-full rounded border border-blue-400 bg-white px-3 text-xs font-semibold text-blue-900 outline-none shadow-2xs"
                    >
                      <option value="Theme 1">Theme 1</option>
                      <option value="Theme 2">Theme 2</option>
                      <option value="Theme 3">Theme 3</option>
                    </select>
                  </div>
                </div>

                {/* Sample Tax Invoice Paper Preview matching Screenshot */}
                <div className="flex-1 rounded-lg border border-slate-300 bg-white p-6 shadow-sm text-xs font-sans text-slate-800 space-y-4 max-w-3xl">
                  {/* Company Header */}
                  <div className="text-center space-y-0.5">
                    <h4 className="text-base font-bold text-slate-900">{firmName}</h4>
                    <p className="text-[11px] text-slate-500">Phone no: 8369501991</p>
                    {/* Dynamic Firm Additional Fields */}
                    {["firmField1", "firmField2"].map((k) => {
                      const f = settings.additionalFieldsSetup?.[k];
                      if (!f?.enabled || f.showInPrint === false) return null;
                      return (
                        <p key={k} className="text-[11px] text-slate-700">
                          {f.name || ""} : {f.value || ""}
                        </p>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-300 pt-2 text-center">
                    <span className="font-bold uppercase tracking-wider text-slate-700">
                      Tax Invoice
                    </span>
                  </div>

                  {/* Bill To & Invoice Details Grid */}
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3 text-[11px]">
                    {/* Bill To */}
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-800">Bill To</p>
                      <p className="font-semibold text-slate-900">USV Tech Solutions (Sample Party Name)</p>
                      <p className="text-slate-600">Sarjapur Road, Bangalore</p>
                      <p className="text-slate-600">Contact No. : +91-9333911911 +917795687633</p>
                      <p className="text-slate-600">State: 29-Karnataka</p>
                    </div>

                    {/* Invoice Details */}
                    <div className="space-y-0.5 text-right">
                      <p className="font-bold text-slate-800">Invoice Details</p>
                      <p><span className="text-slate-500">Invoice No. :</span> INV234</p>
                      <p><span className="text-slate-500">Date :</span> 02-11-2026</p>
                      <p><span className="text-slate-500">Place of supply:</span> 29-Karnataka</p>

                      {/* Real-time Dynamic Transaction Additional Fields */}
                      {["txnField1", "txnField2", "txnField3", "dateField"].map((key) => {
                        const f = settings.additionalFieldsSetup?.[key];
                        if (!f?.enabled || f.showInPrint === false) return null;
                        return (
                          <p key={key} className="text-[11px] text-slate-800">
                            <span className="text-slate-500">{f.name || "Field"} : </span>
                            <span className="font-medium">{f.value || (key === "dateField" ? "05-11-2026" : "")}</span>
                          </p>
                        );
                      })}
                    </div>
                  </div>

                  {/* Items Table */}
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-400 text-white font-bold">
                        <th className="p-1.5 text-center w-8">#</th>
                        <th className="p-1.5 text-left">Item name</th>
                        <th className="p-1.5 text-center">HSN/ SAC</th>
                        <th className="p-1.5 text-center">Quantity</th>
                        <th className="p-1.5 text-right">Price/ Unit</th>
                        <th className="p-1.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="p-1.5 text-center">1</td>
                        <td className="p-1.5 font-medium">sample item 1</td>
                        <td className="p-1.5 text-center">—</td>
                        <td className="p-1.5 text-center">3</td>
                        <td className="p-1.5 text-right">₹ 100.00</td>
                        <td className="p-1.5 text-right font-medium">₹ 300.00</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 text-center">2</td>
                        <td className="p-1.5 font-medium">sample item 2</td>
                        <td className="p-1.5 text-center">—</td>
                        <td className="p-1.5 text-center">3</td>
                        <td className="p-1.5 text-right">₹ 150.00</td>
                        <td className="p-1.5 text-right font-medium">₹ 450.00</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 text-center">3</td>
                        <td className="p-1.5 font-medium">sample item 3</td>
                        <td className="p-1.5 text-center">—</td>
                        <td className="p-1.5 text-center">6</td>
                        <td className="p-1.5 text-right">₹ 100.00</td>
                        <td className="p-1.5 text-right font-medium">₹ 600.00</td>
                      </tr>
                      <tr className="font-bold border-t-2 border-slate-300">
                        <td colSpan="5" className="p-1.5 text-right">Total</td>
                        <td className="p-1.5 text-right font-black">₹ 1,350.00</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Summary & Sign-off Section (Matching Screenshot 2) */}
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3 text-[11px]">
                    <div className="space-y-3">
                      <div>
                        <span className="block bg-slate-400 text-white px-2 py-0.5 font-bold text-[10px]">
                          Invoice Amount In Words
                        </span>
                        <p className="mt-1 text-slate-700 italic">Seven Hundred Ninety Two Rupees only</p>
                      </div>

                      <div>
                        <span className="block bg-slate-400 text-white px-2 py-0.5 font-bold text-[10px]">
                          Description
                        </span>
                        <p className="mt-1 text-slate-700">Balance to be paid in 3 days</p>
                      </div>
                    </div>

                    <div className="space-y-1 text-right">
                      <div className="bg-slate-400 text-white px-2 py-0.5 font-bold text-[10px] text-left">
                        Amounts
                      </div>
                      <div className="flex justify-between px-1">
                        <span className="text-slate-500">Sub Total</span>
                        <span className="font-medium">₹ 1,350.00</span>
                      </div>
                      <div className="flex justify-between px-1">
                        <span className="text-slate-500">Discount (0%)</span>
                        <span className="font-medium">₹ 80.00</span>
                      </div>
                      <div className="flex justify-between px-1 font-bold">
                        <span>Total</span>
                        <span>₹ 792.00</span>
                      </div>
                      <div className="flex justify-between px-1">
                        <span className="text-slate-500">Received</span>
                        <span className="font-medium">₹ 300.00</span>
                      </div>
                      <div className="flex justify-between px-1 font-bold text-slate-900 border-t border-slate-200 pt-0.5">
                        <span>Balance</span>
                        <span>₹ 492.00</span>
                      </div>

                      <div className="pt-6">
                        <p className="text-[10px] text-slate-500">For : {firmName}</p>
                        <p className="mt-6 font-bold text-slate-800">Authorized Signature</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DONE Button */}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setAdditionalFieldsModal(false);
                    }}
                    className="rounded-lg bg-[#0084B4] hover:bg-[#0074a0] px-8 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95"
                  >
                    DONE
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: Transportation Details
          ======================================================== */}
      {transportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Transportation Details</h3>
              <button
                type="button"
                onClick={() => setTransportModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Configure default transport and dispatch fields for delivery documents.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Transporter Name</label>
                <input
                  type="text"
                  value={settings.transportationDetails?.transporterName || ""}
                  onChange={(e) =>
                    update("transportationDetails", {
                      ...settings.transportationDetails,
                      transporterName: e.target.value,
                    })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                  placeholder="e.g. VRL Logistics / BlueDart"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Default Vehicle Number</label>
                <input
                  type="text"
                  value={settings.transportationDetails?.vehicleNumber || ""}
                  onChange={(e) =>
                    update("transportationDetails", {
                      ...settings.transportationDetails,
                      vehicleNumber: e.target.value,
                    })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                  placeholder="e.g. MH 12 AB 1234"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setTransportModal(false)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: Additional Charges (Matches Vyapar Screenshot)
          ======================================================== */}
      {additionalChargesModal && (() => {
        const setup = settings.additionalChargesSetup || {
          enabled: true,
          charges: [
            { id: "charge1", selected: false, name: "Shipping", enableTax: true, sac: "", taxRate: "NONE" },
            { id: "charge2", selected: false, name: "Packaging", enableTax: false, sac: "", taxRate: "NONE" },
            { id: "charge3", selected: false, name: "Adjustment", enableTax: false, sac: "", taxRate: "NONE" },
          ],
        };

        const updateCharge = (index, field, val) => {
          const updatedCharges = [...setup.charges];
          updatedCharges[index] = { ...updatedCharges[index], [field]: val };
          const updatedSetup = { ...setup, charges: updatedCharges };
          update("additionalChargesSetup", updatedSetup);
        };

        const toggleMasterEnable = () => {
          const updatedSetup = { ...setup, enabled: !setup.enabled };
          update("additionalChargesSetup", updatedSetup);
        };

        const handleSaveDetails = () => {
          const activeCharges = setup.charges.filter((c) => c.selected);
          update("additionalCharges", activeCharges);
          setAdditionalChargesModal(false);
          showToast("Additional charges saved successfully");
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
              {/* Header */}
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-base font-bold text-slate-900">Additional Charges</h3>
                  <InfoTooltip text="Add extra charges like freight, packing, delivery, or round-off adjustments to invoices." />
                </div>
                <button
                  type="button"
                  onClick={() => setAdditionalChargesModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              {/* Master Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs font-semibold text-slate-700">Enable Additional Charges</span>
                <button
                  type="button"
                  onClick={toggleMasterEnable}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    setup.enabled ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                      setup.enabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Dotted Divider */}
              <div className="my-5 border-b border-dashed border-slate-200" />

              {/* 3 Additional Charge Rows */}
              <div className={`space-y-6 ${!setup.enabled ? "opacity-50 pointer-events-none" : ""}`}>
                {setup.charges.map((charge, idx) => (
                  <div key={charge.id} className="flex items-start gap-3">
                    {/* Left Selection Checkbox */}
                    <div className="pt-7">
                      <input
                        type="checkbox"
                        checked={charge.selected}
                        onChange={(e) => updateCharge(idx, "selected", e.target.checked)}
                        className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                      />
                    </div>

                    {/* 3 Form Columns */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1.5fr_1.5fr_1fr] gap-3">
                      {/* Col 1: Additional Charge Name & Tax Toggle */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Additional Charge{idx + 1}<span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={charge.name}
                          onChange={(e) => updateCharge(idx, "name", e.target.value)}
                          placeholder="e.g. Shipping"
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500"
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateCharge(idx, "enableTax", !charge.enableTax)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${
                              charge.enableTax ? "bg-blue-600" : "bg-slate-300"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                charge.enableTax ? "translate-x-3.5" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                          <span className="text-[11px] text-slate-600">
                            Enable tax for {charge.name || `Charge ${idx + 1}`}
                          </span>
                        </div>
                      </div>

                      {/* Col 2: Default SAC */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Default SAC (Service Accounting Code)
                        </label>
                        <div className="relative mt-1">
                          <HsnAutocomplete
                            type="SAC"
                            value={charge.sac || ""}
                            onChange={(val) => updateCharge(idx, "sac", val)}
                            onSelect={(selected) => {
                              updateCharge(idx, "sac", selected.code);
                              if (selected.gst_rate !== null && (!charge.taxRate || charge.taxRate === "NONE")) {
                                const matchedRate = matchGstRateToOption(selected.gst_rate, ["GST @ 5%", "GST @ 12%", "GST @ 18%", "GST @ 28%"]);
                                if (matchedRate) updateCharge(idx, "taxRate", matchedRate);
                              }
                            }}
                            placeholder="Search SAC code / service..."
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Can be changed during transaction
                        </p>
                      </div>

                      {/* Col 3: Tax Rate Dropdown */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Tax Rate
                        </label>
                        <select
                          value={charge.taxRate || "NONE"}
                          disabled={!charge.enableTax}
                          onChange={(e) => updateCharge(idx, "taxRate", e.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
                        >
                          <option value="NONE">NONE</option>
                          <option value="0%">0%</option>
                          <option value="5%">5%</option>
                          <option value="12%">12%</option>
                          <option value="18%">18%</option>
                          <option value="28%">28%</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Centered Crimson / Red Pill Button */}
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  className="rounded-full bg-[#e61635] hover:bg-[#cf102d] px-12 py-2.5 text-xs font-bold text-white shadow-md transition active:scale-95 cursor-pointer tracking-wide"
                >
                  Save Details
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================
          MODAL: Change Text for "Count"
          ======================================================== */}
      {countModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Change Count Label</h3>
            <p className="mt-1 text-xs text-slate-500">
              Customize the label printed in the summary (e.g. Total Items, Pcs)
            </p>
            <input
              type="text"
              value={countLabel}
              onChange={(e) => setCountLabel(e.target.value)}
              className="mt-4 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. Total Items / Pcs"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCountModal(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (countLabel.trim()) {
                    update("itemCountLabel", countLabel.trim());
                    setCountModal(false);
                  }
                }}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// PRINT TAB (Delegated to PrintTab.jsx)
// -------------------------------------------------------------

// -------------------------------------------------------------
// TAXES & GST TAB (Delegated to TaxesTab.jsx)
// -------------------------------------------------------------

// -------------------------------------------------------------
// ITEM TAB
// -------------------------------------------------------------
function ItemTab({ settings, update }) {
  const [units, setUnits] = useState(getUnits);
  const [newUnit, setNewUnit] = useState("");

  const saveUnit = () => {
    const value = newUnit.trim();
    if (!value) return;
    const updated = addCustomUnit(value);
    setUnits(updated);
    setNewUnit("");
  };

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Inventory & Item Properties</h3>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={settings.enableBarcodeScanning ?? true}
              onChange={(e) => update("enableBarcodeScanning", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600"
            />
            Barcode Scanning Support
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={settings.enableItemCategory ?? true}
              onChange={(e) => update("enableItemCategory", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600"
            />
            Enable Item Categories & Sub-Categories
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={settings.stopSaleOnNegativeStock ?? false} onChange={(e) => update("stopSaleOnNegativeStock", e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
            Stock Maintenance <span className="font-normal text-slate-500">(block sales exceeding available stock)</span>
          </label>

          <div className="rounded-md border border-slate-200 p-3">
            <label className="block text-xs font-semibold text-slate-700">Items Unit</label>
            <p className="mt-1 text-xs text-slate-500">Shared unit list used by item forms and transaction unit selectors.</p>
            <div className="mt-2 flex gap-2">
              <input value={newUnit} onChange={(event) => setNewUnit(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveUnit(); } }} placeholder="Add unit (for example, Carton)" className="h-9 min-w-0 flex-1 rounded border border-slate-300 px-2 text-xs" />
              <button type="button" onClick={saveUnit} disabled={!newUnit.trim()} className="rounded bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50">Add Unit</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Available: {units.join(", ")}</p>
          </div>

          <label className="flex items-center gap-3 text-xs font-semibold text-slate-700">
            <span>Default Unit</span>
            <select value={settings.defaultItemUnit || "PCS"} onChange={(event) => update("defaultItemUnit", event.target.value)} className="h-9 min-w-32 rounded border border-slate-300 bg-white px-2 text-xs">
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={settings.enableItemDescription ?? true} onChange={(e) => update("enableItemDescription", e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
            Item Description
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={settings.enableGst ?? true} onChange={(e) => update("enableGst", e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
            Item-wise Tax
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={settings.enableItemDiscount ?? true} onChange={(e) => update("enableItemDiscount", e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
            Item-wise Discount
          </label>

          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Batch/expiry and serial/IMEI controls are hidden in V1. Previously enabled workflows continue using saved settings; existing item and transaction records are retained.
          </p>
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------------------------
// SERVICE REMINDERS TAB
// -------------------------------------------------------------
function ServiceRemindersTab({ settings, update }) {
  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Service Reminders</h3>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={settings.serviceRemindersEnabled || false}
              onChange={(e) => update("serviceRemindersEnabled", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600"
            />
            Enable Service Due Date Reminders
          </label>

          {settings.serviceRemindersEnabled && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-700">
              <span>Notify customers</span>
              <input
                type="number"
                min="1"
                max="30"
                value={settings.reminderDaysBefore || 3}
                onChange={(e) => update("reminderDaysBefore", Number(e.target.value) || 3)}
                className="h-8 w-14 rounded border border-slate-300 text-center font-bold text-slate-800"
              />
              <span>days before service due date</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------------------------
// ACCOUNTING TAB
// -------------------------------------------------------------
function AccountingTab({ settings, update }) {
  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Books & Financial Calendar</h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Financial Year Beginning</label>
            <select
              value={settings.financialYearStart || "01/04"}
              onChange={(e) => update("financialYearStart", e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-500"
            >
              <option value="01/04">1st April (India Standard FY)</option>
              <option value="01/01">1st January (Calendar Year)</option>
            </select>
          </div>

          <div className="pt-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.closeBooksEnabled || false}
                onChange={(e) => update("closeBooksEnabled", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Lock Transactions on or before Financial Year End
            </label>
            <p className="ml-6 mt-1 text-[11px] text-slate-400">
              Prevents editing historical invoices after audit closing.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}



// Helper: Info Tooltip
function InfoTooltip({ text }) {
  return (
    <span
      className="inline-flex cursor-help items-center text-slate-400 hover:text-slate-600"
      title={text}
      aria-label={text}
    >
      <FiInfo className="h-3.5 w-3.5" />
    </span>
  );
}

export default Settings;
