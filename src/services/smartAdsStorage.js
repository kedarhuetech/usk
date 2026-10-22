import { businessGrowthApi } from "./apiClient.js";

function createId() {
  if (globalThis.crypto?.randomUUID) return `smart-ad-${globalThis.crypto.randomUUID()}`;
  return `smart-ad-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeSmartAdsCampaign(campaign = {}) {
  const now = new Date().toISOString();
  const dailyBudget = toNumber(campaign.budget?.dailyBudget);
  const durationDays = Math.max(toNumber(campaign.budget?.durationDays), 0);

  return {
    id: campaign.id || createId(),
    name: campaign.name || "Untitled Campaign",
    objective: campaign.objective || "whatsapp",
    creative: {
      mediaType: campaign.creative?.mediaType || (campaign.creative?.videoName ? "video" : "image"),
      creativeType: campaign.creative?.creativeType || "upload",
      uploadDataUrl: campaign.creative?.uploadDataUrl || "",
      uploadName: campaign.creative?.uploadName || "",
      videoName: campaign.creative?.videoName || "",
      videoMimeType: campaign.creative?.videoMimeType || "",
      videoSize: toNumber(campaign.creative?.videoSize),
      videoDuration: toNumber(campaign.creative?.videoDuration),
      videoWidth: toNumber(campaign.creative?.videoWidth),
      videoHeight: toNumber(campaign.creative?.videoHeight),
      videoNeedsReselect: Boolean(campaign.creative?.mediaType === "video" || campaign.creative?.videoName),
      existingVideoId: campaign.creative?.existingVideoId || campaign.meta?.videoId || campaign.meta?.metaVideoId || "",
      templateId: campaign.creative?.templateId || null,
      sessionDesignId: campaign.creative?.sessionDesignId || null,
      itemId: campaign.creative?.itemId || null,
      imageUrl: campaign.creative?.imageUrl || "",
    },
    ad: {
      headline: campaign.ad?.headline || "",
      caption: campaign.ad?.caption || "",
      website: campaign.ad?.website || "",
      cta: campaign.ad?.cta || "Send WhatsApp Message",
    },
    audience: {
      gender: campaign.audience?.gender || "All",
      minAge: toNumber(campaign.audience?.minAge) || 18,
      maxAge: toNumber(campaign.audience?.maxAge) || 65,
      locations: Array.isArray(campaign.audience?.locations) ? campaign.audience.locations.filter(Boolean) : [],
      panIndia: Boolean(campaign.audience?.panIndia),
      interests: Array.isArray(campaign.audience?.interests) ? campaign.audience.interests.filter(Boolean) : [],
    },
    budget: {
      dailyBudget,
      startDate: campaign.budget?.startDate || "",
      endDate: campaign.budget?.endDate || "",
      durationDays,
      estimatedBudget: dailyBudget * durationDays,
    },
    schedule: {
      mode: campaign.schedule?.mode || "all-day",
      startTime: campaign.schedule?.startTime || "",
      endTime: campaign.schedule?.endTime || "",
    },
    status: campaign.status || "draft",
    analytics: {
      reach: toNumber(campaign.analytics?.reach),
      clicks: toNumber(campaign.analytics?.clicks),
      spend: toNumber(campaign.analytics?.spend),
      leads: toNumber(campaign.analytics?.leads),
    },
    meta: {
      connectionStatus: campaign.meta?.connectionStatus || "not-connected",
      campaignId: campaign.meta?.campaignId || campaign.meta?.metaCampaignId || null,
      adSetId: campaign.meta?.adSetId || campaign.meta?.metaAdSetId || null,
      imageHash: campaign.meta?.imageHash || campaign.meta?.metaImageHash || null,
      videoId: campaign.meta?.videoId || campaign.meta?.metaVideoId || null,
      thumbnailImageHash: campaign.meta?.thumbnailImageHash || campaign.meta?.metaVideoThumbnailImageHash || null,
      creativeId: campaign.meta?.creativeId || campaign.meta?.metaCreativeId || null,
      adId: campaign.meta?.adId || campaign.meta?.metaAdId || null,
      publishStatus: campaign.meta?.publishStatus || "",
      lastError: campaign.meta?.lastError || "",
      createdAt: campaign.meta?.createdAt || null,
      steps: Array.isArray(campaign.meta?.steps) ? campaign.meta.steps : [],
    },
    createdAt: campaign.createdAt || now,
    updatedAt: now,
  };
}

export function getSmartAdsCampaigns() {
  return businessGrowthApi.list("smart-ads").then((rows) => rows.map(normalizeSmartAdsCampaign));
}

export function saveSmartAdsCampaign(campaign) {
  const normalizedCampaign = normalizeSmartAdsCampaign(campaign);
  return businessGrowthApi.save("smart-ads", normalizedCampaign);
}
