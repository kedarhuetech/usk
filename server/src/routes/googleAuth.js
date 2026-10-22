import { Router } from "express";
import { google } from "googleapis";
import googleOAuthClient from "../config/googleOAuth.js";

const router = Router();

// Helper to set OAuth tokens from the current user session
const getAuthenticatedClient = (req) => {
  const tokens = req.session?.googleUser?.tokens;
  if (!tokens) return null;
  googleOAuthClient.setCredentials(tokens);
  return googleOAuthClient;
};

// 1. Google OAuth Initiation
router.get("/google", (_req, res) => {
  const authorizationUrl = googleOAuthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
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
  const { code } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "https://9hdxck8r-5173.inc1.devtunnels.ms/";

  if (!code) {
    return res.redirect(
      `${frontendUrl}/business-growth/google-profile-manager?status=error&message=Authorization+code+missing`,
    );
  }

  try {
    const { tokens } = await googleOAuthClient.getToken(code);
    googleOAuthClient.setCredentials(tokens);

    // 1. User Info
    const oauth2 = google.oauth2({ version: "v2", auth: googleOAuthClient });
    const { data: userInfo } = await oauth2.userinfo.get();

    // 2. Query Google My Business Accounts
    const accountMgmt = google.mybusinessaccountmanagement({
      version: "v1",
      auth: googleOAuthClient,
    });
    const accountsRes = await accountMgmt.accounts.list();
    const accounts = accountsRes.data.accounts || [];

    if (accounts.length === 0) {
      return res.redirect(
        `${frontendUrl}/business-growth/google-profile-manager?status=unverified&email=${encodeURIComponent(
          userInfo.email,
        )}&reason=no_accounts`,
      );
    }

    // 3. Query Google Locations
    const bizInfo = google.mybusinessbusinessinformation({
      version: "v1",
      auth: googleOAuthClient,
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
          userInfo.email,
        )}&reason=not_verified_merchant`,
      );
    }

    // 4. Save to Session
    req.session = req.session || {};
    req.session.googleUser = {
      email: userInfo.email,
      name: userInfo.name,
      businessName: verifiedLoc.title,
      locationId: verifiedLoc.name, // e.g. "locations/12345678"
      isVerified: true,
      tokens,
    };

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
  const sessionUser = req.session?.googleUser;

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
    const locationId = req.session?.googleUser?.locationId;

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
    const locationId = req.session?.googleUser?.locationId;
    const form = req.body;

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

export default router;
