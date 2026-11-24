/**
 * JWT Authentication & Multi-Tenancy Middleware
 *
 * Verifies JWT bearer tokens and binds the tenant business context (req.businessId)
 * to prevent unauthorized cross-business data access.
 */

import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "usk_super_secret_jwt_key_2026_secured_production";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

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
