<?php
declare(strict_types=1);

// Recalls notified applications whose 30-day response window has passed
// (the whole of the last day counts), exactly like the LMIS hourly job.
//
// cPanel → Cron Jobs → "Once Per Hour", command:
//   /usr/local/bin/php /home/USERNAME/nmtc-api/cron/recall.php
// (use the PHP path and folder of your hosting account)

use App\Core\Config;
use App\Services\StaffApplicationService;

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

try {
    $count = (new StaffApplicationService())->recallExpired();
    $log("recall: $count application(s) recalled");
    echo "Recalled $count application(s).\n";
} catch (Throwable $e) {
    $log('recall FAILED: ' . $e->getMessage());
    fwrite(STDERR, 'Recall failed: ' . $e->getMessage() . "\n");
    exit(1);
}
