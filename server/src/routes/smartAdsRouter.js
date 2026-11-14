/**
 * Smart Ads API Router (Campaigns & Meta Advertising)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types)
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/smart-ads
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM smart_ads WHERE business_id = ? ORDER BY created_at DESC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        platform: r.platform,
        objective: r.objective || "",
        dailyBudget: parseFloat(r.daily_budget) || 0,
        status: r.status,
        targetAudience: r.target_audience || "",
        startDate: r.start_date,
        endDate: r.end_date,
        impressions: r.impressions,
        clicks: r.clicks,
        spend: parseFloat(r.spend) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/smart-ads
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const campaignId = body.campaignId || `camp_${Date.now()}`;
    const campaignName = (body.campaignName || body.name || "Ad Campaign").trim();
    const platform = body.platform || "meta";
    const objective = body.objective || "AWARENESS";
    const dailyBudget = parseFloat(body.dailyBudget ?? body.budget ?? 0) || 0;
    const status = body.status || "active";
    const targetAudience = body.targetAudience || null;
    const startDate = body.startDate || new Date().toISOString().slice(0, 10);
    const endDate = body.endDate || null;
    const impressions = parseInt(body.impressions ?? 0, 10) || 0;
    const clicks = parseInt(body.clicks ?? 0, 10) || 0;
    const spend = parseFloat(body.spend ?? 0) || 0;

    await pool.query(
      `INSERT INTO smart_ads (
        id, business_id, campaign_id, campaign_name, platform, objective,
        daily_budget, status, target_audience, start_date, end_date,
        impressions, clicks, spend
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        campaign_name = VALUES(campaign_name),
        platform = VALUES(platform),
        objective = VALUES(objective),
        daily_budget = VALUES(daily_budget),
        status = VALUES(status),
        target_audience = VALUES(target_audience),
        start_date = VALUES(start_date),
        end_date = VALUES(end_date),
        impressions = VALUES(impressions),
        clicks = VALUES(clicks),
        spend = VALUES(spend),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, campaignId, campaignName, platform, objective,
        dailyBudget, status, targetAudience, startDate, endDate,
        impressions, clicks, spend
      ]
    );

    return res.json({ success: true, message: "Campaign saved successfully.", data: { id, campaignName } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/smart-ads/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.query(`DELETE FROM smart_ads WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    return res.json({ success: true, message: "Campaign deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

