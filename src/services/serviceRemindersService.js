// Service Reminders Business Logic & Calculation Engine
// Handles reminder date calculations, lifecycle statuses, duplicate prevention,
// and notification payload construction.

import {
  getReminderSettings,
  getReminderRecords,
  saveReminderRecord,
  saveReminderRecords,
} from "./serviceRemindersStorage.js";
import { getCompanyProfile } from "./companyProfileStorage.js";

const DAY_IN_MS = 86400000;

/**
 * Returns today's date in local YYYY-MM-DD format without timezone distortion.
 */
export function localDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates the exact calendar day difference between two YYYY-MM-DD dates:
 * (targetDate - fromDate)
 * Returns positive if targetDate is in the future, 0 if same day, negative if in the past.
 */
export function getCalendarDayDifference(fromDateStr, targetDateStr) {
  if (!fromDateStr || !targetDateStr) return null;
  const fromMs = Date.parse(`${fromDateStr.slice(0, 10)}T00:00:00Z`);
  const targetMs = Date.parse(`${targetDateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(targetMs)) return null;
  return Math.round((targetMs - fromMs) / DAY_IN_MS);
}

/**
 * Normalizes any date value (ISO string, Date object, SQL date) into a consistent YYYY-MM-DD string.
 */
export function normalizeDateOnly(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Calculates the date on which a reminder should trigger:
 * (serviceDueDate - daysBefore calendar days)
 */
export function calculateReminderDate(serviceDueDateStr, daysBefore = 2) {
  if (!serviceDueDateStr) return "";
  const cleanDate = normalizeDateOnly(serviceDueDateStr);
  const ms = Date.parse(`${cleanDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return "";

  const offsetMs = Number(daysBefore || 0) * DAY_IN_MS;
  const reminderDate = new Date(ms - offsetMs);
  return reminderDate.toISOString().slice(0, 10);
}

/**
 * Evaluates a single service reminder record against current settings and date.
 */
export function evaluateReminderStatus(record, settings = getReminderSettings(), today = localDateString()) {
  const dueDate = normalizeDateOnly(record.serviceDueDate);
  const daysBefore = Math.max(0, Number(settings?.reminderDaysBefore ?? 2));
  const reminderDate = calculateReminderDate(dueDate, daysBefore);
  const daysUntilDue = getCalendarDayDifference(today, dueDate);

  const phone = String(record.customerPhone || "").replace(/[^0-9]/g, "");
  const email = String(record.customerEmail || "").trim();
  const hasValidPhone = phone.length >= 7;
  const hasValidEmail = Boolean(email && email.includes("@"));
  const hasContact = hasValidPhone || hasValidEmail;

  // Duplicate Prevention:
  // Normalize lastNotifiedDueDate
  const cleanLastNotifiedDueDate = normalizeDateOnly(record.lastNotifiedDueDate);

  // Check notification history for any delivered/sent record matching this due date
  const hasDeliveredHistory = Array.isArray(record.notificationHistory) && record.notificationHistory.some((h) => {
    const hStatus = String(h?.status || "").toUpperCase();
    const isSentOrDelivered = hStatus === "DELIVERED" || hStatus === "SENT" || hStatus === "SUCCESS";
    if (!isSentOrDelivered) return false;

    const hDueDate = normalizeDateOnly(h?.dueDate);
    if (hDueDate && dueDate) {
      return hDueDate === dueDate;
    }
    return Boolean(cleanLastNotifiedDueDate && dueDate && cleanLastNotifiedDueDate === dueDate);
  });

  const alreadyNotifiedForThisDueDate = Boolean(
    (cleanLastNotifiedDueDate && dueDate && cleanLastNotifiedDueDate === dueDate) ||
    hasDeliveredHistory ||
    (record.lastNotifiedAt && (cleanLastNotifiedDueDate === dueDate || !cleanLastNotifiedDueDate))
  );

  let status = record.status || "Pending";
  if (status !== "Completed" && status !== "Cancelled") {
    if (alreadyNotifiedForThisDueDate) {
      status = "Reminded";
    } else if (daysUntilDue === null) {
      status = "Pending";
    } else if (daysUntilDue < 0) {
      status = "Overdue";
    } else if (daysUntilDue === 0) {
      status = "Due Today";
    } else if (daysUntilDue <= daysBefore) {
      status = "Due Soon";
    } else {
      status = "Upcoming";
    }
  }

  const isDateReached = Boolean(reminderDate && today >= reminderDate);
  const isEligibleForNotification =
    Boolean(settings?.enabled) &&
    status !== "Completed" &&
    status !== "Cancelled" &&
    isDateReached &&
    !alreadyNotifiedForThisDueDate;

  return {
    ...record,
    computedReminderDate: reminderDate,
    daysUntilDue,
    status,
    hasContact,
    hasValidPhone,
    hasValidEmail,
    isEligibleForNotification,
    alreadyNotifiedForThisDueDate,
  };
}

/**
 * Processes all service reminder records against current settings.
 * Returns evaluated collections, counts, and active reminder items.
 */
export function processServiceReminders({
  today = localDateString(),
  records = getReminderRecords(),
  settings = getReminderSettings(),
} = {}) {
  const evaluated = records.map((r) => evaluateReminderStatus(r, settings, today));

  const reminded = evaluated.filter((r) => r.status === "Reminded" || r.alreadyNotifiedForThisDueDate);
  const dueSoon = evaluated.filter((r) => r.status === "Due Soon" && !r.alreadyNotifiedForThisDueDate);
  const dueToday = evaluated.filter((r) => r.status === "Due Today" && !r.alreadyNotifiedForThisDueDate);
  const overdue = evaluated.filter((r) => r.status === "Overdue" && !r.alreadyNotifiedForThisDueDate);
  const upcoming = evaluated.filter((r) => r.status === "Upcoming" && !r.alreadyNotifiedForThisDueDate);
  const completed = evaluated.filter((r) => r.status === "Completed");
  const cancelled = evaluated.filter((r) => r.status === "Cancelled");

  // Reminders that should actively alert the user/customer right now
  const activeAlerts = evaluated.filter((r) => r.isEligibleForNotification);

  const summary = {
    total: evaluated.length,
    active: evaluated.filter((r) => r.status !== "Completed" && r.status !== "Cancelled").length,
    dueSoon: dueSoon.length,
    dueToday: dueToday.length,
    overdue: overdue.length,
    upcoming: upcoming.length,
    reminded: reminded.length,
    completed: completed.length,
    cancelled: cancelled.length,
    activeAlerts: activeAlerts.length,
    missingContact: evaluated.filter((r) => !r.hasContact && r.status !== "Completed").length,
  };

  return {
    all: evaluated,
    dueSoon,
    dueToday,
    overdue,
    upcoming,
    reminded,
    completed,
    cancelled,
    activeAlerts,
    summary,
  };
}

/**
 * Constructs the notification message using template interpolation.
 */
export function formatReminderMessage(record, companyName = "Sai Kirana Stores", template = null) {
  const defaultTemplate =
    "Dear {customerName}, this is a gentle reminder from {companyName} that your service for {serviceName} is due on {serviceDueDate}. Please contact us to book your appointment.";
  const tpl = template || defaultTemplate;

  const due = record.serviceDueDate ? new Date(`${record.serviceDueDate}T00:00:00`).toLocaleDateString("en-IN") : "soon";

  return tpl
    .replace(/{customerName}/g, record.customerName || "Valued Customer")
    .replace(/{serviceName}/g, record.serviceName || "Scheduled Service")
    .replace(/{serviceDueDate}/g, due)
    .replace(/{companyName}/g, companyName)
    .replace(/{invoiceNumber}/g, record.invoiceNumber || "-");
}

/**
 * Builds the external WhatsApp notification action URL.
 */
export function buildWhatsAppReminder(record, companyName = "Sai Kirana Stores") {
  const rawPhone = String(record.customerPhone || "").replace(/[^0-9]/g, "");
  if (!rawPhone || rawPhone.length < 7) {
    return {
      success: false,
      error: "Customer has no valid phone number.",
    };
  }

  let cleanPhone = rawPhone;
  if (rawPhone.length === 10) cleanPhone = `91${rawPhone}`;
  else if (rawPhone.length === 11 && rawPhone.startsWith("0")) cleanPhone = `91${rawPhone.slice(1)}`;
  const message = formatReminderMessage(record, companyName);
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  return {
    success: true,
    channel: "whatsapp",
    url,
    phone: cleanPhone,
    message,
  };
}

/**
 * Builds external Email notification links (both mailto: protocol and direct Gmail Web compose URL).
 */
export function buildEmailReminder(record, companyName = "Sai Kirana Stores") {
  const email = String(record.customerEmail || record.email || "").trim();
  if (!email || !email.includes("@")) {
    return {
      success: false,
      error: "Customer has no valid email address.",
    };
  }

  const message = formatReminderMessage(record, companyName);
  const subjectText = `Service Due Date Reminder - ${record.serviceName || "Service"} (${companyName})`;
  const encodedSubject = encodeURIComponent(subjectText);
  const encodedBody = encodeURIComponent(message);
  const mailtoUrl = `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodedSubject}&body=${encodedBody}`;

  return {
    success: true,
    channel: "email",
    url: mailtoUrl,
    mailtoUrl,
    gmailUrl,
    email,
    subject: subjectText,
    message,
  };
}

/**
 * Records that a reminder was dispatched to the customer.
 * Sets lastNotifiedAt, lastNotifiedMessage, and history entry to track what was sent.
 */
export function recordReminderNotification(recordId, channel = "in_app", details = {}) {
  const records = getReminderRecords();
  const target = records.find((r) => r.id === recordId);
  if (!target) return null;

  const cleanDueDate = normalizeDateOnly(target.serviceDueDate);
  const now = new Date().toISOString();
  const histId = details.id || details.messageId || `hist_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const historyEntry = {
    id: histId,
    channel,
    at: now,
    timestamp: now,
    sentAt: now,
    dueDate: cleanDueDate,
    message: details.message || target.lastNotifiedMessage || "",
    recipient: details.recipient || target.customerPhone || target.customerEmail || "",
    status: details.status || "SENT",
    messageId: details.messageId || null,
  };

  const updated = {
    ...target,
    status: "Reminded",
    lastNotifiedAt: now,
    lastNotifiedDueDate: cleanDueDate,
    lastNotifiedMessage: details.message || target.lastNotifiedMessage || "",
    lastNotifiedChannel: channel,
    notificationHistory: [...(target.notificationHistory || []), historyEntry],
    updatedAt: now,
  };

  saveReminderRecord(updated);
  return updated;
}

/**
 * Checks if the backend has an active Meta WhatsApp connection.
 */
export async function checkMetaWhatsAppConnection() {
  try {
    const response = await fetch("/api/whatsapp-business/connection");
    if (!response.ok) return { connected: false, configured: false };
    const data = await response.json();
    const templates = data.assets?.templates || [];
    const serviceTpl = templates.find((t) => t.name === "service_reminder_alert");
    return {
      connected: Boolean(data.connected || data.testModeConfigured),
      phoneNumber: data.selection?.phoneNumberId || data.assets?.phoneNumbers?.[0]?.display_phone_number || "",
      readyToSend: Boolean(data.readiness?.readyToSend || data.testModeConfigured),
      source: data.source || (data.testModeConfigured ? "test_mode" : "none"),
      serviceTemplateStatus: serviceTpl?.status || (data.testModeConfigured ? "APPROVED" : "NOT_REQUESTED"),
      templates,
    };
  } catch {
    return { connected: false, configured: false };
  }
}

/**
 * Sends a service due date reminder directly via Meta WhatsApp Cloud API in the background.
 * Automatically saves the record's notification history and what message was sent.
 */
export async function sendServiceReminderViaMeta(record, companyName = "Sai Kirana Stores") {
  const rawPhone = String(record.customerPhone || "").replace(/[^0-9]/g, "");
  if (!rawPhone || rawPhone.length < 7) {
    return {
      success: false,
      error: "Customer has no valid phone number.",
    };
  }

  let cleanPhone = rawPhone;
  if (rawPhone.length === 10) cleanPhone = `91${rawPhone}`;
  else if (rawPhone.length === 11 && rawPhone.startsWith("0")) cleanPhone = `91${rawPhone.slice(1)}`;
  const message = formatReminderMessage(record, companyName);

  try {
    const response = await fetch("/api/whatsapp-business/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientPhone: cleanPhone,
        templateName: "service_reminder_alert",
        requireApprovedTemplate: true,
        message,
        variables: {
          body: [
            record.customerName,
            companyName,
            record.serviceName,
            record.serviceDueDate,
          ],
          "body:1": record.customerName,
          "body:2": companyName,
          "body:3": record.serviceName,
          "body:4": record.serviceDueDate,
        },
        recordId: record.id,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result.success) {
      // Record successful notification in history
      const updated = recordReminderNotification(record.id, "meta_whatsapp", {
        message,
        recipient: cleanPhone,
        status: "DELIVERED",
        messageId: result.messageId,
      });

      return {
        success: true,
        method: "meta_api",
        message,
        recipient: cleanPhone,
        messageId: result.messageId,
        updatedRecord: updated,
      };
    }

    // If Meta API failed (e.g. token expired, unverified recipient, etc.)
    const fallback = buildWhatsAppReminder(record, companyName);
    return {
      success: false,
      error: result.message || "Meta WhatsApp Cloud API could not deliver the message.",
      templateAbsent: result.templateAbsent || false,
      templateRequested: result.templateRequested || false,
      templateStatus: result.templateStatus || null,
      fallbackUrl: fallback.url,
      message,
    };
  } catch (err) {
    const fallback = buildWhatsAppReminder(record, companyName);
    return {
      success: false,
      error: err.message || "Could not reach backend Meta service.",
      fallbackUrl: fallback.url,
      message,
    };
  }
}

/**
 * Sends a request to Meta WhatsApp Graph API to approve the official Service Reminder template.
 */
export async function requestServiceReminderTemplateApproval() {
  try {
    const response = await fetch("/api/whatsapp-business/templates/request-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateType: "service_reminder",
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      return {
        success: true,
        message: result.message,
        template: result.template,
      };
    }
    return {
      success: false,
      error: result.message || "Could not submit template approval request to Meta.",
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Failed to reach template approval service.",
    };
  }
}

// Session and persistent dispatch lock to guarantee no reminder is automatically dispatched twice for the same due date
const sessionDispatchedReminders = new Set();
const DISPATCH_LOCK_KEY = "ledgerly:dispatched_reminders";

function getDispatchedKeys() {
  const keys = new Set(sessionDispatchedReminders);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(DISPATCH_LOCK_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) arr.forEach((k) => keys.add(k));
      }
    }
  } catch {}
  return keys;
}

function persistDispatchedKey(key) {
  sessionDispatchedReminders.add(key);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const keys = getDispatchedKeys();
      keys.add(key);
      window.localStorage.setItem(DISPATCH_LOCK_KEY, JSON.stringify([...keys]));
    }
  } catch {}
}

function removeDispatchedKey(key) {
  sessionDispatchedReminders.delete(key);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const keys = getDispatchedKeys();
      keys.delete(key);
      window.localStorage.setItem(DISPATCH_LOCK_KEY, JSON.stringify([...keys]));
    }
  } catch {}
}

/**
 * Automatically checks and dispatches any service due reminders that have reached their reminder date
 * and have not yet been notified for this specific due date.
 * Guarantees one-time delivery per due date.
 */
export async function autoDispatchDueRemindersViaMeta(companyName = null) {
  if (!companyName) {
    try {
      const p = getCompanyProfile();
      companyName = p?.businessName || p?.companyName || "Sai Kirana Stores";
    } catch {
      companyName = "Sai Kirana Stores";
    }
  }

  const settings = getReminderSettings();
  if (!settings.enabled || settings.autoNotifyWhatsApp === false) {
    return { success: false, reason: "disabled", dispatched: 0 };
  }

  const connection = await checkMetaWhatsAppConnection();
  if (!connection.connected && !connection.readyToSend) {
    return { success: false, reason: "meta_not_connected", dispatched: 0 };
  }

  const processed = processServiceReminders({ settings });
  const dispatchedKeys = getDispatchedKeys();
  const eligible = (processed.activeAlerts || []).filter((r) => {
    if (!r.hasValidPhone || r.alreadyNotifiedForThisDueDate) return false;
    const cleanDueDate = normalizeDateOnly(r.serviceDueDate);
    const sessionKey = `${r.id}_${cleanDueDate}`;
    if (dispatchedKeys.has(sessionKey)) return false;
    return true;
  });

  if (!eligible.length) {
    return { success: true, dispatched: 0, eligible: 0 };
  }

  let dispatched = 0;
  const dispatchedCustomers = [];
  const errors = [];

  for (const record of eligible) {
    const cleanDueDate = normalizeDateOnly(record.serviceDueDate);
    const sessionKey = `${record.id}_${cleanDueDate}`;
    // Lock key immediately to prevent duplicate dispatch during in-flight network requests
    persistDispatchedKey(sessionKey);

    try {
      const res = await sendServiceReminderViaMeta(record, companyName);
      if (res.success) {
        dispatched++;
        dispatchedCustomers.push(record.customerName || record.customerPhone);
      } else {
        // If delivery failed, remove from lock so it can be retried
        removeDispatchedKey(sessionKey);
        errors.push({ customer: record.customerName, error: res.error });
      }
    } catch (err) {
      removeDispatchedKey(sessionKey);
      console.warn("Auto-dispatch reminder failed for", record.customerName, err);
      errors.push({ customer: record.customerName, error: err.message });
    }
  }

  return {
    success: true,
    dispatched,
    dispatchedCustomers,
    errors,
  };
}

