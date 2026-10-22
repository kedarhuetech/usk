import { Buffer } from "node:buffer";
import { getMetaOAuthConfig } from "../config/metaOAuth.js";
import { buildMetaReadiness } from "./metaConnectionStore.js";
import { graphGet, graphPost, normalizeMetaError } from "./metaOAuthService.js";

const SAFE_STATUS = "PAUSED";
const MIN_START_BUFFER_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const SUPPORTED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);
const VIDEO_PROCESSING_ATTEMPTS = 6;
const VIDEO_PROCESSING_DELAY_MS = 3000;
const ZERO_DECIMAL_CURRENCIES = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

function createPublishError(message, code = "META_PUBLISH_ERROR", publishResult = null) {
  const error = new Error(message);
  error.code = code;
  if (publishResult) error.publishResult = publishResult;
  return error;
}

function safeMetaError(error, fallback, step = "") {
  const normalized = normalizeMetaError(error, fallback);
  const classified = classifyMetaPublishError(normalized);
  return {
    step,
    message: classified?.message || normalized.message,
    originalMessage: classified ? normalized.message : "",
    type: normalized.type,
    code: normalized.code,
    subcode: normalized.subcode,
    userTitle: classified?.title || normalized.userTitle,
    userMessage: classified?.description || normalized.userMessage,
    category: classified?.category || "",
    fbtraceId: normalized.fbtraceId,
    httpStatus: normalized.httpStatus,
  };
}

function classifyMetaPublishError(error = {}) {
  const code = String(error.code || "");
  const subcode = String(error.subcode || "");
  const text = [error.type, error.userTitle, error.userMessage, error.message].filter(Boolean).join(" ").toLowerCase();

  if (code === "100" && subcode === "1359188") {
    return {
      category: "billing",
      title: "Payment method required",
      message: "Payment method required",
      description: "Add a valid payment method to the selected Meta Ad Account before the ad can run.",
    };
  }

  if (code === "190") {
    return {
      category: "token",
      title: "Reconnect Meta",
      message: "Meta connection expired or was revoked.",
      description: "Reconnect Meta, grant the requested permissions, then try publishing again.",
    };
  }

  const permissionCodes = new Set(["10", "200", "294", "299"]);
  const permissionText = /\b(permission|permissions|access|authorized|authorised|authorization|insufficient|advertise|admin|role|revoked)\b/.test(text);

  if (permissionCodes.has(code) || permissionText) {
    return {
      category: "permission",
      title: "Advertising access required",
      message: "You don't have permission to advertise with this Facebook Page or Ad Account.",
      description: "Ask the business admin to give your Facebook account the required advertising access, then reconnect Meta.",
    };
  }

  return null;
}

function adAccountPath(adAccountId = "") {
  const id = String(adAccountId || "").trim();
  if (!id) throw createPublishError("Select a real Meta Ad Account before publishing.", "META_AD_ACCOUNT_REQUIRED");
  return id.startsWith("act_") ? id : `act_${id}`;
}

function asPositiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw createPublishError(`${label} must be greater than zero.`, "META_VALIDATION_ERROR");
  return parsed;
}

function dailyBudgetToMinorUnits(value, currency = "INR") {
  const amount = asPositiveNumber(value, "Daily budget");
  return Math.max(1, Math.round(amount * (ZERO_DECIMAL_CURRENCIES.has(String(currency).toUpperCase()) ? 1 : 100)));
}

function parseDateTimeUtc(dateValue = "", timeValue = "00:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))) return null;
  const safeTime = /^\d{2}:\d{2}$/.test(String(timeValue)) ? timeValue : "00:00";
  const parsed = new Date(`${dateValue}T${safeTime}:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function metaTimestamp(date) {
  return date.toISOString().replace(".000Z", "+0000");
}

function buildMetaSchedule(campaign = {}, now = new Date()) {
  const durationDays = Math.max(Math.ceil(Number(campaign.budget?.durationDays) || 1), 1);
  const scheduleMode = campaign.schedule?.mode || "all-day";
  const requestedStart = parseDateTimeUtc(
    campaign.budget?.startDate,
    scheduleMode === "custom" ? campaign.schedule?.startTime : "00:00",
  );

  if (!requestedStart) {
    throw createPublishError("Campaign start date is required before publishing.", "META_DATE_REQUIRED");
  }

  const minimumStart = new Date(now.getTime() + MIN_START_BUFFER_MS);
  const start = requestedStart.getTime() > minimumStart.getTime() ? requestedStart : minimumStart;
  const end = new Date(start.getTime() + durationDays * DAY_MS);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime() || end.getTime() <= now.getTime()) {
    throw createPublishError("Campaign end date must be later than the start date and in the future.", "META_DATE_INVALID");
  }

  return {
    startTime: metaTimestamp(start),
    endTime: metaTimestamp(end),
  };
}

function normalizeUrl(value = "") {
  const url = String(value || "").trim();
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (parsed.hostname.replace(/^www\./, "") === "yourbusiness.com") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function metaObjective(goal) {
  if (goal === "reach") return "OUTCOME_AWARENESS";
  return "OUTCOME_TRAFFIC";
}

function metaOptimizationGoal(goal) {
  if (goal === "reach") return "REACH";
  return "LINK_CLICKS";
}

function metaCtaType(cta = "") {
  const normalized = String(cta).toLowerCase();
  if (normalized.includes("shop")) return "SHOP_NOW";
  if (normalized.includes("learn")) return "LEARN_MORE";
  return "CONTACT_US";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function safeFileName(value = "") {
  const name = String(value || "smart-ads-video.mp4").replace(/[^a-z0-9._-]/gi, "_");
  return name || "smart-ads-video.mp4";
}

function cleanMetaId(value = "") {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_]+$/.test(id) ? id : "";
}

function validHttpUrl(value = "") {
  try {
    const parsed = new URL(String(value || ""));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function safeUrlHost(value = "") {
  try {
    return new URL(String(value || "")).host;
  } catch {
    return "";
  }
}

function logVideoCreativeDiagnostics({ videoId, thumbnailSource, thumbnailUrl, thumbnailFound, objectStorySpec }) {
  const videoDataKeys = Object.keys(objectStorySpec.video_data || {});
  console.info("Meta video creative diagnostics", {
    videoId,
    thumbnailSource: thumbnailSource || "none",
    thumbnailFound: Boolean(thumbnailFound),
    thumbnailHost: safeUrlHost(thumbnailUrl),
    objectStorySpecKeys: Object.keys(objectStorySpec),
    videoDataKeys,
  });
}

function inferVideoMimeType(creative = {}, dataMimeType = "") {
  const explicitType = String(creative.videoMimeType || dataMimeType || "").toLowerCase();
  if (explicitType) return explicitType;
  const name = String(creative.videoName || "").toLowerCase();
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".m4v")) return "video/x-m4v";
  if (name.endsWith(".mp4")) return "video/mp4";
  return "";
}

async function graphPostMultipart(path, accessToken, params = {}, files = []) {
  const config = getMetaOAuthConfig();
  const url = new URL(path.startsWith("http") ? path : `${config.graphBaseUrl}${path}`);
  const body = new FormData();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  body.set("access_token", accessToken);

  files.forEach((file) => {
    body.set(file.fieldName, new Blob([file.buffer], { type: file.contentType }), file.filename);
  });

  const response = await fetch(url, {
    method: "POST",
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const normalized = normalizeMetaError({ ...payload, httpStatus: response.status }, "Meta Graph API request failed");
    const error = new Error(normalized.message);
    error.code = normalized.code;
    error.subcode = normalized.subcode;
    error.type = normalized.type;
    error.userTitle = normalized.userTitle;
    error.userMessage = normalized.userMessage;
    error.fbtraceId = normalized.fbtraceId;
    error.httpStatus = normalized.httpStatus;
    throw error;
  }
  return payload;
}

function genderTargeting(gender = "All") {
  if (gender === "Male") return [1];
  if (gender === "Female") return [2];
  return undefined;
}

async function resolveGeoLocations(accessToken, campaign = {}) {
  if (campaign.audience?.panIndia) return { countries: ["IN"] };

  const locations = Array.isArray(campaign.audience?.locations) ? campaign.audience.locations.filter(Boolean) : [];
  if (!locations.length) {
    throw createPublishError("Add at least one target location or select Pan India before publishing.", "META_LOCATION_REQUIRED");
  }

  const matches = await Promise.all(
    locations.map(async (location) => {
      const payload = await graphGet("/search", accessToken, {
        type: "adgeolocation",
        location_types: JSON.stringify(["city", "region"]),
        q: location,
        country_code: "IN",
        limit: 5,
      });
      return (payload.data || [])[0] || null;
    }),
  );

  const cities = [];
  const regions = [];
  matches.forEach((match) => {
    if (!match?.key) return;
    if (match.type === "region") regions.push({ key: match.key });
    else cities.push({ key: match.key });
  });

  if (!cities.length && !regions.length) {
    throw createPublishError("Meta could not match the selected target location. Use Pan India or a valid city/region.", "META_LOCATION_NOT_FOUND");
  }

  return {
    ...(cities.length ? { cities } : {}),
    ...(regions.length ? { regions } : {}),
  };
}

function imageFromDataUrl(dataUrl = "") {
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  if (!match) {
    throw createPublishError("A publishable PNG, JPG, or WEBP creative image is required.", "META_CREATIVE_IMAGE_REQUIRED");
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  };
}

function videoFromDataUrl(creative = {}) {
  const dataUrl = String(creative.videoDataUrl || "");
  const match = dataUrl.match(/^data:([^;,]*);base64,(.+)$/i);
  if (!match) {
    throw createPublishError("A publishable MP4 or MOV video file is required.", "META_CREATIVE_VIDEO_REQUIRED");
  }

  const mimeType = inferVideoMimeType(creative, match[1]);
  if (!SUPPORTED_VIDEO_TYPES.has(mimeType)) {
    throw createPublishError("Use an MP4 or MOV video for Meta publishing.", "META_CREATIVE_VIDEO_TYPE");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw createPublishError("The selected video file is empty.", "META_CREATIVE_VIDEO_EMPTY");
  if (buffer.length > MAX_VIDEO_BYTES) throw createPublishError("Video must be 20 MB or smaller for this upload flow.", "META_CREATIVE_VIDEO_TOO_LARGE");

  return {
    buffer,
    mimeType,
    filename: safeFileName(creative.videoName || (mimeType === "video/quicktime" ? "smart-ads-video.mov" : "smart-ads-video.mp4")),
  };
}

async function uploadAdImageBuffer(accessToken, adAccountId, buffer) {
  const accountPath = adAccountPath(adAccountId);
  const payload = await graphPost(`/${accountPath}/adimages`, accessToken, {
    bytes: buffer.toString("base64"),
  });

  const imageRecord = Object.values(payload.images || {})[0];
  if (!imageRecord?.hash) throw createPublishError("Meta image upload succeeded but did not return an image hash.", "META_IMAGE_HASH_MISSING");
  return imageRecord.hash;
}

async function uploadAdImage(accessToken, adAccountId, creative = {}) {
  const { buffer } = imageFromDataUrl(creative.imageDataUrl);
  return uploadAdImageBuffer(accessToken, adAccountId, buffer);
}

async function uploadAdVideo(accessToken, adAccountId, videoFile) {
  const accountPath = adAccountPath(adAccountId);
  const payload = await graphPostMultipart(
    `/${accountPath}/advideos`,
    accessToken,
    {
      title: videoFile.filename,
    },
    [
      {
        fieldName: "source",
        buffer: videoFile.buffer,
        filename: videoFile.filename,
        contentType: videoFile.mimeType,
      },
    ],
  );

  if (!payload.id) throw createPublishError("Meta video upload succeeded but did not return a video ID.", "META_VIDEO_ID_MISSING");
  return payload.id;
}

function videoStatusValue(statusPayload = {}) {
  const status = statusPayload.status || {};
  return [
    status.video_status,
    status.processing_phase?.status,
    status.uploading_phase?.status,
    status.publishing_phase?.status,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function isVideoReady(statusPayload = {}) {
  const values = videoStatusValue(statusPayload);
  return values.includes("ready") || values.includes("complete") || Number(statusPayload.status?.processing_progress) >= 100;
}

function isVideoFailed(statusPayload = {}) {
  const values = videoStatusValue(statusPayload);
  return values.includes("error") || values.includes("failed") || Boolean(statusPayload.status?.error);
}

async function waitForVideoReady(accessToken, videoId) {
  for (let attempt = 0; attempt < VIDEO_PROCESSING_ATTEMPTS; attempt += 1) {
    const statusPayload = await graphGet(`/${videoId}`, accessToken, { fields: "status" });
    if (isVideoReady(statusPayload)) return statusPayload;
    if (isVideoFailed(statusPayload)) throw createPublishError("Meta video processing failed. Use another MP4 or MOV video and try again.", "META_VIDEO_PROCESSING_FAILED");
    if (attempt < VIDEO_PROCESSING_ATTEMPTS - 1) await delay(VIDEO_PROCESSING_DELAY_MS);
  }

  throw createPublishError("Meta video is still processing. The partial publish record includes the video ID; wait a moment before trying again.", "META_VIDEO_PROCESSING");
}

async function getVideoThumbnailReference(accessToken, videoId) {
  const videoPayload = await graphGet(`/${videoId}`, accessToken, {
    fields: "picture",
  });
  const pictureUrl = validHttpUrl(videoPayload.picture);
  if (pictureUrl) {
    console.info("Meta video thumbnail lookup", {
      videoId,
      thumbnailSource: "picture",
      thumbnailFound: true,
      thumbnailHost: safeUrlHost(pictureUrl),
    });
    return { source: "picture", url: pictureUrl };
  }

  const payload = await graphGet(`/${videoId}/thumbnails`, accessToken, {
    fields: "uri,is_preferred",
    limit: 10,
  });
  const thumbnails = Array.isArray(payload.data) ? payload.data : [];
  const thumbnailUrl = validHttpUrl(thumbnails.find((thumbnail) => thumbnail.is_preferred)?.uri) || validHttpUrl(thumbnails[0]?.uri);
  console.info("Meta video thumbnail lookup", {
    videoId,
    thumbnailSource: "thumbnails",
    thumbnailFound: Boolean(thumbnailUrl),
    thumbnailHost: safeUrlHost(thumbnailUrl),
    thumbnailCount: thumbnails.length,
  });
  return thumbnailUrl ? { source: "thumbnails", url: thumbnailUrl } : null;
}

async function getRequiredVideoThumbnailReference(accessToken, videoId) {
  const thumbnail = await getVideoThumbnailReference(accessToken, videoId);
  if (!thumbnail?.url) {
    console.info("Meta video thumbnail lookup", {
      videoId,
      thumbnailSource: "none",
      thumbnailFound: false,
      thumbnailHost: "",
    });
    throw createPublishError("Meta video uploaded successfully but a valid thumbnail could not be obtained.", "META_VIDEO_THUMBNAIL_REQUIRED");
  }
  return thumbnail;
}

async function downloadVideoThumbnail(thumbnailUrl) {
  const response = await fetch(thumbnailUrl);
  if (!response.ok) {
    throw createPublishError("Meta video uploaded successfully but the thumbnail image could not be downloaded.", "META_VIDEO_THUMBNAIL_DOWNLOAD_FAILED");
  }

  const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw createPublishError("Meta video uploaded successfully but the thumbnail response was not an image.", "META_VIDEO_THUMBNAIL_INVALID");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw createPublishError("Meta video uploaded successfully but the thumbnail image was empty.", "META_VIDEO_THUMBNAIL_EMPTY");
  }

  return { buffer, contentType };
}

async function uploadVideoThumbnailImage({ accessToken, adAccountId, thumbnail }) {
  if (!thumbnail?.url) {
    throw createPublishError("Meta video uploaded successfully but a valid thumbnail could not be obtained.", "META_VIDEO_THUMBNAIL_REQUIRED");
  }

  const image = await downloadVideoThumbnail(thumbnail.url);
  const hash = await uploadAdImageBuffer(accessToken, adAccountId, image.buffer);
  return {
    hash,
    source: thumbnail.source,
    url: thumbnail.url,
  };
}

function buildTargeting({ campaign, geoLocations }) {
  const minAge = Math.max(Number(campaign.audience?.minAge) || 18, 13);
  const maxAge = Math.min(Number(campaign.audience?.maxAge) || 65, 65);
  if (minAge >= maxAge) throw createPublishError("Minimum age must be less than maximum age.", "META_AGE_INVALID");

  return {
    age_min: minAge,
    age_max: maxAge,
    geo_locations: geoLocations,
    ...(genderTargeting(campaign.audience?.gender) ? { genders: genderTargeting(campaign.audience?.gender) } : {}),
  };
}

async function createCampaign({ accessToken, adAccountId, campaign }) {
  return graphPost(`/${adAccountPath(adAccountId)}/campaigns`, accessToken, {
    name: campaign.name,
    objective: metaObjective(campaign.objective),
    is_adset_budget_sharing_enabled: false,
    status: SAFE_STATUS,
    special_ad_categories: [],
  });
}

async function createAdSet({ adAccountId, accessToken, campaign, metaCampaignId, adAccount, geoLocations, schedule }) {
  const targeting = buildTargeting({ campaign, geoLocations });

  return graphPost(`/${adAccountPath(adAccountId)}/adsets`, accessToken, {
    name: `${campaign.name} Ad Set`,
    campaign_id: metaCampaignId,
    daily_budget: dailyBudgetToMinorUnits(campaign.budget?.dailyBudget, adAccount?.currency),
    billing_event: "IMPRESSIONS",
    optimization_goal: metaOptimizationGoal(campaign.objective),
    ...(campaign.objective === "reach" ? {} : { destination_type: "WEBSITE" }),
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    status: SAFE_STATUS,
  });
}

async function createImageAdCreative({ accessToken, adAccountId, campaign, pageId, instagramAccountId, imageHash, link }) {
  const objectStorySpec = {
    page_id: pageId,
    ...(instagramAccountId ? { instagram_actor_id: instagramAccountId } : {}),
    link_data: {
      image_hash: imageHash,
      link,
      name: campaign.ad?.headline || campaign.name,
      message: campaign.ad?.caption || campaign.ad?.headline || campaign.name,
      call_to_action: {
        type: metaCtaType(campaign.ad?.cta),
        value: { link },
      },
    },
  };

  return graphPost(`/${adAccountPath(adAccountId)}/adcreatives`, accessToken, {
    name: `${campaign.name} Creative`,
    object_story_spec: objectStorySpec,
  });
}

async function createVideoAdCreative({ accessToken, adAccountId, campaign, pageId, instagramAccountId, videoId, thumbnailImageHash, thumbnailSource, thumbnailUrl, link }) {
  if (!thumbnailImageHash) {
    throw createPublishError("Meta video creative requires a thumbnail image hash.", "META_VIDEO_THUMBNAIL_REQUIRED");
  }

  const objectStorySpec = {
    page_id: pageId,
    ...(instagramAccountId ? { instagram_actor_id: instagramAccountId } : {}),
    video_data: {
      video_id: videoId,
      image_hash: thumbnailImageHash,
      title: campaign.ad?.headline || campaign.name,
      message: campaign.ad?.caption || campaign.ad?.headline || campaign.name,
      call_to_action: {
        type: metaCtaType(campaign.ad?.cta),
        value: { link },
      },
    },
  };

  logVideoCreativeDiagnostics({
    videoId,
    thumbnailSource,
    thumbnailUrl,
    thumbnailFound: Boolean(thumbnailImageHash),
    objectStorySpec,
  });

  return graphPost(`/${adAccountPath(adAccountId)}/adcreatives`, accessToken, {
    name: `${campaign.name} Video Creative`,
    object_story_spec: objectStorySpec,
  });
}

async function createAd({ accessToken, adAccountId, campaign, metaAdSetId, metaCreativeId }) {
  return graphPost(`/${adAccountPath(adAccountId)}/ads`, accessToken, {
    name: `${campaign.name} Ad`,
    adset_id: metaAdSetId,
    creative: { creative_id: metaCreativeId },
    status: SAFE_STATUS,
  });
}

async function runPublishStep(result, step, action) {
  try {
    const payload = await action();
    result.steps.push({ step, status: "success", id: payload.id || payload.hash || "" });
    return payload;
  } catch (error) {
    const normalized = error.metaError || safeMetaError(error, `${step} failed`, step);
    result.failedStep = step;
    result.error = normalized;
    result.steps.push({ ...normalized, step, status: "failed" });
    throw createPublishError(normalized.message, normalized.code, result);
  }
}

export async function publishMetaAdCampaign({ accessToken, connection, campaign }) {
  const selection = connection.selection || {};
  const assets = connection.assets || {};
  const selectedAdAccount = (assets.adAccounts || []).find((account) => account.id === selection.adAccountId);
  const selectedPage = (assets.pages || []).find((page) => page.id === selection.pageId);
  const destinationUrl = normalizeUrl(campaign.ad?.website);
  const mediaType = campaign.creative?.mediaType === "video" ? "video" : "image";
  const existingVideoId = mediaType === "video" ? cleanMetaId(campaign.creative?.existingVideoId || campaign.meta?.videoId) : "";
  let videoFile = null;
  const result = {
    status: "failed",
    safeStatus: SAFE_STATUS,
    ids: {
      metaCampaignId: null,
      metaAdSetId: null,
      metaImageHash: null,
      metaVideoId: null,
      metaVideoThumbnailImageHash: null,
      metaCreativeId: null,
      metaAdId: null,
    },
    steps: [],
    warnings: [],
  };

  if (!accessToken) throw createPublishError("Meta is not connected. Reconnect before publishing.", "META_NOT_CONNECTED");
  const readiness = buildMetaReadiness(connection);
  if (!readiness.readyToPublish) {
    throw createPublishError(readiness.blockingReason || "Complete Meta setup before publishing Smart Ads.", readiness.blockingCode || "META_SETUP_REQUIRED");
  }
  if (!selectedPage?.id) throw createPublishError("Select a real Facebook Page before publishing.", "META_PAGE_REQUIRED");
  if (!selectedAdAccount?.id) throw createPublishError("Select a real Meta Ad Account before publishing.", "META_AD_ACCOUNT_REQUIRED");
  if (!destinationUrl) throw createPublishError("Enter a real public HTTP/HTTPS website URL before publishing. WhatsApp destination publishing is not enabled yet.", "META_DESTINATION_REQUIRED");
  if (mediaType === "video" && !existingVideoId) videoFile = videoFromDataUrl(campaign.creative);
  if (campaign.audience?.interests?.length) {
    result.warnings.push("Custom interest names were not sent to Meta because targeting IDs are required.");
  }

  const geoLocations = await resolveGeoLocations(accessToken, campaign);
  const schedule = buildMetaSchedule(campaign);

  const metaCampaign = await runPublishStep(result, "campaign", () =>
    createCampaign({ accessToken, adAccountId: selectedAdAccount.id, campaign }),
  );
  result.ids.metaCampaignId = metaCampaign.id;

  const metaAdSet = await runPublishStep(result, "adSet", () =>
    createAdSet({ accessToken, adAccountId: selectedAdAccount.id, campaign, metaCampaignId: metaCampaign.id, adAccount: selectedAdAccount, geoLocations, schedule }),
  );
  result.ids.metaAdSetId = metaAdSet.id;

  let metaCreative;

  if (mediaType === "video") {
    const metaVideo = existingVideoId
      ? await runPublishStep(result, "video_reuse", async () => ({ id: existingVideoId }))
      : await runPublishStep(result, "video_upload", async () => {
          const id = await uploadAdVideo(accessToken, selectedAdAccount.id, videoFile);
          return { id };
        });
    result.ids.metaVideoId = metaVideo.id;

    await runPublishStep(result, "video_processing", () => waitForVideoReady(accessToken, metaVideo.id));
    const thumbnail = await runPublishStep(result, "video_thumbnail", () => getRequiredVideoThumbnailReference(accessToken, metaVideo.id));
    const thumbnailImage = await runPublishStep(result, "video_thumbnail_upload", () =>
      uploadVideoThumbnailImage({
        accessToken,
        adAccountId: selectedAdAccount.id,
        thumbnail,
      }),
    );
    result.ids.metaVideoThumbnailImageHash = thumbnailImage.hash;

    metaCreative = await runPublishStep(result, "creative", () =>
      createVideoAdCreative({
        accessToken,
        adAccountId: selectedAdAccount.id,
        campaign,
        pageId: selectedPage.id,
        instagramAccountId: selection.instagramAccountId,
        videoId: metaVideo.id,
        thumbnailImageHash: thumbnailImage.hash,
        thumbnailSource: thumbnailImage.source,
        thumbnailUrl: thumbnailImage.url,
        link: destinationUrl,
      }),
    );
  } else {
    const imageHash = await runPublishStep(result, "imageUpload", async () => {
      const hash = await uploadAdImage(accessToken, selectedAdAccount.id, campaign.creative);
      return { hash };
    });
    result.ids.metaImageHash = imageHash.hash;

    metaCreative = await runPublishStep(result, "creative", () =>
      createImageAdCreative({
        accessToken,
        adAccountId: selectedAdAccount.id,
        campaign,
        pageId: selectedPage.id,
        instagramAccountId: selection.instagramAccountId,
        imageHash: imageHash.hash,
        link: destinationUrl,
      }),
    );
  }
  result.ids.metaCreativeId = metaCreative.id;

  const metaAd = await runPublishStep(result, "ad", () =>
    createAd({ accessToken, adAccountId: selectedAdAccount.id, campaign, metaAdSetId: metaAdSet.id, metaCreativeId: metaCreative.id }),
  );
  result.ids.metaAdId = metaAd.id;
  result.status = "published";

  return result;
}
