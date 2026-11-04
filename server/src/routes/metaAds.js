// Defines backend API routes for meta ads.
import { Router } from "express";
import { getMetaConnection, getMetaPublicConnection } from "../services/metaConnectionStore.js";
import { publishMetaAdCampaign } from "../services/metaAdsService.js";
import { normalizeMetaError } from "../services/metaOAuthService.js";
import { fetchMetaAdsInsights, normalizeMetaInsightsError } from "../services/metaAdsInsightsService.js";
import { fetchMetaAccountEligibility, fetchMetaCampaignInsights, fetchMetaCampaigns, updateMetaCampaignStatus } from "../services/metaAdsManagementService.js";

const router = Router();

function sendMetaManagementError(res, error, fallback) {
  const normalized = normalizeMetaError(error, fallback);
  const code = String(normalized.code);
  const status = code === "META_NOT_CONNECTED" ? 401 : code.includes("PERMISSION") ? 403 : code.startsWith("META_") ? 400 : 502;
  return res.status(status).json({ success: false, message: normalized.message, error: { code: normalized.code, subcode: normalized.subcode, fbtraceId: normalized.fbtraceId } });
}

router.get("/campaigns", async (req, res) => {
  try { return res.json({ success: true, ...(await fetchMetaCampaigns({ connection: getMetaConnection(), after: req.query.after, limit: req.query.limit })) }); }
  catch (error) { return sendMetaManagementError(res, error, "Unable to load Meta campaigns."); }
});

router.get("/account-eligibility", async (_req, res) => {
  try { return res.json({ success: true, ...(await fetchMetaAccountEligibility({ connection: getMetaConnection() })) }); }
  catch (error) { return sendMetaManagementError(res, error, "Unable to verify Meta Ad Account information."); }
});

router.get("/campaigns/:campaignId/insights", async (req, res) => {
  try { return res.json({ success: true, ...(await fetchMetaCampaignInsights({ connection: getMetaConnection(), campaignId: req.params.campaignId, datePreset: req.query.datePreset })) }); }
  catch (error) { return sendMetaManagementError(res, error, "Unable to load Meta campaign insights."); }
});

router.post("/campaigns/:campaignId/status", async (req, res) => {
  try { return res.json({ success: true, ...(await updateMetaCampaignStatus({ connection: getMetaConnection(), campaignId: req.params.campaignId, status: req.body?.status })) }); }
  catch (error) { return sendMetaManagementError(res, error, "Unable to update Meta campaign status."); }
});

router.get("/insights", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const connection = getMetaConnection();
  try {
    const insights = await fetchMetaAdsInsights({ connection, datePreset: req.query.datePreset });
    return res.json({ success: true, ...insights });
  } catch (error) {
    const failure = normalizeMetaInsightsError(error, connection.token?.accessToken);
    return res.status(failure.status).json({ success: false, state: failure.state, message: failure.error.message, error: failure.error });
  }
});

router.post("/publish", async (req, res) => {
  const connection = getMetaConnection();

  if (!connection.connected || !connection.token?.accessToken) {
    return res.status(401).json({
      success: false,
      message: "Meta is not connected. Reconnect before publishing.",
      ...getMetaPublicConnection(),
    });
  }

  try {
    const publish = await publishMetaAdCampaign({
      accessToken: connection.token.accessToken,
      connection,
      campaign: req.body?.campaign || {},
    });

    return res.json({
      success: true,
      message: "Meta campaign published successfully and submitted for ad review.",
      publish,
    });
  } catch (error) {
    const normalized = normalizeMetaError(error, "Meta campaign publishing failed");
    return res.status(String(error.code || "").startsWith("META_") ? 400 : 502).json({
      success: false,
      message: normalized.message,
      error: error.publishResult?.error || normalized,
      publish: error.publishResult || null,
      ...getMetaPublicConnection(),
    });
  }
});

export default router;
