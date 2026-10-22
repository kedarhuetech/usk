import { getWhatsAppOAuthConfig } from "../config/whatsappOAuth.js";
import { fetchWhatsAppTestAssets } from "./whatsappBusinessService.js";
import { getRequiredWhatsAppPermissions, getWhatsAppConnection, setWhatsAppConnection } from "./whatsappConnectionStore.js";

function grantedWhatsAppTestPermissions() {
  return getRequiredWhatsAppPermissions().map((permission) => ({ permission, status: "granted" }));
}

export function isWhatsAppTestConnection(connection = getWhatsAppConnection()) {
  return connection.source === "test_env" && connection.token?.testMode;
}

export async function ensureWhatsAppTestConnection({ forceRefresh = false } = {}) {
  const config = getWhatsAppOAuthConfig();
  const connection = getWhatsAppConnection();

  if (!forceRefresh && isWhatsAppTestConnection(connection) && connection.connected && connection.token?.accessToken) {
    return connection;
  }

  if (!config.testModeConfigured) {
    const error = new Error("WhatsApp test access token, WABA ID, and phone number ID are required.");
    error.code = "WHATSAPP_TEST_CONFIG_MISSING";
    error.stage = "CONFIG";
    throw error;
  }

  const assets = await fetchWhatsAppTestAssets(config.testMode.accessToken, {
    businessId: config.testMode.businessId,
    businessName: config.testMode.businessName,
    wabaId: config.testMode.wabaId,
    phoneNumberId: config.testMode.phoneNumberId,
  });
  const existingTemplateId = connection.selection?.templateId || "";
  const selectedTemplate = assets.templates.find((template) => template.id === existingTemplateId && template.status === "APPROVED");
  const firstApprovedTemplate = assets.templates.find((template) => template.status === "APPROVED");

  setWhatsAppConnection({
    source: "test_env",
    user: {
      id: "whatsapp-test-env",
      name: "Meta WhatsApp test setup",
    },
    permissions: grantedWhatsAppTestPermissions(),
    assets,
    selection: {
      businessId: assets.selectedBusinessId || "",
      wabaId: config.testMode.wabaId,
      phoneNumberId: config.testMode.phoneNumberId,
      templateId: selectedTemplate?.id || firstApprovedTemplate?.id || "",
    },
    token: {
      accessToken: config.testMode.accessToken,
      tokenType: "bearer",
      expiresIn: null,
      longLived: false,
      testMode: true,
      obtainedAt: new Date().toISOString(),
    },
  });

  return getWhatsAppConnection();
}

export async function refreshWhatsAppTestConnectionAssets(connection = getWhatsAppConnection()) {
  const config = getWhatsAppOAuthConfig();
  const assets = await fetchWhatsAppTestAssets(connection.token.accessToken, {
    businessId: config.testMode.businessId,
    businessName: config.testMode.businessName,
    wabaId: config.testMode.wabaId,
    phoneNumberId: config.testMode.phoneNumberId,
  });
  const selectedTemplate = assets.templates.find((template) => template.id === connection.selection?.templateId);
  const firstApprovedTemplate = assets.templates.find((template) => template.status === "APPROVED");

  return {
    user: connection.user,
    permissions: grantedWhatsAppTestPermissions(),
    assets,
    selection: {
      businessId: assets.selectedBusinessId || "",
      wabaId: config.testMode.wabaId,
      phoneNumberId: config.testMode.phoneNumberId,
      templateId: selectedTemplate?.id || firstApprovedTemplate?.id || "",
    },
  };
}
