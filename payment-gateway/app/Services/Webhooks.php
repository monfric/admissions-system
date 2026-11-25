<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Crypto;
use App\Core\Database;
use App\Core\Http;
use App\Core\Text;
use PDOException;
use Throwable;

/**
 * Payment results sent to client systems, signed with the client's secret:
 *   X-Gateway-Event, X-Gateway-Delivery (unique id: ignore repeats),
 *   X-Gateway-Timestamp, X-Gateway-Signature = HMAC-SHA256("<timestamp>.<body>").
 * Retried with backoff until the client answers 2xx.
 */
final class Webhooks
{
    /** Seconds to wait before retry n. */
    private const BACKOFF = [60, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200];

    /** Queues an event for the transaction's client (once per transaction and event). */
    public static function queue(array $txn, string $event): void
    {
        $publicId = Crypto::id('evt');
        $payload = json_encode([
            'event'      => $event,
            'id'         => $publicId,
            'created_at' => Database::now(),
            'data'       => Transactions::present($txn),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        try {
            Database::insert('webhook_deliveries', [
                'public_id'       => $publicId,
                'client_id'       => $txn['client_id'],
                'transaction_id'  => $txn['id'],
                'event'           => $event,
                'payload'         => $payload,
                'next_attempt_at' => Database::now(),
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') {
                throw $e; // 23000: already queued for this transaction and event
            }
        }
    }

    /** Sends the deliveries that are due. Returns [delivered, failed attempts]. */
    public static function deliverDue(int $limit = 25): array
    {
        $due = Database::all(
            "SELECT * FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id LIMIT $limit",
            [Database::now()]
        );
        $delivered = $failed = 0;
        foreach ($due as $delivery) {
            self::deliver($delivery) ? $delivered++ : $failed++;
        }
        return [$delivered, $failed];
    }

    private static function deliver(array $d): bool
    {
        $client = Clients::find((int) $d['client_id']);
        if ($client === null || (string) $client['webhook_url'] === '') {
            Database::update('webhook_deliveries', (int) $d['id'], ['status' => 'skipped', 'last_error' => 'client has no webhook_url', 'next_attempt_at' => null]);
            return true;
        }

        $timestamp = (string) time();
        $status = null;
        $error = '';
        try {
            $response = Http::request('POST', (string) $client['webhook_url'], [
                'Content-Type'        => 'application/json',
                'User-Agent'          => 'PaymentGateway/1.0',
                'X-Gateway-Event'     => (string) $d['event'],
                'X-Gateway-Delivery'  => (string) $d['public_id'],
                'X-Gateway-Timestamp' => $timestamp,
                'X-Gateway-Signature' => Crypto::sign(Crypto::webhookCanonical($timestamp, (string) $d['payload']), Clients::secret($client)),
            ], (string) $d['payload'], (int) Config::get('webhooks.timeout_seconds', 15));
            $status = $response['status'];
            if ($status >= 200 && $status < 300) {
                Database::update('webhook_deliveries', (int) $d['id'], [
                    'status' => 'delivered', 'attempts' => (int) $d['attempts'] + 1, 'last_status_code' => $status,
                    'last_error' => '', 'delivered_at' => Database::now(), 'next_attempt_at' => null,
                ]);
                return true;
            }
            $error = 'HTTP ' . $status . ': ' . Text::cut(trim(strip_tags($response['body'])), 200);
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }

        $attempts = (int) $d['attempts'] + 1;
        $giveUp = $attempts >= (int) Config::get('webhooks.max_attempts', 10);
        Database::update('webhook_deliveries', (int) $d['id'], [
            'status'           => $giveUp ? 'failed' : 'pending',
            'attempts'         => $attempts,
            'last_status_code' => $status,
            'last_error'       => Text::cut($error, 255),
            'next_attempt_at'  => $giveUp ? null : date('Y-m-d H:i:s', time() + self::BACKOFF[min($attempts - 1, count(self::BACKOFF) - 1)]),
        ]);
        return false;
    }
}
