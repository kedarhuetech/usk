let metaConnection = {
  connected: false,
  user: null,
  permissions: [],
  token: null,
  assets: {
    businesses: [],
    pages: [],
    instagramAccounts: [],
    adAccounts: [],
    warnings: [],
  },
  selection: {
    businessId: "",
    pageId: "",
    instagramAccountId: "",
    adAccountId: "",
  },
  connectedAt: null,
  lastError: "",
};

const REQUIRED_PUBLISH_PERMISSIONS = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement"];
const PAGE_ADVERTISE_TASKS = new Set(["ADVERTISE", "MANAGE", "CREATE_CONTENT", "MODERATE"]);

function emptyAssets() {
  return {
    businesses: [],
    pages: [],
    instagramAccounts: [],
    adAccounts: [],
    warnings: [],
  };
}

function emptySelection() {
  return {
    businessId: "",
    pageId: "",
    instagramAccountId: "",
    adAccountId: "",
  };
}

function grantedPermissions(permissions = []) {
  return new Set(
    permissions
      .filter((permission) => permission?.status === "granted")
      .map((permission) => permission.permission),
  );
}

function findById(records = [], id = "") {
  return records.find((record) => record.id === id) || null;
}

function pageAdvertisingAccess(page = null) {
  const tasks = Array.isArray(page?.tasks) ? page.tasks : [];
  if (!tasks.length) return "unknown";
  return tasks.some((task) => PAGE_ADVERTISE_TASKS.has(task)) ? true : false;
}

export function buildMetaReadiness(connection = metaConnection) {
  const connected = Boolean(connection.connected);
  const assets = connection.assets || emptyAssets();
  const selection = connection.selection || emptySelection();
  const selectedPage = findById(assets.pages, selection.pageId);
  const selectedAdAccount = findById(assets.adAccounts, selection.adAccountId);
  const granted = grantedPermissions(connection.permissions);
  const missingPermissions = REQUIRED_PUBLISH_PERMISSIONS.filter((permission) => !granted.has(permission));
  const selectedPageAccess = pageAdvertisingAccess(selectedPage);
  let hasRequiredAccess = "unknown";
  let blockingReason = "";
  let blockingCode = "";

  if (!connected) {
    blockingReason = "Connect Meta before publishing Smart Ads.";
    blockingCode = "META_NOT_CONNECTED";
    hasRequiredAccess = false;
  } else if (!(assets.pages || []).length) {
    blockingReason = "No Facebook Page found. Smart Ads requires a Facebook Page to publish ads.";
    blockingCode = "META_PAGE_REQUIRED";
    hasRequiredAccess = false;
  } else if (!(assets.adAccounts || []).length) {
    blockingReason = "No Ad Account found. A Meta Ad Account is required to publish ads.";
    blockingCode = "META_AD_ACCOUNT_REQUIRED";
    hasRequiredAccess = false;
  } else if (!selectedPage) {
    blockingReason = "Select a Facebook Page before publishing Smart Ads.";
    blockingCode = "META_PAGE_SELECTION_REQUIRED";
  } else if (!selectedAdAccount) {
    blockingReason = "Select a Meta Ad Account before publishing Smart Ads.";
    blockingCode = "META_AD_ACCOUNT_SELECTION_REQUIRED";
  } else if (missingPermissions.length) {
    blockingReason = "Meta permissions are incomplete. Reconnect Meta and grant the required advertising access.";
    blockingCode = "META_PERMISSION_REQUIRED";
    hasRequiredAccess = false;
  } else if (selectedPageAccess === false) {
    blockingReason = "You don't have permission to advertise with this Facebook Page or Ad Account.";
    blockingCode = "META_ASSET_ACCESS_REQUIRED";
    hasRequiredAccess = false;
  } else {
    hasRequiredAccess = true;
  }

  const readyToPublish = connected && Boolean(selectedPage) && Boolean(selectedAdAccount) && hasRequiredAccess === true;

  return {
    connected,
    hasBusiness: Boolean((assets.businesses || []).length),
    hasPage: Boolean((assets.pages || []).length),
    hasAdAccount: Boolean((assets.adAccounts || []).length),
    hasSelectedPage: Boolean(selectedPage),
    hasSelectedAdAccount: Boolean(selectedAdAccount),
    hasRequiredAccess,
    instagramRequired: false,
    hasInstagram: Boolean(selection.instagramAccountId),
    readyToPublish,
    blockingReason,
    blockingCode,
    missingPermissions,
  };
}

function publicConnection() {
  return {
    connected: metaConnection.connected,
    user: metaConnection.user,
    permissions: metaConnection.permissions,
    assets: metaConnection.assets,
    selection: metaConnection.selection,
    readiness: buildMetaReadiness(metaConnection),
    connectedAt: metaConnection.connectedAt,
    lastError: metaConnection.lastError,
  };
}

export function getMetaConnection() {
  return metaConnection;
}

export function getMetaPublicConnection() {
  return publicConnection();
}

export function setMetaConnection(nextConnection) {
  metaConnection = {
    ...metaConnection,
    ...nextConnection,
    connected: true,
    lastError: "",
    connectedAt: nextConnection.connectedAt || new Date().toISOString(),
  };
  return publicConnection();
}

export function setMetaConnectionError(message) {
  metaConnection = {
    ...metaConnection,
    connected: false,
    user: null,
    permissions: [],
    token: null,
    assets: emptyAssets(),
    selection: emptySelection(),
    connectedAt: null,
    lastError: message || "Meta connection failed",
  };
  return publicConnection();
}

export function updateMetaAssets(assets) {
  metaConnection = {
    ...metaConnection,
    assets: assets || metaConnection.assets,
  };
  return publicConnection();
}

export function updateMetaConnectionSnapshot({ user, permissions, assets, selection } = {}) {
  metaConnection = {
    ...metaConnection,
    connected: true,
    user: user || metaConnection.user,
    permissions: permissions || metaConnection.permissions,
    assets: assets || metaConnection.assets,
    selection: selection || metaConnection.selection,
    lastError: "",
  };
  return publicConnection();
}

export function markMetaReconnectRequired(message) {
  metaConnection = {
    ...metaConnection,
    connected: false,
    user: null,
    permissions: [],
    token: null,
    connectedAt: null,
    lastError: message || "Meta token expired. Reconnect Meta to continue.",
  };
  return publicConnection();
}

export function saveMetaSelection(selection = {}) {
  metaConnection = {
    ...metaConnection,
    selection: {
      businessId: selection.businessId || "",
      pageId: selection.pageId || "",
      instagramAccountId: selection.instagramAccountId || "",
      adAccountId: selection.adAccountId || "",
    },
  };
  return publicConnection();
}

export function disconnectMetaConnection() {
  metaConnection = {
    connected: false,
    user: null,
    permissions: [],
    token: null,
    assets: emptyAssets(),
    selection: emptySelection(),
    connectedAt: null,
    lastError: "",
  };
  return publicConnection();
}
