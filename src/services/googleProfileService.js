import { apiRequest, businessGrowthApi } from "./apiClient.js";
import { googleProfileMock } from "../constants/googleProfileData";

export const googleProfileService = {
  /**
   * Checks if user is authenticated and verified with a Google Business Profile
   * Hits the backend endpoint: GET /api/auth/google/verify-status
   */
  async verifyGoogleBusinessAccount() {
    try {
      const res = await apiRequest("/auth/google/verify-status");
      if (!res || !res.isVerified) {
        return {
          allowed: false,
          reason: res?.reason || "unverified_business",
          email: res?.email || "",
        };
      }
      return {
        allowed: true,
        account: res,
      };
    } catch (error) {
      return {
        allowed: false,
        reason: "disconnected",
        message: error.message,
      };
    }
  },

  /**
   * Fetches live business details directly from Google My Business API
   * Hits the backend endpoint: GET /api/auth/google/live-details
   */
  async getLiveBusinessDetails() {
    try {
      const data = await apiRequest("/auth/google/live-details");
      return data;
    } catch (error) {
      console.warn("Live Google fetch failed, using fallback:", error.message);
      return googleProfileMock.businessDetails;
    }
  },

  /**
   * Sends live updates (hours, phone, desc) directly to Google Search & Maps
   * Hits the backend endpoint: PATCH /api/auth/google/live-details
   */
  async saveBusinessDetails(businessDetails) {
  let googleSynced = true;
  let googleSyncError = null;

  try {
    await apiRequest("/auth/google/live-details", {
      method: "PATCH",
      body: businessDetails,
    });
  } catch (err) {
    googleSynced = false;
    googleSyncError = err.message || "Google update failed.";
    console.warn("Direct Google API patch warning:", googleSyncError);
  }

  const saved = await businessGrowthApi.save(
    "google-profile",
    businessDetails,
  );

  return {
    saved,
    googleSynced,
    googleSyncError,
  };
},

  async getProfile() {
    try {
      const rows = await businessGrowthApi.list("google-profile");
      return rows?.[0] || googleProfileMock;
    } catch {
      return googleProfileMock;
    }
  },

  async postReviewReply(reviewId, replyText) {
    return await businessGrowthApi.save("google-review-replies", {
      reviewId,
      replyText,
      repliedAt: new Date().toISOString(),
    });
  },

  async uploadPhoto(file) {
    return await businessGrowthApi.upload(file, "google-profile-photo");
  },
};
