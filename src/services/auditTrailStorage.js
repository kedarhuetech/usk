// Manages the Audit Trail timeline of actions across the application.
import { getAppSettings } from "./appSettingsStorage.js";
import { auditTrailDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { getScopedStorageKey, getActiveBusinessName } from "../config/businessConfig.js";

export const AUDIT_TRAIL_KEY = "ledgerly:auditTrail.v1";
export const AUDIT_TRAIL_UPDATED_EVENT = "ledgerly:audit-trail-updated";
const getAuditTrailKey = () => getScopedStorageKey(AUDIT_TRAIL_KEY);

const getInitialAuditLogs = () => [
  {
    id: "audit-init-1",
    timestamp: new Date().toISOString(),
    action: "System Initialized",
    entity: "System",
    details: `Workspace initialized for ${getActiveBusinessName()}`,
    user: "System Admin",
  },
];

export function getAuditTrailLogs() {
  const initial = getInitialAuditLogs();
  if (typeof window === "undefined" || !window.localStorage) return initial;
  try {
    const raw = window.localStorage.getItem(getAuditTrailKey());
    if (!raw) {
      window.localStorage.setItem(getAuditTrailKey(), JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : initial;
  } catch {
    return initial;
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
    window.localStorage.setItem(getAuditTrailKey(), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(AUDIT_TRAIL_UPDATED_EVENT, { detail: entry }));

    if (isDatabaseMode()) {
      auditTrailDb.log({
        actionType: action,
        entityType: entity,
        details,
        userName: user,
      }).catch((err) => console.warn("[AuditTrail] Background sync notice:", err.message));
    }
  } catch (error) {
    console.warn("Could not record audit trail entry", error);
  }
}

export function clearAuditTrailLogs() {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(getAuditTrailKey(), JSON.stringify([]));
  window.dispatchEvent(new CustomEvent(AUDIT_TRAIL_UPDATED_EVENT));

  if (isDatabaseMode()) {
    auditTrailDb.clear().catch((err) => console.warn("[AuditTrail] Clear sync notice:", err.message));
  }
}

