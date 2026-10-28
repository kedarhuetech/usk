import { Router } from "express";
import { getGoogleDriveBackupConfig } from "../config/googleDriveBackup.js";
import {
  consumeGoogleDriveOAuthState,
  createGoogleDriveAuthorizationRequest,
  createGoogleDriveSession,
  deleteGoogleDriveSession,
  exchangeGoogleDriveAuthorizationCode,
  getGoogleDriveSession,
  GOOGLE_DRIVE_COOKIE_PATH,
  GOOGLE_DRIVE_SESSION_COOKIE,
  GOOGLE_DRIVE_STATE_COOKIE,
  uploadGoogleDriveBackup,
} from "../services/googleDriveBackupService.js";

const router = Router();

function isSecureRequest(req) {
  return req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function isCrossSiteClient(req, frontendOrigin = "") {
  try {
    const frontendHost = new URL(frontendOrigin || frontendOriginFromRequest(req)).hostname;
    const requestHost = String(req.get("host") || "").split(":")[0];
    return frontendHost !== requestHost;
  } catch {
    return false;
  }
}

function cookieOptions(req, maxAge, frontendOrigin = "") {
  const crossSite = isCrossSiteClient(req, frontendOrigin);
  return {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: isSecureRequest(req) || crossSite,
    path: GOOGLE_DRIVE_COOKIE_PATH,
    ...(maxAge ? { maxAge } : {}),
  };
}

function readCookie(req, name) {
  for (const item of String(req.headers.cookie || "").split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(value.join("=")); } catch { return ""; }
    }
  }
  return "";
}

function clearAuthCookies(req, res) {
  res.clearCookie(GOOGLE_DRIVE_STATE_COOKIE, cookieOptions(req));
}

function frontendOriginFromRequest(req) {
  const config = getGoogleDriveBackupConfig();
  for (const candidate of [req.get("origin"), req.get("referer")]) {
    try {
      const origin = new URL(candidate).origin;
      if (config.clientOrigins.includes(origin)) return origin;
    } catch { /* An absent or untrusted header must use the configured origin. */ }
  }
  return config.frontendUrl;
}

function redirectToBackupPage(res, status, message = "", frontendOrigin = "") {
  const config = getGoogleDriveBackupConfig();
  const returnOrigin = config.clientOrigins.includes(frontendOrigin) ? frontendOrigin : config.frontendUrl;
  const target = new URL("/sync-share-backup/backup-to-drive", returnOrigin);
  if (status) target.searchParams.set("googleDrive", status);
  if (message) target.searchParams.set("message", message);
  return res.redirect(target.toString());
}

function requireClientOrigin(req, res, next) {
  const origin = req.get("origin");
  const config = getGoogleDriveBackupConfig();
  if (!origin || !config.clientOrigins.includes(origin.replace(/\/$/, ""))) {
    return res.status(403).json({ success: false, message: "This request must come from the USV application." });
  }
  return next();
}

router.get("/google-drive/status", (req, res) => {
  res.set("Cache-Control", "no-store");
  const config = getGoogleDriveBackupConfig();
  const session = getGoogleDriveSession(readCookie(req, GOOGLE_DRIVE_SESSION_COOKIE));
  return res.json({
    success: true,
    data: {
      configured: config.configured,
      connected: Boolean(session),
      profile: session?.profile || null,
    },
  });
});

router.get("/google-drive/start", (req, res) => {
  try {
    const request = createGoogleDriveAuthorizationRequest({ frontendOrigin: frontendOriginFromRequest(req) });
    res.cookie(GOOGLE_DRIVE_STATE_COOKIE, request.state, cookieOptions(req, request.maxAgeMs, request.frontendOrigin));
    return res.redirect(request.authorizationUrl);
  } catch (error) {
    return redirectToBackupPage(res, "error", error.message || "Google Drive sign-in is not configured.");
  }
});

router.get("/google-drive/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const cookieState = readCookie(req, GOOGLE_DRIVE_STATE_COOKIE);
  clearAuthCookies(req, res);
  const stateRecord = consumeGoogleDriveOAuthState(state, cookieState);
  if (!stateRecord) {
    return redirectToBackupPage(res, "error", "Google sign-in expired or failed its security check. Please retry.");
  }
  if (error) return redirectToBackupPage(res, "denied", "Google sign-in was cancelled or access was denied.", stateRecord.frontendOrigin);
  if (typeof code !== "string" || !code) return redirectToBackupPage(res, "error", "Google did not return an authorization code.", stateRecord.frontendOrigin);

  try {
    const { tokens, profile } = await exchangeGoogleDriveAuthorizationCode(code);
    const session = createGoogleDriveSession(tokens, profile);
    res.cookie(GOOGLE_DRIVE_SESSION_COOKIE, session.sessionId, cookieOptions(req, session.maxAgeMs, stateRecord.frontendOrigin));
    return redirectToBackupPage(res, "connected", "", stateRecord.frontendOrigin);
  } catch (callbackError) {
    // Avoid logging OAuth codes, tokens, provider response bodies, or secrets.
    console.error("Google Drive OAuth callback failed", { code: callbackError.code || "OAUTH_ERROR" });
    return redirectToBackupPage(res, "error", "Google sign-in failed. Check the OAuth setup and try again.", stateRecord.frontendOrigin);
  }
});

router.post("/google-drive/disconnect", requireClientOrigin, (req, res) => {
  deleteGoogleDriveSession(readCookie(req, GOOGLE_DRIVE_SESSION_COOKIE));
  res.clearCookie(GOOGLE_DRIVE_SESSION_COOKIE, cookieOptions(req));
  return res.json({ success: true, data: { connected: false } });
});

router.post("/google-drive/upload", requireClientOrigin, async (req, res) => {
  const sessionId = readCookie(req, GOOGLE_DRIVE_SESSION_COOKIE);
  if (!getGoogleDriveSession(sessionId)) {
    res.clearCookie(GOOGLE_DRIVE_SESSION_COOKIE, cookieOptions(req));
    return res.status(401).json({ success: false, message: "Google Drive session expired. Sign in again to upload a backup." });
  }
  try {
    const file = await uploadGoogleDriveBackup(sessionId, req.body);
    return res.json({ success: true, data: { file } });
  } catch (error) {
    const status = Number(error.statusCode) || 502;
    if (status === 401) res.clearCookie(GOOGLE_DRIVE_SESSION_COOKIE, cookieOptions(req));
    return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message: error.message || "Google Drive upload failed." });
  }
});

export default router;
