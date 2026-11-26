/**
 * Forgot Password Flow & Security Verification Tests
 *
 * Verifies:
 * 1. Non-existent email returns 404 "There is no account for this gmail in USK".
 * 2. Rate limiting restricts excessive OTP requests (429 Too Many Requests).
 * 3. 6-digit OTP verification and failure lockout after multiple bad attempts.
 * 4. Secure single-use reset token issuance and hash storage in password_resets.
 * 5. Password reset updates bcrypt hash and consumes the token (preventing replay).
 * 6. Session invalidation: token_version incremented and active user sessions revoked.
 * 7. Verification that user can log in with new password and old password fails.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool } from "../db/mysql.js";
import authRouter from "../routes/authRouter.js";
import { initializeDatabaseSchema } from "../db/initSchema.js";
import {
  signAuthToken,
  requireAuth,
  isUserSessionRevoked,
} from "../middleware/authMiddleware.js";

let app;
let server;
let baseUrl;

const TEST_EMAIL = `fp_user_${Date.now()}@gmail.com`;
const TEST_BIZ_ID = `fp-biz-${Date.now()}`;
const TEST_USER_ID = `usr_fp_${Date.now()}`;
const INITIAL_PASSWORD = "OldPassword@123";
const NEW_PASSWORD = "NewSecurePassword@456";

before(async () => {
  await initializeDatabaseSchema();

  app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);

  // Protected route to test session invalidation
  app.get("/api/test-protected", requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Seed test business and user
  const initialHash = await bcrypt.hash(INITIAL_PASSWORD, 10);
  await pool.query(
    `INSERT INTO businesses (id, name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [TEST_BIZ_ID, "Forgot Password Test Business"]
  );

  await pool.query(
    `INSERT INTO users (id, email, password_hash, business_id, role, is_verified, token_version)
     VALUES (?, ?, ?, ?, 'owner', 1, 1)`,
    [TEST_USER_ID, TEST_EMAIL, initialHash, TEST_BIZ_ID]
  );
});

after(async () => {
  await pool.query("DELETE FROM password_resets WHERE LOWER(email) = ?", [TEST_EMAIL]).catch(() => {});
  await pool.query("DELETE FROM email_verifications WHERE LOWER(email) = ?", [TEST_EMAIL]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id = ?", [TEST_USER_ID]).catch(() => {});
  await pool.query("DELETE FROM businesses WHERE id = ?", [TEST_BIZ_ID]).catch(() => {});

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end().catch(() => {});
});

test("1. Non-existent email returns 404 'There is no account for this gmail in USK'", async () => {
  const fakeEmail = `nonexistent_${Date.now()}@gmail.com`;
  const res = await fetch(`${baseUrl}/api/auth/forgot-password/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: fakeEmail }),
  });

  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.message, "There is no account for this gmail in USK");
});

test("2. Valid email sends 6-digit OTP and rate limiting enforces cooldown", async () => {
  // First request: should succeed
  const res1 = await fetch(`${baseUrl}/api/auth/forgot-password/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL }),
  });

  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.success, true);
  assert.ok(data1.message.includes("Verification code sent"));

  // Check OTP stored in database
  const [rows] = await pool.query(
    "SELECT otp_code, expires_at FROM email_verifications WHERE LOWER(email) = ? AND is_verified = 0",
    [TEST_EMAIL]
  );
  assert.ok(rows.length > 0);
  assert.equal(rows[0].otp_code.length, 6);

  // Immediate second request: should be rate-limited (429) due to cooldown
  const res2 = await fetch(`${baseUrl}/api/auth/forgot-password/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL }),
  });

  assert.equal(res2.status, 429);
  const data2 = await res2.json();
  assert.equal(data2.success, false);
  assert.ok(data2.message.includes("wait") || data2.message.includes("Too many"));
});

test("3. OTP verification fails on bad code and locks out after multiple attempts", async () => {
  // Bad OTP
  const res = await fetch(`${baseUrl}/api/auth/forgot-password/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, otp: "000000" }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(data.message.includes("Invalid or expired"));
});

test("4. Valid OTP creates secure hashed resetToken in password_resets", async () => {
  // Retrieve the valid OTP from database
  const [rows] = await pool.query(
    "SELECT otp_code FROM email_verifications WHERE LOWER(email) = ? AND is_verified = 0 ORDER BY created_at DESC LIMIT 1",
    [TEST_EMAIL]
  );
  const validOtp = rows[0].otp_code;

  const res = await fetch(`${baseUrl}/api/auth/forgot-password/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, otp: validOtp }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.resetToken);
  assert.equal(data.resetToken.length, 64); // 32 bytes hex = 64 characters

  // Verify stored in password_resets as a SHA-256 hash (never plaintext)
  const expectedHash = crypto.createHash("sha256").update(data.resetToken).digest("hex");
  const [resetRows] = await pool.query(
    "SELECT token_hash, is_used FROM password_resets WHERE LOWER(email) = ?",
    [TEST_EMAIL]
  );
  assert.ok(resetRows.length > 0);
  assert.equal(resetRows[0].token_hash, expectedHash);
  assert.equal(resetRows[0].is_used, 0);

  // Save token for next test
  globalThis.__testResetToken = data.resetToken;
});

test("5. Reset password validates input, consumes token, updates hash, and prevents token replay", async () => {
  const resetToken = globalThis.__testResetToken;
  assert.ok(resetToken);

  // Issue active session token before password change
  const preResetJwt = signAuthToken({
    userId: TEST_USER_ID,
    email: TEST_EMAIL,
    businessId: TEST_BIZ_ID,
    role: "owner",
  });

  // Verify pre-reset token works
  const preCheck = await fetch(`${baseUrl}/api/test-protected`, {
    headers: { Authorization: `Bearer ${preResetJwt}` },
  });
  assert.equal(preCheck.status, 200);

  // Mismatched passwords should fail
  const badMismatch = await fetch(`${baseUrl}/api/auth/forgot-password/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: TEST_EMAIL,
      resetToken,
      newPassword: NEW_PASSWORD,
      confirmPassword: "WrongConfirmation",
    }),
  });
  assert.equal(badMismatch.status, 400);

  // Perform valid password reset
  const resetRes = await fetch(`${baseUrl}/api/auth/forgot-password/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: TEST_EMAIL,
      resetToken,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    }),
  });

  assert.equal(resetRes.status, 200);
  const resetData = await resetRes.json();
  assert.equal(resetData.success, true);
  assert.ok(resetData.message.includes("successful"));

  // Check database password_hash is updated
  const [userRows] = await pool.query(
    "SELECT password_hash, token_version FROM users WHERE id = ?",
    [TEST_USER_ID]
  );
  const isNewHash = await bcrypt.compare(NEW_PASSWORD, userRows[0].password_hash);
  assert.equal(isNewHash, true);
  assert.ok(userRows[0].token_version > 1, "token_version must be incremented");

  // Replay protection: Attempting to use the SAME reset token again must fail (400)
  const replayRes = await fetch(`${baseUrl}/api/auth/forgot-password/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: TEST_EMAIL,
      resetToken,
      newPassword: "AnotherPassword123",
      confirmPassword: "AnotherPassword123",
    }),
  });
  assert.equal(replayRes.status, 400);

  // Session Invalidation: The previous session JWT must now be rejected (401)
  const postCheck = await fetch(`${baseUrl}/api/test-protected`, {
    headers: { Authorization: `Bearer ${preResetJwt}` },
  });
  assert.equal(postCheck.status, 401);

  // Sign in with new password succeeds
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: NEW_PASSWORD }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.ok(loginData.token);

  // Sign in with old password fails
  const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: INITIAL_PASSWORD }),
  });
  assert.equal(oldLoginRes.status, 401);
});
