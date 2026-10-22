import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { getWhatsAppOAuthConfig, WHATSAPP_AUTH_SCOPES } from "../config/whatsappOAuth.js";
import { getMetaOAuthConfig } from "../config/metaOAuth.js";
import { normalizeMetaError } from "./metaOAuthService.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const WHATSAPP_OAUTH_STATE_COOKIE = "vyapar_whatsapp_oauth_state";
const oauthStates = new Map();
const usedStateDigests = new Map();

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [state, value] of oauthStates.entries()) {
    if (value.expiresAt <= now) oauthStates.delete(state);
  }
  for (const [digest, value] of usedStateDigests.entries()) {
    if (value.expiresAt <= now) usedStateDigests.delete(digest);
  }
}

function safeReturnTo(returnTo = "/business-growth/whatsapp-marketing") {
  const value = String(returnTo || "").trim();
  return value.startsWith("/") && !value.startsWith("//") ? value : "/business-growth/whatsapp-marketing";
}

function stateDigest(state) {
  return crypto.createHash("sha256").update(String(state || "")).digest("hex");
}

function signStatePayload(encodedPayload) {
  const config = getWhatsAppOAuthConfig();
  return crypto.createHmac("sha256", config.appSecret).update(encodedPayload).digest("base64url");
}

function encodeStateCookie(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signStatePayload(encodedPayload)}`;
}

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

function markStateUsed(state, expiresAt) {
  usedStateDigests.set(stateDigest(state), { expiresAt: expiresAt || Date.now() + OAUTH_STATE_TTL_MS });
}

function createState(returnTo = "/business-growth/whatsapp-marketing") {
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

export function buildWhatsAppAuthorizationRequest(returnTo) {
  const config = getWhatsAppOAuthConfig();
  if (!config.oauthConfigured) {
    const error = new Error("WhatsApp Business environment configuration is missing.");
    error.code = "WHATSAPP_CONFIG_MISSING";
    throw error;
  }

  const stateRecord = createState(returnTo);
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state: stateRecord.state,
    response_type: "code",
    scope: WHATSAPP_AUTH_SCOPES.join(","),
  });

  if (config.loginConfigId) {
    params.set("config_id", config.loginConfigId);
  }

  return {
    authorizationUrl: `${config.authBaseUrl}?${params.toString()}`,
    stateCookie: stateRecord.cookieValue,
    maxAgeMs: OAUTH_STATE_TTL_MS,
  };
}

export function validateWhatsAppOAuthState(state, cookieValue = "") {
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

export async function exchangeWhatsAppCodeForAccessToken(code) {
  const config = getWhatsAppOAuthConfig();
  const url = new URL(`${config.graphBaseUrl}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  return readMetaResponse(response, "WhatsApp authorization code exchange failed");
}

export async function exchangeWhatsAppEmbeddedSignupCode(code) {
  const config = getWhatsAppOAuthConfig();
  const url = new URL(`${config.graphBaseUrl}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  return readMetaResponse(response, "WhatsApp Embedded Signup code exchange failed");
}

export async function exchangeForLongLivedWhatsAppToken(accessToken) {
  const config = getWhatsAppOAuthConfig();
  const url = new URL(`${config.graphBaseUrl}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", accessToken);

  const response = await fetch(url);
  return readMetaResponse(response, "WhatsApp long-lived token exchange failed");
}

export async function graphJsonPost(path, accessToken, payload = {}) {
  const config = getMetaOAuthConfig();
  const url = new URL(path.startsWith("http") ? path : `${config.graphBaseUrl}${path}`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readMetaResponse(response, "WhatsApp Graph API request failed");
}
