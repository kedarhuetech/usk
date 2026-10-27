#!/usr/bin/env python3
# Implements the backend image to layers service.
"""
Image -> Layers ("Magic Layers" style).

Splits a flat image (poster, flyer, social post...) into:
  * a clean background with the extracted content removed,
  * separate cut-out image objects with soft edges,
  * editable text layers (paragraphs, colour, weight, alignment, rotation).

Output is a single JSON document on stdout (same contract as before).

Optional: pass --lama-model /path/to/lama_fp32.onnx (or set MAGIC_LAYERS_LAMA_MODEL)
to use a LaMa ONNX inpainting model for real generative background fill on large holes.
"""
import argparse
import base64
import io
import json
import math
import os
import re
import sys
import traceback

RUNTIME_REQUIREMENTS = [
    "Python 3.10+",
    "Pillow",
    "numpy",
    "rembg",
    "onnxruntime",
    "opencv-python (required)",
    "rapidocr-onnxruntime (recommended for editable text extraction)",
    "ISNet model weights downloaded by rembg on first run",
    "optional: SAM 2 package and checkpoint for multi-object automatic masks",
    "optional: LaMa ONNX inpainting model (--lama-model) for generative background fill",
]

# Text that looks like a stock-site watermark / template placeholder is never turned
# into a layer and is left untouched in the background.
WATERMARK_PATTERNS = [
    "postermywall",
    "poster my wall",
    "madewiti",
    "made with",
    "www.website",
    "website.org",
    "contact@gmail",
    "follow&share",
    "follow & share",
    "watermark",
    "sample text",
]

# Optional OCR fix-ups, loaded with --corrections corrections.json ({"wrong": "right"}).
# Matched on word boundaries, case-insensitive.
TEXT_CORRECTIONS = {}
COMMON_POSTER_WORDS = set(
    "a an and are best big buy by call celebrate choose classic collection color colours come "
    "contact crafted day deal deals delicious discount discover enjoy event exclusive experience "
    "fashion festive food for free fresh from get grand happy health hello home hot in india "
    "limited made new offer of on online only open order our party price quality sale save "
    "shop special spring start style summer today top up use visit welcome while with year "
    "diwali holi ganesh christmas eid navratri wedding anniversary birthday festival season "
    "50 off percent percentoff store service product sale sales now today tomorrow launch yours "
    "sale offer offers upto up to more one amazing fabulous perfect premium beautiful "
    "restaurant cafe bakery salon studio boutique market business growth fresh organic "
    "summer winter monsoon festive client customer customers thank you poster magic layer layers"
    .split()
)


# This helper handles result logic.
def respond(payload):
    print(json.dumps(payload), flush=True)


# This helper handles result logic.
def unavailable(message):
    respond(
        {
            "success": False,
            "code": "AI_RUNTIME_UNAVAILABLE",
            "message": message,
            "requirements": RUNTIME_REQUIREMENTS,
        }
    )


try:
    import numpy as np
    import onnxruntime as ort
    import cv2
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    from rembg import new_session, remove
except Exception:
    unavailable(
        "Real image segmentation is not installed. Install the Python image segmentation "
        "runtime (Pillow, numpy, opencv-python, rembg, onnxruntime) before using Image to Layers."
    )
    sys.exit(0)

try:
    from rapidocr_onnxruntime import RapidOCR
except Exception:
    RapidOCR = None


# ==============================================================================
# Small helpers
# ==============================================================================
def image_to_data_url(image, image_format="PNG", **save_options):
    output = io.BytesIO()
    image.save(output, format=image_format, **save_options)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    mime_type = "jpeg" if image_format.upper() == "JPEG" else image_format.lower()
    return f"data:image/{mime_type};base64,{encoded}"


# This helper handles result logic.
def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


# This helper handles result logic.
def odd(value, minimum=3):
    value = max(int(minimum), int(round(value)))
    return value if value % 2 == 1 else value + 1


# This helper handles kernel logic.
def box_kernel(size):
    return np.ones((size, size), np.uint8)


# This helper handles to hex logic.
def rgb_to_hex(color):
    red, green, blue = [int(clamp(int(channel), 0, 255)) for channel in color[:3]]
    return f"#{red:02x}{green:02x}{blue:02x}"


# This helper handles distance logic.
def color_distance(hex_a, hex_b):
    a = [int(hex_a[i : i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i : i + 2], 16) for i in (1, 3, 5)]
    return math.sqrt(sum((p - q) ** 2 for p, q in zip(a, b)))


# Loads text corrections.
def load_text_corrections(path):
    if not path:
        return
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            TEXT_CORRECTIONS.update({str(k): str(v) for k, v in data.items()})
    except Exception:
        pass


# Cleans text.
def sanitize_text(text):
    clean = " ".join(str(text).split())
    for bad, good in TEXT_CORRECTIONS.items():
        clean = re.sub(r"\b" + re.escape(bad) + r"\b", good, clean, flags=re.IGNORECASE)
    return clean


# Loads image.
def load_image(input_path):
    image = Image.open(input_path)
    image = ImageOps.exif_transpose(image)  # match what browsers/editors display
    return image.convert("RGBA")


# ==============================================================================
# TEXT: detection -> lines -> glyph-level masks -> paragraphs
# ==============================================================================
def estimate_text_color(original_array, x, y, width, height):
    """Fallback colour estimate when glyph segmentation is unreliable."""
    try:
        crop = original_array[y : y + height, x : x + width, :3]
        if crop.size == 0:
            return "#0f172a"
        gray = np.mean(crop, axis=2)
        dark_pixels = crop[gray < 110]
        light_pixels = crop[gray > 170]
        if len(dark_pixels) > len(light_pixels) and len(dark_pixels) > 0:
            return rgb_to_hex(np.median(dark_pixels, axis=0))
        if len(light_pixels) > 0:
            return rgb_to_hex(np.median(light_pixels, axis=0))
        return rgb_to_hex(np.median(crop.reshape(-1, 3), axis=0))
    except Exception:
        return "#0f172a"


# This helper handles font candidates logic.
def available_font_candidates(bold=False):
    """Return common editor fonts installed on this backend for raster matching."""
    windows_fonts = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    candidates = {
        "Arial": ["arialbd.ttf" if bold else "arial.ttf", "arial.ttf"],
        "Georgia": ["georgiab.ttf" if bold else "georgia.ttf", "georgia.ttf"],
        "Times New Roman": ["timesbd.ttf" if bold else "times.ttf", "times.ttf"],
        "Trebuchet MS": ["trebucbd.ttf" if bold else "trebuc.ttf", "trebuc.ttf"],
        "Verdana": ["verdanab.ttf" if bold else "verdana.ttf", "verdana.ttf"],
        "Courier New": ["courbd.ttf" if bold else "cour.ttf", "cour.ttf"],
    }
    for family in candidates:
        for name in candidates[family]:
            path = os.path.join(windows_fonts, name)
            if os.path.isfile(path):
                yield family, path

    # Linux service deployments often provide metrically-compatible Microsoft
    # font substitutes through Liberation Fonts.
    linux_candidates = {
        "Arial": "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "Georgia": "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "Times New Roman": "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
        "Trebuchet MS": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "Verdana": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "Courier New": "/usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
    }
    for family, path in linux_candidates.items():
        if os.path.isfile(path):
            yield family, path


# This helper handles font family logic.
def estimate_font_family(glyph_mask, text, bold=False):
    """Find the closest installed editor font by comparing rendered glyph shapes."""
    try:
        ys, xs = np.nonzero(glyph_mask)
        if not len(xs) or not text:
            return "Arial"
        target = (glyph_mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1] > 0).astype("uint8")
        target_h, target_w = target.shape[:2]
        best_family, best_score = "Arial", -1.0
        render_size = max(12, target_h * 2)
        for family, path in available_font_candidates(bold):
            font = ImageFont.truetype(path, render_size)
            bounds = font.getbbox(text)
            canvas = Image.new("L", (max(1, bounds[2] - bounds[0]), max(1, bounds[3] - bounds[1])), 0)
            ImageDraw.Draw(canvas).text((-bounds[0], -bounds[1]), text, font=font, fill=255)
            source = np.asarray(canvas)
            for height_scale in (0.92, 1.0, 1.08):
                scaled_h = max(1, int(round(target_h * height_scale)))
                scaled_w = max(1, int(round(source.shape[1] * scaled_h / max(1, source.shape[0]))))
                scaled = cv2.resize(source, (scaled_w, scaled_h), interpolation=cv2.INTER_AREA) >= 96
                rendered = np.zeros((target_h, target_w), dtype=bool)
                copy_w, copy_h = min(target_w, scaled_w), min(target_h, scaled_h)
                src_x, src_y = max(0, (scaled_w - copy_w) // 2), max(0, (scaled_h - copy_h) // 2)
                dst_x, dst_y = max(0, (target_w - copy_w) // 2), max(0, (target_h - copy_h) // 2)
                rendered[dst_y : dst_y + copy_h, dst_x : dst_x + copy_w] = scaled[src_y : src_y + copy_h, src_x : src_x + copy_w]
                intersection = int(np.count_nonzero(rendered & (target > 0)))
                dice = (2.0 * intersection) / max(1, int(np.count_nonzero(rendered)) + int(np.count_nonzero(target)))
                if dice > best_score:
                    best_family, best_score = family, dice
        return best_family
    except Exception:
        return "Arial"


# Checks whether clean text.
def is_clean_text(text, score, y, total_height):
    text_clean = text.strip()
    if not text_clean or score < 0.65:
        return False

    lower = text_clean.lower()
    for pattern in WATERMARK_PATTERNS:
        if pattern in lower:
            return False

    if len(text_clean) <= 3 and score < 0.76:
        return False

    margin_ratio = float(y) / float(total_height)
    if (margin_ratio > 0.94 or margin_ratio < 0.04) and any(
        kw in lower for kw in ["www", "com", "gmail", "made", "wall", "follow"]
    ):
        return False

    return True


# Parses ocr box.
def parse_ocr_box(item, total_height):
    if not isinstance(item, (list, tuple)) or len(item) < 3:
        return None
    try:
        quad = np.array(item[0], dtype="float32").reshape(-1, 2)
        score = float(item[2] or 0)
    except Exception:
        return None
    if quad.shape[0] < 4:
        return None

    text = sanitize_text(item[1] or "")
    x_min, y_min = quad.min(axis=0)
    x_max, y_max = quad.max(axis=0)
    if not is_clean_text(text, score, float(y_min), total_height):
        return None

    tl, tr, bl = quad[0], quad[1], quad[3]
    angle = math.degrees(math.atan2(float(tr[1] - tl[1]), float(tr[0] - tl[0])))
    if abs(angle) < 2.5:
        angle = 0.0

    if angle == 0.0:
        x, y = float(x_min), float(y_min)
        w, h = float(x_max - x_min), float(y_max - y_min)
    else:
        w = float(np.linalg.norm(tr - tl))
        h = float(np.linalg.norm(bl - tl))
        cx, cy = quad.mean(axis=0)
        x, y = float(cx) - w / 2.0, float(cy) - h / 2.0

    if w < 14 or h < 10:
        return None

    return {
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "angle": angle,
        "quad": quad[:4],
        "bbox": (float(x_min), float(y_min), float(x_max), float(y_max)),
        "text": text,
        "score": score,
    }


# Groups text boxes into lines.
def group_text_boxes_into_lines(parsed_boxes):
    """Merge OCR fragments that sit on the same baseline into one line. Rotated text stays as-is."""
    upright = sorted([b for b in parsed_boxes if b["angle"] == 0.0], key=lambda b: (b["y"], b["x"]))
    rotated = [b for b in parsed_boxes if b["angle"] != 0.0]
    line_groups = []

    for box in upright:
        placed = False
        box_cy = box["y"] + box["h"] / 2.0
        for group in line_groups:
            group_h = sum(b["h"] for b in group) / float(len(group))
            group_cy = sum(b["y"] + b["h"] / 2.0 for b in group) / float(len(group))
            if abs(box_cy - group_cy) < (group_h * 0.28):
                max_gap = max(15, int(group_h * 1.1))
                close_enough = any(
                    abs(box["x"] - (b["x"] + b["w"])) <= max_gap or abs((box["x"] + box["w"]) - b["x"]) <= max_gap
                    for b in group
                )
                if close_enough:
                    group.append(box)
                    placed = True
                    break
        if not placed:
            line_groups.append([box])

    lines = []
    for group in line_groups:
        if len(group) == 1:
            lines.append(group[0])
            continue
        group.sort(key=lambda b: b["x"])
        x0 = min(b["x"] for b in group)
        y0 = min(b["y"] for b in group)
        x1 = max(b["x"] + b["w"] for b in group)
        y1 = max(b["y"] + b["h"] for b in group)
        lines.append(
            {
                "x": x0,
                "y": y0,
                "w": x1 - x0,
                "h": y1 - y0,
                "angle": 0.0,
                "quad": np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype="float32"),
                "bbox": (x0, y0, x1, y1),
                "text": " ".join(b["text"] for b in group),
                "score": sum(b["score"] for b in group) / float(len(group)),
            }
        )
    return lines + rotated


# This helper handles text lines logic.
def detect_text_lines(rgb):
    if RapidOCR is None:
        return []
    height = rgb.shape[0]
    try:
        engine = RapidOCR()
        # OCR at native size and one enlarged scale. The second pass recovers small
        # poster copy; coordinates are mapped back to the source image before NMS.
        candidates = []
        longest = max(rgb.shape[:2])
        scales = [1.0]
        if longest < 2400:
            scales.append(min(1.6, 2400.0 / longest))

        for scale in scales:
            if scale == 1.0:
                working = rgb
            else:
                working = cv2.resize(
                    rgb,
                    (int(round(rgb.shape[1] * scale)), int(round(rgb.shape[0] * scale))),
                    interpolation=cv2.INTER_CUBIC,
                )
            result, _elapsed = engine(cv2.cvtColor(working, cv2.COLOR_RGB2BGR))
            if not result:
                continue
            for item in result[:300]:
                if scale != 1.0:
                    item = (np.asarray(item[0], dtype="float32") / scale, item[1], item[2])
                parsed = parse_ocr_box(item, height)
                if parsed:
                    candidates.append(parsed)
    except Exception:
        return []

    # Keep the highest-confidence version of each region when native and enlarged
    # passes find the same words. NMS runs before line grouping so text lines do
    # not get duplicated or artificially bolded by overlapping masks.
    kept = []
    for candidate in sorted(candidates, key=lambda box: box["score"], reverse=True):
        x0, y0, x1, y1 = candidate["bbox"]
        area = max(1.0, (x1 - x0) * (y1 - y0))
        duplicate = False
        for existing in kept:
            ex0, ey0, ex1, ey1 = existing["bbox"]
            intersection = max(0.0, min(x1, ex1) - max(x0, ex0)) * max(0.0, min(y1, ey1) - max(y0, ey0))
            existing_area = max(1.0, (ex1 - ex0) * (ey1 - ey0))
            union = area + existing_area - intersection
            overlap = intersection / max(1.0, union)
            containment = intersection / max(1.0, min(area, existing_area))
            if overlap >= 0.48 or containment >= 0.78:
                duplicate = True
                break
        if not duplicate:
            kept.append(candidate)

    return group_text_boxes_into_lines(kept)


# This helper handles line glyphs logic.
def analyze_line_glyphs(line, rgb):
    """
    Pixel-accurate text analysis for one line: which pixels are ink, what colour the ink is,
    and roughly how heavy the strokes are. This gives (a) a tight mask so only the letters are
    erased from the background, and (b) a real fill colour instead of a light/dark guess.
    Falls back to the padded box when the text/background contrast is unusable.
    """
    height_img, width_img = rgb.shape[:2]
    x_min, y_min, x_max, y_max = line["bbox"]
    pad = max(3, int(line["h"] * 0.25))
    x0 = int(clamp(math.floor(x_min) - pad, 0, width_img - 1))
    y0 = int(clamp(math.floor(y_min) - pad, 0, height_img - 1))
    x1 = int(clamp(math.ceil(x_max) + pad, x0 + 1, width_img))
    y1 = int(clamp(math.ceil(y_max) + pad, y0 + 1, height_img))

    crop = rgb[y0:y1, x0:x1].astype("float32")
    ch, cw = crop.shape[:2]

    poly = np.zeros((ch, cw), np.uint8)
    pts = np.round(line["quad"] - np.array([x0, y0], dtype="float32")).astype("int32")
    cv2.fillPoly(poly, [pts], 255)
    inside = poly > 0

    # Handles result.
    def fallback():
        return {
            "origin": (x0, y0),
            "mask": cv2.dilate(poly, box_kernel(odd(pad))),
            "fill": estimate_text_color(rgb, int(x_min), int(y_min), int(line["w"]), int(line["h"])),
            "reliable": False,
            "weight": 400,
            "font_family": "Arial",
            "word_break_ratios": [],
        }

    gap = max(1, pad // 2)
    ring = cv2.dilate(poly, box_kernel(2 * gap + 1)) == 0
    if int(ring.sum()) < 24:
        return fallback()

    background = np.median(crop[ring], axis=0)
    dist = np.linalg.norm(crop - background, axis=2)
    inside_values = dist[inside]
    if inside_values.size == 0 or float(inside_values.max()) < 28.0:
        return fallback()

    scaled = np.clip(dist / float(inside_values.max()) * 255.0, 0, 255).astype("uint8")
    scaled[~inside] = 0
    threshold, _ = cv2.threshold(scaled[inside].reshape(-1, 1), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    glyph = ((scaled > threshold) & inside).astype("uint8") * 255

    coverage = float(np.count_nonzero(glyph)) / float(max(1, np.count_nonzero(inside)))
    if coverage < 0.03 or coverage > 0.72:
        return fallback()

    ink_dist = dist[glyph > 0]
    strongest = (glyph > 0) & (dist >= np.percentile(ink_dist, 60))
    fill_pixels = crop[strongest] if strongest.any() else crop[glyph > 0]
    fill = rgb_to_hex(np.median(fill_pixels, axis=0))

    # Stroke thickness relative to line height -> rough regular/bold guess.
    dt = cv2.distanceTransform(glyph, cv2.DIST_L2, 3)
    positive = dt[dt > 0]
    stroke = 2.0 * float(np.percentile(positive, 90)) if positive.size else 0.0
    weight = 700 if (stroke / max(1.0, line["h"])) > 0.14 else 400

    removal = cv2.dilate(glyph, box_kernel(odd(line["h"] * 0.08)))
    word_break_ratios = []
    if line["angle"] == 0.0:
        active_columns = np.count_nonzero(glyph, axis=0) >= max(1, int(line["h"] * 0.025))
        active = np.flatnonzero(active_columns)
        if active.size > 1:
            gaps = []
            for left, right in zip(active[:-1], active[1:]):
                gap_width = int(right - left - 1)
                if gap_width > 0:
                    gaps.append((int(left + 1), int(right), gap_width))
            if gaps:
                typical_gap = float(np.median([gap[2] for gap in gaps]))
                min_word_gap = max(4.0, line["h"] * 0.12, typical_gap * 2.4)
                glyph_left, glyph_right = int(active[0]), int(active[-1])
                span = max(1, glyph_right - glyph_left)
                word_break_ratios = [
                    ((left + right) / 2.0 - glyph_left) / span
                    for left, right, gap_width in gaps
                    if gap_width >= min_word_gap
                    and (left + right) / 2.0 > glyph_left + span * 0.08
                    and (left + right) / 2.0 < glyph_right - span * 0.08
                ]

    return {
        "origin": (x0, y0),
        "mask": removal,
        "fill": fill,
        "reliable": True,
        "weight": weight,
        "font_family": estimate_font_family(glyph, line["text"], weight >= 600),
        "word_break_ratios": word_break_ratios,
    }


# This helper handles ocr word spaces logic.
def restore_ocr_word_spaces(text, glyphs):
    """Restore visually clear word gaps when OCR returns a joined phrase."""
    if not text or any(char.isspace() for char in text):
        return text
    breaks = sorted(glyphs.get("word_break_ratios", []))
    if len(text) < 6:
        return text

    boundaries = []
    for ratio in breaks:
        boundary = int(round(ratio * len(text)))
        if 1 <= boundary < len(text) and (not boundaries or boundary - boundaries[-1] >= 2):
            boundaries.append(boundary)
    for boundary in reversed(boundaries):
        text = text[:boundary] + " " + text[boundary:]
    if boundaries:
        return text

    # OCR sometimes fuses words whose typeface has tight kerning. Only split if
    # every resulting token is a common, unambiguous poster word; otherwise leave
    # the OCR transcription untouched for the user to edit.
    compact = re.sub(r"[^A-Za-z]", "", text).lower()
    if len(compact) < 7:
        return text
    memo = {len(compact): []}
    for start in range(len(compact) - 1, -1, -1):
        best = None
        for end in range(start + 2, len(compact) + 1):
            word = compact[start:end]
            if word not in COMMON_POSTER_WORDS or end not in memo or memo[end] is None:
                continue
            candidate = [word] + memo[end]
            # Prefer fewer tokens; ties prefer longer first words.
            if best is None or (len(candidate), -len(word)) < (len(best), -len(best[0])):
                best = candidate
        memo[start] = best
    parts = memo.get(0)
    if parts and len(parts) >= 2 and all(len(part) >= 2 for part in parts):
        cursor = 0
        output = []
        for part in parts:
            end = cursor + len(part)
            output.append(text[cursor:end])
            cursor = end
        return " ".join(output)
    return text


# This helper handles inpainting quality logic.
def evaluate_inpainting_quality(original_bgr, trial_inpainted_bgr, x, y, w, h):
    try:
        orig_crop = original_bgr[y : y + h, x : x + w]
        inp_crop = trial_inpainted_bgr[y : y + h, x : x + w]
        if orig_crop.size == 0 or inp_crop.size == 0:
            return False

        orig_gray = cv2.cvtColor(orig_crop, cv2.COLOR_BGR2GRAY)
        inp_gray = cv2.cvtColor(inp_crop, cv2.COLOR_BGR2GRAY)

        inp_std = float(np.std(inp_gray))
        diff_mean = abs(float(np.mean(orig_gray)) - float(np.mean(inp_gray)))
        return not (diff_mean > 38 or inp_std > 45)
    except Exception:
        return False


# This helper handles cleanup ok logic.
def local_cleanup_ok(bgr, glyphs):
    """Trial-inpaint just a small window around this text (not the whole image) and sanity check it."""
    try:
        gx, gy = glyphs["origin"]
        mask = glyphs["mask"]
        mh, mw = mask.shape[:2]
        height, width = bgr.shape[:2]
        margin = 10
        wx0, wy0 = max(0, gx - margin), max(0, gy - margin)
        wx1, wy1 = min(width, gx + mw + margin), min(height, gy + mh + margin)
        window = bgr[wy0:wy1, wx0:wx1]
        window_mask = np.zeros(window.shape[:2], np.uint8)
        window_mask[gy - wy0 : gy - wy0 + mh, gx - wx0 : gx - wx0 + mw] = mask
        trial = cv2.inpaint(window, window_mask, 5, cv2.INPAINT_TELEA)
        return evaluate_inpainting_quality(window, trial, gx - wx0, gy - wy0, mw, mh)
    except Exception:
        return False


# This helper handles belong together logic.
def lines_belong_together(prev, cur, image_width):
    """Would a designer have typed these as one multi-line text box?"""
    if prev["angle"] != 0.0 or cur["angle"] != 0.0:
        return False
    ratio = cur["h"] / max(1.0, prev["h"])
    if not 0.78 <= ratio <= 1.28:
        return False
    gap = cur["y"] - (prev["y"] + prev["h"])
    if gap < -0.25 * prev["h"] or gap > 0.85 * prev["h"]:
        return False
    tolerance = max(0.6 * prev["h"], 0.02 * image_width)
    left = abs(cur["x"] - prev["x"])
    right = abs((cur["x"] + cur["w"]) - (prev["x"] + prev["w"]))
    center = abs((cur["x"] + cur["w"] / 2.0) - (prev["x"] + prev["w"] / 2.0))
    if min(left, right, center) > tolerance:
        return False
    if color_distance(cur["glyphs"]["fill"], prev["glyphs"]["fill"]) > 70:
        return False
    return (
        cur["glyphs"]["weight"] == prev["glyphs"]["weight"]
        and cur["glyphs"]["font_family"] == prev["glyphs"]["font_family"]
    )


# Builds text layers.
def build_text_layers(lines, image_width, image_height):
    ordered = sorted(lines, key=lambda l: (l["y"], l["x"]))
    paragraphs = []
    for line in ordered:
        for paragraph in paragraphs:
            if lines_belong_together(paragraph[-1], line, image_width):
                paragraph.append(line)
                break
        else:
            paragraphs.append([line])

    layers = []
    for paragraph in paragraphs:
        x0 = min(l["x"] for l in paragraph)
        y0 = min(l["y"] for l in paragraph)
        x1 = max(l["x"] + l["w"] for l in paragraph)
        y1 = max(l["y"] + l["h"] for l in paragraph)

        heights = sorted(l["h"] for l in paragraph)
        median_h = heights[len(heights) // 2]
        font_size = int(clamp(median_h * 0.82, 8, max(14, image_height * 0.4)))

        line_height = 1.2
        if len(paragraph) > 1:
            centers = [l["y"] + l["h"] / 2.0 for l in paragraph]
            pitch = (centers[-1] - centers[0]) / float(len(centers) - 1)
            line_height = round(clamp(pitch / max(1.0, font_size), 0.9, 2.2), 2)

        if len(paragraph) == 1:
            box_cx = x0 + (x1 - x0) / 2.0
            if abs(box_cx - image_width / 2.0) < image_width * 0.25:
                align = "center"
            elif box_cx < image_width * 0.35:
                align = "left"
            elif box_cx > image_width * 0.65:
                align = "right"
            else:
                align = "center"
        else:
            spreads = {
                "left": max(l["x"] for l in paragraph) - min(l["x"] for l in paragraph),
                "center": max(l["x"] + l["w"] / 2.0 for l in paragraph) - min(l["x"] + l["w"] / 2.0 for l in paragraph),
                "right": max(l["x"] + l["w"] for l in paragraph) - min(l["x"] + l["w"] for l in paragraph),
            }
            align = min(("left", "center", "right"), key=lambda k: spreads[k])

        fills = sorted(l["glyphs"]["fill"] for l in paragraph)
        text = "\n".join(l["text"] for l in paragraph)
        all_ok = all(l["glyphs"]["reliable"] and l["glyphs"]["cleanup_ok"] for l in paragraph)

        layers.append(
            {
                "id": f"text-{len(layers) + 1}",
                "name": f"Text: {text.replace(chr(10), ' ')[:22]}",
                "type": "text",
                "role": "extractedText",
                "text": text,
                "x": int(round(x0)),
                "y": int(round(y0)),
                "width": max(40, int(round(x1 - x0))),
                "height": max(18, int(round(y1 - y0))),
                "fontFamily": paragraph[0]["glyphs"]["font_family"],
                "fontSize": font_size,
                "fontWeight": int(paragraph[0]["glyphs"]["weight"]),
                "lineHeight": float(line_height),
                "rotation": round(float(paragraph[0]["angle"]), 1),
                "fill": fills[len(fills) // 2],
                "align": align,
                "editable": True,
                "locked": False,
                "confidence": round(sum(l["score"] for l in paragraph) / float(len(paragraph)), 2),
                "backgroundCleanupQuality": "high" if all_ok else "best-effort",
                "source": "rapidocr-onnxruntime",
            }
        )
    return layers


# ==============================================================================
# BACKGROUND RECONSTRUCTION PROVIDERS
# ==============================================================================
class BaseBackgroundReconstructionProvider:
    # Handles result.
    def reconstruct(self, original_bgr, removal_mask):
        """Return (bgr_image, quality, provider_id)."""
        raise NotImplementedError


# Represents the open cv basic provider data or behavior.
class OpenCVBasicProvider(BaseBackgroundReconstructionProvider):
    """TELEA inpainting: good for thin/small holes such as text strokes and small objects."""

    # Handles result.
    def reconstruct(self, original_bgr, removal_mask):
        if removal_mask is None or cv2.countNonZero(removal_mask) == 0:
            return original_bgr.copy(), "high", "opencv_basic"
        dilated_mask = cv2.dilate(removal_mask, box_kernel(5), iterations=1)
        try:
            return cv2.inpaint(original_bgr, dilated_mask, 5, cv2.INPAINT_TELEA), "high", "opencv_basic"
        except Exception:
            return original_bgr.copy(), "low", "opencv_basic"


# Represents the multi scale fill provider data or behavior.
class MultiScaleFillProvider(BaseBackgroundReconstructionProvider):
    """
    Classical fill for large holes. TELEA alone smears streaks across big regions, so:
      1. fill a low-resolution copy to carry gradients/colour across the whole hole,
      2. fill at full resolution for local detail, weighted towards the hole's edge,
      3. blend the two by distance-from-edge and re-inject film grain matched to the surroundings.
    It cannot invent new patterns (mandalas, foliage...). Use the LaMa provider for that.
    """

    # Handles result.
    def reconstruct(self, original_bgr, removal_mask):
        if removal_mask is None or cv2.countNonZero(removal_mask) == 0:
            return original_bgr.copy(), "high", "opencv_multiscale"
        try:
            height, width = removal_mask.shape[:2]
            longest = max(height, width)
            mask = (removal_mask > 0).astype("uint8") * 255

            scale = min(1.0, 320.0 / longest)
            sw, sh = max(8, int(width * scale)), max(8, int(height * scale))
            small = cv2.resize(original_bgr, (sw, sh), interpolation=cv2.INTER_AREA)
            small_mask = cv2.resize(mask, (sw, sh), interpolation=cv2.INTER_NEAREST)
            small_mask = cv2.dilate(small_mask, box_kernel(3))
            coarse_small = cv2.inpaint(small, small_mask, 5, cv2.INPAINT_TELEA)
            coarse = cv2.resize(coarse_small, (width, height), interpolation=cv2.INTER_CUBIC)

            fine = cv2.inpaint(original_bgr, mask, 5, cv2.INPAINT_TELEA)

            distance = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
            band = max(6.0, 0.012 * longest)
            weight_fine = np.exp(-distance / band)[:, :, None].astype("float32")
            filled = fine.astype("float32") * weight_fine + coarse.astype("float32") * (1.0 - weight_fine)

            # Grain matching so the patch doesn't look plasticky next to photographic texture.
            gray = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY).astype("float32")
            ring = cv2.bitwise_and(cv2.dilate(mask, box_kernel(odd(0.02 * longest))), cv2.bitwise_not(mask))
            high_pass = gray - cv2.GaussianBlur(gray, (0, 0), 1.5)
            ring_values = high_pass[ring > 0]
            if ring_values.size > 50:
                sigma = min(6.0, float(np.std(ring_values)))
                if sigma > 0.5:
                    noise = np.random.default_rng(7).normal(0.0, sigma, (height, width)).astype("float32")
                    filled += noise[:, :, None]

            inside = (mask > 0)[:, :, None]
            result = np.where(inside, np.clip(filled, 0, 255), original_bgr.astype("float32")).astype("uint8")

            ratio = cv2.countNonZero(mask) / float(height * width)
            return result, ("high" if ratio < 0.15 else "best-effort"), "opencv_multiscale"
        except Exception:
            return OpenCVBasicProvider().reconstruct(original_bgr, removal_mask)


# Represents the lama onnx provider data or behavior.
class LamaOnnxProvider(BaseBackgroundReconstructionProvider):
    """
    Generative inpainting with a LaMa ONNX model (e.g. Carve/LaMa-ONNX lama_fp32.onnx:
    image [1,3,512,512] float 0..1 RGB, mask [1,1,512,512] with 1 = hole).
    Each cluster of holes is inpainted from a square context window around it.
    """

    # Initializes result.
    def __init__(self, model_path):
        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        inputs = self.session.get_inputs()
        self.image_name, self.mask_name = inputs[0].name, inputs[1].name
        shape = inputs[0].shape
        self.size = int(shape[2]) if len(shape) == 4 and isinstance(shape[2], int) else 512

    # Handles result.
    @staticmethod
    def _window(center, size, limit):
        size = min(size, limit)
        start = int(clamp(center - size // 2, 0, limit - size))
        return start, start + size

    # Handles result.
    def reconstruct(self, original_bgr, removal_mask):
        height, width = removal_mask.shape[:2]
        mask = (removal_mask > 0).astype("uint8") * 255
        if cv2.countNonZero(mask) == 0:
            return original_bgr.copy(), "high", "generative_inpaint"

        result = original_bgr.copy()
        merged = cv2.dilate(mask, box_kernel(odd(0.03 * max(height, width))))
        count, labels, stats, _ = cv2.connectedComponentsWithStats((merged > 0).astype("uint8"), 8)
        order = sorted(range(1, count), key=lambda l: -int(stats[l, cv2.CC_STAT_AREA]))[:16]
        done = np.zeros_like(mask)

        for label in order:
            region = cv2.bitwise_and(mask, ((labels == label).astype("uint8") * 255))
            if cv2.countNonZero(region) == 0:
                continue
            x, y, bw, bh = [int(v) for v in stats[label, :4]]
            side = int(max(bw, bh) * 1.6) + 64
            x0, x1 = self._window(x + bw // 2, side, width)
            y0, y1 = self._window(y + bh // 2, side, height)

            crop_bgr = result[y0:y1, x0:x1]
            crop_mask = region[y0:y1, x0:x1]
            ch, cw = crop_mask.shape[:2]

            image_in = cv2.resize(cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB), (self.size, self.size), interpolation=cv2.INTER_AREA)
            mask_in = cv2.resize(crop_mask, (self.size, self.size), interpolation=cv2.INTER_NEAREST)
            image_t = (image_in.astype("float32") / 255.0).transpose(2, 0, 1)[None]
            mask_t = (mask_in > 127).astype("float32")[None, None]

            out = self.session.run(None, {self.image_name: image_t, self.mask_name: mask_t})[0]
            out = np.squeeze(out)
            if out.ndim == 3 and out.shape[0] == 3:
                out = out.transpose(1, 2, 0)
            if float(out.max()) <= 1.5:
                out = out * 255.0
            out = np.clip(out, 0, 255).astype("uint8")
            out_bgr = cv2.cvtColor(cv2.resize(out, (cw, ch), interpolation=cv2.INTER_CUBIC), cv2.COLOR_RGB2BGR)

            hole = (crop_mask > 0).astype("float32")
            feather = np.maximum(hole, cv2.GaussianBlur(hole, (0, 0), 3.0))[:, :, None]
            blended = out_bgr.astype("float32") * feather + crop_bgr.astype("float32") * (1.0 - feather)
            result[y0:y1, x0:x1] = np.clip(blended, 0, 255).astype("uint8")
            done = cv2.bitwise_or(done, region)

        leftover = cv2.bitwise_and(mask, cv2.bitwise_not(done))
        if cv2.countNonZero(leftover) > 0:
            result, _, _ = OpenCVBasicProvider().reconstruct(result, leftover)
        return result, "high", "generative_inpaint"


# Represents the background reconstruction provider factory data or behavior.
class BackgroundReconstructionProviderFactory:
    # Gets provider.
    @staticmethod
    def get_provider(removal_mask, lama_model=None):
        height, width = removal_mask.shape[:2]
        ratio = cv2.countNonZero(removal_mask) / float(height * width)

        if lama_model and ratio > 0.01:
            try:
                return LamaOnnxProvider(lama_model), "generative_inpaint"
            except Exception:
                pass
        if ratio > 0.05:
            return MultiScaleFillProvider(), "opencv_multiscale"
        return OpenCVBasicProvider(), "opencv_basic"


# This helper handles background logic.
def reconstruct_background(bgr, object_mask, text_mask, lama_model=None):
    """Fill the holes left by extracted objects first, then erase remaining text strokes."""
    height, width = bgr.shape[:2]
    if cv2.countNonZero(object_mask) > 0:
        # Grow past the soft cut-out edge so no halo of the object survives in the background.
        object_removal = cv2.dilate(object_mask, box_kernel(odd(0.006 * max(height, width), 9)))
    else:
        object_removal = object_mask

    result, quality, provider_id = bgr.copy(), "high", "opencv_basic"
    if cv2.countNonZero(object_removal) > 0:
        provider, _ = BackgroundReconstructionProviderFactory.get_provider(object_removal, lama_model)
        result, quality, provider_id = provider.reconstruct(result, object_removal)

    leftover_text = cv2.bitwise_and(text_mask, cv2.bitwise_not(object_removal))
    if cv2.countNonZero(leftover_text) > 0:
        result, _, _ = OpenCVBasicProvider().reconstruct(result, leftover_text)

    return result, quality, provider_id, cv2.bitwise_or(object_removal, text_mask)


# ==============================================================================
# OBJECTS: multi-pass segmentation, grouping, soft-edged cut-outs
# ==============================================================================
def split_mask_into_objects(mask, min_area):
    """Split a binary foreground mask into objects; nearby fragments (hair, shadows) stay together."""
    height, width = mask.shape[:2]
    count, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype("uint8"), 8)

    components = []
    union = np.zeros((height, width), dtype="uint8")
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        cw, ch = int(stats[label, cv2.CC_STAT_WIDTH]), int(stats[label, cv2.CC_STAT_HEIGHT])
        if area < min_area or cw < 16 or ch < 16:
            continue
        component = (labels == label).astype("uint8") * 255
        components.append(component)
        union = cv2.bitwise_or(union, component)
    if not components:
        return []

    grouped = cv2.dilate(union, box_kernel(odd(0.003 * max(height, width), 5)))
    group_count, group_labels, group_stats, _ = cv2.connectedComponentsWithStats((grouped > 0).astype("uint8"), 8)

    merged = {}
    for component in components:
        ys, xs = np.nonzero(component)
        group = int(group_labels[ys[0], xs[0]])  # a pixel that really belongs to the component
        merged[group] = cv2.bitwise_or(merged[group], component) if group in merged else component

    objects = []
    for group, group_mask in merged.items():
        gw = int(group_stats[group, cv2.CC_STAT_WIDTH])
        gh = int(group_stats[group, cv2.CC_STAT_HEIGHT])
        if gw < 24 or gh < 24 or cv2.countNonZero(group_mask) <= min_area:
            continue
        objects.append(group_mask)
    return objects


# This helper handles claimed objects logic.
def peel_claimed_objects(original, claimed):
    """Inpaint already-extracted objects away so the segmenter can 'see' the next layer down."""
    bgr = cv2.cvtColor(np.array(original.convert("RGB")), cv2.COLOR_RGB2BGR)
    mask = cv2.dilate(claimed, box_kernel(odd(0.006 * max(bgr.shape[:2]), 9)))
    filled, _, _ = MultiScaleFillProvider().reconstruct(bgr, mask)
    return Image.fromarray(cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)).convert("RGBA")


# This helper handles objects logic.
def discover_objects(original, session, text_rect_mask, passes):
    """
    A saliency segmenter only returns one 'main subject' per run. Magic Layers-style splitting
    needs several, so: segment -> claim objects -> paint them out -> segment again.
    Regions that are mostly text are skipped (they belong to text layers).
    """
    height, width = original.height, original.width
    image_area = height * width
    # Posters often contain small product cutouts and decorations. Keep the
    # floor low enough to retain them; the component dimensions and max-object
    # cap still suppress isolated pixel noise.
    min_area = max(80, int(image_area * 0.0008))

    # SAM 2 proposes multiple object masks from one image. Prefer these when an
    # optional checkpoint is configured; keep the lightweight rembg path as a
    # no-setup fallback for existing installations.
    if isinstance(session, dict) and session.get("engine") == "sam2":
        longest = max(height, width)
        scale = min(1.0, 1536.0 / longest)
        rgb = np.asarray(original.convert("RGB"))
        if scale < 1.0:
            small = cv2.resize(rgb, (int(round(width * scale)), int(round(height * scale))), interpolation=cv2.INTER_AREA)
        else:
            small = rgb

        with session["torch"].inference_mode():
            proposals = session["generator"].generate(small)
        proposals.sort(key=lambda item: (float(item.get("predicted_iou", 0)), int(item.get("area", 0))), reverse=True)
        found = []
        for proposal in proposals:
            small_mask = np.asarray(proposal.get("segmentation"), dtype="uint8")
            if small_mask.ndim != 2:
                continue
            if scale < 1.0:
                mask = cv2.resize(small_mask, (width, height), interpolation=cv2.INTER_NEAREST)
            else:
                mask = small_mask
            mask = (mask > 0).astype("uint8") * 255
            area = cv2.countNonZero(mask)
            if area < min_area or area > 0.78 * image_area:
                continue
            x, y, box_w, box_h = cv2.boundingRect(mask)
            if box_w < 16 or box_h < 16:
                continue
            if cv2.countNonZero(cv2.bitwise_and(mask, text_rect_mask)) / float(area) > 0.55:
                continue

            duplicate = False
            for accepted in found:
                overlap = cv2.countNonZero(cv2.bitwise_and(mask, accepted["mask"]))
                if overlap == 0:
                    continue
                smaller_area = min(area, accepted["area"])
                union_area = area + accepted["area"] - overlap
                if overlap / float(max(1, union_area)) > 0.88 or overlap / float(max(1, smaller_area)) > 0.97:
                    duplicate = True
                    break
            if duplicate:
                continue

            found.append({
                "mask": mask,
                "alpha": mask,
                "area": area,
                "confidence": float(proposal.get("predicted_iou", 0.8)),
                "source": "sam2",
            })
            if len(found) >= 32:
                break
        return found

    current = original
    claimed = np.zeros((height, width), dtype="uint8")
    found = []

    for pass_index in range(max(1, passes)):
        foreground = remove(current, session=session).convert("RGBA")
        alpha = np.array(foreground.getchannel("A"))
        raw = (alpha > 30).astype("uint8") * 255
        claimed_guard = None
        if pass_index > 0:
            claimed_guard = cv2.dilate(claimed, box_kernel(odd(0.01 * max(height, width), 9)))
            raw[claimed_guard > 0] = 0
        raw = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, box_kernel(5))
        raw = cv2.morphologyEx(raw, cv2.MORPH_OPEN, box_kernel(3))
        # Closing can regrow alpha into already-claimed objects. Clear those pixels
        # again after morphology so later passes add newly revealed regions instead
        # of creating overlapping slivers of the same cutout.
        if claimed_guard is not None:
            raw[claimed_guard > 0] = 0

        covered = cv2.countNonZero(raw)
        if covered < min_area or covered > 0.92 * image_area:
            break  # nothing left, or the model thinks the whole canvas is "the subject"

        accepted = 0
        for mask in split_mask_into_objects(raw, min_area):
            area = cv2.countNonZero(mask)
            if area == 0:
                continue
            if cv2.countNonZero(cv2.bitwise_and(mask, text_rect_mask)) / float(area) > 0.6:
                continue
            mean_confidence = float(np.mean(alpha[mask > 0])) / 255.0
            # Later peeling passes operate on an inpainted image. Low-alpha
            # detections from those passes are commonly halos/fragments left by
            # the first cutout, so discard them instead of presenting them as
            # independently movable objects.
            if pass_index > 0 and mean_confidence < 0.62:
                continue
            found.append({"mask": mask, "alpha": alpha, "area": area, "confidence": mean_confidence})
            claimed = cv2.bitwise_or(claimed, mask)
            accepted += 1

        if accepted == 0 or pass_index + 1 >= passes:
            break
        current = peel_claimed_objects(original, claimed)

    return found


# Builds object layers.
def build_object_layers(original, found, text_pixel_mask, max_objects):
    height, width = original.height, original.width
    original_rgba = np.array(original)
    ordered = sorted(found, key=lambda o: o["area"], reverse=True)[:max_objects]

    layers = []
    union_mask = np.zeros((height, width), dtype="uint8")

    for index, obj in enumerate(ordered):
        mask, alpha = obj["mask"], obj["alpha"]
        bx, by, bw, bh = [int(v) for v in cv2.boundingRect(mask)]
        if bw <= 0 or bh <= 0:
            continue

        pad = 4
        x0, y0 = max(0, bx - pad), max(0, by - pad)
        x1, y1 = min(width, bx + bw + pad), min(height, by + bh + pad)

        crop_mask = mask[y0:y1, x0:x1]
        hard = cv2.dilate(crop_mask, box_kernel(5))
        interior = cv2.erode(crop_mask, box_kernel(5))
        soft = cv2.GaussianBlur(alpha[y0:y1, x0:x1], (0, 0), sigmaX=0.8)
        # Opaque interior, soft anti-aliased rim (instead of a hard binary cut).
        layer_alpha = np.where(interior > 0, 255, np.where(hard > 0, soft, 0)).astype("uint8")

        crop_rgb = original_rgba[y0:y1, x0:x1, :3].copy()

        # Text sitting on top of this object lives in its own layer, so heal the object pixels
        # underneath it instead of leaving holes in the cut-out.
        text_here = cv2.bitwise_and(text_pixel_mask[y0:y1, x0:x1], (layer_alpha > 0).astype("uint8") * 255)
        if cv2.countNonZero(text_here) > 0:
            healed = cv2.inpaint(cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2BGR), text_here, 3, cv2.INPAINT_TELEA)
            crop_rgb = cv2.cvtColor(healed, cv2.COLOR_BGR2RGB)

        rgba = np.dstack([crop_rgb, layer_alpha])
        confidence = float(obj.get("confidence", float(np.mean(alpha[mask > 0])) / 255.0 if cv2.countNonZero(mask) else 0.0))

        layers.append(
            {
                "id": f"object-{index + 1}",
                "name": "Main Object" if index == 0 else f"Detected Object {index + 1}",
                "type": "image",
                "role": "extractedObject",
                "src": image_to_data_url(Image.fromarray(rgba)),
                "x": int(x0),
                "y": int(y0),
                "width": int(x1 - x0),
                "height": int(y1 - y0),
                "fit": "stretch",
                "editable": True,
                "locked": False,
                "confidence": round(confidence, 2),
                "source": "sam2-automatic-mask-generator" if obj.get("source") == "sam2" else "rembg-isnet-multipass",
            }
        )
        union_mask = cv2.bitwise_or(union_mask, mask)

    return layers, union_mask


# This helper handles layers for editor logic.
def order_layers_for_editor(object_layers, text_layers):
    """Bottom -> top: large objects, smaller objects, then text (top-to-bottom reading order)."""
    ordered = object_layers + sorted(text_layers, key=lambda t: (t["y"], t["x"]))
    for z_index, layer in enumerate(ordered, start=1):  # background is z = 0
        layer["zIndex"] = z_index
    return ordered


# ==============================================================================
# Pipeline
# ==============================================================================
def create_segmentation_session():
    # rembg.new_session creates and passes its own SessionOptions instance.
    # It reads OMP_NUM_THREADS to configure the CPU session; passing sess_opts
    # here duplicates that positional argument in current rembg releases.
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    checkpoint = os.environ.get("MAGIC_LAYERS_SAM2_CHECKPOINT", "").strip()
    if checkpoint:
        try:
            import torch
            from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
            from sam2.build_sam import build_sam2

            device = "cuda" if torch.cuda.is_available() else "cpu"
            model_config = os.environ.get("MAGIC_LAYERS_SAM2_CONFIG", "configs/sam2.1/sam2.1_hiera_t.yaml")
            model = build_sam2(model_config, checkpoint, device=device)
            generator = SAM2AutomaticMaskGenerator(
                model,
                points_per_side=24,
                pred_iou_thresh=0.72,
                stability_score_thresh=0.88,
                min_mask_region_area=100,
            )
            return {"engine": "sam2", "generator": generator, "torch": torch}, None
        except Exception as exc:
            warning = f"SAM 2 unavailable ({exc}); using the built-in ISNet segmentation model."
    else:
        warning = None

    return new_session("isnet-general-use", providers=["CPUExecutionProvider"]), warning


# Runs result.
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--passes", type=int, default=3, help="segmentation passes (each peels off more objects)")
    parser.add_argument("--max-objects", type=int, default=16)
    parser.add_argument("--lama-model", default=os.environ.get("MAGIC_LAYERS_LAMA_MODEL"))
    parser.add_argument("--corrections", default=None, help="JSON file of OCR fixes: {\"wrong\": \"right\"}")
    args = parser.parse_args()

    try:
        load_text_corrections(args.corrections)
        original = load_image(args.input)
        width, height = original.size
        rgb = np.array(original.convert("RGB"))
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        warnings = []
        segmentation_model = "ISNet"

        # ---- text -----------------------------------------------------------
        lines = detect_text_lines(rgb)
        text_pixel_mask = np.zeros((height, width), dtype="uint8")
        text_rect_mask = np.zeros((height, width), dtype="uint8")
        for line in lines:
            glyphs = analyze_line_glyphs(line, rgb)
            line["text"] = restore_ocr_word_spaces(line["text"], glyphs)
            glyphs["cleanup_ok"] = local_cleanup_ok(bgr, glyphs)
            line["glyphs"] = glyphs

            gx, gy = glyphs["origin"]
            mh, mw = glyphs["mask"].shape[:2]
            region = text_pixel_mask[gy : gy + mh, gx : gx + mw]
            np.maximum(region, glyphs["mask"][: region.shape[0], : region.shape[1]], out=region)
            cv2.fillPoly(text_rect_mask, [np.round(line["quad"]).astype("int32")], 255)
        text_layers = build_text_layers(lines, width, height)

        # ---- objects --------------------------------------------------------
        found = []
        try:
            session, session_warning = create_segmentation_session()
            if isinstance(session, dict) and session.get("engine") == "sam2":
                segmentation_model = "SAM 2"
            if session_warning:
                warnings.append(session_warning)
            found = discover_objects(original, session, text_rect_mask, args.passes)
        except Exception as exc:
            warnings.append(f"segmentation failed: {exc}")
        object_layers, object_mask_union = build_object_layers(original, found, text_pixel_mask, args.max_objects)

        # ---- background -----------------------------------------------------
        cleaned_bgr, bg_quality, bg_provider, removal_mask = reconstruct_background(
            bgr, object_mask_union, text_pixel_mask, args.lama_model
        )
        cleaned_rgb = cv2.cvtColor(cleaned_bgr, cv2.COLOR_BGR2RGB)
        background_src = image_to_data_url(Image.fromarray(cleaned_rgb), "JPEG", quality=92, optimize=True)
        removal_mask_src = image_to_data_url(Image.fromarray(removal_mask), "PNG")

        final_layers = order_layers_for_editor(object_layers, text_layers)

        payload = {
            "success": True,
            "width": int(width),
            "height": int(height),
            "model": f"Magic Layers v3 ({segmentation_model} + OCR)",
            "backgroundSrc": background_src,
            "backgroundQuality": bg_quality,
            "backgroundProvider": bg_provider,
            "removalMaskSrc": removal_mask_src,
            "summary": {
                "objectLayers": len(object_layers),
                "textLayers": len(text_layers),
                "totalLayers": len(final_layers),
            },
            "layers": final_layers,
        }
        if warnings:
            payload["warnings"] = warnings
        respond(payload)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        try:
            fallback_img = Image.open(args.input).convert("RGBA")
            w, h = fallback_img.size
            respond(
                {
                    "success": True,
                    "width": w,
                    "height": h,
                    "model": "Image-to-Layers V2 Fallback",
                    "backgroundSrc": image_to_data_url(fallback_img.convert("RGB"), "JPEG", quality=88),
                    "backgroundQuality": "low",
                    "backgroundProvider": "opencv_basic",
                    "removalMaskSrc": "",
                    "summary": {"objectLayers": 0, "textLayers": 0, "totalLayers": 0},
                    "layers": [],
                    "warnings": [f"pipeline failed: {exc}"],
                }
            )
        except Exception:
            unavailable(f"Failed to process image: {str(exc)}")


if __name__ == "__main__":
    main()
