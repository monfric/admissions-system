# Deploying the NMTC Admissions System on cPanel

This guide puts three sites on one cPanel account. No SSH or Terminal is needed.

| Site | Address | What goes there |
|---|---|---|
| API (PHP + MySQL) | `https://api.nmtc.ac.ke` | `nmtc-api.zip` |
| Applicant portal | `https://apply.nmtc.ac.ke` | `apply.zip` |
| Staff app | `https://staff.nmtc.ac.ke` | `staff.zip` |

In the steps, **USERNAME** is your cPanel username (shown in cPanel's right-hand
"General Information" panel, next to *Home Directory*, e.g. `/home/nmtcac`).

---

## 0. Prepare the files (on your computer)

From the `admissions-system` folder, with Node 22 (`nvm use 22`):

```bash
bash deploy/package.sh
```

This creates `deploy/out/` with `nmtc-api.zip`, `apply.zip`, `staff.zip`,
`nmtc-database.sql` and this guide.

`nmtc-api.zip` contains the live settings file with new secret keys. Don't
email it or put it anywhere public. Run the script again for a fresh set of keys.

**Before going live**, replace the placeholder branding *before* running the
script:

| What | File |
|---|---|
| Letterhead (top of every letter) | `api/assets/letterhead/header.jpg` |
| Letter footer | `api/assets/letterhead/footer.png` |
| Logo (portal + staff app) | `portal/src/assets/dist/img/logo.png` and `staff/src/assets/dist/img/logo.png` |

Keep the same file names. The letterhead images still show the old college's
letterhead until you replace them.

---

## 1. Choose the PHP version

cPanel → **Software** → **Select PHP Version** (or **MultiPHP Manager**).

- Choose **PHP 8.1 or newer** (8.2 or 8.3 recommended) for the account or the `api` domain.
- In **Extensions**, make sure these are ticked: `pdo_mysql`, `mbstring`,
  `fileinfo`, `zlib`, `iconv`, `json`. They usually are by default.

## 2. Create the database

cPanel → **Databases** → **MySQL® Databases**.

1. **Create New Database:** e.g. `admissions`. cPanel names it
   `USERNAME_admissions`. Note the full name.
2. **Add New User:** e.g. `api`, giving `USERNAME_api`. Use the *Password
   Generator* and **note the password**.
3. **Add User To Database:** pick the user and the database, then tick
   **ALL PRIVILEGES** → *Make Changes*.

Then cPanel → **phpMyAdmin**:

4. Click the new database on the left.
5. **Import** tab → *Choose File* → `nmtc-database.sql` → **Import** (bottom of the page).
6. You should see 17 tables (`admissions` … `users`).

## 3. Create the three subdomains

cPanel → **Domains** → **Domains** (or **Subdomains** on older cPanel) → **Create A New Domain**:

| Domain | Document Root (type it exactly) |
|---|---|
| `api.nmtc.ac.ke` | `nmtc-api/public` |
| `apply.nmtc.ac.ke` | `apply.nmtc.ac.ke` (the default) |
| `staff.nmtc.ac.ke` | `staff.nmtc.ac.ke` (the default) |

For the API, untick "Share document root" if shown, and **make sure the document
root is `nmtc-api/public`**, not `nmtc-api`. Only the `public` folder may be
reachable from the web; the code, settings and uploaded files sit beside it.

> If your cPanel only allows document roots inside `public_html`, use
> `public_html/nmtc-api/public` instead (and extract the API zip into
> `public_html/nmtc-api` in step 4). The API's private folders refuse web access
> on their own, so this is still safe.

**HTTPS:** cPanel → **Security** → **SSL/TLS Status** → select the three
subdomains → **Run AutoSSL**. Wait until each shows a green padlock. The DNS for
the subdomains must already point at this server; ask your domain provider if not.

## 4. Upload the API

cPanel → **Files** → **File Manager**:

1. Go to your home folder (`/home/USERNAME`). If step 3 created an empty
   `nmtc-api` folder, open it; otherwise create the folder **`nmtc-api`** and open it.
2. **Upload** → `nmtc-api.zip`. Back in File Manager, right-click it →
   **Extract** → into `/home/USERNAME/nmtc-api`. Then delete the zip.
3. You should now have `app`, `public`, `storage`, `assets`, `cron` and `database` inside `nmtc-api`.
4. Open `app/config.php` (right-click → **Edit**) and fill in the database details from step 2:

   ```php
   'db' => [
       'host' => 'localhost',
       'port' => 3306,
       'name' => 'USERNAME_admissions',
       'user' => 'USERNAME_api',
       'pass' => 'the password you noted',
   ],
   ```

   Leave the rest as it is (`debug` must stay `false`). **Save Changes.**
5. **Check:** open <https://api.nmtc.ac.ke/api/v1/health> in a browser. It must say:

   ```json
   {"status":"healthy","message":"NMTC Admissions API is running"}
   ```

   Otherwise it lists what's wrong (see *Troubleshooting* below).

## 5. Upload the two websites

Still in File Manager:

1. Open the `apply.nmtc.ac.ke` folder → **Upload** `apply.zip` → **Extract** here → delete the zip.
2. Open the `staff.nmtc.ac.ke` folder → **Upload** `staff.zip` → **Extract** here → delete the zip.

Each folder should now contain `index.html`, a `.htaccess`, an `assets` folder and
several `.js`/`.css` files. Tick *Show Hidden Files* in File Manager's *Settings*
to see `.htaccess`.

## 6. Schedule the offer recall (cron job)

Notified applicants have 30 days to be approved. After that the offer is
recalled automatically by a job that must run every hour.

cPanel → **Advanced** → **Cron Jobs** → *Add New Cron Job*:

- **Common Settings:** *Once Per Hour* (`0 * * * *`)
- **Command:**

  ```
  /usr/local/bin/php /home/USERNAME/nmtc-api/cron/recall.php >/dev/null 2>&1
  ```

  If your host uses another PHP path, cPanel's *Select PHP Version* page or your
  host's help pages show it (e.g. `/opt/cpanel/ea-php82/root/usr/bin/php`).

Each run adds a line to `nmtc-api/storage/logs/cron.log`, e.g.
`recall: 0 application(s) recalled`. Check it after an hour.

### Emails (second cron job)

The API queues emails (application received, offers, reminders, admission,
password resets…) and this job sends them. Add another cron job:

- **Common Settings:** *Once Per Minute* (`* * * * *`)
- **Command:**

  ```
  /usr/local/bin/php /home/USERNAME/nmtc-api/cron/emails.php >/dev/null 2>&1
  ```

Then fill in the `mail` section of `nmtc-api/app/config.php`:

1. On the Google account **monfricsolutions@gmail.com**: Google Account →
   **Security** → turn on **2-Step Verification**.
2. Same page → **App passwords** → create one named e.g. "NMTC Admissions".
   Google shows a 16-character password.
3. In `config.php` → `'mail'`: paste it as `'password'` (no spaces) and make
   sure `'driver' => 'smtp'`. Never put the normal Gmail password here.
4. Check `'portal_url'` and `'staff_url'` are the live addresses: email links
   point there.

To use an official address later (e.g. `admissions@nmtc.ac.ke` from cPanel →
**Email Accounts**), change only `host` (your mail server, e.g.
`mail.nmtc.ac.ke`), `port`, `username`, `password` and `from_email`.

**Check it:** in the staff app, **Email Log** (admins) lists every email with
its status. *Failed* emails show the error; fix the setting and click
**Resend**. If every email fails with a connection error, ask your host to allow
outgoing SMTP to `smtp.gmail.com` on port 587.

Gmail allows about 500 emails a day; switch to the official mailbox if you
come close to that.

## 7. First login and checks

1. Open <https://staff.nmtc.ac.ke> and log in as **`admin@nmtc.ac.ke`** /
   **`ChangeMe@2026`**.
2. **Immediately:** sidebar → **Change Password**.
3. Optional: **Staff Users** → *Add New User* for each staff member (or change the
   admin's email to a real address via *Edit*).
4. Set up the college: **Faculties → Departments → Training Levels → Programmes**,
   then **Intakes** (Manage Intake → add programmes and application fees).
5. Write the **Offer Letters** and upload **Application Documents** for each
   programme. Use *Preview PDF* to check a letter.
6. Open <https://apply.nmtc.ac.ke>, register a test applicant, complete the
   profile and apply. In the staff app the application appears under **New
   Applicants / Unpaid Applications**. Take it through Pay → Notify → Approve and
   check the applicant can download their letters and fill in the uniform form.
7. Delete or deactivate the test applicant's data when done.

## Updating later

- **Websites:** run `bash deploy/package.sh` again, then upload and extract
  `apply.zip` / `staff.zip` over the old files.
- **API code:** extract the new `nmtc-api.zip` somewhere else first, then copy
  over `app` (except `app/config.php`), `public`, `assets` and `cron`.
- **Database changes:** if the update adds a file under `database/migrations/`,
  import it once in phpMyAdmin (they are safe to import twice). The email update
  (Nov 2026) needs `2026-11-03-email.sql`, the new `'mail'`, `'portal_url'`
  and `'staff_url'` settings in `app/config.php` (copy them from
  `app/config.example.php`), and the email cron job above.
  **Never overwrite `app/config.php` or the `storage` folder**: they hold your
  live settings and the uploaded files.

## Backups

- **Database:** cPanel → **phpMyAdmin** → the database → **Export**, or
  cPanel → **Backup** → *Download a MySQL Database Backup*.
- **Uploaded files:** `nmtc-api/storage/uploads` (profile photos, certificates,
  application documents). Back it up with the database.
- Also keep a copy of `nmtc-api/app/config.php`. Without its keys, everyone has
  to log in again.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` shows *cannot connect to the database* | Check `name`, `user`, `pass` in `app/config.php` (with the `USERNAME_` prefix) and that the user was added to the database with ALL PRIVILEGES. |
| `/health` shows *database tables are missing* | Import `nmtc-database.sql` into that database (step 2). |
| `/health` shows *storage/… is not writable* | File Manager → `nmtc-api/storage` → right-click → **Change Permissions** → `755` (folders), and the same for the folders inside it. |
| `/health` shows *PHP extension … is not enabled* | Tick it in **Select PHP Version → Extensions**. |
| The address shows a directory listing or downloads PHP files | The API's document root is wrong: it must be `nmtc-api/public` (step 3). |
| The websites load but say *Login failed* / show nothing | Open `https://api.nmtc.ac.ke/api/v1/health`. If that works, check `cors_allowed_origins` in `app/config.php` lists `https://apply.nmtc.ac.ke` and `https://staff.nmtc.ac.ke` exactly (https, no trailing slash). |
| Logged in, but every page logs you out | The server drops the `Authorization` header. The included `public/.htaccess` normally fixes this; ask your host to enable `mod_rewrite` / `CGIPassAuth` for the domain. |
| Uploads fail for larger files | Raise `upload_max_filesize` to 12M and `post_max_size` to 14M in **Select PHP Version → Options** (the included `.user.ini` sets them on most hosts). |
| A page says *Internal server error* | See `nmtc-api/storage/logs/error.log` for the reason. |
| Letters show the wrong letterhead or sign-off | Replace `nmtc-api/assets/letterhead/header.jpg` / `footer.png`; the sign-off is the `letters` section of `app/config.php`. |
