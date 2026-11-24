/**
 * Business Configuration Seam
 * 
 * Centralized resolution of the active business context across the frontend.
 * Guarantees consistent tenancy scoping for API headers, local cache keys, and persistence.
 */

export const DEFAULT_BUSINESS_ID = "demo-business";

export function getActiveBusinessId() {
  if (typeof window !== "undefined" && window.localStorage) {
    const authBiz = window.localStorage.getItem("usk_auth_business_id");
    if (authBiz && authBiz !== "local-development") {
      return authBiz.trim();
    }
    try {
      const userRaw = window.localStorage.getItem("usk_auth_user");
      if (userRaw) {
        const u = JSON.parse(userRaw);
        if (u.businessId && u.businessId !== "local-development") {
          return u.businessId.trim();
        }
      }
    } catch {}
  }

  const envId = typeof import.meta !== "undefined" && import.meta.env?.VITE_BUSINESS_ID;
  const rawId = String(envId || DEFAULT_BUSINESS_ID).trim();
  if (rawId === "local-development") {
    // Explicitly reject local-development to prevent cross-business data leakage
    console.warn("[Tenant Security] 'local-development' is prohibited in this environment. Enforcing 'demo-business'.");
    return DEFAULT_BUSINESS_ID;
  }
  return rawId || DEFAULT_BUSINESS_ID;
}

export function getActiveBusinessName() {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const userRaw = window.localStorage.getItem("usk_auth_user");
      if (userRaw) {
        const u = JSON.parse(userRaw);
        if (u.businessName) return u.businessName.trim();
      }
    } catch {}
  }
  return "My Business";
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
