import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Blur } from "konva/lib/filters/Blur";
import { Brightness } from "konva/lib/filters/Brightness";
import { Contrast } from "konva/lib/filters/Contrast";
import { Grayscale } from "konva/lib/filters/Grayscale";
import { HSL } from "konva/lib/filters/HSL";
import QRCode from "qrcode";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import {
  FiArrowDown,
  FiArrowLeft,
  FiArrowUp,
  FiBriefcase,
  FiCircle,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiCopy,
  FiDownload,
  FiGrid,
  FiImage,
  FiLayers,
  FiLock,
  FiMail,
  FiMapPin,
  FiMinus,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiRotateCw,
  FiSearch,
  FiSettings,
  FiShare2,
  FiSquare,
  FiStar,
  FiTrash2,
  FiType,
  FiUpload,
} from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { defaultBrandKit, getTemplateById } from "../../constants/marketingStudioData";
import { getSessionDesignById, saveSessionDesign } from "../../services/marketingStudio/sessionDesignService";
import { STOCK_MEDIA_PAGE_SIZE, STOCK_MEDIA_PROVIDERS, getStockMediaProviderStatus, searchImages } from "../../services/marketingStudio/stockMediaService";
import { getCode128Bars } from "../../utils/barcode";

const MIN_ELEMENT_SIZE = 24;
const TEXT_FONT_OPTIONS = ["Inter", "Arial", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana", "Courier New"];
const TEXT_SIZE_MIN = 8;
const TEXT_SIZE_MAX = 180;
const DEFAULT_TEXT_WIDTH = 420;
const DEFAULT_TEXT_HEIGHT = 110;
const DEFAULT_SHAPE_SIZE = 220;
const DEFAULT_LINE_WIDTH = 360;
const DEFAULT_LINE_HEIGHT = 28;
const DEFAULT_QR_SIZE = 190;
const DEFAULT_BARCODE_WIDTH = 360;
const DEFAULT_BARCODE_HEIGHT = 130;
const DEFAULT_TABLE_WIDTH = 440;
const DEFAULT_TABLE_HEIGHT = 260;
const QR_SIZE_MIN = 96;
const QR_SIZE_MAX = 520;
const TABLE_ROWS_MIN = 1;
const TABLE_ROWS_MAX = 8;
const TABLE_COLUMNS_MIN = 1;
const TABLE_COLUMNS_MAX = 8;
const TABLE_TEXT_SIZE_MIN = 8;
const TABLE_TEXT_SIZE_MAX = 72;
const OPACITY_MIN = 0.1;
const OPACITY_MAX = 1;
const BRIGHTNESS_DEFAULT = 1;
const IMAGE_SIZE_MAX = 360;
const IMAGE_CROP_SCALE_MIN = 1;
const IMAGE_CROP_SCALE_MAX = 4;
const HISTORY_LIMIT = 75;
const HISTORY_MERGE_WINDOW_MS = 800;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const EXPORT_FORMATS = [
  { id: "png", label: "PNG", mimeType: "image/png", extension: "png" },
  { id: "jpeg", label: "JPEG", mimeType: "image/jpeg", extension: "jpg" },
];
const EXPORT_SCALES = [1, 2];
const JPEG_QUALITY_MIN = 0.5;
const JPEG_QUALITY_MAX = 1;
const CANVAS_ZOOM_MIN = 0.1;
const CANVAS_ZOOM_MAX = 3;
const CANVAS_ZOOM_STEP = 1.15;
const EDITOR_UI = {
  primaryButton:
    "inline-flex items-center justify-center gap-2 rounded-md bg-[#27308F] font-bold text-white shadow-sm shadow-indigo-950/10 transition duration-150 hover:bg-[#1A1F71] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/25 disabled:cursor-not-allowed disabled:opacity-45",
  secondaryButton:
    "inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white font-bold text-slate-700 shadow-sm shadow-slate-950/[0.02] transition duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60 disabled:cursor-not-allowed disabled:opacity-45",
  field:
    "w-full rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-sm shadow-slate-950/[0.015] outline-none transition duration-150 placeholder:text-slate-400 focus:border-[#27308F] focus:ring-2 focus:ring-[#27308F]/15",
  propertyCard: "rounded-md border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-950/[0.015]",
  sectionLabel: "text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500",
};

const LIBRARY_TABS = [
  { id: "stock", label: "Stock Images" },
  { id: "backgrounds", label: "Backgrounds" },
  { id: "stickers", label: "Stickers" },
];

const STICKER_LIBRARY = [
  { id: "sale", label: "Sale", glyph: "🏷️" },
  { id: "offer", label: "Special offer", glyph: "🎉" },
  { id: "new", label: "New", glyph: "✨" },
  { id: "star", label: "Star", glyph: "⭐" },
  { id: "heart", label: "Heart", glyph: "❤️" },
  { id: "gift", label: "Gift", glyph: "🎁" },
  { id: "shopping", label: "Shopping", glyph: "🛍️" },
  { id: "phone", label: "Call us", glyph: "📞" },
  { id: "delivery", label: "Delivery", glyph: "🚚" },
  { id: "quality", label: "Quality", glyph: "✅" },
  { id: "festival", label: "Festival", glyph: "🪔" },
  { id: "flower", label: "Flower", glyph: "🌸" },
];

const FRAME_PRESETS = [
  { id: "classic", label: "Classic" },
  { id: "double", label: "Double" },
  { id: "rounded", label: "Rounded" },
  { id: "dashed", label: "Dashed" },
];

const DEFAULT_STOCK_QUERY = "business";
const DEFAULT_BACKGROUND_QUERY = "background";
const INITIAL_STOCK_SEARCH_STATE = {
  loading: false,
  loadingMore: false,
  error: "",
  searched: false,
  page: 0,
  hasMore: false,
  totalResults: 0,
  provider: "",
  query: "",
};

const BRAND_INSERT_FIELDS = [
  {
    id: "businessName",
    label: "Business Name",
    binding: "brand.businessName",
    type: "text",
    valuePath: ["business", "name"],
    width: 560,
    height: 76,
    fontSize: 44,
    fontWeight: 800,
    fill: "#0f172a",
  },
  {
    id: "phone",
    label: "Phone",
    binding: "brand.phone",
    type: "text",
    valuePath: ["business", "phone"],
    width: 460,
    height: 54,
    fontSize: 30,
    fontWeight: 700,
    fill: "#334155",
  },
  {
    id: "email",
    label: "Email",
    binding: "brand.email",
    type: "text",
    valuePath: ["business", "email"],
    width: 520,
    height: 50,
    fontSize: 26,
    fontWeight: 600,
    fill: "#475569",
  },
  {
    id: "website",
    label: "Website",
    binding: "brand.website",
    type: "text",
    valuePath: ["business", "website"],
    width: 520,
    height: 50,
    fontSize: 28,
    fontWeight: 700,
    fill: "#2563eb",
  },
  {
    id: "address",
    label: "Address",
    binding: "brand.address",
    type: "text",
    valuePath: ["business", "address"],
    width: 650,
    height: 86,
    fontSize: 24,
    fontWeight: 600,
    fill: "#475569",
  },
  {
    id: "logo",
    label: "Logo",
    binding: "brand.logo",
    type: "image",
    valuePath: ["business", "logo"],
    width: 180,
    height: 180,
  },
];

const TEXT_PRESETS = [
  {
    id: "heading",
    label: "Heading",
    text: "Add a heading",
    width: 680,
    height: 130,
    fontSize: 72,
    fontWeight: 800,
  },
  {
    id: "subheading",
    label: "Subheading",
    text: "Add a subheading",
    width: 620,
    height: 100,
    fontSize: 46,
    fontWeight: 700,
  },
  {
    id: "body",
    label: "Body text",
    text: "Add body text",
    width: 560,
    height: 120,
    fontSize: 28,
    fontWeight: 400,
  },
];

const SHAPE_PRESETS = [
  {
    id: "rectangle",
    label: "Rectangle",
    icon: FiSquare,
    width: DEFAULT_SHAPE_SIZE,
    height: 150,
    fill: "#dbeafe",
    stroke: "#1d4ed8",
    strokeWidth: 3,
    cornerRadius: 12,
  },
  {
    id: "circle",
    label: "Circle",
    icon: FiCircle,
    width: DEFAULT_SHAPE_SIZE,
    height: DEFAULT_SHAPE_SIZE,
    fill: "#dcfce7",
    stroke: "#16a34a",
    strokeWidth: 3,
  },
  {
    id: "line",
    label: "Line",
    icon: FiMinus,
    width: DEFAULT_LINE_WIDTH,
    height: DEFAULT_LINE_HEIGHT,
    fill: "transparent",
    stroke: "#0f172a",
    strokeWidth: 6,
  },
];

function cloneDesign(template) {
  if (typeof structuredClone === "function") return structuredClone(template);
  return JSON.parse(JSON.stringify(template));
}

function createEditorSnapshot(design, brandKit) {
  return {
    design,
    brandKit,
  };
}

function isElementInteractive(element) {
  return element.editable !== false && !element.locked;
}

const BRAND_BINDING_PATHS = {
  "business.name": ["business", "name"],
  "business.logo": ["business", "logo"],
  "business.phone": ["business", "phone"],
  "business.email": ["business", "email"],
  "business.website": ["business", "website"],
  "business.address": ["business", "address"],
  "brand.businessName": ["business", "name"],
  "brand.logo": ["business", "logo"],
  "brand.phone": ["business", "phone"],
  "brand.email": ["business", "email"],
  "brand.website": ["business", "website"],
  "brand.address": ["business", "address"],
  "brand.primaryColor": ["colors", "primary"],
  "brand.secondaryColor": ["colors", "secondary"],
  "brand.accentColor": ["colors", "accent"],
};

function isLogoBinding(binding) {
  return binding === "brand.logo" || binding === "business.logo";
}

function getValueAtPath(source, path) {
  return path.reduce((current, key) => current?.[key], source);
}

function setValueAtPath(source, path, value) {
  const [key, ...rest] = path;
  if (!key) return value;

  return {
    ...source,
    [key]: rest.length > 0 ? setValueAtPath(source?.[key] || {}, rest, value) : value,
  };
}

function getBrandBindingValue(brandKit, binding) {
  const path = BRAND_BINDING_PATHS[binding];
  if (!path) return undefined;
  return getValueAtPath(brandKit, path);
}

function applyBoundStyle(element, property, value) {
  if (value === undefined || element.styleOverrides?.[property]) return element;

  if (property === "borderColor") {
    return {
      ...element,
      borderColor: value,
      stroke: value,
    };
  }

  return {
    ...element,
    [property]: value,
  };
}

function applyBrandKitToElement(element, brandKit) {
  let nextElement = element;

  if (element.binding && !element.brandOverride) {
    const value = getBrandBindingValue(brandKit, element.binding);

    if (value !== undefined && element.type === "text") {
      nextElement = {
        ...nextElement,
        text: String(value || ""),
      };
    }

    if (value !== undefined && element.type === "image") {
      nextElement = {
        ...nextElement,
        src: value || "",
        mediaId: isLogoBinding(element.binding) ? brandKit.business.logoMediaId || "" : element.mediaId,
        naturalWidth: isLogoBinding(element.binding) ? brandKit.business.logoNaturalWidth || element.naturalWidth : element.naturalWidth,
        naturalHeight: isLogoBinding(element.binding) ? brandKit.business.logoNaturalHeight || element.naturalHeight : element.naturalHeight,
      };
    }
  }

  Object.entries(element.styleBindings || {}).forEach(([property, binding]) => {
    nextElement = applyBoundStyle(nextElement, property, getBrandBindingValue(brandKit, binding));
  });

  return nextElement;
}

function applyBrandKitToDesign(design, brandKit) {
  if (!design) return design;

  return {
    ...design,
    elements: design.elements.map((element) => applyBrandKitToElement(element, brandKit)),
  };
}

function getManualOverrideUpdates(element, updates) {
  const overrides = {};

  if (element.binding) {
    const contentEdited =
      (element.type === "text" && Object.prototype.hasOwnProperty.call(updates, "text")) ||
      (element.type === "image" &&
        (Object.prototype.hasOwnProperty.call(updates, "src") || Object.prototype.hasOwnProperty.call(updates, "mediaId")));

    if (contentEdited) overrides.brandOverride = true;
  }

  const nextStyleOverrides = { ...(element.styleOverrides || {}) };
  Object.entries(element.styleBindings || {}).forEach(([property]) => {
    const propertyEdited =
      Object.prototype.hasOwnProperty.call(updates, property) ||
      (property === "borderColor" &&
        (Object.prototype.hasOwnProperty.call(updates, "borderColor") || Object.prototype.hasOwnProperty.call(updates, "stroke")));

    if (propertyEdited) nextStyleOverrides[property] = true;
  });

  if (Object.keys(nextStyleOverrides).length > 0) overrides.styleOverrides = nextStyleOverrides;

  return overrides;
}

function hasBrandBinding(element) {
  return Boolean(element?.binding || Object.keys(element?.styleBindings || {}).length > 0);
}

function hasBrandOverride(element) {
  return Boolean(element?.brandOverride || Object.keys(element?.styleOverrides || {}).length > 0);
}

function isQuickPersonalizeDesign(design) {
  return design?.templateType === "flat" && design?.editMode === "quick-personalize";
}

function getQuickPersonalizeElement(design, fieldId) {
  return design?.elements.find((element) => element.quickPersonalizeField === fieldId) || null;
}

function getBrandFieldConfig(fieldId) {
  return BRAND_INSERT_FIELDS.find((field) => field.id === fieldId) || null;
}

function getExportFormat(formatId) {
  return EXPORT_FORMATS.find((format) => format.id === formatId) || EXPORT_FORMATS[0];
}

function createDownloadFileName(design, format) {
  const safeName = String(design?.name || "marketing-design")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safeName || "marketing-design"}.${format.extension}`;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function triggerBrowserDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getElementLabel(element) {
  if (!element) return "No selection";
  return element.role || element.type;
}

function toTitleCase(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getHumanLayerLabel(layer) {
  if (layer.kind === "background") return "Template Background";

  const { element } = layer;
  if (element.type === "text") return (element.text || "Text").trim().slice(0, 36) || "Text";
  if (element.type === "image") {
    if (element.userAdded) return "Uploaded Image";
    return toTitleCase(element.role || "Image");
  }
  if (element.type === "shape") return toTitleCase(element.shapeType || element.role || "Shape");
  return toTitleCase(element.role || element.type || element.id);
}

function getLayerTypeLabel(layer) {
  if (layer.kind === "background") return "Background";
  if (layer.element.type === "shape" && layer.element.shapeType) return toTitleCase(layer.element.shapeType);
  return toTitleCase(layer.element.type);
}

function getVisualLayers(design) {
  const elementLayers = [...design.elements].reverse().map((element) => ({
    id: element.id,
    kind: "element",
    element,
    locked: !isElementInteractive(element),
  }));

  return [
    ...elementLayers,
    {
      id: "template-background",
      kind: "background",
      locked: true,
      element: {
        id: "template-background",
        type: design.background?.type || "background",
        role: "templateBackground",
        locked: true,
        editable: false,
      },
    },
  ];
}

function getInteractiveElements(elements) {
  return elements.filter((element) => isElementInteractive(element));
}

function moveArrayItem(items, fromIndex, toIndex) {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function reorderInteractiveElements(elements, elementId, action) {
  const interactiveElements = getInteractiveElements(elements);
  const currentIndex = interactiveElements.findIndex((element) => element.id === elementId);
  if (currentIndex === -1) return elements;

  const lastIndex = interactiveElements.length - 1;
  const targetIndexByAction = {
    bringToFront: lastIndex,
    sendToBack: 0,
    bringForward: Math.min(currentIndex + 1, lastIndex),
    sendBackward: Math.max(currentIndex - 1, 0),
  };
  const targetIndex = targetIndexByAction[action];
  if (targetIndex === undefined || targetIndex === currentIndex) return elements;

  const reorderedInteractiveElements = moveArrayItem(interactiveElements, currentIndex, targetIndex);
  let interactiveIndex = 0;

  return elements.map((element) => {
    if (!isElementInteractive(element)) return element;
    const nextElement = reorderedInteractiveElements[interactiveIndex];
    interactiveIndex += 1;
    return nextElement;
  });
}

function insertElementAboveOriginal(elements, originalId, newElement) {
  const originalIndex = elements.findIndex((element) => element.id === originalId);
  if (originalIndex === -1) return [...elements, newElement];

  const nextElements = [...elements];
  nextElements.splice(originalIndex + 1, 0, newElement);
  return nextElements;
}

function getLayerState(elements, elementId) {
  const interactiveElements = getInteractiveElements(elements);
  const currentIndex = interactiveElements.findIndex((element) => element.id === elementId);

  if (currentIndex === -1) {
    return {
      isLayerEditable: false,
      position: 0,
      total: interactiveElements.length,
      canBringForward: false,
      canSendBackward: false,
      canBringToFront: false,
      canSendToBack: false,
    };
  }

  const lastIndex = interactiveElements.length - 1;
  return {
    isLayerEditable: true,
    position: currentIndex + 1,
    total: interactiveElements.length,
    canBringForward: currentIndex < lastIndex,
    canSendBackward: currentIndex > 0,
    canBringToFront: currentIndex < lastIndex,
    canSendToBack: currentIndex > 0,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getKonvaFontStyle(element) {
  const weight = Number(element.fontWeight) >= 700 ? "bold" : "normal";
  const style = element.fontStyle === "italic" ? "italic" : "normal";
  if (weight === "bold" && style === "italic") return "bold italic";
  if (weight === "bold") return "bold";
  if (style === "italic") return "italic";
  return "normal";
}

function getImageFrame(image, element) {
  const targetWidth = Math.max(MIN_ELEMENT_SIZE, element.width);
  const targetHeight = Math.max(MIN_ELEMENT_SIZE, element.height);
  const naturalWidth = image?.naturalWidth || image?.width || targetWidth;
  const naturalHeight = image?.naturalHeight || image?.height || targetHeight;

  if (element.fit === "stretch" || element.role === "extractedObject") {
    return {
      crop: null,
      draw: {
        x: 0,
        y: 0,
        width: targetWidth,
        height: targetHeight,
      },
      maxOffsetX: 0,
      maxOffsetY: 0,
    };
  }

  const fitMode = element.fit === "contain" || element.fit === "fit" ? "fit" : "fill";

  if (fitMode === "fit") {
    const scale = Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return {
      crop: null,
      draw: {
        x: (targetWidth - width) / 2,
        y: (targetHeight - height) / 2,
        width,
        height,
      },
      maxOffsetX: 0,
      maxOffsetY: 0,
    };
  }

  const cropScale = clamp(element.cropScale || IMAGE_CROP_SCALE_MIN, IMAGE_CROP_SCALE_MIN, IMAGE_CROP_SCALE_MAX);
  const coverScale = Math.max(targetWidth / naturalWidth, targetHeight / naturalHeight) * cropScale;
  const width = naturalWidth * coverScale;
  const height = naturalHeight * coverScale;
  const maxOffsetX = Math.max(0, width - targetWidth);
  const maxOffsetY = Math.max(0, height - targetHeight);
  const cropOffsetX = clamp(element.cropX ?? 0.5, 0, 1);
  const cropOffsetY = clamp(element.cropY ?? 0.5, 0, 1);

  return {
    crop: null,
    draw: {
      x: -maxOffsetX * cropOffsetX,
      y: -maxOffsetY * cropOffsetY,
      width,
      height,
    },
    maxOffsetX,
    maxOffsetY,
  };
}

function getImageFilters(element) {
  const filters = [];
  if ((element.brightness ?? BRIGHTNESS_DEFAULT) !== BRIGHTNESS_DEFAULT) filters.push(Brightness);
  if ((element.contrast ?? 0) !== 0) filters.push(Contrast);
  if ((element.saturation ?? 0) !== 0) filters.push(HSL);
  if ((element.blurRadius ?? 0) > 0) filters.push(Blur);
  if (element.grayscale) filters.push(Grayscale);
  return filters;
}

function getContainedSize(naturalWidth, naturalHeight, maxSize) {
  const scale = Math.min(maxSize / naturalWidth, maxSize / naturalHeight, 1);
  return {
    width: Math.max(MIN_ELEMENT_SIZE, naturalWidth * scale),
    height: Math.max(MIN_ELEMENT_SIZE, naturalHeight * scale),
  };
}

function getCenteredCanvasPosition(canvasWidth, canvasHeight, elementWidth, elementHeight) {
  return {
    x: Math.round(clamp((canvasWidth - elementWidth) / 2, 0, Math.max(0, canvasWidth - elementWidth))),
    y: Math.round(clamp((canvasHeight - elementHeight) / 2, 0, Math.max(0, canvasHeight - elementHeight))),
  };
}

function getContainedElementSize(canvasWidth, canvasHeight, preferredWidth, preferredHeight) {
  return {
    width: Math.round(Math.min(preferredWidth, Math.max(MIN_ELEMENT_SIZE, canvasWidth - 48))),
    height: Math.round(Math.min(preferredHeight, Math.max(MIN_ELEMENT_SIZE, canvasHeight - 48))),
  };
}

function createUniqueSuffix() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createUserElementId(type, variant) {
  return `user-${type}-${variant}-${createUniqueSuffix()}`;
}

function createMediaId() {
  return `session-media-${createUniqueSuffix()}`;
}

function createStockMediaId(asset) {
  return `stock-media-${asset.source || "stock"}-${asset.id}`;
}

async function createQrDataUrl(value, options = {}) {
  const text = String(value || "").trim() || "https://ledgerly.example";
  return QRCode.toDataURL(text, {
    width: options.size || 320,
    margin: 1,
    color: {
      dark: options.foreground || "#0f172a",
      light: options.background || "#ffffff",
    },
  });
}

function createMediaItemFromStockAsset(asset) {
  return {
    id: createStockMediaId(asset),
    name: asset.alt || "Stock image",
    src: asset.fullUrl || asset.previewUrl || asset.thumbnailUrl,
    thumbnailSrc: asset.thumbnailUrl || asset.previewUrl || asset.fullUrl,
    naturalWidth: asset.width || IMAGE_SIZE_MAX,
    naturalHeight: asset.height || IMAGE_SIZE_MAX,
    source: asset.source || "stock",
    provider: asset.provider || asset.source || "stock",
    sourceAssetId: asset.id,
    providerAssetId: asset.providerAssetId || asset.id,
    sourceUrl: asset.sourceUrl || "",
    photographerUrl: asset.photographerUrl || "",
    downloadUrl: asset.downloadUrl || "",
    attribution: asset.attribution || "",
    attributionUrl: asset.attributionUrl || "",
    author: asset.author || "",
  };
}

function mergeUniqueAssets(existingItems, nextItems) {
  const seen = new Set(existingItems.map((item) => item.id));
  const uniqueNextItems = nextItems.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return [...existingItems, ...uniqueNextItems];
}

function limitHistory(entries) {
  return entries.length > HISTORY_LIMIT ? entries.slice(entries.length - HISTORY_LIMIT) : entries;
}

function hasElement(design, elementId) {
  return Boolean(elementId && design?.elements.some((element) => element.id === elementId));
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      reject(new Error("Choose a PNG, JPG, JPEG, or WebP image."));
      return;
    }

    const src = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      resolve({
        src,
        naturalWidth: image.naturalWidth || image.width,
        naturalHeight: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("This image could not be loaded."));
    };
    image.src = src;
  });
}

function useCanvasImage(src) {
  const [state, setState] = useState({ image: null, failed: false });

  useEffect(() => {
    if (!src) return undefined;

    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!cancelled) setState({ image, failed: false });
    };
    image.onerror = () => {
      if (!cancelled) setState({ image: null, failed: true });
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return src ? state : { image: null, failed: false };
}

function useElementTransform(selectedId, stageRef, transformerRef, design) {
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;

    const selectedNode = selectedId ? stage.findOne(`#${selectedId}`) : null;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [design, selectedId, stageRef, transformerRef]);
}

function useWorkspaceScale(width, height) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 620 });

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ width: rect.width, height: rect.height });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    const fitWidth = Math.max(size.width - 32, 240) / width;
    const fitHeight = Math.max(size.height - 32, 240) / height;
    return Math.min(1, fitWidth, fitHeight);
  }, [height, size.height, size.width, width]);

  return { containerRef, fitScale, size };
}

function ImageElement({ element, commonProps, selected = false, onChange, exportMode = false }) {
  const { image, failed } = useCanvasImage(element.src);
  const imageRef = useRef(null);
  const filters = getImageFilters(element);

  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;

    if (filters.length > 0) {
      node.cache();
    } else {
      node.clearCache();
    }

    node.getLayer()?.batchDraw();
  }, [element.blurRadius, element.brightness, element.contrast, element.grayscale, element.saturation, filters.length, image]);

  if (image) {
    const frame = getImageFrame(image, element);
    const showBorder = (element.borderWidth || element.strokeWidth || 0) > 0;
    const cropEditing = selected && element.cropEditing && !exportMode && (element.fit || "cover") !== "fit" && element.fit !== "contain";

    // Extracted cutouts are already tightly cropped transparent PNGs. Render them
    // as the draggable canvas node itself; wrapping them in a clipping Group can
    // leave the child image as the drag target and make a sticker rotate but not move.
    if (element.role === "extractedObject" && element.fit === "stretch" && !cropEditing && !element.flipX && !element.flipY) {
      return (
        <KonvaImage
          {...commonProps}
          image={image}
          listening={!exportMode}
          filters={filters}
          brightness={element.brightness ?? BRIGHTNESS_DEFAULT}
          contrast={element.contrast ?? 0}
          saturation={element.saturation ?? 0}
          blurRadius={element.blurRadius ?? 0}
        />
      );
    }

    const getCropFromNode = (node) => {
      const left = element.flipX ? node.x() - frame.draw.width : node.x();
      const top = element.flipY ? node.y() - frame.draw.height : node.y();

      return {
        cropX: frame.maxOffsetX > 0 ? clamp(-left / frame.maxOffsetX, 0, 1) : 0.5,
        cropY: frame.maxOffsetY > 0 ? clamp(-top / frame.maxOffsetY, 0, 1) : 0.5,
      };
    };

    const clampCropNodePosition = (node) => {
      const left = element.flipX ? node.x() - frame.draw.width : node.x();
      const top = element.flipY ? node.y() - frame.draw.height : node.y();
      const nextLeft = clamp(left, -frame.maxOffsetX, 0);
      const nextTop = clamp(top, -frame.maxOffsetY, 0);

      node.x(element.flipX ? nextLeft + frame.draw.width : nextLeft);
      node.y(element.flipY ? nextTop + frame.draw.height : nextTop);
    };

    return (
      <Group
        {...commonProps}
        clipFunc={(context) => {
          const radius = Math.min(element.cornerRadius || 0, element.width / 2, element.height / 2);
          context.beginPath();
          context.moveTo(radius, 0);
          context.lineTo(element.width - radius, 0);
          context.quadraticCurveTo(element.width, 0, element.width, radius);
          context.lineTo(element.width, element.height - radius);
          context.quadraticCurveTo(element.width, element.height, element.width - radius, element.height);
          context.lineTo(radius, element.height);
          context.quadraticCurveTo(0, element.height, 0, element.height - radius);
          context.lineTo(0, radius);
          context.quadraticCurveTo(0, 0, radius, 0);
          context.closePath();
        }}
      >
        <Rect x={0} y={0} width={element.width} height={element.height} fill="#ffffff" opacity={0.001} />
        <KonvaImage
          ref={imageRef}
          image={image}
          x={frame.draw.x + (element.flipX ? frame.draw.width : 0)}
          y={frame.draw.y + (element.flipY ? frame.draw.height : 0)}
          width={frame.draw.width}
          height={frame.draw.height}
          scaleX={element.flipX ? -1 : 1}
          scaleY={element.flipY ? -1 : 1}
          filters={filters}
          brightness={element.brightness ?? BRIGHTNESS_DEFAULT}
          contrast={element.contrast ?? 0}
          saturation={element.saturation ?? 0}
          blurRadius={element.blurRadius ?? 0}
          draggable={cropEditing}
          listening={!exportMode}
          onDragMove={(event) => {
            event.cancelBubble = true;
            clampCropNodePosition(event.target);
          }}
          onDragEnd={(event) => {
            event.cancelBubble = true;
            clampCropNodePosition(event.target);
            onChange(element.id, getCropFromNode(event.target), { historyLabel: "Crop image" });
          }}
        />
        {showBorder && (
          <Rect
            x={0}
            y={0}
            width={element.width}
            height={element.height}
            fillEnabled={false}
            listening={false}
            stroke={element.borderColor || element.stroke || "#0f172a"}
            strokeWidth={element.borderWidth || element.strokeWidth || 0}
            cornerRadius={element.cornerRadius || 0}
          />
        )}
      </Group>
    );
  }

  return (
    <>
      <Rect
        {...commonProps}
        fill={failed ? "#fee2e2" : "#f8fafc"}
        stroke={failed ? "#f87171" : "#cbd5e1"}
        strokeWidth={2}
        dash={[10, 8]}
        cornerRadius={element.cornerRadius || 16}
      />
      {!element.src && (
        <Text
          x={element.x}
          y={element.y + element.height / 2 - 12}
          width={element.width}
          height={24}
          text={element.role || "Image"}
          align="center"
          fontSize={20}
          fontStyle="bold"
          fill="#94a3b8"
          listening={false}
        />
      )}
    </>
  );
}

function BackgroundLayer({ background, width, height, onClearSelection }) {
  const { image, failed } = useCanvasImage(background?.src);

  if (background?.type === "image" && image) {
    return (
      <KonvaImage
        image={image}
        x={0}
        y={0}
        width={width}
        height={height}
        listening
        onMouseDown={onClearSelection}
        onTouchStart={onClearSelection}
      />
    );
  }

  return (
    <Rect
      x={0}
      y={0}
      width={width}
      height={height}
      fill={failed ? "#fee2e2" : background?.fill || "#ffffff"}
      listening
      onMouseDown={onClearSelection}
      onTouchStart={onClearSelection}
    />
  );
}

function CanvasElement({ element, selected, onSelect, onChange, brandKit, exportMode = false }) {
  const interactive = isElementInteractive(element);
  const isLine = element.type === "shape" && element.shapeType === "line";

  const handleSelect = (event) => {
    event.cancelBubble = true;
    if (interactive) onSelect(element.id);
  };

  const handleDragEnd = (event) => {
    const node = event.target;
    onChange(
      element.id,
      {
        x: node.x(),
        y: node.y(),
      },
      { historyLabel: "Move element" },
    );
  };

  const handleTransformEnd = (event) => {
    const node = event.target;
    const scaleX = Math.abs(node.scaleX());
    const scaleY = Math.abs(node.scaleY());
    const nextWidth = Math.max(MIN_ELEMENT_SIZE, element.width * scaleX);
    const nextHeight = Math.max(isLine ? 1 : MIN_ELEMENT_SIZE, element.height * scaleY);

    node.scaleX(1);
    node.scaleY(1);

    onChange(
      element.id,
      {
        x: node.x(),
        y: node.y(),
        width: nextWidth,
        height: nextHeight,
        rotation: node.rotation(),
      },
      { historyLabel: "Transform element" },
    );
  };

  const commonProps = {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation || 0,
    opacity: element.opacity ?? 1,
    draggable: interactive && !exportMode && !(element.type === "image" && selected && element.cropEditing),
    onMouseDown: handleSelect,
    onTouchStart: handleSelect,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
    stroke: selected && !exportMode ? "#2563eb" : element.stroke,
    strokeWidth: selected && !exportMode ? 3 : element.strokeWidth || 0,
  };

  if (element.type === "text") {
    return (
      <Text
        {...commonProps}
        text={element.text}
        fontFamily={element.fontFamily}
        fontSize={element.fontSize}
        fontStyle={getKonvaFontStyle(element)}
        lineHeight={element.lineHeight || 1.2}
        textDecoration={element.textDecoration || ""}
        fill={element.fill}
        align={element.align}
        verticalAlign="middle"
        wrap={element.wrap || (element.role === "extractedText" ? "none" : "word")}
      />
    );
  }

  if (element.type === "image") {
    return <ImageElement element={element} commonProps={commonProps} selected={selected} onChange={onChange} exportMode={exportMode} />;
  }

  if (element.type === "qr") {
    return <QrElement element={element} commonProps={commonProps} selected={selected && !exportMode} />;
  }

  if (element.type === "barcode") {
    return <BarcodeElement element={element} commonProps={commonProps} selected={selected && !exportMode} />;
  }

  if (element.type === "table") {
    return <TableElement element={element} commonProps={commonProps} selected={selected && !exportMode} />;
  }

  return <ShapeElement element={element} commonProps={commonProps} selected={selected && !exportMode} brandKit={brandKit} />;
}

function ShapeElement({ element, commonProps, selected, brandKit }) {
  if (element.shapeType === "frame") {
    return <BrandedFrameElement element={element} commonProps={commonProps} selected={selected} brandKit={brandKit} />;
  }

  if (element.shapeType === "circle") {
    return (
      <Rect
        {...commonProps}
        fill={element.fill || "#e2e8f0"}
        cornerRadius={Math.min(element.width, element.height) / 2}
        stroke={selected ? "#2563eb" : element.stroke || element.borderColor}
        strokeWidth={selected ? 3 : element.strokeWidth || element.borderWidth || 0}
      />
    );
  }

  if (element.shapeType === "line") {
    return (
      <Line
        {...commonProps}
        points={[0, element.height / 2, element.width, element.height / 2]}
        stroke={selected ? "#2563eb" : element.stroke || "#0f172a"}
        strokeWidth={selected ? Math.max(3, element.strokeWidth || 4) : element.strokeWidth || 4}
        lineCap="round"
        lineJoin="round"
        fillEnabled={false}
        hitStrokeWidth={Math.max(18, element.strokeWidth || 4)}
      />
    );
  }

  return (
    <Rect
      {...commonProps}
      fill={element.fill || "#e2e8f0"}
      cornerRadius={element.cornerRadius || 0}
      stroke={selected ? "#2563eb" : element.stroke || element.borderColor}
      strokeWidth={selected ? 3 : element.strokeWidth || element.borderWidth || 0}
    />
  );
}

function BrandedFrameElement({ element, commonProps, selected, brandKit }) {
  const brandBusiness = brandKit?.business || {};
  const brandIsAvailable = Boolean(brandKit?.business);
  const { image: logo } = useCanvasImage(brandIsAvailable ? brandBusiness.logo : element.brandLogo);
  const inset = Math.max(10, Math.min(element.width, element.height) * 0.035);
  const frameStroke = selected ? "#2563eb" : element.stroke || "#27308F";
  const frameStrokeWidth = selected ? Math.max(3, element.strokeWidth || 8) : element.strokeWidth || 8;
  const cornerRadius = element.frameStyle === "rounded" ? Math.min(element.width, element.height) * 0.045 : 0;
  const bandHeight = Math.max(46, Math.min(element.height * 0.14, 96));
  const bandWidth = Math.max(1, element.width - inset * 2);
  const headerY = inset;
  const footerY = Math.max(headerY + bandHeight, element.height - inset - bandHeight);
  const logoHeight = bandHeight * 0.66;
  const logoWidth = logo ? Math.min(logoHeight * (logo.width / Math.max(1, logo.height)), bandHeight * 1.5) : 0;
  const labelX = inset + (logoWidth ? logoWidth + 16 : 12);
  const labelWidth = Math.max(20, bandWidth - (labelX - inset) - 12);
  const textColor = brandKit?.colors?.primary || element.brandColor || "#27308F";
  const businessName = brandIsAvailable ? brandBusiness.name || "" : element.businessName || "";
  const contactLine = [
    brandIsAvailable ? brandBusiness.phone : element.businessPhone,
    brandIsAvailable ? brandBusiness.website : element.businessWebsite,
  ].filter(Boolean).join("   ·   ");

  return (
    <Group {...commonProps}>
      <Rect x={0} y={0} width={element.width} height={element.height} fill="#ffffff" opacity={0.001} strokeEnabled={false} />
      <Rect
        x={inset}
        y={inset}
        width={bandWidth}
        height={Math.max(1, element.height - inset * 2)}
        fillEnabled={false}
        cornerRadius
        stroke={frameStroke}
        strokeWidth={frameStrokeWidth}
        dash={element.frameStyle === "dashed" ? [18, 12] : undefined}
        listening={false}
      />
      {element.frameStyle === "double" && (
        <Rect x={inset * 2.25} y={inset * 2.25} width={Math.max(1, element.width - inset * 4.5)} height={Math.max(1, element.height - inset * 4.5)} fillEnabled={false} stroke={frameStroke} strokeWidth={Math.max(1, frameStrokeWidth * 0.45)} listening={false} />
      )}
      <Rect x={inset + frameStrokeWidth} y={headerY + frameStrokeWidth} width={Math.max(1, bandWidth - frameStrokeWidth * 2)} height={bandHeight} fill="#ffffff" opacity={0.9} listening={false} />
      <Rect x={inset + frameStrokeWidth} y={footerY} width={Math.max(1, bandWidth - frameStrokeWidth * 2)} height={bandHeight} fill="#ffffff" opacity={0.9} listening={false} />
      {logo && (
        <KonvaImage
          image={logo}
          x={inset + 12}
          y={headerY + (bandHeight - logoHeight) / 2}
          width={logoWidth}
          height={logoHeight}
          listening={false}
        />
      )}
      {businessName && (
        <Text
          x={labelX}
          y={headerY + frameStrokeWidth}
          width={labelWidth}
          height={bandHeight}
          text={businessName}
          fontFamily={TEXT_FONT_OPTIONS[0]}
          fontSize={clamp(bandHeight * 0.34, 12, 32)}
          fontStyle="bold"
          fill={textColor}
          align="right"
          verticalAlign="middle"
          ellipsis
          listening={false}
        />
      )}
      {contactLine && (
        <Text
          x={inset + 14}
          y={footerY}
          width={Math.max(1, bandWidth - 28)}
          height={bandHeight}
          text={contactLine}
          fontFamily={TEXT_FONT_OPTIONS[0]}
          fontSize={clamp(bandHeight * 0.22, 10, 20)}
          fontStyle="bold"
          fill={textColor}
          align="center"
          verticalAlign="middle"
          ellipsis
          listening={false}
        />
      )}
    </Group>
  );
}

function QrElement({ element, commonProps, selected }) {
  const { image, failed } = useCanvasImage(element.src);
  const borderWidth = element.borderWidth ?? 0;
  const borderColor = element.borderColor || "#ffffff";
  const cornerRadius = element.cornerRadius || 0;

  return (
    <Group {...commonProps}>
      <Rect
        x={0}
        y={0}
        width={element.width}
        height={element.height}
        fill={element.background || "#ffffff"}
        cornerRadius={cornerRadius}
        stroke={selected ? "#2563eb" : borderColor}
        strokeWidth={selected ? 3 : borderWidth}
      />
      {image ? (
        <KonvaImage
          image={image}
          x={borderWidth}
          y={borderWidth}
          width={Math.max(1, element.width - borderWidth * 2)}
          height={Math.max(1, element.height - borderWidth * 2)}
          listening={false}
        />
      ) : (
        <Text
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          text={failed ? "QR unavailable" : "QR"}
          fill="#94a3b8"
          fontSize={Math.max(12, Math.min(24, element.width / 8))}
          fontFamily="Inter"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
    </Group>
  );
}

function BarcodeElement({ element, commonProps, selected }) {
  const encoded = getCode128Bars(element.value || element.text);
  const paddingX = element.paddingX ?? 18;
  const paddingY = element.paddingY ?? 14;
  const labelHeight = element.showValue === false ? 0 : 24;
  const drawableWidth = Math.max(1, element.width - paddingX * 2);
  const drawableHeight = Math.max(1, element.height - paddingY * 2 - labelHeight);
  const scaleX = encoded ? drawableWidth / encoded.totalWidth : 1;
  const foreground = element.foreground || "#0f172a";

  return (
    <Group {...commonProps}>
      <Rect
        x={0}
        y={0}
        width={element.width}
        height={element.height}
        fill={element.background || "#ffffff"}
        cornerRadius={element.cornerRadius || 8}
        stroke={selected ? "#2563eb" : element.borderColor || "#cbd5e1"}
        strokeWidth={selected ? 3 : element.borderWidth ?? 1}
      />
      {encoded ? (
        <>
          {encoded.bars.map((bar) => (
            <Rect
              key={`${bar.x}-${bar.width}`}
              x={paddingX + bar.x * scaleX}
              y={paddingY}
              width={Math.max(0.75, bar.width * scaleX)}
              height={drawableHeight}
              fill={foreground}
              listening={false}
            />
          ))}
          {element.showValue !== false && (
            <Text
              x={paddingX}
              y={element.height - paddingY - labelHeight + 4}
              width={drawableWidth}
              height={labelHeight}
              text={encoded.text}
              fontFamily={element.fontFamily || "Inter"}
              fontSize={element.fontSize || 16}
              fontStyle="bold"
              fill={foreground}
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          )}
        </>
      ) : (
        <Text
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          text="Enter barcode value"
          fontFamily="Inter"
          fontSize={16}
          fontStyle="bold"
          fill="#94a3b8"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
    </Group>
  );
}

function TableElement({ element, commonProps, selected }) {
  const rows = clamp(Math.round(Number(element.rows) || 2), TABLE_ROWS_MIN, TABLE_ROWS_MAX);
  const columns = clamp(Math.round(Number(element.columns) || 2), TABLE_COLUMNS_MIN, TABLE_COLUMNS_MAX);
  const borderWidth = element.borderWidth ?? element.strokeWidth ?? 2;
  const cellWidth = element.width / columns;
  const cellHeight = element.height / rows;

  return (
    <Group {...commonProps}>
      <Rect
        x={0}
        y={0}
        width={element.width}
        height={element.height}
        fill={element.fill || "#ffffff"}
        stroke={selected ? "#2563eb" : element.borderColor || element.stroke || "#334155"}
        strokeWidth={selected ? Math.max(3, borderWidth) : borderWidth}
        cornerRadius={element.cornerRadius || 0}
      />
      {Array.from({ length: Math.max(0, columns - 1) }, (_, index) => (
        <Line
          key={`column-${index + 1}`}
          points={[cellWidth * (index + 1), 0, cellWidth * (index + 1), element.height]}
          stroke={element.borderColor || element.stroke || "#334155"}
          strokeWidth={borderWidth}
          listening={false}
        />
      ))}
      {Array.from({ length: Math.max(0, rows - 1) }, (_, index) => (
        <Line
          key={`row-${index + 1}`}
          points={[0, cellHeight * (index + 1), element.width, cellHeight * (index + 1)]}
          stroke={element.borderColor || element.stroke || "#334155"}
          strokeWidth={borderWidth}
          listening={false}
        />
      ))}
      {Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const text = element.cellValues?.[index] || "";
        if (!text) return null;
        return (
          <Text
            key={`cell-${index}`}
            x={column * cellWidth + 4}
            y={row * cellHeight + 2}
            width={Math.max(1, cellWidth - 8)}
            height={Math.max(1, cellHeight - 4)}
            text={text}
            fontFamily={element.fontFamily || TEXT_FONT_OPTIONS[0]}
            fontSize={clamp(Number(element.fontSize) || Math.floor(Math.min(cellWidth, cellHeight) * 0.24), TABLE_TEXT_SIZE_MIN, TABLE_TEXT_SIZE_MAX)}
            fill={element.textColor || "#0f172a"}
            align="center"
            verticalAlign="middle"
            wrap="word"
            listening={false}
          />
        );
      })}
    </Group>
  );
}

function CanvasStage({ design, selectedId, setSelectedId, updateElement, brandKit, stageRef, exportMode = false }) {
  const transformerRef = useRef(null);
  const [manualScale, setManualScale] = useState(null);
  const { containerRef, fitScale } = useWorkspaceScale(design.width, design.height);
  const scale = clamp(manualScale ?? fitScale, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX);
  const zoomPercent = Math.round(scale * 100);

  const changeZoom = (direction) => {
    setManualScale((current) => {
      const baseScale = current ?? fitScale;
      const nextScale = direction === "in" ? baseScale * CANVAS_ZOOM_STEP : baseScale / CANVAS_ZOOM_STEP;
      return clamp(nextScale, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX);
    });
  };

  useElementTransform(exportMode ? "" : selectedId, stageRef, transformerRef, design);

  return (
    <div
      ref={containerRef}
      className="relative grid h-full min-h-[320px] place-items-center overflow-auto rounded-lg border border-slate-200/80 bg-[#E8EEF5] p-4 font-sans"
    >
      <div className="rounded-md bg-white shadow-lg shadow-slate-950/[0.12] ring-1 ring-slate-900/10 transition duration-200" style={{ width: design.width * scale, height: design.height * scale }}>
        <Stage
          ref={stageRef}
          width={design.width * scale}
          height={design.height * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(event) => {
            if (!exportMode && event.target === event.target.getStage()) setSelectedId("");
          }}
          onTouchStart={(event) => {
            if (!exportMode && event.target === event.target.getStage()) setSelectedId("");
          }}
        >
          <Layer>
            <BackgroundLayer
              background={design.background}
              width={design.width}
              height={design.height}
              onClearSelection={() => setSelectedId("")}
            />
            {design.elements.map((element) => (
              <CanvasElement
                key={element.id}
                element={element}
                selected={selectedId === element.id}
                onSelect={setSelectedId}
                onChange={updateElement}
                brandKit={brandKit}
                exportMode={exportMode}
              />
            ))}
            {!exportMode && (
              <Transformer
                ref={transformerRef}
                rotateEnabled
                enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]}
                borderStroke="#27308F"
                anchorStroke="#27308F"
                anchorFill="#ffffff"
                anchorSize={9}
                anchorCornerRadius={3}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < MIN_ELEMENT_SIZE || newBox.height < MIN_ELEMENT_SIZE) return oldBox;
                  return newBox;
                }}
              />
            )}
          </Layer>
        </Stage>
      </div>
      <div className="absolute bottom-4 right-4 flex items-center overflow-hidden rounded-md border border-slate-200 bg-white/95 text-sm font-bold text-slate-700 shadow-lg shadow-slate-950/10">
        <button
          type="button"
          onClick={() => setManualScale(null)}
          className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500 transition duration-150 hover:bg-slate-50 hover:text-[#27308F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={() => changeZoom("out")}
          className="border-l border-slate-200 px-3 py-2 text-slate-400 transition duration-150 hover:bg-slate-50 hover:text-[#27308F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20"
          aria-label="Zoom out"
        >
          -
        </button>
        <span className="border-l border-slate-200 px-3 py-2">{zoomPercent}%</span>
        <button
          type="button"
          onClick={() => changeZoom("in")}
          className="border-l border-slate-200 px-3 py-2 text-slate-400 transition duration-150 hover:bg-slate-50 hover:text-[#27308F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}

function ExportPanel({ design, options, status, busy, onOptionsChange, onDownload, onClose }) {
  const format = getExportFormat(options.format);
  const outputWidth = design.width * options.scale;
  const outputHeight = design.height * options.scale;

  return (
    <section className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-950/[0.03]">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-3 lg:flex lg:items-center">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Format</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_FORMATS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOptionsChange({ format: item.id })}
                  className={`h-9 rounded-lg border px-3 text-xs font-bold ${
                    options.format === item.id ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/50 hover:bg-[#F1F5F9]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Resolution</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => onOptionsChange({ scale })}
                  className={`h-9 rounded-lg border px-3 text-xs font-bold ${
                    options.scale === scale ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/50 hover:bg-[#F1F5F9]"
                  }`}
                >
                  {scale}x
                </button>
              ))}
            </div>
          </div>

          {format.id === "jpeg" && (
            <label>
              <span className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase text-slate-500">
                JPEG Quality
                <span>{Math.round(options.jpegQuality * 100)}%</span>
              </span>
              <input
                type="range"
                min={JPEG_QUALITY_MIN}
                max={JPEG_QUALITY_MAX}
                step="0.05"
                value={options.jpegQuality}
                onChange={(event) => onOptionsChange({ jpegQuality: Number(event.target.value) })}
                className="w-full accent-[#27308F] sm:min-w-44"
              />
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
          <div className="text-sm">
            <p className="font-bold text-slate-900">
              {outputWidth} x {outputHeight} px
            </p>
            {status && <p className="text-xs font-semibold text-slate-500">{status}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`${EDITOR_UI.secondaryButton} h-10 px-3 text-sm`}>
              Close
            </button>
            <Button onClick={onDownload} disabled={busy} className="bg-[#27308F] px-4 py-2 text-white hover:bg-[#1A1F71] disabled:cursor-not-allowed disabled:opacity-45">
              <FiDownload className="h-4 w-4" />
              {busy ? "Preparing" : "Download"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function EditorHeader({
  design,
  autosaveStatus,
  canUndo,
  canRedo,
  busy,
  onBack,
  onShare,
  onOpenExport,
  onUndo,
  onRedo,
}) {
  const quickPersonalizeActive = isQuickPersonalizeDesign(design);

  return (
    <header className="flex h-auto shrink-0 flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 font-sans shadow-sm shadow-slate-950/[0.03] lg:h-16 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className="hidden h-7 w-px bg-slate-200 sm:block" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[15px] font-bold text-slate-950">{design.name}</h1>
            {design?.id?.startsWith("image-to-layers-") && (
              <span className={`shrink-0 text-[11px] font-semibold ${autosaveStatus === "error" ? "text-rose-600" : "text-slate-400"}`} aria-live="polite">
                {autosaveStatus === "saving" ? "Saving…" : autosaveStatus === "error" ? "Save failed" : "Saved"}
              </span>
            )}
            {quickPersonalizeActive && (
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                Quick Personalize
              </span>
            )}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
            {design.width} x {design.height}px · {design.templateType}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-inner shadow-slate-950/[0.03]">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-[#27308F] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <FiCornerUpLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-[#27308F] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <FiCornerUpRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            disabled={busy}
            className={`${EDITOR_UI.secondaryButton} h-10 shrink-0 px-4 text-sm`}
          >
            <FiShare2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={onOpenExport}
            disabled={busy}
            aria-label="Open download options"
            className={`${EDITOR_UI.primaryButton} h-10 min-w-32 shrink-0 px-4 text-sm`}
          >
            <FiDownload className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>
    </header>
  );
}

function ObjectToolbar({ selectedElement, onElementChange, onReplaceImage }) {
  const [openMenu, setOpenMenu] = useState("");
  const closeMenu = () => setOpenMenu("");

  if (!selectedElement || !isElementInteractive(selectedElement)) {
    return (
      <div className="flex h-11 items-center border-b border-slate-200 bg-white px-3 font-sans">
        <p className="text-xs font-medium text-slate-500">Select an element for quick controls</p>
      </div>
    );
  }

  const updateSelectedElement = (updates, historyOptions = {}) => onElementChange(selectedElement.id, updates, historyOptions);
  const controlButton = (active = false) =>
    `grid h-9 w-9 min-w-9 place-items-center rounded-md border px-0 text-xs font-bold transition duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20 ${
      active ? "border-[#27308F] bg-[#27308F] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/45 hover:bg-slate-50 hover:text-[#27308F]"
    }`;
  const compactButton = (active = false) =>
    `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-bold transition duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20 ${
      active ? "border-[#27308F] bg-[#27308F] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/45 hover:bg-slate-50 hover:text-[#27308F]"
    }`;
  const separator = <span className="h-6 w-px shrink-0 bg-slate-200" />;
  const moreButton = (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpenMenu(openMenu === "more" ? "" : "more")} className={compactButton(false)} title="More controls">
        More ...
      </button>
      {openMenu === "more" && (
        <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-600 shadow-xl shadow-slate-950/10">
          <p className="px-2 py-1.5">Advanced controls are in the Inspector.</p>
        </div>
      )}
    </div>
  );

  const textToolbar = selectedElement.type === "text" && (
    <>
      <select
        value={selectedElement.fontFamily || TEXT_FONT_OPTIONS[0]}
        onChange={(event) => updateSelectedElement({ fontFamily: event.target.value }, { historyLabel: "Change text font" })}
        className="h-9 w-[140px] min-w-[140px] max-w-[140px] flex-none truncate rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-[#27308F] focus:ring-2 focus:ring-[#27308F]/15"
        title="Font"
      >
        {TEXT_FONT_OPTIONS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={TEXT_SIZE_MIN}
        max={TEXT_SIZE_MAX}
        value={selectedElement.fontSize || 16}
        onChange={(event) => {
          const nextSize = clamp(Number(event.target.value) || TEXT_SIZE_MIN, TEXT_SIZE_MIN, TEXT_SIZE_MAX);
          updateSelectedElement({ fontSize: nextSize }, { historyLabel: "Change text size", mergeKey: `${selectedElement.id}:fontSize` });
        }}
        className="h-9 w-[58px] min-w-[58px] max-w-[58px] flex-none rounded-md border border-slate-200 bg-white px-2 text-center text-xs font-semibold text-slate-800 outline-none transition focus:border-[#27308F] focus:ring-2 focus:ring-[#27308F]/15"
        title="Size"
      />
      {[
        ["Bold", "B", Number(selectedElement.fontWeight) >= 700, { fontWeight: Number(selectedElement.fontWeight) >= 700 ? 400 : 800 }],
        ["Italic", "I", selectedElement.fontStyle === "italic", { fontStyle: selectedElement.fontStyle === "italic" ? "normal" : "italic" }],
        ["Underline", "U", selectedElement.textDecoration === "underline", { textDecoration: selectedElement.textDecoration === "underline" ? "" : "underline" }],
      ].map(([label, glyph, active, updates]) => (
        <button key={label} type="button" title={label} onClick={() => updateSelectedElement(updates, { historyLabel: `Toggle ${label.toLowerCase()}` })} className={controlButton(active)}>
          <span className={label === "Italic" ? "italic" : label === "Underline" ? "underline" : ""}>{glyph}</span>
        </button>
      ))}
      <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md border border-slate-200 bg-white p-1 shadow-sm transition hover:border-[#27308F]/45 hover:bg-slate-50" title="Text color">
        <span className="h-5 w-5 rounded border border-slate-200" style={{ backgroundColor: selectedElement.fill || "#0f172a" }} />
        <input
          type="color"
          value={selectedElement.fill || "#0f172a"}
          onChange={(event) => updateSelectedElement({ fill: event.target.value }, { historyLabel: "Change text color", mergeKey: `${selectedElement.id}:fill` })}
          className="sr-only"
        />
      </label>
      <div className="relative shrink-0">
        <button type="button" onClick={() => setOpenMenu(openMenu === "align" ? "" : "align")} className={`${compactButton(false)} w-[76px] px-2`}>
          Align v
        </button>
        {openMenu === "align" && (
        <div className="absolute right-0 top-10 z-30 w-32 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10">
            {["left", "center", "right"].map((alignment) => (
              <button
                key={alignment}
                type="button"
                onClick={() => {
                  updateSelectedElement({ align: alignment }, { historyLabel: "Change text alignment" });
                  closeMenu();
                }}
                className={`block h-8 w-full rounded-lg px-2 text-left text-xs font-bold capitalize ${
                  (selectedElement.align || "left") === alignment ? "bg-slate-100 text-[#27308F]" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {alignment}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative shrink-0">
        <button type="button" onClick={() => setOpenMenu(openMenu === "more" ? "" : "more")} className={`${compactButton(false)} w-[70px] px-2`} title="More controls">
          More ...
        </button>
        {openMenu === "more" && (
          <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-600 shadow-xl shadow-slate-950/10">
            <p className="px-2 py-1.5">Advanced controls are in the Inspector.</p>
          </div>
        )}
      </div>
    </>
  );

  const imageToolbar = selectedElement.type === "image" && (
    <>
      <button type="button" onClick={() => onReplaceImage(selectedElement.id)} className={`${EDITOR_UI.secondaryButton} h-9 shrink-0 px-3 text-xs`}>
        <FiImage className="h-4 w-4" />
        Replace
      </button>
      {separator}
      <div className="flex h-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {[
          ["fit", "Fit", (selectedElement.fit || "cover") === "fit" || selectedElement.fit === "contain"],
          ["cover", "Fill", (selectedElement.fit || "cover") !== "fit" && selectedElement.fit !== "contain"],
        ].map(([fit, label, active]) => (
          <button
            key={fit}
            type="button"
            onClick={() =>
              updateSelectedElement(
                { fit, cropX: 0.5, cropY: 0.5, cropScale: 1, cropEditing: false },
                { historyLabel: "Change image fit" },
              )
            }
            className={`px-3 text-xs font-bold transition duration-150 ${active ? "bg-[#27308F] text-white" : "text-slate-700 hover:bg-slate-50 hover:text-[#27308F]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          updateSelectedElement(
            selectedElement.cropEditing
              ? { cropEditing: false }
              : { fit: "cover", cropEditing: true, cropX: selectedElement.cropX ?? 0.5, cropY: selectedElement.cropY ?? 0.5, cropScale: selectedElement.cropScale || 1 },
            { historyLabel: selectedElement.cropEditing ? "Finish image crop" : "Edit image crop" },
          )
        }
        className={compactButton(Boolean(selectedElement.cropEditing))}
      >
        {selectedElement.cropEditing ? "Done" : "Crop"}
      </button>
      {selectedElement.cropEditing && (
        <button
          type="button"
          onClick={() => updateSelectedElement({ cropX: 0.5, cropY: 0.5, cropScale: 1 }, { historyLabel: "Reset image crop" })}
          className={compactButton(false)}
        >
          Reset
        </button>
      )}
      {separator}
      <div className="relative shrink-0">
        <button type="button" onClick={() => setOpenMenu(openMenu === "flip" ? "" : "flip")} className={compactButton(false)}>
          Flip v
        </button>
        {openMenu === "flip" && (
          <div className="absolute right-0 top-10 z-30 w-40 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10">
            {[
              ["Flip Horizontal", () => updateSelectedElement({ flipX: !selectedElement.flipX }, { historyLabel: "Flip image horizontally" })],
              ["Flip Vertical", () => updateSelectedElement({ flipY: !selectedElement.flipY }, { historyLabel: "Flip image vertically" })],
            ].map(([label, action]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  action();
                  closeMenu();
                }}
                className="block h-8 w-full rounded-lg px-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className={compactButton(false)} title="Image adjustments are available in the Inspector">
        Adjust
      </button>
      {separator}
      {moreButton}
    </>
  );

  const shapeToolbar = selectedElement.type === "shape" && (
    <>
      <label className="flex h-9 w-[78px] min-w-[78px] max-w-[78px] flex-none items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition duration-150 hover:border-[#27308F]/45 hover:bg-slate-50">
        Fill
        <input
          type="color"
          value={selectedElement.fill || "#e2e8f0"}
          onChange={(event) => updateSelectedElement({ fill: event.target.value }, { historyLabel: "Change shape fill", mergeKey: `${selectedElement.id}:fill` })}
          className="h-6 w-8 rounded border border-slate-200 bg-white"
        />
      </label>
      <label className="flex h-9 w-[90px] min-w-[90px] max-w-[90px] flex-none items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition duration-150 hover:border-[#27308F]/45 hover:bg-slate-50">
        Stroke
        <input
          type="color"
          value={selectedElement.stroke || "#0f172a"}
          onChange={(event) => updateSelectedElement({ stroke: event.target.value, borderColor: event.target.value }, { historyLabel: "Change shape stroke", mergeKey: `${selectedElement.id}:stroke` })}
          className="h-6 w-8 rounded border border-slate-200 bg-white"
        />
      </label>
      <label className="flex h-9 w-[96px] min-w-[96px] max-w-[96px] flex-none items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition duration-150 focus-within:border-[#27308F] focus-within:ring-2 focus-within:ring-[#27308F]/15 hover:border-[#27308F]/45 hover:bg-slate-50">
        Border
        <input
          type="number"
          min="0"
          max="28"
          value={selectedElement.strokeWidth ?? selectedElement.borderWidth ?? 0}
          onChange={(event) => {
            const strokeWidth = Number(event.target.value);
            updateSelectedElement({ strokeWidth, borderWidth: strokeWidth }, { historyLabel: "Change shape stroke width", mergeKey: `${selectedElement.id}:strokeWidth` });
          }}
          className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold text-slate-800 outline-none"
          title="Stroke width"
        />
      </label>
      <label className="flex h-9 w-[132px] min-w-[132px] max-w-[132px] flex-none items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition duration-150 hover:border-[#27308F]/45 hover:bg-slate-50">
        Opacity
        <input
          type="range"
          min={OPACITY_MIN}
          max={OPACITY_MAX}
          step="0.05"
          value={selectedElement.opacity ?? 1}
          onChange={(event) => updateSelectedElement({ opacity: Number(event.target.value) }, { historyLabel: "Change shape opacity", mergeKey: `${selectedElement.id}:opacity` })}
          className="w-14 accent-[#27308F]"
        />
      </label>
      {moreButton}
    </>
  );
  const generatedToolToolbar = ["qr", "barcode", "table"].includes(selectedElement.type) && (
    <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
      <span className="rounded-md bg-slate-100 px-2.5 py-1 font-bold capitalize text-slate-700">{selectedElement.type}</span>
      <span className="truncate">Use the Inspector for generated tool controls.</span>
    </div>
  );

  return (
    <div className="relative flex h-11 min-w-0 items-center overflow-visible border-b border-slate-200 bg-white px-3 font-sans shadow-sm shadow-slate-950/[0.015]">
      <div className="flex w-full min-w-0 items-center gap-2 overflow-visible">
        {textToolbar}
        {imageToolbar}
        {shapeToolbar}
        {generatedToolToolbar}
      </div>
    </div>
  );
}

function LayersPanel({ design, selectedId, onSelectLayer }) {
  const layers = getVisualLayers(design);

  return (
    <section className="space-y-4">
      <PanelHeader title="Layers" description="Select and inspect the visual stack." icon={FiLayers} />
      <div className="space-y-2 overflow-y-auto pr-1">
        {layers.map((layer) => {
          const selectable = layer.kind === "element" && isElementInteractive(layer.element);
          const selected = selectedId === layer.id;

          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => selectable && onSelectLayer(layer.id)}
              disabled={!selectable}
            className={`group flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20 ${
              selected
                  ? "border-[#27308F]/35 bg-slate-100 text-slate-950 shadow-sm"
                  : selectable
                    ? "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/30 hover:bg-slate-50 hover:shadow-md hover:shadow-slate-950/[0.04]"
                    : "border-slate-100 bg-slate-50/70 text-slate-400"
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${selected ? "bg-white text-[#27308F]" : "bg-slate-50 text-slate-500"}`}>
                {layer.locked ? <FiLock className="h-3.5 w-3.5" /> : <FiLayers className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{getHumanLayerLabel(layer)}</span>
                <span className="block text-xs font-medium text-slate-400">{layer.locked ? "Locked" : getLayerTypeLabel(layer)}</span>
              </span>
              <span className="text-[11px] font-black text-slate-300 opacity-0 transition group-hover:opacity-100">{layer.kind === "element" ? "..." : ""}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BrandKitPanel({ brandKit, onBrandFieldChange, onBrandLogoUpload, onAddBrandField }) {
  const businessFields = [
    { path: ["business", "name"], label: "Business Name", icon: FiBriefcase, insertId: "businessName" },
    { path: ["business", "phone"], label: "Phone", icon: FiPhone, insertId: "phone" },
    { path: ["business", "email"], label: "Email", icon: FiMail, insertId: "email" },
    { path: ["business", "website"], label: "Website", icon: FiBriefcase, insertId: "website" },
  ];
  const colorFields = [
    { path: ["colors", "primary"], label: "Primary" },
    { path: ["colors", "secondary"], label: "Secondary" },
    { path: ["colors", "accent"], label: "Accent" },
  ];

  return (
    <section className="space-y-4">
      <PanelHeader title="Brand Kit" description="Keep your business identity ready to insert." icon={FiBriefcase} />
      <div className={EDITOR_UI.propertyCard}>
        <p className={EDITOR_UI.sectionLabel}>Logo</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-400 shadow-inner shadow-slate-950/[0.04]">
            {brandKit.business.logo ? <img src={brandKit.business.logo} alt="" className="h-full w-full object-cover" /> : "Logo"}
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onBrandLogoUpload}
              className={`${EDITOR_UI.secondaryButton} h-9 px-3 text-xs`}
            >
              <FiUpload className="h-4 w-4" />
              Change
            </button>
            <button
              type="button"
              onClick={() => onAddBrandField("logo")}
              disabled={!brandKit.business.logo}
              className={`${EDITOR_UI.primaryButton} h-9 px-3 text-xs`}
            >
              <FiPlus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </div>

      <div className={EDITOR_UI.propertyCard}>
        <p className={EDITOR_UI.sectionLabel}>Business Details</p>
        <div className="mt-3 grid gap-2">
          {businessFields.map(({ path, label, icon: Icon, insertId }) => (
            <label key={path.join(".")}>
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
              <div className="grid grid-cols-[minmax(0,1fr)_38px] gap-2">
                <input
                  value={getValueAtPath(brandKit, path) || ""}
                  onChange={(event) =>
                    onBrandFieldChange(path, event.target.value, {
                      historyLabel: `Change ${label.toLowerCase()}`,
                      mergeKey: `brand:${path.join(".")}`,
                    })
                  }
                  className={`${EDITOR_UI.field} h-9 min-w-0 px-3`}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    onAddBrandField(insertId);
                  }}
                  disabled={!getValueAtPath(brandKit, path)}
                  title={`Add ${label} to design`}
                  className={`${EDITOR_UI.primaryButton} grid h-9 place-items-center p-0`}
                >
                  <FiPlus className="h-4 w-4" />
                </button>
              </div>
            </label>
          ))}
          <label>
            <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500">
              <FiMapPin className="h-3.5 w-3.5" />
              Address
            </span>
            <div className="grid grid-cols-[minmax(0,1fr)_38px] gap-2">
              <textarea
                value={brandKit.business.address || ""}
                onChange={(event) =>
                  onBrandFieldChange(["business", "address"], event.target.value, {
                    historyLabel: "Change address",
                    mergeKey: "brand:business.address",
                  })
                }
                className={`${EDITOR_UI.field} min-h-16 min-w-0 resize-y px-3 py-2`}
              />
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onAddBrandField("address");
                }}
                disabled={!brandKit.business.address}
                title="Add Address to design"
                className={`${EDITOR_UI.primaryButton} grid h-9 place-items-center p-0`}
              >
                <FiPlus className="h-4 w-4" />
              </button>
            </div>
          </label>
        </div>
      </div>

      <div className={EDITOR_UI.propertyCard}>
        <p className={EDITOR_UI.sectionLabel}>Brand Colors</p>
        <div className="mt-3 grid gap-2">
          {colorFields.map(({ path, label }) => {
            const value = getValueAtPath(brandKit, path) || "#000000";
            return (
              <label key={path.join(".")} className="grid grid-cols-[76px_42px_minmax(0,1fr)] items-center gap-2 text-xs font-bold text-slate-500">
                <span>{label}</span>
                <input
                  type="color"
                  value={value}
                  onChange={(event) =>
                    onBrandFieldChange(path, event.target.value, {
                      historyLabel: `Change ${label.toLowerCase()} brand color`,
                      mergeKey: `brand:${path.join(".")}`,
                    })
                  }
                  className="h-9 w-10 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
                />
                <input
                  value={value}
                  onChange={(event) =>
                    onBrandFieldChange(path, event.target.value, {
                      historyLabel: `Change ${label.toLowerCase()} brand color`,
                      mergeKey: `brand:${path.join(".")}`,
                    })
                  }
                  className={`${EDITOR_UI.field} h-9 min-w-0 px-2 text-xs`}
                />
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TextToolPanel({ onAddText }) {
  return (
    <section className="space-y-4">
      <PanelHeader title="Text" description="Add typography blocks to the design." icon={FiType} />
      <div className="grid gap-3">
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onAddText(preset.id)}
            className="group rounded-md border border-slate-200 bg-white p-3 text-left shadow-sm shadow-slate-950/[0.02] transition duration-150 hover:border-[#27308F]/35 hover:bg-slate-50 hover:shadow-md hover:shadow-indigo-950/[0.04] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{preset.label}</span>
            <span className={`mt-2 block text-slate-950 ${preset.id === "heading" ? "text-3xl font-black" : preset.id === "subheading" ? "text-xl font-extrabold" : "text-base font-semibold"}`}>
              Aa
            </span>
            <span className="mt-2 block text-xs font-medium text-slate-500">{preset.fontSize}px starter style</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MediaToolPanel({
  mediaItems,
  selectedImageId,
  onUploadImage,
  onAddMediaImage,
  onReplaceMediaImage,
}) {
  const uploadItems = useMemo(() => mediaItems.filter((item) => item.source === "upload" || !item.source), [mediaItems]);

  const renderUploadCard = (item) => (
    <article
      key={item.id}
      className="group overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.02] transition duration-150 hover:border-[#27308F]/35 hover:shadow-md hover:shadow-slate-950/[0.05]"
    >
      <button type="button" onClick={() => onAddMediaImage(item.id)} className="block aspect-square w-full overflow-hidden bg-slate-100" title={`Add ${item.name} to design`}>
        <img src={item.thumbnailSrc || item.src} alt={item.name} loading="lazy" className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]" />
      </button>
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-800">{item.name}</p>
          <p className="text-[11px] font-medium text-slate-400">My upload</p>
        </div>
        <button
          type="button"
          onClick={() => onReplaceMediaImage(item.id)}
          disabled={!selectedImageId}
          className={`${EDITOR_UI.secondaryButton} h-8 shrink-0 px-2 text-[11px]`}
          title={selectedImageId ? "Replace selected image" : "Select an editable image to replace"}
        >
          Replace
        </button>
      </div>
    </article>
  );

  return (
    <section className="space-y-4">
      <PanelHeader title="Media" description="Upload and reuse local session images." icon={FiUpload} />

      <button
        type="button"
        onClick={onUploadImage}
        className="group flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[#27308F]/35 bg-slate-50 px-4 text-sm font-bold text-[#27308F] shadow-sm shadow-slate-950/[0.02] transition duration-150 hover:border-[#27308F] hover:bg-white hover:shadow-md hover:shadow-indigo-950/[0.05] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20"
      >
        <span className="grid h-9 w-9 place-items-center rounded-md bg-white text-[#27308F] shadow-sm transition duration-150 group-hover:scale-105">
          <FiUpload className="h-5 w-5" />
        </span>
        Upload Image
        <span className="text-xs font-medium text-slate-500">PNG, JPG or WebP</span>
      </button>

      <div className="space-y-2">
        <p className={EDITOR_UI.sectionLabel}>My Uploads</p>
        {uploadItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {uploadItems.map(renderUploadCard)}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center shadow-sm shadow-slate-950/[0.025]">
            <FiImage className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-xs font-bold text-slate-500">Uploaded images will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function LibraryToolPanel({
  selectedImageId,
  onUseStockImage,
  onAddSticker,
}) {
  const [activeTab, setActiveTab] = useState("stock");
  const [stockProvider, setStockProvider] = useState("pexels");
  const [stockQuery, setStockQuery] = useState(DEFAULT_STOCK_QUERY);
  const [backgroundQuery, setBackgroundQuery] = useState(DEFAULT_BACKGROUND_QUERY);
  const [stickerQuery, setStickerQuery] = useState("");
  const [stockResults, setStockResults] = useState([]);
  const [backgroundResults, setBackgroundResults] = useState([]);
  const [stockState, setStockState] = useState(INITIAL_STOCK_SEARCH_STATE);
  const [backgroundState, setBackgroundState] = useState(INITIAL_STOCK_SEARCH_STATE);
  const activeProvider = activeTab === "stock" ? stockProvider : "pexels";
  const providerStatus = getStockMediaProviderStatus(activeProvider);

  const resetSearchForTab = useCallback((tab) => {
    if (tab === "stock") {
      setStockResults([]);
      setStockState(INITIAL_STOCK_SEARCH_STATE);
    }

    if (tab === "backgrounds") {
      setBackgroundResults([]);
      setBackgroundState(INITIAL_STOCK_SEARCH_STATE);
    }
  }, []);

  useEffect(() => {
    setStockResults([]);
    setBackgroundResults([]);
    setStockState(INITIAL_STOCK_SEARCH_STATE);
    setBackgroundState(INITIAL_STOCK_SEARCH_STATE);
  }, [activeProvider]);

  const runSearch = useCallback(
    async (category, { append = false } = {}) => {
      const isBackgrounds = category === "backgrounds";
      const query = isBackgrounds ? backgroundQuery : stockQuery;
      const setResults = isBackgrounds ? setBackgroundResults : setStockResults;
      const setState = isBackgrounds ? setBackgroundState : setStockState;
      const currentState = isBackgrounds ? backgroundState : stockState;
      const provider = isBackgrounds ? "pexels" : stockProvider;
      const searchProviderStatus = getStockMediaProviderStatus(provider);
      const page = append ? currentState.page + 1 : 1;

      setState((previous) => ({
        ...previous,
        loading: !append,
        loadingMore: append,
        error: "",
        searched: true,
        query,
        provider,
      }));
      try {
        const response = await searchImages(query, {
          provider,
          category: isBackgrounds ? "backgrounds" : "stock",
          orientation: isBackgrounds ? "landscape" : "square",
          page,
          perPage: STOCK_MEDIA_PAGE_SIZE,
        });
        setResults((previous) => (append ? mergeUniqueAssets(previous, response.results) : response.results));
        setState({
          loading: false,
          loadingMore: false,
          error: "",
          searched: true,
          page: response.page,
          hasMore: response.hasMore,
          totalResults: response.totalResults,
          provider: response.provider,
          query,
        });
      } catch (error) {
        if (!append) setResults([]);
        setState((previous) => ({
          ...previous,
          loading: false,
          loadingMore: false,
          error: error.message || "Unable to search stock media.",
          searched: true,
          query,
          provider: searchProviderStatus.provider,
        }));
      }
    },
    [backgroundQuery, backgroundState, stockProvider, stockQuery, stockState],
  );

  const renderLibraryCard = (item, category) => {
    const isBackgrounds = category === "backgrounds";
    const title = item.alt || (isBackgrounds ? "Background" : "Stock image");
    const subtitle = item.source === "demo" ? "Demo media" : item.attribution || item.author || item.source;
    const thumbnailUrl = item.thumbnailUrl || item.previewUrl || item.fullUrl;

    return (
      <article
        key={item.id}
        className="group overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.02] transition duration-150 hover:-translate-y-0.5 hover:border-[#27308F]/35 hover:shadow-md hover:shadow-slate-950/[0.06]"
      >
        <button
          type="button"
          onClick={() => onUseStockImage(item, isBackgrounds ? "background" : "insert")}
          className="relative block aspect-square w-full overflow-hidden bg-slate-100"
          title={isBackgrounds ? `Use ${title} as background` : `Add ${title} to design`}
        >
        <img src={thumbnailUrl} alt={title} loading="lazy" className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]" />
          {subtitle && (
            <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded bg-white/90 px-1.5 py-1 text-left text-[10px] font-bold text-slate-600 opacity-0 shadow-sm transition duration-150 group-hover:opacity-100">
              {subtitle}
            </span>
          )}
        </button>
        {!isBackgrounds && (
          <button
            type="button"
            onClick={() => onUseStockImage(item, "replace")}
            disabled={!selectedImageId}
            className={`${EDITOR_UI.secondaryButton} m-2 h-8 w-[calc(100%-1rem)] px-2 text-[11px]`}
            title={selectedImageId ? "Replace selected image" : "Select an editable image to replace"}
          >
            Replace selected
          </button>
        )}
      </article>
    );
  };

  const renderStockGrid = (items, category) => {
    const state = category === "backgrounds" ? backgroundState : stockState;
    if (state.loading) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs font-medium text-slate-500">
          Searching media...
        </div>
      );
    }

    if (state.error && items.length === 0) {
      return (
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          {state.error}
        </div>
      );
    }

    if (state.searched && items.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs font-medium text-slate-500">
          No media found. Try business, restaurant, clothing, electrical or festival.
        </div>
      );
    }

    if (!state.searched) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs font-medium text-slate-500">
          Search to load {category === "backgrounds" ? "backgrounds" : "stock images"}.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {state.error && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {state.error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => renderLibraryCard(item, category))}
        </div>
        {state.hasMore && (
          <button
            type="button"
            onClick={() => runSearch(category, { append: true })}
            disabled={state.loadingMore}
            className={`${EDITOR_UI.secondaryButton} h-9 w-full px-3 text-xs`}
          >
            {state.loadingMore ? "Loading..." : "Load More"}
          </button>
        )}
      </div>
    );
  };

  const stockLikeTab = activeTab === "stock" || activeTab === "backgrounds";
  const activeQuery = activeTab === "backgrounds" ? backgroundQuery : stockQuery;
  const setActiveQuery = activeTab === "backgrounds" ? setBackgroundQuery : setStockQuery;
  const activeResults = activeTab === "backgrounds" ? backgroundResults : stockResults;
  const handleTabChange = (tab) => {
    if (tab !== activeTab) resetSearchForTab(tab);
    setActiveTab(tab);
  };
  const handleQueryChange = (value) => {
    setActiveQuery(value);
    resetSearchForTab(activeTab);
  };
  const handleProviderChange = (provider) => {
    if (provider === stockProvider) return;
    setStockProvider(provider);
    setStockResults([]);
    setStockState(INITIAL_STOCK_SEARCH_STATE);
  };

  return (
    <section className="space-y-4">
      <PanelHeader title="Library" description="Search reusable online assets." icon={FiImage} />

      <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm shadow-slate-950/[0.025]">
        {LIBRARY_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`h-9 rounded-md px-2 text-[11px] font-bold transition duration-150 ${
                active ? "bg-[#27308F] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {stockLikeTab && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/[0.025]">
            {activeTab === "stock" && (
              <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                {STOCK_MEDIA_PROVIDERS.map((provider) => {
                  const active = stockProvider === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => handleProviderChange(provider.id)}
                      className={`h-8 rounded-md px-2 text-[11px] font-bold transition duration-150 ${
                        active ? "bg-[#27308F] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950"
                      }`}
                    >
                      {provider.label}
                    </button>
                  );
                })}
              </div>
            )}
            <form
              className="grid grid-cols-[minmax(0,1fr)_38px] gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch(activeTab);
              }}
            >
              <input
                value={activeQuery}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder={activeTab === "backgrounds" ? "Search backgrounds" : "Search stock images"}
                className={`${EDITOR_UI.field} h-9 min-w-0 px-3 text-xs`}
              />
              <button type="submit" className={`${EDITOR_UI.primaryButton} grid h-9 place-items-center p-0`} title="Search media">
                <FiSearch className="h-4 w-4" />
              </button>
            </form>
            <p className={`mt-2 text-[11px] font-medium leading-4 ${providerStatus.live ? "text-emerald-700" : "text-slate-500"}`}>
              {providerStatus.message}
            </p>
          </div>

          {renderStockGrid(activeResults, activeTab)}
        </>
      )}

      {activeTab === "stickers" && (
        <div className="space-y-3">
          <div>
            <PanelHeader title="Stickers" description="Add a movable sticker to your design." icon={FiStar} />
            <input
              value={stickerQuery}
              onChange={(event) => setStickerQuery(event.target.value)}
              placeholder="Search stickers"
              className={`${EDITOR_UI.field} mt-3 h-9 px-3 text-xs`}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {STICKER_LIBRARY.filter((sticker) => `${sticker.label} ${sticker.id}`.toLowerCase().includes(stickerQuery.trim().toLowerCase())).map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                onClick={() => onAddSticker(sticker)}
                className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-md border border-slate-200 bg-white p-2 text-center shadow-sm transition hover:border-[#27308F]/40 hover:bg-slate-50"
                title={`Add ${sticker.label} sticker`}
              >
                <span className="text-3xl leading-none" aria-hidden="true">{sticker.glyph}</span>
                <span className="text-[10px] font-bold text-slate-600">{sticker.label}</span>
              </button>
            ))}
          </div>
          {!STICKER_LIBRARY.some((sticker) => `${sticker.label} ${sticker.id}`.toLowerCase().includes(stickerQuery.trim().toLowerCase())) && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs font-medium text-slate-500">No stickers match that search.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ElementsToolPanel({ onAddShape }) {
  return (
    <section className="space-y-4">
      <PanelHeader title="Elements" description="Add basic vector shapes." icon={FiGrid} />
      <div className="grid grid-cols-2 gap-2">
        {SHAPE_PRESETS.map((shape) => {
          const Icon = shape.icon;
          return (
            <button
              key={shape.id}
              type="button"
              onClick={() => onAddShape(shape.id)}
              className="group flex h-20 flex-col items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm shadow-slate-950/[0.02] transition duration-150 hover:border-[#27308F]/35 hover:bg-slate-50 hover:shadow-md hover:shadow-indigo-950/[0.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27308F]/20"
            >
              <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-50 text-[#27308F] transition group-hover:bg-slate-100">
                <Icon className="h-5 w-5" />
              </span>
              {shape.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PanelHeader({ title, description, icon: Icon }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-200/80 pb-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-[#27308F] shadow-sm shadow-slate-950/[0.02]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
        <p className="mt-0.5 text-xs font-medium leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function EditorToolRail({ activeTool, onToolChange }) {
  const tools = [
    { id: "templates", label: "Templates", icon: FiGrid },
    { id: "text", label: "Text", icon: FiType },
    { id: "media", label: "Media", icon: FiUpload },
    { id: "library", label: "Library", icon: FiImage },
    { id: "elements", label: "Elements", icon: FiSquare },
    { id: "tools", label: "Tools", icon: FiSettings },
    { id: "frames", label: "Frames", icon: FiSquare },
    { id: "brand", label: "Brand", icon: FiBriefcase },
    { id: "layers", label: "Layers", icon: FiLayers },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-[#11164C] bg-[#14185D] p-1.5 font-sans shadow-xl shadow-indigo-950/10 lg:w-[72px] lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const active = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onToolChange(tool.id)}
            title={tool.label}
            className={`group relative flex h-[52px] min-w-16 flex-col items-center justify-center gap-1 rounded-md border text-[10.5px] font-bold transition duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 lg:min-w-0 ${
              active
                ? "border-white/10 bg-white/[0.12] text-white shadow-sm shadow-indigo-950/20"
                : "border-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <span className={`absolute left-0 top-3 hidden h-7 w-1 rounded-r-full bg-[#F97316] transition lg:block ${active ? "opacity-100" : "opacity-0"}`} />
            <Icon className={`h-[18px] w-[18px] transition ${active ? "text-white" : "text-white/75 group-hover:text-white"}`} />
            {tool.label}
          </button>
        );
      })}
    </nav>
  );
}

function TemplatesToolPanel({ design }) {
  return (
    <section className="space-y-4">
      <PanelHeader title="Template" description="Current design foundation." icon={FiGrid} />
      <div className={EDITOR_UI.propertyCard}>
        <p className="text-sm font-bold text-slate-900">{design.name}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
          {design.width} x {design.height}px · {design.templateType}
        </p>
      </div>
      <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-xs font-medium leading-5 text-slate-500 shadow-sm shadow-slate-950/[0.025]">
        Template switching and marketplace browsing will stay in discovery. This panel keeps the editor context visible.
      </p>
    </section>
  );
}

function FramesToolPanel({ onAddFrame }) {
  return (
    <section className="space-y-4">
      <PanelHeader title="Frames" description="Add a branded frame to your design." icon={FiSquare} />
      <p className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs font-medium leading-5 text-blue-800">
        Frames use the logo and business details saved in Brand. Set them there before adding a frame.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FRAME_PRESETS.map((frame) => (
          <button
            key={frame.id}
            type="button"
            onClick={() => onAddFrame(frame.id)}
            className="flex h-24 flex-col items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-700 transition hover:border-[#27308F]/40 hover:bg-slate-50"
          >
            <span className={`grid h-11 w-14 place-items-center border-[3px] border-[#27308F] ${frame.id === "rounded" ? "rounded-lg" : ""} ${frame.id === "dashed" ? "border-dashed" : ""}`}>
              {frame.id === "double" && <span className="h-7 w-10 border-2 border-[#27308F]" />}
            </span>
            {frame.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function QuickPersonalizePanel({
  design,
  brandKit,
  onBrandFieldChange,
  onBrandLogoUpload,
  onAddQuickPersonalizeElement,
  onQuickPersonalizeElementChange,
}) {
  const logoElement = getQuickPersonalizeElement(design, "logo");
  const businessNameElement = getQuickPersonalizeElement(design, "businessName");
  const headingElement = getQuickPersonalizeElement(design, "heading");
  const [headingDraft, setHeadingDraft] = useState(design.quickPersonalize?.headingDefault || "Add your heading");
  const headingValue = headingElement?.text ?? headingDraft;

  const handleHeadingChange = (value) => {
    if (headingElement) {
      onQuickPersonalizeElementChange(
        headingElement.id,
        { text: value },
        { historyLabel: "Edit quick heading", mergeKey: `${headingElement.id}:text` },
      );
      return;
    }

    setHeadingDraft(value);
  };

  return (
    <section className="space-y-4">
      <PanelHeader title="Personalize" description="Quick edit the unlocked logo, business name and heading." icon={FiBriefcase} />

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
        Poster artwork is locked. Personalization layers remain movable, resizable and editable on the canvas.
      </div>

      <div className={EDITOR_UI.propertyCard}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-950">Business Logo</h3>
            <p className="text-xs font-medium text-slate-500">{logoElement ? "Logo layer is on the design." : "Add a logo overlay layer."}</p>
          </div>
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
            {brandKit.business.logo ? <img src={brandKit.business.logo} alt="Brand logo" className="h-full w-full object-contain" /> : "Logo"}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onBrandLogoUpload} className={`${EDITOR_UI.secondaryButton} h-9 px-2 text-xs`}>
            <FiUpload className="h-4 w-4" />
            Change
          </button>
          <button
            type="button"
            onClick={() => onAddQuickPersonalizeElement("logo")}
            disabled={Boolean(logoElement)}
            className={`${EDITOR_UI.primaryButton} h-9 px-2 text-xs`}
          >
            <FiPlus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      <div className={EDITOR_UI.propertyCard}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-950">Business Name</h3>
            <p className="text-xs font-medium text-slate-500">Linked to Brand Kit.</p>
          </div>
          {!businessNameElement && (
            <button type="button" onClick={() => onAddQuickPersonalizeElement("businessName")} className={`${EDITOR_UI.primaryButton} h-8 px-2 text-xs`}>
              <FiPlus className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </div>
        <input
          value={brandKit.business.name}
          onChange={(event) =>
            onBrandFieldChange(["business", "name"], event.target.value, {
              historyLabel: "Change business name",
              mergeKey: "brand:businessName",
            })
          }
          className={`${EDITOR_UI.field} h-10 px-3`}
          placeholder="Business name"
        />
      </div>

      <div className={EDITOR_UI.propertyCard}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-950">Custom Heading</h3>
            <p className="text-xs font-medium text-slate-500">{headingElement ? "Editable poster heading." : "Add a heading overlay layer."}</p>
          </div>
          {!headingElement && (
            <button
              type="button"
              onClick={() => onAddQuickPersonalizeElement("heading", { text: headingDraft })}
              className={`${EDITOR_UI.primaryButton} h-8 px-2 text-xs`}
            >
              <FiPlus className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </div>
        <textarea
          value={headingValue}
          onChange={(event) => handleHeadingChange(event.target.value)}
          className={`${EDITOR_UI.field} min-h-20 resize-y px-3 py-2`}
          placeholder="Ganesh Chaturthi Special"
        />
      </div>
    </section>
  );
}

function ToolsPanel({ onAddQr, onAddBarcode, onAddTable }) {
  const [qrValue, setQrValue] = useState("https://ledgerly.example");
  const [qrForeground, setQrForeground] = useState("#0f172a");
  const [qrBackground, setQrBackground] = useState("#ffffff");
  const [qrPreview, setQrPreview] = useState("");
  const [qrError, setQrError] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("LDG10001");
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const encodedBarcode = useMemo(() => getCode128Bars(barcodeValue), [barcodeValue]);

  useEffect(() => {
    let cancelled = false;
    createQrDataUrl(qrValue, { foreground: qrForeground, background: qrBackground })
      .then((src) => {
        if (!cancelled) {
          setQrPreview(src);
          setQrError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrPreview("");
          setQrError("Unable to preview QR code.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrValue, qrForeground, qrBackground]);

  const barcodeBars = encodedBarcode?.bars || [];
  return (
    <section className="space-y-4">
      <PanelHeader title="Tools" description="Add generated utility elements." icon={FiSettings} />

      <div className={EDITOR_UI.propertyCard}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-50 text-[#27308F]">
            <FiGrid className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-950">QR Code</h3>
            <p className="text-xs font-medium text-slate-500">Encode a URL or text value.</p>
          </div>
        </div>
        <div className="mt-3 grid place-items-center rounded-md border border-slate-200 bg-slate-50 p-3">
          {qrPreview ? <img src={qrPreview} alt="QR preview" className="h-28 w-28 rounded bg-white object-contain" /> : <p className="py-10 text-xs font-bold text-slate-400">{qrError || "Preview"}</p>}
        </div>
        <label className="mt-3 block">
          <span className={EDITOR_UI.sectionLabel}>Value</span>
          <textarea
            value={qrValue}
            onChange={(event) => setQrValue(event.target.value)}
            className={`${EDITOR_UI.field} min-h-16 px-3 py-2`}
            placeholder="https://example.com"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label>
            <span className={EDITOR_UI.sectionLabel}>Foreground</span>
            <input type="color" value={qrForeground} onChange={(event) => setQrForeground(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white p-1" />
          </label>
          <label>
            <span className={EDITOR_UI.sectionLabel}>Background</span>
            <input type="color" value={qrBackground} onChange={(event) => setQrBackground(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white p-1" />
          </label>
        </div>
        <button
          type="button"
          onClick={() => onAddQr({ value: qrValue, foreground: qrForeground, background: qrBackground, src: qrPreview })}
          disabled={!qrPreview}
          className={`${EDITOR_UI.primaryButton} mt-3 h-10 w-full px-3 text-sm`}
        >
          <FiPlus className="h-4 w-4" />
          Add QR Code
        </button>
      </div>

      <div className={EDITOR_UI.propertyCard}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-50 text-[#27308F]">
            <FiMinus className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-950">Barcode</h3>
            <p className="text-xs font-medium text-slate-500">Code 128 label barcode.</p>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
          {encodedBarcode ? (
            <svg viewBox={`0 0 ${encodedBarcode.totalWidth} 52`} className="h-16 w-full text-slate-950" aria-label={`CODE128 barcode for ${encodedBarcode.text}`}>
              {barcodeBars.map((bar) => (
                <rect key={`${bar.x}-${bar.width}`} x={bar.x} y="5" width={bar.width} height="34" fill="currentColor" />
              ))}
              <text x={encodedBarcode.totalWidth / 2} y="49" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
                {encodedBarcode.text}
              </text>
            </svg>
          ) : (
            <p className="py-5 text-center text-xs font-bold text-slate-400">Enter a value</p>
          )}
        </div>
        <label className="mt-3 block">
          <span className={EDITOR_UI.sectionLabel}>Value</span>
          <input value={barcodeValue} onChange={(event) => setBarcodeValue(event.target.value)} className={`${EDITOR_UI.field} h-10 px-3`} placeholder="Item code" />
        </label>
        <button
          type="button"
          onClick={() => onAddBarcode(barcodeValue)}
          disabled={!encodedBarcode}
          className={`${EDITOR_UI.primaryButton} mt-3 h-10 w-full px-3 text-sm`}
        >
          <FiPlus className="h-4 w-4" />
          Add Barcode
        </button>
      </div>

      <div className={EDITOR_UI.propertyCard}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-50 text-[#27308F]">
            <FiGrid className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-950">Table</h3>
            <p className="text-xs font-medium text-slate-500">Simple visual grid.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label>
            <span className={EDITOR_UI.sectionLabel}>Rows (1–{TABLE_ROWS_MAX})</span>
            <input
              type="number"
              min={TABLE_ROWS_MIN}
              max={TABLE_ROWS_MAX}
              step="1"
              value={tableRows}
              onChange={(event) => setTableRows(clamp(Math.round(Number(event.target.value) || TABLE_ROWS_MIN), TABLE_ROWS_MIN, TABLE_ROWS_MAX))}
              className={`${EDITOR_UI.field} h-10 px-3`}
            />
          </label>
          <label>
            <span className={EDITOR_UI.sectionLabel}>Columns (1–{TABLE_COLUMNS_MAX})</span>
            <input
              type="number"
              min={TABLE_COLUMNS_MIN}
              max={TABLE_COLUMNS_MAX}
              step="1"
              value={tableColumns}
              onChange={(event) => setTableColumns(clamp(Math.round(Number(event.target.value) || TABLE_COLUMNS_MIN), TABLE_COLUMNS_MIN, TABLE_COLUMNS_MAX))}
              className={`${EDITOR_UI.field} h-10 px-3`}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => onAddTable({ rows: tableRows, columns: tableColumns })}
          className={`${EDITOR_UI.primaryButton} mt-3 h-10 w-full px-3 text-sm`}
        >
          <FiPlus className="h-4 w-4" />
          Add Table
        </button>
      </div>
    </section>
  );
}

function EditorToolsPanel({
  design,
  selectedId,
  selectedImageId,
  brandKit,
  mediaItems,
  activeTool,
  onAddText,
  onAddShape,
  onAddQr,
  onAddBarcode,
  onAddTable,
  onAddSticker,
  onAddFrame,
  onUploadImage,
  onAddMediaImage,
  onReplaceMediaImage,
  onUseStockImage,
  onSelectLayer,
  onBrandFieldChange,
  onBrandLogoUpload,
  onAddBrandField,
  onAddQuickPersonalizeElement,
  onQuickPersonalizeElementChange,
}) {
  const quickPersonalizeActive = isQuickPersonalizeDesign(design);
  const panelByTool = {
    templates: quickPersonalizeActive ? (
      <QuickPersonalizePanel
        design={design}
        brandKit={brandKit}
        onBrandFieldChange={onBrandFieldChange}
        onBrandLogoUpload={onBrandLogoUpload}
        onAddQuickPersonalizeElement={onAddQuickPersonalizeElement}
        onQuickPersonalizeElementChange={onQuickPersonalizeElementChange}
      />
    ) : (
      <TemplatesToolPanel design={design} />
    ),
    text: <TextToolPanel onAddText={onAddText} />,
    media: (
      <MediaToolPanel
        mediaItems={mediaItems}
        selectedImageId={selectedImageId}
        onUploadImage={onUploadImage}
        onAddMediaImage={onAddMediaImage}
        onReplaceMediaImage={onReplaceMediaImage}
      />
    ),
    library: (
      <LibraryToolPanel
        selectedImageId={selectedImageId}
        onUseStockImage={onUseStockImage}
        onAddSticker={onAddSticker}
      />
    ),
    elements: <ElementsToolPanel onAddShape={onAddShape} />,
    tools: <ToolsPanel onAddQr={onAddQr} onAddBarcode={onAddBarcode} onAddTable={onAddTable} />,
    frames: <FramesToolPanel onAddFrame={onAddFrame} />,
    brand: (
      <BrandKitPanel
        brandKit={brandKit}
        onBrandFieldChange={onBrandFieldChange}
        onBrandLogoUpload={onBrandLogoUpload}
        onAddBrandField={onAddBrandField}
      />
    ),
    layers: <LayersPanel design={design} selectedId={selectedId} onSelectLayer={onSelectLayer} />,
  };

  return (
    <aside className="min-h-0 border-b border-slate-200 bg-white font-sans lg:w-[288px] lg:border-b-0 lg:border-r">
      <div key={activeTool} className="h-full overflow-y-auto p-3 transition duration-200 ease-out animate-in fade-in slide-in-from-left-2">
        {panelByTool[activeTool] || panelByTool.text}
      </div>
    </aside>
  );
}

function TextControls({ element, onTextChange }) {
  const canEditText = element?.type === "text" && isElementInteractive(element);
  if (!canEditText) return null;

  const updateTextElement = (updates, historyOptions = {}) => onTextChange(element.id, updates, historyOptions);
  const boldActive = Number(element.fontWeight) >= 700;
  const italicActive = element.fontStyle === "italic";
  const underlineActive = element.textDecoration === "underline";
  const alignments = ["left", "center", "right"];

  return (
    <div className={EDITOR_UI.propertyCard}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Text</h3>
          <p className="text-xs font-semibold text-slate-500">Editing {getElementLabel(element)}</p>
        </div>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#27308F]">Selected</span>
      </div>

      <label className="block">
        <span className={EDITOR_UI.sectionLabel}>Content</span>
        <textarea
          value={element.text || ""}
          onChange={(event) => updateTextElement({ text: event.target.value }, { historyLabel: "Edit text content", mergeKey: `${element.id}:text` })}
          className={`${EDITOR_UI.field} min-h-20 resize-y px-3 py-2`}
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Font</span>
          <select
            value={element.fontFamily || TEXT_FONT_OPTIONS[0]}
            onChange={(event) => updateTextElement({ fontFamily: event.target.value }, { historyLabel: "Change text font" })}
            className={`${EDITOR_UI.field} h-10 px-3`}
          >
            {TEXT_FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className={EDITOR_UI.sectionLabel}>Size</span>
          <input
            type="number"
            min={TEXT_SIZE_MIN}
            max={TEXT_SIZE_MAX}
            value={element.fontSize || 16}
            onChange={(event) => {
              const nextSize = clamp(Number(event.target.value) || TEXT_SIZE_MIN, TEXT_SIZE_MIN, TEXT_SIZE_MAX);
              updateTextElement({ fontSize: nextSize }, { historyLabel: "Change text size", mergeKey: `${element.id}:fontSize` });
            }}
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Bold", "B", boldActive, () => updateTextElement({ fontWeight: boldActive ? 400 : 800 }, { historyLabel: "Toggle bold" })],
          ["Italic", "I", italicActive, () => updateTextElement({ fontStyle: italicActive ? "normal" : "italic" }, { historyLabel: "Toggle italic" })],
          ["Underline", "U", underlineActive, () => updateTextElement({ textDecoration: underlineActive ? "" : "underline" }, { historyLabel: "Toggle underline" })],
        ].map(([label, glyph, active, onClick]) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            title={label}
            className={`h-10 rounded-lg border text-sm font-bold transition active:scale-[0.98] ${active ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/50 hover:bg-[#F1F5F9] hover:text-[#27308F]"}`}
          >
            <span className={label === "Italic" ? "italic" : label === "Underline" ? "underline" : ""}>{glyph}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[92px_1fr] lg:grid-cols-1">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Color</span>
          <input
            type="color"
            value={element.fill || "#0f172a"}
            onChange={(event) => updateTextElement({ fill: event.target.value }, { historyLabel: "Change text color", mergeKey: `${element.id}:fill` })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Hex</span>
          <input
            value={element.fill || "#0f172a"}
            onChange={(event) => updateTextElement({ fill: event.target.value }, { historyLabel: "Change text color", mergeKey: `${element.id}:fill` })}
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
      </div>

      <div className="mt-3">
        <span className={EDITOR_UI.sectionLabel}>Alignment</span>
        <div className="grid grid-cols-3 gap-2">
          {alignments.map((alignment) => {
            const active = (element.align || "left") === alignment;
            return (
              <button
                key={alignment}
                type="button"
                onClick={() => updateTextElement({ align: alignment }, { historyLabel: "Change text alignment" })}
                className={`h-9 rounded-lg border text-xs font-bold capitalize transition active:scale-[0.98] ${active ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#27308F]/50 hover:bg-[#F1F5F9] hover:text-[#27308F]"}`}
              >
                {alignment}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Opacity
          <span>{Math.round((element.opacity ?? 1) * 100)}%</span>
        </span>
        <input
          type="range"
          min={OPACITY_MIN}
          max={OPACITY_MAX}
          step="0.05"
          value={element.opacity ?? 1}
          onChange={(event) => updateTextElement({ opacity: Number(event.target.value) }, { historyLabel: "Change text opacity", mergeKey: `${element.id}:opacity` })}
          className="w-full accent-[#1A1F71]"
        />
      </label>
    </div>
  );
}

function ImageControls({ element, onImageChange, onReplaceImage }) {
  const canEditImage = element?.type === "image" && isElementInteractive(element);
  if (!canEditImage) return null;

  const updateImageElement = (updates, historyOptions = {}) => onImageChange(element.id, updates, historyOptions);
  const fillActive = (element.fit || "cover") !== "contain" && element.fit !== "fit";
  const borderWidth = element.borderWidth ?? element.strokeWidth ?? 0;
  const borderColor = element.borderColor || element.stroke || "#0f172a";

  return (
    <div className={EDITOR_UI.propertyCard}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Image</h3>
          <p className="text-xs font-semibold text-slate-500">Editing {getElementLabel(element)}</p>
        </div>
        <span className="rounded-full bg-[#ECFEFF] px-2.5 py-1 text-xs font-bold text-cyan-700">Selected</span>
      </div>

      <button
        type="button"
        onClick={() => onReplaceImage(element.id)}
        className={`${EDITOR_UI.primaryButton} h-10 w-full px-3 text-sm`}
      >
        <FiImage className="h-4 w-4" />
        Replace Image
      </button>

      <div className="mt-3">
        <span className={EDITOR_UI.sectionLabel}>Frame</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["fit", "Fit", !fillActive],
            ["cover", "Fill", fillActive],
          ].map(([fit, label, active]) => (
            <button
              key={fit}
              type="button"
              onClick={() =>
                updateImageElement(
                  { fit, cropX: 0.5, cropY: 0.5, cropScale: 1, cropEditing: false },
                  { historyLabel: "Change image fit" },
                )
              }
              className={`h-9 rounded-lg border text-xs font-bold transition active:scale-[0.98] ${active ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#27308F]/50 hover:bg-[#F1F5F9] hover:text-[#27308F]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 ${fillActive ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!fillActive}
            onClick={() => updateImageElement({ cropEditing: !element.cropEditing }, { historyLabel: element.cropEditing ? "Finish image crop" : "Edit image crop" })}
            className={`h-9 flex-1 rounded-lg border text-xs font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
              element.cropEditing ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/50 hover:bg-white hover:text-[#27308F]"
            }`}
          >
            {element.cropEditing ? "Done Crop" : "Edit Crop"}
          </button>
          <button
            type="button"
            disabled={!fillActive}
            onClick={() => updateImageElement({ cropX: 0.5, cropY: 0.5, cropScale: 1 }, { historyLabel: "Reset image crop" })}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#27308F]/50 hover:bg-white hover:text-[#27308F] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
            Crop Zoom
            <span>{Number(element.cropScale || 1).toFixed(2)}x</span>
          </span>
          <input
            type="range"
            min={IMAGE_CROP_SCALE_MIN}
            max={IMAGE_CROP_SCALE_MAX}
            step="0.05"
            value={element.cropScale || 1}
            disabled={!fillActive}
            onChange={(event) =>
              updateImageElement({ cropScale: Number(event.target.value) }, { historyLabel: "Zoom image crop", mergeKey: `${element.id}:cropScale` })
            }
            className="w-full accent-[#1A1F71] disabled:cursor-not-allowed"
          />
        </label>
      </div>

      <div className={`mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 ${fillActive ? "" : "opacity-60"}`}>
          <p className={`mb-2 ${EDITOR_UI.sectionLabel}`}>Image Position</p>
          {[
            ["cropX", "Horizontal", element.cropX ?? 0.5],
            ["cropY", "Vertical", element.cropY ?? 0.5],
          ].map(([key, label, value]) => (
            <label key={key} className="mt-2 block">
              <span className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
                {label}
                <span>{Math.round(value * 100)}%</span>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={value}
                disabled={!fillActive}
                onChange={(event) =>
                  updateImageElement({ [key]: Number(event.target.value) }, { historyLabel: "Reposition image crop", mergeKey: `${element.id}:${key}` })
                }
                className="w-full accent-[#1A1F71] disabled:cursor-not-allowed"
              />
            </label>
          ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[92px_1fr] lg:grid-cols-1">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Border</span>
          <input
            type="color"
            value={borderColor}
            onChange={(event) =>
              updateImageElement({ borderColor: event.target.value, stroke: event.target.value }, { historyLabel: "Change image border color", mergeKey: `${element.id}:borderColor` })
            }
            className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Border Hex</span>
          <input
            value={borderColor}
            onChange={(event) =>
              updateImageElement({ borderColor: event.target.value, stroke: event.target.value }, { historyLabel: "Change image border color", mergeKey: `${element.id}:borderColor` })
            }
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Border Width
          <span>{borderWidth}px</span>
        </span>
        <input
          type="range"
          min="0"
          max="32"
          step="1"
          value={borderWidth}
          onChange={(event) => {
            const nextWidth = Number(event.target.value);
            updateImageElement({ borderWidth: nextWidth, strokeWidth: nextWidth }, { historyLabel: "Change image border width", mergeKey: `${element.id}:borderWidth` });
          }}
          className="w-full accent-[#1A1F71]"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Corner Radius
          <span>{element.cornerRadius || 0}px</span>
        </span>
        <input
          type="range"
          min="0"
          max="120"
          step="1"
          value={element.cornerRadius || 0}
          onChange={(event) =>
            updateImageElement({ cornerRadius: Number(event.target.value) }, { historyLabel: "Change image corner radius", mergeKey: `${element.id}:cornerRadius` })
          }
          className="w-full accent-[#1A1F71]"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Opacity
          <span>{Math.round((element.opacity ?? 1) * 100)}%</span>
        </span>
        <input
          type="range"
          min={OPACITY_MIN}
          max={OPACITY_MAX}
          step="0.05"
          value={element.opacity ?? 1}
          onChange={(event) => updateImageElement({ opacity: Number(event.target.value) }, { historyLabel: "Change image opacity", mergeKey: `${element.id}:opacity` })}
          className="w-full accent-[#1A1F71]"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => updateImageElement({ flipX: !element.flipX }, { historyLabel: "Flip image horizontally" })}
          className={`h-10 rounded-lg border text-xs font-bold transition active:scale-[0.98] ${element.flipX ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/50 hover:bg-[#F1F5F9] hover:text-[#27308F]"}`}
        >
          Flip H
        </button>
        <button
          type="button"
          onClick={() => updateImageElement({ flipY: !element.flipY }, { historyLabel: "Flip image vertically" })}
          className={`h-10 rounded-lg border text-xs font-bold transition active:scale-[0.98] ${element.flipY ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/50 hover:bg-[#F1F5F9] hover:text-[#27308F]"}`}
        >
          Flip V
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <p className={`mb-2 ${EDITOR_UI.sectionLabel}`}>Adjustments</p>
        {[
          ["brightness", "Brightness", element.brightness ?? BRIGHTNESS_DEFAULT, 0, 2, 0.05],
          ["contrast", "Contrast", element.contrast ?? 0, -100, 100, 1],
          ["saturation", "Saturation", element.saturation ?? 0, -2, 2, 0.05],
          ["blurRadius", "Blur", element.blurRadius ?? 0, 0, 20, 0.5],
        ].map(([key, label, value, min, max, step]) => (
          <label key={key} className="mt-2 block">
            <span className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
              {label}
              <span>{Number(value).toFixed(step < 1 ? 2 : 0)}</span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(event) =>
                updateImageElement({ [key]: Number(event.target.value) }, { historyLabel: `Change image ${label.toLowerCase()}`, mergeKey: `${element.id}:${key}` })
              }
              className="w-full accent-[#1A1F71]"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() => updateImageElement({ grayscale: !element.grayscale }, { historyLabel: "Toggle image grayscale" })}
          className={`mt-3 h-9 w-full rounded-lg border text-xs font-bold transition active:scale-[0.98] ${element.grayscale ? "border-[#27308F] bg-[#27308F] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27308F]/50 hover:bg-white hover:text-[#27308F]"}`}
        >
          Grayscale
        </button>
      </div>

      <button
        type="button"
        onClick={() =>
          updateImageElement({
            opacity: 1,
            rotation: 0,
            flipX: false,
            flipY: false,
            cropX: 0.5,
            cropY: 0.5,
            cropScale: 1,
            cropEditing: false,
            brightness: BRIGHTNESS_DEFAULT,
            contrast: 0,
            saturation: 0,
            blurRadius: 0,
            grayscale: false,
          },
          { historyLabel: "Reset image transform" },
        )
        }
        className={`${EDITOR_UI.secondaryButton} mt-3 h-9 w-full px-3 text-xs`}
      >
        <FiRefreshCw className="h-4 w-4" />
        Reset Image Transform
      </button>
    </div>
  );
}

function ShapeControls({ element, onShapeChange }) {
  const canEditShape = element?.type === "shape" && isElementInteractive(element);
  if (!canEditShape) return null;

  const updateShapeElement = (updates, historyOptions = {}) => onShapeChange(element.id, updates, historyOptions);
  const isLine = element.shapeType === "line";

  return (
    <div className={EDITOR_UI.propertyCard}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Shape</h3>
          <p className="text-xs font-semibold text-slate-500">Editing {element.shapeType || "shape"}</p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Selected</span>
      </div>

      {!isLine && (
        <div className="grid gap-3 sm:grid-cols-[92px_1fr] lg:grid-cols-1">
          <label>
            <span className={EDITOR_UI.sectionLabel}>Fill</span>
            <input
              type="color"
              value={element.fill || "#e2e8f0"}
              onChange={(event) => updateShapeElement({ fill: event.target.value }, { historyLabel: "Change shape fill", mergeKey: `${element.id}:fill` })}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
            />
          </label>
          <label>
            <span className={EDITOR_UI.sectionLabel}>Fill Hex</span>
            <input
              value={element.fill || "#e2e8f0"}
              onChange={(event) => updateShapeElement({ fill: event.target.value }, { historyLabel: "Change shape fill", mergeKey: `${element.id}:fill` })}
              className={`${EDITOR_UI.field} h-10 px-3`}
            />
          </label>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[92px_1fr] lg:grid-cols-1">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Stroke</span>
          <input
            type="color"
            value={element.stroke || "#0f172a"}
            onChange={(event) => updateShapeElement({ stroke: event.target.value, borderColor: event.target.value }, { historyLabel: "Change shape stroke", mergeKey: `${element.id}:stroke` })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Stroke Hex</span>
          <input
            value={element.stroke || "#0f172a"}
            onChange={(event) => updateShapeElement({ stroke: event.target.value, borderColor: event.target.value }, { historyLabel: "Change shape stroke", mergeKey: `${element.id}:stroke` })}
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Stroke Width
          <span>{element.strokeWidth ?? element.borderWidth ?? 0}px</span>
        </span>
        <input
          type="range"
          min="0"
          max="28"
          step="1"
          value={element.strokeWidth ?? element.borderWidth ?? 0}
          onChange={(event) => {
            const strokeWidth = Number(event.target.value);
            updateShapeElement({ strokeWidth, borderWidth: strokeWidth }, { historyLabel: "Change shape stroke width", mergeKey: `${element.id}:strokeWidth` });
          }}
          className="w-full accent-[#1A1F71]"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Opacity
          <span>{Math.round((element.opacity ?? 1) * 100)}%</span>
        </span>
        <input
          type="range"
          min={OPACITY_MIN}
          max={OPACITY_MAX}
          step="0.05"
          value={element.opacity ?? 1}
          onChange={(event) => updateShapeElement({ opacity: Number(event.target.value) }, { historyLabel: "Change shape opacity", mergeKey: `${element.id}:opacity` })}
          className="w-full accent-[#1A1F71]"
        />
      </label>
    </div>
  );
}

function QrControls({ element, onQrChange }) {
  const canEditQr = element?.type === "qr" && isElementInteractive(element);
  if (!canEditQr) return null;

  const updateQrElement = (updates, historyOptions = {}) => onQrChange(element.id, updates, historyOptions);
  const updateQrValue = async (updates, historyOptions = {}) => {
    const nextValue = updates.value ?? element.value;
    const nextForeground = updates.foreground ?? element.foreground ?? "#0f172a";
    const nextBackground = updates.background ?? element.background ?? "#ffffff";
    const src = await createQrDataUrl(nextValue, {
      foreground: nextForeground,
      background: nextBackground,
    });
    updateQrElement({ ...updates, src }, historyOptions);
  };

  return (
    <div className={EDITOR_UI.propertyCard}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">QR Code</h3>
          <p className="text-xs font-semibold text-slate-500">Editing generated QR</p>
        </div>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#27308F]">Selected</span>
      </div>

      <label className="block">
        <span className={EDITOR_UI.sectionLabel}>Value</span>
        <textarea
          value={element.value || ""}
          onChange={(event) =>
            updateQrValue({ value: event.target.value }, { historyLabel: "Edit QR value", mergeKey: `${element.id}:qrValue` })
          }
          className={`${EDITOR_UI.field} min-h-20 resize-y px-3 py-2`}
        />
      </label>

      <label className="mt-3 block">
        <span className={EDITOR_UI.sectionLabel}>Size</span>
        <input
          type="number"
          min={QR_SIZE_MIN}
          max={QR_SIZE_MAX}
          value={Math.round(element.width || DEFAULT_QR_SIZE)}
          onChange={(event) => {
            const size = clamp(Number(event.target.value) || DEFAULT_QR_SIZE, QR_SIZE_MIN, QR_SIZE_MAX);
            updateQrElement({ width: size, height: size }, { historyLabel: "Resize QR code", mergeKey: `${element.id}:qrSize` });
          }}
          className={`${EDITOR_UI.field} h-10 px-3`}
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-[92px_1fr] lg:grid-cols-1">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Foreground</span>
          <input
            type="color"
            value={element.foreground || "#0f172a"}
            onChange={(event) =>
              updateQrValue({ foreground: event.target.value }, { historyLabel: "Change QR foreground", mergeKey: `${element.id}:qrForeground` })
            }
            className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Background</span>
          <input
            type="color"
            value={element.background || "#ffffff"}
            onChange={(event) =>
              updateQrValue({ background: event.target.value }, { historyLabel: "Change QR background", mergeKey: `${element.id}:qrBackground` })
            }
            className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
      </div>
    </div>
  );
}

function BarcodeControls({ element, onBarcodeChange }) {
  const canEditBarcode = element?.type === "barcode" && isElementInteractive(element);
  if (!canEditBarcode) return null;

  const updateBarcodeElement = (updates, historyOptions = {}) => onBarcodeChange(element.id, updates, historyOptions);

  return (
    <div className={EDITOR_UI.propertyCard}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Barcode</h3>
          <p className="text-xs font-semibold text-slate-500">Editing Code 128</p>
        </div>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#27308F]">Selected</span>
      </div>

      <label className="block">
        <span className={EDITOR_UI.sectionLabel}>Value</span>
        <input
          value={element.value || ""}
          onChange={(event) => updateBarcodeElement({ value: event.target.value }, { historyLabel: "Edit barcode value", mergeKey: `${element.id}:barcodeValue` })}
          className={`${EDITOR_UI.field} h-10 px-3`}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Width</span>
          <input
            type="number"
            min="120"
            max="900"
            value={Math.round(element.width || DEFAULT_BARCODE_WIDTH)}
            onChange={(event) => updateBarcodeElement({ width: Math.max(MIN_ELEMENT_SIZE, Number(event.target.value) || DEFAULT_BARCODE_WIDTH) }, { historyLabel: "Resize barcode", mergeKey: `${element.id}:barcodeWidth` })}
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Height</span>
          <input
            type="number"
            min="72"
            max="320"
            value={Math.round(element.height || DEFAULT_BARCODE_HEIGHT)}
            onChange={(event) => updateBarcodeElement({ height: Math.max(MIN_ELEMENT_SIZE, Number(event.target.value) || DEFAULT_BARCODE_HEIGHT) }, { historyLabel: "Resize barcode", mergeKey: `${element.id}:barcodeHeight` })}
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
      </div>
    </div>
  );
}

function TableControls({ element, onTableChange }) {
  const canEditTable = element?.type === "table" && isElementInteractive(element);
  if (!canEditTable) return null;

  const updateTableElement = (updates, historyOptions = {}) => onTableChange(element.id, updates, historyOptions);
  const borderWidth = element.borderWidth ?? element.strokeWidth ?? 2;
  const rows = clamp(Math.round(Number(element.rows) || 2), TABLE_ROWS_MIN, TABLE_ROWS_MAX);
  const columns = clamp(Math.round(Number(element.columns) || 2), TABLE_COLUMNS_MIN, TABLE_COLUMNS_MAX);
  const cellValues = Array.isArray(element.cellValues) ? element.cellValues : [];
  const textSize = clamp(Number(element.fontSize) || 18, TABLE_TEXT_SIZE_MIN, TABLE_TEXT_SIZE_MAX);
  const textColor = element.textColor || "#0f172a";

  return (
    <div className={EDITOR_UI.propertyCard}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Table</h3>
          <p className="text-xs font-semibold text-slate-500">Editing visual grid</p>
        </div>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#27308F]">Selected</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Rows</span>
          <input
            type="number"
            min={TABLE_ROWS_MIN}
            max={TABLE_ROWS_MAX}
            value={element.rows || 2}
            onChange={(event) => {
              const rows = clamp(Math.round(Number(event.target.value) || 2), TABLE_ROWS_MIN, TABLE_ROWS_MAX);
              updateTableElement({ rows }, { historyLabel: "Change table rows", mergeKey: `${element.id}:rows` });
            }}
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Columns</span>
          <input
            type="number"
            min={TABLE_COLUMNS_MIN}
            max={TABLE_COLUMNS_MAX}
            value={element.columns || 2}
            onChange={(event) => {
              const columns = clamp(Math.round(Number(event.target.value) || 2), TABLE_COLUMNS_MIN, TABLE_COLUMNS_MAX);
              updateTableElement({ columns }, { historyLabel: "Change table columns", mergeKey: `${element.id}:columns` });
            }}
            className={`${EDITOR_UI.field} h-10 px-3`}
          />
        </label>
      </div>

      <div className="mt-3">
        <span className={EDITOR_UI.sectionLabel}>Cell Values</span>
        <div className="mt-1 max-h-56 space-y-2 overflow-y-auto pr-1">
          {Array.from({ length: rows * columns }, (_, index) => {
            const row = Math.floor(index / columns) + 1;
            const column = (index % columns) + 1;
            return (
              <label key={`cell-value-${index}`} className="block text-xs font-semibold text-slate-500">
                Row {row}, Column {column}
                <input
                  type="text"
                  data-table-cell-input
                  aria-label={`Table row ${row}, column ${column}`}
                  value={cellValues[index] || ""}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  onChange={(event) => {
                    const nextCellValues = Array.from({ length: rows * columns }, (_, cellIndex) => cellValues[cellIndex] || "");
                    nextCellValues[index] = event.target.value;
                    updateTableElement({ cellValues: nextCellValues }, { historyLabel: "Edit table cell", mergeKey: `${element.id}:cell:${index}` });
                  }}
                  className={`${EDITOR_UI.field} mt-1 h-9 px-3`}
                  placeholder="Enter cell value"
                />
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Text Size</span>
          <input
            type="number"
            min={TABLE_TEXT_SIZE_MIN}
            max={TABLE_TEXT_SIZE_MAX}
            value={textSize}
            onChange={(event) => updateTableElement({ fontSize: clamp(Math.round(Number(event.target.value) || TABLE_TEXT_SIZE_MIN), TABLE_TEXT_SIZE_MIN, TABLE_TEXT_SIZE_MAX) }, { historyLabel: "Change table text size", mergeKey: `${element.id}:fontSize` })}
            className={`${EDITOR_UI.field} mt-1 h-10 px-3`}
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Text Color</span>
          <input
            type="color"
            value={textColor}
            onChange={(event) => updateTableElement({ textColor: event.target.value }, { historyLabel: "Change table text color", mergeKey: `${element.id}:textColor` })}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white p-1"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[92px_1fr] lg:grid-cols-1">
        <label>
          <span className={EDITOR_UI.sectionLabel}>Fill</span>
          <input
            type="color"
            value={element.fill || "#ffffff"}
            onChange={(event) => updateTableElement({ fill: event.target.value }, { historyLabel: "Change table fill", mergeKey: `${element.id}:fill` })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
        <label>
          <span className={EDITOR_UI.sectionLabel}>Border</span>
          <input
            type="color"
            value={element.borderColor || element.stroke || "#334155"}
            onChange={(event) => updateTableElement({ borderColor: event.target.value, stroke: event.target.value }, { historyLabel: "Change table border", mergeKey: `${element.id}:border` })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Border Width
          <span>{borderWidth}px</span>
        </span>
        <input
          type="range"
          min="0"
          max="18"
          step="1"
          value={borderWidth}
          onChange={(event) => {
            const nextWidth = Number(event.target.value);
            updateTableElement({ borderWidth: nextWidth, strokeWidth: nextWidth }, { historyLabel: "Change table border width", mergeKey: `${element.id}:borderWidth` });
          }}
          className="w-full accent-[#1A1F71]"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-slate-500">
          Opacity
          <span>{Math.round((element.opacity ?? 1) * 100)}%</span>
        </span>
        <input
          type="range"
          min={OPACITY_MIN}
          max={OPACITY_MAX}
          step="0.05"
          value={element.opacity ?? 1}
          onChange={(event) => updateTableElement({ opacity: Number(event.target.value) }, { historyLabel: "Change table opacity", mergeKey: `${element.id}:opacity` })}
          className="w-full accent-[#1A1F71]"
        />
      </label>
    </div>
  );
}

function LayerControls({ layerState, onLayerAction }) {
  if (!layerState?.isLayerEditable) return null;

  const controls = [
    ["bringForward", "Forward", FiArrowUp, layerState.canBringForward],
    ["sendBackward", "Backward", FiArrowDown, layerState.canSendBackward],
    ["bringToFront", "To Front", FiArrowUp, layerState.canBringToFront],
    ["sendToBack", "To Back", FiArrowDown, layerState.canSendToBack],
  ];

  return (
    <div className={EDITOR_UI.propertyCard}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Layer</h3>
          <p className="text-xs font-semibold text-slate-500">Editable stack position</p>
        </div>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#27308F]">
          {layerState.position}/{layerState.total}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {controls.map(([action, label, Icon, enabled]) => (
          <button
            key={action}
            type="button"
            onClick={() => onLayerAction(action)}
            disabled={!enabled}
            className={`${EDITOR_UI.secondaryButton} h-9 px-2 text-xs`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BrandOverrideControls({ element, onResetToBrand }) {
  if (!hasBrandBinding(element)) return null;
  const overridden = hasBrandOverride(element);

  return (
    <div className={`rounded-lg border p-3 shadow-sm shadow-slate-950/[0.025] ${overridden ? "border-indigo-100 bg-indigo-50/70" : "border-emerald-100 bg-emerald-50/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{overridden ? "Brand override" : "Linked to Brand Kit"}</h3>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">
            {overridden ? "This element has manual local changes." : "Brand Kit updates will keep this element current."}
          </p>
        </div>
        {overridden && (
          <button
            type="button"
            onClick={() => onResetToBrand(element.id)}
            className={`${EDITOR_UI.primaryButton} shrink-0 px-3 py-2 text-xs`}
          >
            Use Brand Value
          </button>
        )}
      </div>
    </div>
  );
}

function Inspector({
  design,
  selectedElement,
  layerState,
  onElementChange,
  onReplaceImage,
  onLayerAction,
  onResetToBrand,
  onResetDesign,
  onDuplicate,
  onDelete,
}) {
  return (
    <Card className="border-slate-200/80 bg-white p-3 font-sans shadow-sm shadow-slate-950/[0.02]">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-slate-50 text-[#27308F]">
          <FiRotateCw className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-slate-950">Inspector</h2>
          <p className="text-xs font-medium text-slate-500">Local design state</p>
        </div>
      </div>

      {selectedElement ? (
        <div className="space-y-3 text-sm">
          {isElementInteractive(selectedElement) && (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50/80 p-2">
              <button
                type="button"
                onClick={onDuplicate}
                className={`${EDITOR_UI.secondaryButton} h-9 px-2 text-xs`}
              >
                <FiCopy className="h-4 w-4" />
                Duplicate
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#F43F5E] px-2 text-xs font-bold text-white shadow-sm transition duration-150 hover:bg-rose-600 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25"
              >
                <FiTrash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
          <TextControls element={selectedElement} onTextChange={onElementChange} />
          <ImageControls element={selectedElement} onImageChange={onElementChange} onReplaceImage={onReplaceImage} />
          <ShapeControls element={selectedElement} onShapeChange={onElementChange} />
          <QrControls element={selectedElement} onQrChange={onElementChange} />
          <BarcodeControls element={selectedElement} onBarcodeChange={onElementChange} />
          <TableControls element={selectedElement} onTableChange={onElementChange} />
          <BrandOverrideControls element={selectedElement} onResetToBrand={onResetToBrand} />
          <LayerControls layerState={layerState} onLayerAction={onLayerAction} />
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Selected</p>
            <p className="mt-1 font-bold text-slate-800">{getElementLabel(selectedElement)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Type", selectedElement.type],
              ["X", Math.round(selectedElement.x)],
              ["Y", Math.round(selectedElement.y)],
              ["Width", Math.round(selectedElement.width)],
              ["Height", Math.round(selectedElement.height)],
              ["Rotation", `${Math.round(selectedElement.rotation || 0)} deg`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-2">
                <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
                <p className="mt-1 truncate font-semibold text-slate-700">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selectedElement.locked ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
              {selectedElement.locked ? "Locked" : "Unlocked"}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selectedElement.editable === false ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-700"}`}>
              {selectedElement.editable === false ? "Protected" : "Editable"}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm font-medium text-slate-500 shadow-sm shadow-slate-950/[0.02]">
          Select an editable element on the canvas to inspect its position and transform state.
        </div>
      )}

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500 shadow-sm shadow-slate-950/[0.02]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-700">Template</p>
            <p>
              {isQuickPersonalizeDesign(design)
                ? "Quick Personalize poster with locked artwork and editable overlays."
                : design.templateType === "flat"
                  ? "Flat background with overlay-ready canvas."
                  : "Editable template with independent elements."}
            </p>
          </div>
          <button
            type="button"
            onClick={onResetDesign}
            className={`${EDITOR_UI.secondaryButton} shrink-0 px-2.5 py-1.5 text-xs`}
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>
    </Card>
  );
}

function EditorEmptyState({ onBack }) {
  return (
    <div className="grid min-h-full place-items-center bg-slate-100 p-5">
      <Card className="max-w-lg p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Template unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">This template could not be found in the Marketing Studio registry.</p>
        <Button onClick={onBack} className="mt-5 bg-[#1A1F71] text-white hover:bg-[#14185D]">
          <FiArrowLeft className="h-4 w-4" />
          Back to Marketing Studio
        </Button>
      </Card>
    </div>
  );
}

function MarketingStudioEditorLoaded({ template, onBack }) {
  const [brandKit, setBrandKit] = useState(() => cloneDesign(defaultBrandKit));
  const [design, setDesign] = useState(() => (template ? applyBrandKitToDesign(cloneDesign(template), defaultBrandKit) : null));
  const [history, setHistory] = useState({ past: [], future: [] });
  const [selectedId, setSelectedId] = useState("");
  const [activeTool, setActiveTool] = useState(() => (template?.editMode === "quick-personalize" ? "templates" : "text"));
  const [imageUploadTarget, setImageUploadTarget] = useState(null);
  const [imageUploadMode, setImageUploadMode] = useState("insert");
  const [uploadError, setUploadError] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState("saved");
  const [mediaItems, setMediaItems] = useState([]);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({ format: "png", scale: 1, jpegQuality: 0.92 });
  const [exportStatus, setExportStatus] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef([]);
  const historyMergeRef = useRef({ key: "", timestamp: 0 });
  const designRef = useRef(design);
  const brandKitRef = useRef(brandKit);
  const stageRef = useRef(null);

  const selectedElement = useMemo(() => design?.elements.find((element) => element.id === selectedId) || null, [design, selectedId]);
  const layerState = useMemo(() => getLayerState(design?.elements || [], selectedId), [design, selectedId]);
  const selectedImageId = selectedElement?.type === "image" && isElementInteractive(selectedElement) ? selectedElement.id : "";
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => {
    designRef.current = design;
  }, [design]);

  useEffect(() => {
    if (!design?.id?.startsWith("image-to-layers-")) return undefined;
    let active = true;
    setAutosaveStatus("saving");
    const timer = window.setTimeout(() => {
      saveSessionDesign(design)
        .then(() => { if (active) setAutosaveStatus("saved"); })
        .catch((error) => {
          if (!active) return;
          setAutosaveStatus("error");
          setUploadError(error.message || "Unable to save this design.");
        });
    }, 700);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [design]);

  useEffect(() => {
    brandKitRef.current = brandKit;
  }, [brandKit]);

  const commitDesignChange = (change, options = {}) => {
    setDesign((current) => {
      const nextDesign = typeof change === "function" ? change(current) : change;
      if (!nextDesign || nextDesign === current) return current;

      const now = Date.now();
      const shouldMerge =
        options.mergeKey &&
        historyMergeRef.current.key === options.mergeKey &&
        now - historyMergeRef.current.timestamp <= HISTORY_MERGE_WINDOW_MS;

      setHistory((currentHistory) => {
        const lastPast = currentHistory.past[currentHistory.past.length - 1];
        const nextPast =
          shouldMerge && lastPast
            ? currentHistory.past
            : limitHistory([...currentHistory.past, createEditorSnapshot(current, brandKitRef.current)]);
        return {
          past: nextPast,
          future: [],
        };
      });

      historyMergeRef.current = {
        key: options.mergeKey || "",
        timestamp: now,
      };

      return nextDesign;
    });
  };

  const updateElement = (elementId, updates, historyOptions = {}) => {
    commitDesignChange(
      (current) => ({
        ...current,
        elements: current.elements.map((element) =>
          element.id === elementId ? { ...element, ...updates, ...getManualOverrideUpdates(element, updates) } : element,
        ),
      }),
      historyOptions,
    );
  };

  const applyBrandKitUpdate = (nextBrandKit, historyOptions = {}) => {
    commitDesignChange((current) => applyBrandKitToDesign(current, nextBrandKit), historyOptions);
    setBrandKit(nextBrandKit);
  };

  const handleBrandFieldChange = (path, value, historyOptions = {}) => {
    applyBrandKitUpdate(setValueAtPath(brandKit, path, value), historyOptions);
  };

  const updateExportOptions = (updates) => {
    setExportOptions((current) => ({ ...current, ...updates }));
    setExportStatus("");
  };

  const createExportDataUrl = (options = exportOptions) => {
    const stage = stageRef.current;
    const activeDesign = designRef.current;
    if (!stage || !activeDesign) throw new Error("The design is not ready to export yet.");

    const format = getExportFormat(options.format);
    const stageScale = stage.scaleX() || 1;
    const pixelRatio = options.scale / stageScale;

    return stage.toDataURL({
      mimeType: format.mimeType,
      quality: format.id === "jpeg" ? options.jpegQuality : undefined,
      pixelRatio,
      x: 0,
      y: 0,
      width: activeDesign.width * stageScale,
      height: activeDesign.height * stageScale,
    });
  };

  const withCleanExportStage = async (task) => {
    const previousSelection = selectedId;
    setSelectedId("");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      return await task();
    } finally {
      setSelectedId(previousSelection);
    }
  };

  const handleDownloadDesign = async () => {
    setExportBusy(true);
    setExportStatus("");

    try {
      await withCleanExportStage(async () => {
        const format = getExportFormat(exportOptions.format);
        const dataUrl = createExportDataUrl(exportOptions);
        triggerBrowserDownload(dataUrl, createDownloadFileName(designRef.current, format));
        setExportStatus(`Downloaded ${designRef.current.width * exportOptions.scale} x ${designRef.current.height * exportOptions.scale}px ${format.label}.`);
      });
    } catch (error) {
      setExportStatus(error.message || "Export failed. Try again after images finish loading.");
    } finally {
      setExportBusy(false);
    }
  };

  const handleShareDesign = async () => {
    setExportBusy(true);
    setExportStatus("");

    try {
      if (!navigator.canShare || !navigator.share) {
        setExportPanelOpen(true);
        setExportStatus("Sharing is not supported in this browser. Download the image instead.");
        return;
      }

      await withCleanExportStage(async () => {
        const shareOptions = { ...exportOptions, format: "png" };
        const format = getExportFormat(shareOptions.format);
        const dataUrl = createExportDataUrl(shareOptions);
        const blob = await dataUrlToBlob(dataUrl);
        const file = new File([blob], createDownloadFileName(designRef.current, format), { type: format.mimeType });

        if (!navigator.canShare({ files: [file] })) {
          setExportPanelOpen(true);
          setExportStatus("Direct image sharing is not supported here. Download the image instead.");
          return;
        }

        await navigator.share({
          title: designRef.current.name,
          text: "Marketing Studio design",
          files: [file],
        });
        setExportStatus("Share sheet opened.");
      });
    } catch (error) {
      setExportStatus(error.name === "AbortError" ? "Share cancelled." : error.message || "Sharing failed. Download the image instead.");
    } finally {
      setExportBusy(false);
    }
  };

  const handleResetElementToBrand = (elementId) => {
    commitDesignChange(
      (current) => ({
        ...current,
        elements: current.elements.map((element) => {
          if (element.id !== elementId) return element;
          const resetElement = {
            ...element,
            brandOverride: false,
            styleOverrides: {},
          };
          return applyBrandKitToElement(resetElement, brandKitRef.current);
        }),
      }),
      { historyLabel: "Use brand value" },
    );
  };

  const trackObjectUrl = (src) => {
    if (src?.startsWith("blob:")) objectUrlsRef.current.push(src);
  };

  const openImagePicker = (targetId = null, mode = targetId ? "replace" : "insert") => {
    setUploadError("");
    setImageUploadTarget(targetId);
    setImageUploadMode(mode);
    fileInputRef.current?.click();
  };

  const addElement = (element) => {
    commitDesignChange(
      (current) => ({
        ...current,
        elements: [...current.elements, element],
      }),
      { historyLabel: `Add ${element.type}` },
    );
    setSelectedId(element.id);
  };

  const createTextElement = (presetId) => {
    const preset = TEXT_PRESETS.find((item) => item.id === presetId) || TEXT_PRESETS[0];
    const { width, height } = getContainedElementSize(design.width, design.height, preset.width || DEFAULT_TEXT_WIDTH, preset.height || DEFAULT_TEXT_HEIGHT);
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);
    const textId = createUserElementId("text", preset.id);

    return {
      id: textId,
      type: "text",
      role: "userAddedText",
      userAdded: true,
      text: preset.text,
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      fontFamily: TEXT_FONT_OPTIONS[0],
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fontStyle: "normal",
      textDecoration: "",
      fill: "#0f172a",
      align: "center",
    };
  };

  const createStickerElement = (sticker) => {
    const { width, height } = getContainedElementSize(design.width, design.height, 220, 190);
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);
    return {
      id: createUserElementId("sticker", sticker.id),
      type: "text",
      role: "userAddedSticker",
      userAdded: true,
      text: sticker.glyph,
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
      fontSize: 132,
      fontWeight: 400,
      fontStyle: "normal",
      textDecoration: "",
      fill: "#0f172a",
      align: "center",
    };
  };

  const createShapeElement = (shapeId) => {
    const preset = SHAPE_PRESETS.find((item) => item.id === shapeId) || SHAPE_PRESETS[0];
    const { width, height } = getContainedElementSize(design.width, design.height, preset.width, preset.height);
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);

    return {
      id: createUserElementId("shape", preset.id),
      type: "shape",
      role: "userAddedShape",
      userAdded: true,
      shapeType: preset.id,
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      fill: preset.fill,
      stroke: preset.stroke,
      borderColor: preset.stroke,
      strokeWidth: preset.strokeWidth,
      borderWidth: preset.strokeWidth,
      cornerRadius: preset.cornerRadius || 0,
    };
  };

  const createFrameElement = (frameStyle) => {
    const width = design.width * 0.94;
    const height = design.height * 0.94;
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);
    return {
      id: createUserElementId("frame", frameStyle),
      type: "shape",
      role: "userAddedFrame",
      userAdded: true,
      shapeType: "frame",
      frameStyle,
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      fill: "#ffffff",
      stroke: "#27308F",
      borderColor: "#27308F",
      strokeWidth: Math.max(4, Math.min(width, height) * 0.012),
      borderWidth: Math.max(4, Math.min(width, height) * 0.012),
      cornerRadius: 0,
      brandLogo: brandKit.business.logo || "",
      businessName: brandKit.business.name || "",
      businessPhone: brandKit.business.phone || "",
      businessWebsite: brandKit.business.website || "",
      brandColor: brandKit.colors.primary || "#27308F",
    };
  };

  const createQrElement = async ({ value, foreground, background, src }) => {
    const { width, height } = getContainedElementSize(design.width, design.height, DEFAULT_QR_SIZE, DEFAULT_QR_SIZE);
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);
    const qrSrc = src || (await createQrDataUrl(value, { foreground, background }));

    return {
      id: createUserElementId("qr", "code"),
      type: "qr",
      role: "userAddedQr",
      userAdded: true,
      value: String(value || "").trim() || "https://ledgerly.example",
      src: qrSrc,
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      foreground: foreground || "#0f172a",
      background: background || "#ffffff",
      borderColor: "#ffffff",
      borderWidth: 0,
      strokeWidth: 0,
      cornerRadius: 8,
    };
  };

  const createBarcodeElement = (value) => {
    const { width, height } = getContainedElementSize(design.width, design.height, DEFAULT_BARCODE_WIDTH, DEFAULT_BARCODE_HEIGHT);
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);

    return {
      id: createUserElementId("barcode", "code128"),
      type: "barcode",
      role: "userAddedBarcode",
      userAdded: true,
      value: String(value || "").trim() || "LDG10001",
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      foreground: "#0f172a",
      background: "#ffffff",
      borderColor: "#cbd5e1",
      borderWidth: 1,
      strokeWidth: 1,
      cornerRadius: 8,
      paddingX: 18,
      paddingY: 14,
      showValue: true,
      fontFamily: TEXT_FONT_OPTIONS[0],
      fontSize: 16,
    };
  };

  const createTableElement = ({ rows, columns }) => {
    const { width, height } = getContainedElementSize(design.width, design.height, DEFAULT_TABLE_WIDTH, DEFAULT_TABLE_HEIGHT);
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);

    return {
      id: createUserElementId("table", `${rows}x${columns}`),
      type: "table",
      role: "userAddedTable",
      userAdded: true,
      rows: clamp(Number(rows) || 2, TABLE_ROWS_MIN, TABLE_ROWS_MAX),
      columns: clamp(Number(columns) || 2, TABLE_COLUMNS_MIN, TABLE_COLUMNS_MAX),
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      fill: "#ffffff",
      stroke: "#334155",
      borderColor: "#334155",
      strokeWidth: 2,
      borderWidth: 2,
      cornerRadius: 0,
    };
  };

  const createImageElement = (mediaItem) => {
    const size = getContainedSize(mediaItem.naturalWidth, mediaItem.naturalHeight, IMAGE_SIZE_MAX);
    const position = getCenteredCanvasPosition(design.width, design.height, size.width, size.height);

    return {
      id: createUserElementId("image", "upload"),
      type: "image",
      role: "userAddedImage",
      userAdded: true,
      mediaId: mediaItem.id,
      src: mediaItem.src,
      x: position.x,
      y: position.y,
      width: Math.round(size.width),
      height: Math.round(size.height),
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      flipX: false,
      flipY: false,
      fit: "fit",
      cropX: 0.5,
      cropY: 0.5,
      cropScale: 1,
      cropEditing: false,
      borderColor: "#0f172a",
      borderWidth: 0,
      strokeWidth: 0,
      cornerRadius: 0,
      brightness: BRIGHTNESS_DEFAULT,
      contrast: 0,
      saturation: 0,
      blurRadius: 0,
      grayscale: false,
      naturalWidth: mediaItem.naturalWidth,
      naturalHeight: mediaItem.naturalHeight,
    };
  };

  const registerMediaItem = (mediaItem) => {
    setMediaItems((current) => (current.some((item) => item.id === mediaItem.id) ? current : [...current, mediaItem]));
    return mediaItem;
  };

  const replaceImageWithMediaItem = (elementId, mediaItem) => {
    if (!elementId) return;

    updateElement(
      elementId,
      {
        mediaId: mediaItem.id,
        src: mediaItem.src,
        naturalWidth: mediaItem.naturalWidth,
        naturalHeight: mediaItem.naturalHeight,
        fit: "fit",
        cropX: 0.5,
        cropY: 0.5,
        cropScale: 1,
        cropEditing: false,
        brightness: BRIGHTNESS_DEFAULT,
        contrast: 0,
        saturation: 0,
        blurRadius: 0,
        grayscale: false,
      },
      { historyLabel: "Replace image" },
    );
    setSelectedId(elementId);
  };

  const setBackgroundFromMediaItem = (mediaItem) => {
    commitDesignChange(
      (current) => ({
        ...current,
        background: {
          type: "image",
          src: mediaItem.src,
          mediaId: mediaItem.id,
          name: mediaItem.name,
          naturalWidth: mediaItem.naturalWidth,
          naturalHeight: mediaItem.naturalHeight,
          source: mediaItem.source || "upload",
          locked: true,
          editable: false,
        },
      }),
      { historyLabel: "Set background image" },
    );
    setSelectedId("");
  };

  const createBrandElement = (fieldId) => {
    const field = getBrandFieldConfig(fieldId);
    if (!field) return null;

    const value = getValueAtPath(brandKit, field.valuePath);
    if (!value) return null;

    const { width, height } = getContainedElementSize(design.width, design.height, field.width, field.height);
    const position = getCenteredCanvasPosition(design.width, design.height, width, height);

    if (field.type === "image") {
      return {
        id: createUserElementId("brand", field.id),
        type: "image",
        role: "businessLogo",
        userAdded: true,
        binding: field.binding,
        src: value,
        mediaId: brandKit.business.logoMediaId || "",
        x: position.x,
        y: position.y,
        width,
        height,
        rotation: 0,
        opacity: 1,
        locked: false,
        editable: true,
        flipX: false,
        flipY: false,
        fit: "cover",
        cropX: 0.5,
        cropY: 0.5,
        borderColor: "#ffffff",
        borderWidth: 0,
        strokeWidth: 0,
        cornerRadius: 18,
        brightness: BRIGHTNESS_DEFAULT,
        contrast: 0,
        saturation: 0,
        blurRadius: 0,
        grayscale: false,
        naturalWidth: brandKit.business.logoNaturalWidth,
        naturalHeight: brandKit.business.logoNaturalHeight,
      };
    }

    return {
      id: createUserElementId("brand", field.id),
      type: "text",
      role: `brand${toTitleCase(field.id).replace(/\s/g, "")}`,
      userAdded: true,
      binding: field.binding,
      text: String(value),
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      editable: true,
      fontFamily: TEXT_FONT_OPTIONS[0],
      fontSize: field.fontSize,
      fontWeight: field.fontWeight,
      fontStyle: "normal",
      textDecoration: "",
      fill: field.fill,
      align: "center",
    };
  };

  const createQuickPersonalizeElement = (fieldId, overrides = {}) => {
    const field = design.quickPersonalize?.fields?.[fieldId];
    if (!field) return null;

    if (fieldId === "logo") {
      return applyBrandKitToElement(
        {
          id: createUserElementId("quick", "logo"),
          type: "image",
          role: "businessLogo",
          userAdded: true,
          binding: "brand.logo",
          quickPersonalizeField: "logo",
          src: brandKit.business.logo || "",
          mediaId: brandKit.business.logoMediaId || "",
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          rotation: 0,
          opacity: 1,
          locked: false,
          editable: true,
          flipX: false,
          flipY: false,
          fit: "contain",
          cropX: 0.5,
          cropY: 0.5,
          borderColor: field.borderColor || "#ffffff",
          borderWidth: field.borderWidth ?? 0,
          strokeWidth: field.strokeWidth ?? field.borderWidth ?? 0,
          cornerRadius: field.cornerRadius || 0,
          brightness: BRIGHTNESS_DEFAULT,
          contrast: 0,
          saturation: 0,
          blurRadius: 0,
          grayscale: false,
          naturalWidth: brandKit.business.logoNaturalWidth,
          naturalHeight: brandKit.business.logoNaturalHeight,
          ...overrides,
        },
        brandKit,
      );
    }

    const isBusinessName = fieldId === "businessName";
    return applyBrandKitToElement(
      {
        id: createUserElementId("quick", fieldId),
        type: "text",
        role: isBusinessName ? "businessName" : "customHeading",
        userAdded: true,
        binding: isBusinessName ? "brand.businessName" : undefined,
        quickPersonalizeField: fieldId,
        text: isBusinessName ? brandKit.business.name : design.quickPersonalize?.headingDefault || "Add your heading",
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        rotation: 0,
        opacity: 1,
        locked: false,
        editable: true,
        fontFamily: field.fontFamily || TEXT_FONT_OPTIONS[0],
        fontSize: field.fontSize || 36,
        fontWeight: field.fontWeight || 800,
        fontStyle: "normal",
        textDecoration: "",
        lineHeight: field.lineHeight,
        fill: field.fill || "#ffffff",
        align: field.align || "center",
        ...overrides,
      },
      brandKit,
    );
  };

  const handleAddText = (presetId) => {
    addElement(createTextElement(presetId));
  };

  const handleAddShape = (shapeId) => {
    addElement(createShapeElement(shapeId));
  };

  const handleAddQr = async (options) => {
    const qrElement = await createQrElement(options);
    addElement(qrElement);
  };

  const handleAddBarcode = (value) => {
    if (!getCode128Bars(value)) return;
    addElement(createBarcodeElement(value));
  };

  const handleAddTable = (options) => {
    addElement(createTableElement(options));
  };

  const handleAddSticker = (sticker) => {
    addElement(createStickerElement(sticker));
  };

  const handleAddFrame = (frameStyle) => {
    addElement(createFrameElement(frameStyle));
  };

  const handleAddMediaImage = (mediaId) => {
    const mediaItem = mediaItems.find((item) => item.id === mediaId);
    if (!mediaItem) return;
    addElement(createImageElement(mediaItem));
  };

  const handleReplaceMediaImage = (mediaId) => {
    const mediaItem = mediaItems.find((item) => item.id === mediaId);
    if (!mediaItem || !selectedImageId) return;
    replaceImageWithMediaItem(selectedImageId, mediaItem);
  };

  const handleUseStockImage = (asset, action = "insert") => {
    const mediaItem = registerMediaItem(createMediaItemFromStockAsset(asset));

    if (action === "replace" && selectedImageId) {
      replaceImageWithMediaItem(selectedImageId, mediaItem);
      return;
    }

    if (action === "background") {
      setBackgroundFromMediaItem(mediaItem);
      return;
    }

    addElement(createImageElement(mediaItem));
  };

  const handleAddBrandField = (fieldId) => {
    const brandElement = createBrandElement(fieldId);
    if (!brandElement) return;
    addElement(brandElement);
  };

  const handleAddQuickPersonalizeElement = (fieldId, overrides = {}) => {
    const personalizeElement = createQuickPersonalizeElement(fieldId, overrides);
    if (!personalizeElement) return;
    addElement(personalizeElement);
  };

  const handleImageFileChange = async (event) => {
    const [file] = event.target.files || [];
    event.target.value = "";
    if (!file) {
      setImageUploadTarget(null);
      setImageUploadMode("insert");
      return;
    }

    try {
      const loadedImage = await loadImageFile(file);
      trackObjectUrl(loadedImage.src);
      if (imageUploadMode === "brandLogo") {
        applyBrandKitUpdate(
          {
            ...brandKit,
            business: {
              ...brandKit.business,
              logo: loadedImage.src,
              logoMediaId: "",
              logoNaturalWidth: loadedImage.naturalWidth,
              logoNaturalHeight: loadedImage.naturalHeight,
            },
          },
          { historyLabel: "Change brand logo" },
        );
        setImageUploadTarget(null);
        setImageUploadMode("insert");
        return;
      }

      const mediaItem = {
        id: createMediaId(),
        name: file.name || "Uploaded image",
        src: loadedImage.src,
        thumbnailSrc: loadedImage.src,
        naturalWidth: loadedImage.naturalWidth,
        naturalHeight: loadedImage.naturalHeight,
        source: "upload",
      };
      registerMediaItem(mediaItem);

      if (imageUploadMode === "replace" && imageUploadTarget) {
        replaceImageWithMediaItem(imageUploadTarget, mediaItem);
        setImageUploadTarget(null);
        setImageUploadMode("insert");
        return;
      }

      if (imageUploadMode === "insert") addElement(createImageElement(mediaItem));

      setImageUploadTarget(null);
      setImageUploadMode("insert");
    } catch (error) {
      setUploadError(error.message || "Unable to load that image.");
      setImageUploadTarget(null);
      setImageUploadMode("insert");
    }
  };

  const handleReset = () => {
    if (!template) return;
    commitDesignChange(applyBrandKitToDesign(cloneDesign(template), brandKit), { historyLabel: "Reset design" });
    setSelectedId("");
    setUploadError("");
    setImageUploadTarget(null);
    setImageUploadMode("insert");
  };

  const handleDuplicate = () => {
    if (!selectedElement || !isElementInteractive(selectedElement)) return;
    const duplicateId = `${selectedElement.id}-copy-${Date.now()}`;
    const duplicate = {
      ...cloneDesign(selectedElement),
      id: duplicateId,
      x: selectedElement.x + 36,
      y: selectedElement.y + 36,
    };

    commitDesignChange(
      (current) => ({
        ...current,
        elements: insertElementAboveOriginal(current.elements, selectedElement.id, duplicate),
      }),
      { historyLabel: "Duplicate element" },
    );
    setSelectedId(duplicateId);
  };

  const handleLayerAction = (action) => {
    if (!selectedElement || !isElementInteractive(selectedElement)) return;

    commitDesignChange(
      (current) => ({
        ...current,
        elements: reorderInteractiveElements(current.elements, selectedElement.id, action),
      }),
      { historyLabel: "Reorder layer" },
    );
  };

  const handleUndo = () => {
    const activeDesign = designRef.current;
    const activeBrandKit = brandKitRef.current;

    setHistory((currentHistory) => {
      if (currentHistory.past.length === 0) return currentHistory;

      const previousSnapshot = currentHistory.past[currentHistory.past.length - 1];
      const previousDesign = previousSnapshot.design || previousSnapshot;
      const previousBrandKit = previousSnapshot.brandKit || activeBrandKit;
      const nextPast = currentHistory.past.slice(0, -1);

      setDesign(() => {
        setSelectedId((currentSelectedId) => (hasElement(previousDesign, currentSelectedId) ? currentSelectedId : ""));
        return previousDesign;
      });
      setBrandKit(previousBrandKit);
      brandKitRef.current = previousBrandKit;

      historyMergeRef.current = { key: "", timestamp: 0 };
      return {
        past: nextPast,
        future: [createEditorSnapshot(activeDesign, activeBrandKit), ...currentHistory.future],
      };
    });
  };

  const handleRedo = () => {
    const activeDesign = designRef.current;
    const activeBrandKit = brandKitRef.current;

    setHistory((currentHistory) => {
      if (currentHistory.future.length === 0) return currentHistory;

      const nextSnapshot = currentHistory.future[0];
      const nextDesign = nextSnapshot.design || nextSnapshot;
      const nextBrandKit = nextSnapshot.brandKit || activeBrandKit;
      const nextFuture = currentHistory.future.slice(1);

      setDesign(() => {
        setSelectedId((currentSelectedId) => (hasElement(nextDesign, currentSelectedId) ? currentSelectedId : ""));
        return nextDesign;
      });
      setBrandKit(nextBrandKit);
      brandKitRef.current = nextBrandKit;

      historyMergeRef.current = { key: "", timestamp: 0 };
      return {
        past: limitHistory([...currentHistory.past, createEditorSnapshot(activeDesign, activeBrandKit)]),
        future: nextFuture,
      };
    });
  };

  const handleDelete = () => {
    if (!selectedElement || !isElementInteractive(selectedElement)) return;
    commitDesignChange(
      (current) => ({
        ...current,
        elements: current.elements.filter((element) => element.id !== selectedElement.id),
      }),
      { historyLabel: "Delete element" },
    );
    setSelectedId("");
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isTypingTarget) return;

      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        ((event.shiftKey && event.key.toLowerCase() === "z") || event.key.toLowerCase() === "y");

      if (isUndo) {
        event.preventDefault();
        handleUndo();
      }

      if (isRedo) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((src) => URL.revokeObjectURL(src));
      objectUrlsRef.current = [];
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#EEF2F7] font-sans text-slate-900">
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageFileChange} className="hidden" />
      <EditorHeader
        design={design}
        autosaveStatus={autosaveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        busy={exportBusy}
        onBack={onBack}
        onShare={handleShareDesign}
        onOpenExport={() => {
          setExportPanelOpen(true);
          setExportStatus("");
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      {exportPanelOpen && (
        <ExportPanel
          design={design}
          options={exportOptions}
          status={exportStatus}
          busy={exportBusy}
          onOptionsChange={updateExportOptions}
          onDownload={handleDownloadDesign}
          onClose={() => setExportPanelOpen(false)}
        />
      )}
      <main className="grid min-h-0 flex-1 bg-[#EEF2F7] lg:grid-cols-[72px_288px_minmax(0,1fr)_288px] lg:overflow-hidden">
        <EditorToolRail activeTool={activeTool} onToolChange={setActiveTool} />
        <EditorToolsPanel
          design={design}
          selectedId={selectedId}
          selectedImageId={selectedImageId}
          brandKit={brandKit}
          mediaItems={mediaItems}
          activeTool={activeTool}
          onAddText={handleAddText}
          onAddShape={handleAddShape}
          onAddQr={handleAddQr}
          onAddBarcode={handleAddBarcode}
          onAddTable={handleAddTable}
          onAddSticker={handleAddSticker}
          onAddFrame={handleAddFrame}
          onUploadImage={() => openImagePicker(null)}
          onAddMediaImage={handleAddMediaImage}
          onReplaceMediaImage={handleReplaceMediaImage}
          onUseStockImage={handleUseStockImage}
          onSelectLayer={setSelectedId}
          onBrandFieldChange={handleBrandFieldChange}
          onBrandLogoUpload={() => openImagePicker(null, "brandLogo")}
          onAddBrandField={handleAddBrandField}
          onAddQuickPersonalizeElement={handleAddQuickPersonalizeElement}
          onQuickPersonalizeElementChange={updateElement}
        />
        <section className="grid min-h-0 grid-rows-[44px_minmax(0,1fr)] overflow-hidden p-3">
          <ObjectToolbar selectedElement={selectedElement} onElementChange={updateElement} onReplaceImage={(elementId) => openImagePicker(elementId)} />
          <CanvasStage
            design={design}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            updateElement={updateElement}
            brandKit={brandKit}
            stageRef={stageRef}
            exportMode={exportBusy}
          />
        </section>
        <aside className="min-h-0 space-y-3 overflow-y-auto border-t border-slate-200 bg-[#F8FAFC] p-3 lg:border-l lg:border-t-0">
          {uploadError && <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{uploadError}</div>}
          <Inspector
            design={design}
            selectedElement={selectedElement}
            layerState={layerState}
            onElementChange={updateElement}
            onReplaceImage={(elementId) => openImagePicker(elementId)}
            onLayerAction={handleLayerAction}
            onResetToBrand={handleResetElementToBrand}
            onResetDesign={handleReset}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
          />
        </aside>
      </main>
    </div>
  );
}

function MarketingStudioEditor() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [savedTemplate, setSavedTemplate] = useState(null);
  useEffect(() => { getSessionDesignById(templateId).then(setSavedTemplate).catch(() => setSavedTemplate(null)); }, [templateId]);
  const template = useMemo(() => getTemplateById(templateId) || savedTemplate, [templateId, savedTemplate]);
  const handleBack = () => navigate("/business-growth/marketing-tools");

  if (!template) return <EditorEmptyState onBack={handleBack} />;

  return <MarketingStudioEditorLoaded key={template.id} template={template} onBack={handleBack} />;
}

export default MarketingStudioEditor;
