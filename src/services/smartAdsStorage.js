import { businessGrowthApi } from "./apiClient.js";
import { smartAdsDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

const BUSINESS_SCOPE = import.meta.env?.VITE_BUSINESS_ID || "demo-business";
const STORAGE_KEY = `usk.smartAds.v1:${BUSINESS_SCOPE}`;
const LEGACY_MIGRATION_KEY = `${STORAGE_KEY}:legacyImported`;

function readStore() {
  if (typeof window === "undefined") return { campaigns: [], settings: {}, metrics: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { campaigns: [], settings: {}, metrics: {} };
    const parsed = JSON.parse(raw);
    return {
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
      metrics: parsed.metrics && typeof parsed.metrics === "object" ? parsed.metrics : {},
    };
  } catch {
    throw new Error("Smart Ads browser data could not be read. Its saved data has been left untouched; clear or restore browser storage before continuing.");
  }
}

function writeStore(store) {
  if (typeof window === "undefined") throw new Error("Smart Ads storage is unavailable in this environment.");
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    if (error?.name === "QuotaExceededError") throw new Error("Smart Ads could not save because browser storage is full. Remove unused drafts or free browser storage and try again.", { cause: error });
    throw error;
  }
}

// Creates id.
function createId() {
  if (globalThis.crypto?.randomUUID) return `smart-ad-${globalThis.crypto.randomUUID()}`;
  return `smart-ad-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

// This helper handles number logic.
function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Makes the smart ads campaign value consistent.
export function normalizeSmartAdsCampaign(campaign = {}) {
  const now = new Date().toISOString();
  const dailyBudget = toNumber(campaign.budget?.dailyBudget);
  const durationDays = Math.max(toNumber(campaign.budget?.durationDays), 0);

  return {
    id: campaign.id || createId(),
    source: campaign.source || (campaign.meta?.campaignId ? "meta-linked" : "usv"),
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
      objectStoryId: campaign.creative?.objectStoryId || campaign.creative?.postId || "",
      postId: campaign.creative?.postId || campaign.creative?.objectStoryId || "",
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
    wizardStep: Number.isInteger(campaign.wizardStep) ? Math.min(4, Math.max(0, campaign.wizardStep)) : 0,
    selectedAssets: campaign.selectedAssets && typeof campaign.selectedAssets === "object" ? campaign.selectedAssets : {},
    updatedAt: campaign.updatedAt || now,
  };
}

function upsertCampaign(campaign) {
  const store = readStore();
  const normalized = normalizeSmartAdsCampaign({ ...campaign, updatedAt: new Date().toISOString() });
  const index = store.campaigns.findIndex((item) => item.id === normalized.id);
  if (index < 0) store.campaigns.unshift(normalized);
  else store.campaigns[index] = { ...store.campaigns[index], ...normalized, createdAt: store.campaigns[index].createdAt || normalized.createdAt };
  writeStore(store);
  if (isDatabaseMode()) {
    smartAdsDb.save({
      id: normalized.id,
      campaignId: normalized.meta?.campaignId || normalized.id,
      campaignName: normalized.name,
      platform: "meta",
      objective: normalized.objective,
      dailyBudget: parseFloat(normalized.budget?.dailyBudget) || 0,
      status: normalized.status,
      startDate: normalized.budget?.startDate || null,
      endDate: normalized.budget?.endDate || null,
      impressions: parseInt(normalized.analytics?.reach || 0, 10),
      clicks: parseInt(normalized.analytics?.clicks || 0, 10),
      spend: parseFloat(normalized.analytics?.spend || 0),
    }).catch((err) => console.warn("[MySQL] Smart Ads background sync:", err.message));
  }
  return normalized;
}

// Smart Ads repository contract. Replace these implementations with API calls during MySQL migration.
export async function getSmartAdsCampaigns() {
  const store = readStore();
  if (!store.campaigns.length && typeof window !== "undefined" && !window.localStorage.getItem(LEGACY_MIGRATION_KEY)) {
    try {
      const legacy = await businessGrowthApi.list("smart-ads");
      store.campaigns = legacy.map((row) => normalizeSmartAdsCampaign(row));
      writeStore(store);
      window.localStorage.setItem(LEGACY_MIGRATION_KEY, new Date().toISOString());
    } catch {
      // Legacy API can be unavailable; drafts continue working locally.
    }
  }
  return readStore().campaigns.map(normalizeSmartAdsCampaign);
}

export async function getSmartAdsCampaignById(id) {
  return (await getSmartAdsCampaigns()).find((item) => item.id === id) || null;
}

export async function saveSmartAdsCampaign(campaign) {
  return upsertCampaign(campaign);
}

export async function saveDraft(campaign) {
  return upsertCampaign({ ...campaign, status: "draft" });
}

export async function updateDraft(id, patch) {
  const existing = await getSmartAdsCampaignById(id);
  if (!existing || existing.status !== "draft") return null;
  return upsertCampaign({ ...existing, ...patch, id, status: "draft" });
}

export async function deleteSmartAdsCampaign(id) {
  const store = readStore();
  const before = store.campaigns.length;
  store.campaigns = store.campaigns.filter((item) => item.id !== id);
  if (before !== store.campaigns.length) writeStore(store);
  return before !== store.campaigns.length;
}

export function getSmartAdsSettings() { return readStore().settings; }
export function saveSmartAdsSettings(settings) {
  const store = readStore();
  store.settings = { ...store.settings, ...settings };
  writeStore(store);
  return store.settings;
}
export function saveSmartAdsMetricsSnapshot(id, snapshot) {
  const store = readStore();
  store.metrics[id] = { ...snapshot, fetchedAt: snapshot.fetchedAt || new Date().toISOString(), source: "meta" };
  writeStore(store);
  return store.metrics[id];
}
export function getSmartAdsMetricsSnapshot(id) { return readStore().metrics[id] || null; }
