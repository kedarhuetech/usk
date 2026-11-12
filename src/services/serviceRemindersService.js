// Service Reminders Business Logic & Calculation Engine
// Handles reminder date calculations, lifecycle statuses, duplicate prevention,
// and notification payload construction.

import {
  getReminderSettings,
  getReminderRecords,
  saveReminderRecord,
  saveReminderRecords,
} from "./serviceRemindersStorage.js";

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
 * Calculates the date on which a reminder should trigger:
 * (serviceDueDate - daysBefore calendar days)
 */
export function calculateReminderDate(serviceDueDateStr, daysBefore = 2) {
  if (!serviceDueDateStr) return "";
  const cleanDate = serviceDueDateStr.slice(0, 10);
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
  const dueDate = record.serviceDueDate?.slice(0, 10) || "";
  const daysBefore = Math.max(0, Number(settings?.reminderDaysBefore ?? 2));
  const reminderDate = calculateReminderDate(dueDate, daysBefore);
  const daysUntilDue = getCalendarDayDifference(today, dueDate);

  let status = record.status || "Pending";
  if (status !== "Completed" && status !== "Cancelled") {
    if (daysUntilDue === null) {
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

  const phone = String(record.customerPhone || "").replace(/[^0-9]/g, "");
  const email = String(record.customerEmail || "").trim();
  const hasValidPhone = phone.length >= 7;
  const hasValidEmail = Boolean(email && email.includes("@"));
  const hasContact = hasValidPhone || hasValidEmail;

  // Duplicate Prevention:
  // Eligible if reminders are enabled, service is not completed/cancelled,
  // today has reached or passed reminderDate, and this specific due date hasn't been notified yet.
  const isDateReached = today >= reminderDate;
  const alreadyNotifiedForThisDueDate = record.lastNotifiedDueDate === dueDate;
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

  const dueSoon = evaluated.filter((r) => r.status === "Due Soon");
  const dueToday = evaluated.filter((r) => r.status === "Due Today");
  const overdue = evaluated.filter((r) => r.status === "Overdue");
  const upcoming = evaluated.filter((r) => r.status === "Upcoming");
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

  const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
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
 * Builds the external Email notification mailto URL.
 */
export function buildEmailReminder(record, companyName = "Sai Kirana Stores") {
  const email = String(record.customerEmail || "").trim();
  if (!email || !email.includes("@")) {
    return {
      success: false,
      error: "Customer has no valid email address.",
    };
  }

  const message = formatReminderMessage(record, companyName);
  const subject = encodeURIComponent(`Service Due Date Reminder - ${record.serviceName || "Service"} (${companyName})`);
  const body = encodeURIComponent(message);
  const url = `mailto:${email}?subject=${subject}&body=${body}`;

  return {
    success: true,
    channel: "email",
    url,
    email,
    message,
  };
}

/**
 * Records that a reminder was dispatched to the customer.
 * Sets lastNotifiedAt and lastNotifiedDueDate to prevent duplicate alerts.
 */
export function recordReminderNotification(recordId, channel = "in_app") {
  const records = getReminderRecords();
  const target = records.find((r) => r.id === recordId);
  if (!target) return null;

  const now = new Date().toISOString();
  const historyEntry = {
    channel,
    at: now,
    dueDate: target.serviceDueDate,
  };

  const updated = {
    ...target,
    lastNotifiedAt: now,
    lastNotifiedDueDate: target.serviceDueDate,
    notificationHistory: [...(target.notificationHistory || []), historyEntry],
    updatedAt: now,
  };

  saveReminderRecord(updated);
  return updated;
}
