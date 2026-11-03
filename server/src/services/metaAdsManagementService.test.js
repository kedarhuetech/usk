import test from "node:test";
import assert from "node:assert/strict";
import { fetchMetaAccountEligibility, fetchMetaCampaignInsights, fetchMetaCampaigns, updateMetaCampaignStatus } from "./metaAdsManagementService.js";

const connection = {
  connected: true,
  token: { accessToken: "server-only-test-token" },
  permissions: [{ permission: "ads_read", status: "granted" }, { permission: "ads_management", status: "granted" }],
  selection: { adAccountId: "act_123" },
  assets: { adAccounts: [{ id: "act_123", name: "Test account", currency: "INR" }] },
};

function graphResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("lists actual Meta account campaigns with a bounded cursor request", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    return graphResponse({ data: [{ id: "9", name: "Real campaign", status: "PAUSED" }], paging: { cursors: { after: "cursor-2" } } });
  };
  try {
    const result = await fetchMetaCampaigns({ connection, after: "cursor-1", limit: 25 });
    assert.equal(result.campaigns[0].id, "9");
    assert.equal(result.source, "meta");
    assert.equal(requestUrl.pathname.endsWith("/act_123/campaigns"), true);
    assert.equal(requestUrl.searchParams.get("after"), "cursor-1");
  } finally { globalThis.fetch = originalFetch; }
});

test("activates dependent Ads and Ad Sets before the parent campaign", async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (options.method === "POST") { writes.push(path.split("/").pop()); return graphResponse({ success: true }); }
    if (path.endsWith("/77")) return graphResponse({ id: "77", account_id: "123", status: "PAUSED" });
    if (path.endsWith("/77/adsets")) return graphResponse({ data: [{ id: "adset-1" }, { id: "adset-2" }] });
    if (path.endsWith("/77/ads")) return graphResponse({ data: [{ id: "ad-1" }] });
    throw new Error(`Unexpected Graph request ${path}`);
  };
  try {
    const result = await updateMetaCampaignStatus({ connection, campaignId: "77", status: "ACTIVE" });
    assert.deepEqual(writes, ["ad-1", "adset-1", "adset-2", "77"]);
    assert.equal(result.success, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("does not claim a missing payment method when Meta returns no funding details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => graphResponse({ id: "act_123", account_status: 1, currency: "INR" });
  try {
    const result = await fetchMetaAccountEligibility({ connection });
    assert.equal(result.paymentStatus, "unknown");
    assert.equal(result.paymentSourcePresent, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("requests actual campaign Insights for a supported range", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    return parsed.pathname.endsWith("/88")
      ? graphResponse({ id: "88", account_id: "123" })
      : graphResponse({ data: [{ impressions: "100", reach: "80", clicks: "4", spend: "10.00", ctr: "4", cpc: "2.50", account_currency: "INR" }] });
  };
  try {
    const result = await fetchMetaCampaignInsights({ connection, campaignId: "88", datePreset: "last_7d" });
    assert.equal(result.rows[0].impressions, "100");
    assert.equal(requests[1].searchParams.get("date_preset"), "last_7d");
  } finally { globalThis.fetch = originalFetch; }
});
