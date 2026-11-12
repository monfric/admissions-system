<?php
declare(strict_types=1);

// Loads settings, the class autoloader and error handling. Used by the web
// entry point (public/index.php) and the cron scripts.

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

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'API is not configured: copy app/config.example.php to app/config.php']);
    exit;
}
Config::load(require $configFile);

date_default_timezone_set(Config::get('timezone', 'Africa/Nairobi'));
Database::configure(Config::get('db'));
