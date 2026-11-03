import test from "node:test";
import assert from "node:assert/strict";
import { getGoogleOAuthConfig, createGoogleOAuthClient } from "./googleOAuth.js";

test("getGoogleOAuthConfig correctly trims credentials and provides redirectUri", () => {
  const config = getGoogleOAuthConfig();
  assert.ok(config.clientId, "Client ID should be defined");
  assert.equal(config.clientId, config.clientId.trim(), "Client ID should not have leading/trailing whitespace");
  assert.ok(config.redirectUri, "Redirect URI should be present");
});

test("createGoogleOAuthClient instantiates valid OAuth2 client", () => {
  const client = createGoogleOAuthClient();
  assert.ok(client._clientId, "OAuth client should have client ID set");
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/business.manage"],
  });
  assert.ok(authUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth"), "Generated auth URL should be valid Google endpoint");
  assert.ok(authUrl.includes("business.manage"), "Generated auth URL should contain requested scopes");
});
