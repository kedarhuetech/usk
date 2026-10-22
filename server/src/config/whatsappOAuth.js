/* global process */

import { getMetaOAuthConfig } from "./metaOAuth.js";

export const WHATSAPP_AUTH_SCOPES = [
  "business_management",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
];

export function getWhatsAppOAuthConfig() {
  const metaConfig = getMetaOAuthConfig();
  const redirectUri = process.env.WHATSAPP_REDIRECT_URI || "";
  const loginConfigId = process.env.WHATSAPP_LOGIN_CONFIG_ID || "";
  const testAccessToken = process.env.WHATSAPP_TEST_ACCESS_TOKEN || "";
  const testWabaId = process.env.WHATSAPP_TEST_WABA_ID || "";
  const testPhoneNumberId = process.env.WHATSAPP_TEST_PHONE_NUMBER_ID || "";
  const oauthConfigured = Boolean(metaConfig.appId && metaConfig.appSecret && redirectUri);
  const embeddedSignupConfigured = Boolean(metaConfig.appId && metaConfig.appSecret && loginConfigId);
  const testModeConfigured = Boolean(testAccessToken && testWabaId && testPhoneNumberId);

  return {
    ...metaConfig,
    redirectUri,
    loginConfigId,
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
    oauthConfigured,
    embeddedSignupConfigured,
    embeddedSignup: {
      appId: metaConfig.appId,
      graphApiVersion: metaConfig.graphApiVersion,
      loginConfigId,
    },
    testModeConfigured,
    testMode: {
      accessToken: testAccessToken,
      wabaId: testWabaId,
      phoneNumberId: testPhoneNumberId,
      businessId: process.env.WHATSAPP_TEST_BUSINESS_ID || "",
      businessName: process.env.WHATSAPP_TEST_BUSINESS_NAME || "Meta Test Business",
    },
    configured: oauthConfigured || embeddedSignupConfigured || testModeConfigured,
  };
}
