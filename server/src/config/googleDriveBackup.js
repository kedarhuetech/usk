/* global process */

export function getGoogleDriveBackupConfig() {
  const clientOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
  const frontendUrl = (process.env.FRONTEND_URL || clientOrigins[0] || "http://localhost:5173").replace(/\/$/, "");
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || "";
  return {
    clientId,
    clientSecret,
    redirectUri,
    frontendUrl,
    clientOrigins: [...new Set([...clientOrigins, frontendUrl])],
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}
