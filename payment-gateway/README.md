# Payment Gateway

One central service for M-Pesa STK Push ("Lipa na M-Pesa Online"), shared by every
system that takes payments (the first is NMTC Admissions). Only the gateway
holds the Daraja keys, receives Safaricom's callbacks and decides whether a
payment succeeded. Client systems call it with signed requests and receive
signed webhooks back.

```
Client system ──signed request──▶ Gateway ──STK Push──▶ Safaricom ──PIN prompt──▶ phone
Client system ◀──signed webhook── Gateway ◀──callback── Safaricom
                                  Gateway ──STK Query──▶ Safaricom   (confirms every result)
```

Plain PHP 8.1+ and MySQL, in the same style as the admissions API. There's
nothing to install with Composer. It uses curl when PHP has it and PHP's own
HTTPS otherwise.

## How a payment is settled

1. A client calls `POST /payments/stk`. The gateway sends the prompt and stores the transaction as **pending**.
2. Safaricom posts the result to the callback URL. The gateway saves the raw callback first.
3. **The callback never marks anything paid by itself.** The gateway asks M-Pesa directly
   (STK Query). Only that answer decides the status. The callback supplies the receipt
   number, amount, phone and time.
4. If no callback arrives, the every-minute cron (and any status request from the
   client) asks M-Pesa itself, so a missed callback still settles the payment.
5. The client gets a signed webhook: `payment.succeeded`, `payment.failed` or
   `payment.updated` (a receipt number that arrived later).

Statuses only move forward: `initiated → pending → success | failed | cancelled | timeout | expired`.
`expired` means M-Pesa gave no answer in time (10 minutes). The gateway keeps checking
for 24 hours, and a late confirmed success still becomes `success`, flagged `late`.

**Flags** are for staff attention. The payment is still recorded:

| Flag | Meaning |
|---|---|
| `amount_mismatch` | M-Pesa reports a different amount than requested |
| `receipt_pending` | Confirmed paid, but the receipt number hasn't arrived yet |
| `late` | Paid after the gateway had given up waiting |
| `duplicate_receipt` | The receipt number is already on another payment |

## Protection built in

- **Daraja keys** live only in `app/config.php` on the gateway server.
- **Client requests** are HMAC-signed with a per-client secret. The timestamp must be within 5 minutes (stops replays). Secrets are stored encrypted (AES-256-GCM, `app_key`).
- **Callback URL** contains a secret token, and accepts only Safaricom's IP addresses (`enforce_ip_allowlist`).
- **Duplicates:**
  - `CheckoutRequestID` and receipt numbers are unique.
  - Results are applied under a row lock, so repeated or simultaneous callbacks change nothing.
  - The same `Idempotency-Key` returns the same payment instead of a second prompt.
  - Only one waiting prompt per reference.
  - At most 3 prompts per phone every 5 minutes.
- **Production guard:** the gateway refuses to start with the mock driver or with `debug` on when `environment` is `production`.

## Run it locally

1. Create the database (once):
   ```bash
   mysql -u admin -p -e "CREATE DATABASE payment_gateway_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   mysql -u admin -p payment_gateway_dev < database/schema.sql
   ```
2. `app/config.php` is already set up for local use: `mock` driver, `environment` `local`, IP allowlist off.
3. Start the gateway (port 8003; the admissions API uses 8002):
   ```bash
   php -S 127.0.0.1:8003 -t public public/index.php
   ```
   Check: <http://127.0.0.1:8003/api/v1/health>
4. Create a client (prints its id and secret **once**):
   ```bash
   php bin/client.php create "Postman" ""
   ```
5. To settle missed callbacks and send webhooks, run the cron by hand: `php cron/reconcile.php`.

## Testing with Postman (no ngrok needed)

Import both files from `postman/` into Postman and select the **Payment Gateway (local)**
environment. Then fill in:

- `client_id` and `client_secret`: from `bin/client.php create`
- `callback_token`: `mpesa.callback_token` in `app/config.php`
- `my_phone`: only for folder 6

The collection signs every request automatically. Run the folders in order:

| Folder | What it proves |
|---|---|
| 1. Successful payment | Prompt, duplicate request with the same key, refusing a second prompt, callback, verified receipt, duplicate callback ignored |
| 2. Customer cancels | Result 1032 → `cancelled`; paying again for the same reference is allowed |
| 3. Different amount | `amount_mismatch` flag |
| 4. Security checks | Wrong signature, old timestamp, wrong callback token, reused key, bad phone, cents: all refused |
| 5. Missed callback | **Run by hand; wait ~70 s after "Start payment".** Settled by status check alone, receipt filled in by the late callback |
| 6. Sandbox | A real prompt to your phone (needs Daraja keys) |

In **mock** mode the status check reports the result of the latest callback you posted.
With no callback it reports success after 60 seconds (`mpesa.mock`). Phone `0700000001`
is always refused, so you can test that path.

## Using the Daraja sandbox

1. Create an app at <https://developer.safaricom.co.ke> with **M-Pesa Express** enabled.
2. In `app/config.php`:
   - set `mpesa.driver` to `'sandbox'`;
   - paste `consumer_key` and `consumer_secret`;
   - keep shortcode `174379` and the test passkey.
3. Use Postman folder 6. Your phone gets a prompt for KES 1.

Locally, Safaricom can't reach your computer, so the real callback is lost. The status
check (folder 6's second request, or the cron) still settles the payment. To also receive
the real callbacks, run the gateway on a public HTTPS address (e.g. `pay.pamojaci.org`).

When NMTC's own Paybill or Till is ready, change `driver` to `production` and set the
shortcode, the passkey from Safaricom and the live keys. For a Till, also set
`transaction_type` to `CustomerBuyGoodsOnline` and `party_b` to the till number.
No code changes are needed.

## API for client systems

Base: `https://pay.example.org/api/v1`. Responses are `{"success", "message", "data"}`.

| Request | Purpose |
|---|---|
| `POST /payments/stk` | Start a payment. Header `Idempotency-Key` (8–100 chars, new for each new payment). Body: `amount` (whole KES), `phone` (07…/01…/254…), `reference` (yours, ≤64), optional `description`, `account_reference` (≤12, shown on the prompt), `metadata` (object, returned unchanged). **201** prompt sent · **200** same key as before · **409** a prompt for this reference is still waiting (`data` = that payment) · **422** M-Pesa refused · **429** too many prompts to the phone · **503** M-Pesa unreachable |
| `GET /payments/:id` | One payment, checked with M-Pesa first if a check is due |
| `GET /payments?reference=…` | All payments for one of your references |

### Signing requests

Send three headers on each request:

- `X-Client-Id`: your client id
- `X-Timestamp`: Unix seconds
- `X-Signature`: hex HMAC-SHA256 of these five lines, joined with `\n`, using your secret:

```
<X-Timestamp>
<METHOD>
<path after /api/v1, e.g. /payments/stk>
<raw query string, or empty>
<sha256 hex of the raw body, or of "" when there is none>
```

### Webhooks

The gateway POSTs JSON `{"event", "id", "created_at", "data": <payment>}` to the client's
`webhook_url` with these headers:

- `X-Gateway-Event`
- `X-Gateway-Delivery`: the same as `id`. Ignore any id you've already processed.
- `X-Gateway-Timestamp`
- `X-Gateway-Signature`: HMAC-SHA256 of `"<timestamp>.<raw body>"`

Answer with any 2xx. Otherwise the gateway retries with backoff (1 min, 5 min, 15 min, … up to 10 attempts).

Clients must treat webhooks as idempotent, and must accept `payment.succeeded` after an
earlier `payment.failed`: that happens when an expired payment turns out to be paid.

## Managing clients

```bash
php bin/client.php create "<name>" <webhook_url>
php bin/client.php list
php bin/client.php set-webhook <client_id> <url>
php bin/client.php rotate-secret <client_id>
php bin/client.php disable <client_id>
php bin/client.php enable <client_id>
```

## Deploying (DirectAdmin, later)

These steps are a summary; follow the step-by-step guide when deploying.

1. Create the subdomain (e.g. `pay.pamojaci.org`) with SSL, and point its document root at `public/`.
2. Create a new MySQL database and user, then import `database/schema.sql`.
3. Upload `app/`, `bin/`, `cron/`, `public/` and `storage/`.
4. Create `app/config.php` from `config.example.php` **on the server**:
   - `environment` `production`, `debug` `false`;
   - a new `app_key` and `callback_token`;
   - the Daraja keys;
   - `enforce_ip_allowlist` `true`.

   Never upload the local `config.php`.
5. Cron, every minute: `/usr/local/bin/php /home/USERNAME/payment-gateway/cron/reconcile.php`.
6. Check `/api/v1/health`. `cron_last_run` should update every minute.
7. Post a test callback. The host's ModSecurity may block Safaricom's JSON posts, as it blocked PUT on the admissions API.
