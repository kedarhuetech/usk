-- Run once in MySQL Workbench for databases created from an earlier schema.sql.
-- This index supports tenant-scoped keyset pagination for Business Growth lists.
ALTER TABLE business_growth_records
  ADD INDEX idx_records_tenant_page (business_id, resource, updated_at DESC, record_id DESC);

-- The new index covers the old one, so remove the redundant write/storage cost.
ALTER TABLE business_growth_records DROP INDEX idx_records_updated;
