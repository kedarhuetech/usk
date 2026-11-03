// Defines backend API routes for marketing studio.
/* global process */
import { Buffer } from "node:buffer";
import express from "express";
import { createImageToLayersDesignPayload } from "../services/imageToLayersService.js";
import {
  ALLOWED_IMAGE_HOSTS,
  getStockMediaProvidersStatus,
  searchStockMedia,
} from "../services/stockMediaService.js";

const router = express.Router();
const CALENDARIFIC_ENDPOINT = "https://calendarific.com/api/v2/holidays";

// Gets calendarific api key.
function getCalendarificApiKey() {
  return process.env.CALENDARIFIC_API_KEY || process.env.VITE_CALENDARIFIC_API_KEY || "";
}

router.get("/calendar-events", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const apiKey = getCalendarificApiKey();

  if (!apiKey) {
    res.json({
      success: true,
      source: "local",
      country: "IN",
      year,
      holidays: [],
      configured: false,
      message: "Calendarific API key is not configured on the backend. Built-in festival calendar active.",
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

router.get("/stock-media/status", (_req, res) => {
  const providers = getStockMediaProvidersStatus();
  res.json({
    success: true,
    providers,
  });
});

router.get("/stock-media", async (req, res) => {
  const { provider, query, page, perPage, orientation, category } = req.query;
  try {
    const result = await searchStockMedia({
      provider,
      query,
      page,
      perPage,
      orientation,
      category,
    });
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "STOCK_MEDIA_SEARCH_FAILED",
      message: error.message || "Unable to search stock media.",
      provider: provider || "pexels",
    });
  }
});

router.get("/stock-media/proxy", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    res.status(400).json({ success: false, message: "Missing url query parameter" });
    return;
  }

  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    res.status(400).json({ success: false, message: "Invalid image URL" });
    return;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_IMAGE_HOSTS.has(hostname)) {
    res.status(403).json({ success: false, message: "Host is not allowed for proxying" });
    return;
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({
        success: false,
        message: `Upstream image fetch failed (${upstream.status})`,
      });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");

    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    res.status(502).json({
      success: false,
      message: error.message || "Failed to fetch image stream",
    });
  }
});

export default router;
