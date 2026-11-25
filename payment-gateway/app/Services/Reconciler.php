<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;

/**
 * The every-minute safety net (cron/reconcile.php): settles payments whose
 * callback is late or never came, retries callbacks that failed to process,
 * and sends due webhooks.
 */
final class Reconciler
{
    /** @return array<string,int> counts for the log */
    public static function run(): array
    {
        $counts = ['stuck' => 0, 'checked' => 0, 'settled' => 0, 'callbacks' => 0, 'webhooks_sent' => 0, 'webhooks_failed' => 0];

        // A prompt that never got past "initiated" (the gateway stopped mid-request).
        foreach (Database::all("SELECT id FROM transactions WHERE status = 'initiated' AND created_at < ?", [date('Y-m-d H:i:s', time() - 120)]) as $row) {
            Database::transaction(function () use ($row): void {
                $txn = Transactions::find((int) $row['id'], true);
                if ($txn['status'] === 'initiated') {
                    Transactions::transition($txn, 'failed', ['result_desc' => 'The payment prompt was not sent'], 'cron', 'stuck in initiated');
                }
            });
            $counts['stuck']++;
        }

        // Status checks that are due (missed or late callbacks).
        $due = Database::all(
            "SELECT id FROM transactions WHERE status IN ('pending', 'expired') AND next_query_at IS NOT NULL AND next_query_at <= ? ORDER BY next_query_at LIMIT 50",
            [Database::now()]
        );
        foreach ($due as $row) {
            $outcome = Verifier::check((int) $row['id'], 'cron');
            $counts['checked']++;
            if (!str_starts_with($outcome, 'still') && !str_starts_with($outcome, 'status check failed')) {
                $counts['settled']++;
            }
        }

        // Callbacks whose processing failed (e.g. the database was briefly down).
        $retry = Database::all(
            "SELECT id FROM mpesa_callbacks WHERE status IN ('received', 'error') AND attempts < 5 AND created_at < ? ORDER BY id LIMIT 50",
            [date('Y-m-d H:i:s', time() - 60)]
        );
        foreach ($retry as $row) {
            Callbacks::process((int) $row['id']);
            $counts['callbacks']++;
        }

        [$counts['webhooks_sent'], $counts['webhooks_failed']] = Webhooks::deliverDue();
        return $counts;
    }
}
