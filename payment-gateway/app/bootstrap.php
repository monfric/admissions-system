<?php
declare(strict_types=1);

// Loads settings, the class autoloader and the database. Used by the web entry
// point (public/index.php), the cron script and the bin/ tools.

use App\Core\Config;
use App\Core\Database;

spl_autoload_register(function (string $class): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

$fail = function (string $message): never {
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
};

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    $fail('Gateway is not configured: copy app/config.example.php to app/config.php');
}
Config::load(require $configFile);

// Settings that would make the live gateway unsafe stop it from starting.
if (Config::get('environment') === 'production') {
    if (Config::get('mpesa.driver') === 'mock') {
        $fail('Gateway misconfigured: the mock M-Pesa driver is not allowed in production');
    }
    if (Config::get('debug')) {
        $fail('Gateway misconfigured: debug must be false in production');
    }
}
$appKey = base64_decode((string) Config::get('app_key'), true);
if ($appKey === false || strlen($appKey) !== 32) {
    $fail('Gateway misconfigured: app_key must be 32 random bytes, base64-encoded');
}
if (strlen((string) Config::get('mpesa.callback_token')) < 32) {
    $fail('Gateway misconfigured: mpesa.callback_token must be at least 32 characters');
}

date_default_timezone_set(Config::get('timezone', 'Africa/Nairobi'));
Database::configure(Config::get('db'));
