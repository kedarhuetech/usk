// Implements the backend whatsapp connection store service.
const REQUIRED_WHATSAPP_PERMISSIONS = ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"];

let whatsappConnection = {
  connected: false,
  source: "",
  user: null,
  permissions: [],
  token: null,
  assets: {
    businesses: [],
    wabas: [],
    phoneNumbers: [],
    templates: [],
    warnings: [],
  },
  selection: {
    businessId: "",
    wabaId: "",
    phoneNumberId: "",
    templateId: "",
  },
  connectedAt: null,
  lastError: "",
  lastTestResult: null,
};

// This helper handles assets logic.
function emptyAssets() {
  return {
    businesses: [],
    wabas: [],
    phoneNumbers: [],
    templates: [],
    warnings: [],
  };
}

// This helper handles selection logic.
function emptySelection() {
  return {
    businessId: "",
    wabaId: "",
    phoneNumberId: "",
    templateId: "",
  };
}

// This helper handles permissions logic.
function grantedPermissions(permissions = []) {
  return new Set(
    permissions
      .filter((permission) => permission?.status === "granted")
      .map((permission) => permission.permission),
  );
}

// Gets required whats app permissions.
export function getRequiredWhatsAppPermissions() {
  return [...REQUIRED_WHATSAPP_PERMISSIONS];
}

// Finds by id.
function findById(records = [], id = "") {
  return records.find((record) => record.id === id) || null;
}

// Builds whats app readiness.
export function buildWhatsAppReadiness(connection = whatsappConnection) {
  const connected = Boolean(connection.connected);
  const assets = connection.assets || emptyAssets();
  const selection = connection.selection || emptySelection();
  const selectedWaba = findById(assets.wabas, selection.wabaId);
  const selectedPhoneNumber = findById(assets.phoneNumbers, selection.phoneNumberId);
  const selectedTemplate = findById(assets.templates, selection.templateId);
  // Handles templates.
  const approvedTemplates = (assets.templates || []).filter((template) => template.status === "APPROVED");
  const granted = grantedPermissions(connection.permissions);
  const missingPermissions = REQUIRED_WHATSAPP_PERMISSIONS.filter((permission) => !granted.has(permission));
  let blockingReason = "";
  let blockingCode = "";

  if (!connected) {
    blockingReason = "Connect WhatsApp Business before sending a test template message.";
    blockingCode = "WHATSAPP_NOT_CONNECTED";
  } else if (missingPermissions.length) {
    blockingReason = "WhatsApp permissions are incomplete. Reconnect and grant WhatsApp Business access.";
    blockingCode = "INSUFFICIENT_PERMISSION";
  } else if (!(assets.wabas || []).length) {
    blockingReason = "No WhatsApp Business Account found. Complete WhatsApp Business setup in Meta Business Manager.";
    blockingCode = "NO_WABA";
  } else if (!selectedWaba) {
    blockingReason = "Select a WhatsApp Business Account.";
    blockingCode = "NO_WABA";
  } else if (!(assets.phoneNumbers || []).length) {
    blockingReason = "No registered WhatsApp business phone number found for this account.";
    blockingCode = "NO_PHONE_NUMBER";
  } else if (!selectedPhoneNumber) {
    blockingReason = "Select a WhatsApp business phone number.";
    blockingCode = "NO_PHONE_NUMBER";
  } else if (!approvedTemplates.length) {
    blockingReason = "No approved WhatsApp message template found for this account.";
    blockingCode = "TEMPLATE_NOT_APPROVED";
  }

  return {
    connected,
    hasBusiness: Boolean((assets.businesses || []).length),
    hasWaba: Boolean((assets.wabas || []).length),
    hasSelectedWaba: Boolean(selectedWaba),
    hasPhoneNumber: Boolean((assets.phoneNumbers || []).length),
    hasSelectedPhoneNumber: Boolean(selectedPhoneNumber),
    hasApprovedTemplate: Boolean(approvedTemplates.length),
    hasSelectedApprovedTemplate: Boolean(selectedTemplate?.status === "APPROVED"),
    requiredPermissionsAvailable: !missingPermissions.length,
    readyToSend: connected && !blockingReason,
    blockingReason,
    blockingCode,
    missingPermissions,
  };
}

// This helper handles connection logic.
function publicConnection() {
  return {
    connected: whatsappConnection.connected,
    source: whatsappConnection.source,
    user: whatsappConnection.user,
    permissions: whatsappConnection.permissions,
    assets: whatsappConnection.assets,
    selection: whatsappConnection.selection,
    readiness: buildWhatsAppReadiness(whatsappConnection),
    connectedAt: whatsappConnection.connectedAt,
    lastError: whatsappConnection.lastError,
    lastTestResult: whatsappConnection.lastTestResult,
  };
}

// Gets whats app connection.
export function getWhatsAppConnection() {
  return whatsappConnection;
}

// Gets whats app public connection.
export function getWhatsAppPublicConnection() {
  return publicConnection();
}

// Sets whats app connection.
export function setWhatsAppConnection(nextConnection) {
  whatsappConnection = {
    ...whatsappConnection,
    ...nextConnection,
    connected: true,
    source: nextConnection.source || whatsappConnection.source || "oauth",
    lastError: "",
    connectedAt: nextConnection.connectedAt || new Date().toISOString(),
  };
  return publicConnection();
}

// Sets whats app connection error.
export function setWhatsAppConnectionError(message) {
  whatsappConnection = {
    ...whatsappConnection,
    connected: false,
    source: "",
    user: null,
    permissions: [],
    token: null,
    assets: emptyAssets(),
    selection: emptySelection(),
    connectedAt: null,
    lastError: message || "WhatsApp connection failed",
    lastTestResult: null,
  };
  return publicConnection();
}

// Updates whats app connection snapshot.
export function updateWhatsAppConnectionSnapshot({ user, permissions, assets, selection } = {}) {
  whatsappConnection = {
    ...whatsappConnection,
    connected: true,
    user: user || whatsappConnection.user,
    permissions: permissions || whatsappConnection.permissions,
    assets: assets || whatsappConnection.assets,
    selection: selection || whatsappConnection.selection,
    lastError: "",
  };
  return publicConnection();
}

// This helper handles whats app reconnect required logic.
export function markWhatsAppReconnectRequired(message) {
  whatsappConnection = {
    ...whatsappConnection,
    connected: false,
    source: whatsappConnection.source,
    user: null,
    permissions: [],
    token: null,
    connectedAt: null,
    lastError: message || "WhatsApp token expired. Reconnect WhatsApp Business to continue.",
  };
  return publicConnection();
}

// Saves whats app selection.
export function saveWhatsAppSelection(selection = {}) {
  whatsappConnection = {
    ...whatsappConnection,
    selection: {
      businessId: selection.businessId || "",
      wabaId: selection.wabaId || "",
      phoneNumberId: selection.phoneNumberId || "",
      templateId: selection.templateId || "",
    },
  };
  return publicConnection();
}

// Saves whats app test result.
export function saveWhatsAppTestResult(result) {
  whatsappConnection = {
    ...whatsappConnection,
    lastTestResult: result || null,
  };
  return publicConnection();
}

// Disconnects whats app connection.
export function disconnectWhatsAppConnection() {
  whatsappConnection = {
    connected: false,
    source: "",
    user: null,
    permissions: [],
    token: null,
    assets: emptyAssets(),
    selection: emptySelection(),
    connectedAt: null,
    lastError: "",
    lastTestResult: null,
  };
  return publicConnection();
}
