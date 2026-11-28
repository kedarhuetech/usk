-- POS draft table creation and tenant-key upgrade for MySQL 8.0.37.
-- Run against a local/test database only. The upgrade fails closed when legacy
-- rows have no trustworthy business owner; it never deletes or rewrites rows.
CREATE TABLE IF NOT EXISTS pos_drafts (
  id VARCHAR(64) NOT NULL,
  business_id VARCHAR(64) NOT NULL,
  invoice_number VARCHAR(100) NULL,
  draft_name VARCHAR(100) NULL,
  payload JSON NOT NULL,
  is_finalized TINYINT(1) NOT NULL DEFAULT 0,
  finalized_transaction_id VARCHAR(64) NULL,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (business_id, id),
  INDEX idx_pos_drafts_finalized (business_id, is_finalized),
  INDEX idx_pos_drafts_updated (business_id, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
DROP PROCEDURE IF EXISTS upgrade_pos_drafts_tenant_key$$
CREATE PROCEDURE upgrade_pos_drafts_tenant_key()
BEGIN
  DECLARE table_exists INT DEFAULT 0;
  DECLARE invalid_rows INT DEFAULT 0;
  DECLARE pk_count INT DEFAULT 0;
  DECLARE pk_business VARCHAR(64) DEFAULT NULL;
  DECLARE pk_id VARCHAR(64) DEFAULT NULL;
  SELECT COUNT(*) INTO table_exists FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_drafts';
  IF table_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'pos_drafts table was not created';
  END IF;
  SELECT COUNT(*) INTO invalid_rows FROM pos_drafts
   WHERE business_id IS NULL OR TRIM(business_id) = '' OR business_id = 'default' OR id IS NULL OR TRIM(id) = '';
  IF invalid_rows > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unsafe POS draft upgrade: rows have missing/default tenant or draft IDs; assign verified ownership before retrying';
  END IF;
  SELECT COUNT(*) INTO invalid_rows FROM (SELECT business_id, id FROM pos_drafts GROUP BY business_id, id HAVING COUNT(*) > 1) duplicates;
  IF invalid_rows > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unsafe POS draft upgrade: duplicate tenant/draft identities detected';
  END IF;
  SELECT COUNT(*), MAX(CASE WHEN ORDINAL_POSITION = 1 THEN COLUMN_NAME END),
         MAX(CASE WHEN ORDINAL_POSITION = 2 THEN COLUMN_NAME END)
    INTO pk_count, pk_business, pk_id
    FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_drafts' AND CONSTRAINT_NAME = 'PRIMARY';
  IF pk_count <> 2 OR pk_business <> 'business_id' OR pk_id <> 'id' THEN
    IF pk_count > 0 THEN
      ALTER TABLE pos_drafts DROP PRIMARY KEY;
    END IF;
    ALTER TABLE pos_drafts MODIFY id VARCHAR(64) NOT NULL,
      MODIFY business_id VARCHAR(64) NOT NULL, ADD PRIMARY KEY (business_id, id);
  END IF;
END$$
CALL upgrade_pos_drafts_tenant_key()$$
DROP PROCEDURE upgrade_pos_drafts_tenant_key$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS transaction_payments (
  id VARCHAR(96) NOT NULL,
  business_id VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference_number VARCHAR(100) NULL,
  paid_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (business_id, id),
  UNIQUE KEY uq_transaction_payment_component (business_id, transaction_id, id),
  INDEX idx_transaction_payments_txn (business_id, transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
