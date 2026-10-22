/* global process */
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT_PATH = path.join(__dirname, "image_to_layers", "image_to_layers.py");
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PYTHON_TIMEOUT_MS = 90_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const VALID_OUTPUT_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/;

function isPositiveFrame(layer) {
  return [layer?.x, layer?.y, layer?.width, layer?.height].every((value) => Number.isFinite(Number(value))) && Number(layer.width) > 0 && Number(layer.height) > 0;
}

function isValidOutputImageDataUrl(value) {
  if (!VALID_OUTPUT_IMAGE_DATA_URL.test(String(value || ""))) return false;

  try {
    const [, base64 = ""] = String(value).split(",");
    return Buffer.from(base64, "base64").length > 0;
  } catch {
    return false;
  }
}

function isValidRawLayer(layer) {
  if (!isPositiveFrame(layer)) return false;
  if (layer?.type === "text") return typeof layer.text === "string" && layer.text.trim().length > 0;
  return isValidOutputImageDataUrl(layer?.src);
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) {
    const error = new Error("Upload a PNG, JPG, JPEG, or WebP image.");
    error.statusCode = 400;
    throw error;
  }

  const [, mimeType, base64] = match;
  if (!ACCEPTED_IMAGE_TYPES.has(mimeType)) {
    const error = new Error("Unsupported image type.");
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error("Image must be smaller than 8 MB.");
    error.statusCode = 413;
    throw error;
  }

  return { mimeType, buffer };
}

function getFileExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function runPythonSegmentation(inputPath) {
  const configuredPython = process.env.PYTHON_BIN?.trim();
  const localVenvPython = path.resolve(__dirname, "../../.venv-image-to-layers", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const useLocalVenv = !configuredPython && existsSync(localVenvPython);
  const pythonBinary = configuredPython || (useLocalVenv ? localVenvPython : process.platform === "win32" ? "py" : "python3");
  const pythonArgs = configuredPython || useLocalVenv
    ? [PYTHON_SCRIPT_PATH, "--input", inputPath]
    : process.platform === "win32"
      ? ["-3", PYTHON_SCRIPT_PATH, "--input", inputPath]
      : [PYTHON_SCRIPT_PATH, "--input", inputPath];

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBinary, pythonArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      const error = new Error("Image segmentation timed out.");
      error.statusCode = 504;
      reject(error);
    }, PYTHON_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      error.statusCode = 503;
      if (error.code === "ENOENT") {
        error.message = "Python 3 was not found. Install Python and the Image to Layers requirements, or set PYTHON_BIN in server/.env.";
      }
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      let payload;
      try {
        payload = JSON.parse(stdout || "{}");
      } catch {
        const error = new Error(stderr || "Python segmentation service returned an invalid response.");
        error.statusCode = 502;
        reject(error);
        return;
      }

      if (code !== 0 && payload?.success !== false) {
        const error = new Error(stderr || `Python segmentation service exited with code ${code}.`);
        error.statusCode = 502;
        reject(error);
        return;
      }

      resolve(payload);
    });
  });
}

function normalizeImageLayer(layer, index) {
  return {
    id: `extracted-object-${index + 1}`,
    name: layer.name || `Object ${index + 1}`,
    type: "image",
    role: layer.role || "Detected Object",
    userAdded: false,
    src: layer.src,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    width: Math.round(layer.width),
    height: Math.round(layer.height),
    rotation: Number.isFinite(Number(layer.rotation)) ? Number(layer.rotation) : 0,
    opacity: 1,
    locked: false,
    editable: true,
    flipX: false,
    flipY: false,
    fit: "stretch",
    cropX: 0.5,
    cropY: 0.5,
    borderColor: "#0f172a",
    borderWidth: 0,
    strokeWidth: 0,
    cornerRadius: 0,
    brightness: 1,
    contrast: 0,
    saturation: 0,
    blurRadius: 0,
    grayscale: false,
    naturalWidth: Math.round(layer.width),
    naturalHeight: Math.round(layer.height),
    segmentation: {
      source: layer.source || "rembg-u2net",
      confidence: layer.confidence ?? null,
    },
  };
}

function normalizeTextLayer(layer, index) {
  return {
    id: `extracted-text-${index + 1}`,
    name: layer.name || `Text ${index + 1}`,
    type: "text",
    role: "extractedText",
    userAdded: true,
    text: String(layer.text || "").trim(),
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    width: Math.round(layer.width),
    height: Math.round(layer.height),
    rotation: Number.isFinite(Number(layer.rotation)) ? Number(layer.rotation) : 0,
    opacity: 1,
    locked: false,
    editable: true,
    fontFamily: ["Inter", "Arial", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana", "Courier New"].includes(layer.fontFamily)
      ? layer.fontFamily
      : "Arial",
    fontSize: Math.round(layer.fontSize || Math.max(14, layer.height * 0.75)),
    fontWeight: Number(layer.fontWeight) >= 600 ? 700 : 400,
    fontStyle: "normal",
    textDecoration: "",
    fill: layer.fill || "#0f172a",
    align: layer.align || "center",
    lineHeight: Number.isFinite(Number(layer.lineHeight)) ? Number(layer.lineHeight) : 1.15,
    segmentation: {
      source: layer.source || "rapidocr-onnxruntime",
      confidence: layer.confidence ?? null,
      backgroundCleanupQuality: layer.backgroundCleanupQuality || "best-effort",
    },
  };
}

function normalizeLayer(layer, index) {
  if (layer?.type === "text") {
    return normalizeTextLayer(layer, index);
  }

  return normalizeImageLayer(layer, index);
}

export async function createImageToLayersDesignPayload({ dataUrl, fileName }) {
  const { mimeType, buffer } = parseImageDataUrl(dataUrl);
  const jobId = randomUUID();
  const workDir = path.join(tmpdir(), "vyapar-image-to-layers", jobId);
  const inputPath = path.join(workDir, `input.${getFileExtension(mimeType)}`);

  await mkdir(workDir, { recursive: true });

  try {
    await writeFile(inputPath, buffer);
    const result = await runPythonSegmentation(inputPath);

    if (!result.success) {
      return {
        success: false,
        code: result.code || "AI_SEGMENTATION_UNAVAILABLE",
        message: result.message || "Image segmentation is not available in this environment.",
        requirements: result.requirements || [],
      };
    }

    const layers = (result.layers || [])
      .filter(isValidRawLayer)
      .map(normalizeLayer);

    return {
      success: true,
      width: result.width,
      height: result.height,
      fileName: fileName || "Uploaded poster",
      model: result.model || "Image-to-Layers V2",
      summary: result.summary || null,
      note: result.backgroundSrc
        ? "Background was reconstructed with local CPU inpainting over extracted object/text masks."
        : "Background uses the original uploaded image because cleaned background reconstruction was not available.",
      backgroundQuality: result.backgroundQuality || "high",
      backgroundProvider: result.backgroundProvider || "generative_inpaint",
      removalMaskSrc: result.removalMaskSrc || "",
      background: {
        type: "image",
        src: result.backgroundSrc || dataUrl,
        locked: true,
        editable: false,
        quality: result.backgroundQuality || "high",
        provider: result.backgroundProvider || "basicOpenCV",
        reconstruction: result.backgroundSrc ? "opencv-telea-inpainting" : "original-image-no-inpainting",
      },
      layers,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
