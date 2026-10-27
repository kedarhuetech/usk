// Implements the smart ads page.
import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiBarChart2,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiEye,
  FiImage,
  FiMapPin,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiTarget,
  FiUpload,
  FiUsers,
  FiVideo,
  FiX,
  FiZap,
} from "react-icons/fi";
import Button from "../../../components/Common/Button";
import Card from "../../../components/Common/Card";
import { marketingTemplates } from "../../../constants/marketingStudio/templateRegistry";
import { getSessionDesigns } from "../../../services/marketingStudio/sessionDesignService";
import { calculateInventoryItemPricing } from "../../../services/itemsStorage";
import {
  disconnectMeta,
  getMetaAdsInsights,
  getMetaAssets,
  getMetaConnectionStatus,
  publishMetaCampaign,
  saveMetaAssetSelection,
  startMetaConnection,
} from "../../../services/smartAdsMetaService";
import { loadGrowthCampaigns, loadGrowthItems, saveGrowthCampaign } from "../../../services/businessGrowthData.js";

const goalOptions = [
  { id: "whatsapp", label: "Get WhatsApp Messages" },
  { id: "product", label: "Promote Product / Service" },
  { id: "reach", label: "Increase Reach" },
  { id: "leads", label: "Get More Leads" },
];

const ctaOptions = ["Send WhatsApp Message", "Learn More", "Shop Now", "Contact Us"];
const genderOptions = ["All", "Male", "Female"];
const interestSuggestions = ["Shopping", "Food", "Fitness", "Fashion", "Education", "Technology", "Business", "Travel", "Beauty"];
const supportedVideoTypes = ["video/mp4", "video/quicktime", "video/x-m4v"];
const supportedVideoExtensions = [".mp4", ".mov", ".m4v"];
const maxVideoBytes = 20 * 1024 * 1024;
const maxVideoDurationSeconds = 10 * 60;

const statusFilters = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "in-review", label: "In Review" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
];

const statusStyles = {
  draft: "bg-slate-100 text-slate-700",
  "in-review": "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-blue-50 text-blue-700",
  completed: "bg-violet-50 text-violet-700",
  published: "bg-emerald-50 text-emerald-700",
  "publish-failed": "bg-rose-50 text-rose-700",
};

const stepLabels = ["Ad Details", "Creative", "Audience", "Budget & Schedule", "Review"];

// This helper handles input value logic.
function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

// This helper handles days logic.
function addDays(dateValue, days) {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  date.setDate(date.getDate() + Math.max(Number(days) || 0, 1) - 1);
  return date.toISOString().slice(0, 10);
}

// Formats currency.
function formatCurrency(value) {
  return `Rs ${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
}

// This helper handles title case logic.
function toTitleCase(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

// This helper handles image logic.
function itemImage(item = {}) {
  return item.imageUrl || item.image || "";
}

// This helper handles display name logic.
function itemDisplayName(item = {}) {
  return toTitleCase(item.itemName || item.name || item.serviceName || "Selected Item");
}

// This helper handles price line logic.
function itemPriceLine(item = {}) {
  const pricing = calculateInventoryItemPricing(item);
  if (!pricing.finalPrice) return "";
  return `${formatCurrency(pricing.finalPrice)}${item.unit ? ` / ${item.unit}` : ""}`;
}

// This helper handles meta line logic.
function itemMetaLine(item = {}) {
  return [item.category, itemPriceLine(item)].filter(Boolean).join(" - ");
}

// Formats date.
function formatDate(value) {
  if (!value) return "Not set";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// This helper handles label logic.
function statusLabel(status) {
  if (status === "in-review") return "Local Demo";
  if (status === "published") return "Published to Meta";
  if (status === "publish-failed") return "Publishing Failed";
  return String(status || "draft")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// This helper handles result logic.
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

// This helper handles meta assets logic.
function emptyMetaAssets() {
  return {
    businesses: [],
    pages: [],
    instagramAccounts: [],
    adAccounts: [],
    warnings: [],
  };
}

// This helper handles meta selection logic.
function emptyMetaSelection() {
  return {
    businessId: "",
    pageId: "",
    instagramAccountId: "",
    adAccountId: "",
  };
}

// This helper handles meta readiness logic.
function emptyMetaReadiness() {
  return {
    connected: false,
    hasBusiness: false,
    hasPage: false,
    hasAdAccount: false,
    hasSelectedPage: false,
    hasSelectedAdAccount: false,
    hasRequiredAccess: "unknown",
    instagramRequired: false,
    hasInstagram: false,
    readyToPublish: false,
    blockingReason: "Connect Meta before publishing Smart Ads.",
    blockingCode: "META_NOT_CONNECTED",
    missingPermissions: [],
  };
}

// Resolves meta readiness.
function resolveMetaReadiness(status = {}, assets = emptyMetaAssets(), selection = emptyMetaSelection()) {
  if (status.readiness) return status.readiness;
  const connected = Boolean(status.connected);
  const hasPage = Boolean(assets.pages?.length);
  const hasAdAccount = Boolean(assets.adAccounts?.length);
  const hasSelectedPage = Boolean(selection.pageId && assets.pages?.some((page) => page.id === selection.pageId));
  const hasSelectedAdAccount = Boolean(selection.adAccountId && assets.adAccounts?.some((account) => account.id === selection.adAccountId));
  let blockingReason = "";
  let blockingCode = "";

  if (!connected) {
    blockingReason = "Connect Meta before publishing Smart Ads.";
    blockingCode = "META_NOT_CONNECTED";
  } else if (!hasPage) {
    blockingReason = "No Facebook Page found. Smart Ads requires a Facebook Page to publish ads.";
    blockingCode = "META_PAGE_REQUIRED";
  } else if (!hasAdAccount) {
    blockingReason = "No Ad Account found. A Meta Ad Account is required to publish ads.";
    blockingCode = "META_AD_ACCOUNT_REQUIRED";
  } else if (!hasSelectedPage) {
    blockingReason = "Select a Facebook Page before publishing Smart Ads.";
    blockingCode = "META_PAGE_SELECTION_REQUIRED";
  } else if (!hasSelectedAdAccount) {
    blockingReason = "Select a Meta Ad Account before publishing Smart Ads.";
    blockingCode = "META_AD_ACCOUNT_SELECTION_REQUIRED";
  }

  return {
    ...emptyMetaReadiness(),
    connected,
    hasBusiness: Boolean(assets.businesses?.length),
    hasPage,
    hasAdAccount,
    hasSelectedPage,
    hasSelectedAdAccount,
    hasRequiredAccess: hasSelectedPage && hasSelectedAdAccount ? "unknown" : false,
    hasInstagram: Boolean(selection.instagramAccountId),
    readyToPublish: connected && hasSelectedPage && hasSelectedAdAccount,
    blockingReason,
    blockingCode,
  };
}

// Reads meta callback notice.
function readMetaCallbackNotice() {
  if (typeof window === "undefined") return { toast: "", error: "" };
  const params = new URLSearchParams(window.location.search);
  const metaStatus = params.get("meta");
  const message = params.get("message") || "";

  if (metaStatus === "connected") return { toast: "Meta connected. Select the business assets to use for Smart Ads.", error: "" };
  if (metaStatus === "error") return { toast: "", error: message || "Meta connection failed." };
  return { toast: "", error: "" };
}

// This helper handles meta callback notice logic.
function cleanMetaCallbackNotice() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("meta")) return;
  url.searchParams.delete("meta");
  url.searchParams.delete("message");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

// Creates empty form.
function createEmptyForm() {
  return {
    id: "",
    campaignName: "",
    goal: "whatsapp",
    selectedItemId: "",
    headline: "",
    caption: "",
    website: "",
    cta: "Send WhatsApp Message",
    mediaType: "image",
    creativeSource: "upload",
    uploadDataUrl: "",
    uploadName: "",
    videoDataUrl: "",
    videoName: "",
    videoMimeType: "",
    videoSize: 0,
    videoDuration: 0,
    videoWidth: 0,
    videoHeight: 0,
    videoNeedsReselect: false,
    existingVideoId: "",
    templateId: "",
    sessionDesignId: "",
    gender: "All",
    locationMode: "target-area",
    locations: ["Nagpur"],
    minAge: 18,
    maxAge: 65,
    interests: ["Shopping"],
    interestInput: "",
    dailyBudget: 500,
    durationDays: 7,
    startDate: todayInputValue(),
    scheduleMode: "all-day",
    startTime: "09:00",
    endTime: "21:00",
  };
}

// This helper handles from campaign logic.
function formFromCampaign(campaign) {
  return {
    id: campaign.id,
    campaignName: campaign.name,
    goal: campaign.objective,
    selectedItemId: campaign.creative?.itemId || "",
    headline: campaign.ad?.headline || "",
    caption: campaign.ad?.caption || "",
    website: campaign.ad?.website || "",
    cta: campaign.ad?.cta || "Send WhatsApp Message",
    mediaType: campaign.creative?.mediaType || (campaign.creative?.videoName ? "video" : "image"),
    creativeSource: campaign.creative?.creativeType || "upload",
    uploadDataUrl: campaign.creative?.uploadDataUrl || "",
    uploadName: campaign.creative?.uploadName || "",
    videoDataUrl: "",
    videoName: campaign.creative?.videoName || "",
    videoMimeType: campaign.creative?.videoMimeType || "",
    videoSize: campaign.creative?.videoSize || 0,
    videoDuration: campaign.creative?.videoDuration || 0,
    videoWidth: campaign.creative?.videoWidth || 0,
    videoHeight: campaign.creative?.videoHeight || 0,
    videoNeedsReselect: campaign.creative?.mediaType === "video",
    existingVideoId: campaign.meta?.videoId || campaign.creative?.existingVideoId || "",
    templateId: campaign.creative?.templateId || "",
    sessionDesignId: campaign.creative?.sessionDesignId || "",
    gender: campaign.audience?.gender || "All",
    locationMode: campaign.audience?.panIndia ? "pan-india" : "target-area",
    locations: campaign.audience?.locations?.length ? campaign.audience.locations : ["Nagpur"],
    minAge: campaign.audience?.minAge || 18,
    maxAge: campaign.audience?.maxAge || 65,
    interests: campaign.audience?.interests?.length ? campaign.audience.interests : [],
    interestInput: "",
    dailyBudget: campaign.budget?.dailyBudget || 500,
    durationDays: campaign.budget?.durationDays || 7,
    startDate: campaign.budget?.startDate || todayInputValue(),
    scheduleMode: campaign.schedule?.mode || "all-day",
    startTime: campaign.schedule?.startTime || "09:00",
    endTime: campaign.schedule?.endTime || "21:00",
  };
}

// This helper handles from form logic.
function campaignFromForm(form, status, inventoryItems, templateOptions, sessionDesigns) {
  const selectedItem = inventoryItems.find((item) => item.id === form.selectedItemId);
  const selectedTemplate = templateOptions.find((template) => template.id === form.templateId);
  const selectedSessionDesign = sessionDesigns.find((design) => design.id === form.sessionDesignId);
  const durationDays = Math.max(Number(form.durationDays) || 0, 1);
  const dailyBudget = Math.max(Number(form.dailyBudget) || 0, 0);
  const endDate = addDays(form.startDate, durationDays);

  return {
    id: form.id || undefined,
    name: form.campaignName.trim() || "Untitled Campaign",
    objective: form.goal,
    creative: {
      mediaType: form.mediaType,
      creativeType: form.creativeSource,
      uploadDataUrl: form.mediaType === "image" && form.creativeSource === "upload" ? form.uploadDataUrl : "",
      uploadName: form.mediaType === "image" && form.creativeSource === "upload" ? form.uploadName : "",
      videoName: form.mediaType === "video" ? form.videoName : "",
      videoMimeType: form.mediaType === "video" ? form.videoMimeType : "",
      videoSize: form.mediaType === "video" ? Number(form.videoSize) || 0 : 0,
      videoDuration: form.mediaType === "video" ? Number(form.videoDuration) || 0 : 0,
      videoWidth: form.mediaType === "video" ? Number(form.videoWidth) || 0 : 0,
      videoHeight: form.mediaType === "video" ? Number(form.videoHeight) || 0 : 0,
      videoNeedsReselect: form.mediaType === "video" && !form.videoDataUrl,
      existingVideoId: form.mediaType === "video" ? form.existingVideoId || "" : "",
      templateId: form.mediaType === "image" && form.creativeSource === "marketing-studio" && selectedTemplate ? selectedTemplate.id : null,
      sessionDesignId: form.mediaType === "image" && form.creativeSource === "marketing-studio" && selectedSessionDesign ? selectedSessionDesign.id : null,
      itemId: form.goal === "product" || (form.mediaType === "image" && form.creativeSource === "item-image") ? selectedItem?.id || null : null,
      imageUrl: form.mediaType === "image" && form.creativeSource === "item-image" ? itemImage(selectedItem) : "",
    },
    ad: {
      headline: form.headline.trim(),
      caption: form.caption.trim(),
      website: form.website.trim(),
      cta: form.cta,
    },
    audience: {
      gender: form.gender,
      minAge: Number(form.minAge) || 18,
      maxAge: Number(form.maxAge) || 65,
      locations: form.locationMode === "target-area" ? form.locations.filter(Boolean) : [],
      panIndia: form.locationMode === "pan-india",
      interests: form.interests,
    },
    budget: {
      dailyBudget,
      startDate: form.startDate,
      endDate,
      durationDays,
      estimatedBudget: dailyBudget * durationDays,
    },
    schedule: {
      mode: form.scheduleMode,
      startTime: form.scheduleMode === "custom" ? form.startTime : "",
      endTime: form.scheduleMode === "custom" ? form.endTime : "",
    },
    status,
    analytics: { reach: 0, clicks: 0, spend: 0, leads: 0 },
    meta: { connectionStatus: "not-connected", campaignId: null, adSetId: null, adId: null },
  };
}

// This helper handles with publish result logic.
function campaignWithPublishResult(campaign, publish, status, message = "") {
  const ids = publish?.ids || {};
  return {
    ...campaign,
    status,
    meta: {
      connectionStatus: status === "published" ? "published" : "publish-failed",
      campaignId: ids.metaCampaignId || null,
      adSetId: ids.metaAdSetId || null,
      imageHash: ids.metaImageHash || null,
      videoId: ids.metaVideoId || null,
      thumbnailImageHash: ids.metaVideoThumbnailImageHash || null,
      creativeId: ids.metaCreativeId || null,
      adId: ids.metaAdId || null,
      publishStatus: publish?.safeStatus || "PAUSED",
      lastError: message,
      createdAt: new Date().toISOString(),
      steps: publish?.steps || [],
    },
  };
}

// Resolves creative image.
function resolveCreativeImage(form, inventoryItems, templateOptions, sessionDesigns) {
  if (form.mediaType === "video") return "";
  if (form.creativeSource === "upload") return form.uploadDataUrl;
  if (form.creativeSource === "item-image") {
    const selectedItem = inventoryItems.find((item) => item.id === form.selectedItemId);
    return itemImage(selectedItem);
  }
  const selectedTemplate = templateOptions.find((template) => template.id === form.templateId);
  const selectedSessionDesign = sessionDesigns.find((design) => design.id === form.sessionDesignId);
  return selectedTemplate?.thumbnail || selectedSessionDesign?.thumbnail || selectedSessionDesign?.background?.src || "";
}

// Resolves creative video.
function resolveCreativeVideo(form) {
  return form.mediaType === "video" ? form.videoDataUrl : "";
}

// Reads blob as data url.
function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read creative file."));
    reader.readAsDataURL(blob);
  });
}

// Resolves publishable creative data url.
async function resolvePublishableCreativeDataUrl(imageUrl) {
  if (!imageUrl) throw new Error("Select or upload a creative image before publishing.");
  if (imageUrl.startsWith("data:image/")) return imageUrl;
  if (imageUrl.startsWith("blob:")) throw new Error("Browser object URLs cannot be published to Meta. Re-upload the image and try again.");

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Unable to load the selected creative image for publishing.");
  return readBlobAsDataUrl(await response.blob());
}

// Checks whether supported video file.
function isSupportedVideoFile(file) {
  const name = String(file?.name || "").toLowerCase();
  return supportedVideoTypes.includes(file?.type) || supportedVideoExtensions.some((extension) => name.endsWith(extension));
}

// This helper handles video mime type logic.
function inferVideoMimeType(file) {
  if (file?.type) return file.type;
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".m4v")) return "video/x-m4v";
  return "video/mp4";
}

// Gets video metadata.
function getVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: Number(video.videoWidth) || 0,
        height: Number(video.videoHeight) || 0,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video duration. Try another MP4 or MOV file."));
    };
    video.src = url;
  });
}

// Reads validated video file.
async function readValidatedVideoFile(file) {
  if (!file) return null;
  const hasVideoMimeOrExtension = file.type ? file.type.startsWith("video/") : supportedVideoExtensions.some((extension) => String(file.name || "").toLowerCase().endsWith(extension));
  if (!hasVideoMimeOrExtension) throw new Error("Choose a video file.");
  if (!isSupportedVideoFile(file)) throw new Error("Use an MP4 or MOV video for Meta publishing.");
  if (file.size > maxVideoBytes) throw new Error("Video must be 20 MB or smaller for this upload flow.");

  let metadata;
  try {
    metadata = await getVideoMetadata(file);
  } catch {
    metadata = { duration: 0, width: 0, height: 0 };
  }
  const duration = metadata.duration;
  if (duration > maxVideoDurationSeconds) throw new Error("Video must be 10 minutes or shorter for this Smart Ads flow.");

  return {
    dataUrl: await readBlobAsDataUrl(file),
    duration,
    width: metadata.width,
    height: metadata.height,
  };
}

// Resolves publishable video data url.
function resolvePublishableVideoDataUrl(form) {
  if (form.mediaType !== "video") return "";
  if (!form.videoDataUrl && form.existingVideoId) return "";
  if (!form.videoDataUrl) throw new Error("Re-select the video before publishing. Browser video files are not stored in drafts.");
  if (!String(form.videoDataUrl).startsWith("data:video/")) throw new Error("A publishable MP4 or MOV video file is required.");
  return form.videoDataUrl;
}

// Checks whether publishable destination.
function hasPublishableDestination(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname.replace(/^www\./, "") !== "yourbusiness.com";
  } catch {
    return false;
  }
}

// Formats meta publish error.
function formatMetaPublishError(error) {
  const details = error?.payload?.error || error?.payload?.publish?.error;
  if (!details) return error?.message || "Unable to publish Meta campaign.";

  const primary = details.userTitle || details.message;
  const secondary = details.userMessage && details.userMessage !== primary ? details.userMessage : "";
  const lines = [`Meta publish failed${details.step ? ` at ${details.step}` : ""}`, primary, secondary].filter(Boolean);
  const codes = [
    details.code ? `Code: ${details.code}` : "",
    details.subcode ? `Subcode: ${details.subcode}` : "",
    details.fbtraceId ? `fbtrace: ${details.fbtraceId}` : "",
  ].filter(Boolean);

  return [...lines, ...(codes.length ? [codes.join(" | ")] : [])].join("\n");
}

// This helper handles label logic.
function objectiveLabel(value) {
  return goalOptions.find((goal) => goal.id === value)?.label || value;
}

// Renders the metric card interface.
function MetricCard({ icon: Icon, label, value, helper, loading = false }) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 min-h-8 break-words text-2xl font-black text-slate-950" aria-busy={loading}>
            {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" aria-label="Loading metric" /> : value}
          </p>
          {helper && <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
          <Icon />
        </span>
      </div>
    </Card>
  );
}

// Renders the meta insights interface.
function MetaInsights({ status, connectionError, campaignCount, onRefresh }) {
  const [datePreset, setDatePreset] = useState("last_30d");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const accountId = status.selection?.adAccountId;

  useEffect(() => {
    if (status.loading || !status.connected || !accountId) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 25000);
    getMetaAdsInsights({ datePreset, signal: controller.signal })
      .then((data) => {
        if (active) setResult({ data, status, datePreset, retry });
      })
      .catch((error) => {
        if (active) setResult({
          status, datePreset, retry,
          data: { state: error.payload?.state || "API_ERROR", message: error.name === "AbortError" ? "Meta Insights took too long. Please retry." : error.message },
        });
      })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [status, accountId, datePreset, retry]);

  // Hide the old account/range immediately, including while the next request is starting.
  const data = result?.status === status && result?.datePreset === datePreset && result?.retry === retry ? result.data : null;
  const state = status.loading ? "LOADING" : !status.connected ? (connectionError ? "CONNECTION_ERROR" : "NOT_CONNECTED") : !accountId ? "NO_AD_ACCOUNT" : data?.state || "LOADING";
  const available = ["DATA", "NO_ACTIVITY"].includes(state);
  // Handles result.
  const metric = (key) => available && data.metrics[key] !== null ? data.metrics[key].toLocaleString("en-IN") : "--";
  const currency = data?.account?.currency;
  let spend = metric("spend");
  if (available && currency) {
    try { spend = new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(data.metrics.spend); }
    catch { spend = `${currency} ${spend}`; }
  }
  const message = {
    LOADING: "Loading Meta advertising activity...",
    NOT_CONNECTED: "Connect Meta to view advertising activity.",
    NO_AD_ACCOUNT: "Select an Ad Account in Meta connection settings.",
    AUTH_ERROR: "Meta authorization expired or was revoked. Reconnect Meta.",
    PERMISSION_REQUIRED: "Advertising read access is required. Check your account permissions and reconnect Meta.",
    NO_ACTIVITY: "No ad activity yet for this date range.",
    CONNECTION_ERROR: connectionError,
  }[state] || data?.message;
  return (
    <section className="space-y-3" aria-label="Meta account insights">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm font-bold text-slate-600">
          <p className="break-words">{available ? `Ad Account: ${data.account.name}` : "Ad Account activity"}</p>
          {available && data.dateStart && <p className="text-xs font-semibold">{data.dateStart} to {data.dateStop}</p>}
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Insights date range" value={datePreset} onChange={(event) => setDatePreset(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
            <option value="last_7d">Last 7 days</option>
            <option value="last_30d">Last 30 days</option>
          </select>
          <button type="button" aria-label="Refresh insights" title="Refresh insights" disabled={state === "LOADING" || !status.connected || !accountId} onClick={() => setRetry((value) => value + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><FiRefreshCw /></button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={FiTarget} label="Campaigns" value={campaignCount} helper="Saved on this browser" />
        <MetricCard icon={FiUsers} label="Reach" value={metric("reach")} helper="People reached" loading={state === "LOADING"} />
        <MetricCard icon={FiEye} label="Impressions" value={metric("impressions")} helper="Times ads were shown" loading={state === "LOADING"} />
        <MetricCard icon={FiBarChart2} label="Clicks" value={metric("clicks")} helper="All ad clicks" loading={state === "LOADING"} />
        <MetricCard icon={FiClock} label="Spend" value={spend} helper={currency || "Account currency"} loading={state === "LOADING"} />
        <MetricCard icon={FiUsers} label="Leads" value={metric("leads")} helper={available && data.metrics.leads === null ? "Not reported by Meta" : "Meta-reported leads"} loading={state === "LOADING"} />
      </div>
      {message && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
          <p className="min-w-0 break-words">{message}</p>
          {state === "NO_AD_ACCOUNT" ? (
            <a href="#smart-ads-meta-connection" className="font-bold text-blue-600">Review Meta connection</a>
          ) : ["NOT_CONNECTED", "AUTH_ERROR", "PERMISSION_REQUIRED"].includes(state) ? (
            <a href="#smart-ads-meta-connection" className="font-bold text-blue-600">Manage Meta connection</a>
          ) : !["LOADING", "NO_ACTIVITY"].includes(state) ? (
            <Button onClick={() => state === "CONNECTION_ERROR" ? onRefresh() : setRetry((value) => value + 1)} className="border border-slate-200 bg-white text-slate-700"><FiRefreshCw />Retry</Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

// Renders the status badge interface.
function StatusBadge({ status }) {
  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-black", statusStyles[status] || statusStyles.draft)}>
      {statusLabel(status)}
    </span>
  );
}

// Renders the meta asset select interface.
function MetaAssetSelect({ label, value, onChange, options, emptyLabel, getOptionLabel, disabled = false }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || !options.length}
        className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
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

// Renders the meta requirement row interface.
function MetaRequirementRow({ ok, optional = false, label, helper }) {
  const Icon = ok ? FiCheck : optional ? FiClock : FiX;
  return (
    <div className="flex items-start gap-2 text-xs font-bold leading-5">
      <span
        className={cx(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
          ok && "bg-emerald-50 text-emerald-600",
          !ok && optional && "bg-slate-100 text-slate-400",
          !ok && !optional && "bg-rose-50 text-rose-600",
        )}
      >
        <Icon className="text-[11px]" />
      </span>
      <span>
        <span className={ok ? "text-slate-800" : optional ? "text-slate-500" : "text-rose-700"}>{label}</span>
        {helper && <span className="block font-semibold text-slate-500">{helper}</span>}
      </span>
    </div>
  );
}

// Finds asset warning.
function findAssetWarning(assets, keyword) {
  const normalizedKeyword = keyword.toLowerCase();
  return (assets.warnings || []).find((warning) => String(warning.area || "").toLowerCase().includes(normalizedKeyword));
}

// Renders the meta connection card interface.
function MetaConnectionCard({
  status,
  assets,
  selection,
  loading,
  error,
  onConnect,
  onReconnect,
  onRefresh,
  onDisconnect,
  onSelectionChange,
  onSaveSelection,
}) {
  const connected = Boolean(status.connected);
  const configured = status.configured !== false;
  const readiness = resolveMetaReadiness(status, assets, selection);
  const selectedPage = assets.pages.find((page) => page.id === selection.pageId);
  const instagramOptions = selectedPage?.instagramAccountId
    ? assets.instagramAccounts.filter((account) => account.id === selectedPage.instagramAccountId)
    : assets.instagramAccounts;
  const pagesWarning = findAssetWarning(assets, "page");
  const adAccountsWarning = findAssetWarning(assets, "ad account");
  const connectedStatusLabel = status.lastError ? "Token expired / Reconnect required" : "Connected";
  const hasKnownAccess = readiness.hasRequiredAccess === true;
  const accessUnknown = readiness.hasRequiredAccess === "unknown";
  const saveDisabled = loading || !readiness.hasPage || !readiness.hasAdAccount || !selection.pageId || !selection.adAccountId || readiness.hasRequiredAccess === false;
  const showNoPage = connected && !readiness.hasPage;
  const showNoAdAccount = connected && readiness.hasPage && !readiness.hasAdAccount;
  const showAccessBlock = connected && readiness.hasRequiredAccess === false && !showNoPage && !showNoAdAccount;

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white", connected ? "bg-emerald-600" : "bg-slate-950")}>
          {connected ? <FiCheck /> : <FiZap />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Integrations</p>
          <h2 className="mt-1 text-base font-black text-slate-950">Meta / Facebook & Instagram</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Status:{" "}
            <span className={connected ? "text-emerald-600" : "text-rose-600"}>
              {connected ? connectedStatusLabel : configured ? "Not Connected" : "Configuration Missing"}
            </span>
          </p>
          {connected && status.user?.name && <p className="mt-1 truncate text-xs font-bold text-slate-500">Connected as {status.user.name}</p>}
        </div>
      </div>

      {connected && (
        <div className={cx("mt-4 rounded-lg border p-3", readiness.readyToPublish ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{readiness.readyToPublish ? "Ready to publish" : "Setup required"}</p>
            <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-black", readiness.readyToPublish ? "bg-white text-emerald-700" : "bg-white text-amber-700")}>
              {readiness.readyToPublish ? "Ready" : "Needs setup"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <MetaRequirementRow ok={readiness.hasPage && readiness.hasSelectedPage} label="Facebook Page" helper={readiness.hasPage ? "Required for ad identity" : "Required but not found"} />
            <MetaRequirementRow ok={readiness.hasAdAccount && readiness.hasSelectedAdAccount} label="Ad Account" helper={readiness.hasAdAccount ? "Required for campaign publishing" : "Required but not found"} />
            <MetaRequirementRow ok={Boolean(selection.instagramAccountId)} optional label="Instagram - Optional" helper={selection.instagramAccountId ? "Selected for Instagram placement identity" : "Not required for this phase"} />
            <MetaRequirementRow
              ok={hasKnownAccess}
              optional={accessUnknown}
              label="Advertising access"
              helper={hasKnownAccess ? "Required permissions are available" : accessUnknown ? "Confirmed during publishing" : "Admin/permission action required"}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex gap-2 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">
          <FiAlertCircle className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!configured && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
          Add the Meta env values on the Express backend before connecting.
        </div>
      )}

      {!connected ? (
        <Button onClick={onConnect} disabled={loading || !configured} className="mt-4 bg-slate-950 text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300">
          <FiZap />
          {loading ? "Checking..." : "Connect Meta"}
        </Button>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3">
            <MetaAssetSelect
              label="Business Portfolio"
              value={selection.businessId}
              onChange={(value) => onSelectionChange({ businessId: value, pageId: "", instagramAccountId: "", adAccountId: "" })}
              options={assets.businesses}
              emptyLabel={assets.businesses.length ? "Select Business Portfolio" : "No Business Portfolio found"}
              getOptionLabel={(business) => [business.name, business.verificationStatus].filter(Boolean).join(" - ")}
            />
            <MetaAssetSelect
              label="Facebook Page"
              value={selection.pageId}
              onChange={(value) => onSelectionChange({ pageId: value, instagramAccountId: "" })}
              options={assets.pages}
              emptyLabel={assets.pages.length ? "Select Facebook Page" : "No Facebook Page found"}
              getOptionLabel={(page) => [page.name, page.category].filter(Boolean).join(" - ")}
            />
            {!assets.pages.length && (
              <div className={cx("rounded-lg p-3 text-xs font-bold leading-5", pagesWarning ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600")}>
                <p className="font-black text-slate-900">No Facebook Page found</p>
                <p className="mt-1">
                  Smart Ads requires a Facebook Page to publish ads. Create a Page or ask your business admin to give you access, then refresh your Meta connection.
                </p>
              </div>
            )}
            <MetaAssetSelect
              label="Instagram Account"
              value={selection.instagramAccountId}
              onChange={(value) => onSelectionChange({ instagramAccountId: value })}
              options={instagramOptions}
              emptyLabel={instagramOptions.length ? "Select Instagram Account" : "No linked Instagram account"}
              getOptionLabel={(account) => `@${account.username || account.name}`}
            />
            {!instagramOptions.length && (
              <p className="rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500">
                No linked Instagram professional account found. Instagram is optional for this phase.
              </p>
            )}
            <MetaAssetSelect
              label="Ad Account"
              value={selection.adAccountId}
              onChange={(value) => onSelectionChange({ adAccountId: value })}
              options={assets.adAccounts}
              emptyLabel={assets.adAccounts.length ? "Select Ad Account" : "No Ad Account found"}
              getOptionLabel={(account) => [account.name, account.currency].filter(Boolean).join(" - ")}
            />
            {!assets.adAccounts.length && (
              <div className={cx("rounded-lg p-3 text-xs font-bold leading-5", adAccountsWarning ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>
                <p className="font-black text-slate-900">No Ad Account found</p>
                <p className="mt-1">
                  {adAccountsWarning
                    ? `Meta denied Ad Account discovery for this connection. Vyapaar currently lacks ${readiness.missingPermissions?.filter((permission) => ["ads_management", "ads_read", "business_management"].includes(permission)).join(", ") || "the required advertising permissions"}. Update the saved Login for Business configuration and reconnect.`
                    : "A Meta Ad Account is required to publish ads. Connect an Ad Account or ask your business admin for advertising access."}
                </p>
              </div>
            )}
          </div>

          {showAccessBlock && (
            <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">
              <p className="font-black">You don't have permission to advertise with this Facebook Page or Ad Account.</p>
              <p className="mt-1">Ask the business admin to give your Facebook account the required advertising access, then reconnect Meta.</p>
            </div>
          )}

          {readiness.blockingReason && !showNoPage && !showNoAdAccount && !showAccessBlock && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
              <p>{readiness.blockingReason}</p>
              {readiness.missingPermissions?.length ? <p className="mt-1 text-slate-500">Missing: {readiness.missingPermissions.join(", ")}</p> : null}
            </div>
          )}

          {assets.warnings?.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500">
              Some Meta asset edges were unavailable. You can still select from returned assets.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={onSaveSelection} disabled={saveDisabled} className="bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300">
              <FiSave />
              Save Selection
            </Button>
            <Button onClick={onRefresh} disabled={loading} className="border border-slate-200 bg-white px-4 text-slate-700 shadow-sm hover:bg-slate-50 disabled:text-slate-300">
              <FiRefreshCw />
              Refresh
            </Button>
            <Button onClick={onReconnect} disabled={loading || !configured} className="border border-slate-200 bg-white px-4 text-slate-700 shadow-sm hover:bg-slate-50 disabled:text-slate-300">
              <FiZap />
              Reconnect
            </Button>
            <Button onClick={onDisconnect} disabled={loading} className="border border-rose-100 bg-white px-4 text-rose-600 shadow-sm hover:bg-rose-50 disabled:text-slate-300">
              <FiX />
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Renders the ad preview interface.
function AdPreview({ form, creativeImage, creativeVideo, selectedItem, captionTouched = false }) {
  const isVideo = form.mediaType === "video";
  const hasItemCreative = !isVideo && form.creativeSource === "item-image" && selectedItem && creativeImage;
  const displayTitle = hasItemCreative ? itemDisplayName(selectedItem) : form.headline || "Your ad headline";
  const displayMeta = hasItemCreative ? itemMetaLine(selectedItem) : "";
  const shouldShowCampaignCaption = form.caption && (!hasItemCreative || captionTouched);
  const displayCaption = shouldShowCampaignCaption ? form.caption : hasItemCreative ? "Add a short message in Step 1 to support this product ad." : "Write a short message that tells customers what to do next.";
  const emptyMessage = isVideo ? "Upload an MP4 or MOV video to preview your ad" : form.creativeSource === "item-image" ? "Select an item image to preview your ad" : "Select or upload a creative";

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Ad Preview</p>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-sm font-black text-white">B</span>
          <div>
            <p className="text-sm font-black text-slate-950">Your Business</p>
            <p className="text-xs font-semibold text-slate-500">Sponsored preview</p>
          </div>
        </div>
        <div className={isVideo ? "flex min-h-52 w-full items-center justify-center rounded-xl border border-slate-200 bg-black p-2 sm:min-h-60" : "grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-3"}>
          {isVideo && creativeVideo ? (
            <video src={creativeVideo} controls className="block h-auto max-h-[360px] w-auto max-w-full rounded-lg object-contain object-center sm:max-h-[420px] lg:max-h-[460px]" />
          ) : creativeImage ? (
            <img src={creativeImage} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="grid min-h-52 place-items-center text-center text-sm font-bold text-slate-400">
              <span>
                {isVideo ? <FiVideo className="mx-auto mb-2 text-2xl" /> : <FiImage className="mx-auto mb-2 text-2xl" />}
                {emptyMessage}
              </span>
            </div>
          )}
        </div>
        <div className="mt-4 space-y-1">
          <h3 className="text-xl font-black leading-tight text-slate-950">{displayTitle}</h3>
          {displayMeta && <p className="text-sm font-black text-blue-700">{displayMeta}</p>}
          <p className="pt-1 text-sm leading-6 text-slate-600">{displayCaption}</p>
        </div>
        <button type="button" className="mt-4 h-10 rounded-full bg-slate-950 px-5 text-sm font-black text-white shadow-sm">
          {form.cta}
        </button>
      </div>
    </Card>
  );
}

// Renders the stepper interface.
function Stepper({ step }) {
  return (
    <div className="grid gap-2 md:grid-cols-5">
      {stepLabels.map((label, index) => (
        <div
          key={label}
          className={cx(
            "rounded-lg border p-3",
            index === step && "border-blue-500 bg-blue-50 ring-2 ring-blue-100",
            index < step && "border-emerald-200 bg-white",
            index > step && "border-slate-200 bg-white",
          )}
        >
          <p className={cx("text-xs font-black", index === step && "text-blue-700", index < step && "text-emerald-600", index > step && "text-slate-400")}>0{index + 1}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{label}</p>
        </div>
      ))}
    </div>
  );
}

// Renders the field label interface.
function FieldLabel({ children }) {
  return <label className="text-xs font-black uppercase tracking-wide text-slate-500">{children}</label>;
}

// Renders the text input interface.
function TextInput(props) {
  return <input {...props} className={cx("h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500", props.className)} />;
}

// Renders the text area interface.
function TextArea(props) {
  return <textarea {...props} className={cx("min-h-24 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500", props.className)} />;
}

// Renders the smart ads interface.
function SmartAds() {
  const callbackNotice = readMetaCallbackNotice();
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsLoadError, setCampaignsLoadError] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);
  const [sessionDesigns, setSessionDesigns] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm());

  useEffect(() => {
    let active = true;
    loadGrowthCampaigns()
      .then((saved) => {
        if (active) {
          setCampaigns(saved);
          setCampaignsLoadError("");
        }
      })
      .catch((error) => {
        if (active) setCampaignsLoadError(error.message || "Unable to load saved campaigns.");
      })
      .finally(() => {
        if (active) setCampaignsLoading(false);
      });

    Promise.all([loadGrowthItems(), getSessionDesigns()])
      .then(([items, designs]) => {
        if (!active) return;
        setInventoryItems(items);
        setSessionDesigns(designs);
      })
      .catch((error) => {
        if (active) setError(error.message || "Unable to load Smart Ads resources.");
      });

    return () => {
      active = false;
    };
  }, []);
  const [view, setView] = useState("dashboard");
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState("all");
  const [locationInput, setLocationInput] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(callbackNotice.toast);
  const [metaStatus, setMetaStatus] = useState({
    loading: true,
    configured: true,
    connected: false,
    user: null,
    permissions: [],
    selection: emptyMetaSelection(),
    readiness: emptyMetaReadiness(),
    lastError: callbackNotice.error,
  });
  const [metaAssets, setMetaAssets] = useState(() => emptyMetaAssets());
  const [metaSelection, setMetaSelection] = useState(() => emptyMetaSelection());
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(callbackNotice.error);
  const [publishing, setPublishing] = useState(false);
  const [touched, setTouched] = useState({ headline: false, caption: false, creative: false });

  const templateOptions = useMemo(() => marketingTemplates.slice(0, 10), []);
  const creativeImage = resolveCreativeImage(form, inventoryItems, templateOptions, sessionDesigns);
  const creativeVideo = resolveCreativeVideo(form);
  const selectedItem = inventoryItems.find((item) => item.id === form.selectedItemId);
  const itemImageOptions = inventoryItems.filter((item) => itemImage(item));
  const estimatedBudget = Math.max(Number(form.dailyBudget) || 0, 0) * Math.max(Number(form.durationDays) || 0, 0);
  const endDate = addDays(form.startDate, form.durationDays);
  const metaReadiness = useMemo(() => resolveMetaReadiness(metaStatus, metaAssets, metaSelection), [metaStatus, metaAssets, metaSelection]);

  const filteredCampaigns = filter === "all" ? campaigns : campaigns.filter((campaign) => campaign.status === filter);

  // Handles campaigns.
  async function reloadCampaigns() {
    setCampaignsLoading(true);
    setCampaignsLoadError("");
    try {
      setCampaigns(await loadGrowthCampaigns());
    } catch (loadError) {
      setCampaignsLoadError(loadError.message || "Unable to load saved campaigns.");
    } finally {
      setCampaignsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    cleanMetaCallbackNotice();

    getMetaConnectionStatus()
      .then((status) => {
        if (!active) return null;
        setMetaStatus({ ...status, loading: false });
        setMetaAssets(status.assets || emptyMetaAssets());
        setMetaSelection(status.selection || emptyMetaSelection());
        setMetaError((current) => current || status.lastError || "");
        if (!status.connected) return null;
        return getMetaAssets({ businessId: status.selection?.businessId });
      })
      .then((assetsStatus) => {
        if (!active || !assetsStatus) return;
        setMetaStatus({ ...assetsStatus, loading: false });
        setMetaAssets(assetsStatus.assets || emptyMetaAssets());
        setMetaSelection(assetsStatus.selection || emptyMetaSelection());
      })
      .catch((statusError) => {
        if (!active) return;
        if (statusError.payload) {
          setMetaStatus({ ...statusError.payload, loading: false });
          setMetaAssets(statusError.payload.assets || emptyMetaAssets());
          setMetaSelection(statusError.payload.selection || emptyMetaSelection());
        } else {
          setMetaStatus((current) => ({ ...current, loading: false, connected: false }));
        }
        setMetaError(statusError.message || "Unable to load Meta connection status.");
      });

    return () => {
      active = false;
    };
  }, []);

  // Updates form.
  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  // Updates form field.
  function updateFormField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  // Handles item select.
  function handleItemSelect(itemId) {
    const item = inventoryItems.find((current) => current.id === itemId);
    if (!item) {
      updateForm({ selectedItemId: "" });
      return;
    }

    const pricing = calculateInventoryItemPricing(item);
    const priceLine = pricing.finalPrice ? `${formatCurrency(pricing.finalPrice)}${item.unit ? ` / ${item.unit}` : ""}` : "";
    const caption = [item.category, priceLine].filter(Boolean).join(" - ");

    setForm((current) => ({
      ...current,
      selectedItemId: item.id,
      headline: touched.headline || current.headline ? current.headline : item.itemName || item.name,
      caption: touched.caption || current.caption ? current.caption : caption || current.caption,
    }));
  }

  // Handles image upload.
  function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTouched((current) => ({ ...current, creative: true }));
      setForm((current) => ({
        ...current,
        mediaType: "image",
        creativeSource: "upload",
        uploadDataUrl: String(reader.result || ""),
        uploadName: file.name,
        templateId: "",
        sessionDesignId: "",
      }));
    };
    reader.readAsDataURL(file);
  }

  // Handles video upload.
  async function handleVideoUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const video = await readValidatedVideoFile(file);
      setTouched((current) => ({ ...current, creative: true }));
      setForm((current) => ({
        ...current,
        mediaType: "video",
        creativeSource: "upload",
        videoDataUrl: video.dataUrl,
        videoName: file.name,
        videoMimeType: inferVideoMimeType(file),
        videoSize: file.size,
        videoDuration: Math.round(video.duration),
        videoWidth: video.width,
        videoHeight: video.height,
        videoNeedsReselect: false,
        existingVideoId: "",
        templateId: "",
        sessionDesignId: "",
      }));
      setError("");
    } catch (videoError) {
      setError(videoError.message || "Unable to use this video file.");
    }
  }

  // Handles location.
  function addLocation() {
    const nextLocation = locationInput.trim();
    if (!nextLocation || form.locations.includes(nextLocation)) return;
    updateFormField("locations", [...form.locations, nextLocation]);
    setLocationInput("");
  }

  // Removes location.
  function removeLocation(location) {
    updateFormField(
      "locations",
      form.locations.filter((current) => current !== location),
    );
  }

  // Toggles interest.
  function toggleInterest(interest) {
    updateFormField(
      "interests",
      form.interests.includes(interest) ? form.interests.filter((current) => current !== interest) : [...form.interests, interest],
    );
  }

  // Handles custom interest.
  function addCustomInterest() {
    const nextInterest = form.interestInput.trim();
    if (!nextInterest || form.interests.includes(nextInterest)) return;
    updateForm({ interests: [...form.interests, nextInterest], interestInput: "" });
  }

  // Validates step.
  function validateStep(stepIndex) {
    if (stepIndex === 0) {
      if (!form.campaignName.trim()) return "Campaign name is required.";
      if (!form.headline.trim()) return "Ad headline is required.";
      if (form.goal === "product" && !form.selectedItemId) return "Select an existing item or service for this campaign goal.";
    }

    if (stepIndex === 1) {
      if (form.mediaType === "video") {
        if (!form.videoDataUrl && !form.existingVideoId) return form.videoName ? "Re-select the video before publishing. Browser video files are not stored in drafts." : "Upload an MP4 or MOV video.";
        return "";
      }
      if (form.creativeSource === "upload" && !form.uploadDataUrl) return "Upload a creative image.";
      if (form.creativeSource === "marketing-studio" && !form.templateId && !form.sessionDesignId) return "Select a Marketing Studio design.";
      if (form.creativeSource === "item-image") {
        const selectedImageItem = inventoryItems.find((item) => item.id === form.selectedItemId);
        if (!itemImage(selectedImageItem)) return "Select an item image.";
      }
    }

    if (stepIndex === 2) {
      if (Number(form.minAge) >= Number(form.maxAge)) return "Minimum age must be less than maximum age.";
      if (form.locationMode === "target-area" && form.locations.filter(Boolean).length === 0) return "Add at least one target location.";
    }

    if (stepIndex === 3) {
      if (!form.startDate) return "Start date is required.";
      if (Number(form.dailyBudget) <= 0) return "Daily budget must be greater than zero.";
      if (Number(form.durationDays) <= 0) return "Duration must be at least one day.";
      if (form.scheduleMode === "custom" && (!form.startTime || !form.endTime || form.startTime >= form.endTime)) {
        return "Custom start time must be earlier than end time.";
      }
    }

    return "";
  }

  // Validates all steps.
  function validateAllSteps() {
    for (let index = 0; index < stepLabels.length - 1; index += 1) {
      const message = validateStep(index);
      if (message) {
        setStep(index);
        return message;
      }
    }
    return "";
  }

  // Handles next.
  function goNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, stepLabels.length - 1));
  }

  // Saves campaign.
  async function saveCampaign(status) {
    const message = status === "draft" ? "" : validateAllSteps();
    if (message) {
      setError(message);
      return;
    }

    try {
      const saved = await saveGrowthCampaign(campaignFromForm(form, status, inventoryItems, templateOptions, sessionDesigns));
      setCampaigns((current) => [saved, ...current.filter((campaign) => campaign.id !== saved.id)]);
      setForm(formFromCampaign(saved));
      setError("");
      setToast(status === "draft" ? "Draft saved." : "Campaign created in demo mode.");
      setView("dashboard");
      setStep(0);
      loadGrowthCampaigns()
        .then((savedCampaigns) => {
          setCampaigns(savedCampaigns);
          setCampaignsLoadError("");
        })
        .catch((loadError) => setCampaignsLoadError(loadError.message || "Campaign saved, but the list could not be refreshed."));
    } catch (saveError) { setError(saveError.message || "Unable to save the campaign."); }
  }

  // Handles campaign to meta.
  async function publishCampaignToMeta() {
    const message = validateAllSteps();
    if (message) {
      setError(message);
      return;
    }
    if (!metaReadiness.readyToPublish) {
      setError(metaReadiness.blockingReason || "Complete Meta setup before publishing this campaign.");
      return;
    }
    if (!hasPublishableDestination(form.website)) {
      setError("Enter a real public HTTP/HTTPS website URL before publishing. WhatsApp destination publishing is not enabled yet.");
      return;
    }

    setPublishing(true);
    setError("");

    const baseCampaign = campaignFromForm(form, "published", inventoryItems, templateOptions, sessionDesigns);

    try {
      const imageDataUrl = form.mediaType === "image" ? await resolvePublishableCreativeDataUrl(creativeImage) : "";
      const videoDataUrl = form.mediaType === "video" ? resolvePublishableVideoDataUrl(form) : "";
      const response = await publishMetaCampaign({
        ...baseCampaign,
        creative: {
          ...baseCampaign.creative,
          ...(imageDataUrl ? { imageDataUrl } : {}),
          ...(videoDataUrl
            ? {
                videoDataUrl,
                videoName: form.videoName,
                videoMimeType: form.videoMimeType,
                videoSize: form.videoSize,
                videoDuration: form.videoDuration,
                videoWidth: form.videoWidth,
                videoHeight: form.videoHeight,
              }
            : {}),
        },
      });
      const saved = await saveGrowthCampaign(campaignWithPublishResult(baseCampaign, response.publish, "published"));
      setCampaigns(await loadGrowthCampaigns());
      setForm(formFromCampaign(saved));
      setToast("Campaign published to Meta in paused state.");
      setView("dashboard");
      setStep(0);
    } catch (publishError) {
      const publish = publishError.payload?.publish;
      const partialIds = publish?.ids || {};
      const hasPartialMetaObject = Boolean(partialIds.metaCampaignId || partialIds.metaAdSetId || partialIds.metaVideoId || partialIds.metaCreativeId || partialIds.metaAdId);

      if (hasPartialMetaObject) {
        const formattedError = formatMetaPublishError(publishError);
        const failed = await saveGrowthCampaign(campaignWithPublishResult(baseCampaign, publish, "publish-failed", formattedError));
        setCampaigns(await loadGrowthCampaigns());
        setForm(formFromCampaign(failed));
        setToast("Meta publishing failed after creating partial objects. Check the campaign card for saved Meta IDs.");
        setView("dashboard");
        setStep(0);
      } else {
        setError(formatMetaPublishError(publishError));
      }
    } finally {
      setPublishing(false);
    }
  }

  // Starts new campaign.
  function startNewCampaign() {
    setForm(createEmptyForm());
    setTouched({ headline: false, caption: false, creative: false });
    setError("");
    setToast("");
    setStep(0);
    setView("builder");
  }

  // Handles campaign.
  function editCampaign(campaign) {
    setForm(formFromCampaign(campaign));
    setTouched({ headline: true, caption: true, creative: true });
    setError("");
    setToast("");
    setStep(0);
    setView("builder");
  }

  // Refreshes meta connection.
  async function refreshMetaConnection() {
    setMetaLoading(true);
    setMetaError("");

    try {
      const status = await getMetaConnectionStatus();
      let nextStatus = status;

      if (status.connected) {
        nextStatus = await getMetaAssets({ businessId: status.selection?.businessId });
      }

      setMetaStatus({ ...nextStatus, loading: false });
      setMetaAssets(nextStatus.assets || emptyMetaAssets());
      setMetaSelection(nextStatus.selection || emptyMetaSelection());
      return nextStatus;
    } catch (metaRequestError) {
      const message = metaRequestError.message || "Unable to refresh Meta connection.";
      if (metaRequestError.payload) {
        setMetaStatus({ ...metaRequestError.payload, loading: false });
        setMetaAssets(metaRequestError.payload.assets || emptyMetaAssets());
        setMetaSelection(metaRequestError.payload.selection || emptyMetaSelection());
      }
      setMetaError(message);
      setMetaStatus((current) => ({ ...current, loading: false }));
      return null;
    } finally {
      setMetaLoading(false);
    }
  }

  // Handles connect meta.
  async function handleConnectMeta({ rerequest = false } = {}) {
    setMetaLoading(true);
    setMetaError("");

    try {
      const status = await getMetaConnectionStatus();
      if (!status.configured) {
        setMetaStatus({ ...status, loading: false });
        setMetaAssets(status.assets || emptyMetaAssets());
        setMetaSelection(status.selection || emptyMetaSelection());
        setMetaError("Meta environment configuration is missing on the backend.");
        setMetaLoading(false);
        return;
      }
      startMetaConnection({ rerequest });
    } catch (metaRequestError) {
      setMetaLoading(false);
      setMetaError(metaRequestError.message || "Unable to start Meta connection.");
    }
  }

  // Handles reconnect meta.
  function handleReconnectMeta() {
    return handleConnectMeta({ rerequest: true });
  }

  // Handles meta selection change.
  async function handleMetaSelectionChange(patch) {
    const nextSelection = { ...metaSelection, ...patch };
    setMetaSelection(nextSelection);

    if (Object.prototype.hasOwnProperty.call(patch, "businessId")) {
      setMetaLoading(true);
      setMetaError("");
      try {
        const refreshed = await getMetaAssets({ businessId: nextSelection.businessId });
        const scopedSelection = {
          ...(refreshed.selection || emptyMetaSelection()),
          businessId: nextSelection.businessId,
          pageId: nextSelection.pageId,
          instagramAccountId: nextSelection.instagramAccountId,
          adAccountId: nextSelection.adAccountId,
        };
        const saved = await saveMetaAssetSelection(scopedSelection);
        setMetaStatus({ ...saved, loading: false });
        setMetaAssets(saved.assets || refreshed.assets || emptyMetaAssets());
        setMetaSelection(saved.selection || scopedSelection);
      } catch (metaRequestError) {
        if (metaRequestError.payload) {
          setMetaStatus({ ...metaRequestError.payload, loading: false });
          setMetaAssets(metaRequestError.payload.assets || emptyMetaAssets());
          setMetaSelection(metaRequestError.payload.selection || emptyMetaSelection());
        }
        setMetaError(metaRequestError.message || "Unable to refresh Meta assets for the selected business.");
      } finally {
        setMetaLoading(false);
      }
      return;
    }

    saveMetaAssetSelection(nextSelection)
      .then((saved) => {
        setMetaStatus({ ...saved, loading: false });
        setMetaAssets(saved.assets || emptyMetaAssets());
        setMetaSelection(saved.selection || emptyMetaSelection());
      })
      .catch((metaRequestError) => {
        if (metaRequestError.payload) {
          setMetaStatus({ ...metaRequestError.payload, loading: false });
          setMetaAssets(metaRequestError.payload.assets || emptyMetaAssets());
          setMetaSelection(metaRequestError.payload.selection || emptyMetaSelection());
        }
        setMetaError(metaRequestError.message || "Unable to save Meta asset selection.");
      });
  }

  // Handles save meta selection.
  async function handleSaveMetaSelection() {
    setMetaLoading(true);
    setMetaError("");

    try {
      const saved = await saveMetaAssetSelection(metaSelection);
      setMetaStatus({ ...saved, loading: false });
      setMetaAssets(saved.assets || emptyMetaAssets());
      setMetaSelection(saved.selection || emptyMetaSelection());
      setToast("Meta asset selection saved.");
    } catch (metaRequestError) {
      setMetaError(metaRequestError.message || "Unable to save Meta asset selection.");
    } finally {
      setMetaLoading(false);
    }
  }

  // Handles disconnect meta.
  async function handleDisconnectMeta() {
    setMetaLoading(true);
    setMetaError("");

    try {
      const disconnected = await disconnectMeta();
      setMetaStatus({ ...disconnected, loading: false });
      setMetaAssets(disconnected.assets || emptyMetaAssets());
      setMetaSelection(disconnected.selection || emptyMetaSelection());
      setToast("Meta disconnected.");
    } catch (metaRequestError) {
      setMetaError(metaRequestError.message || "Unable to disconnect Meta.");
    } finally {
      setMetaLoading(false);
    }
  }

  // Renders ad details step.
  function renderAdDetailsStep() {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel>Campaign Name *</FieldLabel>
              <TextInput value={form.campaignName} onChange={(event) => updateFormField("campaignName", event.target.value)} placeholder="Monsoon offer campaign" />
            </div>
            <div>
              <FieldLabel>Campaign Goal *</FieldLabel>
              <select value={form.goal} onChange={(event) => updateForm({ goal: event.target.value, selectedItemId: event.target.value === "product" ? form.selectedItemId : "" })} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500">
                {goalOptions.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>CTA</FieldLabel>
              <select value={form.cta} onChange={(event) => updateFormField("cta", event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500">
                {ctaOptions.map((cta) => (
                  <option key={cta}>{cta}</option>
                ))}
              </select>
            </div>
            {form.goal === "product" && (
              <div className="md:col-span-2">
                <FieldLabel>Select Existing Item / Service</FieldLabel>
                <select value={form.selectedItemId} onChange={(event) => handleItemSelect(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500">
                  <option value="">Choose from shared inventory</option>
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.itemName || item.name} {item.type === "service" ? "(Service)" : "(Product)"}
                    </option>
                  ))}
                </select>
                {selectedItem && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-600">
                    <span>{selectedItem.category || "Uncategorized"}</span>
                    <span>-</span>
                    <span>{formatCurrency(calculateInventoryItemPricing(selectedItem).finalPrice)}</span>
                    {selectedItem.discountValue && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{selectedItem.discountValue} {selectedItem.discountType}</span>}
                  </div>
                )}
              </div>
            )}
            <div>
              <FieldLabel>Ad Headline *</FieldLabel>
              <TextInput
                value={form.headline}
                onChange={(event) => {
                  setTouched((current) => ({ ...current, headline: true }));
                  updateFormField("headline", event.target.value);
                }}
                placeholder="Fresh offers for your customers"
              />
            </div>
            <div>
              <FieldLabel>Website Link</FieldLabel>
              <TextInput value={form.website} onChange={(event) => updateFormField("website", event.target.value)} placeholder="https://yourbusiness.com" />
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Ad Caption / Primary Text</FieldLabel>
              <TextArea
                value={form.caption}
                onChange={(event) => {
                  setTouched((current) => ({ ...current, caption: true }));
                  updateFormField("caption", event.target.value);
                }}
                placeholder="Tell customers about the offer, product, or service."
              />
            </div>
          </div>
        </Card>
        <AdPreview form={form} creativeImage={creativeImage} creativeVideo={creativeVideo} selectedItem={selectedItem} captionTouched={touched.caption} />
      </div>
    );
  }

  // Renders creative step.
  function renderCreativeStep() {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-5 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "image", label: "Image", icon: FiImage },
              { id: "video", label: "Video", icon: FiVideo },
            ].map((type) => {
              const TypeIcon = type.icon;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    setTouched((current) => ({ ...current, creative: true }));
                    updateForm({
                      mediaType: type.id,
                      creativeSource: "upload",
                      ...(type.id === "image" ? { videoDataUrl: "", videoNeedsReselect: false } : {}),
                    });
                  }}
                  className={cx("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-black", form.mediaType === type.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
                >
                  <TypeIcon />
                  {type.label}
                </button>
              );
            })}
          </div>

          {form.mediaType === "image" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { id: "upload", label: "Upload Creative", icon: FiUpload },
                { id: "marketing-studio", label: "Marketing Studio", icon: FiImage },
                { id: "item-image", label: "Item Image", icon: FiPackage },
              ].map((source) => {
                const SourceIcon = source.icon;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => {
                      setTouched((current) => ({ ...current, creative: true }));
                      updateFormField("creativeSource", source.id);
                    }}
                    className={cx("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-black", form.creativeSource === source.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
                  >
                    <SourceIcon />
                    {source.label}
                  </button>
                );
              })}
            </div>
          )}

          {form.mediaType === "image" && form.creativeSource === "upload" && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <FiUpload className="mx-auto text-3xl text-blue-600" />
              <p className="mt-3 text-sm font-black text-slate-950">Upload an image creative</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">PNG or JPG works best. This can be published after Review.</p>
              <label className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-black text-white">
                Choose Image
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
              {form.uploadName && <p className="mt-3 text-xs font-bold text-slate-500">{form.uploadName}</p>}
            </div>
          )}

          {form.mediaType === "video" && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <FiVideo className="mx-auto text-3xl text-blue-600" />
              <p className="mt-3 text-sm font-black text-slate-950">Upload a video creative</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">MP4 or MOV, up to 20 MB and 10 minutes. Select again after reopening a draft.</p>
              <label className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-black text-white">
                Choose Video
                <input type="file" accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v" onChange={handleVideoUpload} className="hidden" />
              </label>
              {form.videoName && (
                <div className="mt-3 text-xs font-bold text-slate-500">
                  <p>{form.videoName}</p>
                  <p>
                    {form.videoDuration ? `${Math.round(form.videoDuration)} sec` : "Duration not saved"} {form.videoSize ? `- ${(form.videoSize / (1024 * 1024)).toFixed(1)} MB` : ""}
                  </p>
                  {form.videoWidth && form.videoHeight ? <p>{form.videoWidth} × {form.videoHeight}</p> : null}
                  {form.videoNeedsReselect && (
                    <p className="mt-2 text-amber-600">
                      {form.existingVideoId ? "Saved Meta video can be reused for retry. Re-select only if you want to replace it." : "Re-select this video before publishing."}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {form.mediaType === "image" && form.creativeSource === "marketing-studio" && (
            <div className="mt-5">
              <p className="text-sm font-black text-slate-950">Choose a reusable design</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {templateOptions.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => updateForm({ templateId: template.id, sessionDesignId: "" })}
                    className={cx("overflow-hidden rounded-xl border bg-white text-left shadow-sm", form.templateId === template.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300")}
                  >
                      <div className="grid aspect-[4/3] place-items-center bg-slate-100 p-3">
                        <img src={template.thumbnail} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-1 text-sm font-black text-slate-950">{template.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{template.category}</p>
                    </div>
                  </button>
                ))}
                {sessionDesigns.map((design) => (
                  <button
                    key={design.id}
                    type="button"
                    onClick={() => updateForm({ templateId: "", sessionDesignId: design.id })}
                    className={cx("overflow-hidden rounded-xl border bg-white text-left shadow-sm", form.sessionDesignId === design.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300")}
                  >
                    <div className="grid aspect-[4/3] place-items-center bg-slate-100 p-3">
                      {design.thumbnail || design.background?.src ? <img src={design.thumbnail || design.background?.src} alt="" className="max-h-full max-w-full object-contain" /> : <FiImage className="text-3xl text-slate-400" />}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-1 text-sm font-black text-slate-950">{design.title || design.name || "Session Design"}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">Saved session design</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.mediaType === "image" && form.creativeSource === "item-image" && (
            <div className="mt-5">
              <p className="text-sm font-black text-slate-950">Use an existing item image</p>
              {!form.selectedItemId && <p className="mt-1 text-xs font-bold text-slate-500">Select an item image to preview your ad.</p>}
              {itemImageOptions.length ? (
                <div className="mt-3 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {itemImageOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateForm({ selectedItemId: item.id })}
                      className={cx("flex h-full min-h-[252px] flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", form.selectedItemId === item.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300")}
                    >
                      <div className="grid aspect-[4/3] w-full place-items-center bg-slate-100 p-3">
                        <img src={itemImage(item)} alt="" className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <p className="line-clamp-2 text-sm font-black leading-5 text-slate-950">{itemDisplayName(item)}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{item.category || "Inventory item"}</p>
                        {itemPriceLine(item) && <p className="mt-auto pt-3 text-sm font-black text-blue-700">{itemPriceLine(item)}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500">
                  No inventory item images are available yet.
                </div>
              )}
            </div>
          )}
        </Card>
        <AdPreview form={form} creativeImage={creativeImage} creativeVideo={creativeVideo} selectedItem={selectedItem} captionTouched={touched.caption} />
      </div>
    );
  }

  // Renders audience step.
  function renderAudienceStep() {
    return (
      <Card className="p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <FieldLabel>Gender</FieldLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {genderOptions.map((option) => (
                <button key={option} type="button" onClick={() => updateFormField("gender", option)} className={cx("h-10 rounded-full border px-5 text-sm font-black", form.gender === option ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Minimum Age</FieldLabel>
              <TextInput type="number" min="13" max="100" value={form.minAge} onChange={(event) => updateFormField("minAge", event.target.value)} />
            </div>
            <div>
              <FieldLabel>Maximum Age</FieldLabel>
              <TextInput type="number" min="13" max="100" value={form.maxAge} onChange={(event) => updateFormField("maxAge", event.target.value)} />
            </div>
          </div>
          <div className="lg:col-span-2">
            <FieldLabel>Location Targeting</FieldLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => updateFormField("locationMode", "target-area")} className={cx("h-10 rounded-full border px-5 text-sm font-black", form.locationMode === "target-area" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                Target Area
              </button>
              <button type="button" onClick={() => updateFormField("locationMode", "pan-india")} className={cx("h-10 rounded-full border px-5 text-sm font-black", form.locationMode === "pan-india" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                Pan India
              </button>
            </div>
            {form.locationMode === "target-area" && (
              <div className="mt-3">
                <div className="flex gap-2">
                  <TextInput
                    value={locationInput}
                    onChange={(event) => setLocationInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addLocation();
                      }
                    }}
                    placeholder="Add city or area"
                  />
                  <Button onClick={addLocation} className="shrink-0 bg-slate-950 text-white">
                    <FiPlus />
                    Add
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.locations.map((location) => (
                    <span key={location} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                      <FiMapPin />
                      {location}
                      <button type="button" onClick={() => removeLocation(location)} className="text-slate-400 hover:text-rose-600">
                        <FiX />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="lg:col-span-2">
            <FieldLabel>Audience Interests</FieldLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {interestSuggestions.map((interest) => (
                <button key={interest} type="button" onClick={() => toggleInterest(interest)} className={cx("h-9 rounded-full border px-4 text-xs font-black", form.interests.includes(interest) ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {interest}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <TextInput
                value={form.interestInput}
                onChange={(event) => updateFormField("interestInput", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomInterest();
                  }
                }}
                placeholder="Add custom interest"
              />
              <Button onClick={addCustomInterest} className="shrink-0 bg-slate-950 text-white">
                Add
              </Button>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">Prototype interests only. These are not validated Meta targeting interests yet.</p>
          </div>
        </div>
      </Card>
    );
  }

  // Renders budget step.
  function renderBudgetStep() {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Daily Budget</FieldLabel>
              <TextInput type="number" min="1" value={form.dailyBudget} onChange={(event) => updateFormField("dailyBudget", event.target.value)} />
            </div>
            <div>
              <FieldLabel>Duration Days</FieldLabel>
              <TextInput type="number" min="1" value={form.durationDays} onChange={(event) => updateFormField("durationDays", event.target.value)} />
            </div>
            <div>
              <FieldLabel>Start Date</FieldLabel>
              <TextInput type="date" value={form.startDate} onChange={(event) => updateFormField("startDate", event.target.value)} />
            </div>
            <div>
              <FieldLabel>End Date</FieldLabel>
              <TextInput value={endDate} readOnly className="bg-slate-50 text-slate-500" />
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Schedule</FieldLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => updateFormField("scheduleMode", "all-day")} className={cx("h-10 rounded-full border px-5 text-sm font-black", form.scheduleMode === "all-day" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  Run all day
                </button>
                <button type="button" onClick={() => updateFormField("scheduleMode", "custom")} className={cx("h-10 rounded-full border px-5 text-sm font-black", form.scheduleMode === "custom" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  Custom Time
                </button>
              </div>
            </div>
            {form.scheduleMode === "custom" && (
              <>
                <div>
                  <FieldLabel>Start Time</FieldLabel>
                  <TextInput type="time" value={form.startTime} onChange={(event) => updateFormField("startTime", event.target.value)} />
                </div>
                <div>
                  <FieldLabel>End Time</FieldLabel>
                  <TextInput type="time" value={form.endTime} onChange={(event) => updateFormField("endTime", event.target.value)} />
                </div>
              </>
            )}
          </div>
        </Card>
        <Card className="p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Estimated Ad Budget</p>
          <p className="mt-3 text-3xl font-black text-slate-950">{formatCurrency(estimatedBudget)}</p>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            {formatCurrency(form.dailyBudget)} / day × {Number(form.durationDays) || 0} days
          </p>
          <div className="mt-5 rounded-lg bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
            Ads are created paused for safe testing. No ad spend starts from this screen.
          </div>
        </Card>
      </div>
    );
  }

  // Renders review step.
  function renderReviewStep() {
    const creativeSourceLabel = form.mediaType === "video" ? "Uploaded Video" : form.creativeSource === "marketing-studio" ? "Marketing Studio" : form.creativeSource === "item-image" ? "Item Image" : "Uploaded Creative";

    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <AdPreview form={form} creativeImage={creativeImage} creativeVideo={creativeVideo} selectedItem={selectedItem} captionTouched={touched.caption} />
        <Card className="p-5 shadow-sm">
          <p className="text-sm font-black text-slate-950">Campaign Summary</p>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ["Campaign", form.campaignName || "Untitled Campaign"],
              ["Goal", objectiveLabel(form.goal)],
              ["Creative Type", form.mediaType === "video" ? "Video" : "Image"],
              ["Creative Source", creativeSourceLabel],
              ["CTA", form.cta],
              ["Gender", form.gender],
              ["Age", `${form.minAge} - ${form.maxAge}`],
              ["Locations", form.locationMode === "pan-india" ? "Pan India" : form.locations.join(", ")],
              ["Interests", form.interests.length ? form.interests.join(", ") : "Not selected"],
              ["Daily Budget", formatCurrency(form.dailyBudget)],
              ["Duration", `${form.durationDays} days (${formatDate(form.startDate)} - ${formatDate(endDate)})`],
              ["Estimated Budget", formatCurrency(estimatedBudget)],
              ["Schedule", form.scheduleMode === "all-day" ? "Run all day" : `${form.startTime} - ${form.endTime}`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-500">{label}</span>
                <span className="max-w-[190px] text-right font-black text-slate-900">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg bg-blue-50 p-3 text-xs font-bold leading-5 text-blue-700">
            Publishing creates real Meta objects in paused state using the selected Facebook Page and Ad Account.
          </div>
        </Card>
      </div>
    );
  }

  // Renders step content.
  function renderStepContent() {
    if (step === 0) return renderAdDetailsStep();
    if (step === 1) return renderCreativeStep();
    if (step === 2) return renderAudienceStep();
    if (step === 3) return renderBudgetStep();
    return renderReviewStep();
  }

  if (view === "builder") {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <button type="button" onClick={() => setView("dashboard")} className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-slate-900">
                <FiChevronLeft />
                Back to Smart Ads
              </button>
              <h1 className="mt-3 text-2xl font-black text-slate-950">Create Ad Campaign</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">Build a campaign draft that can later connect to Meta APIs.</p>
            </div>
            <Button onClick={() => saveCampaign("draft")} className="border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50">
              <FiSave />
              Save Draft
            </Button>
          </div>

          <Stepper step={step} />

          {error && <div className="whitespace-pre-line rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">{error}</div>}

          {renderStepContent()}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={() => (step === 0 ? setView("dashboard") : setStep((current) => current - 1))} className="border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50">
              <FiChevronLeft />
              Back
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => saveCampaign("draft")} className="border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50">
                <FiSave />
                Save Draft
              </Button>
              {step < stepLabels.length - 1 ? (
                <Button onClick={goNext} className="bg-slate-950 text-white shadow-sm hover:bg-slate-800">
                  Next
                  <FiChevronRight />
                </Button>
              ) : (
                <Button onClick={publishCampaignToMeta} disabled={publishing} className="bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300">
                  <FiCheck />
                  {publishing ? "Publishing..." : "Create Campaign"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black text-emerald-600">Business Growth</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">Smart Ads</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Create and manage promotional campaigns for your business.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={startNewCampaign} className="bg-blue-600 text-white shadow-sm hover:bg-blue-700">
              <FiPlus />
              Create Ad
            </Button>
          </div>
        </header>

        {toast && <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{toast}</div>}

        <MetaInsights status={metaStatus} connectionError={metaError} campaignCount={campaigns.length} onRefresh={refreshMetaConnection} />

        <section className="grid gap-5 lg:grid-cols-[1fr_330px]">
          <Card className="p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Campaigns</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Campaigns are saved to your business database.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {statusFilters.map((item) => (
                  <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={cx("h-9 rounded-full border px-4 text-xs font-black", filter === item.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {campaignsLoadError && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                <span>Campaigns could not be loaded: {campaignsLoadError}</span>
                <Button onClick={reloadCampaigns} disabled={campaignsLoading} className="border border-rose-200 bg-white px-3 text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                  <FiRefreshCw />
                  {campaignsLoading ? "Loading..." : "Retry"}
                </Button>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {campaignsLoading && !campaigns.length ? (
                <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                  Loading campaigns from your business database...
                </div>
              ) : filteredCampaigns.length ? (
                filteredCampaigns.map((campaign) => (
                  <article key={campaign.id} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[96px_1fr_auto]">
                    <div className="grid h-24 place-items-center overflow-hidden rounded-lg bg-slate-100">
                      {campaign.creative.mediaType === "video" ? (
                        <div className="text-center text-slate-400">
                          <FiVideo className="mx-auto text-2xl" />
                          <span className="mt-1 block text-[10px] font-black uppercase">Video</span>
                        </div>
                      ) : campaign.creative.uploadDataUrl || campaign.creative.imageUrl ? (
                        <img src={campaign.creative.uploadDataUrl || campaign.creative.imageUrl} alt="" className="h-full w-full object-contain" />
                      ) : campaign.creative.templateId ? (
                        <img src={marketingTemplates.find((template) => template.id === campaign.creative.templateId)?.thumbnail} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <FiImage className="text-2xl text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-slate-950">{campaign.name}</h3>
                        <StatusBadge status={campaign.status} />
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{campaign.creative.mediaType === "video" ? "Video" : "Image"}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{campaign.ad.headline || objectiveLabel(campaign.objective)}</p>
                      <div className="mt-3 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
                        <span>Goal: {objectiveLabel(campaign.objective)}</span>
                        <span>Location: {campaign.audience.panIndia ? "Pan India" : campaign.audience.locations.join(", ") || "Not set"}</span>
                        <span>Budget: {formatCurrency(campaign.budget.dailyBudget)} / day</span>
                        <span>Duration: {campaign.budget.durationDays} days</span>
                        <span>Created: {formatDate(campaign.createdAt?.slice(0, 10))}</span>
                        {campaign.meta?.campaignId && <span>Meta Campaign: {campaign.meta.campaignId}</span>}
                        {campaign.meta?.videoId && <span>Meta Video: {campaign.meta.videoId}</span>}
                        {campaign.meta?.publishStatus && <span>Meta Status: {campaign.meta.publishStatus}</span>}
                      </div>
                      {campaign.meta?.lastError && <p className="mt-3 text-xs font-bold text-rose-600">{campaign.meta.lastError}</p>}
                    </div>
                    <div className="flex items-center gap-2 lg:flex-col lg:items-end">
                      <Button onClick={() => editCampaign(campaign)} className="border border-slate-200 bg-white px-4 text-slate-700 shadow-sm hover:bg-slate-50">
                        <FiEdit2 />
                        Edit
                      </Button>
                    </div>
                  </article>
                ))
              ) : campaignsLoadError ? null : (
                <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <div>
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600">
                      <FiTarget />
                    </span>
                    <h3 className="mt-4 text-lg font-black text-slate-950">No campaigns yet</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Create a draft campaign to plan ads before Meta integration is connected.</p>
                    <Button onClick={startNewCampaign} className="mt-5 bg-blue-600 text-white shadow-sm hover:bg-blue-700">
                      <FiPlus />
                      Create Ad
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div id="smart-ads-meta-connection" className="space-y-5 scroll-mt-4">
            <MetaConnectionCard
              status={metaStatus}
              assets={metaAssets}
              selection={metaSelection}
              loading={metaLoading || metaStatus.loading}
              error={metaError}
              onConnect={handleConnectMeta}
              onReconnect={handleReconnectMeta}
              onRefresh={refreshMetaConnection}
              onDisconnect={handleDisconnectMeta}
              onSelectionChange={handleMetaSelectionChange}
              onSaveSelection={handleSaveMetaSelection}
            />

            <Card className="p-5 shadow-sm">
              <p className="text-sm font-black text-slate-950">Phase 1 Boundaries</p>
              <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-600">
                <li>- Uses shared inventory items for product campaigns.</li>
                <li>- Reuses Marketing Studio templates and session designs.</li>
                <li>- Stores campaigns as frontend prototype data.</li>
                <li>- Insights cover all ads in the selected Meta Ad Account.</li>
              </ul>
            </Card>
          </div>
        </section>
      </div>

    </div>
  );
}

export default SmartAds;
