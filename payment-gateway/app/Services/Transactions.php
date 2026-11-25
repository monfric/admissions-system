<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Database;
use App\Core\Text;
use App\Mpesa\Mpesa;

/** Transaction rows: the status rules, the audit trail and the shape clients see. */
final class Transactions
{
    public const FINAL = ['success', 'failed', 'cancelled', 'timeout', 'expired'];

    /** Seconds before the next status check, by how many checks were already made. */
    private const QUERY_BACKOFF = [30, 30, 60, 60, 120, 300, 600, 1800, 3600];

    public static function find(int $id, bool $lock = false): ?array
    {
        return Database::one('SELECT * FROM transactions WHERE id = ?' . ($lock ? ' FOR UPDATE' : ''), [$id]);
    }

    public static function findForClient(int $clientId, string $publicId): ?array
    {
        return Database::one('SELECT * FROM transactions WHERE client_id = ? AND public_id = ?', [$clientId, $publicId]);
    }

    public static function findByCheckout(string $checkoutRequestId): ?array
    {
        return Database::one('SELECT * FROM transactions WHERE checkout_request_id = ?', [$checkoutRequestId]);
    }

    /**
     * Moves a transaction to a new status (call inside a transaction with the
     * row locked), records the change, and queues the client's webhook.
     */
    public static function transition(array $txn, string $to, array $fields, string $source, string $note = '', ?string $event = null): array
    {
        $fields['status'] = $to;
        if (in_array($to, self::FINAL, true) && $to !== 'expired' && $txn['completed_at'] === null) {
            $fields['completed_at'] ??= Database::now();
        }
        Database::update('transactions', (int) $txn['id'], $fields);
        self::event((int) $txn['id'], (string) $txn['status'], $to, $source, $note);
        $updated = self::find((int) $txn['id']);
        if ($event !== null) {
            Webhooks::queue($updated, $event);
        }
        return $updated;
    }

    public static function event(int $txnId, string $from, string $to, string $source, string $note = ''): void
    {
        Database::insert('transaction_events', [
            'transaction_id' => $txnId,
            'from_status'    => $from,
            'to_status'      => $to,
            'source'         => $source,
            'note'           => Text::cut($note, 255),
        ], false);
    }

    /** When to check with M-Pesa next, or null once there's no point any more. */
    public static function nextQueryAt(array $txn, int $attemptsMade): ?string
    {
        $lateUntil = strtotime((string) $txn['created_at']) + (int) Config::get('payments.late_check_hours', 24) * 3600;
        $next = time() + self::QUERY_BACKOFF[min($attemptsMade, count(self::QUERY_BACKOFF) - 1)];
        return $next > $lateUntil ? null : date('Y-m-d H:i:s', $next);
    }

    public static function flags(array $txn): array
    {
        return array_values(array_filter(explode(',', (string) $txn['flags'])));
    }

    public static function withFlag(string $flags, string $flag): string
    {
        $list = array_filter(explode(',', $flags));
        $list[] = $flag;
        return implode(',', array_unique($list));
    }

    /** What a client system sees. */
    public static function present(array $t): array
    {
        $status = (string) $t['status'];
        return [
            'id'                  => $t['public_id'],
            'reference'           => $t['client_reference'],
            'amount'              => (float) $t['amount'],
            'currency'            => $t['currency'],
            'phone'               => $t['phone'],
            'account_reference'   => $t['account_reference'],
            'description'         => $t['description'],
            'status'              => $status,
            'is_final'            => in_array($status, self::FINAL, true),
            'message'             => self::message($t),
            'result_code'         => $t['result_code'] === null ? null : (int) $t['result_code'],
            'result_desc'         => $t['result_desc'],
            'checkout_request_id' => $t['checkout_request_id'],
            'mpesa_receipt'       => $t['mpesa_receipt'],
            'paid_amount'         => $t['paid_amount'] === null ? null : (float) $t['paid_amount'],
            'paid_phone'          => $t['paid_phone'],
            'paid_at'             => $t['paid_at'],
            'verified_by'         => $t['verified_by'],
            'flags'               => self::flags($t),
            'metadata'            => $t['metadata'] === null ? null : json_decode((string) $t['metadata'], true),
            'created_at'          => $t['created_at'],
            'expires_at'          => $t['expires_at'],
            'completed_at'        => $t['completed_at'],
        ];
    }

    /** A plain-language status line for the payer. */
    private static function message(array $t): string
    {
        return match ((string) $t['status']) {
            'initiated' => 'Sending the M-Pesa prompt…',
            'pending'   => 'Check your phone and enter your M-Pesa PIN to complete the payment.',
            'expired'   => 'No answer was received from M-Pesa. If money left your account it will still be matched to this payment; otherwise please try again.',
            default     => $t['result_code'] === null
                ? ((string) $t['result_desc'] ?: 'The payment did not go through.')
                : Mpesa::friendlyResult((int) $t['result_code'], (string) $t['result_desc']),
        };
    }
}
