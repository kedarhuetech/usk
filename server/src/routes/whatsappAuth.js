import { Router } from "express";
import { getWhatsAppOAuthConfig } from "../config/whatsappOAuth.js";
import { fetchWhatsAppAssets, normalizeWhatsAppError } from "../services/whatsappBusinessService.js";
import {
  WHATSAPP_OAUTH_STATE_COOKIE,
  buildWhatsAppAuthorizationRequest,
  exchangeForLongLivedWhatsAppToken,
  exchangeWhatsAppEmbeddedSignupCode,
  exchangeWhatsAppCodeForAccessToken,
  validateWhatsAppOAuthState,
} from "../services/whatsappOAuthService.js";
import {
  disconnectWhatsAppConnection,
  getWhatsAppPublicConnection,
  setWhatsAppConnection,
  setWhatsAppConnectionError,
} from "../services/whatsappConnectionStore.js";
import { getMetaPermissions, getMetaUser, normalizeMetaError } from "../services/metaOAuthService.js";
import { ensureWhatsAppTestConnection } from "../services/whatsappTestModeService.js";

const router = Router();
const OAUTH_COOKIE_PATH = "/api/auth/whatsapp";

function isSecureRequest(req) {
  return req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function oauthCookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: OAUTH_COOKIE_PATH,
    ...(maxAge ? { maxAge } : {}),
  };
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  const found = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  if (!found) return "";
  return decodeURIComponent(found.trim().slice(name.length + 1));
}

function clearWhatsAppOAuthStateCookie(req, res) {
  res.clearCookie(WHATSAPP_OAUTH_STATE_COOKIE, oauthCookieOptions(req));
}

function whatsappRedirect(status, message = "") {
  const config = getWhatsAppOAuthConfig();
  const url = new URL("/business-growth/whatsapp-marketing", config.clientOrigin);
  url.searchParams.set("whatsapp", status);
  if (message) url.searchParams.set("message", message);
  return url.toString();
}

function publicWhatsAppAuthState(config = getWhatsAppOAuthConfig()) {
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

router.get("/whatsapp", (req, res) => {
  try {
    const { authorizationUrl, stateCookie, maxAgeMs } = buildWhatsAppAuthorizationRequest(req.query.returnTo);
    res.cookie(WHATSAPP_OAUTH_STATE_COOKIE, stateCookie, oauthCookieOptions(req, maxAgeMs));
    return res.redirect(authorizationUrl);
  } catch (error) {
    const normalized = normalizeMetaError(error, "Unable to start WhatsApp Business OAuth");
    setWhatsAppConnectionError(normalized.message);
    return res.redirect(whatsappRedirect("error", normalized.message));
  }
});

router.post("/whatsapp/test-connect", async (_req, res) => {
  const config = getWhatsAppOAuthConfig();
  try {
    await ensureWhatsAppTestConnection({ forceRefresh: true });
    const publicConnection = getWhatsAppPublicConnection();
    return res.json({
      success: true,
      testConnectionState: publicConnection.readiness?.readyToSend ? "TEST_READY" : "TEST_INCOMPLETE",
      message: "WhatsApp test setup connected.",
      ...publicWhatsAppAuthState(config),
    });
  } catch (error) {
    let normalized;
    try {
      normalized = normalizeWhatsAppError(error, "Unable to connect WhatsApp test setup");
    } catch {
      normalized = {
        category: "WHATSAPP_API_ERROR",
        message: "Unable to connect WhatsApp test setup.",
        stage: "TOKEN_VALIDATION",
      };
    }
    console.error("WhatsApp test setup failed", {
      stage: normalized.stage || "UNKNOWN",
      category: normalized.category,
      httpStatus: normalized.httpStatus || "",
      code: normalized.code || "",
      subcode: normalized.subcode || "",
      fbtraceId: normalized.fbtraceId || "",
    });
    setWhatsAppConnectionError(normalized.message);
    const status = normalized.stage === "CONFIG" || normalized.category === "WHATSAPP_TEST_CONFIG_MISSING" ? 400 : normalized.category === "TOKEN_EXPIRED" ? 401 : 502;
    return res.status(status).json({
      success: false,
      configured: config.configured,
      oauthConfigured: config.oauthConfigured,
      embeddedSignupConfigured: config.embeddedSignupConfigured,
      testModeConfigured: config.testModeConfigured,
      message: normalized.message,
      error: normalized,
      ...publicWhatsAppAuthState(config),
    });
  }
});

router.post("/whatsapp/embedded-signup", async (req, res) => {
  const config = getWhatsAppOAuthConfig();
  if (!config.embeddedSignupConfigured) {
    return res.status(503).json({
      success: false,
      configured: config.configured,
      oauthConfigured: config.oauthConfigured,
      embeddedSignupConfigured: config.embeddedSignupConfigured,
      testModeConfigured: config.testModeConfigured,
      message: "WhatsApp Embedded Signup is not configured on the backend.",
      error: { category: "WHATSAPP_CONFIG_MISSING", stage: "CONFIG" },
      ...publicWhatsAppAuthState(config),
    });
  }

  const code = String(req.body?.code || "").trim();
  if (!code) {
    return res.status(400).json({
      success: false,
      configured: config.configured,
      oauthConfigured: config.oauthConfigured,
      embeddedSignupConfigured: config.embeddedSignupConfigured,
      testModeConfigured: config.testModeConfigured,
      message: "WhatsApp Embedded Signup authorization code missing.",
      error: { category: "WHATSAPP_AUTH_ERROR", stage: "AUTH_ERROR" },
      ...publicWhatsAppAuthState(config),
    });
  }

  try {
    const tokenPayload = await exchangeWhatsAppEmbeddedSignupCode(code);
    const accessToken = tokenPayload.access_token;
    const signupAssets = req.body?.signup || {};
    const businessId = String(signupAssets.businessId || signupAssets.business_id || "").trim();
    const wabaId = String(signupAssets.wabaId || signupAssets.waba_id || "").trim();
    const phoneNumberId = String(signupAssets.phoneNumberId || signupAssets.phone_number_id || "").trim();
    const [user, permissions, assets] = await Promise.all([
      getMetaUser(accessToken),
      getMetaPermissions(accessToken),
      fetchWhatsAppAssets(accessToken, { businessId, wabaId, phoneNumberId }),
    ]);

    setWhatsAppConnection({
      source: "embedded_signup",
      user,
      permissions,
      assets,
      selection: {
        businessId: assets.selectedBusinessId || businessId || "",
        wabaId: assets.selectedWabaId || wabaId || "",
        phoneNumberId: assets.selectedPhoneNumberId || phoneNumberId || "",
        templateId: "",
      },
      token: {
        accessToken,
        tokenType: tokenPayload.token_type || "bearer",
        expiresIn: tokenPayload.expires_in || null,
        longLived: false,
        embeddedSignup: true,
        obtainedAt: new Date().toISOString(),
      },
    });

    return res.json({
      success: true,
      configured: config.configured,
      oauthConfigured: config.oauthConfigured,
      embeddedSignupConfigured: config.embeddedSignupConfigured,
      testModeConfigured: config.testModeConfigured,
      message: "WhatsApp Business connected.",
      ...publicWhatsAppAuthState(config),
    });
  } catch (error) {
    const normalized = normalizeWhatsAppError(error, "WhatsApp Embedded Signup failed");
    const status = normalized.category === "TOKEN_EXPIRED" ? 401 : normalized.stage === "CONFIG" ? 400 : 502;
    setWhatsAppConnectionError(normalized.message);
    return res.status(status).json({
      success: false,
      configured: config.configured,
      oauthConfigured: config.oauthConfigured,
      embeddedSignupConfigured: config.embeddedSignupConfigured,
      testModeConfigured: config.testModeConfigured,
      message: normalized.message,
      error: normalized,
      ...publicWhatsAppAuthState(config),
    });
  }
});

router.get("/whatsapp/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const stateCookie = readCookie(req, WHATSAPP_OAUTH_STATE_COOKIE);
  clearWhatsAppOAuthStateCookie(req, res);

  if (error) {
    const message = String(error_description || error || "WhatsApp Business login was cancelled.");
    setWhatsAppConnectionError(message);
    return res.redirect(whatsappRedirect("error", message));
  }

  if (!validateWhatsAppOAuthState(String(state || ""), stateCookie)) {
    const message = "WhatsApp OAuth state is invalid or expired.";
    setWhatsAppConnectionError(message);
    return res.redirect(whatsappRedirect("error", message));
  }

  if (!code) {
    const message = "WhatsApp authorization code missing.";
    setWhatsAppConnectionError(message);
    return res.redirect(whatsappRedirect("error", message));
  }

  try {
    const shortLivedToken = await exchangeWhatsAppCodeForAccessToken(String(code));
    let tokenPayload = shortLivedToken;
    let longLived = false;

    try {
      tokenPayload = await exchangeForLongLivedWhatsAppToken(shortLivedToken.access_token);
      longLived = true;
    } catch {
      tokenPayload = shortLivedToken;
    }

    const accessToken = tokenPayload.access_token;
    const [user, permissions, assets] = await Promise.all([
      getMetaUser(accessToken),
      getMetaPermissions(accessToken),
      fetchWhatsAppAssets(accessToken),
    ]);

    setWhatsAppConnection({
      user,
      permissions,
      assets,
      selection: {
        businessId: assets.selectedBusinessId || "",
        wabaId: assets.selectedWabaId || "",
        phoneNumberId: assets.selectedPhoneNumberId || "",
        templateId: "",
      },
      token: {
        accessToken,
        tokenType: tokenPayload.token_type || "bearer",
        expiresIn: tokenPayload.expires_in || shortLivedToken.expires_in || null,
        longLived,
        obtainedAt: new Date().toISOString(),
      },
    });

    return res.redirect(whatsappRedirect("connected"));
  } catch (callbackError) {
    const normalized = normalizeMetaError(callbackError, "WhatsApp OAuth callback failed");
    setWhatsAppConnectionError(normalized.message);
    return res.redirect(whatsappRedirect("error", normalized.message));
  }
});

router.get("/whatsapp/status", async (_req, res) => {
  const config = getWhatsAppOAuthConfig();
  return res.json({
    success: true,
    ...publicWhatsAppAuthState(config),
  });
});

router.post("/whatsapp/disconnect", (_req, res) => {
  const config = getWhatsAppOAuthConfig();
  disconnectWhatsAppConnection();
  return res.json({
    success: true,
    message: "WhatsApp Business disconnected",
    ...publicWhatsAppAuthState(config),
  });
});

export default router;
