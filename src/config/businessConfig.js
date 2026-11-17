/**
 * Business Configuration Seam
 * 
 * Centralized resolution of the active business context across the frontend.
 * Guarantees consistent tenancy scoping for API headers, local cache keys, and persistence.
 */

export const DEFAULT_BUSINESS_ID = "demo-business";

export function getActiveBusinessId() {
  const envId = typeof import.meta !== "undefined" && import.meta.env?.VITE_BUSINESS_ID;
  const rawId = String(envId || DEFAULT_BUSINESS_ID).trim();
  return rawId || DEFAULT_BUSINESS_ID;
}

export const ACTIVE_BUSINESS_ID = getActiveBusinessId();

/**
 * Generates a storage key scoped to the active business context.
 * Prevents cross-business data bleed in browser storage.
 */
export function getScopedStorageKey(baseKey, businessId = getActiveBusinessId()) {
  const cleanId = String(businessId || DEFAULT_BUSINESS_ID).trim();
  return `${baseKey}:${encodeURIComponent(cleanId)}`;
}
