// Provides the online store storage application service.
import { businessGrowthApi } from "./apiClient.js";
import { normalizePersistedAssetUrls, persistInlineImages } from "./businessGrowthData.js";
const defaultOnlineStoreState = {
  created: false,
  prototypeStoreId: "",
  storeName: "My Online Store",
  businessName: "My Company",
  gstin: "",
  logoUrl: "",
  contactNumber: "",
  email: "",
  address: "",
  description: "",
  acceptOnlineOrders: false,
  minimumOrderAmount: "",
  additionalChargesEnabled: false,
  additionalChargeName: "",
  additionalChargeAmount: "",
  selectedItemIds: [],
  createdAt: "",
  updatedAt: "",
};

// Creates prototype store id.
function createPrototypeStoreId(value = "") {
  const slug = String(value || "store")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `${slug || "store"}-${Math.random().toString(36).slice(2, 8)}`;
}

// Gets online store state.
export function getOnlineStoreState() {
  return businessGrowthApi.list("online-store").then((rows) => ({ ...defaultOnlineStoreState, ...(normalizePersistedAssetUrls(rows[0] || {})) }));
}

// Saves online store state.
export async function saveOnlineStoreState(state) {
  const current = await getOnlineStoreState();
  const timestamp = new Date().toISOString();
  const nextState = {
    ...current,
    ...state,
    prototypeStoreId: current.prototypeStoreId || state.prototypeStoreId || createPrototypeStoreId(state.storeName || current.storeName),
    updatedAt: timestamp,
    createdAt: current.createdAt || state.createdAt || timestamp,
  };

  const persisted = await persistInlineImages(nextState, "online-store", nextState.prototypeStoreId);
  return businessGrowthApi.save("online-store", { ...persisted, id: nextState.prototypeStoreId });
}
