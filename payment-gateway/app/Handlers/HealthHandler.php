<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Config;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use Throwable;

final class HealthHandler
{
    /** GET /health: is the gateway up and can it reach its database? */
    public function check(Request $request): never
    {
        try {
            Database::value('SELECT 1');
            $db = 'ok';
        } catch (Throwable) {
            $db = 'unreachable';
        }
        $lastRun = @filemtime(Config::storagePath('logs/reconcile.heartbeat')) ?: null;
        Response::json($db === 'ok' ? 200 : 503, [
            'success' => $db === 'ok',
            'message' => $db === 'ok' ? 'healthy' : 'database unreachable',
            'data'    => [
                'environment'   => Config::get('environment'),
                'mpesa'         => Config::get('mpesa.driver'),
                'database'      => $db,
                // The cron safety net should run every minute.
                'cron_last_run' => $lastRun ? date('Y-m-d H:i:s', $lastRun) : null,
                'time'          => date('Y-m-d H:i:s'),
            ],
        ]);
    }
}
