// Implements the backend stock media service for Pexels, Pixabay, and Unsplash.
/* global process */

const PEXELS_SEARCH_ENDPOINT = "https://api.pexels.com/v1/search";
const PIXABAY_SEARCH_ENDPOINT = "https://pixabay.com/api/";
const UNSPLASH_SEARCH_ENDPOINT = "https://api.unsplash.com/search/photos";

export const ALLOWED_IMAGE_HOSTS = new Set([
  "images.pexels.com",
  "pixabay.com",
  "cdn.pixabay.com",
  "images.unsplash.com",
  "plus.unsplash.com",
]);

// Resolves configured API keys with fallback support for standard and VITE_ prefixed variables.
export function getStockMediaApiKeys() {
  return {
    pexels: process.env.PEXELS_API_KEY || process.env.VITE_PEXELS_API_KEY || "",
    pixabay: process.env.PIXABAY_API_KEY || process.env.VITE_PIXABAY_API_KEY || "",
    unsplash: process.env.UNSPLASH_ACCESS_KEY || process.env.VITE_UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY || "",
  };
}

// Returns the live configuration status of each supported provider without exposing secret keys.
export function getStockMediaProvidersStatus() {
  const keys = getStockMediaApiKeys();
  return [
    {
      id: "pexels",
      label: "Pexels",
      configured: Boolean(keys.pexels),
      envName: "PEXELS_API_KEY",
    },
    {
      id: "pixabay",
      label: "Pixabay",
      configured: Boolean(keys.pixabay),
      envName: "PIXABAY_API_KEY",
    },
    {
      id: "unsplash",
      label: "Unsplash",
      configured: Boolean(keys.unsplash),
      envName: "UNSPLASH_ACCESS_KEY",
    },
  ];
}

// Normalizes Pexels photo payload into standard schema.
function normalizePexelsPhoto(photo) {
  return {
    id: `pexels-${photo.id}`,
    provider: "pexels",
    providerAssetId: String(photo.id),
    thumbnailUrl: photo.src?.medium || photo.src?.small || photo.src?.tiny,
    previewUrl: photo.src?.large || photo.src?.medium,
    fullUrl: photo.src?.large2x || photo.src?.large || photo.src?.original || photo.src?.medium,
    width: photo.width || 0,
    height: photo.height || 0,
    alt: photo.alt || "Pexels stock photo",
    author: photo.photographer || "Pexels photographer",
    creator: photo.photographer || "Pexels photographer",
    source: "pexels",
    sourceUrl: photo.url || "",
    photographerUrl: photo.photographer_url || "",
    attribution: photo.photographer ? `${photo.photographer} on Pexels` : "Pexels",
  };
}

// Builds reliable Pixabay CDN URLs avoiding temporary rate-limited /get/ links.
function resolvePixabayCdnUrls(image) {
  const preview = image.previewURL || "";
  // Check if previewURL matches global CDN pattern (e.g. cdn.pixabay.com/photo/..._150.jpg)
  const cdnMatch = preview.match(/^(https:\/\/cdn\.pixabay\.com\/photo\/.*)_150\.(jpg|png|jpeg|webp)$/i);
  if (cdnMatch) {
    const base = cdnMatch[1];
    const ext = cdnMatch[2];
    return {
      thumbnail: preview,
      web: `${base}_640.${ext}`,
      large: `${base}_960_720.${ext}`,
      full: `${base}_1280.${ext}`,
    };
  }

  return {
    thumbnail: image.previewURL || image.webformatURL,
    web: image.webformatURL || image.previewURL,
    large: image.largeImageURL || image.webformatURL || image.previewURL,
    full: image.largeImageURL || image.webformatURL || image.previewURL,
  };
}

// Normalizes Pixabay hit payload into standard schema.
function normalizePixabayImage(image) {
  const cdn = resolvePixabayCdnUrls(image);
  // Pixabay images lack Access-Control-Allow-Origin on direct requests.
  // We route fullUrl and previewUrl through the backend proxy so HTML5 Canvas / Konva
  // can load them with crossOrigin = "anonymous" without CORS errors or canvas tainting.
  const proxyTarget = cdn.large || cdn.web || cdn.thumbnail;
  const proxiedFullUrl = `/api/marketing-studio/stock-media/proxy?url=${encodeURIComponent(proxyTarget)}`;
  const proxiedPreviewUrl = `/api/marketing-studio/stock-media/proxy?url=${encodeURIComponent(cdn.web || proxyTarget)}`;

  return {
    id: `pixabay-${image.id}`,
    provider: "pixabay",
    providerAssetId: String(image.id),
    thumbnailUrl: cdn.thumbnail || cdn.web,
    previewUrl: proxiedPreviewUrl,
    fullUrl: proxiedFullUrl,
    directUrl: proxyTarget,
    width: image.imageWidth || image.webformatWidth || 0,
    height: image.imageHeight || image.webformatHeight || 0,
    alt: image.tags || "Pixabay stock image",
    author: image.user || "Pixabay creator",
    creator: image.user || "Pixabay creator",
    source: "pixabay",
    sourceUrl: image.pageURL || "",
    photographerUrl: image.user_id ? `https://pixabay.com/users/${encodeURIComponent(image.user)}-${image.user_id}/` : "",
    attribution: image.user ? `${image.user} on Pixabay` : "Pixabay",
  };
}

// Normalizes Unsplash photo payload into standard schema.
function normalizeUnsplashPhoto(photo) {
  return {
    id: `unsplash-${photo.id}`,
    provider: "unsplash",
    providerAssetId: String(photo.id),
    thumbnailUrl: photo.urls?.thumb || photo.urls?.small,
    previewUrl: photo.urls?.small || photo.urls?.regular,
    fullUrl: photo.urls?.regular || photo.urls?.full || photo.urls?.small,
    width: photo.width || 0,
    height: photo.height || 0,
    alt: photo.alt_description || photo.description || "Unsplash stock photo",
    author: photo.user?.name || "Unsplash photographer",
    creator: photo.user?.name || "Unsplash photographer",
    source: "unsplash",
    sourceUrl: photo.links?.html || "",
    photographerUrl: photo.user?.links?.html || "",
    downloadUrl: photo.links?.download_location || photo.links?.download || "",
    attribution: photo.user?.name ? `${photo.user.name} on Unsplash` : "Unsplash",
    attributionUrl: photo.user?.links?.html || "",
  };
}

// Executes Pexels photo search.
async function searchPexels(apiKey, { query, page = 1, perPage = 24, orientation = "square" }) {
  const safePerPage = Math.max(1, Math.min(80, Number(perPage) || 24));
  const safePage = Math.max(1, Number(page) || 1);
  const pexelsOrientation = orientation === "landscape" ? "landscape" : orientation === "portrait" ? "portrait" : "square";

  const url = new URL(PEXELS_SEARCH_ENDPOINT);
  url.search = new URLSearchParams({
    query: query || "business",
    page: String(safePage),
    per_page: String(safePerPage),
    orientation: pexelsOrientation,
  }).toString();

  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const err = new Error("Pexels authentication failed. Check configured PEXELS_API_KEY.");
      err.code = "PROVIDER_AUTH_FAILED";
      err.statusCode = 502;
      throw err;
    }
    if (response.status === 429) {
      const err = new Error("Pexels rate limit reached. Please try again later.");
      err.code = "PROVIDER_RATE_LIMITED";
      err.statusCode = 429;
      throw err;
    }
    const err = new Error(`Pexels API request failed (${response.status}: ${response.statusText})`);
    err.code = "PROVIDER_REQUEST_FAILED";
    err.statusCode = response.status >= 500 ? 502 : response.status;
    throw err;
  }

  const payload = await response.json();
  const results = (payload.photos || []).map(normalizePexelsPhoto);
  const totalResults = payload.total_results || results.length;

  return {
    results,
    page: payload.page || safePage,
    perPage: payload.per_page || safePerPage,
    totalResults,
    hasMore: Boolean(payload.next_page) || safePage * safePerPage < totalResults,
    provider: "pexels",
  };
}

// Executes Pixabay image search.
async function searchPixabay(apiKey, { query, page = 1, perPage = 24, orientation = "square", imageType = "illustration" }) {
  // Pixabay requires per_page to be an integer between 3 and 200.
  const safePerPage = Math.max(3, Math.min(200, Number(perPage) || 24));
  const safePage = Math.max(1, Number(page) || 1);
  const pixabayOrientation = orientation === "landscape" ? "horizontal" : orientation === "portrait" ? "vertical" : "all";

  const url = new URL(PIXABAY_SEARCH_ENDPOINT);
  url.search = new URLSearchParams({
    key: apiKey,
    q: query || "business",
    image_type: imageType || "illustration",
    safesearch: "true",
    page: String(safePage),
    per_page: String(safePerPage),
    orientation: pixabayOrientation,
  }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const err = new Error("Pixabay authentication failed. Check configured PIXABAY_API_KEY.");
      err.code = "PROVIDER_AUTH_FAILED";
      err.statusCode = 502;
      throw err;
    }
    if (response.status === 429) {
      const err = new Error("Pixabay rate limit reached. Please try again later.");
      err.code = "PROVIDER_RATE_LIMITED";
      err.statusCode = 429;
      throw err;
    }
    const rawError = await response.text().catch(() => "");
    const err = new Error(rawError || `Pixabay API request failed (${response.status})`);
    err.code = "PROVIDER_REQUEST_FAILED";
    err.statusCode = response.status >= 500 ? 502 : response.status;
    throw err;
  }

  const payload = await response.json();
  const results = (payload.hits || []).map(normalizePixabayImage);
  const totalResults = payload.totalHits || payload.total || results.length;

  return {
    results,
    page: safePage,
    perPage: safePerPage,
    totalResults,
    hasMore: safePage * safePerPage < totalResults,
    provider: "pixabay",
  };
}

// Executes Unsplash photo search.
async function searchUnsplash(apiKey, { query, page = 1, perPage = 24, orientation = "square" }) {
  const safePerPage = Math.max(1, Math.min(30, Number(perPage) || 24));
  const safePage = Math.max(1, Number(page) || 1);
  const unsplashOrientation = orientation === "landscape" ? "landscape" : orientation === "portrait" ? "portrait" : "squarish";

  const url = new URL(UNSPLASH_SEARCH_ENDPOINT);
  url.search = new URLSearchParams({
    query: query || "business",
    page: String(safePage),
    per_page: String(safePerPage),
    orientation: unsplashOrientation,
  }).toString();

  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${apiKey}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const err = new Error("Unsplash authentication failed. Check configured UNSPLASH_ACCESS_KEY.");
      err.code = "PROVIDER_AUTH_FAILED";
      err.statusCode = 502;
      throw err;
    }
    if (response.status === 429) {
      const err = new Error("Unsplash rate limit reached. Please try again later.");
      err.code = "PROVIDER_RATE_LIMITED";
      err.statusCode = 429;
      throw err;
    }
    const err = new Error(`Unsplash API request failed (${response.status}: ${response.statusText})`);
    err.code = "PROVIDER_REQUEST_FAILED";
    err.statusCode = response.status >= 500 ? 502 : response.status;
    throw err;
  }

  const payload = await response.json();
  const results = (payload.results || []).map(normalizeUnsplashPhoto);
  const totalResults = payload.total || results.length;

  return {
    results,
    page: safePage,
    perPage: safePerPage,
    totalResults,
    hasMore: safePage < (payload.total_pages || 0),
    provider: "unsplash",
  };
}

// Unified search entry point for all supported stock media providers.
export async function searchStockMedia({ provider = "pexels", query = "", page = 1, perPage = 24, orientation = "square", category = "stock", imageType = "illustration" }) {
  const keys = getStockMediaApiKeys();
  const cleanProvider = String(provider || "pexels").toLowerCase().trim();
  const fallbackQuery = category === "backgrounds" ? "background" : "business";
  const cleanQuery = String(query || "").trim() || fallbackQuery;

  if (cleanProvider === "pexels") {
    if (!keys.pexels) {
      const err = new Error("Pexels is not configured. Set PEXELS_API_KEY in server/.env");
      err.code = "PROVIDER_NOT_CONFIGURED";
      err.statusCode = 400;
      throw err;
    }
    return searchPexels(keys.pexels, { query: cleanQuery, page, perPage, orientation });
  }

  if (cleanProvider === "pixabay") {
    if (!keys.pixabay) {
      const err = new Error("Pixabay is not configured. Set PIXABAY_API_KEY in server/.env");
      err.code = "PROVIDER_NOT_CONFIGURED";
      err.statusCode = 400;
      throw err;
    }
    return searchPixabay(keys.pixabay, { query: cleanQuery, page, perPage, orientation, imageType });
  }

  if (cleanProvider === "unsplash") {
    if (!keys.unsplash) {
      const err = new Error("Unsplash is not configured. Set UNSPLASH_ACCESS_KEY in server/.env");
      err.code = "PROVIDER_NOT_CONFIGURED";
      err.statusCode = 400;
      throw err;
    }
    return searchUnsplash(keys.unsplash, { query: cleanQuery, page, perPage, orientation });
  }

  const err = new Error(`Unsupported stock media provider: ${provider}. Supported providers: pexels, pixabay, unsplash.`);
  err.code = "UNSUPPORTED_PROVIDER";
  err.statusCode = 400;
  throw err;
}
