// Manages stock media searching and provider integrations through the USV backend.
import { API_BASE_URL, apiRequest } from "../apiClient";

// Creates svg data url.
const createSvgDataUrl = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

// Creates demo asset.
const createDemoAsset = ({ id, title, subtitle, colors, width = 1600, height = 1200, tags = [], category = "stock" }) => {
  const [start, end, accent = "#ffffff"] = colors;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${start}" />
          <stop offset="100%" stop-color="${end}" />
        </linearGradient>
        <pattern id="dots-${id}" width="42" height="42" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2.5" fill="rgba(255,255,255,.24)" />
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#g-${id})" />
      <rect width="${width}" height="${height}" fill="url(#dots-${id})" />
      <circle cx="${width * 0.78}" cy="${height * 0.25}" r="${Math.min(width, height) * 0.18}" fill="rgba(255,255,255,.18)" />
      <circle cx="${width * 0.18}" cy="${height * 0.78}" r="${Math.min(width, height) * 0.22}" fill="rgba(255,255,255,.12)" />
      <rect x="${width * 0.08}" y="${height * 0.12}" width="${width * 0.26}" height="${height * 0.055}" rx="${height * 0.027}" fill="rgba(255,255,255,.22)" />
      <rect x="${width * 0.08}" y="${height * 0.72}" width="${width * 0.52}" height="${height * 0.035}" rx="${height * 0.017}" fill="rgba(255,255,255,.28)" />
      <rect x="${width * 0.08}" y="${height * 0.79}" width="${width * 0.38}" height="${height * 0.035}" rx="${height * 0.017}" fill="rgba(255,255,255,.18)" />
      <text x="${width * 0.08}" y="${height * 0.45}" fill="${accent}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(width * 0.055)}" font-weight="800">${title}</text>
      <text x="${width * 0.083}" y="${height * 0.53}" fill="${accent}" opacity=".82" font-family="Inter, Arial, sans-serif" font-size="${Math.round(width * 0.028)}" font-weight="600">${subtitle}</text>
    </svg>
  `;
  const dataUrl = createSvgDataUrl(svg);

  return {
    id,
    thumbnailUrl: dataUrl,
    previewUrl: dataUrl,
    fullUrl: dataUrl,
    width,
    height,
    alt: `${title} ${subtitle}`,
    author: "USK demo media",
    source: "demo",
    sourceUrl: "",
    category,
    tags,
  };
};

const DEMO_MEDIA = [
  createDemoAsset({
    id: "demo-business-desk",
    title: "Business Desk",
    subtitle: "Workspace visual",
    colors: ["#0f766e", "#2563eb"],
    tags: ["business", "office", "service", "electrical"],
  }),
  createDemoAsset({
    id: "demo-restaurant",
    title: "Restaurant Promo",
    subtitle: "Food campaign",
    colors: ["#f97316", "#991b1b"],
    tags: ["restaurant", "food", "offer"],
  }),
  createDemoAsset({
    id: "demo-clothing",
    title: "Clothing Sale",
    subtitle: "Retail fashion",
    colors: ["#7c3aed", "#db2777"],
    tags: ["clothing", "fashion", "product"],
  }),
  createDemoAsset({
    id: "demo-electrical",
    title: "Electrical Service",
    subtitle: "Local business",
    colors: ["#1d4ed8", "#0f172a", "#fef3c7"],
    tags: ["electrical", "business", "maintenance"],
  }),
  createDemoAsset({
    id: "demo-festival",
    title: "Festival Offer",
    subtitle: "Seasonal post",
    colors: ["#f59e0b", "#dc2626"],
    tags: ["festival", "seasonal", "celebration"],
  }),
  createDemoAsset({
    id: "demo-soft-background",
    title: "Soft Gradient",
    subtitle: "Background",
    colors: ["#e0f2fe", "#f8fafc", "#334155"],
    tags: ["background", "soft", "neutral", "business"],
    category: "background",
  }),
  createDemoAsset({
    id: "demo-warm-background",
    title: "Warm Paper",
    subtitle: "Background",
    colors: ["#fed7aa", "#fef3c7", "#7c2d12"],
    tags: ["background", "warm", "festival", "restaurant"],
    category: "background",
  }),
];

export const STOCK_MEDIA_PAGE_SIZE = 24;

export const STOCK_MEDIA_PROVIDERS = [
  {
    id: "pexels",
    label: "Pexels",
    envName: "PEXELS_API_KEY",
    configured: true,
  },
  {
    id: "pixabay",
    label: "Pixabay",
    envName: "PIXABAY_API_KEY",
    configured: true,
  },
  {
    id: "unsplash",
    label: "Unsplash",
    envName: "UNSPLASH_ACCESS_KEY",
    configured: true,
  },
];

// Resolves relative API image URLs (e.g. proxy URLs) into full URLs if API_BASE_URL is set.
export function resolveApiImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${cleanUrl}`;
}

// In-memory status cache populated by backend status checks.
const providerStatusCache = {
  pexels: {
    provider: "pexels",
    label: "Pexels",
    live: true,
    message: "Live Pexels stock photos via USV backend.",
  },
  pixabay: {
    provider: "pixabay",
    label: "Pixabay",
    live: true,
    message: "Live Pixabay stock photos via USV backend.",
  },
  unsplash: {
    provider: "unsplash",
    label: "Unsplash",
    live: true,
    message: "Live Unsplash stock photos via USV backend.",
  },
};

// Fetches live provider status from backend without exposing secret credentials.
export async function fetchStockMediaProviderStatuses() {
  try {
    const data = await apiRequest("/marketing-studio/stock-media/status");
    if (data?.providers && Array.isArray(data.providers)) {
      data.providers.forEach((item) => {
        providerStatusCache[item.id] = {
          provider: item.id,
          label: item.label,
          live: Boolean(item.configured),
          message: item.configured
            ? `Live ${item.label} search is configured.`
            : `${item.label} is not configured on backend. Set ${item.envName} in server/.env`,
          requiredEnv: item.envName ? [item.envName] : [],
        };
      });
    }
  } catch {
    // If backend is momentarily unreachable, retain default optimistic status
  }
  return providerStatusCache;
}

// Gets stock media provider status from cache.
export function getStockMediaProviderStatus(provider = "pexels") {
  const cached = providerStatusCache[provider];
  if (cached) return cached;

  const found = STOCK_MEDIA_PROVIDERS.find((item) => item.id === provider);
  return {
    provider,
    label: found?.label || provider,
    live: true,
    message: `Live ${found?.label || provider} stock media ready.`,
  };
}

// Normalizes backend asset URLs to ensure proxy endpoints have API_BASE_URL attached.
function normalizeAssetUrls(asset) {
  return {
    ...asset,
    thumbnailUrl: resolveApiImageUrl(asset.thumbnailUrl),
    previewUrl: resolveApiImageUrl(asset.previewUrl),
    fullUrl: resolveApiImageUrl(asset.fullUrl),
  };
}

// Searches demo media when explicitly selected or fallback needed.
function searchDemoMedia(query, options = {}) {
  const perPage = options.perPage || STOCK_MEDIA_PAGE_SIZE;
  const page = options.page || 1;
  const normalizedQuery = query.trim().toLowerCase();
  const wantsBackgrounds = options.category === "backgrounds";
  const results = DEMO_MEDIA.filter((item) => {
    if (wantsBackgrounds && item.category !== "background") return false;
    if (!normalizedQuery) return true;

    const haystack = [item.alt, item.author, item.category, ...item.tags].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const start = (page - 1) * perPage;
  const pageResults = results.slice(start, start + perPage);

  return {
    results: pageResults,
    page,
    perPage,
    totalResults: results.length,
    hasMore: start + pageResults.length < results.length,
    provider: "demo",
  };
}

// Searches stock media images via backend API proxy.
export async function searchImages(query, options = {}) {
  const provider = options.provider || "pexels";

  if (provider === "demo") {
    return searchDemoMedia(String(query || ""), options);
  }

  const queryParams = new URLSearchParams({
    provider,
    query: String(query || "").trim(),
    page: String(options.page || 1),
    perPage: String(options.perPage || STOCK_MEDIA_PAGE_SIZE),
    orientation: options.orientation || "square",
    category: options.category || "stock",
  });

  try {
    const payload = await apiRequest(`/marketing-studio/stock-media?${queryParams.toString()}`);
    const rawResults = payload.results || [];
    const results = rawResults.map(normalizeAssetUrls);

    return {
      results,
      page: Number(payload.page) || options.page || 1,
      perPage: Number(payload.perPage) || options.perPage || STOCK_MEDIA_PAGE_SIZE,
      totalResults: Number(payload.totalResults) || results.length,
      hasMore: Boolean(payload.hasMore),
      provider: payload.provider || provider,
    };
  } catch (error) {
    // If backend returns a clear error message, throw it for display in the UI
    throw new Error(error.message || `Unable to fetch images from ${provider}.`, { cause: error });
  }
}
