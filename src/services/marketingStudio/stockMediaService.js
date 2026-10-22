const createSvgDataUrl = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

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
    author: "Ledgerly demo media",
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

const PEXELS_API_KEY = import.meta.env.VITE_PEXELS_API_KEY || "";
const PIXABAY_API_KEY = import.meta.env.VITE_PIXABAY_API_KEY || "";
const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || "";

export const STOCK_MEDIA_PROVIDERS = [
  {
    id: "pexels",
    label: "Pexels",
    envName: "VITE_PEXELS_API_KEY",
    configured: Boolean(PEXELS_API_KEY),
  },
  {
    id: "pixabay",
    label: "Pixabay",
    envName: "VITE_PIXABAY_API_KEY",
    configured: Boolean(PIXABAY_API_KEY),
  },
  {
    id: "unsplash",
    label: "Unsplash",
    envName: "VITE_UNSPLASH_ACCESS_KEY",
    configured: Boolean(UNSPLASH_ACCESS_KEY),
  },
];

function getProviderConfig(provider = "pexels") {
  return STOCK_MEDIA_PROVIDERS.find((item) => item.id === provider) || STOCK_MEDIA_PROVIDERS[0];
}

export function getStockMediaProviderStatus(provider = "pexels") {
  const providerConfig = getProviderConfig(provider);

  if (providerConfig.configured) {
    return {
      provider: providerConfig.id,
      label: providerConfig.label,
      live: true,
      message: `Live ${providerConfig.label} search is configured.`,
    };
  }

  return {
    provider: providerConfig.id,
    label: providerConfig.label,
    live: false,
    message: `${providerConfig.label} is not configured.`,
    requiredEnv: [providerConfig.envName],
  };
}

function normalizePexelsPhoto(photo) {
  return {
    id: `pexels-${photo.id}`,
    provider: "pexels",
    providerAssetId: String(photo.id),
    thumbnailUrl: photo.src?.tiny || photo.src?.small || photo.src?.medium,
    previewUrl: photo.src?.medium || photo.src?.large,
    fullUrl: photo.src?.large2x || photo.src?.large || photo.src?.original || photo.src?.medium,
    width: photo.width,
    height: photo.height,
    alt: photo.alt || "Pexels stock image",
    author: photo.photographer || "Pexels photographer",
    creator: photo.photographer || "Pexels photographer",
    source: "pexels",
    sourceUrl: photo.url || "",
    photographerUrl: photo.photographer_url || "",
    attribution: photo.photographer ? `${photo.photographer} on Pexels` : "Pexels",
  };
}

function normalizePixabayImage(image) {
  return {
    id: `pixabay-${image.id}`,
    provider: "pixabay",
    providerAssetId: String(image.id),
    thumbnailUrl: image.previewURL || image.webformatURL || image.largeImageURL,
    previewUrl: image.webformatURL || image.largeImageURL || image.previewURL,
    fullUrl: image.largeImageURL || image.fullHDURL || image.webformatURL || image.previewURL,
    width: image.imageWidth || image.webformatWidth || 0,
    height: image.imageHeight || image.webformatHeight || 0,
    alt: image.tags || "Pixabay stock image",
    author: image.user || "Pixabay creator",
    creator: image.user || "Pixabay creator",
    source: "pixabay",
    sourceUrl: image.pageURL || "",
    photographerUrl: image.user_id ? `https://pixabay.com/users/${image.user}-${image.user_id}/` : "",
    attribution: image.user ? `${image.user} on Pixabay` : "Pixabay",
  };
}

function normalizeUnsplashPhoto(photo) {
  return {
    id: `unsplash-${photo.id}`,
    provider: "unsplash",
    providerAssetId: String(photo.id),
    thumbnailUrl: photo.urls?.thumb || photo.urls?.small || photo.urls?.regular,
    previewUrl: photo.urls?.small || photo.urls?.regular || photo.urls?.thumb,
    fullUrl: photo.urls?.regular || photo.urls?.full || photo.urls?.small || photo.urls?.raw,
    width: photo.width,
    height: photo.height,
    alt: photo.alt_description || photo.description || "Unsplash stock image",
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

function createProviderError(providerLabel, response) {
  if (response.status === 401 || response.status === 403) {
    return `${providerLabel} rejected the request. Check the configured API key.`;
  }

  if (response.status === 429) {
    return `${providerLabel} rate limit reached. Try again later.`;
  }

  return `${providerLabel} stock image search failed. Try again.`;
}

function createSearchResponse({ results, page, perPage, totalResults, hasMore, provider }) {
  return {
    results,
    page,
    perPage,
    totalResults,
    hasMore,
    provider,
  };
}

async function searchPexels(query, options = {}) {
  const perPage = options.perPage || STOCK_MEDIA_PAGE_SIZE;
  const page = options.page || 1;
  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    page: String(page),
    orientation: options.orientation || "square",
  });

  const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
    headers: {
      Authorization: PEXELS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(createProviderError("Pexels", response));
  }

  const payload = await response.json();
  const results = (payload.photos || []).map(normalizePexelsPhoto);

  return createSearchResponse({
    results,
    page: payload.page || page,
    perPage: payload.per_page || perPage,
    totalResults: payload.total_results || results.length,
    hasMore: Boolean(payload.next_page) || page * perPage < (payload.total_results || 0),
    provider: "pexels",
  });
}

async function searchPixabay(query, options = {}) {
  const perPage = options.perPage || STOCK_MEDIA_PAGE_SIZE;
  const page = options.page || 1;
  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    image_type: "photo",
    safesearch: "true",
    per_page: String(perPage),
    page: String(page),
    orientation: options.orientation === "landscape" ? "horizontal" : "all",
  });

  const response = await fetch(`https://pixabay.com/api/?${params.toString()}`);

  if (!response.ok) {
    throw new Error(createProviderError("Pixabay", response));
  }

  const payload = await response.json();
  const results = (payload.hits || []).map(normalizePixabayImage);

  return createSearchResponse({
    results,
    page,
    perPage,
    totalResults: payload.totalHits || results.length,
    hasMore: page * perPage < (payload.totalHits || 0),
    provider: "pixabay",
  });
}

async function searchUnsplash(query, options = {}) {
  const perPage = options.perPage || STOCK_MEDIA_PAGE_SIZE;
  const page = options.page || 1;
  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    page: String(page),
    orientation: options.orientation === "landscape" ? "landscape" : "squarish",
  });

  const response = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(createProviderError("Unsplash", response));
  }

  const payload = await response.json();
  const results = (payload.results || []).map(normalizeUnsplashPhoto);

  return createSearchResponse({
    results,
    page,
    perPage,
    totalResults: payload.total || results.length,
    hasMore: page < (payload.total_pages || 0),
    provider: "unsplash",
  });
}

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

  return createSearchResponse({
    results: pageResults,
    page,
    perPage,
    totalResults: results.length,
    hasMore: start + pageResults.length < results.length,
    provider: "demo",
  });
}

export async function searchImages(query, options = {}) {
  const provider = options.provider || "pexels";
  const providerStatus = getStockMediaProviderStatus(provider);
  const safeQuery = String(query || "").trim();
  const queryText = safeQuery || "business";

  if (!providerStatus.live) {
    throw new Error(providerStatus.message);
  }

  if (providerStatus.provider === "pexels") {
    return searchPexels(queryText, options);
  }

  if (providerStatus.provider === "pixabay") {
    return searchPixabay(queryText, options);
  }

  if (providerStatus.provider === "unsplash") {
    return searchUnsplash(queryText, options);
  }

  return searchDemoMedia(safeQuery, options);
}
