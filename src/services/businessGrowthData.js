// Provides the business growth data application service.
import { businessGrowthApi, API_BASE_URL } from "./apiClient.js";
import { normalizeInventoryItem } from "./itemsStorage.js";
import { normalizeSmartAdsCampaign } from "./smartAdsStorage.js";

const inlineAssetCaches = new Map();
const inlineAssetCacheEntries = [];
const MAX_INLINE_ASSET_CACHE_ENTRIES = 96;

// Gets inline asset cache.
function getInlineAssetCache(entityType, entityId) {
  const key = `${entityType}:${entityId}`;
  if (!inlineAssetCaches.has(key)) inlineAssetCaches.set(key, new Map());
  return inlineAssetCaches.get(key);
}

// This helper handles inline asset logic.
function rememberInlineAsset(cache, source, url) {
  cache.set(source, url);
  inlineAssetCacheEntries.push({ cache, source });
  while (inlineAssetCacheEntries.length > MAX_INLINE_ASSET_CACHE_ENTRIES) {
    const oldest = inlineAssetCacheEntries.shift();
    if (oldest) oldest.cache.delete(oldest.source);
  }
}

// Makes the persisted asset urls value consistent.
export function normalizePersistedAssetUrls(value) {
  if (typeof value === "string") {
    const normalized = value.replace("/api/api/business-growth/assets/", "/api/business-growth/assets/");
    if (!normalized.includes("/api/business-growth/assets/") || normalized.includes("businessId=")) return normalized;
    return `${normalized}${normalized.includes("?") ? "&" : "?"}businessId=${encodeURIComponent(import.meta.env.VITE_BUSINESS_ID || "demo-business")}`;
  }
  if (Array.isArray(value)) return value.map(normalizePersistedAssetUrls);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizePersistedAssetUrls(entry)]));
  return value;
}

// Loads growth items.
export async function loadGrowthItems() { return (await businessGrowthApi.list("items")).map((item) => normalizeInventoryItem(normalizePersistedAssetUrls(item))); }
// Persists inline images.
export async function persistInlineImages(value, entityType, entityId, cache = getInlineAssetCache(entityType, entityId)) {
  if (typeof value === "string" && /^data:image\//i.test(value)) {
    if (cache.has(value)) return cache.get(value);
    const [header] = value.split(",", 2);
    const mime = /data:([^;]+)/.exec(header)?.[1] || "image/png";
    const blob = await (await fetch(value)).blob();
    const file = new File([blob], `${entityId}-${Date.now()}.${mime.split("/")[1] || "png"}`, { type: mime });
    const asset = await businessGrowthApi.upload(file, entityType, entityId);
    const url = `${API_BASE_URL.replace(/\/api\/?$/, "")}${asset.url}?businessId=${encodeURIComponent(import.meta.env.VITE_BUSINESS_ID || "demo-business")}`;
    rememberInlineAsset(cache, value, url);
    return url;
  }
  if (typeof value === "string") return value.replace("/api/api/business-growth/assets/", "/api/business-growth/assets/");
  if (Array.isArray(value)) return Promise.all(value.map((entry) => persistInlineImages(entry, entityType, entityId, cache)));
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await persistInlineImages(entry, entityType, entityId, cache)])));
  return value;
}

// Saves growth item.
export async function saveGrowthItem(value) {
  const item = await persistInlineImages(normalizeInventoryItem(value), "inventory-item", value.id || "new");
  return businessGrowthApi.save("items", item);
}
// Loads growth orders.
export async function loadGrowthOrders() { return businessGrowthApi.list("orders"); }
// Saves growth order.
export async function saveGrowthOrder(value) { return businessGrowthApi.save("orders", value); }
// Updates growth order.
export async function updateGrowthOrder(id, patch) {
  // Handles result.
  const current = (await loadGrowthOrders()).find((order) => order.id === id);
  return current ? businessGrowthApi.save("orders", { ...current, ...patch, updatedAt: new Date().toISOString() }) : null;
}
// Loads growth campaigns.
export async function loadGrowthCampaigns() { return (await businessGrowthApi.list("smart-ads")).map((campaign) => normalizeSmartAdsCampaign(normalizePersistedAssetUrls(campaign))); }
// Saves growth campaign.
export async function saveGrowthCampaign(value) { return businessGrowthApi.save("smart-ads", await persistInlineImages(normalizeSmartAdsCampaign(value), "smart-ads", value.id || "new")); }
// Saves growth design.
export async function saveGrowthDesign(value) { return businessGrowthApi.save("designs", await persistInlineImages(value, "marketing-design", value.id)); }
// Loads growth designs.
export async function loadGrowthDesigns() { return normalizePersistedAssetUrls(await businessGrowthApi.list("designs")); }
// Loads recent image to layers designs.
export async function loadRecentImageToLayersDesigns() { return normalizePersistedAssetUrls(await businessGrowthApi.list("designs?kind=image-to-layers")); }
// Deletes growth design.
export async function deleteGrowthDesign(id) { return businessGrowthApi.remove("designs", id); }
