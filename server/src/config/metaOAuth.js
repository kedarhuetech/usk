/* global process */

const DEFAULT_GRAPH_API_VERSION = "v26.0";

export const META_AUTH_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
];

function normalizeGraphVersion(value) {
  const version = value || DEFAULT_GRAPH_API_VERSION;
  return version.startsWith("v") ? version : `v${version}`;
}

function firstClientOrigin() {
  return (process.env.CLIENT_ORIGIN || "https://9hdxck8r-5173.inc1.devtunnels.ms/")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)[0];
}

export function getMetaOAuthConfig() {
  const graphApiVersion = normalizeGraphVersion(process.env.META_GRAPH_API_VERSION);
  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";
  const redirectUri = process.env.META_REDIRECT_URI || "";

  return {
    appId,
    appSecret,
    redirectUri,
    graphApiVersion,
    loginConfigId: process.env.META_LOGIN_CONFIG_ID || "",
    clientOrigin: firstClientOrigin(),
    authBaseUrl: `https://www.facebook.com/${graphApiVersion}/dialog/oauth`,
    graphBaseUrl: `https://graph.facebook.com/${graphApiVersion}`,
    configured: Boolean(appId && appSecret && redirectUri),
  };
}
