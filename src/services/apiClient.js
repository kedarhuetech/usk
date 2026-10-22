const RAW_URL = import.meta.env.VITE_API_BASE_URL || "/api";
// Clean base URL without trailing slash or trailing /api
export const API_BASE_URL = RAW_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const businessId = import.meta.env.VITE_BUSINESS_ID || "demo-business";
  headers.set("X-Business-Id", businessId);

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  // Automatically prefixes /api if not present
  const fullUrl = cleanPath.startsWith("/api")
    ? `${API_BASE_URL}${cleanPath}`
    : `${API_BASE_URL}/api${cleanPath}`;

  let response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
      credentials: "include", // Preserves login session cookies
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot reach the Vyapaar backend at ${API_BASE_URL || "the same-origin /api endpoint"}. Check that the backend is running and the Vite API proxy targets the correct port.`);
    }
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.blob();

  if (!response.ok || (payload && payload.success === false)) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }

  return payload?.data ?? payload;
}

export const businessGrowthApi = {
  list: (resource) => apiRequest(`/business-growth/${resource}`),
  listPage: (resource, { limit = 50, cursor = "" } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    return apiRequest(`/business-growth/${resource}?${query.toString()}`);
  },
  save: (resource, value) =>
    apiRequest(`/business-growth/${resource}`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
  remove: (resource, id) =>
    apiRequest(`/business-growth/${resource}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  upload: (file, entityType, entityId) => {
    const body = new FormData();
    body.append("file", file);
    body.append("entityType", entityType);
    if (entityId) body.append("entityId", entityId);
    return apiRequest("/business-growth/assets", { method: "POST", body });
  },
};

export const businessDataApi = {
  summary: () => apiRequest("/business-data/summary"),
  list: (resource) => apiRequest(`/business-data/${resource}`),
  save: (resource, value) =>
    apiRequest(`/business-data/${resource}`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
  remove: (resource, id) =>
    apiRequest(`/business-data/${resource}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
