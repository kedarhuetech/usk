CREATE DATABASE IF NOT EXISTS vyapaar CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE vyapaar;

-- Shared tenant-owned application records. The typed record tables below hold
-- operational and Business Growth resources, so new records use the same
-- schema while preserving their nested form data.
CREATE TABLE IF NOT EXISTS businesses (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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

-- Defines database structure for business growth assets.
CREATE TABLE IF NOT EXISTS business_growth_assets (
  id CHAR(36) PRIMARY KEY, business_id VARCHAR(64) NOT NULL, entity_type VARCHAR(64) NOT NULL, entity_id VARCHAR(64), original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL, data MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_assets_entity (business_id,entity_type,entity_id), CONSTRAINT fk_asset_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Defines database structure for business growth records.
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

-- Typed metadata for shared poster overlays and legacy JSON-column migrations.
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

-- Defines database structure for business data parties.
CREATE OR REPLACE VIEW business_data_parties AS
SELECT r.business_id,
       r.record_id AS party_id,
       MAX(IF(f.field_path = '/partyName', f.value_text, NULL)) AS party_name,
       MAX(IF(f.field_path = '/gstin', f.value_text, NULL)) AS gstin,
       MAX(IF(f.field_path = '/phone', f.value_text, NULL)) AS phone,
       MAX(IF(f.field_path = '/email', f.value_text, NULL)) AS email,
       MAX(IF(f.field_path = '/state', f.value_text, NULL)) AS state,
       r.created_at,
       r.updated_at
FROM business_growth_records r
LEFT JOIN business_growth_record_fields f
  ON f.business_id = r.business_id AND f.resource = r.resource AND f.record_id = r.record_id
WHERE r.resource = 'parties'
GROUP BY r.business_id, r.record_id, r.created_at, r.updated_at;

-- Defines database structure for business data sales invoices.
CREATE OR REPLACE VIEW business_data_sales_invoices AS
SELECT r.business_id,
       r.record_id AS invoice_id,
       MAX(IF(f.field_path = '/form/invoiceNumber', f.value_text, NULL)) AS invoice_number,
       MAX(IF(f.field_path = '/form/customer', f.value_text, NULL)) AS customer_name,
       MAX(IF(f.field_path = '/form/phone', f.value_text, NULL)) AS customer_phone,
       MAX(IF(f.field_path = '/form/invoiceDate', f.value_text, NULL)) AS invoice_date,
       MAX(IF(f.field_path = '/totals/finalTotal', COALESCE(f.value_number, CAST(f.value_text AS DECIMAL(18,2))), NULL)) AS total_amount,
       r.created_at,
       r.updated_at
FROM business_growth_records r
LEFT JOIN business_growth_record_fields f
  ON f.business_id = r.business_id AND f.resource = r.resource AND f.record_id = r.record_id
WHERE r.resource = 'sales-invoices'
GROUP BY r.business_id, r.record_id, r.created_at, r.updated_at;

-- Defines database structure for business data purchase bills.
CREATE OR REPLACE VIEW business_data_purchase_bills AS
SELECT r.business_id,
       r.record_id AS bill_id,
       MAX(IF(f.field_path = '/form/invoiceNumber', f.value_text, NULL)) AS bill_number,
       MAX(IF(f.field_path = '/form/customer', f.value_text, NULL)) AS supplier_name,
       MAX(IF(f.field_path = '/form/phone', f.value_text, NULL)) AS supplier_phone,
       MAX(IF(f.field_path = '/form/invoiceDate', f.value_text, NULL)) AS bill_date,
       MAX(IF(f.field_path = '/totals/finalTotal', COALESCE(f.value_number, CAST(f.value_text AS DECIMAL(18,2))), NULL)) AS total_amount,
       r.created_at,
       r.updated_at
FROM business_growth_records r
LEFT JOIN business_growth_record_fields f
  ON f.business_id = r.business_id AND f.resource = r.resource AND f.record_id = r.record_id
WHERE r.resource = 'purchase-bills'
GROUP BY r.business_id, r.record_id, r.created_at, r.updated_at;

-- Defines database structure for business data financial summary.
CREATE OR REPLACE VIEW business_data_financial_summary AS
SELECT business_id,
       resource,
       SUM(CASE WHEN field_path = '/totals/balance'
           THEN COALESCE(value_number, CAST(NULLIF(value_text, '') AS DECIMAL(18,2)), 0)
           ELSE 0 END) AS outstanding_balance
FROM business_growth_record_fields
WHERE resource IN ('sales-invoices','purchase-bills')
GROUP BY business_id, resource;

-- Defines database structure for business growth inventory items.
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

-- Defines database structure for business growth inventory item batches.
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
