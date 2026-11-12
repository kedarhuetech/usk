-- Migration: Create HSN and SAC codes table
CREATE TABLE IF NOT EXISTS hsn_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(8) NOT NULL DEFAULT 'HSN',
  gst_rate DECIMAL(5, 2) NULL,
  cess_rate DECIMAL(5, 2) NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hsn_code (code),
  INDEX idx_hsn_type (type),
  INDEX idx_hsn_type_code (type, code),
  FULLTEXT KEY idx_hsn_description (description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
