// Seeds initial poster templates into MySQL whatsapp_marketing_templates table.
import { pool } from "./mysql.js";
import { defaultWhatsAppMarketingTemplates } from "../../../src/constants/whatsappMarketingData.js";

export async function seedWhatsAppMarketingTemplates() {
  try {
    const [existing] = await pool.execute("SELECT COUNT(*) AS count FROM whatsapp_marketing_templates");
    if (existing[0]?.count > 0) {
      return { seeded: false, count: existing[0].count };
    }

    let inserted = 0;
    for (let index = 0; index < defaultWhatsAppMarketingTemplates.length; index++) {
      const template = defaultWhatsAppMarketingTemplates[index];
      const svgRaw = template.image.startsWith("data:image/svg+xml;utf8,")
        ? decodeURIComponent(template.image.replace("data:image/svg+xml;utf8,", ""))
        : template.image;
      const buffer = Buffer.from(svgRaw, "utf8");

      await pool.execute(
        `INSERT INTO whatsapp_marketing_templates
         (id, title, category, subcategory, original_filename, mime_type, size_bytes, image_data, display_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE title = VALUES(title), category = VALUES(category), subcategory = VALUES(subcategory)`,
        [
          template.id,
          template.title,
          template.category,
          template.subcategory,
          `${template.id}.svg`,
          "image/svg+xml",
          buffer.length,
          buffer,
          index + 1,
        ],
      );
      inserted++;
    }

    return { seeded: true, count: inserted };
  } catch (error) {
    console.error("Failed to seed whatsapp_marketing_templates:", error);
    return { seeded: false, error: error.message };
  }
}

if (process.argv[1] && process.argv[1].includes("seedWhatsAppTemplates.js")) {
  seedWhatsAppMarketingTemplates()
    .then((res) => {
      console.log("Seed result:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

