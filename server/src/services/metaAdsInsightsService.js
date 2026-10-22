import { graphGet, normalizeMetaError } from "./metaOAuthService.js";

const INSIGHT_FIELDS = "account_id,account_name,account_currency,date_start,date_stop,reach,impressions,clicks,spend,actions";

function insightError(message, code, state, status) {
  return Object.assign(new Error(message), { code, state, status });
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function fetchMetaAdsInsights({ connection, datePreset = "last_30d" }) {
  if (!connection.connected || !connection.token?.accessToken) {
    throw insightError("Connect Meta to view advertising activity.", "META_NOT_CONNECTED", "NOT_CONNECTED", 401);
  }
  if (!["last_7d", "last_30d"].includes(datePreset)) {
    throw insightError("Choose the last 7 or 30 days.", "META_INSIGHTS_DATE_RANGE", "INVALID_REQUEST", 400);
  }

  const account = (connection.assets?.adAccounts || []).find((item) => item.id === connection.selection?.adAccountId);
  if (!account || !/^(act_)?\d+$/.test(account.id)) {
    throw insightError("Select an Ad Account in Meta connection settings.", "META_AD_ACCOUNT_SELECTION_REQUIRED", "NO_AD_ACCOUNT", 400);
  }
  const granted = new Set((connection.permissions || []).filter((item) => item.status === "granted").map((item) => item.permission));
  if (!granted.has("ads_read") && !granted.has("ads_management")) {
    throw insightError("Reconnect Meta and grant advertising read access.", "META_INSIGHTS_PERMISSION_REQUIRED", "PERMISSION_REQUIRED", 403);
  }

  // Request one aggregate for the entire account/range; summing daily reach double-counts people.
  const accountPath = account.id.startsWith("act_") ? account.id : `act_${account.id}`;
  const payload = await graphGet(`/${accountPath}/insights`, connection.token.accessToken, {
    fields: INSIGHT_FIELDS,
    level: "account",
    date_preset: datePreset,
    time_increment: "all_days",
  });
  if (!Array.isArray(payload.data) || payload.data.length > 1 || payload.paging?.next) {
    throw insightError("Meta returned an unexpected Insights response. Please retry.", "META_INSIGHTS_RESPONSE", "API_ERROR", 502);
  }
  const row = payload.data[0];
  if (payload.data.length && (!row || typeof row !== "object" || Array.isArray(row) || ["reach", "impressions", "clicks", "spend"].some((key) => numberOrNull(row[key]) === null))) {
    throw insightError("Meta returned incomplete Insights metrics. Please retry.", "META_INSIGHTS_RESPONSE", "API_ERROR", 502);
  }
  const actions = (Array.isArray(row?.actions) ? row.actions : [])
    .filter((action) => typeof action?.action_type === "string" && numberOrNull(action.value) !== null)
    .map((action) => ({ actionType: action.action_type, value: numberOrNull(action.value) }));
  // Use Meta's aggregate lead action only. Its subtypes can overlap and must not be summed.
  const leads = actions.find((action) => action.actionType === "lead")?.value ?? null;
  const metrics = {
    reach: row ? numberOrNull(row.reach) : 0,
    impressions: row ? numberOrNull(row.impressions) : 0,
    clicks: row ? numberOrNull(row.clicks) : 0,
    spend: row ? numberOrNull(row.spend) : 0,
    leads,
  };
  const hasActivity = Object.values(metrics).some((value) => value > 0) || actions.some((action) => action.value > 0);
  return {
    state: hasActivity ? "DATA" : "NO_ACTIVITY",
    account: { id: account.id, name: row?.account_name || account.name, currency: row?.account_currency || account.currency || null },
    datePreset,
    dateStart: row?.date_start || null,
    dateStop: row?.date_stop || null,
    metrics,
    actions,
    fetchedAt: new Date().toISOString(),
  };
}

export function normalizeMetaInsightsError(error, accessToken = "") {
  const normalized = normalizeMetaError(error, "Unable to fetch Meta advertising activity.");
  const code = String(normalized.code);
  const authError = ["190", "102"].includes(code);
  const permissionError = ["10", "200", "294", "299"].includes(code);
  const state = authError ? "AUTH_ERROR" : permissionError ? "PERMISSION_REQUIRED" : error.state || "API_ERROR";
  const status = authError ? 401 : permissionError ? 403 : error.state ? error.status : 502;
  let message = normalized.message;
  if (accessToken) message = message.split(accessToken).join("[redacted]");
  message = message.replace(/https?:\/\/\S+/gi, "[Meta URL]").replace(/(access_token|client_secret|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]");
  return {
    status,
    state,
    error: { message, code: normalized.code, subcode: normalized.subcode, fbtraceId: normalized.fbtraceId },
  };
}
