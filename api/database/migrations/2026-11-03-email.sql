-- Adds email sending and password reset (Nov 2026).
-- Only for a database created before then: phpMyAdmin → select the database →
-- Import this file. Safe to run more than once. New installs get these tables
-- from schema.sql.

SET NAMES utf8mb4;

-- ─── Email ────────────────────────────────────────────────────────────────────
-- Outgoing emails. The API adds rows; cron/emails.php sends them (and retries
-- failures), so a slow or failing mail server never blocks a request.
CREATE TABLE IF NOT EXISTS email_queue (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  to_email    VARCHAR(100) NOT NULL,
  to_name     VARCHAR(200) NOT NULL DEFAULT '',
  template    VARCHAR(50)  NOT NULL,                     -- e.g. application_submitted
  subject     VARCHAR(255) NOT NULL,
  html_body   MEDIUMTEXT NOT NULL,
  text_body   MEDIUMTEXT NOT NULL,
  -- Set for emails that must go out only once (deadline reminders).
  dedupe_key  VARCHAR(100) NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',   -- pending, sent, failed
  attempts    INT NOT NULL DEFAULT 0,
  last_error  VARCHAR(500) NOT NULL DEFAULT '',
  send_after  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_queue_dedupe_key (dedupe_key),
  KEY idx_email_queue_status_send_after (status, send_after),
  KEY idx_email_queue_to_email (to_email),
  KEY idx_email_queue_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time links for "Forgot password?" and new staff accounts. Only a SHA-256
-- hash of the token is stored; a link works once, until expires_at.
CREATE TABLE IF NOT EXISTS password_resets (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_type VARCHAR(20) NOT NULL,                     -- staff, applicant
  account_id   INT UNSIGNED NOT NULL,
  token_hash   CHAR(64) NOT NULL,
  expires_at   DATETIME NOT NULL,
  used_at      DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_token_hash (token_hash),
  KEY idx_password_resets_account (account_type, account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
