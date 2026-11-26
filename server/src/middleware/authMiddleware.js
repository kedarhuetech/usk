/**
 * JWT Authentication & Multi-Tenancy Middleware
 *
 * Verifies JWT bearer tokens and binds the tenant business context (req.businessId)
 * to prevent unauthorized cross-business data access.
 */

import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

export const JWT_SECRET = process.env.JWT_SECRET || "usk_production_jwt_secret_key_99882233_secure_auth_token";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// In-memory revocation tracking: userId -> revokedTimestampMs
const userRevocationMap = new Map();

/**
 * Invalidates all existing active sessions/tokens for a given user.
 */
export function invalidateUserSessions(userId) {
  if (userId) {
    userRevocationMap.set(String(userId), Date.now());
  }
}

/**
 * Checks if a session token is revoked by checking its issued timestamp against user revocation.
 */
export function isUserSessionRevoked(userId, tokenIssuedAtSeconds) {
  if (!userId) return false;
  const revokedAt = userRevocationMap.get(String(userId));
  if (!revokedAt) return false;
  if (tokenIssuedAtSeconds && (tokenIssuedAtSeconds * 1000) <= revokedAt) {
    return true;
  }
  return false;
}

/**
 * Signs a new JWT token for an authenticated user.
 */
export function signAuthToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifies and decodes a JWT token.
 */
export function verifyAuthToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Middleware: Strictly requires a valid JWT token.
 */
export function requireAuth(req, res, next) {
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

  if (decoded.userId && isUserSessionRevoked(decoded.userId, decoded.iat)) {
    return res.status(401).json({
      success: false,
      message: "Session invalidated due to password change. Please sign in again.",
    });
  }

  req.user = decoded;
  req.businessId = decoded.businessId;
  next();
}

/**
 * Middleware: Optionally attaches authenticated user and business if token is present.
 */
export function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization || req.headers["x-access-token"] || "";
  let token = "";

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (token) {
    const decoded = verifyAuthToken(token);
    if (decoded && decoded.businessId) {
      req.user = decoded;
      req.businessId = decoded.businessId;
    }
  }

  next();
}
