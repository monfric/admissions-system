-- Central Payment Gateway: M-Pesa STK Push for client systems (e.g. NMTC Admissions).
-- MySQL 8 / MariaDB 10.4+. Import into an empty database.

SET NAMES utf8mb4;

-- ─── Client systems ───────────────────────────────────────────────────────────
-- Each system that takes payments through the gateway. It signs its requests
-- with its secret (HMAC), and the gateway signs the webhooks it sends back.
CREATE TABLE IF NOT EXISTS clients (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(100) NOT NULL,
  key_id            VARCHAR(40)  NOT NULL,                 -- public, sent as X-Client-Id
  secret_encrypted  TEXT         NOT NULL,                 -- encrypted with config app_key
  webhook_url       VARCHAR(255) NOT NULL DEFAULT '',      -- where payment results are sent
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clients_key_id (key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Transactions ─────────────────────────────────────────────────────────────
-- One STK Push request. Status only moves forward:
--   initiated → pending → success | failed | cancelled | timeout | expired
-- "expired" is the gateway's own give-up (M-Pesa never gave a result); a later
-- confirmed success still turns it into success, so no payment is lost.
CREATE TABLE IF NOT EXISTS transactions (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id            VARCHAR(40)   NOT NULL,             -- "txn_…", shown to clients
  client_id            INT UNSIGNED  NOT NULL,
  client_reference     VARCHAR(64)   NOT NULL,             -- the client's own reference, e.g. application number
  idempotency_key      VARCHAR(100)  NOT NULL,
  request_fingerprint  CHAR(64)      NOT NULL,             -- sha256 of amount|phone|reference
  amount               DECIMAL(12,2) NOT NULL,
  currency             CHAR(3)       NOT NULL DEFAULT 'KES',
  phone                VARCHAR(15)   NOT NULL,             -- 2547XXXXXXXX / 2541XXXXXXXX
  account_reference    VARCHAR(12)   NOT NULL,             -- shown on the M-Pesa prompt
  description          VARCHAR(100)  NOT NULL DEFAULT '',
  metadata             JSON          NULL,                 -- client data, returned unchanged
  status               VARCHAR(20)   NOT NULL DEFAULT 'initiated',
  result_code          INT           NULL,                 -- M-Pesa ResultCode (0 = paid)
  result_desc          VARCHAR(255)  NOT NULL DEFAULT '',
  merchant_request_id  VARCHAR(64)   NULL,
  checkout_request_id  VARCHAR(64)   NULL,
  -- What the callback reported (kept even before the result is confirmed).
  cb_result_code       INT           NULL,
  cb_receipt           VARCHAR(20)   NULL,
  cb_amount            DECIMAL(12,2) NULL,
  cb_phone             VARCHAR(15)   NULL,
  cb_transaction_date  DATETIME      NULL,
  cb_received_at       DATETIME      NULL,
  -- Confirmed payment details.
  mpesa_receipt        VARCHAR(20)   NULL,
  paid_amount          DECIMAL(12,2) NULL,
  paid_phone           VARCHAR(15)   NULL,
  paid_at              DATETIME      NULL,
  verified_by          VARCHAR(20)   NOT NULL DEFAULT '',  -- callback+query | query
  flags                VARCHAR(255)  NOT NULL DEFAULT '',  -- comma list: amount_mismatch, receipt_pending, late, duplicate_receipt
  -- Status checks with M-Pesa (STK Query).
  query_attempts       INT UNSIGNED  NOT NULL DEFAULT 0,
  next_query_at        DATETIME      NULL,                 -- NULL = no more checks needed
  last_query_error     VARCHAR(255)  NOT NULL DEFAULT '',
  expires_at           DATETIME      NOT NULL,
  completed_at         DATETIME      NULL,
  created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transactions_public_id (public_id),
  UNIQUE KEY uq_transactions_idempotency (client_id, idempotency_key),
  UNIQUE KEY uq_transactions_checkout (checkout_request_id),
  UNIQUE KEY uq_transactions_receipt (mpesa_receipt),
  KEY idx_transactions_reference (client_id, client_reference),
  KEY idx_transactions_status (status),
  KEY idx_transactions_next_query (next_query_at),
  CONSTRAINT fk_transactions_client FOREIGN KEY (client_id) REFERENCES clients (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every status change, for tracking and audits.
CREATE TABLE IF NOT EXISTS transaction_events (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id  INT UNSIGNED NOT NULL,
  from_status     VARCHAR(20)  NOT NULL DEFAULT '',
  to_status       VARCHAR(20)  NOT NULL DEFAULT '',
  source          VARCHAR(20)  NOT NULL DEFAULT '',        -- api | callback | query | cron
  note            VARCHAR(255) NOT NULL DEFAULT '',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transaction_events_txn (transaction_id),
  CONSTRAINT fk_transaction_events_txn FOREIGN KEY (transaction_id) REFERENCES transactions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── M-Pesa callbacks ─────────────────────────────────────────────────────────
-- Every callback exactly as received, saved before any processing, so nothing
-- is lost if processing fails (cron/reconcile.php retries "received"/"error").
CREATE TABLE IF NOT EXISTS mpesa_callbacks (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type                 VARCHAR(20)  NOT NULL DEFAULT 'stk',
  checkout_request_id  VARCHAR(64)  NULL,
  result_code          INT          NULL,
  ip                   VARCHAR(45)  NOT NULL DEFAULT '',
  raw_body             MEDIUMTEXT   NOT NULL,
  status               VARCHAR(20)  NOT NULL DEFAULT 'received',  -- received | processed | duplicate | unknown | invalid | error
  outcome              VARCHAR(255) NOT NULL DEFAULT '',
  attempts             INT UNSIGNED NOT NULL DEFAULT 0,
  transaction_id       INT UNSIGNED NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mpesa_callbacks_checkout (checkout_request_id),
  KEY idx_mpesa_callbacks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Webhooks to clients ──────────────────────────────────────────────────────
-- Payment results sent to the client's webhook_url, retried with backoff until
-- the client answers 2xx. One row per transaction and event.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id         VARCHAR(40)  NOT NULL,                 -- "evt_…", sent as X-Gateway-Delivery
  client_id         INT UNSIGNED NOT NULL,
  transaction_id    INT UNSIGNED NOT NULL,
  event             VARCHAR(40)  NOT NULL,                 -- payment.succeeded | payment.failed | payment.updated
  payload           MEDIUMTEXT   NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | delivered | failed | skipped
  attempts          INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at   DATETIME     NULL,
  last_status_code  INT          NULL,
  last_error        VARCHAR(255) NOT NULL DEFAULT '',
  delivered_at      DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook_deliveries_public_id (public_id),
  UNIQUE KEY uq_webhook_deliveries_event (transaction_id, event),
  KEY idx_webhook_deliveries_due (status, next_attempt_at),
  CONSTRAINT fk_webhook_deliveries_client FOREIGN KEY (client_id) REFERENCES clients (id),
  CONSTRAINT fk_webhook_deliveries_txn FOREIGN KEY (transaction_id) REFERENCES transactions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
