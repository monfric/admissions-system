-- M-Pesa payments through the central Payment Gateway (Phase 2).
-- Run once on an existing database (phpMyAdmin → SQL, or mysql < this file).
-- New installs get the same from schema.sql.

-- One STK Push attempt for an application's fee, mirrored from the gateway.
CREATE TABLE IF NOT EXISTS mpesa_payments (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  application_batch_id INT UNSIGNED  NOT NULL,
  gateway_id           VARCHAR(40)   NULL,                      -- the gateway's "txn_…" (NULL until it answered)
  idempotency_key      VARCHAR(64)   NOT NULL,
  phone                VARCHAR(15)   NOT NULL,                  -- 2547XXXXXXXX
  amount               DECIMAL(14,2) NOT NULL,                  -- requested
  status               VARCHAR(20)   NOT NULL DEFAULT 'starting', -- starting, pending, success, failed, cancelled, timeout, expired, error
  message              VARCHAR(255)  NOT NULL DEFAULT '',
  mpesa_receipt        VARCHAR(20)   NULL,
  paid_amount          DECIMAL(14,2) NULL,
  paid_at              DATETIME      NULL,
  flags                VARCHAR(255)  NOT NULL DEFAULT '',       -- from the gateway, plus "underpaid"
  payment_id           INT UNSIGNED  NULL,                      -- the payments row it created
  initiated_by         INT UNSIGNED  NULL,                      -- staff user id; NULL = the applicant
  reviewed_by          INT UNSIGNED  NULL,                      -- staff who checked a flagged payment
  reviewed_at          DATETIME      NULL,
  last_synced_at       DATETIME      NULL,
  created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mpesa_payments_gateway (gateway_id),
  UNIQUE KEY uq_mpesa_payments_idempotency (idempotency_key),
  KEY idx_mpesa_payments_batch (application_batch_id),
  KEY idx_mpesa_payments_status (status),
  CONSTRAINT fk_mpesa_payments_batch FOREIGN KEY (application_batch_id) REFERENCES application_batches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gateway webhook deliveries already handled (a repeated delivery is ignored).
CREATE TABLE IF NOT EXISTS gateway_webhook_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  delivery_id VARCHAR(40)  NOT NULL,
  event       VARCHAR(40)  NOT NULL,
  gateway_id  VARCHAR(40)  NOT NULL DEFAULT '',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gateway_webhook_events_delivery (delivery_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A payment made through the gateway can only be recorded once.
ALTER TABLE payments
  ADD COLUMN gateway_transaction_id VARCHAR(40) NULL AFTER transaction_code,
  ADD UNIQUE KEY uq_payments_gateway_txn (gateway_transaction_id);
