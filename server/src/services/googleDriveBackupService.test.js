import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
  consumeGoogleDriveOAuthState,
  createGoogleDriveAuthorizationRequest,
  createGoogleDriveBackupFilename,
  createGoogleDriveSession,
  getGoogleDriveSession,
  GOOGLE_DRIVE_BACKUP_SCOPES,
  uploadGoogleDriveBackup,
  validateGoogleDriveBackupPayload,
} from "./googleDriveBackupService.js";

const originalEnv = {
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: process.env.GOOGLE_DRIVE_REDIRECT_URI,
};
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_DRIVE_REDIRECT_URI = "http://localhost:5173/api/auth/google-drive/callback";

const backup = {
  format: "usv-backup",
  formatVersion: 1,
  createdAt: "2026-10-28T12:30:45.000Z",
  application: { name: "USV", version: "test" },
  manifest: { included: [{ key: "items" }] },
  data: { items: [{ id: "item-1" }] },
};

test("requests only Drive file creation plus basic identity and validates state once", () => {
  const request = createGoogleDriveAuthorizationRequest();
  const url = new URL(request.authorizationUrl);
  const scopes = url.searchParams.get("scope").split(" ");
  assert.deepEqual(scopes, GOOGLE_DRIVE_BACKUP_SCOPES);
  assert.ok(scopes.includes("https://www.googleapis.com/auth/drive.file"));
  assert.equal(scopes.some((scope) => scope === "https://www.googleapis.com/auth/drive"), false);
  assert.equal(consumeGoogleDriveOAuthState(request.state, "wrong-cookie"), false);
  assert.deepEqual(consumeGoogleDriveOAuthState(request.state, request.state), { frontendOrigin: "http://localhost:5173" });
  assert.equal(consumeGoogleDriveOAuthState(request.state, request.state), false);
});

test("keeps token data in the server session store and validates backup metadata", () => {
  const saved = createGoogleDriveSession({ access_token: "server-only-token" }, { email: "user@example.com", name: "Test User" });
  assert.equal(getGoogleDriveSession(saved.sessionId).tokens.access_token, "server-only-token");
  assert.equal(getGoogleDriveSession("unknown-session"), null);
  assert.equal(validateGoogleDriveBackupPayload(backup), "");
  assert.match(validateGoogleDriveBackupPayload({ ...backup, formatVersion: 2 }), /Unsupported/);
});

test("uploads a fresh timestamped .usvbackup and returns only Drive-confirmed metadata", async () => {
  const session = createGoogleDriveSession({ access_token: "server-only-token" }, { email: "user@example.com" });
  let requestBody;
  let contents = "";
  const result = await uploadGoogleDriveBackup(session.sessionId, backup, {
    driveFactory: () => ({ files: { create: async (request) => {
      requestBody = request;
      for await (const chunk of request.media.body) contents += chunk.toString();
      return { data: { id: "drive-file-1", name: request.requestBody.name, webViewLink: "https://drive.google.com/file/d/drive-file-1", createdTime: "2026-10-28T12:31:00.000Z" } };
    } } }),
  });

  assert.match(requestBody.requestBody.name, /^USV_Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.usvbackup$/);
  assert.equal(JSON.parse(contents).data.items[0].id, "item-1");
  assert.equal(result.id, "drive-file-1");
  assert.equal(result.name, requestBody.requestBody.name);
  assert.match(createGoogleDriveBackupFilename(), /^USV_Backup_/);
});

test("does not report success when Drive rejects an upload", async () => {
  const session = createGoogleDriveSession({ access_token: "server-only-token" }, { email: "user@example.com" });
  await assert.rejects(
    uploadGoogleDriveBackup(session.sessionId, backup, {
      driveFactory: () => ({ files: { create: async () => { throw Object.assign(new Error("forbidden"), { code: 403 }); } } }),
    }),
    /Google Drive denied this upload/,
  );
});

test.after(() => {
  if (originalEnv.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalEnv.id;
  if (originalEnv.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = originalEnv.secret;
  if (originalEnv.redirect === undefined) delete process.env.GOOGLE_DRIVE_REDIRECT_URI;
  else process.env.GOOGLE_DRIVE_REDIRECT_URI = originalEnv.redirect;
});
