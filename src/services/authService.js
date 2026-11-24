/**
 * Business Authentication Service
 * 
 * Manages JWT tokens, authenticated user sessions, and tenant business context.
 * Dispatches reactive events so Topbar, Sidebar, and Route Guards update immediately.
 */

import { API_BASE_URL } from "./apiClient.js";
import { purgeObsoleteLocalStorage } from "./dataStorageConfig.js";
import { clearMemoryCollections } from "./transactionRepository.js";
import { clearMemoryParties } from "./partiesStorage.js";
import { clearMemoryItems } from "./itemsStorage.js";

export const AUTH_TOKEN_KEY = "usk_auth_token";
export const AUTH_USER_KEY = "usk_auth_user";
export const AUTH_BUSINESS_ID_KEY = "usk_auth_business_id";
export const AUTH_CHANGED_EVENT = "usk:auth-changed";

/**
 * Returns saved JWT token or null
 */
export function getAuthToken() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || null;
}

/**
 * Returns parsed user object or null
 */
export function getAuthUser() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Returns active business ID for the authenticated session
 */
export function getAuthBusinessId() {
  const user = getAuthUser();
  if (user && user.businessId) return user.businessId;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage.getItem(AUTH_BUSINESS_ID_KEY) || null;
  }
  return null;
}

/**
 * Checks whether user is logged in with a valid session
 */
export function isAuthenticated() {
  return Boolean(getAuthToken() && getAuthUser());
}

/**
 * Saves auth session to browser storage
 */
export function setAuthSession({ token, user }) {
  if (typeof window === "undefined" || !window.localStorage) return;
  // Clear any existing in-memory caches and obsolete local keys
  clearMemoryCollections();
  clearMemoryParties();
  clearMemoryItems();
  purgeObsoleteLocalStorage();

  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
  if (user) {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    if (user.businessId) {
      window.localStorage.setItem(AUTH_BUSINESS_ID_KEY, user.businessId);
    }
  }
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { isAuthenticated: true, user } }));
}

/**
 * Clears auth session on logout
 */
export function clearAuthSession() {
  if (typeof window === "undefined" || !window.localStorage) return;
  clearMemoryCollections();
  clearMemoryParties();
  clearMemoryItems();

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
  window.localStorage.removeItem(AUTH_BUSINESS_ID_KEY);

  // Clear local tenant caches so a new business session starts 100% clean
  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith("ledgerly:") || k.startsWith("usk:"))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {}

  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { isAuthenticated: false, user: null } }));
}

/**
 * Helper to call auth endpoints
 */
async function callAuthApi(endpoint, body) {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/api/auth${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Authentication error (${res.status})`);
  }
  return data;
}

/**
 * Sign in existing user with email and password
 */
export async function loginUser({ email, password }) {
  const data = await callAuthApi("/login", { email, password });
  if (data.token && data.user) {
    setAuthSession({ token: data.token, user: data.user });
  }
  return data;
}

/**
 * Send 6-digit verification code to email
 */
export async function sendRegisterOtp({ email }) {
  return await callAuthApi("/register/send-otp", { email });
}

/**
 * Verify OTP entered by user
 */
export async function verifyRegisterOtp({ email, otp }) {
  return await callAuthApi("/register/verify-otp", { email, otp });
}

/**
 * Check if a Business / Tenant ID is unique and available
 */
export async function checkBusinessIdAvailability(businessId) {
  return await callAuthApi("/check-business-id", { businessId });
}

/**
 * Complete business registration
 */
export async function registerBusiness({
  email,
  otp,
  businessId,
  password,
  confirmPassword,
  businessName,
}) {
  const data = await callAuthApi("/register", {
    email,
    otp,
    businessId,
    password,
    confirmPassword,
    businessName,
  });

  if (data.token && data.user) {
    setAuthSession({ token: data.token, user: data.user });
  }
  return data;
}

/**
 * Fetch fresh user info from server
 */
export async function fetchCurrentAuthUser() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      setAuthSession({ token, user: data.user });
      return data.user;
    }
    // If token expired, clear session
    if (res.status === 401) {
      clearAuthSession();
    }
  } catch (err) {
    console.warn("[Auth] Could not refresh user profile:", err.message);
  }
  return getAuthUser();
}

/**
 * Sign out and redirect to /login
 */
export function logoutUser() {
  clearAuthSession();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}
