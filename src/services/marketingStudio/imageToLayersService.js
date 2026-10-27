import { API_BASE_URL } from "../apiClient.js";
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Every element the editor sees gets the full schema, so drag / resize / rotate never hit `undefined`.
const BASE_ELEMENT = {
  rotation: 0,
  opacity: 1,
  userAdded: false,
  borderWidth: 0,
  strokeWidth: 0,
};
const IMAGE_DEFAULTS = { ...BASE_ELEMENT, type: "image", fit: "stretch", cropX: 0.5, cropY: 0.5 };
const TEXT_DEFAULTS = {
  ...BASE_ELEMENT,
  type: "text",
  fontFamily: "Inter, Arial, sans-serif",
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  align: "left",
};

// Reads file as data url.
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read that image file."));
    reader.readAsDataURL(file);
  });

// Validates image to layers file.
export function validateImageToLayersFile(file) {
  if (!file) return "Choose an image first.";
  if (!ACCEPTED_TYPES.includes(file.type)) return "Choose a PNG, JPG, JPEG, or WebP image.";
  if (file.size > MAX_BYTES) return "Image must be smaller than 8 MB.";
  return "";
}

// Converts image to layers.
export async function convertImageToLayers(file) {
  const validationError = validateImageToLayersFile(file);
  if (validationError) throw new Error(validationError);

  const dataUrl = await readFileAsDataUrl(file);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/marketing-studio/image-to-layers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: { name: file.name, type: file.type, dataUrl } }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot reach the Vyapaar backend at ${API_BASE_URL || "the same-origin /api endpoint"}. Check that the backend is running and the Vite API proxy targets the correct port.`);
    }
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw Object.assign(new Error(payload.message || "Image to Layers failed."), {
      code: payload.code || "IMAGE_TO_LAYERS_FAILED",
      requirements: payload.requirements || [],
    });
  }

  // Keep the original upload: it makes a far better thumbnail than the object-less background.
  return { ...payload, fileName: payload.fileName || file.name.replace(/\.[^.]+$/, ""), sourceSrc: dataUrl };
}

// This helper handles element logic.
function toElement(layer, designId, zIndex) {
  const isText = layer.type === "text";
  const el = { ...(isText ? TEXT_DEFAULTS : IMAGE_DEFAULTS), ...layer };

  el.id = el.mediaId = `${designId}-${layer.id}`;
  el.name = layer.name || layer.id;
  el.zIndex = zIndex; // explicit stacking, so nothing (e.g. the full-canvas background) ends up on top
  el.locked = false; // detected layers must be freely movable
  el.editable = true;
  ["x", "y", "width", "height"].forEach((key) => (el[key] = Math.round(Number(el[key]) || 0)));

  if (isText) {
    // Browser fonts rarely match the source lettering exactly; a little slack stops surprise line wraps.
    const extra = Math.round(el.width * 0.06) + 4;
    el.width += extra;
    if (el.align === "center") el.x -= Math.round(extra / 2);
    else if (el.align === "right") el.x -= extra;
    el.textAlign = el.align;
  }
  return el;
}

// Creates image to layers design.
export function createImageToLayersDesign(result, keptLayerIds) {
  const { width, height } = result;
  const id = `image-to-layers-${Date.now()}`;
  const kept = keptLayerIds ? new Set(keptLayerIds) : null; // no list = keep everything
  const bgSrc = result.background?.src || result.backgroundSrc;
  const title = result.fileName ? `${result.fileName} Layers` : "Image to Layers Draft";

  const layers = (result.layers || [])
    .filter((l) => (!kept || kept.has(l.id)) && l.width > 0 && l.height > 0 && (l.type !== "text" || l.text?.trim()))
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)) // bottom -> top
    .map((layer, index) => toElement(layer, id, index + 1));

  const background = bgSrc && {
    ...IMAGE_DEFAULTS,
    id: `${id}-editable-background`,
    mediaId: `${id}-editable-background`,
    name: "Background",
    role: "Editable Background",
    src: bgSrc,
    x: 0,
    y: 0,
    width,
    height,
    zIndex: 0,
    locked: false,
    editable: true,
  };

  if (import.meta.env.DEV) console.debug("[Image-to-Layers]", { width, height, layers: layers.length, provider: result.backgroundProvider });

  const thumbnail = result.sourceSrc || bgSrc;
  return {
    id,
    title,
    name: title,
    category: "AI Import",
    type: "editable",
    templateType: "editable",
    editMode: "image-to-layers-beta",
    format: width > height ? "landscape-post" : height > width ? "portrait-post" : "square-post",
    width,
    height,
    canvas: { width, height, label: `${width} x ${height}px` },
    thumbnail,
    thumbnailAlt: "Image to Layers imported design",
    businessCategories: ["general"],
    discoveryTabs: [],
    sections: [],
    tags: ["image to layers", "ai import", "beta"],
    assets: { thumbnail, source: "image-to-layers-beta", model: result.model },
    brandBindings: [],
    background: {
      type: "color",
      fill: "#ffffff",
      reconstruction: result.background?.reconstruction || result.backgroundProvider || "opencv-telea-inpainting",
    },
    elements: background ? [background, ...layers] : layers,
    editableConfig: {
      supportsBrandBindings: false,
      supportsUserOverlays: true,
      supportsElementEditing: true,
      supportsPosterEditing: false,
    },
    imageToLayers: {
      beta: true,
      model: result.model,
      note: result.note,
      sourceFileName: result.fileName,
      backgroundQuality: result.backgroundQuality,
      warnings: result.warnings,
    },
    eventIds: [],
  };
}
