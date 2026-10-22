import { Router } from "express";
import { getMetaOAuthConfig } from "../config/metaOAuth.js";
import { fetchMetaAssets } from "../services/metaAssetsService.js";
import {
  getMetaConnection,
  getMetaPublicConnection,
  markMetaReconnectRequired,
  saveMetaSelection,
  updateMetaConnectionSnapshot,
} from "../services/metaConnectionStore.js";
import { getMetaPermissions, getMetaUser, normalizeMetaError } from "../services/metaOAuthService.js";

const router = Router();

function validateSelection(selection = {}, assets = {}) {
  const businesses = new Set((assets.businesses || []).map((item) => item.id));
  const pages = new Set((assets.pages || []).map((item) => item.id));
  const instagramAccounts = new Set((assets.instagramAccounts || []).map((item) => item.id));
  const adAccounts = new Set((assets.adAccounts || []).map((item) => item.id));

  if (selection.businessId && !businesses.has(selection.businessId)) return "Selected Business Portfolio was not found.";
  if (selection.pageId && !pages.has(selection.pageId)) return "Selected Facebook Page was not found.";
  if (selection.instagramAccountId && !instagramAccounts.has(selection.instagramAccountId)) return "Selected Instagram account was not found.";
  if (selection.adAccountId && !adAccounts.has(selection.adAccountId)) return "Selected Ad Account was not found.";
  return "";
}

function pruneSelection(selection = {}, assets = {}, requestedBusinessId = "") {
  const businesses = new Set((assets.businesses || []).map((item) => item.id));
  const pages = new Set((assets.pages || []).map((item) => item.id));
  const instagramAccounts = new Set((assets.instagramAccounts || []).map((item) => item.id));
  const adAccounts = new Set((assets.adAccounts || []).map((item) => item.id));
  const businessId = requestedBusinessId && businesses.has(requestedBusinessId) ? requestedBusinessId : "";

  return {
    businessId,
    pageId: selection.pageId && pages.has(selection.pageId) ? selection.pageId : "",
    instagramAccountId: selection.instagramAccountId && instagramAccounts.has(selection.instagramAccountId) ? selection.instagramAccountId : "",
    adAccountId: selection.adAccountId && adAccounts.has(selection.adAccountId) ? selection.adAccountId : "",
  };
}

router.get("/assets", async (req, res) => {
  const config = getMetaOAuthConfig();
  const connection = getMetaConnection();
  const businessId = String(req.query.businessId || connection.selection.businessId || "");

  if (!config.configured) {
    return res.status(503).json({
      success: false,
      configured: false,
      message: "Meta environment configuration is missing.",
    });
  }

  if (!connection.connected || !connection.token?.accessToken) {
    return res.status(401).json({
      success: false,
      configured: true,
      message: "Meta is not connected.",
      ...getMetaPublicConnection(),
    });
  }

  try {
    const [user, permissions, assets] = await Promise.all([
      getMetaUser(connection.token.accessToken),
      getMetaPermissions(connection.token.accessToken),
      fetchMetaAssets(connection.token.accessToken, { businessId }),
    ]);
    const selection = pruneSelection(connection.selection, assets, businessId);
    updateMetaConnectionSnapshot({ user, permissions, assets, selection });
    return res.json({
      success: true,
      configured: true,
      ...getMetaPublicConnection(),
    });
  } catch (error) {
    const normalized = normalizeMetaError(error, "Unable to fetch Meta assets");
    const status = String(normalized.code) === "190" ? 401 : 502;
    if (status === 401) {
      markMetaReconnectRequired("Meta token expired or was revoked. Reconnect Meta to continue.");
    }
    return res.status(status).json({
      success: false,
      configured: true,
      message: normalized.message,
      ...getMetaPublicConnection(),
    });
  }
});

router.post("/selection", (req, res) => {
  const connection = getMetaConnection();

  if (!connection.connected) {
    return res.status(401).json({
      success: false,
      message: "Meta is not connected.",
      ...getMetaPublicConnection(),
    });
  }

  const selection = {
    businessId: req.body?.businessId || "",
    pageId: req.body?.pageId || "",
    instagramAccountId: req.body?.instagramAccountId || "",
    adAccountId: req.body?.adAccountId || "",
  };
  const validationError = validateSelection(selection, connection.assets);

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
      ...getMetaPublicConnection(),
    });
  }

  const publicConnection = saveMetaSelection(selection);
  return res.json({
    success: true,
    message: "Meta asset selection saved for this server session.",
    ...publicConnection,
  });
});

export default router;
