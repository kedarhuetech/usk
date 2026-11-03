import { graphGet, graphPost } from "./metaOAuthService.js";

function selectedAccount(connection) {
  const id = String(connection.selection?.adAccountId || "");
  const account = (connection.assets?.adAccounts || []).find((item) => item.id === id);
  if (!connection.connected || !connection.token?.accessToken) throw Object.assign(new Error("Connect Meta before managing campaigns."), { code: "META_NOT_CONNECTED" });
  if (!account || !/^(act_)?\d+$/.test(id)) throw Object.assign(new Error("Select a Meta Ad Account first."), { code: "META_AD_ACCOUNT_REQUIRED" });
  const permissions = new Set((connection.permissions || []).filter((item) => item.status === "granted").map((item) => item.permission));
  return { id: id.startsWith("act_") ? id : `act_${id}`, rawId: id.replace(/^act_/, ""), account, permissions };
}

export async function fetchMetaCampaigns({ connection, after = "", limit = 25 }) {
  const selected = selectedAccount(connection);
  if (!selected.permissions.has("ads_read") && !selected.permissions.has("ads_management")) throw Object.assign(new Error("Reconnect Meta and grant ads_read or ads_management to view campaigns."), { code: "META_PERMISSION_REQUIRED" });
  const response = await graphGet(`/${selected.id}/campaigns`, connection.token.accessToken, {
    fields: "id,name,status,effective_status,objective,created_time,daily_budget,lifetime_budget,account_id",
    limit: Math.min(100, Math.max(1, Number(limit) || 25)),
    ...(after ? { after } : {}),
  });
  return { source: "meta", account: selected.account, campaigns: response.data || [], paging: response.paging || {} };
}

export async function fetchMetaAccountEligibility({ connection }) {
  const selected = selectedAccount(connection);
  if (!selected.permissions.has("ads_read") && !selected.permissions.has("ads_management")) throw Object.assign(new Error("Reconnect Meta and grant advertising access to check this account."), { code: "META_PERMISSION_REQUIRED" });
  const account = await graphGet(`/${selected.id}`, connection.token.accessToken, {
    fields: "id,account_id,name,account_status,disable_reason,currency,funding_source_details,expired_funding_source_details",
  });
  const funding = account.funding_source_details;
  const expiredFunding = account.expired_funding_source_details;
  return {
    source: "meta",
    account: { id: account.id || selected.id, name: account.name || selected.account.name, currency: account.currency || selected.account.currency },
    accountStatus: account.account_status ?? null,
    disableReason: account.disable_reason ?? null,
    paymentStatus: funding ? "payment-source-reported" : expiredFunding ? "expired-source-reported" : "unknown",
    paymentSourcePresent: Boolean(funding),
    expiredFundingSourcePresent: Boolean(expiredFunding),
    checkedAt: new Date().toISOString(),
  };
}

export async function updateMetaCampaignStatus({ connection, campaignId, status }) {
  const selected = selectedAccount(connection);
  if (!selected.permissions.has("ads_management")) throw Object.assign(new Error("Reconnect Meta with ads_management permission to change campaign status."), { code: "META_PERMISSION_REQUIRED" });
  if (!/^\d+$/.test(String(campaignId || ""))) throw Object.assign(new Error("A valid Meta campaign ID is required."), { code: "META_CAMPAIGN_ID_REQUIRED" });
  if (!new Set(["ACTIVE", "PAUSED"]).has(status)) throw Object.assign(new Error("Campaign status must be ACTIVE or PAUSED."), { code: "META_CAMPAIGN_STATUS_INVALID" });
  const current = await graphGet(`/${campaignId}`, connection.token.accessToken, { fields: "id,account_id,status" });
  if (String(current.account_id || "").replace(/^act_/, "") !== selected.rawId) throw Object.assign(new Error("This campaign does not belong to the selected Ad Account."), { code: "META_CAMPAIGN_ACCOUNT_MISMATCH" });
  const childIds = async (edge) => {
    const ids = [];
    let page = await graphGet(`/${campaignId}/${edge}`, connection.token.accessToken, { fields: "id" });
    ids.push(...(page.data || []).map((item) => item.id).filter(Boolean));
    while (page.paging?.next) {
      page = await graphGet(page.paging.next, connection.token.accessToken);
      ids.push(...(page.data || []).map((item) => item.id).filter(Boolean));
    }
    return ids;
  };
  const [adSetIds, adIds] = await Promise.all([childIds("adsets"), childIds("ads")]);
  if (status === "ACTIVE" && (!adSetIds.length || !adIds.length)) throw Object.assign(new Error("This campaign has no complete Ad Set and Ad to activate. Create and verify the dependent Meta objects first."), { code: "META_CAMPAIGN_INCOMPLETE" });
  const objectIds = status === "ACTIVE"
    ? [...adIds, ...adSetIds, campaignId]
    : [campaignId, ...adSetIds, ...adIds];
  const updated = [];
  for (const objectId of objectIds) {
    const result = await graphPost(`/${objectId}`, connection.token.accessToken, { status });
    if (!result.success) throw Object.assign(new Error(`Meta did not confirm status ${status} for object ${objectId}.`), { code: "META_STATUS_UPDATE_UNCONFIRMED", updatedIds: updated });
    updated.push(objectId);
  }
  return { success: true, campaignId, status, updatedIds: updated, source: "meta" };
}

export async function fetchMetaCampaignInsights({ connection, campaignId, datePreset = "last_30d" }) {
  const selected = selectedAccount(connection);
  if (!selected.permissions.has("ads_read") && !selected.permissions.has("ads_management")) throw Object.assign(new Error("Reconnect Meta and grant ads_read or ads_management to view performance."), { code: "META_PERMISSION_REQUIRED" });
  if (!/^\d+$/.test(String(campaignId || ""))) throw Object.assign(new Error("A valid Meta campaign ID is required."), { code: "META_CAMPAIGN_ID_REQUIRED" });
  if (!["last_7d", "last_30d", "this_month", "last_90d"].includes(datePreset)) throw Object.assign(new Error("Choose a supported date range."), { code: "META_INSIGHTS_DATE_RANGE" });
  const campaign = await graphGet(`/${campaignId}`, connection.token.accessToken, { fields: "id,account_id" });
  if (String(campaign.account_id || "").replace(/^act_/, "") !== selected.rawId) throw Object.assign(new Error("This campaign does not belong to the selected Ad Account."), { code: "META_CAMPAIGN_ACCOUNT_MISMATCH" });
  const response = await graphGet(`/${campaignId}/insights`, connection.token.accessToken, {
    fields: "impressions,reach,clicks,spend,ctr,cpc,account_currency,date_start,date_stop",
    date_preset: datePreset,
  });
  return { source: "meta", campaignId, datePreset, currency: selected.account.currency || null, rows: response.data || [], fetchedAt: new Date().toISOString() };
}
