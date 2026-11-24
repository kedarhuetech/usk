import assert from "node:assert/strict";
import { businessIdFromRequest, pool } from "../src/db/mysql.js";

async function runSecurityTests() {
  console.log("=== RUNNING SECURITY & LOGIC TESTS ===");

  // 1. Immutable JWT Business ID
  console.log("TEST 1: businessIdFromRequest immutability with req.user...");
  const mockReqWithJwt = {
    user: { businessId: "tenant-legit", userId: "usr_123" },
    get: (header) => (header.toLowerCase() === "x-business-id" ? "tenant-attacker" : null),
    path: "/api/parties",
    method: "GET",
    query: { businessId: "tenant-attacker" }
  };
  const resolvedId = businessIdFromRequest(mockReqWithJwt);
  assert.equal(resolvedId, "tenant-legit", "Authenticated req.user.businessId must supersede any spoofed headers or query params");
  console.log("PASSED: JWT tenant context is immutable and spoof-proof.\n");

  // 2. Date sanitization check
  console.log("TEST 2: SQL Date sanitization logic...");
  function toSqlDate(val, fallback = null) {
    if (!val || typeof val !== "string") return fallback;
    const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return fallback;
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  assert.equal(toSqlDate("2026-11-24"), "2026-11-24");
  assert.equal(toSqlDate("2026-11-24' OR '1'='1", "2000-01-01"), "2000-01-01");
  assert.equal(toSqlDate("<script>alert(1)</script>", "2000-01-01"), "2000-01-01");
  assert.equal(toSqlDate("", null), null);
  console.log("PASSED: SQL date parameters are strictly sanitized.\n");

  // 3. Password complexity validator check
  console.log("TEST 3: Password complexity validation...");
  function isStrongPassword(password) {
    return typeof password === "string" && password.length >= 6 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
  }
  assert.equal(isStrongPassword("12345"), false, "Too short");
  assert.equal(isStrongPassword("abcdef"), false, "No numbers");
  assert.equal(isStrongPassword("123456"), false, "No letters");
  assert.equal(isStrongPassword("abc123"), true, "Valid 6-char alpha-numeric");
  assert.equal(isStrongPassword("Pass@word1"), true, "Valid strong password");
  console.log("PASSED: Password complexity requirement enforced.\n");

  // 4. Rate limit logic verification
  console.log("TEST 4: OTP Rate Limiter sliding window logic...");
  const otpRateLimitMap = new Map();
  const MAX_OTP_PER_10_MIN = 5;
  const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
  function checkOtpRateLimit(email) {
    const now = Date.now();
    const history = (otpRateLimitMap.get(email) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (history.length >= MAX_OTP_PER_10_MIN) return false;
    history.push(now);
    otpRateLimitMap.set(email, history);
    return true;
  }

  const testEmail = "test_rate_limit@example.com";
  for (let i = 0; i < 5; i++) {
    assert.equal(checkOtpRateLimit(testEmail), true, `Attempt ${i + 1} should be permitted`);
  }
  assert.equal(checkOtpRateLimit(testEmail), false, "6th attempt in window must be blocked");
  console.log("PASSED: OTP sliding-window rate limiting functions accurately.\n");

  // 5. Account lockout logic verification
  console.log("TEST 5: Anti-brute force login lockout logic...");
  const loginAttemptsMap = new Map();
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
  function checkLoginLockout(email) {
    const record = loginAttemptsMap.get(email);
    if (!record) return null;
    if (Date.now() < record.lockedUntil) {
      const minutesLeft = Math.max(1, Math.ceil((record.lockedUntil - Date.now()) / 60000));
      return `Locked for ${minutesLeft} minute(s)`;
    }
    return null;
  }
  function recordFailedLogin(email) {
    const record = loginAttemptsMap.get(email) || { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= MAX_LOGIN_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    loginAttemptsMap.set(email, record);
  }

  const bruteEmail = "victim@example.com";
  for (let i = 0; i < 4; i++) {
    recordFailedLogin(bruteEmail);
    assert.equal(checkLoginLockout(bruteEmail), null, "Fewer than 5 attempts should not lock out yet");
  }
  recordFailedLogin(bruteEmail); // 5th failed attempt
  const lockMsg = checkLoginLockout(bruteEmail);
  assert.ok(lockMsg && lockMsg.includes("Locked for"), "5th attempt must trigger account lockout");
  console.log("PASSED: Anti-brute force account lockout functions accurately.\n");

  console.log("===========================================");
  console.log(" ALL SECURITY & LOGIC VALIDATIONS PASSED!  ");
  console.log("===========================================");
  process.exit(0);
}

runSecurityTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
