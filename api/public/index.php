<?php
declare(strict_types=1);

// Web entry point: every API request comes through here (see .htaccess).
// Only this folder is public; app/ and storage/ sit beside it, out of reach.

use App\Core\Config;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;

require __DIR__ . '/../app/bootstrap.php';

// ── CORS: only the configured frontends may call the API from a browser ─────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_map(fn ($o) => rtrim((string) $o, '/'), (array) Config::get('cors_allowed_origins', []));
if ($origin !== '' && in_array(rtrim($origin, '/'), $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    // Content-Disposition carries download file names.
    header('Access-Control-Expose-Headers: Content-Length, Content-Disposition');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Origin, Content-Type, Accept, Authorization, X-HTTP-Method-Override');
    header('Access-Control-Max-Age: 43200');
    http_response_code(204);
    exit;
}

// ── Errors become JSON responses ─────────────────────────────────────────────
set_exception_handler(function (Throwable $e): void {
    if ($e instanceof HttpException) {
        Response::error($e->status, $e->getMessage(), $e->detail);
    }
    $logDir = Config::storagePath('logs');
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    @error_log(sprintf("[%s] %s in %s:%d\n%s\n", date('Y-m-d H:i:s'), $e->getMessage(), $e->getFile(), $e->getLine(), $e->getTraceAsString()), 3, $logDir . '/error.log');
    Response::error(500, 'Internal server error', Config::get('debug') ? $e->getMessage() : '');
});
// PHP warnings become errors too, except ones silenced with @ and deprecations.
set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity) || in_array($severity, [E_DEPRECATED, E_USER_DEPRECATED], true)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$router = new Router();
(require __DIR__ . '/../app/Routes/api.php')($router);
$router->dispatch(Request::capture());
