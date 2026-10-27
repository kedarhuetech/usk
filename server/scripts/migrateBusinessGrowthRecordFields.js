import { pool } from "../src/db/mysql.js";

// Escapes path part.
function escapePathPart(value) { return String(value).replace(/~/g, "~0").replace(/\//g, "~1"); }

// This helper handles result logic.
function flatten(value, parentPath = "", fieldName = "", ordinal = 0, output = []) {
  const path = parentPath ? `${parentPath}/${escapePathPart(fieldName)}` : `/${escapePathPart(fieldName)}`;
  if (path.length > 512) throw new Error(`Field path is too long: ${path.slice(0, 80)}`);
  if (value === null || value === undefined) output.push([path, parentPath, String(fieldName), ordinal, "null", null, null, null]);
  else if (Array.isArray(value)) {
    output.push([path, parentPath, String(fieldName), ordinal, "array", null, null, null]);
    value.forEach((child, index) => flatten(child, path, String(index), index, output));
  } else if (typeof value === "object") {
    output.push([path, parentPath, String(fieldName), ordinal, "object", null, null, null]);
    Object.entries(value).forEach(([key, child], index) => flatten(child, path, key, index, output));
  } else if (typeof value === "number") output.push([path, parentPath, String(fieldName), ordinal, "number", null, Number.isFinite(value) ? value : 0, null]);
  else if (typeof value === "boolean") output.push([path, parentPath, String(fieldName), ordinal, "boolean", null, null, value ? 1 : 0]);
  else output.push([path, parentPath, String(fieldName), ordinal, "string", String(value), null, null]);
  return output;
}

// Ensures fields table.
async function ensureFieldsTable(connection) {
  await connection.execute(`CREATE TABLE IF NOT EXISTS business_growth_record_fields (
    business_id VARCHAR(64) NOT NULL,
    resource VARCHAR(32) NOT NULL,
    record_id VARCHAR(64) NOT NULL,
    field_path VARCHAR(512) NOT NULL,
    parent_path VARCHAR(512) NOT NULL DEFAULT '',
    field_name VARCHAR(255) NOT NULL DEFAULT '',
    ordinal INT UNSIGNED NOT NULL DEFAULT 0,
    value_type ENUM('object','array','string','number','boolean','null') NOT NULL,
    value_text LONGTEXT NULL,
    value_number DECIMAL(30,8) NULL,
    value_boolean TINYINT(1) NULL,
    PRIMARY KEY (business_id,resource,record_id,field_path),
    KEY idx_growth_fields_parent (business_id,resource,record_id,parent_path(191),ordinal),
    CONSTRAINT fk_growth_fields_record FOREIGN KEY (business_id,resource,record_id)
      REFERENCES business_growth_records(business_id,resource,record_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

// Ensures attribute fields table.
async function ensureAttributeFieldsTable(connection) {
  await connection.execute(`CREATE TABLE IF NOT EXISTS business_growth_attribute_fields (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_table VARCHAR(64) NOT NULL,
    owner_key VARCHAR(255) NOT NULL,
    field_path VARCHAR(512) NOT NULL,
    parent_path VARCHAR(512) NOT NULL DEFAULT '',
    field_name VARCHAR(255) NOT NULL DEFAULT '',
    ordinal INT UNSIGNED NOT NULL DEFAULT 0,
    value_type ENUM('object','array','string','number','boolean','null') NOT NULL,
    value_text LONGTEXT NULL,
    value_number DECIMAL(30,8) NULL,
    value_boolean TINYINT(1) NULL,
    KEY idx_attribute_owner (owner_table,owner_key),
    KEY idx_attribute_parent (owner_table,owner_key,parent_path(191),ordinal)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

// Creates owner key.
function makeOwnerKey(row, keyColumns) {
  if (keyColumns.length === 1) return String(row[keyColumns[0]]);
  return keyColumns.map((key) => {
    const value = String(row[key]);
    return `${value.length}:${value}`;
  }).join("|");
}

// Stores attributes.
async function storeAttributes(connection, ownerTable, ownerKey, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid structured data in ${ownerTable}/${ownerKey}`);
  const fields = [];
  Object.entries(value).forEach(([key, field], index) => flatten(field, "", key, index, fields));
  await connection.execute("DELETE FROM business_growth_attribute_fields WHERE owner_table=? AND owner_key=?", [ownerTable, ownerKey]);
  for (let offset = 0; offset < fields.length; offset += 200) {
    const chunk = fields.slice(offset, offset + 200);
    const tuple = "(?,?,?,?,?,?,?,?,?,?)";
    const sql = `INSERT INTO business_growth_attribute_fields (owner_table,owner_key,field_path,parent_path,field_name,ordinal,value_type,value_text,value_number,value_boolean) VALUES ${chunk.map(() => tuple).join(",")}`;
    await connection.execute(sql, chunk.flatMap((field) => [ownerTable, ownerKey, ...field]));
  }
}

const JSON_COLUMNS = [
  ["business_profiles", "profile_data", ["business_id"]],
  ["online_stores", "store_data", ["business_id", "store_key"]],
  ["inventory_items", "item_data", ["business_id", "id"]],
  ["inventory_item_batches", "batch_data", ["business_id", "id"]],
  ["online_store_orders", "order_data", ["business_id", "id"]],
  ["online_store_order_items", "item_snapshot", ["business_id", "order_id", "item_index"]],
  ["smart_ads_campaigns", "campaign_data", ["business_id", "id"]],
  ["smart_ads_creatives", "creative_data", ["business_id", "campaign_id"]],
  ["smart_ads_audiences", "audience_data", ["business_id", "campaign_id"]],
  ["smart_ads_budgets", "budget_data", ["business_id", "campaign_id"]],
  ["smart_ads_analytics", "analytics_data", ["business_id", "campaign_id"]],
  ["whatsapp_connections", "connection_data", ["business_id"]],
  ["whatsapp_campaigns", "campaign_data", ["business_id", "id"]],
  ["whatsapp_campaign_recipients", "recipient_data", ["business_id", "campaign_id", "recipient_id"]],
  ["whatsapp_templates", "template_data", ["business_id", "id"]],
  ["whatsapp_marketing_templates", "overlay_config", ["id"]],
  ["marketing_studio_designs", "design_data", ["business_id", "id"]],
  ["marketing_studio_brand_data", "brand_data", ["business_id"]],
];

// Migrates json column.
async function migrateJsonColumn(connection, table, column, keyColumns) {
  const [exists] = await connection.execute("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?", [table]);
  if (!Number(exists[0].total)) return 0;
  const [columnExists] = await connection.execute("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?", [table, column]);
  if (!Number(columnExists[0].total)) return 0;
  const selectedKeys = keyColumns.map((key) => `\`${key}\``).join(",");
  const orderBy = keyColumns.map((key) => `\`${key}\``).join(",");
  const tuple = keyColumns.length === 1 ? `\`${keyColumns[0]}\` > ?` : `(${orderBy}) > (${keyColumns.map(() => "?").join(",")})`;
  let cursor = null;
  let count = 0;
  while (true) {
    const cursorWhere = cursor ? `WHERE ${tuple}` : "";
    const [rows] = await connection.execute(
      `SELECT ${selectedKeys}, \`${column}\` AS legacy_value FROM \`${table}\` ${cursorWhere} ORDER BY ${orderBy} LIMIT 200`,
      cursor || [],
    );
    if (!rows.length) break;
    await connection.beginTransaction();
    try {
      for (const row of rows) {
        const value = typeof row.legacy_value === "string" ? JSON.parse(row.legacy_value) : row.legacy_value;
        await storeAttributes(connection, table, makeOwnerKey(row, keyColumns), value);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    cursor = keyColumns.map((key) => rows[rows.length - 1][key]);
    count += rows.length;
  }
  await connection.execute(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
  return count;
}

// Migrates result.
async function migrate() {
  const connection = await pool.getConnection();
  try {
    await ensureAttributeFieldsTable(connection);
    let ancillaryMigrated = 0;
    for (const [table, column, keys] of JSON_COLUMNS) {
      const migrated = await migrateJsonColumn(connection, table, column, keys);
      ancillaryMigrated += migrated;
      if (migrated) console.log(`Moved ${migrated} ${table}.${column} values into typed attribute rows.`);
    }
    const [columns] = await connection.execute("SHOW COLUMNS FROM business_growth_records LIKE 'payload'");
    if (!columns.length) {
      await ensureFieldsTable(connection);
      console.log(`Business Growth JSON-column migration complete. ${ancillaryMigrated} ancillary rows moved; core records already use typed field rows.`);
      return;
    }
    await ensureFieldsTable(connection);
    let cursor = null;
    let migrated = 0;
    while (true) {
      const [rows] = cursor
        ? await connection.execute(
            `SELECT business_id,resource,record_id,payload FROM business_growth_records
             WHERE (business_id,resource,record_id) > (?,?,?)
             ORDER BY business_id,resource,record_id LIMIT 200`, cursor)
        : await connection.execute(
            `SELECT business_id,resource,record_id,payload FROM business_growth_records
             ORDER BY business_id,resource,record_id LIMIT 200`);
      if (!rows.length) break;
      await connection.beginTransaction();
      try {
        for (const row of rows) {
          const value = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid record payload for ${row.resource}/${row.record_id}`);
          const fields = [];
          Object.entries(value).forEach(([key, field], index) => flatten(field, "", key, index, fields));
          await connection.execute("DELETE FROM business_growth_record_fields WHERE business_id=? AND resource=? AND record_id=?", [row.business_id, row.resource, row.record_id]);
          for (let offset = 0; offset < fields.length; offset += 200) {
            const chunk = fields.slice(offset, offset + 200);
            const tuple = "(?,?,?,?,?,?,?,?,?,?,?)";
            const sql = `INSERT INTO business_growth_record_fields (business_id,resource,record_id,field_path,parent_path,field_name,ordinal,value_type,value_text,value_number,value_boolean) VALUES ${chunk.map(() => tuple).join(",")}`;
            await connection.execute(sql, chunk.flatMap((field) => [row.business_id, row.resource, row.record_id, ...field]));
          }
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
      const last = rows[rows.length - 1];
      cursor = [last.business_id, last.resource, last.record_id];
      migrated += rows.length;
      console.log(`Migrated ${migrated} Business Growth records...`);
    }
    // Keep the old column until every row has been copied successfully.
    await connection.execute("ALTER TABLE business_growth_records DROP COLUMN payload");
    console.log(`Migration complete. ${migrated} core records and ${ancillaryMigrated} ancillary rows now use typed field rows; JSON payload column was removed.`);
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Business Growth field migration failed. The old payload column was retained.", error.message);
  process.exitCode = 1;
});
