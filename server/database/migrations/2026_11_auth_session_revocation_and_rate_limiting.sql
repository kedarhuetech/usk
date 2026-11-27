-- Migration: Persistent JWT Session Revocation and Login Rate Limiting
-- Safe, idempotent migration for revoked_tokens, login_attempts, and users.token_version
-- Target: MySQL 8.0.37+ (DO NOT EXECUTE DIRECTLY ON REMOTE PRODUCTION DB)

-- 1. Ensure token_version column exists on users table (MySQL 8.0.37-compatible idempotent check)
SET @token_version_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'token_version'
);

SET @add_token_version_sql = IF(
  @token_version_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `token_version` INT NOT NULL DEFAULT 1 AFTER `is_verified`',
  'SELECT "Column users.token_version already exists" AS notice'
);

PREPARE add_token_version_stmt FROM @add_token_version_sql;
EXECUTE add_token_version_stmt;
DEALLOCATE PREPARE add_token_version_stmt;

-- 2. Create revoked_tokens table for single-device and explicit token revocation
CREATE TABLE IF NOT EXISTS `revoked_tokens` (
  `id` VARCHAR(64) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of jti (or raw JWT string for legacy tokens)',
  `user_id` VARCHAR(64) NOT NULL,
  `business_id` VARCHAR(64) NOT NULL,
  `revocation_reason` VARCHAR(32) NOT NULL DEFAULT 'logout',
  `expires_at` DATETIME NOT NULL COMMENT 'Token expiration timestamp in UTC for auto-pruning',
  `revoked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_revoked_tokens_hash` (`token_hash`),
  KEY `idx_revoked_tokens_user` (`user_id`),
  KEY `idx_revoked_tokens_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Create login_attempts table for persistent rate limiting across server restarts and instances
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `attempt_key` VARCHAR(128) NOT NULL COMMENT 'Unique identifier: email:<email> or ip:<ip> or otp:<target>',
  `attempt_type` VARCHAR(32) NOT NULL DEFAULT 'login',
  `attempt_count` INT NOT NULL DEFAULT 1,
  `first_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `locked_until` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`attempt_key`),
  KEY `idx_login_attempts_locked` (`locked_until`),
  KEY `idx_login_attempts_last` (`last_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
