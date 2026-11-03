import { API_BASE_URL } from "./apiClient.js";
import { saveSmartAdsMetricsSnapshot, saveSmartAdsSettings } from "./smartAdsStorage.js";

function rememberSmartAdsSettings(settings) {
  try { saveSmartAdsSettings(settings); }
  catch { /* Browser preference storage must not block Meta's server-side session. */ }
}

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
  const result = await readJsonResponse(response, "Unable to load Meta connection status.");
  if (result.selection) rememberSmartAdsSettings({ selectedAssets: result.selection });
  return result;
}

// Gets meta ads insights.
export async function getMetaAdsInsights({ datePreset = "last_30d", signal } = {}) {
  const url = metaApiUrl("/api/meta/ads/insights");
  url.searchParams.set("datePreset", datePreset);
  const response = await fetch(url.toString(), { signal, cache: "no-store" });
  const result = await readJsonResponse(response, "Unable to load Meta advertising activity.");
  if (result.account?.id) {
    try { saveSmartAdsMetricsSnapshot(`account:${result.account.id}:${datePreset}`, result); }
    catch { /* Keep live Insights usable even if the local snapshot cannot be cached. */ }
  }
  return result;
}

export async function getMetaCampaigns({ after = "", limit = 25, signal } = {}) {
  const url = metaApiUrl("/api/meta/ads/campaigns");
  if (after) url.searchParams.set("after", after);
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url.toString(), { signal, cache: "no-store" });
  return readJsonResponse(response, "Unable to load Meta campaigns.");
}

export async function getMetaAccountEligibility({ signal } = {}) {
  const response = await fetch(metaApiUrl("/api/meta/ads/account-eligibility").toString(), { signal, cache: "no-store" });
  return readJsonResponse(response, "Unable to verify Meta Ad Account information.");
}

export async function setMetaCampaignStatus(campaignId, status) {
  const response = await fetch(`${API_BASE_URL}/api/meta/ads/campaigns/${encodeURIComponent(campaignId)}/status`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  });
  return readJsonResponse(response, "Unable to update Meta campaign status.");
}

export async function getMetaCampaignInsights(campaignId, { datePreset = "last_30d", signal } = {}) {
  const url = metaApiUrl(`/api/meta/ads/campaigns/${encodeURIComponent(campaignId)}/insights`);
  url.searchParams.set("datePreset", datePreset);
  const response = await fetch(url.toString(), { signal, cache: "no-store" });
  const result = await readJsonResponse(response, "Unable to load Meta campaign insights.");
  try { saveSmartAdsMetricsSnapshot(`campaign:${campaignId}:${datePreset}`, result); }
  catch { /* Keep live Insights usable even if the local snapshot cannot be cached. */ }
  return result;
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
  const result = await readJsonResponse(response, "Unable to load Meta assets.");
  if (result.selection) rememberSmartAdsSettings({ selectedAssets: result.selection });
  return result;
}

// Saves meta asset selection.
export async function saveMetaAssetSelection(selection) {
  rememberSmartAdsSettings({ selectedAssets: selection });
  const response = await fetch(`${API_BASE_URL}/api/meta-business/selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
  });
  const result = await readJsonResponse(response, "Unable to save Meta asset selection.");
  if (result.selection) rememberSmartAdsSettings({ selectedAssets: result.selection });
  return result;
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
