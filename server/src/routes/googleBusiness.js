import { Router } from "express";
import { google } from "googleapis";
import googleOAuthClient from "../config/googleOAuth.js";

const router = Router();

router.get("/accounts", async (_req, res) => {
  const { access_token, refresh_token } = googleOAuthClient.credentials;

  if (!access_token && !refresh_token) {
    return res.status(401).json({
      success: false,
      message: "Google Business Profile is not connected",
    });
  }

  try {
    const accountManagement = google.mybusinessaccountmanagement({
      version: "v1",
      auth: googleOAuthClient,
    });

    const response = await accountManagement.accounts.list();
    const accounts = (response.data.accounts || []).map((account) => ({
      name: account.name,
      displayName: account.accountName,
      type: account.type,
    }));

    return res.json({
      success: true,
      accounts,
      message: accounts.length
        ? "Google Business Profile accounts fetched successfully"
        : "No Google Business Profile accounts found",
    });
  } catch (error) {
    console.error("Google Business Profile accounts fetch failed", {
      message: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Google Business Profile accounts",
    });
  }
});

export default router;
