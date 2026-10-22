CREATE DATABASE IF NOT EXISTS vyapaar CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE vyapaar;

CREATE TABLE IF NOT EXISTS businesses (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL UNIQUE,
  source ENUM('vyapaar','google') NOT NULL DEFAULT 'vyapaar',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS online_stores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL,
  store_key VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_business_key (business_id, store_key),
  CONSTRAINT fk_store_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id VARCHAR(64) NOT NULL, business_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,id), KEY idx_inventory_name (business_id(32)),
  CONSTRAINT fk_inventory_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS inventory_item_batches (
  id VARCHAR(64) NOT NULL, business_id VARCHAR(64) NOT NULL, item_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (business_id,id), KEY idx_batch_item (business_id,item_id),
  CONSTRAINT fk_batch_item FOREIGN KEY (business_id,item_id) REFERENCES inventory_items(business_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS online_store_items (
  business_id VARCHAR(64) NOT NULL, store_key VARCHAR(64) NOT NULL, item_id VARCHAR(64) NOT NULL, sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id,store_key,item_id),
  CONSTRAINT fk_store_item_store FOREIGN KEY (business_id,store_key) REFERENCES online_stores(business_id,store_key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS online_store_orders (
  id VARCHAR(64) NOT NULL, business_id VARCHAR(64) NOT NULL, store_key VARCHAR(64) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'new',
  customer_name VARCHAR(255), mobile VARCHAR(40), subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,id), KEY idx_orders_store_date (business_id,store_key,created_at), KEY idx_orders_status (business_id,status),
  CONSTRAINT fk_orders_store FOREIGN KEY (business_id,store_key) REFERENCES online_stores(business_id,store_key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS online_store_order_items (
  business_id VARCHAR(64) NOT NULL, order_id VARCHAR(64) NOT NULL, item_index INT NOT NULL,
  PRIMARY KEY (business_id,order_id,item_index),
  CONSTRAINT fk_order_item_order FOREIGN KEY (business_id,order_id) REFERENCES online_store_orders(business_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS smart_ads_campaigns (
  id VARCHAR(64) NOT NULL, business_id VARCHAR(64) NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,id), KEY idx_ads_status (business_id,status),
  CONSTRAINT fk_ads_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS smart_ads_creatives (business_id VARCHAR(64) NOT NULL, campaign_id VARCHAR(64) NOT NULL, PRIMARY KEY (business_id,campaign_id), CONSTRAINT fk_creative_campaign FOREIGN KEY (business_id,campaign_id) REFERENCES smart_ads_campaigns(business_id,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS smart_ads_audiences (business_id VARCHAR(64) NOT NULL, campaign_id VARCHAR(64) NOT NULL, PRIMARY KEY (business_id,campaign_id), CONSTRAINT fk_audience_campaign FOREIGN KEY (business_id,campaign_id) REFERENCES smart_ads_campaigns(business_id,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS smart_ads_budgets (business_id VARCHAR(64) NOT NULL, campaign_id VARCHAR(64) NOT NULL, PRIMARY KEY (business_id,campaign_id), CONSTRAINT fk_budget_campaign FOREIGN KEY (business_id,campaign_id) REFERENCES smart_ads_campaigns(business_id,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS smart_ads_analytics (business_id VARCHAR(64) NOT NULL, campaign_id VARCHAR(64) NOT NULL, PRIMARY KEY (business_id,campaign_id), CONSTRAINT fk_analytics_campaign FOREIGN KEY (business_id,campaign_id) REFERENCES smart_ads_campaigns(business_id,id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS whatsapp_connections (business_id VARCHAR(64) NOT NULL PRIMARY KEY, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT fk_wa_connection_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (id VARCHAR(64) NOT NULL, business_id VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (business_id,id), CONSTRAINT fk_wa_campaign_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (business_id VARCHAR(64) NOT NULL, campaign_id VARCHAR(64) NOT NULL, recipient_id VARCHAR(64) NOT NULL, PRIMARY KEY (business_id,campaign_id,recipient_id), CONSTRAINT fk_wa_recipient_campaign FOREIGN KEY (business_id,campaign_id) REFERENCES whatsapp_campaigns(business_id,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS whatsapp_templates (id VARCHAR(64) NOT NULL, business_id VARCHAR(64) NOT NULL, PRIMARY KEY (business_id,id), CONSTRAINT fk_wa_template_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE);

-- Shared WhatsApp poster catalog. These are application-provided creatives,
-- so the binary is stored once rather than copied for every business.
CREATE TABLE IF NOT EXISTS whatsapp_marketing_templates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL,
  subcategory VARCHAR(80) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  image_data MEDIUMBLOB NOT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_wa_marketing_catalog (is_active, category, subcategory, display_order),
  KEY idx_wa_marketing_category (category, is_active)
);

CREATE TABLE IF NOT EXISTS marketing_studio_designs (id VARCHAR(64) NOT NULL, business_id VARCHAR(64) NOT NULL, template_id VARCHAR(128), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (business_id,id), KEY idx_design_template (business_id,template_id), CONSTRAINT fk_design_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS marketing_studio_brand_data (business_id VARCHAR(64) NOT NULL PRIMARY KEY, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT fk_brand_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS business_growth_assets (
  id CHAR(36) PRIMARY KEY, business_id VARCHAR(64) NOT NULL, entity_type VARCHAR(64) NOT NULL, entity_id VARCHAR(64), original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL, data MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_assets_entity (business_id,entity_type,entity_id), CONSTRAINT fk_asset_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_growth_records (
  business_id VARCHAR(64) NOT NULL,
  resource VARCHAR(32) NOT NULL,
  record_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,resource,record_id),
  KEY idx_records_tenant_page (business_id,resource,updated_at DESC,record_id DESC),
  CONSTRAINT fk_growth_record_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Variable-shaped user data (for example editor elements and audience lists) is
-- stored as typed rows rather than as one opaque JSON document. Scalar values
-- occupy the matching value_* column; nested arrays/objects use parent_path and
-- ordinal to preserve their structure and order.
CREATE TABLE IF NOT EXISTS business_growth_record_fields (
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
);

-- Typed values for dynamic metadata belonging to the specialized relational
-- tables above (for example OAuth connection metadata and poster overlays).
CREATE TABLE IF NOT EXISTS business_growth_attribute_fields (
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
);

-- Human-readable Workbench views over the typed record rows.
CREATE OR REPLACE VIEW business_growth_record_values AS
SELECT business_id, resource, record_id, field_path, field_name, value_type,
       CASE value_type
         WHEN 'string' THEN value_text
         WHEN 'number' THEN CAST(value_number AS CHAR)
         WHEN 'boolean' THEN IF(value_boolean = 1, 'true', 'false')
         WHEN 'null' THEN NULL
         ELSE CONCAT('[', value_type, ']')
       END AS field_value
FROM business_growth_record_fields;

CREATE OR REPLACE VIEW business_growth_inventory_items AS
SELECT r.business_id,
       r.record_id AS item_id,
       MAX(IF(f.field_name IN ('itemName','name','serviceName'), f.value_text, NULL)) AS item_name,
       MAX(IF(f.field_name = 'type', f.value_text, NULL)) AS item_type,
       MAX(IF(f.field_name IN ('itemCode','code','serviceCode'), f.value_text, NULL)) AS item_code,
       MAX(IF(f.field_name IN ('hsn','sac'), f.value_text, NULL)) AS hsn_sac,
       MAX(IF(f.field_name = 'category', f.value_text, NULL)) AS category,
       MAX(IF(f.field_name = 'unit', f.value_text, NULL)) AS unit,
       MAX(IF(f.field_name IN ('salePrice','price'), f.value_text, NULL)) AS sale_price,
       MAX(IF(f.field_name = 'purchasePrice', f.value_text, NULL)) AS purchase_price,
       MAX(IF(f.field_name IN ('taxRate','saleTaxMode'), f.value_text, NULL)) AS tax,
       MAX(IF(f.field_name = 'openingQuantity', f.value_text, NULL)) AS opening_quantity,
       MAX(IF(f.field_name = 'minimumStock', f.value_text, NULL)) AS minimum_stock,
       MAX(IF(f.field_name IN ('imageUrl','image'), f.value_text, NULL)) AS image_url,
       r.created_at,
       r.updated_at
FROM business_growth_records r
LEFT JOIN business_growth_record_fields f
  ON f.business_id = r.business_id AND f.resource = r.resource AND f.record_id = r.record_id
WHERE r.resource = 'items'
GROUP BY r.business_id, r.record_id, r.created_at, r.updated_at;

CREATE OR REPLACE VIEW business_growth_inventory_item_batches AS
SELECT parent.business_id,
       parent.record_id AS item_id,
       batch.field_name AS batch_position,
       MAX(IF(detail.field_name = 'id', detail.value_text, NULL)) AS batch_id,
       MAX(IF(detail.field_name = 'batchNo', detail.value_text, NULL)) AS batch_number,
       MAX(IF(detail.field_name = 'manufacturer', detail.value_text, NULL)) AS manufacturer,
       MAX(IF(detail.field_name = 'mfgDate', detail.value_text, NULL)) AS manufacturing_date,
       MAX(IF(detail.field_name = 'expDate', detail.value_text, NULL)) AS expiry_date,
       MAX(IF(detail.field_name IN ('openingQty','quantity'), detail.value_text, NULL)) AS opening_quantity,
       MAX(IF(detail.field_name IN ('remarks','dosage'), detail.value_text, NULL)) AS remarks
FROM business_growth_records parent
JOIN business_growth_record_fields batch
  ON batch.business_id = parent.business_id AND batch.resource = parent.resource AND batch.record_id = parent.record_id
 AND batch.field_path LIKE '/batches/%' AND batch.value_type = 'object'
LEFT JOIN business_growth_record_fields detail
  ON detail.business_id = batch.business_id AND detail.resource = batch.resource AND detail.record_id = batch.record_id
 AND detail.parent_path = batch.field_path
WHERE parent.resource = 'items'
GROUP BY parent.business_id, parent.record_id, batch.field_name;
