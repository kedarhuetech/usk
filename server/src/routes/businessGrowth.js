import { Router } from "express";
import multer from "multer";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();
const resources = new Set(["items", "online-store", "orders", "smart-ads", "designs", "google-profile", "whatsapp"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, done) => done(null, ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) });
const fail = (res, error) => res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Business Growth request failed." });

function escapePathPart(value) { return String(value).replace(/~/g, "~0").replace(/\//g, "~1"); }

function flattenRecord(value, parentPath = "", fieldName = "", ordinal = 0, output = []) {
  const path = parentPath ? `${parentPath}/${escapePathPart(fieldName)}` : `/${escapePathPart(fieldName)}`;
  if (path.length > 512) throw Object.assign(new Error("A saved field path exceeds the database limit."), { status: 400 });
  if (value === null || value === undefined) {
    output.push([path, parentPath, String(fieldName), ordinal, "null", null, null, null]);
  } else if (Array.isArray(value)) {
    output.push([path, parentPath, String(fieldName), ordinal, "array", null, null, null]);
    value.forEach((child, index) => flattenRecord(child, path, String(index), index, output));
  } else if (typeof value === "object") {
    output.push([path, parentPath, String(fieldName), ordinal, "object", null, null, null]);
    Object.entries(value).forEach(([key, child], index) => flattenRecord(child, path, key, index, output));
  } else if (typeof value === "number") {
    output.push([path, parentPath, String(fieldName), ordinal, "number", null, Number.isFinite(value) ? value : 0, null]);
  } else if (typeof value === "boolean") {
    output.push([path, parentPath, String(fieldName), ordinal, "boolean", null, null, value ? 1 : 0]);
  } else {
    output.push([path, parentPath, String(fieldName), ordinal, "string", String(value), null, null]);
  }
  return output;
}

function restoreRecord(rows) {
  const root = {};
  const containers = new Map([["", root]]);
  const ordered = [...rows].sort((a, b) => a.field_path.length - b.field_path.length || a.ordinal - b.ordinal);
  for (const row of ordered) {
    let value;
    switch (row.value_type) {
      case "object": value = {}; break;
      case "array": value = []; break;
      case "number": value = row.value_number === null ? 0 : Number(row.value_number); break;
      case "boolean": value = Boolean(row.value_boolean); break;
      case "null": value = null; break;
      default: value = row.value_text ?? "";
    }
    const parent = containers.get(row.parent_path) || root;
    if (Array.isArray(parent)) parent[Number(row.field_name)] = value;
    else parent[row.field_name] = value;
    if (row.value_type === "object" || row.value_type === "array") containers.set(row.field_path, value);
  }
  return root;
}

async function attachRecordFields(businessId, resource, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.record_id);
  const marks = ids.map(() => "?").join(",");
  const [fieldRows] = await pool.execute(
    `SELECT record_id, field_path, parent_path, field_name, ordinal, value_type, value_text, value_number, value_boolean
     FROM business_growth_record_fields WHERE business_id=? AND resource=? AND record_id IN (${marks})
     ORDER BY record_id, CHAR_LENGTH(field_path), ordinal`,
    [businessId, resource, ...ids],
  );
  const byRecord = new Map();
  for (const field of fieldRows) {
    if (!byRecord.has(field.record_id)) byRecord.set(field.record_id, []);
    byRecord.get(field.record_id).push(field);
  }
  return rows.map((row) => ({
    ...restoreRecord(byRecord.get(row.record_id) || []),
    id: row.record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function insertRecordFields(connection, businessId, resource, recordId, payload) {
  const fields = [];
  Object.entries(payload).forEach(([key, value], index) => flattenRecord(value, "", key, index, fields));
  for (let offset = 0; offset < fields.length; offset += 200) {
    const chunk = fields.slice(offset, offset + 200);
    const tuple = "(?,?,?,?,?,?,?,?,?,?,?)";
    const sql = `INSERT INTO business_growth_record_fields (business_id,resource,record_id,field_path,parent_path,field_name,ordinal,value_type,value_text,value_number,value_boolean) VALUES ${chunk.map(() => tuple).join(",")}`;
    const values = chunk.flatMap((field) => [businessId, resource, recordId, ...field]);
    await connection.execute(sql, values);
  }
}

async function loadTemplateOverlays(ids) {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT owner_key AS template_id, field_path, parent_path, field_name, ordinal, value_type, value_text, value_number, value_boolean
     FROM business_growth_attribute_fields WHERE owner_table='whatsapp_marketing_templates' AND owner_key IN (${placeholders})
     ORDER BY owner_key, CHAR_LENGTH(field_path), ordinal`, ids,
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.template_id)) grouped.set(row.template_id, []);
    grouped.get(row.template_id).push(row);
  }
  return new Map(ids.map((id) => [id, restoreRecord(grouped.get(id) || [])]));
}

async function saveTemplateOverlay(connection, id, overlayConfig) {
  const values = [];
  Object.entries(overlayConfig).forEach(([key, value], index) => flattenRecord(value, "", key, index, values));
  await connection.execute("DELETE FROM business_growth_attribute_fields WHERE owner_table='whatsapp_marketing_templates' AND owner_key=?", [id]);
  for (let offset = 0; offset < values.length; offset += 200) {
    const chunk = values.slice(offset, offset + 200);
    const tuple = "(?,?,?,?,?,?,?,?,?,?)";
    const sql = `INSERT INTO business_growth_attribute_fields (owner_table,owner_key,field_path,parent_path,field_name,ordinal,value_type,value_text,value_number,value_boolean) VALUES ${chunk.map(() => tuple).join(",")}`;
    await connection.execute(sql, chunk.flatMap((field) => ["whatsapp_marketing_templates", id, ...field]));
  }
}



function parseOverlayConfig(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error("overlayConfig must be a valid JSON object."), { status: 400 });
  }
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || !Number.isInteger(parsed.updatedAt) || typeof parsed.id !== "string") throw new Error();
    if (parsed.updatedAt < 0 || parsed.id.length > 64) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error("Invalid pagination cursor."), { status: 400 });
  }
}

function encodeCursor(row) {
  const updatedAt = Math.floor((row.updated_at instanceof Date ? row.updated_at.getTime() : Date.parse(row.updated_at)) / 1000);
  return Buffer.from(JSON.stringify({ updatedAt, id: row.record_id })).toString("base64url");
}

// This catalog contains shared application-provided posters, not business-owned
// user records. Keep it available before the tenant-scoped middleware below.
router.get("/whatsapp-marketing/templates", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, title, category, subcategory, original_filename, mime_type, size_bytes
       FROM whatsapp_marketing_templates
       WHERE is_active = 1
       ORDER BY display_order ASC, id ASC`,
    );
    const overlays = await loadTemplateOverlays(rows.map((row) => row.id));
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        subcategory: row.subcategory,
        overlayConfig: overlays.get(row.id) || {},
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes),
        image: `/api/business-growth/whatsapp-marketing/templates/${encodeURIComponent(row.id)}/image`,
      })),
    });
  } catch (error) { fail(res, error); }
});

router.get("/whatsapp-marketing/templates/:id/image", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT original_filename, mime_type, size_bytes, image_data FROM whatsapp_marketing_templates WHERE id = ? AND is_active = 1",
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "WhatsApp poster image not found." });
    const image = rows[0];
    res.type(image.mime_type)
      .set("Content-Length", String(image.size_bytes))
      .set("Content-Disposition", "inline")
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", "public, max-age=3600")
      .send(image.image_data);
  } catch (error) { fail(res, error); }
});

// Catalog additions are uploaded as multipart/form-data and stored once in
// MySQL for all businesses to use. Add authorization when admin accounts exist.
router.post("/whatsapp-marketing/templates", upload.single("file"), async (req, res) => {
  try {
    const { title, category, subcategory } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: "A JPG, PNG, WEBP, or GIF image is required in the file field." });
    if (!title?.trim() || !category?.trim() || !subcategory?.trim()) {
      return res.status(400).json({ success: false, message: "title, category, and subcategory are required." });
    }
    if (title.trim().length > 180 || category.trim().length > 80 || subcategory.trim().length > 80) {
      return res.status(400).json({ success: false, message: "Template title, category, or subcategory is too long." });
    }
    const id = crypto.randomUUID();
    const overlayConfig = parseOverlayConfig(req.body.overlayConfig);
    const displayOrder = req.body.displayOrder === undefined || req.body.displayOrder === "" ? 0 : Number(req.body.displayOrder);
    if (!Number.isSafeInteger(displayOrder) || displayOrder < 0 || displayOrder > 2147483647) {
      return res.status(400).json({ success: false, message: "displayOrder must be a non-negative integer." });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO whatsapp_marketing_templates
         (id,title,category,subcategory,original_filename,mime_type,size_bytes,image_data,display_order,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,1)`,
        [id, title.trim(), category.trim(), subcategory.trim(), req.file.originalname.slice(0, 255), req.file.mimetype, req.file.size, req.file.buffer, displayOrder],
      );
      await saveTemplateOverlay(connection, id, overlayConfig);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    res.status(201).json({
      success: true,
      data: {
        id, title: title.trim(), category: category.trim(), subcategory: subcategory.trim(), overlayConfig,
        originalFilename: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size,
        image: `/api/business-growth/whatsapp-marketing/templates/${encodeURIComponent(id)}/image`,
      },
    });
  } catch (error) { fail(res, error); }
});


router.use(async (req, res, next) => {
  try {
    const businessId = businessIdFromRequest(req);
    await pool.execute("INSERT INTO businesses (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id", [businessId, businessId]);
    req.businessId = businessId;
    next();
  } catch (error) { fail(res, error); }
});

router.get("/assets/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT mime_type, original_filename, size_bytes, data FROM business_growth_assets WHERE id = ? AND business_id = ?", [req.params.id, req.businessId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Asset not found." });
    res.type(rows[0].mime_type).set("Content-Length", String(rows[0].size_bytes)).set("Cache-Control", "private, max-age=86400").send(rows[0].data);
  } catch (error) { fail(res, error); }
});
router.post("/assets", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "A JPG, PNG, WEBP, or GIF image is required." });
    const id = crypto.randomUUID();
    await pool.execute("INSERT INTO business_growth_assets (id,business_id,entity_type,entity_id,original_filename,mime_type,size_bytes,data) VALUES (?,?,?,?,?,?,?,?)", [id, req.businessId, String(req.body.entityType || "asset").slice(0,64), req.body.entityId || null, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]);
    res.status(201).json({ success: true, data: { id, name: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, url: `/api/business-growth/assets/${id}` } });
  } catch (error) { fail(res, error); }
});
router.get("/:resource", async (req, res) => {
  try {
    if (!resources.has(req.params.resource)) return res.status(404).json({ success: false, message: "Resource not found." });
    const imageToLayersOnly = req.params.resource === "designs" && req.query.kind === "image-to-layers";
    const paginated = req.query.limit !== undefined || req.query.cursor !== undefined;
    const baseSql = `SELECT record_id, created_at, updated_at FROM business_growth_records WHERE business_id = ? AND resource = ?${imageToLayersOnly ? " AND record_id LIKE 'image-to-layers-%'" : ""}`;
    if (!paginated) {
      const [rows] = await pool.execute(`${baseSql} ORDER BY updated_at DESC, record_id DESC`, [req.businessId, req.params.resource]);
      return res.json({ success: true, data: await attachRecordFields(req.businessId, req.params.resource, rows) });
    }

    const requestedLimit = Number(req.query.limit || 50);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) throw Object.assign(new Error("Pagination limit must be between 1 and 100."), { status: 400 });
    const cursor = decodeCursor(String(req.query.cursor || ""));
    // Compare epoch seconds through FROM_UNIXTIME so MySQL session time zones do
    // not shift the cursor timestamp between page requests.
    const cursorClause = cursor ? " AND (updated_at < FROM_UNIXTIME(?) OR (updated_at = FROM_UNIXTIME(?) AND record_id < ?))" : "";
    const params = cursor ? [req.businessId, req.params.resource, cursor.updatedAt, cursor.updatedAt, cursor.id, requestedLimit + 1] : [req.businessId, req.params.resource, requestedLimit + 1];
    const [rows] = await pool.execute(`${baseSql}${cursorClause} ORDER BY updated_at DESC, record_id DESC LIMIT ?`, params);
    const hasMore = rows.length > requestedLimit;
    if (hasMore) rows.pop();
    const items = await attachRecordFields(req.businessId, req.params.resource, rows);
    res.json({ success: true, data: { items, nextCursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1]) : null, hasMore } });
  } catch (error) { fail(res, error); }
});
async function saveRecord(req, res) {
  const connection = await pool.getConnection();
  try {
    if (!resources.has(req.params.resource)) return res.status(404).json({ success: false, message: "Resource not found." });
    const id = String(req.params.id || req.body?.id || crypto.randomUUID()).slice(0, 64);
    const now = new Date().toISOString();
    const payload = { ...req.body, id, createdAt: req.body?.createdAt || now, updatedAt: now };
    if (req.params.resource === "orders" && !String(payload.storeId || "").trim()) {
      throw Object.assign(new Error("Order storeId is required."), { status: 400 });
    }
    await connection.beginTransaction();
    await connection.execute("INSERT INTO business_growth_records (business_id, resource, record_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP", [req.businessId, req.params.resource, id]);
    await connection.execute("DELETE FROM business_growth_record_fields WHERE business_id=? AND resource=? AND record_id=?", [req.businessId, req.params.resource, id]);
    await insertRecordFields(connection, req.businessId, req.params.resource, id, payload);
    if (req.params.resource === "designs") {
      if (id.startsWith("image-to-layers-")) {
        const [olderDesigns] = await connection.execute("SELECT record_id FROM business_growth_records WHERE business_id=? AND resource='designs' AND record_id LIKE 'image-to-layers-%' ORDER BY updated_at DESC, record_id DESC LIMIT 18446744073709551615 OFFSET 6", [req.businessId]);
        for (const older of olderDesigns) {
          await connection.execute("DELETE FROM business_growth_records WHERE business_id=? AND resource='designs' AND record_id=?", [req.businessId, older.record_id]);
          await connection.execute("DELETE FROM business_growth_assets WHERE business_id=? AND entity_type='marketing-design' AND entity_id=?", [req.businessId, older.record_id]);
        }
      }
    }
    await connection.commit();
    res.status(201).json({ success: true, data: payload });
  } catch (error) { await connection.rollback(); fail(res, error); }
  finally { connection.release(); }
}
router.post("/:resource", saveRecord);
router.put("/:resource/:id", saveRecord);
router.delete("/:resource/:id", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!resources.has(req.params.resource)) return res.status(404).json({ success: false, message: "Resource not found." });
    await connection.beginTransaction();
    const [result] = await connection.execute("DELETE FROM business_growth_records WHERE business_id = ? AND resource = ? AND record_id = ?", [req.businessId, req.params.resource, req.params.id]);
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Record not found." });
    }
    if (req.params.resource === "designs") {
      await connection.execute("DELETE FROM business_growth_assets WHERE business_id=? AND entity_type='marketing-design' AND entity_id=?", [req.businessId,req.params.id]);
    }
    await connection.commit();
    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) { await connection.rollback(); fail(res, error); }
  finally { connection.release(); }
});

export default router;
