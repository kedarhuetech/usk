/**
 * Business Authentication & Registration API Router
 * 
 * Provides:
 * 1. Email OTP sending and verification via Nodemailer.
 * 2. Unique Business / Tenant ID validation.
 * 3. Secure password hashing with bcryptjs.
 * 4. JWT token generation and authentication.
 * 5. Full multi-tenant isolation.
 */

import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db/mysql.js";
import { sendOtpEmail } from "../services/emailService.js";
import { signAuthToken, requireAuth, revokeToken, invalidateUserSessions } from "../middleware/authMiddleware.js";
import {
  getClientIp,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  checkAndRecordOtpRequest,
  RATE_LIMIT_CONFIG,
} from "../services/rateLimiterService.js";

const router = Router();

// Failed forgot-password OTP attempts map: email -> attempt count
const forgotOtpAttemptsMap = new Map();
const MAX_FORGOT_OTP_ATTEMPTS = 5;

// Failed OTP attempt tracking: email -> attempt count
const otpAttemptsMap = new Map();
const MAX_OTP_ATTEMPTS = 5;

// Email format validator
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

// Business ID slug format validator (3 to 50 lowercase letters, numbers, hyphens, underscores)
function isValidBusinessId(id) {
  return /^[a-z0-9_-]{3,50}$/.test(String(id || "").trim());
}

/**
 * POST /api/auth/register/send-otp
 * Sends a 6-digit verification code to the user's email.
 */
router.post("/register/send-otp", async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email = String(rawEmail).trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    const clientIp = getClientIp(req);
    const otpCheck = await checkAndRecordOtpRequest({
      emailKey: `otp:${email}`,
      ipKey: `otp_ip:${clientIp}`,
      maxEmailAttempts: RATE_LIMIT_CONFIG.OTP_EMAIL_MAX_ATTEMPTS,
      maxIpAttempts: RATE_LIMIT_CONFIG.OTP_IP_MAX_ATTEMPTS,
    });
    if (!otpCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: otpCheck.message,
      });
    }

    // Check if email already registered
    const [existing] = await pool.query(
      "SELECT id, business_id FROM users WHERE LOWER(email) = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered. Please sign in instead.",
        alreadyRegistered: true,
      });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const id = `otp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Invalidate prior pending OTPs for this email
    await pool.query("DELETE FROM email_verifications WHERE LOWER(email) = ?", [email]);

    // Insert new OTP record
    await pool.query(
      `INSERT INTO email_verifications (id, email, otp_code, expires_at, is_verified)
       VALUES (?, ?, ?, ?, 0)`,
      [id, email, otp, expiresAt]
    );

    // Send email
    await sendOtpEmail({ to: email, otp });

    return res.json({
      success: true,
      message: "Verification code sent to your email.",
      email,
      expiresInMinutes: 10,
    });
  } catch (err) {
    console.error("[Auth] Send OTP error:", err);
    return res.status(500).json({ success: false, message: "Failed to send verification code. " + err.message });
  }
});

/**
 * POST /api/auth/register/verify-otp
 * Verifies the OTP entered by the user.
 */
router.post("/register/verify-otp", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and verification code are required." });
    }

    const attempts = (otpAttemptsMap.get(email) || 0) + 1;
    otpAttemptsMap.set(email, attempts);

    if (attempts > MAX_OTP_ATTEMPTS) {
      await pool.query("DELETE FROM email_verifications WHERE LOWER(email) = ?", [email]);
      otpAttemptsMap.delete(email);
      return res.status(429).json({
        success: false,
        message: "Too many incorrect verification attempts. This code has expired. Please request a new code.",
      });
    }

    const [rows] = await pool.query(
      `SELECT id, otp_code, expires_at, is_verified 
       FROM email_verifications 
       WHERE LOWER(email) = ? AND otp_code = ? 
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp]
    );

    if (rows.length === 0) {
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - attempts);
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remaining} attempt(s) remaining.`,
      });
    }

    const verification = rows[0];
    const now = new Date();
    const expiry = new Date(verification.expires_at);

    if (now > expiry) {
      return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new code." });
    }

    // Mark verified
    otpAttemptsMap.delete(email);
    await pool.query("UPDATE email_verifications SET is_verified = 1 WHERE id = ?", [verification.id]);

    return res.json({
      success: true,
      message: "Email verified successfully! You may now complete your business registration.",
      verified: true,
      email,
    });
  } catch (err) {
    console.error("[Auth] Verify OTP error:", err);
    return res.status(500).json({ success: false, message: "Verification failed. " + err.message });
  }
});

/**
 * POST /api/auth/check-business-id
 * Checks whether the desired Business / Tenant ID is unique and available.
 */
router.post("/check-business-id", async (req, res) => {
  try {
    const rawId = req.body?.businessId || req.query?.businessId || "";
    const businessId = String(rawId).trim().toLowerCase();

    if (!isValidBusinessId(businessId)) {
      return res.status(400).json({
        success: false,
        available: false,
        message: "Business ID must be 3-50 characters with lowercase letters, numbers, hyphens, or underscores only.",
      });
    }

    // Prohibited IDs
    const prohibited = ["local-development", "admin", "api", "system", "auth", "null", "undefined"];
    if (prohibited.includes(businessId)) {
      return res.json({ success: true, available: false, message: `'${businessId}' is a reserved identifier.` });
    }

    // Check businesses and users tables
    const [bizMatch] = await pool.query("SELECT id FROM businesses WHERE id = ? LIMIT 1", [businessId]);
    const [userMatch] = await pool.query("SELECT id FROM users WHERE business_id = ? LIMIT 1", [businessId]);

    const available = bizMatch.length === 0 && userMatch.length === 0;

    return res.json({
      success: true,
      businessId,
      available,
      message: available ? "Business ID is available." : "This Business ID is already taken. Please choose another.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/register
 * Completes business registration after email OTP verification.
 */
router.post("/register", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    const rawBusinessId = String(req.body?.businessId || "").trim().toLowerCase();
    const businessName = String(req.body?.businessName || rawBusinessId).trim();
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    // 1. Validations
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Valid email address is required." });
    }

    if (!isValidBusinessId(rawBusinessId)) {
      return res.status(400).json({
        success: false,
        message: "Business ID must be 3-50 characters with lowercase letters, numbers, hyphens, or underscores only.",
      });
    }

    if (password.length < 6 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long and contain both letters and numbers.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    // 2. Verify that email was verified by OTP
    const [verif] = await conn.query(
      `SELECT id FROM email_verifications 
       WHERE LOWER(email) = ? AND (otp_code = ? OR is_verified = 1)
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp]
    );

    if (verif.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Email has not been verified yet. Please request and verify an OTP first.",
      });
    }

    // 3. Check for duplicates
    const [existingUser] = await conn.query("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", [email]);
    if (existingUser.length > 0) {
      return res.status(409).json({ success: false, message: "An account with this email already exists. Please login." });
    }

    const [existingBiz] = await conn.query("SELECT id FROM businesses WHERE id = ? LIMIT 1", [rawBusinessId]);
    if (existingBiz.length > 0) {
      return res.status(409).json({ success: false, message: `Business ID '${rawBusinessId}' is already registered. Please choose another.` });
    }

    // 4. Hash password with bcryptjs
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const profileId = `cp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await conn.beginTransaction();

    // 5. Create business in businesses table
    await conn.query(
      `INSERT INTO businesses (id, name) VALUES (?, ?)`,
      [rawBusinessId, businessName]
    );

    // 6. Create default company profile for tenant
    await conn.query(
      `INSERT INTO company_profiles (business_id, company_name, email)
       VALUES (?, ?, ?)`,
      [rawBusinessId, businessName, email]
    );

    // 7. Create user linked to business
    await conn.query(
      `INSERT INTO users (id, email, password_hash, business_id, role, is_verified)
       VALUES (?, ?, ?, ?, 'owner', 1)`,
      [userId, email, passwordHash, rawBusinessId]
    );

    // 8. Clean up verifications for this email
    await conn.query("DELETE FROM email_verifications WHERE LOWER(email) = ?", [email]);

    await conn.commit();

    // 9. Generate JWT token
    const tokenPayload = {
      userId,
      email,
      businessId: rawBusinessId,
      role: "owner",
      tokenVersion: 1,
    };
    const token = signAuthToken(tokenPayload);

    return res.status(201).json({
      success: true,
      message: "Business registration complete! Welcome to USK.",
      token,
      user: {
        id: userId,
        email,
        businessId: rawBusinessId,
        businessName,
        role: "owner",
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[Auth] Registration error:", err);
    return res.status(500).json({ success: false, message: "Registration failed. " + err.message });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/auth/login
 * Authenticates user and returns JWT token and business tenant context.
 */
router.post("/login", async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email = String(rawEmail).trim().toLowerCase();
    const password = String(req.body?.password || "");
    const clientIp = getClientIp(req);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    // 1. IP-level rate limiting
    const ipCheck = await checkRateLimit(`ip:${clientIp}`);
    if (!ipCheck.allowed) {
      return res.status(429).json({ success: false, message: ipCheck.message });
    }

    // 2. Email-level rate limiting
    const emailCheck = await checkRateLimit(`email:${email}`);
    if (!emailCheck.allowed) {
      return res.status(429).json({ success: false, message: emailCheck.message });
    }

    // Query user by email
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.business_id, u.role, u.is_verified, u.token_version,
              b.name as business_name, cp.company_name
       FROM users u
       LEFT JOIN businesses b ON u.business_id = b.id
       LEFT JOIN company_profiles cp ON u.business_id = cp.business_id
       WHERE LOWER(u.email) = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      await recordFailedAttempt({ attemptKey: `email:${email}`, attemptType: "login" });
      await recordFailedAttempt({
        attemptKey: `ip:${clientIp}`,
        attemptType: "login",
        maxAttempts: RATE_LIMIT_CONFIG.LOGIN_IP_MAX_ATTEMPTS,
        lockoutDurationMs: RATE_LIMIT_CONFIG.LOGIN_IP_LOCKOUT_MS,
      });
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const user = rows[0];

    // Verify password with bcryptjs
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await recordFailedAttempt({ attemptKey: `email:${email}`, attemptType: "login" });
      await recordFailedAttempt({
        attemptKey: `ip:${clientIp}`,
        attemptType: "login",
        maxAttempts: RATE_LIMIT_CONFIG.LOGIN_IP_MAX_ATTEMPTS,
        lockoutDurationMs: RATE_LIMIT_CONFIG.LOGIN_IP_LOCKOUT_MS,
      });
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    // Clear failed login tracking for this email on success
    await clearRateLimit(`email:${email}`);

    const businessId = user.business_id;
    const businessName = user.business_name || user.company_name || businessId;

    // Generate JWT token with tokenVersion
    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      businessId,
      role: user.role,
      tokenVersion: user.token_version || 1,
    });

    return res.json({
      success: true,
      message: `Welcome back, ${businessName}!`,
      token,
      user: {
        id: user.id,
        email: user.email,
        businessId,
        businessName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    return res.status(500).json({ success: false, message: "Login failed. " + err.message });
  }
});

/**
 * GET /api/auth/me
 * Retrieves authenticated user and business profile
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.business_id, u.role, u.created_at,
              b.name as business_name, cp.company_name, cp.phone, cp.gstin, cp.logo_url
       FROM users u
       LEFT JOIN businesses b ON u.business_id = b.id
       LEFT JOIN company_profiles cp ON u.business_id = cp.business_id
       WHERE u.id = ?
       LIMIT 1`,
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const user = rows[0];
    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        businessId: user.business_id,
        businessName: user.business_name || user.company_name || user.business_id,
        role: user.role,
        phone: user.phone || null,
        gstin: user.gstin || null,
        logoUrl: user.logo_url || null,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/logout
 * Persists JWT revocation to database and logs out user session
 */
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const rawToken = req.authToken;
    const jti = req.user?.jti;
    const userId = req.user?.userId;
    const businessId = req.businessId;
    const exp = req.user?.exp;

    await revokeToken({
      token: rawToken,
      jti,
      userId,
      businessId,
      reason: "logout",
      exp,
    });

    return res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    console.error("[Auth] Logout error:", err);
    return res.status(500).json({ success: false, message: "Could not persist logout revocation." });
  }
});

/**
 * POST /api/auth/forgot-password/send-otp
 * Verifies email exists in USK database and sends OTP.
 * If account not found: returns 404 "There is no account for this gmail in USK".
 */
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email = String(rawEmail).trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    // 1. Layered persistent rate limiting (IP and account)
    const clientIp = getClientIp(req);
    const rateCheck = await checkAndRecordOtpRequest({
      emailKey: `forgot_email:${email}`,
      ipKey: `forgot_ip:${clientIp}`,
      maxEmailAttempts: RATE_LIMIT_CONFIG.FORGOT_EMAIL_MAX_ATTEMPTS,
      maxIpAttempts: RATE_LIMIT_CONFIG.FORGOT_IP_MAX_ATTEMPTS,
      cooldownMs: RATE_LIMIT_CONFIG.FORGOT_EMAIL_COOLDOWN_MS,
    });
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, message: rateCheck.message });
    }

    // 2. Check if account exists in USK
    const [userRows] = await pool.query(
      `SELECT u.id, u.email, u.business_id, b.name as business_name, cp.company_name
       FROM users u
       LEFT JOIN businesses b ON u.business_id = b.id
       LEFT JOIN company_profiles cp ON u.business_id = cp.business_id
       WHERE LOWER(u.email) = ?
       LIMIT 1`,
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "There is no account for this gmail in USK",
      });
    }

    const user = userRows[0];
    const businessName = user.business_name || user.company_name || "USK Business";

    // 3. Generate 6-digit OTP code
    const otp = String(crypto.randomInt(100000, 999999));
    const id = `fp_otp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up prior unverified codes for this email
    await pool.query("DELETE FROM email_verifications WHERE LOWER(email) = ? AND is_verified = 0", [email]);

    await pool.query(
      `INSERT INTO email_verifications (id, email, otp_code, expires_at, is_verified)
       VALUES (?, ?, ?, ?, 0)`,
      [id, email, otp, expiresAt]
    );

    await sendOtpEmail({
      to: email,
      otp,
      businessName,
      subject: `${otp} is your USK password reset code`,
    });

    return res.json({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (err) {
    console.error("[Auth] Forgot password send-otp error:", err);
    return res.status(500).json({ success: false, message: "Failed to send reset code: " + err.message });
  }
});

/**
 * POST /api/auth/forgot-password/verify-otp
 * Verifies the 6-digit OTP code and issues a secure single-use reset token.
 */
router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email = String(rawEmail).trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and 6-digit verification code are required." });
    }

    // Check failed attempt rate limiting
    const attempts = (forgotOtpAttemptsMap.get(email) || 0) + 1;
    forgotOtpAttemptsMap.set(email, attempts);

    if (attempts > MAX_FORGOT_OTP_ATTEMPTS) {
      forgotOtpAttemptsMap.delete(email);
      await pool.query("DELETE FROM email_verifications WHERE LOWER(email) = ? AND is_verified = 0", [email]);
      return res.status(429).json({
        success: false,
        message: "Too many incorrect code attempts. Please request a new verification code.",
      });
    }

    const [rows] = await pool.query(
      `SELECT id, otp_code, expires_at, is_verified 
       FROM email_verifications 
       WHERE LOWER(email) = ? AND otp_code = ? AND expires_at > NOW() AND is_verified = 0
       ORDER BY created_at DESC 
       LIMIT 1`,
      [email, otp]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code. Please check your code or request a new one.",
      });
    }

    const verification = rows[0];

    // Mark verification as used / delete it
    await pool.query("DELETE FROM email_verifications WHERE id = ?", [verification.id]);
    forgotOtpAttemptsMap.delete(email);

    // Generate cryptographically secure random reset token (64 hex characters)
    const rawResetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawResetToken).digest("hex");
    const resetId = `reset_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minute token validity

    // Invalidate existing pending tokens for this email
    await pool.query("DELETE FROM password_resets WHERE LOWER(email) = ?", [email]);

    // Store hashed token in password_resets table
    await pool.query(
      `INSERT INTO password_resets (id, email, token_hash, expires_at, is_used)
       VALUES (?, ?, ?, ?, 0)`,
      [resetId, email, tokenHash, expiresAt]
    );

    return res.json({
      success: true,
      message: "Verification successful! You can now set a new password.",
      resetToken: rawResetToken,
    });
  } catch (err) {
    console.error("[Auth] Forgot password verify-otp error:", err);
    return res.status(500).json({ success: false, message: "Verification failed: " + err.message });
  }
});

/**
 * POST /api/auth/forgot-password/reset
 * Resets user password, consumes reset token, increments token_version, and invalidates active sessions.
 */
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email = String(rawEmail).trim().toLowerCase();
    const resetToken = String(req.body?.resetToken || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, reset token, and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    // Verify reset token
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const [tokenRows] = await pool.query(
      `SELECT id, email, expires_at, is_used 
       FROM password_resets 
       WHERE LOWER(email) = ? AND token_hash = ? AND expires_at > NOW() AND is_used = 0
       LIMIT 1`,
      [email, tokenHash]
    );

    if (tokenRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid, expired, or already used reset session. Please request a new verification code.",
      });
    }

    const resetRecord = tokenRows[0];

    // Mark token as used immediately (single-use lifecycle)
    await pool.query("UPDATE password_resets SET is_used = 1 WHERE id = ?", [resetRecord.id]);

    // Check user exists
    const [userRows] = await pool.query(
      "SELECT id, business_id FROM users WHERE LOWER(email) = ? LIMIT 1",
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "There is no account for this gmail in USK" });
    }

    const user = userRows[0];

    // Hash new password with bcrypt
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password and increment token_version for session invalidation
    await pool.query(
      `UPDATE users 
       SET password_hash = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP(3) 
       WHERE id = ?`,
      [passwordHash, user.id]
    );

    // Invalidate active user sessions
    await invalidateUserSessions(user.id);

    // Clear failed login attempts / lockouts for this email
    await clearRateLimit(`email:${email}`);

    // Clean up used reset records for this email
    await pool.query("DELETE FROM password_resets WHERE LOWER(email) = ?", [email]);

    return res.json({
      success: true,
      message: "Password reset successful! Please sign in with your new password.",
    });
  } catch (err) {
    console.error("[Auth] Forgot password reset error:", err);
    return res.status(500).json({ success: false, message: "Failed to reset password: " + err.message });
  }
});

export default router;
