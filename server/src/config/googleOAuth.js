// Loads the google OAuth settings.
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config({ quiet: true });

export function getGoogleOAuthConfig() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = (
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:5000/api/auth/google/callback"
  ).trim();

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

export function createGoogleOAuthClient() {
  const config = getGoogleOAuthConfig();
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

const googleOAuthClient = createGoogleOAuthClient();

export default googleOAuthClient;
