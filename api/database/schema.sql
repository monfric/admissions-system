-- NMTC Admissions System — database schema
-- Import once into an empty MySQL/MariaDB database (cPanel → phpMyAdmin → Import).
-- It creates every table and the first admin account:
--   email:    admin@nmtc.ac.ke
--   password: ChangeMe@2026   ← change it right after the first login.
--
-- Tables and columns mirror the LMIS (Go) backend, so both Angular apps work unchanged.
-- Every table has created_at / updated_at / deleted_at; deleted rows are kept
-- (soft delete) and ignored by the API.

SET NAMES utf8mb4;
SET time_zone = '+03:00';

-- ─── Staff accounts ───────────────────────────────────────────────────────────
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(100) NOT NULL,
  password      VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  phone_number  VARCHAR(20)  NOT NULL DEFAULT '',
  role          VARCHAR(20)  NOT NULL DEFAULT 'staff',   -- admin, staff
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Academic setup ───────────────────────────────────────────────────────────
CREATE TABLE faculties (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(20)  NULL,
  description TEXT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_faculties_name (name),
  UNIQUE KEY uq_faculties_code (code),
  KEY idx_faculties_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE departments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  faculty_id  INT UNSIGNED NOT NULL,
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(20)  NULL,
  description TEXT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_code (code),
  KEY idx_departments_faculty (faculty_id),
  KEY idx_departments_deleted_at (deleted_at),
  CONSTRAINT fk_departments_faculty FOREIGN KEY (faculty_id) REFERENCES faculties (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE training_levels (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(20)  NULL,
  description TEXT NULL,
  `order`     INT NOT NULL DEFAULT 0,          -- sorting (1 = Certificate, 2 = Diploma, …)
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_training_levels_name (name),
  UNIQUE KEY uq_training_levels_code (code),
  KEY idx_training_levels_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE programmes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id     INT UNSIGNED NOT NULL,
  training_level_id INT UNSIGNED NOT NULL,
  name              VARCHAR(200) NOT NULL,
  code              VARCHAR(20)  NOT NULL,
  description       TEXT NULL,
  duration_years    INT NOT NULL DEFAULT 0,
  duration_months   INT NOT NULL DEFAULT 0,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at        DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_programmes_code (code),
  KEY idx_programmes_department (department_id),
  KEY idx_programmes_training_level (training_level_id),
  KEY idx_programmes_deleted_at (deleted_at),
  CONSTRAINT fk_programmes_department FOREIGN KEY (department_id) REFERENCES departments (id),
  CONSTRAINT fk_programmes_training_level FOREIGN KEY (training_level_id) REFERENCES training_levels (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Applicants ───────────────────────────────────────────────────────────────
CREATE TABLE applicants (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email              VARCHAR(100) NOT NULL,
  password           VARCHAR(255) NOT NULL,
  first_name         VARCHAR(100) NOT NULL,
  middle_name        VARCHAR(100) NOT NULL DEFAULT '',
  last_name          VARCHAR(100) NOT NULL,
  phone_number       VARCHAR(20)  NOT NULL,
  id_number          VARCHAR(50)  NOT NULL,
  date_of_birth      DATETIME NULL,
  gender             VARCHAR(10)  NOT NULL DEFAULT '',
  profile_photo      VARCHAR(255) NOT NULL DEFAULT '',
  county             VARCHAR(100) NOT NULL DEFAULT '',
  sub_county         VARCHAR(100) NOT NULL DEFAULT '',
  denomination       VARCHAR(100) NOT NULL DEFAULT '',
  has_disability     TINYINT(1)   NOT NULL DEFAULT 0,
  disability_details VARCHAR(255) NOT NULL DEFAULT '',
  guardian_name      VARCHAR(200) NOT NULL DEFAULT '',
  relationship       VARCHAR(50)  NOT NULL DEFAULT '',
  guardian_contact   VARCHAR(20)  NOT NULL DEFAULT '',
  sponsor_name       VARCHAR(200) NOT NULL DEFAULT '',
  sponsor_contact    VARCHAR(20)  NOT NULL DEFAULT '',
  secondary_school   VARCHAR(200) NOT NULL DEFAULT '',
  index_number       VARCHAR(50)  NOT NULL DEFAULT '',
  kcse_year          INT NOT NULL DEFAULT 0,
  aggregate          VARCHAR(10)  NOT NULL DEFAULT '',
  english_grade      VARCHAR(20)  NOT NULL DEFAULT '',
  kiswahili_grade    VARCHAR(20)  NOT NULL DEFAULT '',
  biology_grade      VARCHAR(20)  NOT NULL DEFAULT '',
  maths_grade        VARCHAR(20)  NOT NULL DEFAULT '',
  chemistry_grade    VARCHAR(20)  NOT NULL DEFAULT '',
  physics_grade      VARCHAR(20)  NOT NULL DEFAULT '',
  college_grade      VARCHAR(50)  NOT NULL DEFAULT '',
  graduation_year    INT NULL,
  mark_complete      TINYINT(1) NOT NULL DEFAULT 0,   -- profile submitted
  profile_step       INT NOT NULL DEFAULT 0,          -- portal profile-form step (0-based)
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at         DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_applicants_email (email),
  UNIQUE KEY uq_applicants_id_number (id_number),
  KEY idx_applicants_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Supporting documents (ID card, KCSE certificate, …), one row per type.
CREATE TABLE applicant_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  applicant_id  INT UNSIGNED NOT NULL,
  document_type VARCHAR(50)  NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  file_size     BIGINT NOT NULL DEFAULT 0,
  mime_type     VARCHAR(100) NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_applicant_document_type (applicant_id, document_type),
  KEY idx_applicant_documents_deleted_at (deleted_at),
  CONSTRAINT fk_applicant_documents_applicant FOREIGN KEY (applicant_id) REFERENCES applicants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Intakes ──────────────────────────────────────────────────────────────────
CREATE TABLE intakes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  intake_month VARCHAR(20) NOT NULL,   -- e.g. "September"
  intake_year  INT NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_intakes_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Programmes open in an intake.
CREATE TABLE intake_programmes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  intake_id    INT UNSIGNED NOT NULL,
  programme_id INT UNSIGNED NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_intake_programmes_intake (intake_id),
  KEY idx_intake_programmes_programme (programme_id),
  KEY idx_intake_programmes_deleted_at (deleted_at),
  CONSTRAINT fk_intake_programmes_intake FOREIGN KEY (intake_id) REFERENCES intakes (id),
  CONSTRAINT fk_intake_programmes_programme FOREIGN KEY (programme_id) REFERENCES programmes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Training levels open in an intake, with their application fee (KES).
CREATE TABLE intake_training_levels (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  intake_id         INT UNSIGNED NOT NULL,
  training_level_id INT UNSIGNED NOT NULL,
  application_fee   DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at        DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_intake_training_levels_intake (intake_id),
  KEY idx_intake_training_levels_level (training_level_id),
  KEY idx_intake_training_levels_deleted_at (deleted_at),
  CONSTRAINT fk_intake_training_levels_intake FOREIGN KEY (intake_id) REFERENCES intakes (id),
  CONSTRAINT fk_intake_training_levels_level FOREIGN KEY (training_level_id) REFERENCES training_levels (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Applications ─────────────────────────────────────────────────────────────
-- One per applicant per intake, under a random 6-digit application number.
CREATE TABLE application_batches (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  applicant_id       INT UNSIGNED NOT NULL,
  intake_id          INT UNSIGNED NOT NULL,
  training_level_id  INT UNSIGNED NOT NULL,
  application_number VARCHAR(6)  NOT NULL,
  residence          VARCHAR(20) NOT NULL DEFAULT '',          -- Boarder, Day Scholar
  payment_status     VARCHAR(20) NOT NULL DEFAULT 'unpaid',    -- unpaid, paid
  decision_status    VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending, notified, recalled, approved, rejected
  remarks            TEXT NULL,
  notified_at        DATETIME NULL,
  recalled_at        DATETIME NULL,
  rejected_at        DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at         DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_application_batches_applicant (applicant_id),
  KEY idx_application_batches_intake (intake_id),
  KEY idx_application_batches_level (training_level_id),
  KEY idx_application_batches_number (application_number),
  KEY idx_application_batches_deleted_at (deleted_at),
  CONSTRAINT fk_application_batches_applicant FOREIGN KEY (applicant_id) REFERENCES applicants (id),
  CONSTRAINT fk_application_batches_intake FOREIGN KEY (intake_id) REFERENCES intakes (id),
  CONSTRAINT fk_application_batches_level FOREIGN KEY (training_level_id) REFERENCES training_levels (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One per programme chosen in an application (1st / 2nd choice).
CREATE TABLE applications (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_batch_id INT UNSIGNED NOT NULL,
  intake_programme_id  INT UNSIGNED NOT NULL,
  application_status   VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, notified, recalled, approved, rejected
  choice               INT NOT NULL DEFAULT 0,                  -- 1 = 1st choice, 2 = 2nd choice
  approved_by          INT UNSIGNED NULL,
  approved_at          DATETIME NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at           DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_applications_batch (application_batch_id),
  KEY idx_applications_intake_programme (intake_programme_id),
  KEY idx_applications_approved_by (approved_by),
  KEY idx_applications_deleted_at (deleted_at),
  CONSTRAINT fk_applications_batch FOREIGN KEY (application_batch_id) REFERENCES application_batches (id),
  CONSTRAINT fk_applications_intake_programme FOREIGN KEY (intake_programme_id) REFERENCES intake_programmes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Application-fee payments recorded by staff.
CREATE TABLE payments (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_batch_id INT UNSIGNED NOT NULL,
  amount               DECIMAL(14,2) NOT NULL,
  payment_method       VARCHAR(50)  NOT NULL DEFAULT '',
  transaction_code     VARCHAR(100) NOT NULL DEFAULT '',
  paid_at              DATETIME NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at           DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_payments_batch (application_batch_id),
  KEY idx_payments_transaction_code (transaction_code),
  KEY idx_payments_deleted_at (deleted_at),
  CONSTRAINT fk_payments_batch FOREIGN KEY (application_batch_id) REFERENCES application_batches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Created when an application is approved; admission_number is
-- "{ProgrammeCode}/{seq}/{MM}/{YY}" (uniqueness checked in code).
CREATE TABLE admissions (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  applicant_id     INT UNSIGNED NOT NULL,
  application_id   INT UNSIGNED NOT NULL,
  intake_id        INT UNSIGNED NOT NULL,
  programme_id     INT UNSIGNED NOT NULL,
  admission_number VARCHAR(20) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'active',   -- active, inactive
  admitted_at      DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at       DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_admissions_applicant (applicant_id),
  KEY idx_admissions_application (application_id),
  KEY idx_admissions_intake (intake_id),
  KEY idx_admissions_programme (programme_id),
  KEY idx_admissions_number (admission_number),
  KEY idx_admissions_deleted_at (deleted_at),
  CONSTRAINT fk_admissions_applicant FOREIGN KEY (applicant_id) REFERENCES applicants (id),
  CONSTRAINT fk_admissions_application FOREIGN KEY (application_id) REFERENCES applications (id),
  CONSTRAINT fk_admissions_intake FOREIGN KEY (intake_id) REFERENCES intakes (id),
  CONSTRAINT fk_admissions_programme FOREIGN KEY (programme_id) REFERENCES programmes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Letters & documents ──────────────────────────────────────────────────────
-- Letter body (limited HTML from the editor) per programme in an intake.
CREATE TABLE offer_letters (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  intake_programme_id INT UNSIGNED NOT NULL,
  type                VARCHAR(20) NOT NULL,                 -- provisional, admission
  body                MEDIUMTEXT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_offer_letters_intake_programme (intake_programme_id),
  KEY idx_offer_letters_deleted_at (deleted_at),
  CONSTRAINT fk_offer_letters_intake_programme FOREIGN KEY (intake_programme_id) REFERENCES intake_programmes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff-uploaded PDFs (fee structure, joining requirements, …) per programme in an intake.
CREATE TABLE application_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_name VARCHAR(255) NOT NULL,
  intake_id     INT UNSIGNED NOT NULL,
  programme_id  INT UNSIGNED NOT NULL,
  type          VARCHAR(20)  NOT NULL,                 -- provisional, admission
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  file_size     BIGINT NOT NULL DEFAULT 0,
  mime_type     VARCHAR(100) NOT NULL DEFAULT '',
  status        VARCHAR(20)  NOT NULL DEFAULT 'active', -- active, inactive
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_application_documents_intake (intake_id),
  KEY idx_application_documents_programme (programme_id),
  KEY idx_application_documents_deleted_at (deleted_at),
  CONSTRAINT fk_application_documents_intake FOREIGN KEY (intake_id) REFERENCES intakes (id),
  CONSTRAINT fk_application_documents_programme FOREIGN KEY (programme_id) REFERENCES programmes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Uniform measurements ─────────────────────────────────────────────────────
-- One form per admission, all values in inches. Only the chosen set's
-- (gents / ladies) columns are filled; the rest stay NULL.
CREATE TABLE uniform_measurements (
  id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admission_id             INT UNSIGNED NOT NULL,
  applicant_id             INT UNSIGNED NOT NULL,
  uniform_set              VARCHAR(10) NOT NULL,   -- gents, ladies
  status                   VARCHAR(20) NOT NULL,   -- submitted, unlocked
  tailor_confirmed         TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at             DATETIME NOT NULL,
  unlocked_at              DATETIME NULL,
  shirt_full_length        DECIMAL(5,2) NULL,
  shirt_chest              DECIMAL(5,2) NULL,
  shirt_shoulder           DECIMAL(5,2) NULL,
  shirt_sleeve_length      DECIMAL(5,2) NULL,
  shirt_round_sleeve       DECIMAL(5,2) NULL,
  blouse_full_length       DECIMAL(5,2) NULL,
  blouse_bust              DECIMAL(5,2) NULL,
  blouse_waist_length      DECIMAL(5,2) NULL,
  blouse_waist             DECIMAL(5,2) NULL,
  blouse_hips              DECIMAL(5,2) NULL,
  blouse_sleeve_length     DECIMAL(5,2) NULL,
  trouser_full_length      DECIMAL(5,2) NULL,
  trouser_seat             DECIMAL(5,2) NULL,
  trouser_waist            DECIMAL(5,2) NULL,
  trouser_hips             DECIMAL(5,2) NULL,
  trouser_thighs           DECIMAL(5,2) NULL,
  trouser_bottom           DECIMAL(5,2) NULL,
  lab_coat_full_length     DECIMAL(5,2) NULL,
  lab_coat_shoulder_sleeve DECIMAL(5,2) NULL,
  lab_coat_chest           DECIMAL(5,2) NULL,
  lab_coat_round_sleeve    DECIMAL(5,2) NULL,
  apron_full_length        DECIMAL(5,2) NULL,
  apron_shoulders          DECIMAL(5,2) NULL,
  apron_chest              DECIMAL(5,2) NULL,
  apron_round_sleeve       DECIMAL(5,2) NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at               DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_uniform_measurements_admission (admission_id),
  KEY idx_uniform_measurements_applicant (applicant_id),
  KEY idx_uniform_measurements_deleted_at (deleted_at),
  CONSTRAINT fk_uniform_measurements_admission FOREIGN KEY (admission_id) REFERENCES admissions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- ─── First admin account ──────────────────────────────────────────────────────
-- Password: ChangeMe@2026 (bcrypt). Change it after the first login.
INSERT INTO users (email, password, first_name, last_name, role, is_active)
VALUES ('admin@nmtc.ac.ke', '$2y$10$USxf3z4uICLCNtokDQZFfeENaePziB7v1hLI9./UfS0Iha5/Gn9uG', 'System', 'Administrator', 'admin', 1);
