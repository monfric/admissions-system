# NMTC Admissions API (PHP)

Backend for the NMTC applicant portal (`apply.nmtc.ac.ke`) and staff app
(`staff.nmtc.ac.ke`). Plain PHP 8.1+ with MySQL. No framework and no Composer,
so it runs on cPanel shared hosting without SSH.

It is a translation of the LMIS Go backend's admissions endpoints: the same
URLs (under `/api/v1`), JSON fields and status names, so the Angular apps work
unchanged.

## Folders

| Folder | Purpose | Public? |
|---|---|---|
| `public/` | `index.php` + `.htaccess`, the only web-facing files | yes (document root of `api.nmtc.ac.ke`) |
| `app/` | code and `config.php` | **no** |
| `storage/` | uploaded files, rate-limit counters, `logs/error.log` | **no** |
| `database/schema.sql` | creates all tables and the first admin | import once |
| `cron/` | `recall.php`, the hourly offer recall | **no** |
| `assets/` | letter fonts (Noto Serif) and letterhead images | **no** |

## Setup

1. Create a MySQL database and user, then import `database/schema.sql`
   (cPanel: *MySQL Databases*, then *phpMyAdmin → Import*).
2. Copy `app/config.example.php` to `app/config.php` and fill in the database
   details, a long random `jwt_secret`, and the allowed frontend addresses.
3. Point the API's (sub)domain at the `public/` folder.
4. Open `https://api.nmtc.ac.ke/api/v1/health`. It should say `healthy`.
5. Log in to the staff app as `admin@nmtc.ac.ke` / `ChangeMe@2026`, then
   **change the password straight away**.

## Run locally

```bash
cp app/config.example.php app/config.php   # then edit the db settings, set debug => true
php -S 127.0.0.1:8002 -t public public/index.php
curl http://127.0.0.1:8002/api/v1/health
```

## Sample data (local testing only)

`database/dev-seed.sql` adds a faculty, department, training levels,
programmes and an open intake with fees. Import it after `schema.sql` on a
**test** database only.

## Endpoints

| Method & path | Who |
|---|---|
| `GET /health` | anyone |
| `POST /auth/login`, `POST /auth/verify-token` | staff (login limited to 10 tries / 15 min) |
| `GET /auth/me`, `POST /auth/change-password`, `POST /auth/logout` | logged-in staff |
| `GET/POST /users`, `GET /users/stats`, `GET/PUT/DELETE /users/:id`, `POST /users/:id/activate`, `POST /users/:id/deactivate` | admins |
| `POST /applicant-portal/auth/register` (5 / hour), `POST /applicant-portal/auth/login` (10 / 15 min) | applicants |
| `GET /applicant-portal/me` | logged-in applicants |
| `GET/PUT /applicant-portal/profile`, `POST /applicant-portal/profile/submit` | logged-in applicants |
| `POST/GET /applicant-portal/profile/documents/:type` (profile, id_card, kcse_certificate, leaving_certificate, post_secondary_certificate; 5 MB) | logged-in applicants |
| `GET /applicant-portal/apply-options`, `GET/POST /applicant-portal/applications`, `GET /applicant-portal/applications/:id` | logged-in applicants |
| `GET /applicant-portal/applications/:id/documents/:documentId` | logged-in applicants |
| `GET/PUT /applicant-portal/applications/:id/uniform` | logged-in, admitted applicants |
| `GET /applicant-portal/payments` | logged-in applicants |

Staff endpoints (logged-in staff; the same URLs as the LMIS Go API):

| Area | Endpoints |
|---|---|
| Academic setup | `/faculties`, `/departments`, `/training-levels`, `/programmes` (list, get, create, update, delete) |
| Intakes | `/intakes` (+ `/stats`), `/intakes/:id/programmes`, `/intakes/:id/training-levels`, `/intake-programmes/:id`, `/intake-training-levels/:id` |
| Applicants | `/applicants` (+ `/stats`), `/applicants/documents/:id/upload`, `/applicants/documents/:id/files/:type` |
| Applications | `POST /applicants/:id/application-batches`, `/application-batches` (+ `/stats`), `/application-batches/:id/payments`, `/notify`, `/decision` |
| Admissions | `/admissions` (+ `/stats`) |
| Letters & documents | `/offer-letters`, `/application-documents` (+ `/stats`, `/:id/file`) |
| Uniform measurements | `/uniform-measurements` (+ `/sets`, `/stats`, `/:admissionId`, `/:admissionId/unlock`) |

Differences from the Go API, on purpose:
- Only **pending** paid applications can be notified (Go also allowed approved ones).
- Nothing that applications depend on can be deleted: intakes with applications,
  programmes/fee tiers that applicants applied under, applicants with
  applications. Deactivate or close them instead.
- Academic setup records are deleted outright once unused, so their codes can be reused.
- List sorting only accepts known column names.

PDFs: `GET /applicant-portal/applications/:id/letters/:type` (provisional | admission),
`GET /applicant-portal/applications/:id/uniform/pdf`, `GET /offer-letters/:id/preview`
(staff preview with "Student Name" / "ADM/NO"), `GET /uniform-measurements/:admissionId/pdf`.

Staff and applicant tokens are signed with different keys, so neither works
in the other app.

## Letters (PDF)

Letters and the uniform form are drawn with tFPDF (`app/Lib/tfpdf`, no Composer
needed) using the Noto Serif fonts in `assets/fonts/`.

- **Letterhead:** replace `assets/letterhead/header.jpg` and `footer.png`, keeping the
  names. They currently hold placeholder images that must be replaced before going live.
- **Sign-off and reference prefix:** the `letters` section of `app/config.php`
  (`SR. PHYLLIS`, `The College Principal`, `NMTC` → `NMTC/PROV/SEPT/2026`).
- tFPDF caches font metrics in `storage/fonts/unifont/`, so `storage/` must be writable.

## Hourly offer recall (cron)

Notified applicants have 30 days (the whole of the last day counts). After that
the offer is recalled. In cPanel → **Cron Jobs**, add a job that runs **once per
hour**:

```
/usr/local/bin/php /home/USERNAME/nmtc-api/cron/recall.php
```

Use your account's PHP path and folder. Each run appends a line to `storage/logs/cron.log`.
