/**
 * JWT Authentication & Multi-Tenancy Middleware
 *
 * Verifies JWT bearer tokens, checks persistent database-backed session revocation
 * (token_version and revoked_tokens), and binds tenant business context (req.businessId).
 */

import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "../db/mysql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const rawJwtSecret = String(process.env.JWT_SECRET || "").trim();
if (!rawJwtSecret) {
  throw new Error("FATAL: JWT_SECRET environment variable is required and must be configured.");
}
export const JWT_SECRET = rawJwtSecret;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// In-memory revocation tracking: userId -> revokedTimestampMs (fast process-local tier)
const userRevocationMap = new Map();

/**
 * Computes deterministic SHA-256 hash of a token identifier.
 * Uses jti when available; falls back to raw token for legacy tokens.
 * NEVER stores raw JWT strings in the database.
 */
export function computeTokenHash(token, jti) {
  if (jti) {
    return crypto.createHash("sha256").update(String(jti)).digest("hex");
  }
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Invalidates all active sessions for a given user by incrementing token_version in MySQL.
 */
export async function invalidateUserSessions(userId) {
  if (!userId) return;
  userRevocationMap.set(String(userId), Date.now());
  try {
    await pool.query(
      `UPDATE users 
       SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP(3) 
       WHERE id = ?`,
      [userId]
    );
  } catch (err) {
    console.error("[Auth] Error incrementing token_version in MySQL:", err.message);
    throw err;
  }
}

/**
 * In-memory check: checks if token issued at timestamp was prior to in-memory revocation.
 */
export function isUserSessionRevoked(userId, tokenIssuedAtSeconds) {
  if (!userId) return false;
  const revokedAt = userRevocationMap.get(String(userId));
  if (!revokedAt) return false;
  if (tokenIssuedAtSeconds && tokenIssuedAtSeconds * 1000 <= revokedAt) {
    return true;
  }
  return false;
}

/**
 * Persists token revocation into MySQL revoked_tokens table.
 * Throws on failure to ensure caller does not report false success.
 */
export async function revokeToken({ token, jti, userId, businessId, reason = "logout", exp }) {
  if (!token && !jti) {
    throw new Error("Token or jti identifier is required for revocation.");
  }
  const tokenHash = computeTokenHash(token, jti);
  const id = `rev_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const expiresAt = exp ? new Date(exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO revoked_tokens (id, token_hash, user_id, business_id, revocation_reason, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE revoked_at = CURRENT_TIMESTAMP(3)`,
      [id, tokenHash, userId || "system", businessId || "unknown", reason, expiresAt]
    );
  } catch (err) {
    console.error("[Auth] Failed to persist token revocation into MySQL:", err.message);
    throw err;
  }
}

/**
 * Verifies session validity against MySQL database:
 * 1. Checks if token hash is in revoked_tokens table.
 * 2. Checks if tokenVersion is lower than current user.token_version.
 * 3. Handles legacy tokens (without tokenVersion claim) compatibly.
 * Fail-closed: Throws on database failure.
 */
export async function verifySessionPersistence({ userId, tokenHash, tokenVersion }) {
  if (!userId) {
    return { valid: false, status: 401, message: "Invalid session payload." };
  }

  const [rows] = await pool.query(
    `SELECT u.token_version,
            EXISTS(SELECT 1 FROM revoked_tokens r WHERE r.token_hash = ?) AS is_revoked
     FROM users u
     WHERE u.id = ?
     LIMIT 1`,
    [tokenHash, userId]
  );

  if (rows.length === 0) {
    return { valid: false, status: 401, message: "Invalid session. User account not found." };
  }

  const userRecord = rows[0];
  const dbTokenVersion = Number(userRecord.token_version || 1);
  const isRevoked = Number(userRecord.is_revoked || 0) === 1;

  if (isRevoked) {
    return { valid: false, status: 401, message: "Session has been logged out or revoked. Please sign in again." };
  }

  // Explicit tokenVersion mismatch check
  if (tokenVersion !== undefined && tokenVersion < dbTokenVersion) {
    return {
      valid: false,
      status: 401,
      message: "Session invalidated due to password change or security update. Please sign in again.",
    };
  }

  // Legacy token handling: if user's token_version > 1, account had a password reset -> invalidate legacy token
  if (tokenVersion === undefined && dbTokenVersion > 1) {
    return {
      valid: false,
      status: 401,
      message: "Session invalidated due to password change. Please sign in again.",
    };
  }

  return { valid: true, user: userRecord };
}

/**
 * Signs a new JWT token for an authenticated user, embedding a unique jti and tokenVersion.
 */
export function signAuthToken(payload) {
  const tokenPayload = {
    jti: payload.jti || crypto.randomUUID(),
    tokenVersion: payload.tokenVersion !== undefined ? payload.tokenVersion : 1,
    ...payload,
  };
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifies and decodes a JWT token signature and expiration.
 */
export function verifyAuthToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Middleware: Strictly requires a valid, unrevoked JWT token.
 * Validates cryptographic signature, token_version against MySQL user, and revoked_tokens.
 * Fail-closed: returns 500 if database verification cannot be performed.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers["x-access-token"] || "";
  let token = "";

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please sign in to your business account.",
    });
  }

  const decoded = verifyAuthToken(token);
  if (!decoded || !decoded.businessId) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session. Please sign in again.",
    });
  }

  // In-memory quick check
  if (decoded.userId && isUserSessionRevoked(decoded.userId, decoded.iat)) {
    return res.status(401).json({
      success: false,
      message: "Session invalidated due to password change. Please sign in again.",
    });
  }

  // Persistent MySQL check: revoked_tokens & token_version
  const tokenHash = computeTokenHash(token, decoded.jti);
  try {
    const persistence = await verifySessionPersistence({
      userId: decoded.userId,
      tokenHash,
      tokenVersion: decoded.tokenVersion,
    });

    if (!persistence.valid) {
      return res.status(persistence.status).json({
        success: false,
        message: persistence.message,
      });
    }
  } catch (err) {
    console.error("[Auth] Database error in requireAuth:", err.message);
    // Strict fail-closed: do not silently allow requests when DB verification fails
    return res.status(500).json({
      success: false,
      message: "Authentication service temporarily unavailable.",
    });
  }

  req.user = decoded;
  req.businessId = decoded.businessId;
  req.authToken = token;
  next();
}

/**
 * Middleware: Optionally attaches authenticated user and business if token is valid and unrevoked.
 */
export async function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization || req.headers["x-access-token"] || "";
  let token = "";

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (token) {
    const decoded = verifyAuthToken(token);
    if (decoded && decoded.businessId && !(decoded.userId && isUserSessionRevoked(decoded.userId, decoded.iat))) {
      try {
        const tokenHash = computeTokenHash(token, decoded.jti);
        const persistence = await verifySessionPersistence({
          userId: decoded.userId,
          tokenHash,
          tokenVersion: decoded.tokenVersion,
        });
        if (persistence.valid) {
          req.user = decoded;
          req.businessId = decoded.businessId;
          req.authToken = token;
        }
      } catch {
        // Optional auth: on DB error, do not attach user
      }
    }
  }

  next();
}
