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
import bcrypt from "bcryptjs";
import { pool } from "../db/mysql.js";
import { sendOtpEmail } from "../services/emailService.js";
import { signAuthToken, requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// Rate limiting map for OTP sending: email -> array of timestamps
const otpRateLimitMap = new Map();
const MAX_OTP_PER_10_MIN = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function checkOtpRateLimit(email) {
  const now = Date.now();
  const history = (otpRateLimitMap.get(email) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (history.length >= MAX_OTP_PER_10_MIN) {
    return false;
  }
  history.push(now);
  otpRateLimitMap.set(email, history);
  return true;
}

// Failed OTP attempt tracking: email -> attempt count
const otpAttemptsMap = new Map();
const MAX_OTP_ATTEMPTS = 5;

// Failed login attempt tracking: email -> { count, lockedUntil }
const loginAttemptsMap = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginLockout(email) {
  const record = loginAttemptsMap.get(email);
  if (!record) return null;
  if (Date.now() < record.lockedUntil) {
    const minutesLeft = Math.max(1, Math.ceil((record.lockedUntil - Date.now()) / 60000));
    return `Too many failed login attempts. Account temporarily locked for security. Please try again in ${minutesLeft} minute(s).`;
  }
  if (Date.now() >= record.lockedUntil) {
    loginAttemptsMap.delete(email);
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

function clearFailedLogin(email) {
  loginAttemptsMap.delete(email);
}

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

    if (!checkOtpRateLimit(email)) {
      return res.status(429).json({
        success: false,
        message: "Too many verification code requests. Please wait a few minutes before trying again.",
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

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const lockoutMsg = checkLoginLockout(email);
    if (lockoutMsg) {
      return res.status(429).json({ success: false, message: lockoutMsg });
    }

    // Query user by email
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.business_id, u.role, u.is_verified,
              b.name as business_name, cp.company_name
       FROM users u
       LEFT JOIN businesses b ON u.business_id = b.id
       LEFT JOIN company_profiles cp ON u.business_id = cp.business_id
       WHERE LOWER(u.email) = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      recordFailedLogin(email);
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const user = rows[0];

    // Verify password with bcryptjs
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      recordFailedLogin(email);
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    clearFailedLogin(email);

    const businessId = user.business_id;
    const businessName = user.business_name || user.company_name || businessId;

    // Generate JWT token
    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      businessId,
      role: user.role,
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
 * Logs out user session
 */
router.post("/logout", (req, res) => {
  return res.json({ success: true, message: "Logged out successfully." });
});

export default router;
