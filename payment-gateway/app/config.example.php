<?php
// Payment Gateway settings.
// Copy this file to config.php (same folder) and fill in the real values.
// config.php holds secrets: never commit it or upload a local copy over the server's.

return [
    'app_name'    => 'Payment Gateway',
    'timezone'    => 'Africa/Nairobi',
    // local | production. Production refuses the mock driver and debug output.
    'environment' => 'production',
    // true shows error details in API responses; keep false on the live server.
    'debug'       => false,

    // Its own MySQL database (not the admissions one).
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'payment_gateway',
        'user' => 'gateway_user',
        'pass' => '',
    ],

    // Encrypts the client secrets stored in the database. 32 random bytes,
    // base64. Generate once with:  php -r 'echo base64_encode(random_bytes(32)), "\n";'
    // Changing it makes every stored client secret unreadable.
    'app_key' => '',

    'mpesa' => [
        // mock    = no Safaricom at all (local testing with Postman)
        // sandbox = Daraja sandbox (test money)
        // production = live payments
        'driver' => 'sandbox',

        // Daraja app keys (developer.safaricom.co.ke → My Apps).
        'consumer_key'    => '',
        'consumer_secret' => '',

        // Sandbox: shortcode 174379 and Safaricom's public test passkey below.
        // Live: your Paybill (or Till store number) and the passkey Safaricom sends on go-live.
        'shortcode' => '174379',
        'passkey'   => 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
        // Paybill: CustomerPayBillOnline. Till (Buy Goods): CustomerBuyGoodsOnline,
        // with party_b = the till number. Empty party_b = the shortcode.
        'transaction_type' => 'CustomerPayBillOnline',
        'party_b'          => '',

        // Public HTTPS address of this gateway, which Safaricom calls back
        // (no trailing slash). Locally, Safaricom can't reach your computer:
        // post the callbacks from Postman instead (see README).
        'callback_base_url' => 'https://pay.pamojaci.org',
        // Secret part of the callback address. A long random string:
        //   php -r 'echo bin2hex(random_bytes(24)), "\n";'
        'callback_token' => '',

        // Accept callbacks only from Safaricom's servers. Keep true on the live
        // server; check Safaricom's current list on the Daraja portal.
        'enforce_ip_allowlist' => true,
        'allowed_ips' => [
            '196.201.214.200', '196.201.214.206', '196.201.213.114', '196.201.214.207',
            '196.201.214.208', '196.201.213.44',  '196.201.212.127', '196.201.212.138',
            '196.201.212.129', '196.201.212.136', '196.201.212.74',  '196.201.212.69',
        ],

        // Mock driver only: with no callback posted, a status check after this
        // many seconds reports this ResultCode (0 = paid, 1032 = cancelled), which
        // is how a missed callback looks.
        'mock' => [
            'auto_complete_seconds' => 60,
            'auto_result_code'      => 0,
        ],
    ],

    'payments' => [
        'min_amount' => 1,
        'max_amount' => 250000,
        // Give up waiting for a result after this long ("expired"); a later
        // confirmed success is still accepted.
        'expire_after_minutes' => 10,
        // First status check with M-Pesa if no callback arrives.
        'first_query_after_seconds' => 30,
        // Keep checking expired requests for a late result for this long.
        'late_check_hours' => 24,
        // At most this many prompts to one phone per window.
        'stk_per_phone'        => 3,
        'stk_per_phone_window' => 300,
    ],

    'webhooks' => [
        'timeout_seconds' => 15,
        'max_attempts'    => 10,
    ],

    // Request timestamps older or newer than this are refused (replay protection).
    'signature_tolerance_seconds' => 300,

    // Logs, cached Daraja token and rate-limit counters. Outside public_html.
    'storage_path' => __DIR__ . '/../storage',
];
