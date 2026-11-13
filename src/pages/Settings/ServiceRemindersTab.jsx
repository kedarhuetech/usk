// Service Reminders Settings & Management Tab
// Allows toggling service due date reminder rules and managing active customer service due dates.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiBell,
  FiCalendar,
  FiCheck,
  FiClock,
  FiEdit,
  FiEye,
  FiLoader,
  FiMail,
  FiMessageSquare,
  FiPhone,
  FiPlus,
  FiSend,
  FiTrash2,
  FiUser,
  FiX,
  FiZap,
} from "react-icons/fi";
import {
  getReminderSettings,
  saveReminderSettings,
  getReminderRecords,
  saveReminderRecord,
  deleteReminderRecord,
  SERVICE_REMINDERS_CHANGED_EVENT,
} from "../../services/serviceRemindersStorage.js";
import {
  processServiceReminders,
  buildWhatsAppReminder,
  buildEmailReminder,
  recordReminderNotification,
  localDateString,
  sendServiceReminderViaMeta,
  checkMetaWhatsAppConnection,
  formatReminderMessage,
  requestServiceReminderTemplateApproval,
  autoDispatchDueRemindersViaMeta,
} from "../../services/serviceRemindersService.js";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";
import { getParties } from "../../services/partiesStorage.js";
import { toast, ConfirmModal } from "../../components/Common/Toast.jsx";

export default function ServiceRemindersTab({ settings: parentSettings, update: parentUpdate }) {
  const [settings, setSettings] = useState(() => getReminderSettings());
  const [records, setRecords] = useState(() => getReminderRecords());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [metaStatus, setMetaStatus] = useState({ connected: false, loading: true });
  const [sendingId, setSendingId] = useState(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [viewSentModal, setViewSentModal] = useState(null);
  const [emailModal, setEmailModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    tone: "primary",
    onConfirm: null,
  });

  useEffect(() => {
    checkMetaWhatsAppConnection().then((status) => {
      setMetaStatus({ ...status, loading: false });
    });
  }, []);

  const [formCustomer, setFormCustomer] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formService, setFormService] = useState("");
  const [formServiceDate, setFormServiceDate] = useState(() => localDateString());
  const [formDueDate, setFormDueDate] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const parties = useMemo(() => {
    try {
      return getParties();
    } catch {
      return [];
    }
  }, []);

  const company = useMemo(() => {
    try {
      const p = getCompanyProfile();
      return p?.businessName || p?.companyName || "Sai Kirana Stores";
    } catch {
      return "Sai Kirana Stores";
    }
  }, []);

  useEffect(() => {
    const reload = () => {
      setSettings(getReminderSettings());
      setRecords(getReminderRecords());
    };
    window.addEventListener(SERVICE_REMINDERS_CHANGED_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(SERVICE_REMINDERS_CHANGED_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  useEffect(() => {
    if (parentSettings) {
      setSettings((prev) => ({
        ...prev,
        enabled: parentSettings.serviceRemindersEnabled ?? prev.enabled,
        reminderDaysBefore: parentSettings.reminderDaysBefore ?? prev.reminderDaysBefore,
        autoNotifyWhatsApp: parentSettings.serviceRemindersAutoWhatsApp ?? prev.autoNotifyWhatsApp,
      }));
    }
  }, [
    parentSettings?.serviceRemindersEnabled,
    parentSettings?.reminderDaysBefore,
    parentSettings?.serviceRemindersAutoWhatsApp,
  ]);

  const processed = useMemo(() => {
    return processServiceReminders({ records, settings });
  }, [records, settings]);

  const autoDispatchingRef = useRef(false);

  // Automatically dispatch due reminders via Meta WhatsApp without requiring clicking
  useEffect(() => {
    if (!metaStatus.connected || !settings.enabled || settings.autoNotifyWhatsApp === false) {
      return;
    }
    const unnotified = (processed.activeAlerts || []).filter(
      (r) => r.hasValidPhone && !r.alreadyNotifiedForThisDueDate
    );
    if (!unnotified.length || autoDispatchingRef.current) {
      return;
    }

    autoDispatchingRef.current = true;
    autoDispatchDueRemindersViaMeta(company)
      .then((res) => {
        if (res.dispatched > 0) {
          toast.success(
            `⚡ Automatically sent ${res.dispatched} due service reminder${res.dispatched > 1 ? "s" : ""} via WhatsApp!`,
            { duration: 5500 }
          );
          setRecords(getReminderRecords());
        }
      })
      .catch((err) => console.warn("Auto-dispatch reminder check error:", err))
      .finally(() => {
        autoDispatchingRef.current = false;
      });
  }, [metaStatus.connected, settings.enabled, settings.autoNotifyWhatsApp, processed.activeAlerts, company]);

  const showNotice = (msg) => {
    setNotice(msg);
    toast.success(msg);
    setTimeout(() => setNotice(""), 3500);
  };

  const handleToggleEnable = (e) => {
    const val = e.target.checked;
    const updated = saveReminderSettings({ enabled: val });
    setSettings(updated);
    if (parentUpdate) parentUpdate("serviceRemindersEnabled", val);
    showNotice(val ? "Service reminders enabled" : "Service reminders disabled");
  };

  const handleChangeDays = (e) => {
    const val = Math.max(1, Math.min(60, Number(e.target.value) || 1));
    const updated = saveReminderSettings({ reminderDaysBefore: val });
    setSettings(updated);
    if (parentUpdate) parentUpdate("reminderDaysBefore", val);
  };

  const handleToggleAutoNotify = (e) => {
    const val = e.target.checked;
    const updated = saveReminderSettings({ autoNotifyWhatsApp: val });
    setSettings(updated);
    if (parentUpdate) parentUpdate("serviceRemindersAutoWhatsApp", val);
    showNotice(val ? "⚡ Auto-send enabled: Due reminders will be sent automatically" : "Auto-send disabled");
  };

  const openAddModal = (record = null) => {
    if (record) {
      setEditingRecord(record);
      setFormCustomer(record.customerName || "");
      setFormPhone(record.customerPhone || "");
      setFormEmail(record.customerEmail || "");
      setFormService(record.serviceName || "");
      setFormServiceDate(record.serviceDate || localDateString());
      setFormDueDate(record.serviceDueDate || "");
      setFormNotes(record.notes || "");
    } else {
      setEditingRecord(null);
      setFormCustomer("");
      setFormPhone("");
      setFormEmail("");
      setFormService("Maintenance Service");
      setFormServiceDate(localDateString());
      // Default due date: 30 days from now
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setFormDueDate(localDateString(d));
      setFormNotes("");
    }
    setModalOpen(true);
  };

  const handleSelectParty = (e) => {
    const name = e.target.value;
    setFormCustomer(name);
    const party = parties.find((p) => (p.partyName || p.name) === name);
    if (party) {
      if (party.phone) setFormPhone(party.phone);
      if (party.email) setFormEmail(party.email);
    }
  };

  const handleSaveModal = (e) => {
    e.preventDefault();
    if (!formCustomer.trim()) {
      toast.error("Please enter customer name.");
      return;
    }
    if (!formDueDate) {
      toast.error("Please select a service due date.");
      return;
    }

    const payload = {
      ...(editingRecord || {}),
      customerName: formCustomer.trim(),
      customerPhone: formPhone.trim(),
      customerEmail: formEmail.trim(),
      serviceName: formService.trim() || "Service Maintenance",
      serviceDate: formServiceDate,
      serviceDueDate: formDueDate,
      notes: formNotes.trim(),
      // If due date was changed on an existing record, reset notified flag so the new date alerts properly
      ...(editingRecord && editingRecord.serviceDueDate !== formDueDate
        ? { lastNotifiedDueDate: null }
        : {}),
    };

    saveReminderRecord(payload);
    setRecords(getReminderRecords());
    setModalOpen(false);
    showNotice(editingRecord ? "Service reminder updated" : "Service reminder scheduled");
  };

  const handleDelete = (id, customerName = "") => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Service Reminder",
      message: `Are you sure you want to delete this service due date record${customerName ? ` for "${customerName}"` : ""}?`,
      confirmText: "Delete Record",
      tone: "danger",
      onConfirm: () => {
        deleteReminderRecord(id);
        setRecords(getReminderRecords());
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        showNotice("Service reminder deleted");
      },
    });
  };

  const handleMarkCompleted = (record) => {
    saveReminderRecord({
      ...record,
      status: "Completed",
    });
    setRecords(getReminderRecords());
    showNotice(`Marked ${record.serviceName} as completed`);
  };

  const handleRequestTemplateApproval = async () => {
    setRequestingApproval(true);
    try {
      const res = await requestServiceReminderTemplateApproval();
      if (res.success) {
        toast.success(res.message || "Template approval request submitted to Meta!", {
          title: "Template Request Sent",
          duration: 7000,
        });
        checkMetaWhatsAppConnection().then((status) => {
          setMetaStatus({ ...status, loading: false });
        });
      } else {
        toast.error(res.error || "Could not submit template approval request.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to submit template approval request.");
    } finally {
      setRequestingApproval(false);
    }
  };

  const handleSendMetaWhatsApp = async (record) => {
    setSendingId(record.id);
    try {
      const res = await sendServiceReminderViaMeta(record, company);
      setRecords(getReminderRecords());
      if (res.success) {
        showNotice(`✓ Reminder delivered to ${record.customerName} via WhatsApp!`);
      } else {
        if (res.fallbackUrl) {
          toast.info("Could not deliver via automated WhatsApp. Opening WhatsApp Web link...", {
            title: "WhatsApp Web Fallback",
            duration: 8500,
            action: {
              label: "Open WhatsApp Web Link",
              onClick: () => {
                window.open(res.fallbackUrl, "_blank");
                recordReminderNotification(record.id, "whatsapp", { message: res.message, recipient: record.customerPhone });
                setRecords(getReminderRecords());
                toast.info(`WhatsApp chat opened for ${record.customerName}`);
              },
            },
          });
        } else {
          toast.error(res.error || "Failed to send reminder via WhatsApp.");
        }
      }
    } catch (err) {
      toast.error(err.message || "Failed to send reminder.");
    } finally {
      setSendingId(null);
    }
  };

  const handleSendAllDueMeta = async () => {
    const eligible = processed.activeAlerts.filter((r) => r.hasValidPhone);
    if (!eligible.length) {
      toast.info("No due service reminders with phone numbers require sending right now.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Send Due Reminders",
      message: `Send ${eligible.length} service reminder${eligible.length > 1 ? "s" : ""} to customer phones via WhatsApp?`,
      confirmText: `Send ${eligible.length} Reminders Now`,
      tone: "emerald",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setBulkSending(true);
        let sentCount = 0;
        let failCount = 0;

        for (const record of eligible) {
          try {
            const res = await sendServiceReminderViaMeta(record, company);
            if (res.success) sentCount++;
            else failCount++;
          } catch {
            failCount++;
          }
        }

        setRecords(getReminderRecords());
        setBulkSending(false);
        if (sentCount > 0 && failCount === 0) {
          toast.success(`Successfully sent ${sentCount} reminder${sentCount > 1 ? "s" : ""} via WhatsApp!`);
        } else if (sentCount > 0 && failCount > 0) {
          toast.warning(`Sent ${sentCount} reminders, but ${failCount} failed to deliver.`);
        } else {
          toast.error(`Could not deliver reminders. Please check customer phone numbers.`);
        }
      },
    });
  };

  const handleSendWhatsApp = (record) => {
    const res = buildWhatsAppReminder(record, company);
    if (!res.success) {
      toast.error(res.error || "Cannot send WhatsApp reminder: missing phone number.");
      return;
    }
    recordReminderNotification(record.id, "whatsapp", { message: res.message, recipient: record.customerPhone });
    setRecords(getReminderRecords());
    window.open(res.url, "_blank");
    toast.success(`WhatsApp chat opened for ${record.customerName}`);
  };

  const handleSendEmail = (record) => {
    const email = record.customerEmail || record.email || "";
    const res = buildEmailReminder({ ...record, customerEmail: email || "customer@example.com" }, company);
    setEmailModal({
      record,
      email,
      subject: res.subject,
      message: res.message,
    });
  };

  const handleDispatchEmail = (method = "gmail") => {
    if (!emailModal) return;
    const email = (emailModal.email || "").trim();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid customer email address.");
      return;
    }

    // If customer email was added/updated, persist it back to the record
    if (email !== emailModal.record.customerEmail) {
      saveReminderRecord({
        ...emailModal.record,
        customerEmail: email,
      });
    }

    const res = buildEmailReminder({ ...emailModal.record, customerEmail: email }, company);
    recordReminderNotification(emailModal.record.id, "email", {
      message: res.message,
      recipient: email,
      status: "SENT",
    });
    setRecords(getReminderRecords());

    if (method === "gmail") {
      window.open(res.gmailUrl, "_blank");
      toast.success(`Opened Gmail Web compose for ${emailModal.record.customerName}`);
    } else {
      const a = document.createElement("a");
      a.href = res.mailtoUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Launched default email client for ${emailModal.record.customerName}`);
    }

    setEmailModal(null);
  };

  const sentCount = useMemo(() => {
    return records.filter((r) => r.lastNotifiedAt || (r.notificationHistory && r.notificationHistory.length > 0)).length;
  }, [records]);

  const filteredList = useMemo(() => {
    if (filter === "dueSoon") return processed.dueSoon;
    if (filter === "dueToday") return processed.dueToday;
    if (filter === "overdue") return processed.overdue;
    if (filter === "upcoming") return processed.upcoming;
    if (filter === "completed") return processed.completed;
    if (filter === "sentHistory") {
      return records.filter((r) => r.lastNotifiedAt || (r.notificationHistory && r.notificationHistory.length > 0));
    }
    return processed.all.filter((r) => r.status !== "Completed" && r.status !== "Cancelled");
  }, [processed, records, filter]);

  return (
    <div className="max-w-5xl space-y-6">
      {notice && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-800 animate-in fade-in duration-150">
          <FiCheck className="h-4 w-4 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}

      {/* Main Settings Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Service Due Date Reminders
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Track periodic maintenance schedules, AMC renewals, and upcoming customer service due dates.
        </p>

        <div className="mt-4 space-y-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(settings.enabled)}
              onChange={handleToggleEnable}
              className="h-4 w-4 rounded accent-blue-600"
            />
            Enable Service Due Date Reminders
          </label>

          {settings.enabled && (
            <div className="ml-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                <span>Notify customers</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={settings.reminderDaysBefore || 2}
                  onChange={handleChangeDays}
                  className="h-8 w-14 rounded border border-slate-300 text-center font-bold text-slate-800 outline-none focus:border-blue-500"
                />
                <span>days before service due date</span>
                <span className="text-[11px] text-slate-400">
                  (Reminder alerts trigger {settings.reminderDaysBefore || 2} days in advance)
                </span>
              </div>

              {/* Auto-send Due Reminders Option */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={settings.autoNotifyWhatsApp !== false}
                    onChange={handleToggleAutoNotify}
                    className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                  />
                  <span>Auto-send due reminders via WhatsApp (No clicking required)</span>
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <FiZap className="h-3 w-3 text-emerald-600" /> Automated
                  </span>
                </label>
                <p className="ml-6 text-[11px] text-slate-500 mt-0.5">
                  When enabled, any service reminder entering its reminder window is automatically dispatched to the customer's WhatsApp without manual clicking.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Live Service Reminders Manager */}
      {settings.enabled && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Header & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h4 className="text-sm font-bold text-slate-900">Active Service Due Dates</h4>
                {settings.autoNotifyWhatsApp !== false && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700"
                    title="Due reminders automatically dispatch in the background without needing to click"
                  >
                    <FiZap className="h-3 w-3 text-emerald-600" />
                    Auto-Send Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitors customer service schedules with automatic background dispatch to customer WhatsApp phones and detailed dispatch history.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Bulk Send Due Reminders in Background */}
              {processed.activeAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={handleSendAllDueMeta}
                  disabled={bulkSending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                  title="Send all due reminders to customer phones via WhatsApp"
                >
                  {bulkSending ? (
                    <><FiLoader className="h-4 w-4 animate-spin" /> Sending Reminders...</>
                  ) : (
                    <><FiZap className="h-4 w-4" /> Send Due Reminders ({processed.activeAlerts.length})</>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => openAddModal(null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition cursor-pointer"
              >
                <FiPlus className="h-4 w-4" /> Add Service Due Date
              </button>
            </div>
          </div>

          {/* Metric KPI Pills */}
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-5 text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-lg p-3 text-left transition border ${
                filter === "all" ? "bg-white border-blue-500 shadow-sm" : "bg-white/80 border-slate-200 hover:bg-white"
              }`}
            >
              <span className="block text-[11px] font-semibold text-slate-500">Active Services</span>
              <span className="text-xl font-bold text-slate-900">{processed.summary.active}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilter("dueToday")}
              className={`rounded-lg p-3 text-left transition border ${
                filter === "dueToday" ? "bg-white border-rose-500 shadow-sm" : "bg-white/80 border-slate-200 hover:bg-white"
              }`}
            >
              <span className="block text-[11px] font-semibold text-rose-600">Due Today</span>
              <span className="text-xl font-bold text-rose-700">{processed.summary.dueToday}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilter("dueSoon")}
              className={`rounded-lg p-3 text-left transition border ${
                filter === "dueSoon" ? "bg-white border-amber-500 shadow-sm" : "bg-white/80 border-slate-200 hover:bg-white"
              }`}
            >
              <span className="block text-[11px] font-semibold text-amber-600">Due Soon (≤ {settings.reminderDaysBefore}d)</span>
              <span className="text-xl font-bold text-amber-700">{processed.summary.dueSoon}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilter("overdue")}
              className={`rounded-lg p-3 text-left transition border ${
                filter === "overdue" ? "bg-white border-purple-500 shadow-sm" : "bg-white/80 border-slate-200 hover:bg-white"
              }`}
            >
              <span className="block text-[11px] font-semibold text-purple-600">Overdue</span>
              <span className="text-xl font-bold text-purple-700">{processed.summary.overdue}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilter("sentHistory")}
              className={`rounded-lg p-3 text-left transition border ${
                filter === "sentHistory" ? "bg-white border-emerald-500 shadow-sm" : "bg-white/80 border-slate-200 hover:bg-white"
              }`}
            >
              <span className="block text-[11px] font-semibold text-emerald-700">Sent History</span>
              <span className="text-xl font-bold text-emerald-800">{sentCount}</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Service / Task</th>
                  <th className="px-4 py-3">Service Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Status &amp; Notification</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!filteredList.length && (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      <FiCalendar className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">No service records found</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {filter === "sentHistory"
                          ? "No dispatched reminders recorded yet. Use 'Send via Meta' to notify customers."
                          : 'Click "Add Service Due Date" to record upcoming customer maintenance schedules.'}
                      </p>
                    </td>
                  </tr>
                )}

                {filteredList.map((record) => {
                  const statusTone =
                    record.status === "Due Today"
                      ? "bg-rose-100 text-rose-800 border-rose-200"
                      : record.status === "Due Soon"
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : record.status === "Overdue"
                      ? "bg-purple-100 text-purple-800 border-purple-200"
                      : record.status === "Completed"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                      : "bg-slate-100 text-slate-700 border-slate-200";

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="font-semibold text-slate-900">{record.customerName}</div>
                        <div className="text-[11px] text-slate-500 flex flex-col gap-0.5 mt-0.5">
                          {record.customerPhone ? <span>📞 {record.customerPhone}</span> : <span className="text-amber-600">No phone</span>}
                          {record.customerEmail ? <span className="text-blue-600 truncate max-w-[170px]" title={record.customerEmail}>✉️ {record.customerEmail}</span> : <span className="text-slate-400 italic">No email</span>}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium">{record.serviceName}</div>
                        {record.notes && <div className="text-[10px] text-slate-400 italic">{record.notes}</div>}
                      </td>

                      <td className="px-4 py-3 text-slate-600">
                        {record.serviceDate || "—"}
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {record.serviceDueDate || "—"}
                        {record.daysUntilDue !== null && (
                          <div className="text-[10px] font-normal text-slate-500">
                            {record.daysUntilDue > 0
                              ? `in ${record.daysUntilDue} day${record.daysUntilDue === 1 ? "" : "s"}`
                              : record.daysUntilDue === 0
                              ? "Today"
                              : `${Math.abs(record.daysUntilDue)} days past`}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusTone}`}>
                            {record.status}
                          </span>
                          {record.lastNotifiedAt ? (
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                <FiCheck className="h-3 w-3" />
                                Sent via WhatsApp
                              </span>
                              <button
                                type="button"
                                onClick={() => setViewSentModal(record)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                                title="View exact message sent to customer"
                              >
                                <FiEye className="h-3 w-3" /> View Message
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Not sent yet</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* WhatsApp Background Send Button */}
                          {record.customerPhone && (
                            record.alreadyNotifiedForThisDueDate ? (
                              <button
                                type="button"
                                title="Reminder was already sent for this due date. Click to resend if needed."
                                disabled={sendingId === record.id || bulkSending}
                                onClick={() => handleSendMetaWhatsApp(record)}
                                className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 transition active:scale-98 cursor-pointer"
                              >
                                {sendingId === record.id ? (
                                  <><FiLoader className="h-3 w-3 animate-spin" /> Sending...</>
                                ) : (
                                  <><FiCheck className="h-3 w-3 text-emerald-600" /> Resend</>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Send reminder directly to customer WhatsApp"
                                disabled={sendingId === record.id || bulkSending}
                                onClick={() => handleSendMetaWhatsApp(record)}
                                className="inline-flex items-center gap-1 rounded border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition active:scale-98 cursor-pointer"
                              >
                                {sendingId === record.id ? (
                                  <><FiLoader className="h-3 w-3 animate-spin" /> Sending...</>
                                ) : (
                                  <><FiZap className="h-3 w-3" /> Send WhatsApp</>
                                )}
                              </button>
                            )
                          )}

                          {/* WhatsApp Manual Web Link Fallback */}
                          <button
                            type="button"
                            title="Open WhatsApp Web chat link"
                            onClick={() => handleSendWhatsApp(record)}
                            disabled={!record.customerPhone}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            <FiMessageSquare className="h-3 w-3 text-emerald-600" /> Web Link
                          </button>

                          {/* Email Reminder Button */}
                          <button
                            type="button"
                            title={record.customerEmail ? `Send email reminder to ${record.customerEmail}` : "Send or add customer email"}
                            onClick={() => handleSendEmail(record)}
                            className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition"
                          >
                            <FiMail className="h-3 w-3" /> Email
                          </button>

                          {/* Mark Complete */}
                          {record.status !== "Completed" && (
                            <button
                              type="button"
                              title="Mark Completed"
                              onClick={() => handleMarkCompleted(record)}
                              className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-emerald-600 transition"
                            >
                              <FiCheck className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => openAddModal(record)}
                            className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition"
                          >
                            <FiEdit className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => handleDelete(record.id, record.customerName)}
                            className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-rose-600 transition"
                          >
                            <FiTrash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Add / Edit Service Reminder Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100">
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingRecord ? "Edit Service Due Date" : "Add Customer Service Due Date"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </header>

            <form onSubmit={handleSaveModal} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Customer / Party <span className="text-rose-500">*</span>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    required
                    value={formCustomer}
                    onChange={(e) => setFormCustomer(e.target.value)}
                    placeholder="Enter customer name"
                    className="h-9 flex-1 rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-blue-500"
                  />
                  {parties.length > 0 && (
                    <select
                      onChange={handleSelectParty}
                      value=""
                      className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 outline-none"
                    >
                      <option value="" disabled>Select Party</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.partyName || p.name}>
                          {p.partyName || p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Phone Number (WhatsApp)</label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Email Address (Optional)</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. client@gmail.com"
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Service / Item Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  placeholder="e.g. Water Purifier Filter / Car Periodic Service / AMC"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Service Performed Date</label>
                  <input
                    type="date"
                    value={formServiceDate}
                    onChange={(e) => setFormServiceDate(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Next Service Due Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Notes / Details</label>
                <textarea
                  rows="2"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Any special remarks or warranty details..."
                  className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Save Service Due Date
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Sent Message Details Modal */}
      {viewSentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiMessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Sent Reminder Details</h3>
                  <p className="text-[11px] text-slate-500">
                    To: <span className="font-semibold text-slate-800">{viewSentModal.customerName}</span> ({viewSentModal.customerPhone || "No phone"})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewSentModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
            </header>

            <div className="p-6 space-y-4 text-xs">
              {/* Delivery Meta Summary */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200/70">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Delivery Channel</span>
                  <p className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                    {viewSentModal.lastNotifiedChannel === "meta_whatsapp" ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <FiZap className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp Direct
                      </span>
                    ) : viewSentModal.lastNotifiedChannel === "email" ? (
                      <span className="text-blue-700 font-bold flex items-center gap-1">
                        <FiMail className="h-3.5 w-3.5 text-blue-600" /> Email
                      </span>
                    ) : (
                      <span className="text-emerald-800 font-bold flex items-center gap-1">
                        <FiMessageSquare className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp Direct Link
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Dispatched At</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {viewSentModal.lastNotifiedAt && !isNaN(new Date(viewSentModal.lastNotifiedAt).getTime())
                      ? new Date(viewSentModal.lastNotifiedAt).toLocaleString()
                      : "Just now"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Service Due Item</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewSentModal.serviceName || "Service"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Due Date Mentioned</span>
                  <p className="font-semibold text-rose-600 mt-0.5">
                    {viewSentModal.serviceDueDate || viewSentModal.lastNotifiedDueDate || viewSentModal.nextDueDate || "—"}
                  </p>
                </div>
              </div>

              {/* Message Content Bubble */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700">Message Content Delivered:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const msg = viewSentModal.lastNotifiedMessage || formatReminderMessage(viewSentModal, company);
                      navigator.clipboard.writeText(msg);
                      showNotice("Copied message to clipboard!");
                    }}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Copy Text
                  </button>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-[#E7F8EC] p-3.5 text-slate-900 whitespace-pre-wrap font-sans text-xs leading-relaxed shadow-xs">
                  {viewSentModal.lastNotifiedMessage || formatReminderMessage(viewSentModal, company)}
                </div>
              </div>

              {/* Notification History Log (if any) */}
              {Array.isArray(viewSentModal.notificationHistory) && viewSentModal.notificationHistory.length > 1 && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-700 block mb-1.5">Send History ({viewSentModal.notificationHistory.length} events):</span>
                  <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                    {viewSentModal.notificationHistory.map((item, idx) => {
                      const rawDate = item.at || item.timestamp || item.sentAt || item.date || item.createdAt;
                      const dateObj = rawDate ? new Date(rawDate) : null;
                      const dateDisplay = dateObj && !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : "Recent";
                      return (
                        <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-slate-600">
                          <span className="font-medium text-slate-800 capitalize">
                            {item.channel === "meta_whatsapp" ? "WhatsApp" : (item.channel?.replace("_", " ") || "WhatsApp")}
                          </span>
                          <span>{item.recipient || viewSentModal.customerPhone}</span>
                          <span className="text-slate-400 text-[10px]">{dateDisplay}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setViewSentModal(null)}
                  className="rounded-lg bg-slate-800 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-900 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Composer & Dispatch Modal */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                  <FiMail className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Send Email Service Reminder</h3>
                  <p className="text-[11px] text-slate-500">
                    To: <span className="font-semibold text-slate-800">{emailModal.record.customerName}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEmailModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
            </header>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Customer Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={emailModal.email}
                  onChange={(e) => setEmailModal({ ...emailModal, email: e.target.value })}
                  placeholder="e.g. customer@gmail.com"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-blue-500 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Subject Line
                </label>
                <input
                  type="text"
                  readOnly
                  value={emailModal.subject}
                  className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-xs outline-none text-slate-700 cursor-default"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Message Body:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(emailModal.message);
                      toast.success("Copied email text to clipboard!");
                    }}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Copy Text
                  </button>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 text-slate-900 whitespace-pre-wrap font-sans text-xs leading-relaxed max-h-36 overflow-y-auto">
                  {emailModal.message}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEmailModal(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDispatchEmail("default")}
                    title="Open default desktop mail client (Outlook, Thunderbird, Mail app)"
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
                  >
                    Default Mail App
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDispatchEmail("gmail")}
                    title="Open Gmail Web in new tab with draft ready"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                  >
                    Open in Gmail Web
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Confirm Modal (replaces native window.confirm) */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        tone={confirmModal.tone}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
