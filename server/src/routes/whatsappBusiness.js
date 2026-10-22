import { Router } from "express";
import { getWhatsAppOAuthConfig } from "../config/whatsappOAuth.js";
import {
  extractTemplateVariables,
  fetchWhatsAppAssets,
  normalizeRecipient,
  normalizeWhatsAppError,
  sendWhatsAppTemplateMessage,
} from "../services/whatsappBusinessService.js";
import {
  buildWhatsAppReadiness,
  getWhatsAppConnection,
  getWhatsAppPublicConnection,
  markWhatsAppReconnectRequired,
  saveWhatsAppSelection,
  saveWhatsAppTestResult,
  updateWhatsAppConnectionSnapshot,
} from "../services/whatsappConnectionStore.js";
import { getMetaPermissions, getMetaUser } from "../services/metaOAuthService.js";
import { isWhatsAppTestConnection, refreshWhatsAppTestConnectionAssets } from "../services/whatsappTestModeService.js";
import {
  approvedTemplatesForConnection,
  bulkDeliveryNotConfiguredResponse,
  prepareCampaignPayload,
  schedulingNotConfiguredResponse,
  validateCampaignPayload,
} from "../services/whatsappCampaignService.js";

const router = Router();

function validateSelection(selection = {}, assets = {}) {
  const businesses = new Set((assets.businesses || []).map((item) => item.id));
  const wabas = new Set((assets.wabas || []).map((item) => item.id));
  const phoneNumbers = new Set((assets.phoneNumbers || []).map((item) => item.id));
  const templates = new Set((assets.templates || []).map((item) => item.id));

  if (selection.businessId && !businesses.has(selection.businessId)) return "Selected Business Portfolio was not found.";
  if (selection.wabaId && !wabas.has(selection.wabaId)) return "Selected WhatsApp Business Account was not found.";
  if (selection.phoneNumberId && !phoneNumbers.has(selection.phoneNumberId)) return "Selected WhatsApp phone number was not found for this WABA.";
  if (selection.templateId && !templates.has(selection.templateId)) return "Selected WhatsApp message template was not found for this WABA.";
  return "";
}

function pruneSelection(selection = {}, assets = {}, requestedBusinessId = "", requestedWabaId = "") {
  const businesses = new Set((assets.businesses || []).map((item) => item.id));
  const wabas = new Set((assets.wabas || []).map((item) => item.id));
  const phoneNumbers = new Set((assets.phoneNumbers || []).map((item) => item.id));
  const templates = new Set((assets.templates || []).map((item) => item.id));
  const businessId =
    requestedBusinessId && businesses.has(requestedBusinessId) ? requestedBusinessId : selection.businessId && businesses.has(selection.businessId) ? selection.businessId : assets.selectedBusinessId || "";
  const wabaId = requestedWabaId && wabas.has(requestedWabaId) ? requestedWabaId : selection.wabaId && wabas.has(selection.wabaId) ? selection.wabaId : assets.selectedWabaId || "";

  return {
    businessId,
    wabaId,
    phoneNumberId: selection.phoneNumberId && phoneNumbers.has(selection.phoneNumberId) ? selection.phoneNumberId : assets.selectedPhoneNumberId || "",
    templateId: selection.templateId && templates.has(selection.templateId) ? selection.templateId : "",
  };
}

function selectedTemplate(connection) {
  return (connection.assets.templates || []).find((template) => template.id === connection.selection.templateId) || null;
}

function publicWhatsAppBusinessState(config = getWhatsAppOAuthConfig()) {
  return {
    ...getWhatsAppPublicConnection(),
    configured: config.configured,
    oauthConfigured: config.oauthConfigured,
    embeddedSignupConfigured: config.embeddedSignupConfigured,
    embeddedSignup: config.embeddedSignup,
    testModeConfigured: config.testModeConfigured,
    graphApiVersion: config.graphApiVersion,
  };
}

router.get("/connection", (_req, res) => {
  const config = getWhatsAppOAuthConfig();
  return res.json({
    success: true,
    ...publicWhatsAppBusinessState(config),
  });
});

router.get("/assets", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  let connection = getWhatsAppConnection();

  if (!config.configured) {
    return res.status(503).json({
      success: false,
      configured: false,
      message: "WhatsApp Business environment configuration is missing.",
    });
  }

  try {
    if (!connection.connected || !connection.token?.accessToken) {
      return res.status(401).json({
        success: false,
        message: "WhatsApp Business is not connected.",
        ...publicWhatsAppBusinessState(config),
      });
    }

    if (isWhatsAppTestConnection(connection)) {
      updateWhatsAppConnectionSnapshot(await refreshWhatsAppTestConnectionAssets(connection));
      return res.json({
        success: true,
        ...publicWhatsAppBusinessState(config),
      });
    }

    const businessId = String(req.query.businessId || connection.selection.businessId || "");
    const wabaId = String(req.query.wabaId || connection.selection.wabaId || "");
    const [user, permissions, assets] = await Promise.all([
      getMetaUser(connection.token.accessToken),
      getMetaPermissions(connection.token.accessToken),
      fetchWhatsAppAssets(connection.token.accessToken, { businessId, wabaId }),
    ]);
    updateWhatsAppConnectionSnapshot({ user, permissions, assets, selection: pruneSelection(connection.selection, assets, businessId, wabaId) });
    return res.json({
      success: true,
      ...publicWhatsAppBusinessState(config),
    });
  } catch (error) {
    const normalized = normalizeWhatsAppError(error, "Unable to fetch WhatsApp Business assets");
    const status = normalized.category === "TOKEN_EXPIRED" ? 401 : 502;
    if (status === 401) markWhatsAppReconnectRequired("WhatsApp token expired or was revoked. Reconnect WhatsApp Business to continue.");
    return res.status(status).json({
      success: false,
      message: normalized.message,
      error: normalized,
      ...publicWhatsAppBusinessState(config),
    });
  }
});

router.get("/templates", (_req, res) => {
  const config = getWhatsAppOAuthConfig();
  const connection = getWhatsAppConnection();

  if (!connection.connected) {
    return res.status(401).json({
      success: false,
      message: "WhatsApp Business is not connected.",
      ...publicWhatsAppBusinessState(config),
    });
  }

  return res.json({
    success: true,
    templates: approvedTemplatesForConnection(connection),
  });
});

router.get("/customers", (_req, res) =>
  res.status(501).json({
    success: false,
    error: {
      category: "CUSTOMER_PERSISTENCE_NOT_CONFIGURED",
      message: "Ledgerly customer/contact persistence is not connected yet.",
    },
    customers: [],
  }),
);

router.post("/campaigns/validate", (req, res) => {
  const connection = getWhatsAppConnection();
  const validation = validateCampaignPayload({ connection, payload: req.body || {} });
  return res.status(validation.valid ? 200 : 400).json({
    success: validation.valid,
    validation,
    ...getWhatsAppPublicConnection(),
  });
});

router.post("/campaigns/prepare", (req, res) => {
  const connection = getWhatsAppConnection();
  const prepared = prepareCampaignPayload({ connection, payload: req.body || {} });
  return res.status(prepared.validation.valid ? 200 : 400).json({
    success: prepared.validation.valid,
    ...prepared,
    ...getWhatsAppPublicConnection(),
  });
});

router.post("/campaigns/send", (_req, res) => res.status(501).json(bulkDeliveryNotConfiguredResponse()));

router.post("/campaigns/schedule", (_req, res) => res.status(501).json(schedulingNotConfiguredResponse()));

router.post("/selection", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  let connection = getWhatsAppConnection();

  if (!connection.connected) {
    return res.status(401).json({
      success: false,
      message: "WhatsApp Business is not connected.",
      ...publicWhatsAppBusinessState(config),
    });
  }

  if (isWhatsAppTestConnection(connection)) {
    try {
      updateWhatsAppConnectionSnapshot(await refreshWhatsAppTestConnectionAssets(connection));
      connection = getWhatsAppConnection();
    } catch (error) {
      const normalized = normalizeWhatsAppError(error, "Unable to refresh WhatsApp test setup");
      return res.status(normalized.category === "TOKEN_EXPIRED" ? 401 : 502).json({
        success: false,
        message: normalized.message,
        error: normalized,
        ...publicWhatsAppBusinessState(config),
      });
    }
  }

  const selection = {
    businessId: req.body?.businessId || "",
    wabaId: req.body?.wabaId || "",
    phoneNumberId: req.body?.phoneNumberId || "",
    templateId: req.body?.templateId || "",
  };
  const validationError = validateSelection(selection, connection.assets);

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
      ...publicWhatsAppBusinessState(config),
    });
  }

  const publicConnection = saveWhatsAppSelection(selection);
  return res.json({
    success: true,
    message: "WhatsApp Business asset selection saved for this server session.",
    ...publicConnection,
    ...publicWhatsAppBusinessState(config),
  });
});

router.get("/templates/:templateId/variables", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  let connection = getWhatsAppConnection();

  const template = (connection.assets.templates || []).find((item) => item.id === req.params.templateId);

  if (!template) {
    return res.status(404).json({
      success: false,
      message: "Selected WhatsApp message template was not found.",
      ...publicWhatsAppBusinessState(config),
    });
  }

  return res.json({
    success: true,
    templateId: template.id,
    variables: extractTemplateVariables(template),
  });
});

router.post("/send-test", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  let connection = getWhatsAppConnection();

  if (!connection.connected || !connection.token?.accessToken) {
    return res.status(401).json({
      success: false,
      message: "WhatsApp Business is not connected.",
      ...publicWhatsAppBusinessState(config),
    });
  }

  if (isWhatsAppTestConnection(connection)) {
    try {
      updateWhatsAppConnectionSnapshot(await refreshWhatsAppTestConnectionAssets(connection));
      connection = getWhatsAppConnection();
    } catch (error) {
      const normalized = normalizeWhatsAppError(error, "Unable to refresh WhatsApp test setup");
      return res.status(normalized.category === "TOKEN_EXPIRED" ? 401 : 502).json({
        success: false,
        message: normalized.message,
        error: normalized,
        ...publicWhatsAppBusinessState(config),
      });
    }
  }

  const readiness = buildWhatsAppReadiness(connection);
  if (!readiness.readyToSend) {
    return res.status(400).json({
      success: false,
      message: readiness.blockingReason || "Complete WhatsApp Business setup before sending.",
      error: { category: readiness.blockingCode || "WHATSAPP_NOT_CONNECTED" },
      ...publicWhatsAppBusinessState(config),
    });
  }

  if (!req.body?.optInConfirmed) {
    return res.status(400).json({
      success: false,
      message: "Confirm that this recipient has opted in or is authorized for testing.",
      error: { category: "INVALID_RECIPIENT" },
      ...publicWhatsAppBusinessState(config),
    });
  }

  try {
    const recipient = normalizeRecipient(req.body?.countryCode, req.body?.phoneNumber);
    const template = selectedTemplate(connection);
    if (!template || template.status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Select an approved WhatsApp message template before sending a test message.",
        error: { category: "TEMPLATE_NOT_APPROVED" },
        ...publicWhatsAppBusinessState(config),
      });
    }
    const result = await sendWhatsAppTemplateMessage({
      accessToken: connection.token.accessToken,
      phoneNumberId: connection.selection.phoneNumberId,
      template,
      recipient,
      variables: req.body?.variables || {},
    });
    saveWhatsAppTestResult(result);
    return res.json({
      success: true,
      message: "Accepted by WhatsApp.",
      result,
      ...publicWhatsAppBusinessState(config),
    });
  } catch (error) {
    const normalized = normalizeWhatsAppError(error, "WhatsApp test message failed");
    const status = normalized.category === "TOKEN_EXPIRED" ? 401 : normalized.category === "RATE_LIMITED" ? 429 : normalized.category === "INVALID_RECIPIENT" || normalized.category === "TEMPLATE_NOT_APPROVED" ? 400 : 502;
    return res.status(status).json({
      success: false,
      message: normalized.message,
      error: normalized,
      ...publicWhatsAppBusinessState(config),
    });
  }
});

export default router;
