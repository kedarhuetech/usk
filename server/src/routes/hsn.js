// Router for HSN & SAC Code lookup, search, and bulk importing.
import { Router } from "express";
import multer from "multer";
import {
  lookupHsnCode,
  searchHsnCodes,
  parseHsnData,
  batchUpsertHsnCodes,
  seedDefaultHsnCodes,
  calculateHsnTax,
  syncInheritedRates,
} from "../services/hsnService.js";

const router = Router();

// Multer configured for spreadsheet / CSV uploads (up to 50MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isSpreadsheet =
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "text/csv" ||
      file.mimetype === "application/csv" ||
      file.mimetype === "text/plain" ||
      /\.(xlsx|xls|csv)$/i.test(file.originalname);

    if (isSpreadsheet) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed."));
    }
  },
});

/**
 * GET /api/hsn/search?q=<query>&type=<HSN|SAC>&limit=20
 * Fast indexed search matching code prefix (q%) or description keyword (%q%).
 */
router.get("/search", async (req, res) => {
  try {
    const { q = "", type = null, limit = 20 } = req.query;
    const results = await searchHsnCodes(q, type, limit);
    return res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error("HSN Search Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to search HSN codes.",
    });
  }
});

/**
 * POST /api/hsn/seed
 * Seeds or re-seeds default HSN/SAC sample codes
 */
router.post("/seed", async (req, res) => {
  try {
    const force = req.query.force === "true" || req.body?.force === true;
    const result = await seedDefaultHsnCodes(force);
    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("HSN Seed Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to seed HSN codes.",
    });
  }
});

/**
 * POST /api/hsn/import
 * Protected endpoint accepting multipart/form-data master file uploads (.xlsx, .xls, .csv).
 */
router.post("/import", upload.single("file"), async (req, res) => {
  const startTime = Date.now();
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "No file provided. Please upload an Excel (.xlsx/.xls) or CSV file.",
      });
    }

    const records = parseHsnData(req.file.buffer);

    if (!records || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid HSN/SAC records could be extracted from the file.",
      });
    }

    const upsertedCount = await batchUpsertHsnCodes(records);
    const durationMs = Date.now() - startTime;

    return res.json({
      success: true,
      message: `Successfully imported ${upsertedCount} HSN/SAC codes in ${(durationMs / 1000).toFixed(2)}s.`,
      count: upsertedCount,
      durationMs,
    });
  } catch (error) {
    console.error("HSN Import Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to import HSN file.",
    });
  }
});

/**
 * GET /api/hsn/:code
 * Exact lookup returning { valid: true, data: { code, description, type, gst_rate }, chapterContext }
 * Returns 404 { valid: false, message: "Code not found" } if missing.
 */
router.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const result = await lookupHsnCode(code);

    if (!result) {
      return res.status(404).json({
        valid: false,
        message: "Code not found",
      });
    }

    const { chapterContext, ...data } = result;
    return res.json({
      valid: true,
      data,
      chapterContext: chapterContext || null,
    });
  } catch (error) {
    console.error("HSN Lookup Error:", error);
    return res.status(500).json({
      valid: false,
      message: error.message || "Failed to lookup HSN code.",
    });
  }
});

/**
 * POST /api/hsn/calculate-tax
 * Calculates intra-state (CGST + SGST) vs inter-state (IGST) tax and cess breakdown
 * with longest-prefix rate inheritance.
 */
router.post("/calculate-tax", async (req, res) => {
  try {
    const { code, amount = 0, isInterState, partyState, businessState } = req.body || {};
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "HSN or SAC code is required.",
      });
    }

    const calculation = await calculateHsnTax({
      code,
      amount,
      isInterState,
      partyState,
      businessState,
    });

    return res.json(calculation);
  } catch (error) {
    console.error("HSN Tax Calculation Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to calculate tax.",
    });
  }
});

export default router;

