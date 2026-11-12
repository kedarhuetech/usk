// Frontend service for HSN & SAC lookups, search, and admin import.
const API_BASE = "/api/hsn";

/**
 * Maps a numeric GST rate (e.g. 0, 5, 12, 18, 28) to an option in an options array.
 * Works seamlessly with both itemsData taxOptions and salesData saleTaxOptions.
 */
export function matchGstRateToOption(rate, options = []) {
  if (rate === null || rate === undefined || rate === "") return null;
  const numRate = Number.parseFloat(rate);
  if (Number.isNaN(numRate)) return null;

  if (numRate === 0) {
    return options.find((opt) => opt === "GST 0%" || opt === "Exempt") || (options.includes("GST 0%") ? "GST 0%" : options[0]);
  }

  // Find exact numeric match like "GST 5%", "IGST 5%", "GST 18.0%" or "GST @ 5%"
  const found = options.find((opt) => {
    const match = opt.match(/(?:GST|IGST)?\s*@?\s*(\d+(\.\d+)?)%/i);
    return match && Number.parseFloat(match[1]) === numRate;
  });

  if (found) return found;

  return `GST ${numRate}%`;
}

/**
 * Searches HSN/SAC codes by prefix or description keyword.
 */
export async function searchHsnCodes(query = "", type = null, limit = 20) {
  try {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (limit) params.set("limit", String(limit));

    const response = await fetch(`${API_BASE}/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HSN search failed with status ${response.status}`);
    }
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.warn("Failed to fetch HSN suggestions:", error.message);
    return [];
  }
}

/**
 * Looks up exact HSN/SAC code details.
 */
export async function lookupHsnCode(code) {
  if (!code) return null;
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(code)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`HSN lookup failed with status ${response.status}`);
    }
    const data = await response.json();
    return data.valid ? data : null;
  } catch (error) {
    console.warn(`Failed to lookup HSN code ${code}:`, error.message);
    return null;
  }
}

/**
 * Uploads an HSN/SAC master file (.xlsx, .xls, .csv) to the bulk importer endpoint.
 */
export async function uploadHsnMasterFile(file) {
  if (!file) throw new Error("Please select a file to upload.");

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/import`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    throw new Error(data.message || `Import failed with status ${response.status}`);
  }

  return data;
}

/**
 * Triggers initial sample seed if needed.
 */
export async function seedHsnCodes(force = false) {
  try {
    const response = await fetch(`${API_BASE}/seed?force=${force}`, {
      method: "POST",
    });
    return await response.json();
  } catch (error) {
    console.warn("HSN seed error:", error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Calculates GST (intra-state CGST+SGST vs inter-state IGST) and Cess breakdown.
 */
export async function calculateHsnTax({
  code,
  amount = 0,
  isInterState = false,
  partyState = "",
  businessState = "",
}) {
  if (!code) return null;
  try {
    const response = await fetch(`${API_BASE}/calculate-tax`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        amount,
        isInterState,
        partyState,
        businessState,
      }),
    });
    if (!response.ok) {
      throw new Error(`Tax calculation failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("calculateHsnTax error:", error.message);
    return null;
  }
}

