// Defines backend API routes for whatsapp business.
import { Router } from "express";
import { getWhatsAppOAuthConfig } from "../config/whatsappOAuth.js";
import {
  extractTemplateVariables,
  fetchWhatsAppAssets,
  normalizeRecipient,
  normalizeWhatsAppError,
  sendWhatsAppTemplateMessage,
  requestWhatsAppTemplateApproval,
  PREDEFINED_TEMPLATES,
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
import { isWhatsAppTestConnection, refreshWhatsAppTestConnectionAssets, ensureWhatsAppTestConnection } from "../services/whatsappTestModeService.js";
import { graphJsonPost } from "../services/whatsappOAuthService.js";
import {
  approvedTemplatesForConnection,
  bulkDeliveryNotConfiguredResponse,
  prepareCampaignPayload,
  schedulingNotConfiguredResponse,
  validateCampaignPayload,
} from "../services/whatsappCampaignService.js";

const router = Router();

// Validates selection.
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

// This helper handles selection logic.
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

// This helper handles template logic.
function selectedTemplate(connection) {
  return (connection.assets.templates || []).find((template) => template.id === connection.selection.templateId) || null;
}

// This helper handles whats app business state logic.
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

  // Handles result.
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
    const requestedTemplateId = req.body?.templateId || req.body?.templateName || connection.selection?.templateId;
    const template = (requestedTemplateId && (connection.assets?.templates || []).find((t) => t.id === requestedTemplateId || t.name === requestedTemplateId))
      || selectedTemplate(connection)
      || (connection.assets?.templates || []).find((t) => t.status === "APPROVED");

    if (!template || template.status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Select an approved WhatsApp message template before sending a test message.",
        error: { category: "TEMPLATE_NOT_APPROVED" },
        ...publicWhatsAppBusinessState(config),
      });
    }

    const phoneNumberId = req.body?.phoneNumberId || connection.selection?.phoneNumberId || connection.assets?.phoneNumbers?.[0]?.id;
    if (!phoneNumberId) {
      return res.status(400).json({
        success: false,
        message: "Select a WhatsApp business phone number before sending.",
        error: { category: "NO_PHONE_NUMBER" },
        ...publicWhatsAppBusinessState(config),
      });
    }

    // Auto-update selection in memory so next calls remember it
    if (connection.selection) {
      connection.selection.templateId = template.id;
      if (!connection.selection.phoneNumberId) connection.selection.phoneNumberId = phoneNumberId;
      if (!connection.selection.wabaId && connection.assets?.wabas?.[0]?.id) connection.selection.wabaId = connection.assets.wabas[0].id;
    }

    const result = await sendWhatsAppTemplateMessage({
      accessToken: connection.token.accessToken,
      phoneNumberId,
      template,
      recipient,
      variables: req.body?.variables || {},
      imageUrl: req.body?.imageUrl || "",
    });
    saveWhatsAppTestResult(result);
    return res.json({
      success: true,
      message: "Accepted by WhatsApp Meta Cloud API.",
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

/**
 * POST /api/whatsapp-business/templates/request-approval
 * Sends a request to Meta WhatsApp Graph API to create and approve a message template.
 */
router.post("/templates/request-approval", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  let connection = getWhatsAppConnection();

  if ((!connection.connected || !connection.token?.accessToken) && config.testModeConfigured) {
    try {
      connection = await ensureWhatsAppTestConnection();
    } catch {}
  }

  if (!connection.connected || !connection.token?.accessToken) {
    return res.status(401).json({
      success: false,
      message: "Meta WhatsApp is not connected. Please connect your Meta account first.",
    });
  }

  const wabaId = req.body?.wabaId || connection.selection?.wabaId || connection.assets?.wabas?.[0]?.id || config.testMode?.wabaId;
  if (!wabaId) {
    return res.status(400).json({
      success: false,
      message: "No WhatsApp Business Account (WABA) ID is available for template submission.",
    });
  }

  const templateKey = req.body?.templateType || req.body?.templateName || "service_reminder";
  const predefined = PREDEFINED_TEMPLATES[templateKey] || Object.values(PREDEFINED_TEMPLATES).find((t) => t.name === templateKey);
  const templateDef = predefined || {
    name: req.body?.templateName || "business_notification",
    category: req.body?.category || "UTILITY",
    language: req.body?.language || "en",
    components: req.body?.components || [
      {
        type: "BODY",
        text: req.body?.text || "Dear {{1}},\nThis is an automated update from {{2}} regarding {{3}}.\n\nThank you!",
        example: { body_text: [["Customer", "Our Business", "Update"]] },
      },
    ],
  };

  try {
    const result = await requestWhatsAppTemplateApproval({
      accessToken: connection.token.accessToken,
      wabaId,
      template: templateDef,
    });

    return res.json({
      success: true,
      message: result.message,
      template: result,
    });
  } catch (error) {
    const normalized = normalizeWhatsAppError(error, "Failed to request template approval");
    return res.status(normalized.httpStatus || 400).json({
      success: false,
      message: normalized.message,
      error: normalized,
    });
  }
});

/**
 * POST /api/whatsapp-business/templates/request-all
 * Requests Meta approval for all transaction and reminder templates.
 */
router.post("/templates/request-all", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  let connection = getWhatsAppConnection();

  if ((!connection.connected || !connection.token?.accessToken) && config.testModeConfigured) {
    try {
      connection = await ensureWhatsAppTestConnection();
    } catch {}
  }

  if (!connection.connected || !connection.token?.accessToken) {
    return res.status(401).json({
      success: false,
      message: "Meta WhatsApp is not connected. Please connect your Meta account first.",
    });
  }

  const wabaId = req.body?.wabaId || connection.selection?.wabaId || connection.assets?.wabas?.[0]?.id || config.testMode?.wabaId;
  if (!wabaId) {
    return res.status(400).json({
      success: false,
      message: "No WhatsApp Business Account (WABA) ID is available for template submission.",
    });
  }

  const results = [];
  const templatesToRequest = Object.entries(PREDEFINED_TEMPLATES).filter(([key]) => key !== "marketing_promo");

  for (const [key, templateDef] of templatesToRequest) {
    try {
      const result = await requestWhatsAppTemplateApproval({
        accessToken: connection.token.accessToken,
        wabaId,
        template: templateDef,
      });
      results.push({ key, name: templateDef.name, success: true, ...result });
    } catch (err) {
      results.push({ key, name: templateDef.name, success: false, error: err.message });
    }
  }

  // Refresh assets from Meta so local connection snapshot reflects new template requests
  try {
    const assets = await fetchWhatsAppAssets(connection.token.accessToken, { wabaId });
    updateWhatsAppConnectionSnapshot({ assets });
  } catch {}

  const approvedOrSubmitted = results.filter((r) => r.success).length;
  return res.json({
    success: true,
    total: templatesToRequest.length,
    approvedOrSubmitted,
    message: `Requested ${approvedOrSubmitted} template(s) with Meta WhatsApp.`,
    results,
  });
});

/**
 * POST /api/whatsapp-business/send
 * Sends an automated message (reminder, transaction, notification) directly via Meta WhatsApp Cloud API.
 */
router.post("/send", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  let connection = getWhatsAppConnection();

  // If not connected via OAuth session, check if test mode credentials exist in .env
  if ((!connection.connected || !connection.token?.accessToken) && config.testModeConfigured) {
    try {
      connection = await ensureWhatsAppTestConnection();
    } catch (testErr) {
      console.warn("Could not activate WhatsApp test connection:", testErr.message);
    }
  }

  if (!connection.connected || !connection.token?.accessToken) {
    return res.status(401).json({
      success: false,
      message: "Meta WhatsApp is not connected. Please connect your Meta WhatsApp account in Settings / Business Growth.",
      connected: false,
    });
  }

  const { recipientPhone, message, templateName, variables } = req.body || {};
  if (!recipientPhone) {
    return res.status(400).json({
      success: false,
      message: "Recipient phone number is required.",
    });
  }

  if (!message && !templateName) {
    return res.status(400).json({
      success: false,
      message: "Message text or template is required.",
    });
  }

  const cleanDigits = String(recipientPhone).replace(/[^0-9]/g, "");
  const formattedPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  const phoneNumberId = connection.selection?.phoneNumberId || connection.assets?.phoneNumbers?.[0]?.id || config.testMode?.phoneNumberId;

  if (!phoneNumberId) {
    return res.status(400).json({
      success: false,
      message: "No WhatsApp business phone number is selected for sending.",
    });
  }

  try {
    let result = null;

    // 1. If a template is explicitly requested (by name or id)
    if (templateName) {
      const templates = connection.assets?.templates || [];
      const template = templates.find((t) => t.name === templateName || t.id === templateName);

      if (!template) {
        // When the template is absent: automatically send a request to Meta to create and approve it!
        const wabaId = connection.selection?.wabaId || connection.assets?.wabas?.[0]?.id || config.testMode?.wabaId;
        const matchingPredefined = PREDEFINED_TEMPLATES[templateName] || Object.values(PREDEFINED_TEMPLATES).find((t) => t.name === templateName);
        const templateDef = matchingPredefined || {
          name: templateName,
          category: "UTILITY",
          language: "en",
          components: [
            {
              type: "BODY",
              text: String(message || "Dear {{1}},\nThis is an automated reminder from {{2}} regarding {{3}} due on {{4}}.\n\nThank you!"),
              example: { body_text: [["Valued Customer", "Our Store", "Maintenance Service", "2026-11-20"]] },
            },
          ],
        };

        let approvalResult = null;
        if (wabaId && connection.token?.accessToken) {
          try {
            approvalResult = await requestWhatsAppTemplateApproval({
              accessToken: connection.token.accessToken,
              wabaId,
              template: templateDef,
            });
          } catch (apprErr) {
            console.warn("Auto template approval request error:", apprErr.message);
          }
        }

        return res.status(400).json({
          success: false,
          templateAbsent: true,
          templateRequested: Boolean(approvalResult?.success),
          templateStatus: approvalResult?.status || "PENDING",
          error: { category: "TEMPLATE_PENDING_APPROVAL" },
          message: approvalResult?.message || `Template "${templateName}" was absent, so an approval request has been automatically sent to Meta (Status: ${approvalResult?.status || "PENDING"}). Once Meta approves it, messages will be delivered directly.`,
        });
      }

      if (template.status !== "APPROVED") {
        return res.status(400).json({
          success: false,
          error: { category: "TEMPLATE_NOT_APPROVED" },
          message: `Template "${template.name || templateName}" is ${template.status}. Messages cannot be delivered using unapproved templates.`,
        });
      }

      result = await sendWhatsAppTemplateMessage({
        accessToken: connection.token.accessToken,
        phoneNumberId,
        template,
        recipient: formattedPhone,
        variables: variables || {},
      });
    }

    // 2. Direct text message via Meta Graph API
    if (!result) {
      if (req.body?.requireApprovedTemplate) {
        return res.status(400).json({
          success: false,
          error: { category: "TEMPLATE_REQUIRED" },
          message: "Service reminders and notifications strictly require an approved Meta WhatsApp template. Direct text cannot be delivered.",
        });
      }

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: String(message || "").trim(),
        },
      };

      try {
        result = await graphJsonPost(`/${phoneNumberId}/messages`, connection.token.accessToken, payload);
      } catch (directErr) {
        // If Meta 24-hour customer care window prevents direct text, attempt fallback to first approved template if available
        const errMsg = String(directErr.message || "").toLowerCase();
        if (errMsg.includes("template") || errMsg.includes("131047") || errMsg.includes("window")) {
          const approvedTpl = (connection.assets?.templates || []).find((t) => t.status === "APPROVED");
          if (approvedTpl) {
            result = await sendWhatsAppTemplateMessage({
              accessToken: connection.token.accessToken,
              phoneNumberId,
              template: approvedTpl,
              recipient: formattedPhone,
              variables: variables || { body: [message] },
            });
          } else {
            // No approved template is present: automatically submit template to Meta for approval!
            const wabaId = connection.selection?.wabaId || connection.assets?.wabas?.[0]?.id || config.testMode?.wabaId;
            const isTransactionMsg = req.body?.type === "sales" || req.body?.type === "purchase" || req.body?.templateType === "transaction";
            const targetPredefined = isTransactionMsg ? PREDEFINED_TEMPLATES.transaction_invoice : PREDEFINED_TEMPLATES.service_reminder;
            let autoApproval = null;
            if (wabaId && connection.token?.accessToken) {
              try {
                autoApproval = await requestWhatsAppTemplateApproval({
                  accessToken: connection.token.accessToken,
                  wabaId,
                  template: targetPredefined,
                });
              } catch (autoErr) {
                console.warn("Auto template approval request error:", autoErr.message);
              }
            }

            return res.status(400).json({
              success: false,
              templateAbsent: true,
              templateRequested: Boolean(autoApproval?.success),
              templateStatus: autoApproval?.status || "PENDING",
              error: { category: "TEMPLATE_PENDING_APPROVAL" },
              message: autoApproval?.message
                ? `Customer is outside the 24-hr window. The required template was absent, so an approval request for "${targetPredefined.name}" was automatically submitted to Meta (Status: ${autoApproval.status}).`
                : "Cannot send direct message: customer is outside the 24-hour service window, and no approved WhatsApp template is available in your campaign templates.",
            });
          }
        } else {
          throw directErr;
        }
      }
    }

    const messageId = result?.messages?.[0]?.id || `wamid.${Date.now()}`;
    return res.json({
      success: true,
      message: "Message dispatched successfully via Meta WhatsApp.",
      messageId,
      recipient: formattedPhone,
      sentAt: new Date().toISOString(),
      sentMessage: message,
      result,
    });
  } catch (error) {
    const normalized = normalizeWhatsAppError(error, "Failed to send WhatsApp message");
    console.error("Meta WhatsApp Send Error:", normalized);
    return res.status(normalized.httpStatus || 502).json({
      success: false,
      message: normalized.message,
      error: normalized,
    });
  }
});

export default router;
