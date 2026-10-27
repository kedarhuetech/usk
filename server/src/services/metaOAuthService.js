// Implements the backend meta o auth service.
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { getMetaOAuthConfig, META_AUTH_SCOPES } from "../config/metaOAuth.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const META_OAUTH_STATE_COOKIE = "vyapar_meta_oauth_state";
const oauthStates = new Map();
const usedStateDigests = new Map();

// This helper handles expired states logic.
function cleanupExpiredStates() {
  const now = Date.now();
  for (const [state, value] of oauthStates.entries()) {
    if (value.expiresAt <= now) oauthStates.delete(state);
  }
  for (const [digest, value] of usedStateDigests.entries()) {
    if (value.expiresAt <= now) usedStateDigests.delete(digest);
  }
}

// This helper handles return to logic.
function safeReturnTo(returnTo = "/business-growth/smart-ads") {
  const value = String(returnTo || "").trim();
  return value.startsWith("/") && !value.startsWith("//") ? value : "/business-growth/smart-ads";
}

// This helper handles digest logic.
function stateDigest(state) {
  return crypto.createHash("sha256").update(String(state || "")).digest("hex");
}

// This helper handles state payload logic.
function signStatePayload(encodedPayload) {
  const config = getMetaOAuthConfig();
  return crypto.createHmac("sha256", config.appSecret).update(encodedPayload).digest("base64url");
}

// Encodes state cookie.
function encodeStateCookie(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signStatePayload(encodedPayload)}`;
}

// Decodes state cookie.
function decodeStateCookie(cookieValue = "") {
  const [encodedPayload, signature] = String(cookieValue || "").split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signStatePayload(encodedPayload);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// This helper handles state used logic.
function markStateUsed(state, expiresAt) {
  usedStateDigests.set(stateDigest(state), { expiresAt: expiresAt || Date.now() + OAUTH_STATE_TTL_MS });
}

// Creates state.
function createState(returnTo = "/business-growth/smart-ads") {
  cleanupExpiredStates();
  const state = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
  const sanitizedReturnTo = safeReturnTo(returnTo);
  oauthStates.set(state, {
    returnTo: sanitizedReturnTo,
    expiresAt,
  });
  return {
    state,
    returnTo: sanitizedReturnTo,
    expiresAt,
    cookieValue: encodeStateCookie({ state, returnTo: sanitizedReturnTo, expiresAt }),
  };
}

// Makes the meta error value consistent.
export function normalizeMetaError(error, fallback = "Meta request failed") {
  const metaMessage = error?.error?.message || error?.message;
  const message = metaMessage || fallback;
  return {
    message,
    code: error?.error?.code || error?.code || "META_ERROR",
    subcode: error?.error?.error_subcode || error?.error_subcode || error?.subcode || "",
    type: error?.error?.type || error?.type || "MetaError",
    userTitle: error?.error?.error_user_title || error?.error_user_title || error?.userTitle || "",
    userMessage: error?.error?.error_user_msg || error?.error_user_msg || error?.userMessage || "",
    fbtraceId: error?.error?.fbtrace_id || error?.fbtrace_id || error?.fbtraceId || "",
    httpStatus: error?.httpStatus || error?.status || "",
  };
}

// Builds meta authorization url.
export function buildMetaAuthorizationUrl(returnTo) {
  return buildMetaAuthorizationRequest(returnTo).authorizationUrl;
}

// Builds meta authorization request.
export function buildMetaAuthorizationRequest(returnTo, { rerequest = false } = {}) {
  const config = getMetaOAuthConfig();
  if (!config.configured) {
    const error = new Error("Meta environment configuration is missing.");
    error.code = "META_CONFIG_MISSING";
    throw error;
  }

  const stateRecord = createState(returnTo);
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state: stateRecord.state,
    response_type: "code",
  });

  if (config.loginConfigId) {
    // Facebook Login for Business uses the saved configuration to determine
    // requested permissions; do not also send the legacy `scope` parameter.
    params.set("config_id", config.loginConfigId);
  } else {
    params.set("scope", META_AUTH_SCOPES.join(","));
  }

  if (rerequest) {
    params.set("auth_type", "rerequest");
  }

  return {
    authorizationUrl: `${config.authBaseUrl}?${params.toString()}`,
    stateCookie: stateRecord.cookieValue,
    maxAgeMs: OAUTH_STATE_TTL_MS,
  };
}

// Validates meta o auth state.
export function validateMetaOAuthState(state, cookieValue = "") {
  cleanupExpiredStates();
  const stateValue = String(state || "");
  const savedState = oauthStates.get(stateValue);
  if (savedState) {
    oauthStates.delete(stateValue);
    markStateUsed(stateValue, savedState.expiresAt);
    return savedState;
  }

  const decodedCookie = decodeStateCookie(cookieValue);
  if (!decodedCookie || decodedCookie.state !== stateValue || decodedCookie.expiresAt <= Date.now()) return null;

  const digest = stateDigest(stateValue);
  if (usedStateDigests.has(digest)) return null;
  markStateUsed(stateValue, decodedCookie.expiresAt);

  return {
    returnTo: safeReturnTo(decodedCookie.returnTo),
    expiresAt: decodedCookie.expiresAt,
  };
}

// Reads meta response.
async function readMetaResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const normalized = normalizeMetaError({ ...payload, httpStatus: response.status }, fallback);
    const error = new Error(normalized.message);
    error.code = normalized.code;
    error.subcode = normalized.subcode;
    error.type = normalized.type;
    error.userTitle = normalized.userTitle;
    error.userMessage = normalized.userMessage;
    error.fbtraceId = normalized.fbtraceId;
    error.httpStatus = normalized.httpStatus;
    throw error;
  }
  return payload;
}

// This helper handles get logic.
export async function graphGet(path, accessToken, params = {}) {
  const config = getMetaOAuthConfig();
  const url = new URL(path.startsWith("http") ? path : `${config.graphBaseUrl}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return readMetaResponse(response, "Meta Graph API request failed");
}

// This helper handles post logic.
export async function graphPost(path, accessToken, params = {}) {
  const config = getMetaOAuthConfig();
  const url = new URL(path.startsWith("http") ? path : `${config.graphBaseUrl}${path}`);
  const body = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  body.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    body,
  });

  return readMetaResponse(response, "Meta Graph API request failed");
}

// Exchanges code for access token.
export async function exchangeCodeForAccessToken(code) {
  const config = getMetaOAuthConfig();
  const url = new URL(`${config.graphBaseUrl}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  return readMetaResponse(response, "Meta authorization code exchange failed");
}

// Exchanges for long lived user token.
export async function exchangeForLongLivedUserToken(accessToken) {
  const config = getMetaOAuthConfig();
  const url = new URL(`${config.graphBaseUrl}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", accessToken);

  const response = await fetch(url);
  return readMetaResponse(response, "Meta long-lived token exchange failed");
}

// Gets meta user.
export async function getMetaUser(accessToken) {
  return graphGet("/me", accessToken, { fields: "id,name" });
}

// Gets meta permissions.
export async function getMetaPermissions(accessToken) {
  const payload = await graphGet("/me/permissions", accessToken);
  return (payload.data || []).map((permission) => ({
    permission: permission.permission,
    status: permission.status,
  }));
}
