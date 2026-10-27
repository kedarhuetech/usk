// Runs the create business growth views database maintenance task.
import { pool } from "../src/db/mysql.js";

const statements = [
  `CREATE OR REPLACE VIEW business_growth_record_values AS
   SELECT business_id, resource, record_id, field_path, field_name, value_type,
          CASE value_type WHEN 'string' THEN value_text WHEN 'number' THEN CAST(value_number AS CHAR)
            WHEN 'boolean' THEN IF(value_boolean=1,'true','false') WHEN 'null' THEN NULL
            ELSE CONCAT('[',value_type,']') END AS field_value
   FROM business_growth_record_fields`,
  `CREATE OR REPLACE VIEW business_growth_inventory_items AS
   SELECT r.business_id, r.record_id AS item_id,
          MAX(IF(f.field_name IN ('itemName','name','serviceName'),f.value_text,NULL)) AS item_name,
          MAX(IF(f.field_name='type',f.value_text,NULL)) AS item_type,
          MAX(IF(f.field_name IN ('itemCode','code','serviceCode'),f.value_text,NULL)) AS item_code,
          MAX(IF(f.field_name IN ('hsn','sac'),f.value_text,NULL)) AS hsn_sac,
          MAX(IF(f.field_name='category',f.value_text,NULL)) AS category,
          MAX(IF(f.field_name='unit',f.value_text,NULL)) AS unit,
          MAX(IF(f.field_name IN ('salePrice','price'),f.value_text,NULL)) AS sale_price,
          MAX(IF(f.field_name='purchasePrice',f.value_text,NULL)) AS purchase_price,
          MAX(IF(f.field_name IN ('taxRate','saleTaxMode'),f.value_text,NULL)) AS tax,
          MAX(IF(f.field_name='openingQuantity',f.value_text,NULL)) AS opening_quantity,
          MAX(IF(f.field_name='minimumStock',f.value_text,NULL)) AS minimum_stock,
          MAX(IF(f.field_name IN ('imageUrl','image'),f.value_text,NULL)) AS image_url,
          r.created_at,r.updated_at
   FROM business_growth_records r LEFT JOIN business_growth_record_fields f
     ON f.business_id=r.business_id AND f.resource=r.resource AND f.record_id=r.record_id
   WHERE r.resource='items' GROUP BY r.business_id,r.record_id,r.created_at,r.updated_at`,
  `CREATE OR REPLACE VIEW business_growth_inventory_item_batches AS
   SELECT parent.business_id,parent.record_id AS item_id,batch.field_name AS batch_position,
          MAX(IF(detail.field_name='id',detail.value_text,NULL)) AS batch_id,
          MAX(IF(detail.field_name='batchNo',detail.value_text,NULL)) AS batch_number,
          MAX(IF(detail.field_name='manufacturer',detail.value_text,NULL)) AS manufacturer,
          MAX(IF(detail.field_name='mfgDate',detail.value_text,NULL)) AS manufacturing_date,
          MAX(IF(detail.field_name='expDate',detail.value_text,NULL)) AS expiry_date,
          MAX(IF(detail.field_name IN ('openingQty','quantity'),detail.value_text,NULL)) AS opening_quantity,
          MAX(IF(detail.field_name IN ('remarks','dosage'),detail.value_text,NULL)) AS remarks
   FROM business_growth_records parent JOIN business_growth_record_fields batch
     ON batch.business_id=parent.business_id AND batch.resource=parent.resource AND batch.record_id=parent.record_id
      AND batch.field_path LIKE '/batches/%' AND batch.value_type='object'
   LEFT JOIN business_growth_record_fields detail
     ON detail.business_id=batch.business_id AND detail.resource=batch.resource AND detail.record_id=batch.record_id
      AND detail.parent_path=batch.field_path
   WHERE parent.resource='items' GROUP BY parent.business_id,parent.record_id,batch.field_name`,
];

try {
  for (const statement of statements) await pool.query(statement);
  const [items] = await pool.query("SELECT item_name,item_code,opening_quantity FROM business_growth_inventory_items ORDER BY item_name");
  const [batches] = await pool.query("SELECT item_id,batch_number,opening_quantity FROM business_growth_inventory_item_batches ORDER BY item_id,batch_position");
  console.log(`Views created. ${items.length} items and ${batches.length} batches are visible through Workbench views.`);
  console.log(JSON.stringify({ items, batches }, null, 2));
} finally {
  await pool.end();
}
