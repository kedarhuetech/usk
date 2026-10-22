/* global process */
import express from "express";
import { createImageToLayersDesignPayload } from "../services/imageToLayersService.js";

const router = express.Router();
const CALENDARIFIC_ENDPOINT = "https://calendarific.com/api/v2/holidays";

function getCalendarificApiKey() {
  return process.env.CALENDARIFIC_API_KEY || process.env.VITE_CALENDARIFIC_API_KEY || "";
}

router.get("/calendar-events", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const apiKey = getCalendarificApiKey();

  if (!apiKey) {
    res.status(503).json({
      success: false,
      code: "CALENDARIFIC_KEY_MISSING",
      message: "Calendarific API key is not configured on the backend.",
    });
    return;
  }

  try {
    const url = new URL(CALENDARIFIC_ENDPOINT);
    url.search = new URLSearchParams({
      api_key: apiKey,
      country: "IN",
      year: String(year),
    }).toString();

    const response = await fetch(url);
    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.meta?.code !== 200) {
      res.status(response.ok ? 502 : response.status).json({
        success: false,
        code: "CALENDARIFIC_REQUEST_FAILED",
        message: payload?.error?.message || payload?.error?.type || response.statusText || "Calendarific request failed.",
        status: response.status,
        calendarificCode: payload?.meta?.code,
      });
      return;
    }

    res.json({
      success: true,
      source: "calendarific",
      country: "IN",
      year,
      holidays: payload.response?.holidays || [],
    });
  } catch (error) {
    res.status(502).json({
      success: false,
      code: "CALENDARIFIC_NETWORK_ERROR",
      message: error.message || "Unable to reach Calendarific.",
    });
  }
});

router.post("/image-to-layers", express.json({ limit: "14mb" }), async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image?.dataUrl) {
      res.status(400).json({
        success: false,
        code: "IMAGE_REQUIRED",
        message: "Upload an image before converting it to layers.",
      });
      return;
    }

    const result = await createImageToLayersDesignPayload({
      dataUrl: image.dataUrl,
      fileName: image.name,
    });

    if (!result.success) {
      res.status(result.code === "AI_RUNTIME_UNAVAILABLE" ? 503 : 422).json(result);
      return;
    }

    if (!result.layers.length) {
      res.status(422).json({
        success: false,
        code: "NO_USEFUL_LAYERS",
        message: "No meaningful foreground objects were detected in this image.",
      });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.statusCode === 413 ? "IMAGE_TOO_LARGE" : "IMAGE_TO_LAYERS_FAILED",
      message: error.message || "Image to Layers failed.",
    });
  }
});

export default router;
