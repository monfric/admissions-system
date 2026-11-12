<?php
declare(strict_types=1);

// Sends queued emails (and retries failed ones), after queuing any offer
// deadline reminders that are due (7 days left, last day).
//
// cPanel → Cron Jobs → "Once Per Minute", command:
//   /usr/local/bin/php /home/USERNAME/nmtc-api/cron/emails.php
// (use the PHP path and folder of your hosting account)
// Locally: php cron/emails.php

use App\Core\Config;
use App\Services\EmailQueue;
use App\Services\Notifications;

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

// One run at a time: a slow mail server mustn't let the next minute's run send the same emails.
$lock = fopen($logDir . '/emails.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}

try {
    $reminders = Notifications::queueDeadlineReminders();
    [$sent, $failed] = (new EmailQueue())->sendDue();
    // Quiet minutes aren't logged, so cron.log stays readable.
    if ($sent || $failed) {
        $log("emails: $sent sent, $failed failed ($reminders reminder(s) checked)");
    }
    echo "Sent $sent, failed $failed.\n";
} catch (Throwable $e) {
    $log('emails FAILED: ' . $e->getMessage());
    fwrite(STDERR, 'Emails failed: ' . $e->getMessage() . "\n");
    exit(1);
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}
