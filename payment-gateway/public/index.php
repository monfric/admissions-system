<?php
declare(strict_types=1);

// Web entry point: every request comes through here (see .htaccess).
// Only this folder is public; app/ and storage/ sit beside it, out of reach.
// No CORS: the gateway is called by servers (client systems and Safaricom), never by browsers.

use App\Core\Config;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;

require __DIR__ . '/../app/bootstrap.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

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
set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity) || in_array($severity, [E_DEPRECATED, E_USER_DEPRECATED], true)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$router = new Router();
(require __DIR__ . '/../app/Routes/api.php')($router);
$router->dispatch(Request::capture());
