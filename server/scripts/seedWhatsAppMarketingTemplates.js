import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/mysql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const manifestPath = path.join(projectRoot, "server/database/whatsapp_marketing_templates.json");
const migrationPath = path.join(projectRoot, "server/database/migrations/2026_09_whatsapp_marketing_templates.sql");
const imageDirectory = path.join(projectRoot, "src/assets/home/whatsapp_marketing");
const mimeByExtension = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function flatten(value, parentPath = "", fieldName = "", ordinal = 0, output = []) {
  const escapedName = String(fieldName).replace(/~/g, "~0").replace(/\//g, "~1");
  const path = parentPath ? `${parentPath}/${escapedName}` : `/${escapedName}`;
  if (value === null || value === undefined) output.push([path, parentPath, String(fieldName), ordinal, "null", null, null, null]);
  else if (Array.isArray(value)) {
    output.push([path, parentPath, String(fieldName), ordinal, "array", null, null, null]);
    value.forEach((child, index) => flatten(child, path, String(index), index, output));
  } else if (typeof value === "object") {
    output.push([path, parentPath, String(fieldName), ordinal, "object", null, null, null]);
    Object.entries(value).forEach(([key, child], index) => flatten(child, path, key, index, output));
  } else if (typeof value === "number") output.push([path, parentPath, String(fieldName), ordinal, "number", null, value, null]);
  else if (typeof value === "boolean") output.push([path, parentPath, String(fieldName), ordinal, "boolean", null, null, value ? 1 : 0]);
  else output.push([path, parentPath, String(fieldName), ordinal, "string", String(value), null, null]);
  return output;
}

try {
  await pool.query(await readFile(migrationPath, "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let seeded = 0;

  for (const [displayOrder, template] of manifest.templates.entries()) {
    const imagePath = path.join(imageDirectory, template.imageFile);
    const image = await readFile(imagePath);
    const extension = path.extname(template.imageFile).toLowerCase();
    const mimeType = mimeByExtension[extension];
    if (!mimeType) throw new Error(`Unsupported image type in catalog: ${template.imageFile}`);

    await pool.execute(
      `INSERT INTO whatsapp_marketing_templates
        (id, title, category, subcategory, original_filename, mime_type, size_bytes, image_data, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), category = VALUES(category), subcategory = VALUES(subcategory),
         original_filename = VALUES(original_filename),
         mime_type = VALUES(mime_type), size_bytes = VALUES(size_bytes), image_data = VALUES(image_data),
         display_order = VALUES(display_order), is_active = 1`,
      [
        template.id,
        template.title,
        template.category,
        template.subcategory,
        template.imageFile,
        mimeType,
        image.length,
        image,
        displayOrder,
      ],
    );
    const overlayConfig = template.overlayConfig || manifest.defaultOverlayConfig || {};
    const fields = [];
    Object.entries(overlayConfig).forEach(([key, value], index) => flatten(value, "", key, index, fields));
    await pool.execute("DELETE FROM business_growth_attribute_fields WHERE owner_table='whatsapp_marketing_templates' AND owner_key=?", [template.id]);
    for (let offset = 0; offset < fields.length; offset += 200) {
      const chunk = fields.slice(offset, offset + 200);
      const tuple = "(?,?,?,?,?,?,?,?,?,?)";
      await pool.execute(
        `INSERT INTO business_growth_attribute_fields (owner_table,owner_key,field_path,parent_path,field_name,ordinal,value_type,value_text,value_number,value_boolean) VALUES ${chunk.map(() => tuple).join(",")}`,
        chunk.flatMap((field) => ["whatsapp_marketing_templates", template.id, ...field]),
      );
    }
    seeded += 1;
  }

  console.log(`Seeded ${seeded} WhatsApp Marketing poster templates into MySQL.`);
} catch (error) {
  console.error(`WhatsApp Marketing catalog seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
