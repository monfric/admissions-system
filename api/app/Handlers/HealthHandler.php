<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Config;
use App\Core\Database;
use App\Core\Response;

/**
 * GET /health — checks the server is ready: PHP version and extensions,
 * database connection, writable storage, fonts and letterhead images.
 * Lists what's wrong (no secrets) so a new deployment can be checked from a browser.
 */
final class HealthHandler
{
    public function health(): never
    {
        $problems = [];

        if (version_compare(PHP_VERSION, '8.1.0', '<')) {
            $problems[] = 'PHP 8.1 or newer is required (this server has ' . PHP_VERSION . ')';
        }
        foreach (['pdo_mysql', 'json', 'zlib', 'iconv'] as $ext) {
            if (!extension_loaded($ext)) {
                $problems[] = "PHP extension '$ext' is not enabled";
            }
        }

        try {
            Database::value('SELECT 1');
            if (Database::value("SHOW TABLES LIKE 'users'") === null) {
                $problems[] = 'database tables are missing: import database/schema.sql';
            }
        } catch (\Throwable) {
            $problems[] = 'cannot connect to the database: check the db settings in app/config.php';
        }

        foreach (['uploads', 'ratelimit', 'fonts/unifont', 'logs'] as $dir) {
            $path = Config::storagePath($dir);
            if (!is_dir($path)) {
                @mkdir($path, 0755, true);
            }
            if (!is_dir($path) || !is_writable($path)) {
                $problems[] = "storage/$dir is not writable";
            }
        }

        $root = dirname(__DIR__, 2);
        if (!is_file($root . '/assets/fonts/NotoSerif-Regular.ttf')) {
            $problems[] = 'letter fonts are missing from assets/fonts';
        }
        foreach (['header_image' => 'header.jpg', 'footer_image' => 'footer.png'] as $key => $file) {
            if (!is_file((string) Config::get("letters.$key", "$root/assets/letterhead/$file"))) {
                $problems[] = "letterhead image $file is missing";
            }
        }
        if (in_array(Config::get('jwt_secret'), ['', 'replace-with-a-long-random-string'], true)) {
            $problems[] = 'jwt_secret in app/config.php is not set';
        }

        if ($problems) {
            Response::json(503, ['status' => 'unhealthy', 'message' => 'NMTC Admissions API has setup problems', 'problems' => $problems]);
        }
        Response::json(200, ['status' => 'healthy', 'message' => 'NMTC Admissions API is running']);
    }
}
