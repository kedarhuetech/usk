// Service Reminders Settings & Management Tab
// Allows toggling service due date reminder rules and managing active customer service due dates.

import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiBell,
  FiCalendar,
  FiCheck,
  FiClock,
  FiEdit,
  FiMail,
  FiMessageSquare,
  FiPhone,
  FiPlus,
  FiTrash2,
  FiUser,
  FiX,
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
} from "../../services/serviceRemindersService.js";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";
import { getParties } from "../../services/partiesStorage.js";

export default function ServiceRemindersTab({ settings: parentSettings, update: parentUpdate }) {
  const [settings, setSettings] = useState(() => getReminderSettings());
  const [records, setRecords] = useState(() => getReminderRecords());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");

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
      }));
    }
  }, [parentSettings?.serviceRemindersEnabled, parentSettings?.reminderDaysBefore]);

  const processed = useMemo(() => {
    return processServiceReminders({ records, settings });
  }, [records, settings]);

  const showNotice = (msg) => {
    setNotice(msg);
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
      alert("Please enter customer name.");
      return;
    }
    if (!formDueDate) {
      alert("Please select a service due date.");
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

  const handleDelete = (id) => {
    if (window.confirm("Delete this service due date record?")) {
      deleteReminderRecord(id);
      setRecords(getReminderRecords());
      showNotice("Service reminder deleted");
    }
  };

  const handleMarkCompleted = (record) => {
    saveReminderRecord({
      ...record,
      status: "Completed",
    });
    setRecords(getReminderRecords());
    showNotice(`Marked ${record.serviceName} as completed`);
  };

  const handleSendWhatsApp = (record) => {
    const res = buildWhatsAppReminder(record, company);
    if (!res.success) {
      alert(res.error || "Cannot send WhatsApp reminder: missing phone number.");
      return;
    }
    recordReminderNotification(record.id, "whatsapp");
    setRecords(getReminderRecords());
    window.open(res.url, "_blank");
    showNotice(`WhatsApp reminder launched for ${record.customerName}`);
  };

  const handleSendEmail = (record) => {
    const res = buildEmailReminder(record, company);
    if (!res.success) {
      alert(res.error || "Cannot send email reminder: missing email address.");
      return;
    }
    recordReminderNotification(record.id, "email");
    setRecords(getReminderRecords());
    window.location.href = res.url;
    showNotice(`Email reminder launched for ${record.customerName}`);
  };

  const filteredList = useMemo(() => {
    if (filter === "dueSoon") return processed.dueSoon;
    if (filter === "dueToday") return processed.dueToday;
    if (filter === "overdue") return processed.overdue;
    if (filter === "upcoming") return processed.upcoming;
    if (filter === "completed") return processed.completed;
    return processed.all.filter((r) => r.status !== "Completed" && r.status !== "Cancelled");
  }, [processed, filter]);

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
            <div className="ml-6 flex flex-wrap items-center gap-2 text-xs text-slate-700">
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
          )}
        </div>
      </section>

      {/* Live Service Reminders Manager */}
      {settings.enabled && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Header & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Active Service Due Dates</h4>
              <p className="text-xs text-slate-500">
                Monitors customer service schedules and provides one-click reminders via WhatsApp and Email.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAddModal(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <FiPlus className="h-4 w-4" /> Add Service Due Date
            </button>
          </div>

          {/* Metric KPI Pills */}
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-4 text-xs">
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
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!filteredList.length && (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      <FiCalendar className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">No service due dates found</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Click "Add Service Due Date" to record upcoming customer maintenance schedules.
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
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          {record.customerPhone ? <span>{record.customerPhone}</span> : <span className="text-amber-600">No phone</span>}
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
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusTone}`}>
                          {record.status}
                        </span>
                        {record.lastNotifiedAt && (
                          <div className="text-[10px] text-emerald-600 mt-1 flex items-center gap-0.5">
                            <FiCheck className="h-3 w-3" /> Notified
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* WhatsApp Reminder Button */}
                          <button
                            type="button"
                            title="Send WhatsApp Reminder"
                            onClick={() => handleSendWhatsApp(record)}
                            disabled={!record.customerPhone}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <FiMessageSquare className="h-3 w-3" /> WhatsApp
                          </button>

                          {/* Email Reminder Button */}
                          {record.customerEmail && (
                            <button
                              type="button"
                              title="Send Email Reminder"
                              onClick={() => handleSendEmail(record)}
                              className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <FiMail className="h-3 w-3" /> Email
                            </button>
                          )}

                          {/* Mark Complete */}
                          {record.status !== "Completed" && (
                            <button
                              type="button"
                              title="Mark Completed"
                              onClick={() => handleMarkCompleted(record)}
                              className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-emerald-600"
                            >
                              <FiCheck className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => openAddModal(record)}
                            className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                          >
                            <FiEdit className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => handleDelete(record.id)}
                            className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-rose-600"
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
    </div>
  );
}
