// Manages the Audit Trail timeline of actions across the application.
import { getAppSettings } from "./appSettingsStorage.js";

export const AUDIT_TRAIL_KEY = "ledgerly:auditTrail.v1";
export const AUDIT_TRAIL_UPDATED_EVENT = "ledgerly:audit-trail-updated";

const initialAuditLogs = [
  {
    id: "audit-init-1",
    timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
    action: "System Initialized",
    entity: "System",
    details: "Workspace initialized for Sai Kirana Stores",
    user: "System Admin",
  },
  {
    id: "audit-init-2",
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    action: "Company Profile Updated",
    entity: "Profile",
    details: "Company details updated: Sai Kirana Stores, Phone: 8369501991",
    user: "Owner",
  },
  {
    id: "audit-init-3",
    timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
    action: "Auto Backup Snapshot",
    entity: "Backup",
    details: "Scheduled auto-backup captured 15 items and 8 invoices",
    user: "Auto Backup Daemon",
  },
];

export function getAuditTrailLogs() {
  if (typeof window === "undefined" || !window.localStorage) return initialAuditLogs;
  try {
    const raw = window.localStorage.getItem(AUDIT_TRAIL_KEY);
    if (!raw) {
      window.localStorage.setItem(AUDIT_TRAIL_KEY, JSON.stringify(initialAuditLogs));
      return initialAuditLogs;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : initialAuditLogs;
  } catch {
    return initialAuditLogs;
  }
}

export function recordAuditTrail({ action, entity = "General", details = "", user = "Current User" }) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const settings = getAppSettings();
  if (!settings.auditTrail) return; // Only log if Audit Trail is enabled in settings

  try {
    const existing = getAuditTrailLogs();
    const entry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      action,
      entity,
      details,
      user,
    };
    const next = [entry, ...existing].slice(0, 200); // keep last 200 logs
    window.localStorage.setItem(AUDIT_TRAIL_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(AUDIT_TRAIL_UPDATED_EVENT, { detail: entry }));
  } catch (error) {
    console.warn("Could not record audit trail entry", error);
  }
}

export function clearAuditTrailLogs() {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(AUDIT_TRAIL_KEY, JSON.stringify([]));
  window.dispatchEvent(new CustomEvent(AUDIT_TRAIL_UPDATED_EVENT));
}

