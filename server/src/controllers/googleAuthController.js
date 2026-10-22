import { google } from "googleapis";

// 1. FETCH live data directly from Google Business API
export const getLiveGoogleBusinessDetails = async (req, res) => {
  try {
    const accessToken = req.session?.googleUser?.tokens?.access_token;
    const locationId = req.session?.googleUser?.locationId; // e.g., "locations/12345678"

    if (!accessToken || !locationId) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Google Business account not linked",
        });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const bizInfo = google.mybusinessbusinessinformation({
      version: "v1",
      auth,
    });

    // Call Google to get current live listing details
    const result = await bizInfo.locations.get({
      name: locationId,
      readMask:
        "name,title,categories,storefrontAddress,regularHours,phoneNumbers,websiteUri,profile",
    });

    const loc = result.data;

    // Convert Google's format to our UI format
    const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const periods = loc.regularHours?.periods || [];

    const businessHours = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
      (day) => {
        const match = periods.find(
          (p) => p.openDay === day.toUpperCase() || dayMap[p.openDay] === day,
        );
        if (!match) return { day, open: "", close: "", isClosed: true };

        const pad = (n) => String(n).padStart(2, "0");
        return {
          day,
          open: `${pad(match.openTime?.hours || 0)}:${pad(match.openTime?.minutes || 0)}`,
          close: `${pad(match.closeTime?.hours || 0)}:${pad(match.closeTime?.minutes || 0)}`,
          isClosed: false,
        };
      },
    );

    return res.json({
      success: true,
      data: {
        businessName: loc.title || "",
        primaryCategory: loc.categories?.primaryCategory?.displayName || "",
        phoneNumber: loc.phoneNumbers?.primaryPhone || "",
        website: loc.websiteUri || "",
        address: loc.storefrontAddress
          ? `${loc.storefrontAddress.addressLines?.join(", ")}, ${loc.storefrontAddress.locality}`
          : "",
        description: loc.profile?.description || "",
        businessHours,
      },
    });
  } catch (err) {
    console.error("Failed to fetch from Google:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 2. SAVE changes back to Google Search and Maps
export const updateLiveGoogleBusinessDetails = async (req, res) => {
  try {
    const accessToken = req.session?.googleUser?.tokens?.access_token;
    const locationId = req.session?.googleUser?.locationId;
    const form = req.body;

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const bizInfo = google.mybusinessbusinessinformation({
      version: "v1",
      auth,
    });

    // Format UI hours back into Google's periods format
    const dayToGoogleDay = {
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
          openDay: dayToGoogleDay[h.day],
          openTime: { hours: openH, minutes: openM },
          closeDay: dayToGoogleDay[h.day],
          closeTime: { hours: closeH, minutes: closeM },
        };
      });

    // Send PATCH directly to Google
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
      message: "Successfully updated on Google Search & Maps",
    });
  } catch (err) {
    console.error("Failed to update Google:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
