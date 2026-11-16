// Implements the backend image to layers service.
/* global process */
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// Checks whether positive frame.
function isPositiveFrame(layer) {
  return [layer?.x, layer?.y, layer?.width, layer?.height].every((value) => Number.isFinite(Number(value))) && Number(layer.width) > 0 && Number(layer.height) > 0;
}

// Checks whether valid output image data url.
function isValidOutputImageDataUrl(value) {
  if (!VALID_OUTPUT_IMAGE_DATA_URL.test(String(value || ""))) return false;

  try {
    const [, base64 = ""] = String(value).split(",");
    return Buffer.from(base64, "base64").length > 0;
  } catch {
    return false;
  }
}

// Checks whether valid raw layer.
function isValidRawLayer(layer) {
  if (!isPositiveFrame(layer)) return false;
  if (layer?.type === "text") return typeof layer.text === "string" && layer.text.trim().length > 0;
  return isValidOutputImageDataUrl(layer?.src);
}

// Parses image data url.
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

// Gets file extension.
function getFileExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

// Resolves a potential Python executable path across supported relative and absolute locations.
export function resolvePythonPath(rawCandidate) {
  if (!rawCandidate || typeof rawCandidate !== "string") return null;
  const trimmed = rawCandidate.trim();
  if (!trimmed) return null;

  if (path.isAbsolute(trimmed)) {
    return existsSync(trimmed) ? path.normalize(trimmed) : null;
  }

  // Check candidate base directories for relative paths
  const baseDirs = [
    process.cwd(),
    path.resolve(__dirname, "../../"),
    path.resolve(process.cwd(), "server"),
    path.resolve(__dirname, "../../../"),
  ];

  for (const baseDir of baseDirs) {
    const candidate = path.resolve(baseDir, trimmed);
    if (existsSync(candidate)) {
      return path.normalize(candidate);
    }
  }

  return null;
}

// Ensures a virtual environment's pyvenv.cfg points to a valid base Python on this machine.
export function ensureVenvConfigValid(pythonBinaryPath) {
  try {
    if (process.platform !== "win32") return;
    const venvDir = path.resolve(path.dirname(pythonBinaryPath), "..");
    const cfgPath = path.join(venvDir, "pyvenv.cfg");
    if (!existsSync(cfgPath)) return;

    const content = readFileSync(cfgPath, "utf-8");
    const homeMatch = content.match(/^home\s*=\s*(.+)$/m);
    if (!homeMatch) return;

    const currentHome = homeMatch[1].trim();
    const currentExe = path.join(currentHome, "python.exe");
    if (existsSync(currentHome) && existsSync(currentExe)) {
      return;
    }

    // Current home base runtime is invalid or does not exist on this machine.
    // Dynamically look for an existing Python base installation without hardcoding personal paths.
    const candidates = [];
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python"));
      candidates.push(path.join(process.env.USERPROFILE, "AppData", "Local", "Programs", "Python", "Python312"));
      candidates.push(path.join(process.env.USERPROFILE, "AppData", "Local", "Programs", "Python", "Python311"));
      candidates.push(path.join(process.env.USERPROFILE, "AppData", "Local", "Programs", "Python", "Python310"));
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "Python", "Python312"));
      candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "Python", "Python311"));
    }
    candidates.push("C:\\Python312", "C:\\Python311", "C:\\Python310");

    const validCandidate = candidates.find((dir) => existsSync(dir) && existsSync(path.join(dir, "python.exe")));
    if (validCandidate) {
      const updatedContent = content
        .replace(/^home\s*=.*$/m, `home = ${validCandidate}`)
        .replace(/^executable\s*=.*$/m, `executable = ${path.join(validCandidate, "python.exe")}`);
      writeFileSync(cfgPath, updatedContent, "utf-8");
    }
  } catch {
    // Non-fatal, let process execution surface specific errors
  }
}

// Selects the Python executable path, honoring PYTHON_BIN as preferred.
export function getPythonBinary() {
  const configuredPython = process.env.PYTHON_BIN?.trim();

  // 1. If PYTHON_BIN is configured, prioritize it
  if (configuredPython) {
    const resolvedConfigured = resolvePythonPath(configuredPython);
    if (resolvedConfigured) {
      ensureVenvConfigValid(resolvedConfigured);
      return resolvedConfigured;
    }

    const error = new Error(
      `Configured Python executable was not found: "${configuredPython}". Verify PYTHON_BIN in server/.env or unset it to use the default virtual environment.`
    );
    error.statusCode = 503;
    throw error;
  }

  // 2. Auto-discovery fallback: local project virtual environment (.venv-image-to-layers)
  const defaultVenvRel = process.platform === "win32" ? ".venv-image-to-layers/Scripts/python.exe" : ".venv-image-to-layers/bin/python";
  const defaultVenvPath = resolvePythonPath(defaultVenvRel);
  if (defaultVenvPath) {
    ensureVenvConfigValid(defaultVenvPath);
    return defaultVenvPath;
  }

  // 3. Fallback to system Python executable
  return process.platform === "win32" ? "python" : "python3";
}

function runPythonSegmentation(inputPath) {
  const pythonBinary = getPythonBinary();
  const pythonArgs = [PYTHON_SCRIPT_PATH, "--input", inputPath];

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
        error.message = `Python executable was not found at "${pythonBinary}". Install Python and the Image to Layers requirements, or configure PYTHON_BIN in server/.env.`;
      }
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      let payload;
      try {
        payload = JSON.parse(stdout || "{}");
      } catch {
        if (/No Python at/i.test(stderr)) {
          const error = new Error(`Python virtual environment launcher error: ${stderr.trim()}. The base Python runtime configured in pyvenv.cfg was not found.`);
          error.statusCode = 503;
          reject(error);
          return;
        }
        const error = new Error(stderr || "Python segmentation service returned an invalid response.");
        error.statusCode = 502;
        reject(error);
        return;
      }

      if (code !== 0 && payload?.success !== false) {
        if (/No Python at/i.test(stderr)) {
          const error = new Error(`Python virtual environment launcher error: ${stderr.trim()}. The base Python runtime configured in pyvenv.cfg was not found.`);
          error.statusCode = 503;
          reject(error);
          return;
        }
        const error = new Error(stderr || `Python segmentation service exited with code ${code}.`);
        error.statusCode = 502;
        reject(error);
        return;
      }

      resolve(payload);
    });
  });
}

// Makes the image layer value consistent.
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

// Makes the text layer value consistent.
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

// Makes the layer value consistent.
function normalizeLayer(layer, index) {
  if (layer?.type === "text") {
    return normalizeTextLayer(layer, index);
  }

  return normalizeImageLayer(layer, index);
}

// Creates image to layers design payload.
export async function createImageToLayersDesignPayload({ dataUrl, fileName }) {
  const { mimeType, buffer } = parseImageDataUrl(dataUrl);
  const jobId = randomUUID();
  const workDir = path.join(tmpdir(), "usk-image-to-layers", jobId);
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
