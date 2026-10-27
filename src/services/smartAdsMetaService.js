import { API_BASE_URL } from "./apiClient.js";

// This helper handles api url logic.
function metaApiUrl(path) {
  return new URL(`${API_BASE_URL}${path}`, window.location.origin);
}

// Reads json response.
async function readJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || fallbackMessage);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

// Gets meta connection status.
export async function getMetaConnectionStatus() {
  const response = await fetch(`${API_BASE_URL}/api/auth/meta/status`);
  return readJsonResponse(response, "Unable to load Meta connection status.");
}

// Gets meta ads insights.
export async function getMetaAdsInsights({ datePreset = "last_30d", signal } = {}) {
  const url = metaApiUrl("/api/meta/ads/insights");
  url.searchParams.set("datePreset", datePreset);
  const response = await fetch(url.toString(), { signal, cache: "no-store" });
  return readJsonResponse(response, "Unable to load Meta advertising activity.");
}

// Starts meta connection.
export function startMetaConnection({ rerequest = false } = {}) {
  const query = rerequest ? "?rerequest=true" : "";
  window.location.assign(`${API_BASE_URL}/api/auth/meta${query}`);
}

// Gets meta assets.
export async function getMetaAssets({ businessId } = {}) {
  const url = metaApiUrl("/api/meta-business/assets");
  if (businessId) url.searchParams.set("businessId", businessId);
  const response = await fetch(url.toString());
  return readJsonResponse(response, "Unable to load Meta assets.");
}

// Saves meta asset selection.
export async function saveMetaAssetSelection(selection) {
  const response = await fetch(`${API_BASE_URL}/api/meta-business/selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
  });
  return readJsonResponse(response, "Unable to save Meta asset selection.");
}

// Disconnects meta.
export async function disconnectMeta() {
  const response = await fetch(`${API_BASE_URL}/api/auth/meta/disconnect`, {
    method: "POST",
  });
  return readJsonResponse(response, "Unable to disconnect Meta.");
}

// This helper handles meta campaign logic.
export async function publishMetaCampaign(campaign) {
  const response = await fetch(`${API_BASE_URL}/api/meta/ads/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign }),
  });
  return readJsonResponse(response, "Unable to publish Meta campaign.");
}
