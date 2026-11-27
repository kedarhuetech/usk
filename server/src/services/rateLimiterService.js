/**
 * MySQL-Backed Persistent Rate Limiting & Abuse Prevention Service
 * 
 * Provides:
 * 1. Account-level failure tracking (anti-brute-force).
 * 2. IP-level failure tracking (anti-credential stuffing across multiple accounts).
 * 3. OTP generation and password-reset rate limits.
 * 4. Atomic MySQL updates with fail-closed semantics across server restarts/clusters.
 * 5. Sanitized client IP extraction obeying Express proxy trust configuration.
 * 6. Non-blocking, bounded-batch cleanup routines for expired security records.
 */

import { pool } from "../db/mysql.js";

// Default rate-limiting configuration
export const RATE_LIMIT_CONFIG = {
  // Login by email
  LOGIN_EMAIL_MAX_ATTEMPTS: 5,
  LOGIN_EMAIL_LOCKOUT_MS: 15 * 60 * 1000, // 15 minutes
  LOGIN_EMAIL_WINDOW_MS: 60 * 60 * 1000,  // 1 hour window

  // Login by IP (across any accounts)
  LOGIN_IP_MAX_ATTEMPTS: 25,
  LOGIN_IP_LOCKOUT_MS: 15 * 60 * 1000,    // 15 minutes
  LOGIN_IP_WINDOW_MS: 60 * 60 * 1000,     // 1 hour window

  // OTP registration
  OTP_EMAIL_MAX_ATTEMPTS: 5,
  OTP_EMAIL_WINDOW_MS: 10 * 60 * 1000,    // 10 minutes
  OTP_IP_MAX_ATTEMPTS: 15,
  OTP_IP_WINDOW_MS: 10 * 60 * 1000,       // 10 minutes

  // Forgot password OTP
  FORGOT_EMAIL_MAX_ATTEMPTS: 3,
  FORGOT_EMAIL_COOLDOWN_MS: 45 * 1000,    // 45 seconds between requests
  FORGOT_EMAIL_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  FORGOT_IP_MAX_ATTEMPTS: 15,
  FORGOT_IP_WINDOW_MS: 10 * 60 * 1000,    // 10 minutes
};

/**
 * Resolves the client IP address strictly respecting Express proxy trust settings.
 * Client-supplied headers like X-Forwarded-For are NEVER trusted unless proxy trust is configured.
 */
export function getClientIp(req) {
  if (!req) return "127.0.0.1";

  // Check Express trust proxy setting on the app
  const trustProxy = req.app?.get?.("trust proxy");
  if (trustProxy) {
    const forwarded = req.headers?.["x-forwarded-for"];
    if (forwarded) {
      const clientIp = String(forwarded).split(",")[0].trim();
      if (clientIp) {
        return normalizeIp(clientIp);
      }
    }
  }

  // Direct socket or fallback
  const directIp = req.ip || req.socket?.remoteAddress || "127.0.0.1";
  return normalizeIp(directIp);
}

function normalizeIp(ip) {
  const clean = String(ip || "").trim();
  if (clean.startsWith("::ffff:")) {
    return clean.substring(7);
  }
  return clean || "127.0.0.1";
}

/**
 * Checks whether an attempt key is currently locked out or throttled.
 * Returns { allowed: true } or { allowed: false, message: string, retryAfterSeconds: number }.
 * Throws on database failure (strict fail-closed).
 */
export async function checkRateLimit(attemptKey) {
  if (!attemptKey) return { allowed: true };

  try {
    const [rows] = await pool.query(
      `SELECT attempt_key, attempt_count, locked_until, last_attempt_at
       FROM login_attempts
       WHERE attempt_key = ?
       LIMIT 1`,
      [attemptKey]
    );

    if (rows.length === 0) {
      return { allowed: true };
    }

    const record = rows[0];
    const now = Date.now();

    // Check active lockout
    if (record.locked_until) {
      const lockedUntilMs = new Date(record.locked_until).getTime();
      if (now < lockedUntilMs) {
        const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilMs - now) / 1000));
        const minutesLeft = Math.max(1, Math.ceil(retryAfterSeconds / 60));
        return {
          allowed: false,
          retryAfterSeconds,
          message: `Too many attempts. Account temporarily locked for security. Please try again in ${minutesLeft} minute(s).`,
        };
      }
    }

    return { allowed: true };
  } catch (err) {
    console.error("[RateLimiter] Database error during rate limit check:", err.message);
    // Strict fail-closed: never silently allow when persistence check fails
    throw err;
  }
}

/**
 * Atomically records a failed attempt for an attempt key and applies lockout if threshold exceeded.
 * Uses a single atomic INSERT ... ON DUPLICATE KEY UPDATE to eliminate concurrency races.
 * Parameterized and fail-closed.
 */
export async function recordFailedAttempt({
  attemptKey,
  attemptType = "login",
  maxAttempts = RATE_LIMIT_CONFIG.LOGIN_EMAIL_MAX_ATTEMPTS,
  lockoutDurationMs = RATE_LIMIT_CONFIG.LOGIN_EMAIL_LOCKOUT_MS,
  windowMs = RATE_LIMIT_CONFIG.LOGIN_EMAIL_WINDOW_MS,
}) {
  if (!attemptKey) return;

  const windowSec = Math.max(1, Math.floor(windowMs / 1000));
  const lockoutSec = Math.max(1, Math.floor(lockoutDurationMs / 1000));

  try {
    const [res] = await pool.query(
      `INSERT INTO login_attempts (
         attempt_key,
         attempt_type,
         attempt_count,
         first_attempt_at,
         last_attempt_at,
         locked_until
       ) VALUES (
         ?, ?, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
       )
       ON DUPLICATE KEY UPDATE
         first_attempt_at = IF(
           last_attempt_at < NOW(3) - INTERVAL ? SECOND OR (locked_until IS NOT NULL AND locked_until <= NOW(3)),
           CURRENT_TIMESTAMP(3),
           first_attempt_at
         ),
         locked_until = IF(
           last_attempt_at < NOW(3) - INTERVAL ? SECOND OR (locked_until IS NOT NULL AND locked_until <= NOW(3)),
           NULL,
           IF(attempt_count + 1 >= ?, NOW(3) + INTERVAL ? SECOND, locked_until)
         ),
         attempt_count = IF(
           last_attempt_at < NOW(3) - INTERVAL ? SECOND OR (locked_until IS NOT NULL AND locked_until <= NOW(3)),
           1,
           attempt_count + 1
         ),
         last_attempt_at = CURRENT_TIMESTAMP(3)`,
      [
        attemptKey,
        attemptType,
        windowSec,
        windowSec,
        maxAttempts,
        lockoutSec,
        windowSec,
      ]
    );

    return { success: true, affectedRows: res?.affectedRows ?? 1 };
  } catch (err) {
    console.error("[RateLimiter] Database error recording failed attempt:", err.message);
    throw err;
  }
}

/**
 * Clears the rate limit tracking for an attempt key (e.g. after successful login).
 */
export async function clearRateLimit(attemptKey) {
  if (!attemptKey) return;

  try {
    await pool.query("DELETE FROM login_attempts WHERE attempt_key = ?", [attemptKey]);
  } catch (err) {
    console.error("[RateLimiter] Database error clearing rate limit:", err.message);
    throw err;
  }
}

/**
 * Checks and records an OTP request with rate limiting and cooldown.
 * Returns { allowed: true } or { allowed: false, message: string }.
 */
export async function checkAndRecordOtpRequest({
  emailKey,
  ipKey,
  maxEmailAttempts = RATE_LIMIT_CONFIG.OTP_EMAIL_MAX_ATTEMPTS,
  maxIpAttempts = RATE_LIMIT_CONFIG.OTP_IP_MAX_ATTEMPTS,
  windowMs = RATE_LIMIT_CONFIG.OTP_EMAIL_WINDOW_MS,
  cooldownMs = 0,
}) {
  const now = Date.now();

  try {
    // 1. Check IP-level abuse
    if (ipKey) {
      const [ipRows] = await pool.query(
        "SELECT attempt_count, last_attempt_at FROM login_attempts WHERE attempt_key = ? LIMIT 1",
        [ipKey]
      );
      if (ipRows.length > 0) {
        const ipRec = ipRows[0];
        const lastMs = new Date(ipRec.last_attempt_at).getTime();
        if (now - lastMs < windowMs && ipRec.attempt_count >= maxIpAttempts) {
          return {
            allowed: false,
            message: "Too many verification requests from this network. Please try again later.",
          };
        }
      }
    }

    // 2. Check Account-level abuse
    if (emailKey) {
      const [emailRows] = await pool.query(
        "SELECT attempt_count, last_attempt_at FROM login_attempts WHERE attempt_key = ? LIMIT 1",
        [emailKey]
      );
      if (emailRows.length > 0) {
        const emailRec = emailRows[0];
        const lastMs = new Date(emailRec.last_attempt_at).getTime();

        // Check cooldown between requests
        if (cooldownMs > 0 && now - lastMs < cooldownMs) {
          const waitSec = Math.ceil((cooldownMs - (now - lastMs)) / 1000);
          return {
            allowed: false,
            message: `Please wait ${waitSec}s before requesting another verification code.`,
          };
        }

        // Check window attempts
        if (now - lastMs < windowMs && emailRec.attempt_count >= maxEmailAttempts) {
          return {
            allowed: false,
            message: "Too many verification code requests. Please wait 10 minutes before trying again.",
          };
        }
      }
    }

    // 3. Atomically record the attempt for both keys
    if (emailKey) {
      await pool.query(
        `INSERT INTO login_attempts (attempt_key, attempt_type, attempt_count, first_attempt_at, last_attempt_at, locked_until)
         VALUES (?, 'otp', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
         ON DUPLICATE KEY UPDATE
           attempt_count = IF(last_attempt_at < NOW(3) - INTERVAL ? SECOND, 1, attempt_count + 1),
           last_attempt_at = CURRENT_TIMESTAMP(3)`,
        [emailKey, Math.floor(windowMs / 1000)]
      );
    }

    if (ipKey) {
      await pool.query(
        `INSERT INTO login_attempts (attempt_key, attempt_type, attempt_count, first_attempt_at, last_attempt_at, locked_until)
         VALUES (?, 'otp_ip', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
         ON DUPLICATE KEY UPDATE
           attempt_count = IF(last_attempt_at < NOW(3) - INTERVAL ? SECOND, 1, attempt_count + 1),
           last_attempt_at = CURRENT_TIMESTAMP(3)`,
        [ipKey, Math.floor(windowMs / 1000)]
      );
    }

    return { allowed: true };
  } catch (err) {
    console.error("[RateLimiter] Database error during OTP rate limit check:", err.message);
    throw err;
  }
}

/**
 * Safe bounded-batch cleanup of expired attempts and stale lockouts.
 * Deletes rows in batches of at most batchSize (default 1000) to prevent lock contention.
 */
export async function cleanupExpiredLoginAttempts({ batchSize = 1000 } = {}) {
  try {
    const limit = Math.max(1, Math.min(10000, Number(batchSize) || 1000));
    const [res] = await pool.query(
      `DELETE FROM login_attempts 
       WHERE (locked_until IS NOT NULL AND locked_until < NOW(3) - INTERVAL 1 HOUR)
          OR (locked_until IS NULL AND last_attempt_at < NOW(3) - INTERVAL 24 HOUR)
       LIMIT ?`,
      [limit]
    );
    return { success: true, cleanedCount: res?.affectedRows || 0 };
  } catch (err) {
    console.warn("[RateLimiter] Warning during attempt cleanup:", err.message);
    return { success: false, cleanedCount: 0, error: err.message };
  }
}

/**
 * Safe bounded-batch cleanup of expired revoked tokens.
 * Only deletes tokens whose expires_at is strictly in the past (UTC).
 * Still-active revoked tokens are strictly preserved.
 */
export async function cleanupExpiredRevokedTokens({ batchSize = 1000 } = {}) {
  try {
    const limit = Math.max(1, Math.min(10000, Number(batchSize) || 1000));
    const [res] = await pool.query(
      `DELETE FROM revoked_tokens 
       WHERE expires_at < NOW()
       LIMIT ?`,
      [limit]
    );
    return { success: true, cleanedCount: res?.affectedRows || 0 };
  } catch (err) {
    console.warn("[RateLimiter] Warning during revoked tokens cleanup:", err.message);
    return { success: false, cleanedCount: 0, error: err.message };
  }
}

// Background scheduler state (one timer per process, non-overlapping mutex)
let securityCleanupTimer = null;
let isSecurityCleanupRunning = false;

/**
 * Starts the periodic security table cleanup scheduler.
 * Guaranteed to create at most one timer per process.
 * Non-blocking and catches errors so server cannot crash.
 */
export function startSecurityCleanupScheduler({ intervalMs = 60 * 60 * 1000 } = {}) {
  if (securityCleanupTimer) {
    return securityCleanupTimer;
  }

  securityCleanupTimer = setInterval(async () => {
    if (isSecurityCleanupRunning) return;
    isSecurityCleanupRunning = true;

    try {
      await cleanupExpiredLoginAttempts();
      await cleanupExpiredRevokedTokens();
    } catch (err) {
      console.warn("[SecurityCleanup] Background routine notice:", err.message);
    } finally {
      isSecurityCleanupRunning = false;
    }
  }, intervalMs);

  // Unref timer so it does not prevent process exit during tests or shutdown
  if (securityCleanupTimer && typeof securityCleanupTimer.unref === "function") {
    securityCleanupTimer.unref();
  }

  return securityCleanupTimer;
}

/**
 * Stops the security table cleanup scheduler (useful during test teardown).
 */
export function stopSecurityCleanupScheduler() {
  if (securityCleanupTimer) {
    clearInterval(securityCleanupTimer);
    securityCleanupTimer = null;
    isSecurityCleanupRunning = false;
  }
}
