-- Adds payment proofs (Nov 2026): applicants upload a photo of their fee
-- payment before staff record it. Only for a database created before then:
-- phpMyAdmin → select the database → Import this file. Safe to run twice.

SET NAMES utf8mb4;

-- ─── Payment proofs ───────────────────────────────────────────────────────────
-- A photo/screenshot of the fee payment, uploaded by the applicant (or by staff
-- for them). Staff can only record a payment against a submitted proof. Earlier
-- proofs are kept as history (status replaced or rejected).
CREATE TABLE IF NOT EXISTS payment_proofs (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_batch_id INT UNSIGNED NOT NULL,
  transaction_code     VARCHAR(100) NOT NULL,
  file_name            VARCHAR(255) NOT NULL,
  file_path            VARCHAR(255) NOT NULL,
  file_size            BIGINT NOT NULL DEFAULT 0,
  mime_type            VARCHAR(100) NOT NULL DEFAULT '',
  status               VARCHAR(20)  NOT NULL DEFAULT 'submitted',  -- submitted, accepted, rejected, replaced
  rejection_reason     VARCHAR(255) NOT NULL DEFAULT '',
  uploaded_by          INT UNSIGNED NULL,                          -- staff user id; NULL = the applicant
  reviewed_by          INT UNSIGNED NULL,
  reviewed_at          DATETIME NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at           DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_payment_proofs_batch (application_batch_id),
  KEY idx_payment_proofs_status (status),
  KEY idx_payment_proofs_transaction_code (transaction_code),
  KEY idx_payment_proofs_deleted_at (deleted_at),
  CONSTRAINT fk_payment_proofs_batch FOREIGN KEY (application_batch_id) REFERENCES application_batches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
