import crypto from "node:crypto";
import { Readable } from "node:stream";
import { google } from "googleapis";
import { getGoogleDriveBackupConfig } from "../config/googleDriveBackup.js";

export const GOOGLE_DRIVE_BACKUP_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
];
export const GOOGLE_DRIVE_STATE_COOKIE = "usv_google_drive_oauth_state";
export const GOOGLE_DRIVE_SESSION_COOKIE = "usv_google_drive_session";
export const GOOGLE_DRIVE_COOKIE_PATH = "/api/auth/google-drive";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const states = new Map();
const sessions = new Map();

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function cleanupExpired(now = Date.now()) {
  for (const [state, record] of states) if (record.expiresAt <= now) states.delete(state);
  for (const [sessionKey, session] of sessions) if (session.expiresAt <= now) sessions.delete(sessionKey);
}

export function createGoogleDriveOAuthClient() {
  const config = getGoogleDriveBackupConfig();
  if (!config.configured) throw new Error("Google Drive OAuth is not configured on the backend.");
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export function createGoogleDriveAuthorizationRequest({ now = Date.now(), frontendOrigin = "" } = {}) {
  cleanupExpired(now);
  const config = getGoogleDriveBackupConfig();
  const returnOrigin = config.clientOrigins.includes(frontendOrigin) ? frontendOrigin : config.frontendUrl;
  const client = createGoogleDriveOAuthClient();
  const state = crypto.randomBytes(32).toString("base64url");
  states.set(state, { expiresAt: now + OAUTH_STATE_TTL_MS, frontendOrigin: returnOrigin });
  const authorizationUrl = client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent select_account",
    scope: GOOGLE_DRIVE_BACKUP_SCOPES,
    state,
  });
  return { authorizationUrl, state, frontendOrigin: returnOrigin, maxAgeMs: OAUTH_STATE_TTL_MS };
}

export function consumeGoogleDriveOAuthState(state, cookieState, { now = Date.now() } = {}) {
  cleanupExpired(now);
  const value = String(state || "");
  if (!value || value !== cookieState) return false;
  const stateRecord = states.get(value);
  if (!stateRecord || stateRecord.expiresAt <= now) return false;
  states.delete(value);
  return { frontendOrigin: stateRecord.frontendOrigin };
}

export async function exchangeGoogleDriveAuthorizationCode(code) {
  const client = createGoogleDriveOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google did not return an access token.");
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: user } = await oauth2.userinfo.get();
  if (!user.email) throw new Error("Google did not return an account email.");
  return {
    tokens,
    profile: {
      name: String(user.name || "Google account"),
      email: String(user.email),
      picture: String(user.picture || ""),
    },
  };
}

export function createGoogleDriveSession(tokens, profile, { now = Date.now() } = {}) {
  cleanupExpired(now);
  const sessionId = crypto.randomBytes(32).toString("base64url");
  sessions.set(digest(sessionId), { tokens, profile, expiresAt: now + SESSION_TTL_MS });
  return { sessionId, maxAgeMs: SESSION_TTL_MS };
}

export function getGoogleDriveSession(sessionId, { now = Date.now() } = {}) {
  if (!sessionId) return null;
  cleanupExpired(now);
  const session = sessions.get(digest(sessionId));
  return session ? { tokens: { ...session.tokens }, profile: { ...session.profile } } : null;
}

export function updateGoogleDriveSessionTokens(sessionId, tokens, { now = Date.now() } = {}) {
  const key = digest(sessionId || "");
  const session = sessions.get(key);
  if (!session) return false;
  sessions.set(key, { ...session, tokens: { ...session.tokens, ...tokens }, expiresAt: now + SESSION_TTL_MS });
  return true;
}

export function deleteGoogleDriveSession(sessionId) {
  if (!sessionId) return;
  sessions.delete(digest(sessionId));
}

export function validateGoogleDriveBackupPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Backup must be a JSON object.";
  if (payload.format !== "usv-backup" || payload.formatVersion !== 1) return "Unsupported USV backup format or version.";
  if (!Number.isFinite(Date.parse(payload.createdAt || "")) || payload.application?.name !== "USV") return "Backup metadata is missing or invalid.";
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data) || !Array.isArray(payload.manifest?.included)) return "Backup manifest or data section is missing.";
  if (payload.manifest.included.some((entry) => !entry || typeof entry.key !== "string" || !Object.hasOwn(payload.data, entry.key))) {
    return "Backup manifest references missing data.";
  }
  return "";
}

export function createGoogleDriveBackupFilename(now = new Date()) {
  const date = now.toISOString();
  return `USV_Backup_${date.slice(0, 10)}_${date.slice(11, 19).replaceAll(":", "-")}.usvbackup`;
}

export async function uploadGoogleDriveBackup(sessionId, payload, { driveFactory = (auth) => google.drive({ version: "v3", auth }) } = {}) {
  const validationError = validateGoogleDriveBackupPayload(payload);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const session = getGoogleDriveSession(sessionId);
  if (!session) {
    const error = new Error("Google Drive session expired. Sign in again to upload a backup.");
    error.statusCode = 401;
    throw error;
  }

  const client = createGoogleDriveOAuthClient();
  client.setCredentials(session.tokens);
  client.on("tokens", (tokens) => updateGoogleDriveSessionTokens(sessionId, tokens));
  const drive = driveFactory(client);
  const filename = createGoogleDriveBackupFilename();
  try {
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: "application/json",
        description: "USV business data backup",
      },
      media: {
        mimeType: "application/json",
        body: Readable.from([JSON.stringify(payload, null, 2)]),
      },
      fields: "id,name,mimeType,webViewLink,createdTime",
    });
    if (!response.data?.id) throw new Error("Google Drive did not confirm the uploaded file.");
    return {
      id: response.data.id,
      name: response.data.name || filename,
      mimeType: response.data.mimeType || "application/json",
      webViewLink: response.data.webViewLink || "",
      uploadedAt: response.data.createdTime || new Date().toISOString(),
    };
  } catch (error) {
    const apiError = new Error("Google Drive could not upload the backup. Check the connection and try again.", { cause: error });
    apiError.statusCode = Number(error?.code || error?.response?.status) || 502;
    const apiReason = error?.errors?.[0]?.reason || error?.response?.data?.error?.errors?.[0]?.reason || "";
    if (apiError.statusCode === 401 || error?.message?.includes("invalid_grant")) {
      deleteGoogleDriveSession(sessionId);
      apiError.statusCode = 401;
      apiError.message = "Google authorization expired or was revoked. Sign in again and retry.";
    } else if (apiError.statusCode === 403) {
      if (["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"].includes(apiReason)) {
        apiError.statusCode = 429;
        apiError.message = "Google Drive is rate-limiting uploads. Wait a moment, then retry.";
      } else {
        apiError.message = "Google Drive denied this upload. Reconnect and approve the requested Drive access.";
      }
    } else if (apiError.statusCode === 429) {
      apiError.message = "Google Drive is rate-limiting uploads. Wait a moment, then retry.";
    }
    throw apiError;
  }
}
