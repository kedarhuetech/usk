import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiCheck,
  FiCheckCircle,
  FiCopy,
  FiDownload,
  FiImage,
  FiMessageCircle,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiShare2,
  FiShield,
  FiTrash2,
  FiUpload,
  FiUser,
  FiUsers,
  FiX,
  FiZap,
} from "react-icons/fi";
import {
  whatsappMarketingCategories,
  whatsappMarketingDefaults,
  whatsappMarketingSubcategories,
} from "../../constants/whatsappMarketingData";
import {
  completeWhatsAppEmbeddedSignup,
  connectWhatsAppTestMode,
  disconnectWhatsAppBusiness,
  getWhatsAppAssets,
  getWhatsAppConnection,
  getWhatsAppConnectionStatus,
  getWhatsAppMarketingTemplates,
  prepareWhatsAppCampaign,
  saveWhatsAppSelection,
  sendWhatsAppTestMessage,
  startWhatsAppConnection,
  validateWhatsAppCampaign,
} from "../../services/whatsappBusinessService";

const EXPORT_WIDTH = 1080;
const EXPORT_PADDING = 54;
const EXPORT_TOP_HEIGHT = 132;
const EXPORT_BOTTOM_HEIGHT = 238;
const FACEBOOK_SDK_SCRIPT_ID = "facebook-jssdk";

const shareBackgroundPresets = [
  { id: "clean-white", label: "Clean White", base: "#ffffff", accent: "#e2e8f0", accent2: "#f8fafc", pattern: "diagonal", tone: "light" },
  { id: "soft-lavender", label: "Soft Lavender", base: "#f4f0ff", accent: "#c4b5fd", accent2: "#fdf4ff", pattern: "waves", tone: "light" },
  { id: "soft-blue", label: "Soft Blue", base: "#eff6ff", accent: "#bfdbfe", accent2: "#e0f2fe", pattern: "geometric", tone: "light" },
  { id: "warm-cream", label: "Warm Cream", base: "#fff7ed", accent: "#fed7aa", accent2: "#fef3c7", pattern: "diagonal", tone: "light" },
  { id: "light-geometric", label: "Light Geometric", base: "#f8fafc", accent: "#dbeafe", accent2: "#ede9fe", pattern: "geometric", tone: "light" },
  { id: "minimal-dots", label: "Minimal Dots", base: "#f8fafc", accent: "#cbd5e1", accent2: "#ffffff", pattern: "dots", tone: "light" },
  { id: "dark-navy", label: "Dark Navy", base: "#0f172a", accent: "#1d4ed8", accent2: "#38bdf8", pattern: "rays", tone: "dark" },
  { id: "dark-purple", label: "Dark Purple", base: "#1e1b4b", accent: "#7c3aed", accent2: "#c084fc", pattern: "rays", tone: "dark" },
];

const backgroundSwatches = ["#ffffff", "#f4f0ff", "#eff6ff", "#fff7ed", "#f8fafc", "#0f172a"];

function emptyWhatsAppAssets() {
  return {
    businesses: [],
    wabas: [],
    phoneNumbers: [],
    templates: [],
    warnings: [],
  };
}

function emptyWhatsAppSelection() {
  return {
    businessId: "",
    wabaId: "",
    phoneNumberId: "",
    templateId: "",
  };
}

function mergeWhatsAppStatus(previous = {}, next = {}) {
  return {
    ...previous,
    ...next,
    configured: next.configured ?? previous.configured,
    oauthConfigured: next.oauthConfigured ?? previous.oauthConfigured,
    embeddedSignupConfigured: next.embeddedSignupConfigured ?? previous.embeddedSignupConfigured,
    embeddedSignup: next.embeddedSignup ?? previous.embeddedSignup,
    testModeConfigured: next.testModeConfigured ?? previous.testModeConfigured,
    graphApiVersion: next.graphApiVersion ?? previous.graphApiVersion,
  };
}

function emptyWhatsAppReadiness() {
  return {
    connected: false,
    hasBusiness: false,
    hasWaba: false,
    hasSelectedWaba: false,
    hasPhoneNumber: false,
    hasSelectedPhoneNumber: false,
    hasApprovedTemplate: false,
    hasSelectedApprovedTemplate: false,
    requiredPermissionsAvailable: false,
    readyToSend: false,
    blockingReason: "Connect WhatsApp Business before creating campaigns.",
    blockingCode: "WHATSAPP_NOT_CONNECTED",
    missingPermissions: [],
  };
}

function resolveWhatsAppReadiness(status = {}, assets = emptyWhatsAppAssets(), selection = emptyWhatsAppSelection()) {
  if (status.readiness) return status.readiness;
  const connected = Boolean(status.connected);
  const hasWaba = Boolean(assets.wabas?.length);
  const hasSelectedWaba = Boolean(selection.wabaId && assets.wabas?.some((waba) => waba.id === selection.wabaId));
  const hasPhoneNumber = Boolean(assets.phoneNumbers?.length);
  const hasSelectedPhoneNumber = Boolean(selection.phoneNumberId && assets.phoneNumbers?.some((phone) => phone.id === selection.phoneNumberId));
  const hasApprovedTemplate = Boolean(assets.templates?.some((template) => template.status === "APPROVED"));
  const hasSelectedApprovedTemplate = Boolean(assets.templates?.some((template) => template.id === selection.templateId && template.status === "APPROVED"));
  let blockingReason = "";
  let blockingCode = "";

  if (!connected) {
    blockingReason = "Connect WhatsApp Business before creating campaigns.";
    blockingCode = "WHATSAPP_NOT_CONNECTED";
  } else if (!hasWaba) {
    blockingReason = "No WhatsApp Business Account found. Complete WhatsApp Business setup in Meta Business Manager.";
    blockingCode = "NO_WABA";
  } else if (!hasSelectedWaba) {
    blockingReason = "Select a WhatsApp Business Account.";
    blockingCode = "NO_WABA";
  } else if (!hasPhoneNumber) {
    blockingReason = "No registered WhatsApp business phone number found for this account.";
    blockingCode = "NO_PHONE_NUMBER";
  } else if (!hasSelectedPhoneNumber) {
    blockingReason = "Select a WhatsApp business phone number.";
    blockingCode = "NO_PHONE_NUMBER";
  } else if (!hasApprovedTemplate) {
    blockingReason = "No approved WhatsApp message template found for this account.";
    blockingCode = "TEMPLATE_NOT_APPROVED";
  }

  return {
    ...emptyWhatsAppReadiness(),
    connected,
    hasBusiness: Boolean(assets.businesses?.length),
    hasWaba,
    hasSelectedWaba,
    hasPhoneNumber,
    hasSelectedPhoneNumber,
    hasApprovedTemplate,
    hasSelectedApprovedTemplate,
    requiredPermissionsAvailable: true,
    readyToSend: connected && hasSelectedWaba && hasSelectedPhoneNumber && hasApprovedTemplate,
    blockingReason,
    blockingCode,
  };
}

function readWhatsAppCallbackNotice() {
  if (typeof window === "undefined") return { toast: "", error: "" };
  const params = new URLSearchParams(window.location.search);
  const whatsappStatus = params.get("whatsapp");
  const message = params.get("message") || "";

  if (whatsappStatus === "connected") return { toast: "WhatsApp Business connected. Select WABA, phone number, and approved template.", error: "" };
  if (whatsappStatus === "error") return { toast: "", error: message || "WhatsApp Business connection failed." };
  return { toast: "", error: "" };
}

function cleanWhatsAppCallbackNotice() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("whatsapp")) return;
  url.searchParams.delete("whatsapp");
  url.searchParams.delete("message");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function formatWhatsAppRequestError(error, fallback) {
  const details = error?.payload?.error;
  const message = details?.userMessage || details?.message || error?.payload?.message || error?.message || fallback;
  const metaParts = [
    error?.status ? `HTTP: ${error.status}` : "",
    details?.stage ? `Stage: ${details.stage}` : "",
    details?.code ? `Code: ${details.code}` : "",
    details?.subcode ? `Subcode: ${details.subcode}` : "",
    details?.fbtraceId ? `fbtrace_id: ${details.fbtraceId}` : "",
  ].filter(Boolean);
  return metaParts.length ? `${message} (${metaParts.join(", ")})` : message;
}

function isWhatsAppAuthOrDisconnectedError(error) {
  const category = error?.payload?.error?.category || error?.payload?.readiness?.blockingCode || "";
  return error?.status === 401 || ["WHATSAPP_NOT_CONNECTED", "TOKEN_EXPIRED"].includes(category);
}

function isWhatsAppConfigError(error) {
  return error?.status === 503 || error?.payload?.configured === false;
}

function parseWhatsAppEmbeddedSignupMessage(event) {
  if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return null;
  let payload = event.data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (payload?.type !== "WA_EMBEDDED_SIGNUP") return null;
  const data = payload.data || {};
  return {
    event: payload.event || "",
    businessId: data.business_id || data.businessId || "",
    wabaId: data.waba_id || data.wabaId || "",
    phoneNumberId: data.phone_number_id || data.phoneNumberId || "",
  };
}

function loadFacebookSdk({ appId, graphApiVersion }) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Facebook SDK can only be loaded in the browser."));
      return;
    }

    if (window.FB) {
      window.FB.init({ appId, cookie: true, xfbml: false, version: graphApiVersion });
      resolve(window.FB);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: graphApiVersion });
      resolve(window.FB);
    };

    const existingScript = document.getElementById(FACEBOOK_SDK_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        window.FB.init({ appId, cookie: true, xfbml: false, version: graphApiVersion });
        resolve(window.FB);
      }, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Unable to load Facebook SDK.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = FACEBOOK_SDK_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Unable to load Facebook SDK."));
    document.body.appendChild(script);
  });
}

async function startWhatsAppEmbeddedSignup(embeddedSignup = {}) {
  const { appId, graphApiVersion, loginConfigId } = embeddedSignup;
  if (!appId || !graphApiVersion || !loginConfigId) {
    throw new Error("WhatsApp Embedded Signup configuration is missing.");
  }

  const facebook = await loadFacebookSdk({ appId, graphApiVersion });
  let signupData = {};

  return new Promise((resolve, reject) => {
    const handleSignupMessage = (event) => {
      const parsed = parseWhatsAppEmbeddedSignupMessage(event);
      if (parsed) signupData = { ...signupData, ...parsed };
    };
    window.addEventListener("message", handleSignupMessage);

    facebook.login(
      (response) => {
        window.removeEventListener("message", handleSignupMessage);
        const code = response?.authResponse?.code || "";
        if (!code) {
          reject(new Error("Meta did not return a WhatsApp Embedded Signup authorization code."));
          return;
        }
        resolve({ code, signup: signupData });
      },
      {
        config_id: loginConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      },
    );
  });
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

function normalizePartyRecipient(record = {}, index = 0) {
  const name = record.partyName || record.name || record.customerName || record.displayName || "";
  const phone = record.phone || record.mobile || record.mobileNumber || record.contactNumber || "";
  if (!phone) return null;
  return {
    id: record.id || record.partyId || `party-${index}-${phone}`,
    name: name || phone,
    phone: String(phone),
    source: "party",
    optedIn: Boolean(record.whatsappOptIn || record.optedIn || record.consent?.whatsapp),
  };
}

function loadPartyRecipients() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const storageKeys = ["ledgerly:parties", "vyapar:parties", "parties", "ledgerly:customers", "vyapar:customers"];
  const byId = new Map();

  storageKeys.forEach((key) => {
    const records = safeParseJson(window.localStorage.getItem(key), []);
    if (!Array.isArray(records)) return;
    records.map(normalizePartyRecipient).filter(Boolean).forEach((recipient) => byId.set(recipient.id, recipient));
  });

  return Array.from(byId.values());
}

function templateHeaderFormat(template = {}) {
  const header = (template.components || []).find((component) => String(component.type || "").toUpperCase() === "HEADER");
  return String(header?.format || "").toUpperCase();
}

function templateBodyText(template = {}) {
  return (template.components || []).find((component) => String(component.type || "").toUpperCase() === "BODY")?.text || "";
}

function templateFriendlyName(template = {}) {
  const headerFormat = templateHeaderFormat(template);
  const channel = headerFormat === "IMAGE" ? "Poster image message" : headerFormat ? `${headerFormat.toLowerCase()} message` : "Text message";
  const category = template.category ? `${template.category.toLowerCase()} template` : "approved template";
  return `${channel} - ${category}`;
}

function renderTemplateMessage(template = {}, variables = {}, fallbackMessage = "") {
  const body = templateBodyText(template);
  if (!body) return fallbackMessage;
  return body.replace(/\{\{(\d+)\}\}/g, (_match, index) => variables[`body:${index}`] || `[${index}]`);
}

function selectedBusinessPhone(assets = emptyWhatsAppAssets(), selection = emptyWhatsAppSelection()) {
  return assets.phoneNumbers.find((phone) => phone.id === selection.phoneNumberId) || null;
}

function WhatsAppConnectionUnavailable({ error, onRetry, loading }) {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="max-w-md">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <FiAlertCircle className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-xl font-black text-slate-950">WhatsApp connection is temporarily unavailable</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          {error || "We could not reach the backend connection status right now."}
        </p>
        <button type="button" onClick={onRetry} disabled={loading} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-[#1A1F71] px-5 text-sm font-black text-white hover:bg-[#14185a] disabled:bg-slate-300">
          <FiRefreshCw />
          Retry
        </button>
      </div>
    </section>
  );
}

function WhatsAppOnboarding({ status, loading, onContinueMeta, productionConnectionError }) {
  const canUseMeta = Boolean(status.embeddedSignupConfigured || status.oauthConfigured);
  return (
    <section className="grid min-h-[460px] place-items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="max-w-lg">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <FiMessageCircle className="h-8 w-8" />
        </span>
        <p className="mt-6 text-sm font-black uppercase tracking-wide text-[#36A175]">WhatsApp Marketing</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">Connect WhatsApp Business</h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
          Connect your business WhatsApp account to create and send campaigns to your customers.
        </p>
        <p className="mt-2 text-xs font-bold text-slate-400">You'll securely connect your WhatsApp Business account through Meta.</p>
        {productionConnectionError && (
          <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-left text-xs font-bold leading-5 text-amber-800">
            <p className="font-black">Production connection unavailable</p>
            <p className="mt-1">{productionConnectionError}</p>
          </div>
        )}
        {!canUseMeta && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
            Production Meta onboarding is not configured yet. Use Developer/Test Mode below only for development test setup.
          </p>
        )}
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={onContinueMeta} disabled={loading || !canUseMeta} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1A1F71] px-5 text-sm font-black text-white hover:bg-[#14185a] disabled:bg-slate-300">
            <FiZap />
            Continue with Meta
          </button>
        </div>
      </div>
    </section>
  );
}

function WhatsAppTestModeStarter({ status, loading, error, onTestConnect }) {
  const testModeConfigured = Boolean(status.testModeConfigured);
  return (
    <section className="rounded-2xl border border-dashed border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Developer / Test Mode</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Use Meta Test WhatsApp Account</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Development-only Cloud API setup for validating one real approved-template message with backend env assets.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${testModeConfigured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {testModeConfigured ? "Backend test setup ready" : "Test env not configured"}
          </span>
          <button type="button" onClick={onTestConnect} disabled={loading || !testModeConfigured} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800 hover:bg-amber-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
            <FiShield />
            Use Meta Test WhatsApp Account
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-4 flex gap-2 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">
          <FiAlertCircle className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

function WhatsAppConfigurationError({ onManageConnection }) {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-2xl border border-amber-100 bg-white p-6 text-center shadow-sm">
      <div className="max-w-md">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <FiAlertCircle className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-xl font-black text-slate-950">WhatsApp setup is not configured</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          The backend needs Meta WhatsApp OAuth settings before customers can connect a WhatsApp Business account.
        </p>
        <button type="button" onClick={onManageConnection} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50">
          <FiShield />
          Manage Connection
        </button>
      </div>
    </section>
  );
}

function WhatsAppSetupIncomplete({ readiness, assets, selection, onManageConnection }) {
  const phone = selectedBusinessPhone(assets, selection);
  return (
    <section className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-black text-amber-700">WhatsApp setup incomplete</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Complete connection before creating campaigns</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Campaigns unlock only after the backend confirms a valid connection, WABA, business phone number, and at least one approved template.
          </p>
        </div>
        <button type="button" onClick={onManageConnection} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1A1F71] px-4 text-sm font-black text-white hover:bg-[#14185a]">
          <FiShield />
          Manage Connection
        </button>
      </div>
      <div className="mt-5 grid gap-3 rounded-xl bg-amber-50 p-4 sm:grid-cols-2">
        <RequirementRow ok={readiness.connected} label="Connection" helper={readiness.connected ? "Connected" : "Not connected"} />
        <RequirementRow ok={readiness.hasSelectedWaba} label="WhatsApp Business Account" helper={readiness.hasWaba ? "Select WABA" : "No WABA found"} />
        <RequirementRow ok={readiness.hasSelectedPhoneNumber} label="Business phone" helper={phone?.displayPhoneNumber || (readiness.hasPhoneNumber ? "Select phone number" : "No phone number found")} />
        <RequirementRow ok={readiness.hasSelectedApprovedTemplate} label="Approved templates" helper={readiness.hasApprovedTemplate ? `${assets.templates.filter((template) => template.status === "APPROVED").length} approved loaded` : "No approved template found"} />
      </div>
      {readiness.blockingReason && <p className="mt-4 text-sm font-bold text-amber-800">{readiness.blockingReason}</p>}
    </section>
  );
}

function WhatsAppConnectedBar({ status, assets, selection, onManageConnection }) {
  const phone = selectedBusinessPhone(assets, selection);
  const approvedCount = assets.templates.filter((template) => template.status === "APPROVED").length;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-700">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
          <FiCheckCircle />
          WhatsApp Business: Connected
        </span>
        <span>Business phone: {phone?.displayPhoneNumber || phone?.verifiedName || "Selected"}</span>
        <span>Approved templates: {approvedCount}</span>
        {status.source === "test_env" && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">Test mode</span>}
      </div>
      <button type="button" onClick={onManageConnection} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 hover:bg-white">
        <FiShield />
        Manage Connection
      </button>
    </section>
  );
}

function extractTemplateVariables(template = {}) {
  const variables = [];
  (template.components || []).forEach((component) => {
    const type = String(component.type || "").toUpperCase();
    const text = String(component.text || "");
    if (!["HEADER", "BODY"].includes(type) || !text) return;
    const matches = text.match(/\{\{\d+\}\}/g) || [];
    [...new Set(matches.map((match) => Number(match.replace(/[{}]/g, ""))).filter(Boolean))].forEach((index) => {
      variables.push({ componentType: type.toLowerCase(), index, key: `${type.toLowerCase()}:${index}` });
    });
  });
  return variables.sort((a, b) => a.componentType.localeCompare(b.componentType) || a.index - b.index);
}

function hexToRgb(hex = "#ffffff") {
  const cleanHex = hex.replace("#", "");
  const normalized = cleanHex.length === 3 ? cleanHex.split("").map((char) => char + char).join("") : cleanHex;
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return { r: 255, g: 255, b: 255 };
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function isDarkColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 132;
}

function selectedPreset(background) {
  return shareBackgroundPresets.find((preset) => preset.id === background.presetId) || shareBackgroundPresets[0];
}

function shareCardTheme(background) {
  const preset = selectedPreset(background);
  const dark = preset.tone === "dark" || isDarkColor(background.color);
  return {
    preset,
    dark,
    primary: dark ? "#f8fafc" : "#0f172a",
    secondary: dark ? "#cbd5e1" : "#64748b",
    accent: dark ? "#a5b4fc" : "#4f46e5",
    border: dark ? "rgba(255,255,255,0.18)" : "rgba(148,163,184,0.28)",
    logoBg: dark ? "rgba(255,255,255,0.12)" : "#ffffff",
  };
}

function backgroundStyle(background) {
  const { preset } = shareCardTheme(background);
  const opacity = Math.max(Number(background.intensity || 0), 0) / 100;
  const color = background.color || preset.base;
  const accent = preset.accent;
  const accent2 = preset.accent2;

  if (preset.pattern === "dots") {
    return {
      backgroundColor: color,
      backgroundImage: `radial-gradient(${accent} ${Math.max(opacity * 1.8, 0.35)}px, transparent ${Math.max(opacity * 1.8, 0.35)}px)`,
      backgroundSize: "18px 18px",
    };
  }

  if (preset.pattern === "geometric") {
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(135deg, ${accent} ${opacity * 18}%, transparent ${opacity * 18 + 18}%), linear-gradient(45deg, transparent 55%, ${accent2} 56%, transparent 72%)`,
      backgroundSize: "96px 96px",
    };
  }

  if (preset.pattern === "waves") {
    return {
      backgroundColor: color,
      backgroundImage: `radial-gradient(circle at 16% 8%, ${accent} 0, transparent ${18 + opacity * 24}%), radial-gradient(circle at 88% 18%, ${accent2} 0, transparent ${16 + opacity * 22}%)`,
    };
  }

  if (preset.pattern === "rays") {
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(135deg, transparent 0 58%, ${accent} 59%, transparent 72%), radial-gradient(circle at 90% 0%, ${accent2} 0, transparent ${22 + opacity * 20}%)`,
    };
  }

  return {
    backgroundColor: color,
    backgroundImage: `linear-gradient(135deg, transparent 0 48%, ${accent} 49%, transparent ${64 + opacity * 10}%), linear-gradient(160deg, transparent 0 70%, ${accent2} 71%, transparent 88%)`,
  };
}

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      {children}
    </label>
  );
}

function drawContain(ctx, image, x, y, width, height) {
  const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load poster image."));
    image.src = src;
  });
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawCanvasBackground(ctx, background, width, height) {
  const { preset } = shareCardTheme(background);
  const color = background.color || preset.base;
  const intensity = Math.max(Number(background.intensity || 0), 0) / 100;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = Math.min(0.5, intensity + 0.08);

  if (preset.pattern === "dots") {
    ctx.fillStyle = preset.accent;
    for (let x = 16; x < width; x += 42) {
      for (let y = 16; y < height; y += 42) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2 + intensity * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (preset.pattern === "geometric") {
    ctx.fillStyle = hexToRgba(preset.accent, 0.42);
    for (let x = -80; x < width; x += 170) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 120, 0);
      ctx.lineTo(x + 35, height);
      ctx.lineTo(x - 85, height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = hexToRgba(preset.accent2, 0.35);
    ctx.beginPath();
    ctx.arc(width * 0.9, height * 0.16, width * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (preset.pattern === "waves") {
    const left = ctx.createRadialGradient(width * 0.12, height * 0.1, 0, width * 0.12, height * 0.1, width * 0.42);
    left.addColorStop(0, hexToRgba(preset.accent, 0.55));
    left.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, width, height);

    const right = ctx.createRadialGradient(width * 0.88, height * 0.18, 0, width * 0.88, height * 0.18, width * 0.36);
    right.addColorStop(0, hexToRgba(preset.accent2, 0.48));
    right.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = right;
    ctx.fillRect(0, 0, width, height);
  } else if (preset.pattern === "rays") {
    ctx.fillStyle = hexToRgba(preset.accent, 0.5);
    ctx.beginPath();
    ctx.moveTo(width * 0.68, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width * 0.8, height);
    ctx.lineTo(width * 0.54, height);
    ctx.closePath();
    ctx.fill();

    const glow = ctx.createRadialGradient(width, 0, 0, width, 0, width * 0.55);
    glow.addColorStop(0, hexToRgba(preset.accent2, 0.58));
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = hexToRgba(preset.accent, 0.35);
    ctx.beginPath();
    ctx.moveTo(width * 0.72, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width * 0.82, height);
    ctx.lineTo(width * 0.58, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexToRgba(preset.accent2, 0.3);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.72);
    ctx.lineTo(width * 0.38, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawWrappedText(ctx, value, x, y, width, { fontSize, color, weight = 700, align = "left", maxLines = 2 }) {
  if (!value?.trim()) return;

  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.font = `${weight} ${fontSize}px Inter, Arial, sans-serif`;

  const words = value.trim().split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });
  if (line) lines.push(line);

  const drawX = align === "center" ? x + width / 2 : align === "right" ? x + width : x;
  lines.slice(0, maxLines).forEach((text, index) => {
    ctx.fillText(text, drawX, y + index * fontSize * 1.18);
  });
}

function drawTextElement(ctx, textElement, canvasWidth, canvasHeight) {
  if (!textElement?.text?.trim()) return;

  const x = (textElement.x / 100) * canvasWidth;
  const y = (textElement.y / 100) * canvasHeight;
  const maxWidth = canvasWidth * 0.9;
  const fontSize = textElement.fontSize || 40;
  const align = textElement.textAlign || "center";

  ctx.save();
  ctx.fillStyle = textElement.color || "#000000";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = `${textElement.fontWeight || 700} ${fontSize}px Inter, Arial, sans-serif`;

  const lines = [];
  String(textElement.text).split(/\n/).forEach((paragraph) => {
    const wordsInLine = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    wordsInLine.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    lines.push(line);
  });

  const lineHeight = fontSize * 1.2;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + index * lineHeight);
  });

  ctx.restore();
}

function OverlayPreview({
  template,
  values,
  logoPreview,
  background,
  textElements = [],
  selectedTextId,
  onSelectText,
  onUpdateTextPosition,
  onDeselectText,
}) {
  const theme = shareCardTheme(background);
  const cardRef = useRef(null);
  const dragStateRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width) setScale(width / EXPORT_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function handleTextPointerDown(event, textElement) {
    event.stopPropagation();
    event.preventDefault();
    onSelectText?.(textElement.id);
    const node = cardRef.current;
    if (!node) return;
    dragStateRef.current = { id: textElement.id, rect: node.getBoundingClientRect() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleTextPointerMove(event) {
    const drag = dragStateRef.current;
    if (!drag) return;
    const { rect, id } = drag;
    let xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    let yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    xPercent = Math.min(98, Math.max(2, xPercent));
    yPercent = Math.min(98, Math.max(2, yPercent));
    onUpdateTextPosition?.(id, xPercent, yPercent);
  }

  function handleTextPointerUp() {
    dragStateRef.current = null;
  }

  return (
    <div className="mx-auto flex h-full w-full items-center justify-center">
      <div
        ref={cardRef}
        onClick={() => onDeselectText?.()}
        className="relative flex aspect-[1080/1360] max-h-full w-full max-w-[440px] flex-col overflow-hidden rounded-2xl p-3.5 shadow-xl ring-1"
        style={{ ...backgroundStyle(background), color: theme.primary, borderColor: theme.border }}
      >
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b pb-2.5" style={{ borderColor: theme.border }}>
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl ring-1" style={{ backgroundColor: theme.logoBg, borderColor: theme.border }}>
            {logoPreview ? (
              <img src={logoPreview} alt="Business logo" className="h-full w-full object-contain p-1.5" />
            ) : (
              <span className="grid place-items-center gap-1 text-[9px] font-black uppercase leading-none" style={{ color: theme.secondary }}>
                <FiImage className="h-3.5 w-3.5" />
                Your Logo
              </span>
            )}
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-extrabold sm:text-base" style={{ color: theme.primary }}>{values.businessName || "Business Name"}</p>
            <p className="truncate text-xs font-semibold" style={{ color: theme.secondary }}>{values.contactPerson || "Contact Person"}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center py-2.5">
          <img src={template.image} alt={template.title} className="mx-auto max-h-full w-full rounded-xl object-contain shadow-lg" />
        </div>

        <div className="shrink-0 space-y-1.5 border-t pt-2.5 text-center" style={{ borderColor: theme.border }}>
          <p className="text-xs font-extrabold sm:text-sm" style={{ color: theme.accent }}>{values.additionalText || "Add your message here"}</p>
          <p className="text-xs font-bold sm:text-sm" style={{ color: theme.primary }}>{values.contactNumber || "Contact Number"}</p>
          <p className="text-[11px] font-medium leading-4 sm:text-xs" style={{ color: theme.secondary }}>{values.whatsappText || whatsappMarketingDefaults.whatsappText}</p>
        </div>

        {textElements.map((textElement) => (
          <div
            key={textElement.id}
            onPointerDown={(event) => handleTextPointerDown(event, textElement)}
            onPointerMove={handleTextPointerMove}
            onPointerUp={handleTextPointerUp}
            onClick={(event) => event.stopPropagation()}
            className={`absolute max-w-[92%] cursor-move select-none whitespace-pre-wrap break-words rounded px-1 leading-tight ${
              selectedTextId === textElement.id ? "outline outline-2 outline-dashed outline-[#6D4AFF] outline-offset-2" : ""
            }`}
            style={{
              left: `${textElement.x}%`,
              top: `${textElement.y}%`,
              transform: "translate(-50%, -50%)",
              fontSize: `${Math.max((textElement.fontSize || 40) * scale, 8)}px`,
              fontWeight: textElement.fontWeight || 700,
              color: textElement.color || "#000000",
              textAlign: textElement.textAlign || "center",
            }}
          >
            {textElement.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function BackgroundPanel({ background, setBackground, activeTab, setActiveTab }) {
  const updateBackground = (updates) => setBackground((current) => ({ ...current, ...updates }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-600">Background</p>
        <div className="mt-3 grid grid-cols-2 rounded-full bg-slate-100 p-1.5 text-xs font-bold">
          {["presets", "custom"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3 py-2 capitalize transition ${activeTab === tab ? "bg-white text-[#1A1F71] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "presets" ? (
        <div className="grid grid-cols-2 gap-3.5">
          {shareBackgroundPresets.map((preset) => {
            const selected = background.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => updateBackground({ presetId: preset.id, color: preset.base })}
                className={`relative h-[70px] overflow-hidden rounded-xl border text-left transition ${selected ? "border-[#6D4AFF] ring-2 ring-[#6D4AFF]/20" : "border-slate-200 hover:border-[#6D4AFF]/50"}`}
                style={backgroundStyle({ ...background, presetId: preset.id, color: preset.base, intensity: 32 })}
                title={preset.label}
              >
                {selected && (
                  <span className="absolute bottom-2 left-2 grid h-5 w-5 place-items-center rounded-full bg-[#6D4AFF] text-white shadow">
                    <FiCheck className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
            Custom Color
            <input
              type="color"
              value={background.color}
              onChange={(event) => updateBackground({ color: event.target.value })}
              className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-slate-500">Use a neutral brand color that keeps text readable.</p>
        </div>
      )}

      <div className="border-t border-slate-100 pt-5">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">Background Color</p>
        <div className="flex flex-wrap gap-2">
          {backgroundSwatches.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => updateBackground({ color })}
              className={`grid h-8 w-8 place-items-center rounded-full border ${background.color === color ? "border-[#6D4AFF] ring-2 ring-[#6D4AFF]/20" : "border-slate-200"}`}
              style={{ backgroundColor: color }}
              aria-label={`Use background color ${color}`}
            >
              {background.color === color && <FiCheck className={`h-4 w-4 ${isDarkColor(color) ? "text-white" : "text-[#6D4AFF]"}`} />}
            </button>
          ))}
        </div>
      </div>

      <label className="block border-t border-slate-100 pt-5">
        <span className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-600">
          Pattern Intensity
          <b className="text-slate-500">{background.intensity}%</b>
        </span>
        <input
          type="range"
          min="0"
          max="55"
          value={background.intensity}
          onChange={(event) => updateBackground({ intensity: Number(event.target.value) })}
          className="w-full accent-[#6D4AFF]"
        />
      </label>
    </div>
  );
}

function TextElementPanel({
  values,
  textElements,
  selectedTextId,
  onSelectText,
  onAddText,
  onQuickAddText,
  onUpdateText,
  onDeleteText,
  onDuplicateText,
}) {
  const selected = textElements.find((textElement) => textElement.id === selectedTextId) || null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-600">Poster Text</p>
        <button
          type="button"
          onClick={() => onAddText()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#6D4AFF] px-3 text-xs font-black text-white hover:bg-[#5938e8]"
        >
          <FiPlus className="h-3.5 w-3.5" />
          Add Text
        </button>
      </div>

      {textElements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-500">
          No text added yet. Use "Add Text" to place text on the poster, then drag it into position.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {textElements.map((textElement, index) => (
            <button
              key={textElement.id}
              type="button"
              onClick={() => onSelectText(textElement.id)}
              className={`max-w-[140px] truncate rounded-full px-3 py-1.5 text-xs font-bold transition ${
                selectedTextId === textElement.id ? "bg-[#1A1F71] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {textElement.text?.trim() || `Text ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      {values && (
        <div className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">Add business info as text</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onQuickAddText(values.businessName || "Business Name")} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">
              Business Name
            </button>
            <button type="button" onClick={() => onQuickAddText(values.contactPerson || "Contact Person")} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">
              Contact Person
            </button>
            <button type="button" onClick={() => onQuickAddText(values.contactNumber || "Contact Number")} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">
              Contact Number
            </button>
            <button type="button" onClick={() => onQuickAddText(values.additionalText || "Offer / Message")} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">
              Additional Text
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-600">Selected Text</p>

          <label className="block">
            <span className="mb-2 block text-xs font-bold text-slate-500">Text</span>
            <textarea
              value={selected.text}
              onChange={(event) => onUpdateText(selected.id, { text: event.target.value })}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6D4AFF]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">Font Size</span>
              <input
                type="number"
                min={12}
                max={140}
                value={selected.fontSize}
                onChange={(event) => onUpdateText(selected.id, { fontSize: Number(event.target.value) || selected.fontSize })}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6D4AFF]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">Color</span>
              <input
                type="color"
                value={selected.color}
                onChange={(event) => onUpdateText(selected.id, { color: event.target.value })}
                className="h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              />
            </label>
          </div>

          <label className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
            <span className="text-xs font-bold text-slate-500">Weight</span>
            <button
              type="button"
              onClick={() => onUpdateText(selected.id, { fontWeight: selected.fontWeight >= 700 ? 400 : 700 })}
              className={`h-8 rounded-full px-3 text-xs font-black ${selected.fontWeight >= 700 ? "bg-[#1A1F71] text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {selected.fontWeight >= 700 ? "Bold" : "Normal"}
            </button>
          </label>

          <div>
            <span className="mb-2 block text-xs font-bold text-slate-500">Alignment</span>
            <div className="grid grid-cols-3 gap-2">
              {["left", "center", "right"].map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => onUpdateText(selected.id, { textAlign: align })}
                  className={`h-9 rounded-lg text-xs font-black capitalize ${
                    selected.textAlign === align ? "bg-[#1A1F71] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {align}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => onDuplicateText(selected.id)}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              <FiCopy className="h-3.5 w-3.5" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => onDeleteText(selected.id)}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-100 bg-white text-xs font-black text-rose-600 hover:bg-rose-50"
            >
              <FiTrash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsAppAssetSelect({ label, value, options, emptyLabel, onChange, getOptionLabel, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || !options.length}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#36A175] disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {getOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function RequirementRow({ ok, label, helper }) {
  return (
    <div className="flex items-start gap-2 text-xs font-bold leading-5">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
        {ok ? <FiCheck className="h-3 w-3" /> : <FiAlertCircle className="h-3 w-3" />}
      </span>
      <span>
        <span className={ok ? "text-slate-800" : "text-amber-700"}>{label}</span>
        {helper && <span className="block font-semibold text-slate-500">{helper}</span>}
      </span>
    </div>
  );
}

function templateStatusClass(status) {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  if (status === "PAUSED" || status === "DISABLED") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

function productionWhatsAppConfigured(status = {}) {
  return Boolean(status.embeddedSignupConfigured || status.oauthConfigured);
}

function whatsappMissingSetupCategories(status = {}) {
  const missing = [];
  if (!productionWhatsAppConfigured(status)) missing.push("Production Meta WhatsApp onboarding");
  if (!status.testModeConfigured) missing.push("Developer test-mode assets");
  return missing;
}

function resolveManageConnectionState(status = {}, readiness = emptyWhatsAppReadiness()) {
  if (!productionWhatsAppConfigured(status) && !status.connected) return "CONFIGURATION_ERROR";
  if (!status.connected && /token|permission|reconnect/i.test(status.lastError || readiness.blockingReason || "")) return "AUTH_ERROR";
  if (!status.connected) return "NOT_CONNECTED";
  if (readiness.readyToSend) return "READY";
  if (["TOKEN_EXPIRED", "INSUFFICIENT_PERMISSION"].includes(readiness.blockingCode) || /token|permission|reconnect/i.test(readiness.blockingReason || "")) return "AUTH_ERROR";
  return "CONNECTED_INCOMPLETE";
}

function selectedBusinessName(assets = emptyWhatsAppAssets(), selection = emptyWhatsAppSelection(), status = {}) {
  const business = assets.businesses.find((item) => item.id === selection.businessId);
  const waba = assets.wabas.find((item) => item.id === selection.wabaId);
  return business?.name || waba?.name || waba?.businessName || status.user?.name || "WhatsApp Business";
}

function canShowWhatsAppDeveloperTools(status = {}) {
  if (!status.testModeConfigured && status.source !== "test_env") return false;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  return host === "localhost" || host === "127.0.0.1" || params.get("whatsappDev") === "1" || window.localStorage?.getItem("vyapar:whatsapp-dev-tools") === "1";
}

function WhatsAppBusinessPanel({
  status,
  assets,
  selection,
  loading,
  error,
  sendState,
  onConnect,
  onTestConnect,
  onRefresh,
  onDisconnect,
  onSelectionChange,
  onSaveSelection,
  onSendTest,
  testForm,
  setTestForm,
  developerToolsEnabled = false,
}) {
  const configured = status.configured !== false;
  const connected = Boolean(status.connected);
  const usingTestMode = status.source === "test_env";
  const testModeConfigured = Boolean(status.testModeConfigured && (developerToolsEnabled || usingTestMode));
  const readiness = resolveWhatsAppReadiness(status, assets, selection);
  const manageState = resolveManageConnectionState(status, readiness);
  const productionConfigured = productionWhatsAppConfigured(status);
  const missingSetup = whatsappMissingSetupCategories(status);
  const approvedTemplates = assets.templates.filter((template) => template.status === "APPROVED");
  const selectedTemplate = assets.templates.find((template) => template.id === selection.templateId);
  const templateVariables = extractTemplateVariables(selectedTemplate);
  const saveDisabled = loading || !selection.wabaId || !selection.phoneNumberId || !selection.templateId;
  const sendDisabled = loading || sendState.loading || !readiness.readyToSend || !selection.templateId || !testForm.optInConfirmed;
  const phone = selectedBusinessPhone(assets, selection);
  const businessName = selectedBusinessName(assets, selection, status);
  const showTestPanel = developerToolsEnabled || usingTestMode;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`grid gap-5 ${showTestPanel ? "xl:grid-cols-[1fr_420px]" : ""}`}>
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#36A175]">WhatsApp Business Connection</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Official Cloud API foundation</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                Connect Meta, verify the business sender phone, and load approved WhatsApp templates.
              </p>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${readiness.readyToSend ? "bg-emerald-50 text-emerald-700" : connected ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
              {readiness.readyToSend ? (usingTestMode ? "Ready for test" : "Ready") : connected ? "Setup required" : testModeConfigured ? "Test setup available" : configured ? "Disconnected" : "Config missing"}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            {manageState === "CONFIGURATION_ERROR" && (
              <div>
                <p className="text-sm font-black text-amber-800">WhatsApp setup is not configured for this environment.</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Missing setup category: {missingSetup.length ? missingSetup.join(", ") : "Production connection details"}.
                </p>
                {!productionConfigured && (
                  <p className="mt-2 text-xs font-bold text-amber-700">
                    Continue with Meta is disabled until production Embedded Signup or OAuth configuration is available.
                  </p>
                )}
              </div>
            )}
            {manageState === "NOT_CONNECTED" && (
              <div>
                <p className="text-sm font-black text-slate-950">Connect WhatsApp Business</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Start Meta onboarding to connect a business sender phone and approved templates.</p>
              </div>
            )}
            {manageState === "AUTH_ERROR" && (
              <div>
                <p className="text-sm font-black text-amber-800">WhatsApp Business connection needs to be reconnected.</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Reconnect through Meta so permissions, templates, and sender phone access can be verified again.</p>
              </div>
            )}
            {manageState === "CONNECTED_INCOMPLETE" && (
              <div>
                <p className="text-sm font-black text-amber-800">Finish WhatsApp Business setup</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Select a WABA, business phone, and load approved templates before campaigns unlock.</p>
              </div>
            )}
            {manageState === "READY" && (
              <div>
                <p className="text-sm font-black text-emerald-700">{businessName}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Sender phone: {phone?.displayPhoneNumber || phone?.verifiedName || "Selected"} - Approved templates: {approvedTemplates.length}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
            <RequirementRow ok={connected} label="Meta authorization" helper={connected && status.user?.name ? `${usingTestMode ? "Test mode" : "Connected"} as ${status.user.name}` : testModeConfigured ? "Backend test setup ready" : "Required"} />
            <RequirementRow ok={readiness.hasSelectedWaba} label="WhatsApp Business Account" helper={readiness.hasWaba ? "Select one accessible WABA" : "No WABA found"} />
            <RequirementRow ok={readiness.hasSelectedPhoneNumber} label="Business phone number" helper={readiness.hasPhoneNumber ? "Registered phone_number_id required" : "No phone number found"} />
            <RequirementRow ok={readiness.hasSelectedApprovedTemplate} label="Approved message template" helper={readiness.hasApprovedTemplate ? "Only approved templates can be sent" : "No approved template found"} />
          </div>

          {error && (
            <div className="mt-4 flex gap-2 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">
              <FiAlertCircle className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!configured && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
              Add WhatsApp OAuth or test-mode env values on the Express backend before connecting.
            </div>
          )}

          {connected && readiness.blockingReason && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
              <p>{readiness.blockingReason}</p>
              {readiness.missingPermissions?.length ? <p className="mt-1">Missing: {readiness.missingPermissions.join(", ")}</p> : null}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {!connected ? (
              <>
                <button type="button" onClick={onConnect} disabled={loading || !(status.embeddedSignupConfigured || status.oauthConfigured)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1A1F71] px-4 text-sm font-bold text-white hover:bg-[#14185a] disabled:bg-slate-300">
                  <FiZap />
                  Continue with Meta
                </button>
                <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
                  <FiRefreshCw />
                  Retry
                </button>
                {testModeConfigured && (
                  <button type="button" onClick={onTestConnect} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:text-slate-300">
                    <FiShield />
                    Use Meta Test Setup
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={onSaveSelection} disabled={saveDisabled} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#36A175] px-4 text-sm font-bold text-white hover:bg-[#2c8a64] disabled:bg-slate-300">
                  <FiCheckCircle />
                  Save Selection
                </button>
                <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
                  <FiRefreshCw />
                  Refresh
                </button>
                <button type="button" onClick={usingTestMode ? onTestConnect : onConnect} disabled={loading || (!usingTestMode && !(status.embeddedSignupConfigured || status.oauthConfigured))} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
                  <FiZap />
                  {usingTestMode ? "Reload Test Setup" : "Reconnect"}
                </button>
                <button type="button" onClick={onDisconnect} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-100 bg-white px-4 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:text-slate-300">
                  <FiX />
                  Disconnect
                </button>
              </>
            )}
          </div>

          {connected && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <WhatsAppAssetSelect
                label="Business Portfolio"
                value={selection.businessId}
                options={assets.businesses}
                emptyLabel={assets.businesses.length ? "Select Business Portfolio" : "No Business Portfolio found"}
                onChange={(value) => onSelectionChange({ businessId: value, wabaId: "", phoneNumberId: "", templateId: "" })}
                getOptionLabel={(business) => [business.name, business.verificationStatus].filter(Boolean).join(" - ")}
              />
              <WhatsAppAssetSelect
                label="WhatsApp Business Account"
                value={selection.wabaId}
                options={assets.wabas}
                emptyLabel={assets.wabas.length ? "Select WhatsApp Business Account" : "No WABA found"}
                onChange={(value) => onSelectionChange({ wabaId: value, phoneNumberId: "", templateId: "" })}
                getOptionLabel={(waba) => [waba.name, waba.businessName].filter(Boolean).join(" - ")}
              />
              <WhatsAppAssetSelect
                label="Business Phone Number"
                value={selection.phoneNumberId}
                options={assets.phoneNumbers}
                emptyLabel={assets.phoneNumbers.length ? "Select phone number" : "No phone number found"}
                onChange={(value) => onSelectionChange({ phoneNumberId: value })}
                getOptionLabel={(phone) => [phone.displayPhoneNumber, phone.verifiedName, phone.qualityRating].filter(Boolean).join(" - ")}
              />
              <WhatsAppAssetSelect
                label="Approved Message Template"
                value={selection.templateId}
                options={approvedTemplates}
                emptyLabel={approvedTemplates.length ? "Select approved template" : "No approved template found"}
                onChange={(value) => onSelectionChange({ templateId: value })}
                getOptionLabel={(template) => `${template.name} (${template.language})`}
              />
            </div>
          )}

          {connected && assets.templates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {assets.templates.slice(0, 8).map((template) => (
                <span key={template.id} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${templateStatusClass(template.status)}`}>
                  {template.name} - {template.status}
                </span>
              ))}
            </div>
          )}
        </div>

        {showTestPanel && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <FiShield />
            </span>
            <div>
              <p className="text-sm font-black text-slate-950">Single real test send</p>
              <p className="text-xs font-semibold text-slate-500">Template message only. No bulk sending yet.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[96px_1fr] gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Code</span>
              <input value={testForm.countryCode} onChange={(event) => setTestForm((current) => ({ ...current, countryCode: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#36A175]" placeholder="+91" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Test Recipient</span>
              <input value={testForm.phoneNumber} onChange={(event) => setTestForm((current) => ({ ...current, phoneNumber: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#36A175]" placeholder="9876543210" />
            </label>
          </div>

          {templateVariables.length > 0 && (
            <div className="mt-4 space-y-3">
              {templateVariables.map((variable) => (
                <label key={variable.key} className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
                    {variable.componentType} variable {variable.index}
                  </span>
                  <input
                    value={testForm.variables[variable.key] || ""}
                    onChange={(event) => setTestForm((current) => ({ ...current, variables: { ...current.variables, [variable.key]: event.target.value } }))}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#36A175]"
                    placeholder={`Value for {{${variable.index}}}`}
                  />
                </label>
              ))}
            </div>
          )}

          <label className="mt-4 flex items-start gap-2 rounded-lg bg-white p-3 text-xs font-bold leading-5 text-slate-600">
            <input type="checkbox" checked={testForm.optInConfirmed} onChange={(event) => setTestForm((current) => ({ ...current, optInConfirmed: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#36A175]" />
            I confirm this recipient opted in or is authorized for this test message.
          </label>

          <button type="button" onClick={onSendTest} disabled={sendDisabled} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1A1F71] px-4 text-sm font-bold text-white hover:bg-[#14185a] disabled:bg-slate-300">
            <FiSend />
            {sendState.loading ? "Sending..." : "Send Test Message"}
          </button>

          {sendState.message && (
            <div className={`mt-4 rounded-lg p-3 text-xs font-bold leading-5 ${sendState.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              <p>{sendState.message}</p>
              {sendState.messageId && <p className="mt-1 text-slate-600">Message ID: {sendState.messageId}</p>}
            </div>
          )}
        </div>
        )}
      </div>
    </section>
  );
}

function splitRecipientPhone(recipient = {}) {
  const raw = String(recipient.phone || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+") && digits.length > 10) {
    return {
      countryCode: `+${digits.slice(0, digits.length - 10)}`,
      phone: digits.slice(-10),
    };
  }
  return {
    countryCode: recipient.countryCode || "+91",
    phone: digits,
  };
}

function resolveSendConnectionState(status = {}, assets = emptyWhatsAppAssets(), selection = emptyWhatsAppSelection(), connectionCheck = {}) {
  if (connectionCheck.loading) return "LOADING";
  if (connectionCheck.error) return "TEMPORARILY_UNAVAILABLE";
  const readiness = resolveWhatsAppReadiness(status, assets, selection);
  const productionReady = Boolean(status.connected && status.source !== "test_env" && readiness.readyToSend);

  if (productionReady) return "READY";
  if (status.configured === false || (!status.embeddedSignupConfigured && !status.oauthConfigured)) return "CONFIGURATION_ERROR";
  if (!status.connected && /token|permission|reconnect/i.test(status.lastError || readiness.blockingReason || "")) return "AUTH_ERROR";
  if (!status.connected) return "NOT_CONNECTED";
  if (["TOKEN_EXPIRED", "INSUFFICIENT_PERMISSION"].includes(readiness.blockingCode) || /token|permission|reconnect/i.test(readiness.blockingReason || "")) return "AUTH_ERROR";
  return "CONNECTED_INCOMPLETE";
}

function SendConnectionGate({ state, loading, error, onContinueMeta, onRetryConnection, onManageConnection }) {
  const content = {
    NOT_CONNECTED: {
      title: "Connect WhatsApp Business",
      text: "Connect your business WhatsApp account before sending messages to customers.",
      action: "Continue with Meta",
      helper: "Messages are sent securely through Meta WhatsApp Cloud API.",
      onAction: onContinueMeta,
      iconClass: "bg-emerald-50 text-emerald-700",
    },
    CONFIGURATION_ERROR: {
      title: "WhatsApp connection is not configured for this environment.",
      text: "Ask the admin to finish production Meta WhatsApp setup before customer sending.",
      action: "Manage Connection",
      helper: "Messages are sent securely through Meta WhatsApp Cloud API.",
      onAction: onManageConnection,
      iconClass: "bg-amber-50 text-amber-700",
    },
    AUTH_ERROR: {
      title: "WhatsApp Business connection needs to be reconnected.",
      text: "Reconnect through Meta so approved templates and the sender phone can be verified again.",
      action: "Reconnect with Meta",
      helper: "Messages are sent securely through Meta WhatsApp Cloud API.",
      onAction: onContinueMeta,
      iconClass: "bg-amber-50 text-amber-700",
    },
    CONNECTED_INCOMPLETE: {
      title: "Finish WhatsApp Business setup",
      text: "Complete WhatsApp Business setup before sending messages to customers.",
      action: "Continue Setup",
      helper: "Messages are sent securely through Meta WhatsApp Cloud API.",
      onAction: onContinueMeta,
      iconClass: "bg-blue-50 text-blue-700",
    },
    TEMPORARILY_UNAVAILABLE: {
      title: "WhatsApp connection is temporarily unavailable",
      text: error || "We could not verify the WhatsApp connection right now.",
      action: "Retry",
      helper: "Messages are sent securely through Meta WhatsApp Cloud API.",
      onAction: onRetryConnection,
      iconClass: "bg-rose-50 text-rose-700",
    },
  };
  const current = content[state] || content.NOT_CONNECTED;

  return (
    <div className="grid min-h-[460px] place-items-center p-5 text-center">
      <div className="max-w-md">
        <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${current.iconClass}`}>
          {state === "LOADING" ? <FiRefreshCw className="h-8 w-8 animate-spin" /> : <FiMessageCircle className="h-8 w-8" />}
        </span>
        <h3 className="mt-5 text-2xl font-black text-slate-950">{state === "LOADING" ? "Checking WhatsApp connection..." : current.title}</h3>
        {state !== "LOADING" && <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">{current.text}</p>}
        {state !== "LOADING" && <p className="mt-2 text-xs font-bold text-slate-400">{current.helper}</p>}
        {state !== "LOADING" && (
          <button type="button" onClick={current.onAction} disabled={loading} className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1A1F71] px-5 text-sm font-black text-white hover:bg-[#14185a] disabled:bg-slate-300">
            <FiZap />
            {current.action}
          </button>
        )}
      </div>
    </div>
  );
}

function SendOnWhatsAppModal({ draft, status, assets, selection, connectionCheck, onClose, onContinueMeta, onRetryConnection, onManageConnection }) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  const [messageDraft, setMessageDraft] = useState({ caption: draft?.values?.whatsappText || whatsappMarketingDefaults.whatsappText, templateId: "", variables: {} });
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [campaignResult, setCampaignResult] = useState({ loading: false, success: false, message: "", errors: [], prepared: null });
  const [partyRecipients] = useState(() => loadPartyRecipients());
  const approvedTemplates = assets.templates.filter((template) => template.status === "APPROVED");
  const effectiveTemplateId = messageDraft.templateId || approvedTemplates[0]?.id || "";
  const selectedMetaTemplate = approvedTemplates.find((template) => template.id === effectiveTemplateId);
  const templateVariables = extractTemplateVariables(selectedMetaTemplate);
  const renderedMessage = renderTemplateMessage(selectedMetaTemplate, messageDraft.variables, messageDraft.caption);
  const selectedIds = new Set(selectedRecipientIds);
  const filteredRecipients = partyRecipients.filter((recipient) => `${recipient.name} ${recipient.phone}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedRecipients = partyRecipients.filter((recipient) => selectedIds.has(recipient.id));
  const canUseConnectedTemplates = Boolean(status.connected && approvedTemplates.length);
  const connectionState = resolveSendConnectionState(status, assets, selection, connectionCheck);
  const connectionReady = connectionState === "READY";

  function toggleRecipient(recipient) {
    setCampaignResult({ loading: false, success: false, message: "", errors: [], prepared: null });
    setSelectedRecipientIds((current) => (current.includes(recipient.id) ? current.filter((id) => id !== recipient.id) : [...current, recipient.id]));
  }

  function toggleAllVisible() {
    const visibleIds = filteredRecipients.map((recipient) => recipient.id);
    const allVisibleSelected = visibleIds.length && visibleIds.every((id) => selectedIds.has(id));
    setCampaignResult({ loading: false, success: false, message: "", errors: [], prepared: null });
    setSelectedRecipientIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function campaignPayload() {
    return {
      creative: {
        id: draft.template.id,
        title: draft.template.title,
        category: draft.template.category,
        image: Boolean(draft.imagePreview),
      },
      recipients: selectedRecipients.map((recipient) => {
        const phone = splitRecipientPhone(recipient);
        return {
          id: recipient.id,
          name: recipient.name,
          source: recipient.source,
          countryCode: phone.countryCode,
          phone: phone.phone,
        };
      }),
      templateId: effectiveTemplateId,
      variables: messageDraft.variables,
      messagePreview: renderedMessage,
      consentConfirmed,
    };
  }

  async function handleValidateCampaign() {
    setCampaignResult({ loading: true, success: false, message: "", errors: [], prepared: null });
    try {
      const response = await validateWhatsAppCampaign(campaignPayload());
      setCampaignResult({ loading: false, success: true, message: "Ready to prepare. Full campaign delivery setup is pending.", errors: [], prepared: null });
      return response;
    } catch (error) {
      const errors = error?.payload?.validation?.errors || [];
      setCampaignResult({ loading: false, success: false, message: error?.payload?.message || error.message || "Campaign validation failed.", errors, prepared: null });
      return null;
    }
  }

  async function handlePrepareCampaign() {
    setCampaignResult({ loading: true, success: false, message: "", errors: [], prepared: null });
    try {
      const response = await prepareWhatsAppCampaign(campaignPayload());
      setCampaignResult({ loading: false, success: true, message: "Campaign preview prepared. Bulk delivery setup is pending.", errors: [], prepared: response.campaign });
    } catch (error) {
      const errors = error?.payload?.validation?.errors || [];
      setCampaignResult({ loading: false, success: false, message: error?.payload?.message || error.message || "Campaign preparation failed.", errors, prepared: null });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/50">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#36A175]">Send on WhatsApp</p>
            <h2 className="text-lg font-black text-slate-950">{draft.template.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
            <FiX className="h-5 w-5" />
          </button>
        </header>

        {connectionReady && (
          <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3">
            {["Select Customers", "Choose Message", "Review"].map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={`h-9 shrink-0 rounded-full px-4 text-xs font-black ${step === index ? "bg-[#1A1F71] text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!connectionReady && (
            <SendConnectionGate
              state={connectionState}
              loading={connectionCheck.loading}
              error={connectionCheck.error}
              onContinueMeta={onContinueMeta}
              onRetryConnection={onRetryConnection}
              onManageConnection={onManageConnection}
            />
          )}

          {connectionReady && step === 0 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-950">Select customers</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Using currently available Party/customer phone data.</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{selectedRecipients.length} selected</span>
              </div>
              <label className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4">
                <FiSearch className="text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers or phone numbers" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <button type="button" onClick={toggleAllVisible} disabled={!filteredRecipients.length} className="mb-3 h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
                  Select All
                </button>
                {filteredRecipients.length ? (
                  <div className="max-h-[420px] space-y-2 overflow-y-auto">
                    {filteredRecipients.map((recipient) => (
                      <label key={recipient.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-emerald-50">
                        <input type="checkbox" checked={selectedIds.has(recipient.id)} onChange={() => toggleRecipient(recipient)} className="h-4 w-4 accent-[#36A175]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-950">{recipient.name}</span>
                          <span className="text-xs text-slate-500">{recipient.phone}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[220px] place-items-center text-center">
                    <div>
                      <FiUsers className="mx-auto h-9 w-9 text-slate-300" />
                      <p className="mt-2 text-sm font-black text-slate-700">No saved customers found</p>
                      <p className="mt-1 max-w-sm text-xs font-semibold leading-5 text-slate-500">Customer/contact persistence and imports will be connected in the PostgreSQL phase.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {connectionReady && step === 1 && (
            <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-950">Choose message</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Use an approved WhatsApp template and fill customer-facing text.</p>
                </div>
                {!canUseConnectedTemplates && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
                    Connect WhatsApp Business and load approved templates before sending.
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {approvedTemplates.map((template) => {
                    const active = effectiveTemplateId === template.id;
                    const headerFormat = templateHeaderFormat(template);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          setMessageDraft((current) => ({ ...current, templateId: template.id, variables: {} }));
                          setCampaignResult({ loading: false, success: false, message: "", errors: [], prepared: null });
                        }}
                        className={`rounded-xl border p-4 text-left transition ${active ? "border-[#1A1F71] bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-[#36A175]"}`}
                      >
                        <p className="text-sm font-black text-slate-950">{templateFriendlyName(template)}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{template.language || "Language not set"} {headerFormat ? `- ${headerFormat} header` : "- text body"}</p>
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={messageDraft.caption}
                  onChange={(event) => setMessageDraft((current) => ({ ...current, caption: event.target.value }))}
                  rows={4}
                  placeholder="Write the message/caption customers should see."
                  className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#36A175]"
                />
                {templateVariables.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {templateVariables.map((variable) => (
                      <label key={variable.key} className="block">
                        <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Message field {variable.index}</span>
                        <input
                          value={messageDraft.variables[variable.key] || ""}
                          onChange={(event) => {
                            setMessageDraft((current) => ({ ...current, variables: { ...current.variables, [variable.key]: event.target.value } }));
                            setCampaignResult({ loading: false, success: false, message: "", errors: [], prepared: null });
                          }}
                          placeholder={variable.componentType === "body" && variable.index === 1 ? messageDraft.caption || "Caption text" : `Value ${variable.index}`}
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#36A175]"
                        />
                      </label>
                    ))}
                  </div>
                )}
                <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                  <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#36A175]" />
                  I confirm these customers have opted in to receive WhatsApp messages.
                </label>
              </div>
              <aside className="rounded-xl border border-slate-200 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Message preview</p>
                <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">{renderedMessage || "Choose an approved template."}</p>
              </aside>
            </div>
          )}

          {connectionReady && step === 2 && (
            <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <img src={draft.imagePreview || draft.template.image} alt={draft.template.title} className="max-h-[360px] w-full rounded-lg object-contain" />
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Customers</p>
                  <p className="mt-1 text-3xl font-black text-slate-950">{selectedRecipients.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Message</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{renderedMessage || "No message selected."}</p>
                </div>
                {campaignResult.message && (
                  <div className={`rounded-xl p-4 text-sm font-bold leading-6 ${campaignResult.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    <p>{campaignResult.message}</p>
                    {campaignResult.errors.map((error) => (
                      <p key={`${error.code}-${error.message}`} className="mt-1">- {error.message}</p>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleValidateCampaign} disabled={campaignResult.loading} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
                    Validate
                  </button>
                  <button type="button" onClick={handlePrepareCampaign} disabled={campaignResult.loading} className="h-10 rounded-lg bg-[#36A175] px-4 text-sm font-black text-white hover:bg-[#2c8a64] disabled:bg-slate-300">
                    Prepare Preview
                  </button>
                  <button type="button" disabled className="h-10 rounded-lg bg-slate-200 px-4 text-sm font-black text-white">
                    Bulk delivery setup pending
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {connectionReady && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-xs font-bold text-slate-500">Full campaign delivery will activate after customer database setup.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:text-slate-300">
                Back
              </button>
              <button type="button" onClick={() => setStep((current) => Math.min(2, current + 1))} disabled={step === 2} className="h-10 rounded-lg bg-[#1A1F71] px-4 text-sm font-black text-white hover:bg-[#14185a] disabled:bg-slate-300">
                Next
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function PersonalizeModal({ template, onClose, onSendWhatsApp }) {
  const fileInputRef = useRef(null);
  const [values, setValues] = useState(whatsappMarketingDefaults);
  const [logoPreview, setLogoPreview] = useState("");
  const [background, setBackground] = useState({ presetId: "clean-white", color: "#ffffff", intensity: 28 });
  const [backgroundTab, setBackgroundTab] = useState("presets");
  const [status, setStatus] = useState("");
  const [textElements, setTextElements] = useState([]);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const textIdCounterRef = useRef(0);

  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    },
    [logoPreview],
  );

  const updateValue = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  function nextTextId() {
    textIdCounterRef.current += 1;
    return `text-${Date.now()}-${textIdCounterRef.current}`;
  }

  function addTextElement(initialText = "Enter your text") {
    const id = nextTextId();
    setTextElements((current) => {
      const newElement = {
        id,
        type: "text",
        text: initialText,
        x: 50,
        y: 42 + (current.length % 4) * 8,
        fontSize: 40,
        fontWeight: 700,
        color: "#000000",
        textAlign: "center",
      };
      return [...current, newElement];
    });
    setSelectedTextId(id);
  }

  function updateTextElement(id, updates) {
    setTextElements((current) => current.map((textElement) => (textElement.id === id ? { ...textElement, ...updates } : textElement)));
  }

  function updateTextPosition(id, x, y) {
    setTextElements((current) => current.map((textElement) => (textElement.id === id ? { ...textElement, x, y } : textElement)));
  }

  function deleteTextElement(id) {
    setTextElements((current) => current.filter((textElement) => textElement.id !== id));
    setSelectedTextId((current) => (current === id ? null : current));
  }

  function duplicateTextElement(id) {
    const newId = nextTextId();
    setTextElements((current) => {
      const source = current.find((textElement) => textElement.id === id);
      if (!source) return current;
      const duplicate = { ...source, id: newId, x: Math.min(94, source.x + 4), y: Math.min(94, source.y + 4) };
      return [...current, duplicate];
    });
    setSelectedTextId(newId);
  }

  const handleLogoUpload = (event) => {
    const [file] = event.target.files || [];
    event.target.value = "";
    if (!file) return;
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(URL.createObjectURL(file));
  };

  const composeImage = async () => {
    const poster = await loadImage(template.image);
    const posterWidth = EXPORT_WIDTH - EXPORT_PADDING * 2;
    const posterHeight = Math.round(posterWidth * (poster.naturalHeight / poster.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_TOP_HEIGHT + posterHeight + EXPORT_BOTTOM_HEIGHT;
    const ctx = canvas.getContext("2d");
    const theme = shareCardTheme(background);

    drawCanvasBackground(ctx, background, canvas.width, canvas.height);

    ctx.fillStyle = theme.border;
    ctx.fillRect(EXPORT_PADDING, EXPORT_TOP_HEIGHT - 1, posterWidth, 1);
    ctx.fillRect(EXPORT_PADDING, EXPORT_TOP_HEIGHT + posterHeight, posterWidth, 1);

    if (logoPreview) {
      const logo = await loadImage(logoPreview);
      const x = EXPORT_PADDING;
      const y = 30;
      const size = 72;
      ctx.fillStyle = theme.logoBg;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 18);
      ctx.fill();
      drawContain(ctx, logo, x + 8, y + 8, size - 16, size - 16);
    } else {
      ctx.fillStyle = theme.logoBg;
      ctx.beginPath();
      ctx.roundRect(EXPORT_PADDING, 30, 72, 72, 18);
      ctx.fill();
      drawWrappedText(ctx, "Your Logo", EXPORT_PADDING + 10, 56, 52, {
        fontSize: 13,
        color: theme.secondary,
        weight: 800,
        align: "center",
        maxLines: 2,
      });
    }

    drawWrappedText(ctx, values.businessName || "Business Name", EXPORT_PADDING + 110, 34, posterWidth - 110, {
      fontSize: 38,
      color: theme.primary,
      weight: 800,
      align: "right",
      maxLines: 1,
    });
    drawWrappedText(ctx, values.contactPerson || "Contact Person", EXPORT_PADDING + 110, 78, posterWidth - 110, {
      fontSize: 20,
      color: theme.secondary,
      weight: 700,
      align: "right",
      maxLines: 1,
    });

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(EXPORT_PADDING, EXPORT_TOP_HEIGHT, posterWidth, posterHeight, 24);
    ctx.clip();
    ctx.drawImage(poster, EXPORT_PADDING, EXPORT_TOP_HEIGHT, posterWidth, posterHeight);
    ctx.restore();

    const footerTop = EXPORT_TOP_HEIGHT + posterHeight + 30;
    drawWrappedText(ctx, values.additionalText || "Add your message here", EXPORT_PADDING, footerTop, posterWidth, {
      fontSize: 34,
      color: theme.accent,
      weight: 800,
      align: "center",
      maxLines: 2,
    });
    drawWrappedText(ctx, values.contactNumber || "Contact Number", EXPORT_PADDING, footerTop + 88, posterWidth, {
      fontSize: 28,
      color: theme.primary,
      weight: 800,
      align: "center",
      maxLines: 1,
    });
    drawWrappedText(ctx, values.whatsappText || whatsappMarketingDefaults.whatsappText, EXPORT_PADDING, footerTop + 130, posterWidth, {
      fontSize: 20,
      color: theme.secondary,
      weight: 600,
      align: "center",
      maxLines: 2,
    });

    textElements.forEach((textElement) => drawTextElement(ctx, textElement, canvas.width, canvas.height));

    return canvas;
  };

  const handleDownload = async () => {
    setStatus("");
    const canvas = await composeImage();
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${template.id}.png`;
    link.click();
    setStatus("Downloaded poster image.");
  };

  const handleShare = async () => {
    setStatus("");
    const canvas = await composeImage();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const file = new File([blob], `${template.id}.png`, { type: "image/png" });
    const shareText = values.whatsappText || whatsappMarketingDefaults.whatsappText;

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: template.title, text: shareText, files: [file] });
      setStatus("Shared poster image.");
      return;
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
    setStatus("Image sharing is unavailable here, so WhatsApp text sharing was opened.");
  };

  const handleSendOnWhatsApp = async () => {
    setStatus("");
    const canvas = await composeImage();
    onSendWhatsApp({
      template,
      values,
      imagePreview: canvas.toDataURL("image/png"),
    });
    setStatus("Prepared WhatsApp send preview.");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-4">
      <div className="flex h-[84vh] max-h-[860px] w-[min(92vw,1240px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#6D4AFF]">Share, Download & Send</p>
            <h2 className="text-lg font-bold leading-tight text-slate-900">{template.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(380px,1fr)_280px]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-200 px-5 py-5 pr-6 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <Field label="Business Logo" icon={FiImage}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-white"
                >
                  <FiUpload className="h-4 w-4" />
                  {logoPreview ? "Change Logo" : "Upload Logo"}
                  <span className="text-xs font-medium text-slate-400">PNG, JPG up to 2MB</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </Field>

              <Field label="Business Name" icon={FiUser}>
                <input value={values.businessName} onChange={(event) => updateValue("businessName", event.target.value)} placeholder="Your business name" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6D4AFF]" />
              </Field>

              <Field label="Contact Person" icon={FiUser}>
                <input value={values.contactPerson} onChange={(event) => updateValue("contactPerson", event.target.value)} placeholder="Contact person" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6D4AFF]" />
              </Field>

              <Field label="Contact Number" icon={FiPhone}>
                <input value={values.contactNumber} onChange={(event) => updateValue("contactNumber", event.target.value)} placeholder="+91 00000 00000" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6D4AFF]" />
              </Field>

              <Field label="Additional Text" icon={FiMessageCircle}>
                <textarea value={values.additionalText} onChange={(event) => updateValue("additionalText", event.target.value)} rows={3} placeholder="Special offer, announcement, or message" className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6D4AFF]" />
              </Field>

              <Field label="WhatsApp Text" icon={FiMessageCircle}>
                <textarea value={values.whatsappText} onChange={(event) => updateValue("whatsappText", event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6D4AFF]" />
              </Field>
            </div>
          </div>

          <div className="min-h-0 overflow-hidden bg-slate-100 px-7 py-6">
            <OverlayPreview
              template={template}
              values={values}
              logoPreview={logoPreview}
              background={background}
              textElements={textElements}
              selectedTextId={selectedTextId}
              onSelectText={setSelectedTextId}
              onUpdateTextPosition={updateTextPosition}
              onDeselectText={() => setSelectedTextId(null)}
            />
            {status && <p className="mt-4 text-center text-sm font-semibold text-slate-600">{status}</p>}
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-slate-200 px-5 py-5 lg:border-l lg:border-t-0">
            <div className="space-y-6">
              <TextElementPanel
                values={values}
                textElements={textElements}
                selectedTextId={selectedTextId}
                onSelectText={setSelectedTextId}
                onAddText={addTextElement}
                onQuickAddText={addTextElement}
                onUpdateText={updateTextElement}
                onDeleteText={deleteTextElement}
                onDuplicateText={duplicateTextElement}
              />
              <div className="border-t border-slate-100 pt-6">
                <BackgroundPanel background={background} setBackground={setBackground} activeTab={backgroundTab} setActiveTab={setBackgroundTab} />
              </div>
            </div>
          </aside>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={handleSendOnWhatsApp} className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
            <FiSend className="h-4 w-4" />
            Send on WhatsApp
          </button>
          <button type="button" onClick={handleShare} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <FiShare2 className="h-4 w-4" />
            Share
          </button>
          <button type="button" onClick={handleDownload} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#6D4AFF] px-5 text-sm font-bold text-white hover:bg-[#5938e8]">
            <FiDownload className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="group flex h-[410px] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#36A175]/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#36A175]/20"
    >
      <div className="flex w-full flex-col">
        <div className="flex h-[306px] items-center justify-center bg-slate-50 p-4">
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-slate-100 bg-white/70 p-3">
            <img
              src={template.image}
              alt={template.title}
              className="max-h-full max-w-full object-contain transition duration-200 group-hover:scale-[1.02]"
              loading="lazy"
            />
          </div>
        </div>
        <div className="flex h-[104px] shrink-0 flex-col justify-center border-t border-slate-100 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 truncate text-sm font-bold text-slate-950">{template.title}</h2>
            <span className="shrink-0 rounded-full bg-[#F97316]/10 px-2.5 py-1 text-[11px] font-bold text-[#C2410C]">
              {template.subcategory}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500">{template.category} poster</p>
        </div>
      </div>
    </button>
  );
}

function WhatsAppMarketing() {
  const callbackNotice = readWhatsAppCallbackNotice();
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeSubcategory, setActiveSubcategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [whatsappMarketingTemplates, setWhatsAppMarketingTemplates] = useState([]);
  const [templateCatalogState, setTemplateCatalogState] = useState({ loading: true, error: "" });
  const [templateCatalogRetry, setTemplateCatalogRetry] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [sendDraft, setSendDraft] = useState(null);
  const [whatsappStatus, setWhatsAppStatus] = useState({
    loading: true,
    configured: true,
    connected: false,
    user: null,
    permissions: [],
    selection: emptyWhatsAppSelection(),
    readiness: emptyWhatsAppReadiness(),
    lastError: callbackNotice.error,
  });
  const [whatsappAssets, setWhatsAppAssets] = useState(() => emptyWhatsAppAssets());
  const [whatsappSelection, setWhatsAppSelection] = useState(() => emptyWhatsAppSelection());
  const [whatsappLoading, setWhatsAppLoading] = useState(false);
  const [whatsappError, setWhatsAppError] = useState(callbackNotice.error);
  const [whatsappToast, setWhatsAppToast] = useState(callbackNotice.toast);
  const [showConnectionPanel, setShowConnectionPanel] = useState(Boolean(callbackNotice.error));
  const [connectionStatusUnavailable, setConnectionStatusUnavailable] = useState(false);
  const [productionConnectionError, setProductionConnectionError] = useState(callbackNotice.error);
  const [sendConnectionCheck, setSendConnectionCheck] = useState({ loading: false, error: "" });
  const [testForm, setTestForm] = useState({ countryCode: "+91", phoneNumber: "", optInConfirmed: false, variables: {} });
  const [sendState, setSendState] = useState({ loading: false, success: false, message: "", messageId: "" });
  const connectionPanelRef = useRef(null);

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return whatsappMarketingTemplates.filter((template) => {
      const matchesCategory = activeCategory === "All" || template.category === activeCategory;
      const matchesSubcategory = activeSubcategory === "All" || template.subcategory === activeSubcategory;
      const matchesQuery = !query || `${template.title} ${template.category} ${template.subcategory}`.toLowerCase().includes(query);
      return matchesCategory && matchesSubcategory && matchesQuery;
    });
  }, [activeCategory, activeSubcategory, searchQuery, whatsappMarketingTemplates]);

  useEffect(() => {
    let active = true;
    setTemplateCatalogState({ loading: true, error: "" });
    getWhatsAppMarketingTemplates()
      .then((templates) => {
        if (!active) return;
        setWhatsAppMarketingTemplates(templates);
        setTemplateCatalogState({ loading: false, error: "" });
      })
      .catch((error) => {
        if (!active) return;
        setWhatsAppMarketingTemplates([]);
        setTemplateCatalogState({ loading: false, error: error.message || "Unable to load poster templates from the database." });
      });
    return () => { active = false; };
  }, [templateCatalogRetry]);

  useEffect(() => {
    let active = true;
    cleanWhatsAppCallbackNotice();

    getWhatsAppConnectionStatus()
      .then((status) => {
        if (!active) return null;
        setConnectionStatusUnavailable(false);
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...status, loading: false }));
        setWhatsAppAssets(status.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(status.selection || emptyWhatsAppSelection());
        setWhatsAppError((current) => current || status.lastError || "");
        if (!status.connected) return null;
        return getWhatsAppAssets({ businessId: status.selection?.businessId, wabaId: status.selection?.wabaId });
      })
      .then((assetsStatus) => {
        if (!active || !assetsStatus) return;
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...assetsStatus, loading: false }));
        setWhatsAppAssets(assetsStatus.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(assetsStatus.selection || emptyWhatsAppSelection());
      })
      .catch((statusError) => {
        if (!active) return;
        const expectedConnectionState = isWhatsAppAuthOrDisconnectedError(statusError) || isWhatsAppConfigError(statusError);
        setConnectionStatusUnavailable(!expectedConnectionState);
        if (statusError.payload) {
          setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...statusError.payload, loading: false }));
          setWhatsAppAssets(statusError.payload.assets || emptyWhatsAppAssets());
          setWhatsAppSelection(statusError.payload.selection || emptyWhatsAppSelection());
        } else {
          setWhatsAppStatus((current) => ({ ...current, loading: false }));
        }
        setWhatsAppError(formatWhatsAppRequestError(statusError, "Unable to load WhatsApp Business connection status."));
      });

    return () => {
      active = false;
    };
  }, []);

  async function refreshWhatsAppConnection(selection = whatsappSelection) {
    setWhatsAppLoading(true);
    setWhatsAppError("");
    setProductionConnectionError("");
    setConnectionStatusUnavailable(false);

    try {
      const status = await getWhatsAppConnectionStatus();
      let nextStatus = status;

      if (status.connected) {
        nextStatus = await getWhatsAppAssets({ businessId: selection.businessId || status.selection?.businessId, wabaId: selection.wabaId || status.selection?.wabaId });
      }

      setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...nextStatus, loading: false }));
      setWhatsAppAssets(nextStatus.assets || emptyWhatsAppAssets());
      setWhatsAppSelection(nextStatus.selection || emptyWhatsAppSelection());
      setConnectionStatusUnavailable(false);
      return nextStatus;
    } catch (requestError) {
      const expectedConnectionState = isWhatsAppAuthOrDisconnectedError(requestError) || isWhatsAppConfigError(requestError);
      setConnectionStatusUnavailable(!expectedConnectionState);
      if (requestError.payload) {
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...requestError.payload, loading: false }));
        setWhatsAppAssets(requestError.payload.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(requestError.payload.selection || emptyWhatsAppSelection());
      }
      setWhatsAppError(formatWhatsAppRequestError(requestError, "Unable to refresh WhatsApp Business connection."));
      return null;
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function handleContinueWithMeta() {
    setWhatsAppLoading(true);
    setWhatsAppError("");
    setProductionConnectionError("");
    setConnectionStatusUnavailable(false);

    try {
      const status = await getWhatsAppConnectionStatus();
      if (!status.embeddedSignupConfigured && !status.oauthConfigured) {
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...status, loading: false }));
        setWhatsAppAssets(status.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(status.selection || emptyWhatsAppSelection());
        setProductionConnectionError("Production Meta WhatsApp onboarding is not configured on the backend.");
        setWhatsAppLoading(false);
        return;
      }

      if (status.embeddedSignupConfigured) {
        const signup = await startWhatsAppEmbeddedSignup(status.embeddedSignup);
        const connected = await completeWhatsAppEmbeddedSignup(signup);
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...connected, loading: false }));
        setWhatsAppAssets(connected.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(connected.selection || emptyWhatsAppSelection());
        setWhatsAppToast("WhatsApp Business connected.");
        setWhatsAppLoading(false);
        return;
      }

      startWhatsAppConnection();
    } catch (requestError) {
      const isApiError = Boolean(requestError.payload);
      const expectedConnectionState = isWhatsAppAuthOrDisconnectedError(requestError) || isWhatsAppConfigError(requestError);
      setConnectionStatusUnavailable(isApiError && !expectedConnectionState);
      if (requestError.payload) {
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...requestError.payload, loading: false }));
        setWhatsAppAssets(requestError.payload.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(requestError.payload.selection || emptyWhatsAppSelection());
      }
      setWhatsAppLoading(false);
      const formattedError = formatWhatsAppRequestError(requestError, "Unable to start WhatsApp Business connection.");
      setProductionConnectionError(formattedError);
      setWhatsAppError(isApiError ? formattedError : "");
    }
  }

  async function handleConnectWhatsAppTestMode() {
    setWhatsAppLoading(true);
    setWhatsAppError("");
    setProductionConnectionError("");
    setConnectionStatusUnavailable(false);

    try {
      const status = await getWhatsAppConnectionStatus();
      if (!status.testModeConfigured) {
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...status, loading: false }));
        setWhatsAppAssets(status.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(status.selection || emptyWhatsAppSelection());
        setWhatsAppError("Meta WhatsApp test setup environment values are missing on the backend.");
        setWhatsAppLoading(false);
        return;
      }

      const testConnection = await connectWhatsAppTestMode();
      setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...testConnection, loading: false }));
      setWhatsAppAssets(testConnection.assets || emptyWhatsAppAssets());
      setWhatsAppSelection(testConnection.selection || emptyWhatsAppSelection());
      setWhatsAppToast("Meta WhatsApp test setup loaded.");
      setShowConnectionPanel(true);
    } catch (requestError) {
      setWhatsAppError(formatWhatsAppRequestError(requestError, "Unable to start WhatsApp Business connection."));
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function handleWhatsAppSelectionChange(patch) {
    const nextSelection = { ...whatsappSelection, ...patch };
    setWhatsAppSelection(nextSelection);
    setSendState({ loading: false, success: false, message: "", messageId: "" });
    if (Object.prototype.hasOwnProperty.call(patch, "templateId")) setTestForm((current) => ({ ...current, variables: {} }));

    if (Object.prototype.hasOwnProperty.call(patch, "businessId") || Object.prototype.hasOwnProperty.call(patch, "wabaId")) {
      setWhatsAppLoading(true);
      setWhatsAppError("");
      try {
        const refreshed = await getWhatsAppAssets({ businessId: nextSelection.businessId, wabaId: nextSelection.wabaId });
        const scopedSelection = {
          ...(refreshed.selection || emptyWhatsAppSelection()),
          businessId: nextSelection.businessId,
          wabaId: nextSelection.wabaId,
          phoneNumberId: nextSelection.phoneNumberId,
          templateId: nextSelection.templateId,
        };
        const saved = await saveWhatsAppSelection(scopedSelection);
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...saved, loading: false }));
        setWhatsAppAssets(saved.assets || refreshed.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(saved.selection || scopedSelection);
      } catch (requestError) {
        if (requestError.payload) {
          setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...requestError.payload, loading: false }));
          setWhatsAppAssets(requestError.payload.assets || emptyWhatsAppAssets());
          setWhatsAppSelection(requestError.payload.selection || emptyWhatsAppSelection());
        }
        setWhatsAppError(formatWhatsAppRequestError(requestError, "Unable to refresh WhatsApp assets."));
      } finally {
        setWhatsAppLoading(false);
      }
      return;
    }

    saveWhatsAppSelection(nextSelection)
      .then((saved) => {
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...saved, loading: false }));
        setWhatsAppAssets(saved.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(saved.selection || emptyWhatsAppSelection());
      })
      .catch((requestError) => {
        if (requestError.payload) {
          setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...requestError.payload, loading: false }));
          setWhatsAppAssets(requestError.payload.assets || emptyWhatsAppAssets());
          setWhatsAppSelection(requestError.payload.selection || emptyWhatsAppSelection());
        }
        setWhatsAppError(formatWhatsAppRequestError(requestError, "Unable to save WhatsApp Business selection."));
      });
  }

  async function handleSaveWhatsAppSelection() {
    setWhatsAppLoading(true);
    setWhatsAppError("");

    try {
      const saved = await saveWhatsAppSelection(whatsappSelection);
      setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...saved, loading: false }));
      setWhatsAppAssets(saved.assets || emptyWhatsAppAssets());
      setWhatsAppSelection(saved.selection || emptyWhatsAppSelection());
      setWhatsAppToast("WhatsApp Business selection saved.");
    } catch (requestError) {
      setWhatsAppError(formatWhatsAppRequestError(requestError, "Unable to save WhatsApp Business selection."));
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function handleDisconnectWhatsApp() {
    setWhatsAppLoading(true);
    setWhatsAppError("");

    try {
      const disconnected = await disconnectWhatsAppBusiness();
      setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...disconnected, loading: false }));
      setWhatsAppAssets(disconnected.assets || emptyWhatsAppAssets());
      setWhatsAppSelection(disconnected.selection || emptyWhatsAppSelection());
      setSendState({ loading: false, success: false, message: "", messageId: "" });
      setWhatsAppToast("WhatsApp Business disconnected.");
    } catch (requestError) {
      setWhatsAppError(formatWhatsAppRequestError(requestError, "Unable to disconnect WhatsApp Business."));
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function handleSendTestWhatsApp() {
    setSendState({ loading: true, success: false, message: "", messageId: "" });
    setWhatsAppError("");

    try {
      const response = await sendWhatsAppTestMessage({
        countryCode: testForm.countryCode,
        phoneNumber: testForm.phoneNumber,
        optInConfirmed: testForm.optInConfirmed,
        variables: testForm.variables,
      });
      setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...response, loading: false }));
      setWhatsAppAssets(response.assets || emptyWhatsAppAssets());
      setWhatsAppSelection(response.selection || emptyWhatsAppSelection());
      setSendState({
        loading: false,
        success: true,
        message: response.message || "Accepted by WhatsApp.",
        messageId: response.result?.messageId || "",
      });
    } catch (requestError) {
      const errorMessage = formatWhatsAppRequestError(requestError, "WhatsApp test message failed.");
      setSendState({ loading: false, success: false, message: errorMessage, messageId: "" });
      if (requestError.payload) {
        setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...requestError.payload, loading: false }));
        setWhatsAppAssets(requestError.payload.assets || emptyWhatsAppAssets());
        setWhatsAppSelection(requestError.payload.selection || emptyWhatsAppSelection());
      }
    }
  }

  const connectionReadiness = resolveWhatsAppReadiness(whatsappStatus, whatsappAssets, whatsappSelection);
  const campaignsUnlocked = connectionReadiness.readyToSend;
  const configurationError = whatsappStatus.configured === false && !whatsappStatus.embeddedSignupConfigured && !whatsappStatus.oauthConfigured;
  const developerToolsEnabled = canShowWhatsAppDeveloperTools(whatsappStatus);

  function applyWhatsAppConnectionState(connection) {
    setWhatsAppStatus((current) => mergeWhatsAppStatus(current, { ...connection, loading: false }));
    setWhatsAppAssets(connection.assets || emptyWhatsAppAssets());
    setWhatsAppSelection(connection.selection || emptyWhatsAppSelection());
  }

  async function checkSendWhatsAppConnection() {
    setSendConnectionCheck({ loading: true, error: "" });
    try {
      const connection = await getWhatsAppConnection();
      applyWhatsAppConnectionState(connection);
      setSendConnectionCheck({ loading: false, error: "" });
      return connection;
    } catch (error) {
      if (error.payload) applyWhatsAppConnectionState(error.payload);
      setSendConnectionCheck({
        loading: false,
        error: formatWhatsAppRequestError(error, "Unable to verify WhatsApp Business connection."),
      });
      return null;
    }
  }

  function handleOpenWhatsAppSend(draft) {
    setSendDraft(draft);
    setSelectedTemplate(null);
    checkSendWhatsAppConnection();
  }

  async function handleSendDrawerContinueMeta() {
    await handleContinueWithMeta();
    await checkSendWhatsAppConnection();
  }

  function openWhatsAppConnectionPanel({ closeSendDrawer = false } = {}) {
    setShowConnectionPanel(true);
    if (closeSendDrawer) setSendDraft(null);
    window.setTimeout(() => {
      connectionPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  const renderDeveloperTools = () => (
    <section ref={connectionPanelRef} className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">Manage Connection</p>
          <p className="text-xs font-semibold leading-5 text-slate-500">Review WhatsApp connection status, reload configuration, reconnect, or disconnect.</p>
        </div>
        <button type="button" onClick={() => setShowConnectionPanel(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50">
          Hide
        </button>
      </div>
      <WhatsAppBusinessPanel
        status={whatsappStatus}
        assets={whatsappAssets}
        selection={whatsappSelection}
        loading={whatsappLoading || whatsappStatus.loading}
        error={whatsappError}
        sendState={sendState}
        onConnect={handleContinueWithMeta}
        onTestConnect={handleConnectWhatsAppTestMode}
        onRefresh={() => refreshWhatsAppConnection()}
        onDisconnect={handleDisconnectWhatsApp}
        onSelectionChange={handleWhatsAppSelectionChange}
        onSaveSelection={handleSaveWhatsAppSelection}
        onSendTest={handleSendTestWhatsApp}
        testForm={testForm}
        setTestForm={setTestForm}
        developerToolsEnabled={developerToolsEnabled}
      />
    </section>
  );

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-bold text-[#36A175]">Business Growth</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">WhatsApp Marketing</h1>
            <p className="mt-1 text-sm text-slate-500">Personalize ready posters and share them with customers.</p>
          </div>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 shadow-sm xl:w-[420px]">
            <FiSearch className="h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search posters"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
      </header>

      <main className="space-y-5 p-5">
        {whatsappToast && <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{whatsappToast}</div>}

        {whatsappStatus.loading && (
          <section className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div>
              <FiRefreshCw className="mx-auto h-9 w-9 animate-spin text-slate-300" />
              <p className="mt-4 text-sm font-black text-slate-700">Checking WhatsApp connection...</p>
            </div>
          </section>
        )}

        {!whatsappStatus.loading && connectionStatusUnavailable && (
          <WhatsAppConnectionUnavailable error={whatsappError} onRetry={() => refreshWhatsAppConnection()} loading={whatsappLoading} />
        )}

        {!whatsappStatus.loading && !connectionStatusUnavailable && configurationError && (
          <>
            <WhatsAppConfigurationError onManageConnection={openWhatsAppConnectionPanel} />
            {showConnectionPanel && renderDeveloperTools()}
          </>
        )}

        {!whatsappStatus.loading && !connectionStatusUnavailable && !configurationError && !whatsappStatus.connected && (
          <>
            <WhatsAppOnboarding status={whatsappStatus} loading={whatsappLoading} onContinueMeta={handleContinueWithMeta} productionConnectionError={productionConnectionError} />
            {developerToolsEnabled && <WhatsAppTestModeStarter status={whatsappStatus} loading={whatsappLoading} error={whatsappError} onTestConnect={handleConnectWhatsAppTestMode} />}
            {showConnectionPanel && renderDeveloperTools()}
          </>
        )}

        {!whatsappStatus.loading && !connectionStatusUnavailable && !configurationError && whatsappStatus.connected && !campaignsUnlocked && (
          <>
            <WhatsAppSetupIncomplete readiness={connectionReadiness} assets={whatsappAssets} selection={whatsappSelection} onManageConnection={openWhatsAppConnectionPanel} />
            {showConnectionPanel && renderDeveloperTools()}
          </>
        )}

        {!whatsappStatus.loading && !connectionStatusUnavailable && !configurationError && whatsappStatus.connected && campaignsUnlocked && (
          <>
            <WhatsAppConnectedBar status={whatsappStatus} assets={whatsappAssets} selection={whatsappSelection} onManageConnection={openWhatsAppConnectionPanel} />
            {showConnectionPanel && renderDeveloperTools()}
          </>
        )}

        <section>
          <div>
            <p className="text-sm font-bold text-[#36A175]">Marketing Creatives / Posters</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Poster templates</h2>
            <p className="mt-1 text-sm text-slate-500">Click a poster to customize, download, share, or prepare WhatsApp sending.</p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {whatsappMarketingCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${
                  activeCategory === category ? "bg-[#1A1F71] text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {whatsappMarketingSubcategories.map((subcategory) => (
              <button
                key={subcategory}
                type="button"
                onClick={() => setActiveSubcategory(subcategory)}
                className={`h-8 shrink-0 rounded-lg px-3 text-xs font-bold transition ${
                  activeSubcategory === subcategory ? "bg-[#36A175] text-white shadow-sm" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {subcategory}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {templateCatalogState.loading && (
            <div className="col-span-full rounded-xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
              Loading poster templates from your database…
            </div>
          )}
          {!templateCatalogState.loading && templateCatalogState.error && (
            <div className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <span className="flex items-center gap-2"><FiAlertCircle className="h-4 w-4" />{templateCatalogState.error}</span>
              <button type="button" onClick={() => setTemplateCatalogRetry((value) => value + 1)} className="rounded-lg bg-white px-3 py-2 font-bold text-rose-700 ring-1 ring-rose-200">
                Retry
              </button>
            </div>
          )}
          {!templateCatalogState.loading && !templateCatalogState.error && filteredTemplates.length === 0 && (
            <div className="col-span-full rounded-xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
              No poster templates match these filters.
            </div>
          )}
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} onSelect={setSelectedTemplate} />
          ))}
        </section>
      </main>

      {selectedTemplate && <PersonalizeModal template={selectedTemplate} onClose={() => setSelectedTemplate(null)} onSendWhatsApp={handleOpenWhatsAppSend} />}
      {sendDraft && (
        <SendOnWhatsAppModal
          draft={sendDraft}
          status={whatsappStatus}
          assets={whatsappAssets}
          selection={whatsappSelection}
          connectionCheck={sendConnectionCheck}
          onClose={() => setSendDraft(null)}
          onContinueMeta={handleSendDrawerContinueMeta}
          onRetryConnection={checkSendWhatsAppConnection}
          onManageConnection={() => openWhatsAppConnectionPanel({ closeSendDrawer: true })}
        />
      )}
    </div>
  );
}

export default WhatsAppMarketing;
