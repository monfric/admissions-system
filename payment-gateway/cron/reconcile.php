<?php
declare(strict_types=1);

// The gateway's safety net. Run EVERY MINUTE:
// - checks pending payments with M-Pesa when the callback is late or missing,
// - retries callbacks that failed to process,
// - sends (and retries) webhooks to client systems.
//
// DirectAdmin → Cron Jobs, every minute (* * * * *), command:
//   /usr/local/bin/php /home/USERNAME/payment-gateway/cron/reconcile.php
// Locally: php cron/reconcile.php

use App\Core\Config;
use App\Services\Reconciler;

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line (cron) only.\n");
}

require __DIR__ . '/../app/bootstrap.php';

$logDir = Config::storagePath('logs');
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
$log = fn (string $line) => file_put_contents($logDir . '/cron.log', '[' . date('Y-m-d H:i:s') . "] $line\n", FILE_APPEND);

// One run at a time: a slow M-Pesa reply mustn't let the next minute's run overlap.
$lock = fopen($logDir . '/reconcile.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}

try {
    $counts = Reconciler::run();
    touch($logDir . '/reconcile.heartbeat'); // shown by /health as cron_last_run
    $summary = implode(', ', array_map(fn ($k, $v) => "$k $v", array_keys($counts), $counts));
    // Quiet minutes aren't logged, so cron.log stays readable.
    if (array_sum($counts) > 0) {
        $log("reconcile: $summary");
    }
    echo "Reconcile: $summary\n";
} catch (Throwable $e) {
    $log('reconcile FAILED: ' . $e->getMessage());
    fwrite(STDERR, 'Reconcile failed: ' . $e->getMessage() . "\n");
    exit(1);
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}
