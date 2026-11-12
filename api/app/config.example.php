<?php
// NMTC Admissions API settings.
// Copy this file to config.php (same folder) and fill in the real values.
// config.php holds passwords and keys: never commit or share it.

return [
    'app_name' => 'NMTC Admissions',
    'timezone' => 'Africa/Nairobi',
    // true shows error details in API responses; keep false on the live server.
    'debug'    => false,

    // MySQL database (cPanel → MySQL Databases).
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'nmtc_admissions',
        'user' => 'nmtc_user',
        'pass' => 'change-me',
    ],

    // Token signing keys: long random strings (e.g. 64 characters). Staff and
    // applicant tokens use different keys, so neither works in the other app.
    // Changing a key logs everyone of that kind out.
    'jwt_secret'           => 'replace-with-a-long-random-string',
    // Leave empty to derive it from jwt_secret.
    'applicant_jwt_secret' => '',
    'jwt_expiration_hours' => 24,

    // Websites allowed to call the API from the browser (no trailing slash).
    'cors_allowed_origins' => [
        'https://apply.pamojaci.org',
        'https://staff.pamojaci.org',
        'http://localhost:4300',   // portal (npm start)
        'http://localhost:4400',   // staff app (npm start)
        'http://localhost:4200',
    ],

    // Letters (PDF): sign-off and reference prefix ("NMTC/PROV/SEPT/2026").
    // To change the letterhead, replace assets/letterhead/header.jpg and
    // footer.png (same names), or point these at other image files.
    'letters' => [
        'signatory_name'   => 'SR. PHYLLIS',
        'signatory_title'  => 'The College Principal',
        'reference_prefix' => 'NMTC',
        'header_image'     => __DIR__ . '/../assets/letterhead/header.jpg',
        'footer_image'     => __DIR__ . '/../assets/letterhead/footer.png',
    ],

    // Email (applicant updates, password resets). cron/emails.php sends the
    // queued emails every minute. Gmail: turn on 2-Step Verification for the
    // account, then Google Account → Security → App passwords → create one and
    // paste its 16 characters as 'password' (never the normal Gmail password).
    // driver 'log' writes emails to storage/logs/mail.log instead of sending.
    'mail' => [
        'driver'     => 'smtp',            // smtp | log
        'host'       => 'smtp.gmail.com',
        'port'       => 587,
        'encryption' => 'tls',             // tls (port 587) | ssl (port 465)
        'username'   => 'monfricsolutions@gmail.com',
        'password'   => '',
        'from_email' => 'monfricsolutions@gmail.com',
        'from_name'  => 'NMTC Admissions',
        'reply_to'   => '',                // optional, e.g. admissions@nmtc.ac.ke
    ],

    // Website addresses used in email links (no trailing slash).
    'portal_url' => 'https://apply.pamojaci.org',
    'staff_url'  => 'https://staff.pamojaci.org',

    // Uploaded files, rate-limit counters and logs. Must be outside public_html.
    'storage_path' => __DIR__ . '/../storage',
];
