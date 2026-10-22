import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import metaAdsRouter from "../routes/metaAds.js";
import { disconnectMetaConnection, setMetaConnection } from "./metaConnectionStore.js";
import { getMetaOAuthConfig } from "../config/metaOAuth.js";

// Graph responses below are fixtures only; no real Meta request or publishing occurs.
const nativeFetch = globalThis.fetch;
let server;
let baseUrl;
let graphResponse;
let graphStatus;
let graphRequests;
const testToken = "insights-test-token-never-real";
const account = { id: "act_123", name: "Test account", currency: "USD" };
const row = { account_id: "123", account_name: "Test account", account_currency: "USD", date_start: "2026-08-01", date_stop: "2026-08-30", reach: "80", impressions: "100", clicks: "7", spend: "12.34" };

function connect(patch = {}) {
  setMetaConnection({
    token: { accessToken: testToken },
    permissions: [{ permission: "ads_read", status: "granted" }],
    assets: { adAccounts: [account] },
    selection: { adAccountId: account.id },
    ...patch,
  });
}

async function request(query = "") {
  const response = await nativeFetch(`${baseUrl}/api/meta/ads/insights${query}`);
  const data = await response.json();
  assert.ok(!JSON.stringify(data).includes(testToken));
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { status: response.status, data };
}

before(async () => {
  const app = express();
  app.use("/api/meta/ads", metaAdsRouter);
  server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, "graph.facebook.com");
    graphRequests.push({ url: new URL(url), options });
    return new Response(JSON.stringify(graphResponse), { status: graphStatus, headers: { "Content-Type": "application/json" } });
  };
});

beforeEach(() => {
  disconnectMetaConnection();
  graphRequests = [];
  graphStatus = 200;
  graphResponse = { data: [row] };
});

after(async () => {
  globalThis.fetch = nativeFetch;
  disconnectMetaConnection();
  await new Promise((resolve) => server.close(resolve));
});

test("disconnected requests never call Meta", async () => {
  const result = await request();
  assert.equal(result.status, 401);
  assert.equal(result.data.state, "NOT_CONNECTED");
  assert.equal(graphRequests.length, 0);
});

test("account must be the backend selection and belong to discovered assets", async () => {
  connect({ selection: { adAccountId: "act_999" } });
  const result = await request("?adAccountId=act_123");
  assert.equal(result.data.state, "NO_AD_ACCOUNT");
  assert.equal(graphRequests.length, 0);
});

test("read access and bounded date range are required", async () => {
  connect({ permissions: [] });
  assert.equal((await request()).data.state, "PERMISSION_REQUIRED");
  connect();
  assert.equal((await request("?datePreset=maximum")).status, 400);
  assert.equal(graphRequests.length, 0);
});

test("account aggregate preserves reach, currency, decimal spend and non-overlapping leads", async () => {
  connect();
  graphResponse.data = [{ ...row, actions: [{ action_type: "lead", value: "3" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "3" }, { action_type: "link_click", value: "7" }] }];
  const { status, data } = await request("?datePreset=last_7d");
  assert.equal(status, 200);
  assert.equal(data.state, "DATA");
  assert.deepEqual(data.metrics, { reach: 80, impressions: 100, clicks: 7, spend: 12.34, leads: 3 });
  assert.equal(data.account.currency, "USD");
  assert.equal(data.dateStart, row.date_start);
  const { url, options } = graphRequests[0];
  assert.equal(url.pathname, `/${getMetaOAuthConfig().graphApiVersion}/act_123/insights`);
  assert.equal(url.searchParams.get("date_preset"), "last_7d");
  assert.equal(url.searchParams.get("level"), "account");
  assert.equal(url.searchParams.get("time_increment"), "all_days");
  assert.equal(options.headers.Authorization, `Bearer ${testToken}`);
  assert.equal(url.searchParams.has("access_token"), false);
  assert.equal(graphRequests.length, 1);
});

test("missing aggregate lead stays unavailable instead of counting arbitrary actions", async () => {
  connect({ permissions: [{ permission: "ads_management", status: "granted" }] });
  graphResponse.data = [{ ...row, actions: [{ action_type: "link_click", value: "7" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "2" }] }];
  assert.equal((await request()).data.metrics.leads, null);
});

test("valid empty and zero responses mean no activity", async () => {
  connect();
  graphResponse = { data: [] };
  const { data } = await request();
  assert.equal(data.state, "NO_ACTIVITY");
  assert.deepEqual(data.metrics, { reach: 0, impressions: 0, clicks: 0, spend: 0, leads: null });
  graphResponse = { data: [{ ...row, reach: "0", impressions: "0", clicks: "0", spend: "0" }] };
  assert.equal((await request()).data.state, "NO_ACTIVITY");
});

test("malformed or unexpectedly paged responses are errors, never zero activity", async () => {
  connect();
  for (const response of [{}, { data: [null] }, { data: [{}] }, { data: [row, row] }, { data: [row], paging: { next: "next-page" } }]) {
    graphResponse = response;
    const { status, data } = await request();
    assert.equal(status, 502);
    assert.equal(data.state, "API_ERROR");
    assert.equal(data.metrics, undefined);
  }
});

test("numeric Meta token, permission and API failures retain safe structured details", async () => {
  connect();
  for (const [code, state, httpStatus] of [[190, "AUTH_ERROR", 401], [200, "PERMISSION_REQUIRED", 403], [100, "API_ERROR", 502], [4, "API_ERROR", 502]]) {
    graphStatus = 400;
    graphResponse = { error: { code, error_subcode: 123, message: `Rejected ${testToken} https://graph.facebook.com/path?access_token=secret`, fbtrace_id: "trace-test" } };
    const { status, data } = await request();
    assert.equal(status, httpStatus);
    assert.equal(data.state, state);
    assert.equal(data.error.code, code);
    assert.equal(data.error.subcode, 123);
    assert.equal(data.error.fbtraceId, "trace-test");
    assert.ok(!data.message.includes("access_token=secret"));
    assert.equal(data.metrics, undefined);
  }
});
