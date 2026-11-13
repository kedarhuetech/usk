// Service Reminders Storage Repository
// Manages local persistence for service due date reminder settings and service records.
// Designed with a clean storage interface to enable future migration to MySQL backend API
// without modifying UI components or business logic.

import { getAppSettings, saveAppSettings } from "./appSettingsStorage.js";

export const SERVICE_REMINDER_SETTINGS_KEY = "ledgerly:serviceReminderSettings.v1";
export const SERVICE_REMINDER_RECORDS_KEY = "ledgerly:serviceReminderRecords.v1";
export const SERVICE_REMINDERS_CHANGED_EVENT = "ledgerly:service-reminders-changed";

export const DEFAULT_SERVICE_REMINDER_SETTINGS = Object.freeze({
  enabled: true, // User requested: "Enable Service Due Date Reminders: Enabled"
  reminderDaysBefore: 2, // User requested: "Notify customers: 2 days before service due date"
  defaultMessageTemplate:
    "Dear {customerName}, this is a friendly reminder from {companyName} that your service for {serviceName} is due on {serviceDueDate}. Please contact us to schedule your service.",
  autoNotifyWhatsApp: true, // User requested: Due reminders automatically get sent with no clicking required
  autoNotifyEmail: false,
});

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : fallback;
  } catch (err) {
    console.warn("Corrupted service reminder data in storage, using fallback.", err);
    return fallback;
  }
}

function notifyChanges(type = "all") {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent(SERVICE_REMINDERS_CHANGED_EVENT, { detail: { type, at: new Date().toISOString() } })
      );
    } catch {}
  }
}

/**
 * Retrieves the current Service Reminder settings.
 * Safely falls back to default configuration if storage is missing, invalid, or corrupted.
 * Keeps appSettingsStorage in sync.
 */
export function getReminderSettings() {
  const appSettings = getAppSettings();
  const fallback = {
    ...DEFAULT_SERVICE_REMINDER_SETTINGS,
    enabled: appSettings.serviceRemindersEnabled ?? DEFAULT_SERVICE_REMINDER_SETTINGS.enabled,
    reminderDaysBefore: appSettings.reminderDaysBefore ?? DEFAULT_SERVICE_REMINDER_SETTINGS.reminderDaysBefore,
  };

  if (!canUseStorage()) return fallback;

  const raw = window.localStorage.getItem(SERVICE_REMINDER_SETTINGS_KEY);
  if (!raw) return fallback;

  const parsed = safeParse(raw, fallback);
  return {
    ...DEFAULT_SERVICE_REMINDER_SETTINGS,
    ...parsed,
    enabled: Boolean(parsed.enabled ?? appSettings.serviceRemindersEnabled ?? DEFAULT_SERVICE_REMINDER_SETTINGS.enabled),
    autoNotifyWhatsApp: parsed.autoNotifyWhatsApp !== undefined
      ? Boolean(parsed.autoNotifyWhatsApp)
      : DEFAULT_SERVICE_REMINDER_SETTINGS.autoNotifyWhatsApp,
    reminderDaysBefore: Math.max(
      0,
      Number(parsed.reminderDaysBefore ?? appSettings.reminderDaysBefore ?? DEFAULT_SERVICE_REMINDER_SETTINGS.reminderDaysBefore) || 0
    ),
  };
}

/**
 * Saves updated Service Reminder settings to storage.
 * Auto-saves and updates appSettings for global consistency.
 */
export function saveReminderSettings(patch = {}) {
  const current = getReminderSettings();
  const next = {
    ...current,
    ...patch,
  };

  if (patch.enabled !== undefined) {
    next.enabled = Boolean(patch.enabled);
  }
  if (patch.autoNotifyWhatsApp !== undefined) {
    next.autoNotifyWhatsApp = Boolean(patch.autoNotifyWhatsApp);
  }
  if (patch.reminderDaysBefore !== undefined) {
    next.reminderDaysBefore = Math.max(0, Math.min(90, Number(patch.reminderDaysBefore) || 0));
  }

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(SERVICE_REMINDER_SETTINGS_KEY, JSON.stringify(next));
    } catch (err) {
      console.error("Failed to save service reminder settings to LocalStorage:", err);
    }
  }

  // Keep appSettings synchronized
  saveAppSettings({
    serviceRemindersEnabled: next.enabled,
    reminderDaysBefore: next.reminderDaysBefore,
  });

  notifyChanges("settings");
  return next;
}

/**
 * Restores Service Reminder settings to system defaults.
 */
export function resetReminderSettings() {
  const defaults = { ...DEFAULT_SERVICE_REMINDER_SETTINGS };
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(SERVICE_REMINDER_SETTINGS_KEY, JSON.stringify(defaults));
    } catch (err) {
      console.warn("Could not reset reminder settings in storage:", err);
    }
  }

  saveAppSettings({
    serviceRemindersEnabled: defaults.enabled,
    reminderDaysBefore: defaults.reminderDaysBefore,
  });

  notifyChanges("settings");
  return defaults;
}

/**
 * Retrieves all saved service reminder records.
 * Returns an array of records. Handles missing or corrupted storage safely.
 */
export function getReminderRecords() {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(SERVICE_REMINDER_RECORDS_KEY);
  if (!raw) return [];

  const parsed = safeParse(raw, []);
  if (!Array.isArray(parsed)) return [];

  return parsed.map((item) => ({
    id: item.id || `srv-rem-${crypto.randomUUID()}`,
    invoiceId: item.invoiceId || "",
    invoiceNumber: item.invoiceNumber || "",
    customerId: item.customerId || "",
    customerName: item.customerName || item.partyName || "Unnamed Customer",
    customerPhone: item.customerPhone || item.phone || "",
    customerEmail: item.customerEmail || item.email || "",
    serviceName: item.serviceName || item.itemName || "Service Maintenance",
    serviceDate: item.serviceDate || new Date().toISOString().slice(0, 10),
    serviceDueDate: item.serviceDueDate || "",
    status: item.status || "Pending", // "Pending", "Due Soon", "Due Today", "Overdue", "Completed", "Cancelled"
    notes: item.notes || "",
    lastNotifiedAt: item.lastNotifiedAt || null,
    lastNotifiedDueDate: item.lastNotifiedDueDate || null,
    lastNotifiedChannel: item.lastNotifiedChannel || null,
    lastNotifiedMessage: item.lastNotifiedMessage || "",
    notificationHistory: Array.isArray(item.notificationHistory) ? item.notificationHistory : [],
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));
}

/**
 * Saves the full list of service reminder records to storage.
 */
export function saveReminderRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error("Reminder records must be an array.");
  }

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(SERVICE_REMINDER_RECORDS_KEY, JSON.stringify(records));
    } catch (err) {
      console.error("Failed to save reminder records to LocalStorage:", err);
    }
  }

  notifyChanges("records");
  return records;
}

/**
 * Inserts or updates a single service reminder record.
 */
export function saveReminderRecord(record = {}) {
  const current = getReminderRecords();
  const id = record.id || `srv-rem-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const normalized = {
    id,
    invoiceId: record.invoiceId || "",
    invoiceNumber: record.invoiceNumber || "",
    customerId: record.customerId || "",
    customerName: record.customerName || record.partyName || "Unnamed Customer",
    customerPhone: record.customerPhone || record.phone || "",
    customerEmail: itemEmail(record),
    serviceName: record.serviceName || record.itemName || "Service Maintenance",
    serviceDate: record.serviceDate || now.slice(0, 10),
    serviceDueDate: record.serviceDueDate || "",
    status: record.status || "Pending",
    notes: record.notes || "",
    lastNotifiedAt: record.lastNotifiedAt || null,
    lastNotifiedDueDate: record.lastNotifiedDueDate || null,
    lastNotifiedChannel: record.lastNotifiedChannel || null,
    lastNotifiedMessage: record.lastNotifiedMessage || "",
    notificationHistory: Array.isArray(record.notificationHistory) ? record.notificationHistory : [],
    createdAt: record.createdAt || now,
    updatedAt: now,
  };

  const exists = current.some((r) => r.id === id);
  const next = exists
    ? current.map((r) => (r.id === id ? { ...r, ...normalized } : r))
    : [normalized, ...current];

  saveReminderRecords(next);
  return normalized;
}

function itemEmail(r) {
  return r.customerEmail || r.email || "";
}

/**
 * Deletes a service reminder record by id.
 */
export function deleteReminderRecord(id) {
  const current = getReminderRecords();
  const next = current.filter((r) => r.id !== id);
  saveReminderRecords(next);
  return next;
}
