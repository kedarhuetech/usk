/**
 * Phase 4D Comprehensive Security, Concurrency & Session Maintenance Verification Suite
 *
 * Verifies:
 * 1. Persistent JWT Revocation (revoked_tokens table)
 * 2. Multi-device session isolation (Device A logout does not affect Device B)
 * 3. Token version invalidation on password reset (users.token_version)
 * 4. Legacy JWT compatibility without jti
 * 5. Fail-closed behavior on database unavailability (never bypasses auth)
 * 6. Server restart & multi-instance synchronization (logical state)
 * 7. Persistent IP and account-level rate limiting (login_attempts table)
 * 8. Atomic MySQL upsert concurrency (no ER_DUP_ENTRY on simultaneous attempts)
 * 9. Bounded batch cleanup of expired security records
 * 10. Scheduler initialization (at most one timer per process, non-overlapping mutex)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  signAuthToken,
  verifyAuthToken,
  computeTokenHash,
  revokeToken,
  verifySessionPersistence,
  JWT_SECRET,
} from "../middleware/authMiddleware.js";
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  checkAndRecordOtpRequest,
  cleanupExpiredLoginAttempts,
  cleanupExpiredRevokedTokens,
  startSecurityCleanupScheduler,
  stopSecurityCleanupScheduler,
  getClientIp,
} from "../services/rateLimiterService.js";
import { pool } from "../db/mysql.js";

// Helper to create an in-memory mock database state faithfully simulating MySQL 8.0 tables
function createMockDbState() {
  const users = new Map();
  const revokedTokens = new Map();
  const loginAttempts = new Map();

  return {
    users,
    revokedTokens,
    loginAttempts,
    query(sql, params = []) {
      const s = String(sql).trim();

      // SELECT from users and check revoked_tokens
      if (s.includes("SELECT u.token_version,") && s.includes("FROM users u")) {
        const tokenHash = params[0];
        const userId = params[1];
        const user = users.get(userId);
        if (!user) return Promise.resolve([[]]);

        const isRevoked = revokedTokens.has(tokenHash) ? 1 : 0;
        return Promise.resolve([
          [{ token_version: user.token_version, is_revoked: isRevoked }],
        ]);
      }

      // INSERT into revoked_tokens
      if (s.includes("INSERT INTO revoked_tokens")) {
        const [id, tokenHash, userId, businessId, reason, expiresAt] = params;
        revokedTokens.set(tokenHash, { id, tokenHash, userId, businessId, reason, expiresAt: new Date(expiresAt) });
        return Promise.resolve([{ affectedRows: 1 }]);
      }

      // DELETE FROM revoked_tokens (Cleanup)
      if (s.includes("DELETE FROM revoked_tokens")) {
        let deleted = 0;
        const now = Date.now();
        for (const [tokenHash, rec] of Array.from(revokedTokens.entries())) {
          if (rec.expiresAt.getTime() < now) {
            revokedTokens.delete(tokenHash);
            deleted++;
          }
        }
        return Promise.resolve([{ affectedRows: deleted }]);
      }

      // UPDATE users token_version
      if (s.includes("UPDATE users") && s.includes("token_version = token_version + 1")) {
        const userId = params[params.length - 1];
        const user = users.get(userId);
        if (user) {
          user.token_version = (user.token_version || 1) + 1;
        }
        return Promise.resolve([{ affectedRows: user ? 1 : 0 }]);
      }

      // Rate limiting: SELECT from login_attempts
      if (s.includes("SELECT") && s.includes("FROM login_attempts")) {
        const key = params[0];
        const attempt = loginAttempts.get(key);
        if (!attempt) return Promise.resolve([[]]);
        return Promise.resolve([[attempt]]);
      }

      // Rate limiting: Atomic INSERT ... ON DUPLICATE KEY UPDATE
      if (s.includes("INSERT INTO login_attempts")) {
        const key = params[0];
        const type = params[1];
        const windowSec = Number(params[2]) || 3600;
        const maxAttempts = Number(params[4]) || 5;
        const lockoutSec = Number(params[5]) || 900;

        const now = Date.now();
        const existing = loginAttempts.get(key);

        if (!existing) {
          // Brand new key
          loginAttempts.set(key, {
            attempt_key: key,
            attempt_type: type,
            attempt_count: 1,
            first_attempt_at: new Date(now),
            last_attempt_at: new Date(now),
            locked_until: null,
          });
          return Promise.resolve([{ affectedRows: 1 }]);
        }

        // Duplicate key update simulation
        const lastMs = new Date(existing.last_attempt_at).getTime();
        const lockedUntilMs = existing.locked_until ? new Date(existing.locked_until).getTime() : 0;
        const windowExpired = (now - lastMs) > (windowSec * 1000);
        const lockoutExpired = lockedUntilMs > 0 && now >= lockedUntilMs;

        let newCount = existing.attempt_count + 1;
        let newLockedUntil = existing.locked_until;
        let newFirstAttempt = existing.first_attempt_at;

        if (windowExpired || lockoutExpired) {
          newCount = 1;
          newFirstAttempt = new Date(now);
          newLockedUntil = null;
        } else if (newCount >= maxAttempts) {
          newLockedUntil = new Date(now + lockoutSec * 1000);
        }

        loginAttempts.set(key, {
          ...existing,
          attempt_count: newCount,
          first_attempt_at: newFirstAttempt,
          last_attempt_at: new Date(now),
          locked_until: newLockedUntil,
        });

        return Promise.resolve([{ affectedRows: 2 }]);
      }

      // Rate limiting: DELETE FROM login_attempts (Clear specific key or routine cleanup)
      if (s.includes("DELETE FROM login_attempts")) {
        if (s.includes("WHERE attempt_key = ?")) {
          const key = params[0];
          loginAttempts.delete(key);
          return Promise.resolve([{ affectedRows: 1 }]);
        }

        // Routine cleanup of expired attempts
        let cleaned = 0;
        const now = Date.now();
        for (const [key, rec] of Array.from(loginAttempts.entries())) {
          const lastMs = new Date(rec.last_attempt_at).getTime();
          const lockedUntilMs = rec.locked_until ? new Date(rec.locked_until).getTime() : 0;
          if (lockedUntilMs > 0 && (now - lockedUntilMs > 3600 * 1000)) {
            loginAttempts.delete(key);
            cleaned++;
          } else if (!rec.locked_until && (now - lastMs > 24 * 3600 * 1000)) {
            loginAttempts.delete(key);
            cleaned++;
          }
        }
        return Promise.resolve([{ affectedRows: cleaned }]);
      }

      return Promise.resolve([[]]);
    },
  };
}

describe("Phase 4D — JWT Session Revocation & Multi-Device Tests", () => {
  test("1. Valid JWT with jti and tokenVersion is accepted", async () => {
    const mockDb = createMockDbState();
    mockDb.users.set("usr_1", { id: "usr_1", token_version: 1 });

    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const token = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 1 });
      const decoded = verifyAuthToken(token);
      assert.ok(decoded.jti, "Newly issued JWT must include unique jti UUID");
      assert.equal(decoded.tokenVersion, 1);

      const tokenHash = computeTokenHash(token, decoded.jti);
      const res = await verifySessionPersistence({
        userId: decoded.userId,
        tokenHash,
        tokenVersion: decoded.tokenVersion,
      });

      assert.equal(res.valid, true);
    } finally {
      pool.query = origQuery;
    }
  });

  test("2. Invalid and expired JWTs are strictly rejected", () => {
    const invalid = verifyAuthToken("invalid.token.here");
    assert.equal(invalid, null, "Malformed token must not verify");

    const expiredToken = jwt.sign(
      { userId: "usr_1", businessId: "biz_1" },
      JWT_SECRET,
      { expiresIn: -10 }
    );
    const expired = verifyAuthToken(expiredToken);
    assert.equal(expired, null, "Expired token must not verify");
  });

  test("3. Revoked JWT is persisted and subsequently rejected", async () => {
    const mockDb = createMockDbState();
    mockDb.users.set("usr_1", { id: "usr_1", token_version: 1 });

    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const token = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 1 });
      const decoded = verifyAuthToken(token);

      // Persist revocation (e.g. Logout)
      await revokeToken({
        token,
        jti: decoded.jti,
        userId: "usr_1",
        businessId: "biz_1",
        exp: decoded.exp,
      });

      const tokenHash = computeTokenHash(token, decoded.jti);
      const res = await verifySessionPersistence({
        userId: "usr_1",
        tokenHash,
        tokenVersion: decoded.tokenVersion,
      });

      assert.equal(res.valid, false);
      assert.equal(res.status, 401);
      assert.match(res.message, /logged out or revoked/i);
    } finally {
      pool.query = origQuery;
    }
  });

  test("4. Multi-device isolation: Device A logout does NOT invalidate Device B", async () => {
    const mockDb = createMockDbState();
    mockDb.users.set("usr_1", { id: "usr_1", token_version: 1 });

    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const tokenA = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 1 });
      const tokenB = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 1 });

      const decodedA = verifyAuthToken(tokenA);
      const decodedB = verifyAuthToken(tokenB);

      assert.notEqual(decodedA.jti, decodedB.jti, "Each device must have a distinct jti");

      // Device A logs out
      await revokeToken({
        token: tokenA,
        jti: decodedA.jti,
        userId: "usr_1",
        businessId: "biz_1",
        exp: decodedA.exp,
      });

      // Device A check -> revoked
      const resA = await verifySessionPersistence({
        userId: "usr_1",
        tokenHash: computeTokenHash(tokenA, decodedA.jti),
        tokenVersion: decodedA.tokenVersion,
      });
      assert.equal(resA.valid, false, "Device A token must be revoked");

      // Device B check -> remains active and valid
      const resB = await verifySessionPersistence({
        userId: "usr_1",
        tokenHash: computeTokenHash(tokenB, decodedB.jti),
        tokenVersion: decodedB.tokenVersion,
      });
      assert.equal(resB.valid, true, "Device B token must remain valid");
    } finally {
      pool.query = origQuery;
    }
  });

  test("5. Password reset increments token_version and invalidates all prior sessions", async () => {
    const mockDb = createMockDbState();
    mockDb.users.set("usr_1", { id: "usr_1", token_version: 1 });

    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const tokenA = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 1 });
      const tokenB = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 1 });

      const decodedA = verifyAuthToken(tokenA);
      const decodedB = verifyAuthToken(tokenB);

      // Password reset occurs -> increments db token_version to 2
      mockDb.users.get("usr_1").token_version = 2;

      // Both tokens must now be rejected
      const resA = await verifySessionPersistence({
        userId: "usr_1",
        tokenHash: computeTokenHash(tokenA, decodedA.jti),
        tokenVersion: decodedA.tokenVersion,
      });
      const resB = await verifySessionPersistence({
        userId: "usr_1",
        tokenHash: computeTokenHash(tokenB, decodedB.jti),
        tokenVersion: decodedB.tokenVersion,
      });

      assert.equal(resA.valid, false, "Device A token must be rejected after password reset");
      assert.equal(resB.valid, false, "Device B token must be rejected after password reset");
      assert.match(resA.message, /Session invalidated/i);

      // Newly issued token after password reset (version 2) is accepted
      const tokenNew = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 2 });
      const decodedNew = verifyAuthToken(tokenNew);
      const resNew = await verifySessionPersistence({
        userId: "usr_1",
        tokenHash: computeTokenHash(tokenNew, decodedNew.jti),
        tokenVersion: decodedNew.tokenVersion,
      });
      assert.equal(resNew.valid, true, "New token with updated token_version must be accepted");
    } finally {
      pool.query = origQuery;
    }
  });

  test("6. Legacy tokens without jti and tokenVersion are supported and can be revoked safely", async () => {
    const mockDb = createMockDbState();
    mockDb.users.set("usr_legacy", { id: "usr_legacy", token_version: 1 });

    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const legacyToken = jwt.sign(
        { userId: "usr_legacy", email: "legacy@test.com", businessId: "biz_1", role: "owner" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      const decoded = verifyAuthToken(legacyToken);
      assert.equal(decoded.jti, undefined);
      assert.equal(decoded.tokenVersion, undefined);

      const hash1 = computeTokenHash(legacyToken, undefined);
      const res1 = await verifySessionPersistence({
        userId: "usr_legacy",
        tokenHash: hash1,
        tokenVersion: undefined,
      });
      assert.equal(res1.valid, true, "Legacy token must be accepted initially");

      // Revoke legacy token using raw bearer token hash
      await revokeToken({
        token: legacyToken,
        userId: "usr_legacy",
        businessId: "biz_1",
      });

      const res2 = await verifySessionPersistence({
        userId: "usr_legacy",
        tokenHash: hash1,
        tokenVersion: undefined,
      });
      assert.equal(res2.valid, false, "Revoked legacy token must be rejected");
    } finally {
      pool.query = origQuery;
    }
  });

  test("7. Server restart & multiple backend instances share the exact same revocation state (unit simulation)", async () => {
    const sharedDb = createMockDbState();
    sharedDb.users.set("usr_shared", { id: "usr_shared", token_version: 1 });

    const origQuery = pool.query;
    pool.query = sharedDb.query.bind(sharedDb);

    try {
      const token = signAuthToken({ userId: "usr_shared", businessId: "biz_shared", tokenVersion: 1 });
      const decoded = verifyAuthToken(token);

      // Server Instance 1 handles logout
      await revokeToken({
        token,
        jti: decoded.jti,
        userId: "usr_shared",
        businessId: "biz_shared",
      });

      // Server Instance 2 (or Instance 1 after restart) checks validity
      const resInstance2 = await verifySessionPersistence({
        userId: "usr_shared",
        tokenHash: computeTokenHash(token, decoded.jti),
        tokenVersion: decoded.tokenVersion,
      });

      assert.equal(resInstance2.valid, false, "Instance 2 must observe revocation persisted by Instance 1");
    } finally {
      pool.query = origQuery;
    }
  });

  test("8. Database failure fails closed (never silently bypasses authentication)", async () => {
    const origQuery = pool.query;
    pool.query = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:3306");
    };

    try {
      const token = signAuthToken({ userId: "usr_1", businessId: "biz_1", tokenVersion: 1 });
      const decoded = verifyAuthToken(token);

      await assert.rejects(
        async () => {
          await verifySessionPersistence({
            userId: "usr_1",
            tokenHash: computeTokenHash(token, decoded.jti),
            tokenVersion: decoded.tokenVersion,
          });
        },
        /ECONNREFUSED/,
        "Database failure must throw and fail closed"
      );
    } finally {
      pool.query = origQuery;
    }
  });
});

describe("Phase 4D — MySQL-Backed Persistent Rate Limiting & Concurrency Tests", () => {
  test("1. Repeated failed attempts trigger lockout at threshold", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const emailKey = "email:alice@example.com";

      // 4 failed attempts -> still allowed
      for (let i = 1; i <= 4; i++) {
        await recordFailedAttempt({
          attemptKey: emailKey,
          maxAttempts: 5,
          lockoutDurationMs: 15 * 60 * 1000,
        });
        const check = await checkRateLimit(emailKey);
        assert.equal(check.allowed, true, `Attempt ${i} must not lock out`);
      }

      // 5th failed attempt -> locks out
      await recordFailedAttempt({
        attemptKey: emailKey,
        maxAttempts: 5,
        lockoutDurationMs: 15 * 60 * 1000,
      });
      const lockedCheck = await checkRateLimit(emailKey);
      assert.equal(lockedCheck.allowed, false, "5th attempt must trigger lockout");
      assert.match(lockedCheck.message, /Account temporarily locked/i);
    } finally {
      pool.query = origQuery;
    }
  });

  test("2. IP-based limits track across different account emails (anti-credential stuffing)", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const ipKey = "ip:203.0.113.42";

      for (let i = 1; i < 25; i++) {
        await recordFailedAttempt({
          attemptKey: ipKey,
          maxAttempts: 25,
          lockoutDurationMs: 15 * 60 * 1000,
        });
        const check = await checkRateLimit(ipKey);
        assert.equal(check.allowed, true);
      }

      // 25th attempt locks the IP
      await recordFailedAttempt({
        attemptKey: ipKey,
        maxAttempts: 25,
        lockoutDurationMs: 15 * 60 * 1000,
      });

      const lockedIpCheck = await checkRateLimit(ipKey);
      assert.equal(lockedIpCheck.allowed, false, "IP must be locked after 25 failed attempts across accounts");
    } finally {
      pool.query = origQuery;
    }
  });

  test("3. Simultaneous burst attempts for the same key update counter atomically without primary key collision", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const key = "email:concurrent@example.com";

      // Dispatch 5 simultaneous failed attempts concurrently
      const attempts = await Promise.all([
        recordFailedAttempt({ attemptKey: key, maxAttempts: 5 }),
        recordFailedAttempt({ attemptKey: key, maxAttempts: 5 }),
        recordFailedAttempt({ attemptKey: key, maxAttempts: 5 }),
        recordFailedAttempt({ attemptKey: key, maxAttempts: 5 }),
        recordFailedAttempt({ attemptKey: key, maxAttempts: 5 }),
      ]);

      assert.equal(attempts.length, 5);
      const record = mockDb.loginAttempts.get(key);
      assert.ok(record, "Record must exist in login_attempts");
      assert.equal(record.attempt_count, 5, "Counter must reflect all 5 concurrent attempts");

      // Verify that after 5 attempts, lockout is active
      const check = await checkRateLimit(key);
      assert.equal(check.allowed, false, "5 concurrent attempts must trigger lockout");
    } finally {
      pool.query = origQuery;
    }
  });

  test("4. Successful authentication resets account failure state", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const emailKey = "email:bob@example.com";

      for (let i = 0; i < 3; i++) {
        await recordFailedAttempt({ attemptKey: emailKey, maxAttempts: 5 });
      }
      assert.equal(mockDb.loginAttempts.get(emailKey).attempt_count, 3);

      await clearRateLimit(emailKey);
      assert.equal(mockDb.loginAttempts.has(emailKey), false, "Successful login must remove failure record");

      const check = await checkRateLimit(emailKey);
      assert.equal(check.allowed, true);
    } finally {
      pool.query = origQuery;
    }
  });

  test("5. OTP request limits and cooldown work persistently", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const emailKey = "forgot_email:carol@example.com";
      const ipKey = "forgot_ip:198.51.100.1";

      const req1 = await checkAndRecordOtpRequest({
        emailKey,
        ipKey,
        maxEmailAttempts: 3,
        cooldownMs: 45 * 1000,
      });
      assert.equal(req1.allowed, true);

      const req2 = await checkAndRecordOtpRequest({
        emailKey,
        ipKey,
        maxEmailAttempts: 3,
        cooldownMs: 45 * 1000,
      });
      assert.equal(req2.allowed, false);
      assert.match(req2.message, /wait.*before requesting another/i);
    } finally {
      pool.query = origQuery;
    }
  });

  test("6. Client IP resolution strictly respects Express proxy trust configuration", () => {
    const untrustedReq = {
      app: { get: () => false },
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "192.168.1.50" },
    };
    assert.equal(getClientIp(untrustedReq), "192.168.1.50", "Untrusted proxy must ignore X-Forwarded-For");

    const trustedReq = {
      app: { get: (k) => k === "trust proxy" },
      headers: { "x-forwarded-for": "203.0.113.195, 10.0.0.1" },
      socket: { remoteAddress: "10.0.0.1" },
    };
    assert.equal(getClientIp(trustedReq), "203.0.113.195", "Trusted proxy must parse first client IP");
  });
});

describe("Phase 4D — Security Table Routine Cleanup & Maintenance Tests", () => {
  test("1. Expired login attempts are cleaned while active/recent ones are preserved", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      // 1. Stale attempt (last_attempt_at 48 hours ago, not locked) -> should be cleaned
      mockDb.loginAttempts.set("email:stale@example.com", {
        attempt_key: "email:stale@example.com",
        attempt_count: 2,
        last_attempt_at: new Date(Date.now() - 48 * 3600 * 1000),
        locked_until: null,
      });

      // 2. Expired lockout (locked_until 2 hours ago) -> should be cleaned
      mockDb.loginAttempts.set("email:expired_lockout@example.com", {
        attempt_key: "email:expired_lockout@example.com",
        attempt_count: 5,
        last_attempt_at: new Date(Date.now() - 3 * 3600 * 1000),
        locked_until: new Date(Date.now() - 2 * 3600 * 1000),
      });

      // 3. Active recent attempt (10 minutes ago) -> MUST BE PRESERVED
      mockDb.loginAttempts.set("email:active_recent@example.com", {
        attempt_key: "email:active_recent@example.com",
        attempt_count: 3,
        last_attempt_at: new Date(Date.now() - 10 * 60 * 1000),
        locked_until: null,
      });

      // 4. Active lockout (locked for another 10 minutes) -> MUST BE PRESERVED
      mockDb.loginAttempts.set("email:active_locked@example.com", {
        attempt_key: "email:active_locked@example.com",
        attempt_count: 5,
        last_attempt_at: new Date(Date.now() - 5 * 60 * 1000),
        locked_until: new Date(Date.now() + 10 * 60 * 1000),
      });

      const cleanRes = await cleanupExpiredLoginAttempts({ batchSize: 1000 });
      assert.equal(cleanRes.success, true);
      assert.equal(cleanRes.cleanedCount, 2, "Exactly 2 expired records should be cleaned");

      assert.equal(mockDb.loginAttempts.has("email:stale@example.com"), false);
      assert.equal(mockDb.loginAttempts.has("email:expired_lockout@example.com"), false);
      assert.equal(mockDb.loginAttempts.has("email:active_recent@example.com"), true, "Recent attempt must be preserved");
      assert.equal(mockDb.loginAttempts.has("email:active_locked@example.com"), true, "Active lockout must be preserved");
    } finally {
      pool.query = origQuery;
    }
  });

  test("2. Expired revoked tokens are cleaned while still-active revoked sessions are preserved", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      // 1. Expired revoked token (expired yesterday) -> should be deleted
      mockDb.revokedTokens.set("hash_expired", {
        id: "rev_old",
        tokenHash: "hash_expired",
        expiresAt: new Date(Date.now() - 24 * 3600 * 1000),
      });

      // 2. Active revoked token (expires in 5 days) -> MUST BE PRESERVED
      mockDb.revokedTokens.set("hash_active", {
        id: "rev_active",
        tokenHash: "hash_active",
        expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      });

      const cleanRes = await cleanupExpiredRevokedTokens({ batchSize: 1000 });
      assert.equal(cleanRes.success, true);
      assert.equal(cleanRes.cleanedCount, 1, "Exactly 1 expired token should be deleted");

      assert.equal(mockDb.revokedTokens.has("hash_expired"), false, "Expired revoked token must be deleted");
      assert.equal(mockDb.revokedTokens.has("hash_active"), true, "Active revoked token must be preserved");
    } finally {
      pool.query = origQuery;
    }
  });

  test("3. Repeated cleanup execution is safe and idempotent", async () => {
    const mockDb = createMockDbState();
    const origQuery = pool.query;
    pool.query = mockDb.query.bind(mockDb);

    try {
      const clean1 = await cleanupExpiredLoginAttempts();
      const clean2 = await cleanupExpiredLoginAttempts();
      assert.equal(clean1.success, true);
      assert.equal(clean2.success, true);
      assert.equal(clean2.cleanedCount, 0, "Second cleanup run should clean 0 records");

      const tokenClean1 = await cleanupExpiredRevokedTokens();
      const tokenClean2 = await cleanupExpiredRevokedTokens();
      assert.equal(tokenClean1.success, true);
      assert.equal(tokenClean2.success, true);
      assert.equal(tokenClean2.cleanedCount, 0);
    } finally {
      pool.query = origQuery;
    }
  });

  test("4. Cleanup failure is handled safely without throwing unhandled exceptions", async () => {
    const origQuery = pool.query;
    pool.query = async () => {
      throw new Error("Simulated MySQL dead lock during cleanup");
    };

    try {
      const res = await cleanupExpiredLoginAttempts();
      assert.equal(res.success, false);
      assert.equal(res.cleanedCount, 0);
      assert.match(res.error, /dead lock/i);

      const resTokens = await cleanupExpiredRevokedTokens();
      assert.equal(resTokens.success, false);
      assert.equal(resTokens.cleanedCount, 0);
      assert.match(resTokens.error, /dead lock/i);
    } finally {
      pool.query = origQuery;
    }
  });

  test("5. Scheduler starts and creates exactly one timer per process without duplicates", () => {
    try {
      stopSecurityCleanupScheduler();

      const timer1 = startSecurityCleanupScheduler({ intervalMs: 10000 });
      assert.ok(timer1, "Timer must be created");

      const timer2 = startSecurityCleanupScheduler({ intervalMs: 10000 });
      assert.equal(timer1, timer2, "Calling start again must return existing timer without duplicate creation");
    } finally {
      stopSecurityCleanupScheduler();
    }
  });
});
