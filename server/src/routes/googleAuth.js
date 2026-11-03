// Defines backend API routes for google auth.
import crypto from "node:crypto";
import { Router } from "express";
import { google } from "googleapis";
import { createGoogleOAuthClient, getGoogleOAuthConfig } from "../config/googleOAuth.js";

const router = Router();

const GOOGLE_PROFILE_STATE_COOKIE = "usv_google_profile_oauth_state";
const GOOGLE_PROFILE_SESSION_COOKIE = "usv_google_profile_session";
const COOKIE_PATH = "/api/auth/google";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const states = new Map();
const sessions = new Map();

function isSecureRequest(req) {
  return req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function cookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: COOKIE_PATH,
    ...(maxAge ? { maxAge } : {}),
  };
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  const found = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  if (!found) return "";
  return decodeURIComponent(found.trim().slice(name.length + 1));
}

function cleanupExpired(now = Date.now()) {
  for (const [state, record] of states) if (record.expiresAt <= now) states.delete(state);
  for (const [sessionKey, session] of sessions) if (session.expiresAt <= now) sessions.delete(sessionKey);
}

function getGoogleSession(req) {
  cleanupExpired();
  const sessionId = readCookie(req, GOOGLE_PROFILE_SESSION_COOKIE);
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }
  return req.session?.googleUser || null;
}

// Helper to set OAuth tokens from the current user session
const getAuthenticatedClient = (req) => {
  const session = getGoogleSession(req);
  const tokens = session?.tokens;
  if (!tokens) return null;
  const client = createGoogleOAuthClient();
  client.setCredentials(tokens);
  return client;
};

function getFrontendUrl() {
  const candidate = (process.env.FRONTEND_URL || (process.env.CLIENT_ORIGIN || "").split(",")[0] || "http://localhost:5173").trim();
  return candidate.replace(/\/+$/, "");
}

// 1. Google OAuth Initiation
router.get("/google", (req, res) => {
  cleanupExpired();
  const client = createGoogleOAuthClient();
  const state = crypto.randomBytes(32).toString("base64url");
  states.set(state, { expiresAt: Date.now() + OAUTH_STATE_TTL_MS });

  res.cookie(GOOGLE_PROFILE_STATE_COOKIE, state, cookieOptions(req, OAUTH_STATE_TTL_MS));

  const authorizationUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    state,
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/business.manage",
    ],
  });

  res.redirect(authorizationUrl);
});

// 2. Google OAuth Callback (Verifies Business Status)
router.get("/google/callback", async (req, res) => {
  const { code, state, error: oauthError, error_description } = req.query;
  const frontendUrl = getFrontendUrl();
  const cookieState = readCookie(req, GOOGLE_PROFILE_STATE_COOKIE);
  res.clearCookie(GOOGLE_PROFILE_STATE_COOKIE, cookieOptions(req));

  if (oauthError) {
    const message = error_description || oauthError || "Google login was cancelled.";
    return res.redirect(
      `${frontendUrl}/business-growth/google-profile-manager?status=error&message=${encodeURIComponent(message)}`,
    );
  }

  if (state && cookieState && state !== cookieState) {
    return res.redirect(
      `${frontendUrl}/business-growth/google-profile-manager?status=error&message=${encodeURIComponent("Invalid or expired OAuth state.")}`,
    );
  }

  if (!code) {
    return res.redirect(
      `${frontendUrl}/business-growth/google-profile-manager?status=error&message=Authorization+code+missing`,
    );
  }

  try {
    const client = createGoogleOAuthClient();
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);

    // 1. User Info
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // 2. Query Google My Business Accounts
    const accountMgmt = google.mybusinessaccountmanagement({
      version: "v1",
      auth: client,
    });
    const accountsRes = await accountMgmt.accounts.list();
    const accounts = accountsRes.data.accounts || [];

    if (accounts.length === 0) {
      return res.redirect(
        `${frontendUrl}/business-growth/google-profile-manager?status=unverified&email=${encodeURIComponent(
          userInfo.email || "",
        )}&reason=no_accounts`,
      );
    }

    // 3. Query Google Locations
    const bizInfo = google.mybusinessbusinessinformation({
      version: "v1",
      auth: client,
    });
    const locationsRes = await bizInfo.accounts.locations.list({
      parent: accounts[0].name,
      readMask: "name,title,metadata",
    });

    const locations = locationsRes.data.locations || [];
    const verifiedLoc = locations.find(
      (loc) => loc.metadata?.hasVoiceOfMerchant === true,
    );

    if (!verifiedLoc) {
      return res.redirect(
        `${frontendUrl}/business-growth/google-profile-manager?status=unverified&email=${encodeURIComponent(
          userInfo.email || "",
        )}&reason=not_verified_merchant`,
      );
    }

    // 4. Save to Persistent Session Store
    const sessionData = {
      email: userInfo.email,
      name: userInfo.name,
      businessName: verifiedLoc.title,
      locationId: verifiedLoc.name, // e.g. "locations/12345678"
      isVerified: true,
      tokens,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };

    const sessionId = crypto.randomBytes(32).toString("base64url");
    sessions.set(sessionId, sessionData);
    res.cookie(GOOGLE_PROFILE_SESSION_COOKIE, sessionId, cookieOptions(req, SESSION_TTL_MS));

    req.session = req.session || {};
    req.session.googleUser = sessionData;

    return res.redirect(
      `${frontendUrl}/business-growth/google-profile-manager?status=connected`,
    );
  } catch (error) {
    console.error("Google OAuth error:", error);
    return res.redirect(
      `${frontendUrl}/business-growth/google-profile-manager?status=error&message=${encodeURIComponent(
        error.message,
      )}`,
    );
  }
});

// 3. Status Check for Frontend Guard
router.get("/google/verify-status", (req, res) => {
  const sessionUser = getGoogleSession(req);

  if (!sessionUser) {
    return res.json({
      success: true,
      data: { isVerified: false, reason: "disconnected" },
    });
  }

  return res.json({
    success: true,
    data: {
      isVerified: sessionUser.isVerified,
      email: sessionUser.email,
      businessName: sessionUser.businessName,
      locationId: sessionUser.locationId,
    },
  });
});

// 4. GET Live Details Directly from Google API (No Hardcoded Data)
router.get("/google/live-details", async (req, res) => {
  try {
    const authClient = getAuthenticatedClient(req);
    const session = getGoogleSession(req);
    const locationId = session?.locationId;

    if (!authClient || !locationId) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated with Google" });
    }

    const bizInfo = google.mybusinessbusinessinformation({
      version: "v1",
      auth: authClient,
    });
    const result = await bizInfo.locations.get({
      name: locationId,
      readMask:
        "name,title,categories,storefrontAddress,regularHours,phoneNumbers,websiteUri,profile",
    });

    const loc = result.data;
    const periods = loc.regularHours?.periods || [];
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayToGoogle = {
      Mon: "MONDAY",
      Tue: "TUESDAY",
      Wed: "WEDNESDAY",
      Thu: "THURSDAY",
      Fri: "FRIDAY",
      Sat: "SATURDAY",
      Sun: "SUNDAY",
    };

    const businessHours = days.map((day) => {
      const match = periods.find((p) => p.openDay === dayToGoogle[day]);
      if (!match) return { day, open: "", close: "", isClosed: true };
      const pad = (n) => String(n).padStart(2, "0");
      return {
        day,
        open: `${pad(match.openTime?.hours || 0)}:${pad(match.openTime?.minutes || 0)}`,
        close: `${pad(match.closeTime?.hours || 0)}:${pad(match.closeTime?.minutes || 0)}`,
        isClosed: false,
      };
    });

    return res.json({
      success: true,
      data: {
        businessName: loc.title || "",
        primaryCategory: loc.categories?.primaryCategory?.displayName || "",
        openingDate: loc.profile?.openingDate || "",
        phoneNumber: loc.phoneNumbers?.primaryPhone || "",
        website: loc.websiteUri || "",
        address: loc.storefrontAddress
          ? `${loc.storefrontAddress.addressLines?.join(", ") || ""}, ${loc.storefrontAddress.locality || ""}`
          : "",
        description: loc.profile?.description || "",
        businessHours,
      },
    });
  } catch (err) {
    console.error("Failed to read from Google:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. PATCH Updates Directly to Google Business Profile
router.patch("/google/live-details", async (req, res) => {
  try {
    const authClient = getAuthenticatedClient(req);
    const session = getGoogleSession(req);
    const locationId = session?.locationId;
    const form = req.body?.businessDetails || req.body || {};

    if (!authClient || !locationId) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated with Google" });
    }

    const bizInfo = google.mybusinessbusinessinformation({
      version: "v1",
      auth: authClient,
    });

    const dayToGoogle = {
      Mon: "MONDAY",
      Tue: "TUESDAY",
      Wed: "WEDNESDAY",
      Thu: "THURSDAY",
      Fri: "FRIDAY",
      Sat: "SATURDAY",
      Sun: "SUNDAY",
    };

    const periods = (form.businessHours || [])
      .filter((h) => !h.isClosed && h.open && h.close)
      .map((h) => {
        const [openH, openM] = h.open.split(":").map(Number);
        const [closeH, closeM] = h.close.split(":").map(Number);
        return {
          openDay: dayToGoogle[h.day],
          openTime: { hours: openH, minutes: openM },
          closeDay: dayToGoogle[h.day],
          closeTime: { hours: closeH, minutes: closeM },
        };
      });

    await bizInfo.locations.patch({
      name: locationId,
      updateMask:
        "title,profile.description,phoneNumbers.primaryPhone,websiteUri,regularHours",
      requestBody: {
        title: form.businessName,
        profile: { description: form.description },
        phoneNumbers: { primaryPhone: form.phoneNumber },
        websiteUri: form.website,
        regularHours: { periods },
      },
    });

    return res.json({
      success: true,
      message: "Updated on Google Search & Maps",
    });
  } catch (err) {
    console.error("Failed to patch Google:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Disconnect from Google Business Profile
router.post("/google/disconnect", (req, res) => {
  const sessionId = readCookie(req, GOOGLE_PROFILE_SESSION_COOKIE);
  if (sessionId) {
    sessions.delete(sessionId);
  }
  if (req.session) {
    delete req.session.googleUser;
  }
  res.clearCookie(GOOGLE_PROFILE_SESSION_COOKIE, cookieOptions(req));
  return res.json({
    success: true,
    message: "Disconnected from Google Business Profile",
  });
});

export default router;
