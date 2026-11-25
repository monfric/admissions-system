<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Pagination;
use App\Repositories\IntakeRepository;
use PDOException;
use Throwable;

/**
 * Application fees paid with M-Pesa through the central Payment Gateway.
 *
 * Each attempt is an mpesa_payments row mirroring a gateway transaction. Its
 * result arrives by gateway webhook, or by asking the gateway (while the
 * applicant's page polls, and from cron as a safety net). apply() handles
 * either and is idempotent: a payment is recorded once, whatever repeats.
 *
 * Amounts that don't match are recorded and flagged for staff: an
 * underpayment leaves the application unpaid with a balance to pay.
 */
final class MpesaPaymentService
{
    public const OPEN = ['starting', 'pending'];
    public const FINAL = ['success', 'failed', 'cancelled', 'timeout', 'expired', 'error'];
    /** Reasons a payment needs a staff check. */
    public const REVIEW_FLAGS = ['amount_mismatch', 'underpaid', 'receipt_pending', 'late', 'duplicate_receipt'];

    /** Sends the M-Pesa prompt for an unpaid application's fee (or the balance still due). */
    public function start(int $batchId, string $phoneInput, ?int $staffUserId): array
    {
        if (!PaymentGateway::enabled()) {
            throw HttpException::badRequest('M-Pesa payments are not available at the moment. Please upload proof of payment instead.');
        }
        $phone = self::normalisePhone($phoneInput);
        if ($phone === null) {
            throw HttpException::badRequest('Enter a Safaricom M-Pesa number, e.g. 0712345678');
        }
        $batch = $this->batch($batchId);
        if ($batch['payment_status'] === 'paid') {
            throw HttpException::badRequest('this application has already been paid for');
        }
        $due = $this->amountDue($batch);
        if ($due <= 0) {
            throw HttpException::badRequest('there is no fee to pay for this application');
        }

        // A prompt still waiting is shown again instead of sending a second one.
        $open = $this->latestOpen($batchId);
        if ($open !== null) {
            $open = $this->sync($open);
            if (in_array($open['status'], self::OPEN, true)) {
                return self::present($open);
            }
        }

        $key = 'nmtc-' . $batchId . '-' . bin2hex(random_bytes(10));
        $id = Database::insert('mpesa_payments', [
            'application_batch_id' => $batchId,
            'idempotency_key'      => $key,
            'phone'                => $phone,
            'amount'               => $due,
            'status'               => 'starting',
            'initiated_by'         => $staffUserId,
        ]);

        try {
            $res = PaymentGateway::startStk([
                'amount'            => (int) $due,
                'phone'             => $phone,
                'reference'         => self::reference($batchId),
                'account_reference' => $batch['application_number'],
                'description'       => 'Application fee',
                'metadata'          => ['application_batch_id' => $batchId, 'application_number' => $batch['application_number']],
            ], $key);
        } catch (Throwable $e) {
            self::logError("start for batch $batchId: " . $e->getMessage());
            Database::update('mpesa_payments', $id, ['status' => 'error', 'message' => 'The payment service could not be reached']);
            throw new HttpException(503, 'M-Pesa payments are not available right now. Please try again in a few minutes, or upload proof of payment.');
        }

        $txn = $res['body']['data'] ?? null;
        if ($res['status'] === 409 && is_array($txn)) {
            // The gateway already has a prompt waiting for this application: follow that one.
            $existing = $this->byGatewayId((string) $txn['id']);
            if ($existing !== null) {
                Database::execute('DELETE FROM mpesa_payments WHERE id = ?', [$id]);
                return self::present($this->apply($txn));
            }
            Database::update('mpesa_payments', $id, ['gateway_id' => $txn['id'], 'amount' => (float) $txn['amount'], 'phone' => $txn['phone']]);
            return self::present($this->apply($txn));
        }
        if (in_array($res['status'], [200, 201], true) && is_array($txn)) {
            Database::update('mpesa_payments', $id, ['gateway_id' => $txn['id']]);
            return self::present($this->apply($txn));
        }

        $message = (string) ($res['body']['message'] ?? 'The payment could not be started');
        Database::update('mpesa_payments', $id, [
            'gateway_id' => is_array($txn) ? $txn['id'] : null,
            'status'     => 'failed',
            'message'    => mb_substr($message, 0, 255),
        ]);
        $status = in_array($res['status'], [400, 422, 429], true) ? $res['status'] : 503;
        throw new HttpException($status === 422 ? 400 : $status, $message, (string) ($res['body']['error'] ?? ''));
    }

    /** An applicant's own M-Pesa attempt, refreshed from the gateway while it's open. */
    public function statusForApplicant(int $applicantId, int $batchId, int $mpesaId): array
    {
        $row = Database::one(
            'SELECT mp.* FROM mpesa_payments mp JOIN application_batches ab ON ab.id = mp.application_batch_id
              WHERE mp.id = ? AND mp.application_batch_id = ? AND ab.applicant_id = ? AND ab.deleted_at IS NULL',
            [$mpesaId, $batchId, $applicantId]
        );
        if ($row === null) {
            throw HttpException::notFound('payment not found');
        }
        return self::present($this->sync($row));
    }

    /** Asks the gateway for the latest state of an open attempt (no-op once final). */
    public function sync(array $row): array
    {
        if (!in_array($row['status'], self::OPEN, true) || $row['gateway_id'] === null || !PaymentGateway::enabled()) {
            return $row;
        }
        try {
            $res = PaymentGateway::get((string) $row['gateway_id']);
            if ($res['status'] === 200 && is_array($res['body']['data'] ?? null)) {
                return $this->apply($res['body']['data']);
            }
        } catch (Throwable $e) {
            self::logError("sync {$row['gateway_id']}: " . $e->getMessage());
        }
        Database::update('mpesa_payments', (int) $row['id'], ['last_synced_at' => Database::now()]);
        return $row;
    }

    /**
     * Applies a gateway transaction (from a webhook or a status check). Safe to
     * call any number of times: the fee payment is recorded once.
     */
    public function apply(array $txn): array
    {
        $gatewayId = (string) ($txn['id'] ?? '');
        if ($gatewayId === '') {
            throw HttpException::badRequest('gateway transaction without an id');
        }
        $recordedPaymentId = null;
        $row = Database::transaction(function () use ($txn, $gatewayId, &$recordedPaymentId): array {
            $row = Database::one('SELECT * FROM mpesa_payments WHERE gateway_id = ? FOR UPDATE', [$gatewayId]);
            if ($row === null) {
                $row = $this->adopt($txn);
            }
            $batch = Database::one('SELECT * FROM application_batches WHERE id = ? FOR UPDATE', [(int) $row['application_batch_id']]);

            $status = in_array($txn['status'] ?? '', ['initiated', 'pending'], true) ? 'pending' : (string) $txn['status'];
            // Webhooks can arrive out of order: once paid, an attempt stays paid.
            if ($row['status'] === 'success' && $status !== 'success') {
                return $row;
            }
            $flags = array_values(array_intersect((array) ($txn['flags'] ?? []), self::REVIEW_FLAGS));
            $fields = [
                'status'         => $status,
                'message'        => mb_substr((string) ($txn['message'] ?? ''), 0, 255),
                'mpesa_receipt'  => $txn['mpesa_receipt'] ?? null,
                'paid_amount'    => isset($txn['paid_amount']) ? (float) $txn['paid_amount'] : null,
                'paid_at'        => $txn['paid_at'] ?? null,
                'last_synced_at' => Database::now(),
            ];

            if ($status === 'success') {
                $paymentId = $row['payment_id'] !== null ? (int) $row['payment_id'] : null;
                if ($paymentId === null) {
                    $paymentId = (int) (Database::value('SELECT id FROM payments WHERE gateway_transaction_id = ?', [$gatewayId]) ?? 0) ?: null;
                }
                if ($paymentId === null) {
                    $paymentId = Database::insert('payments', [
                        'application_batch_id'   => (int) $row['application_batch_id'],
                        'amount'                 => $fields['paid_amount'] ?? (float) $row['amount'],
                        'payment_method'         => 'M-Pesa',
                        'transaction_code'       => (string) ($fields['mpesa_receipt'] ?? ''),
                        'gateway_transaction_id' => $gatewayId,
                        'paid_at'                => $fields['paid_at'] ?? Database::now(),
                    ]);
                    $recordedPaymentId = $paymentId;
                } elseif ($fields['mpesa_receipt']) {
                    // The receipt number can arrive after the payment was confirmed.
                    Database::execute("UPDATE payments SET transaction_code = ?, updated_at = ? WHERE id = ? AND transaction_code = ''", [$fields['mpesa_receipt'], Database::now(), $paymentId]);
                }
                $fields['payment_id'] = $paymentId;

                $fee = $this->fee($batch);
                $paid = (float) Database::value('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE application_batch_id = ? AND deleted_at IS NULL', [(int) $batch['id']]);
                if ($paid + 0.001 >= $fee) {
                    if ($batch['payment_status'] !== 'paid') {
                        Database::update('application_batches', (int) $batch['id'], ['payment_status' => 'paid']);
                    }
                } else {
                    $flags[] = 'underpaid';
                }
            }
            $fields['flags'] = implode(',', array_unique($flags));
            Database::update('mpesa_payments', (int) $row['id'], $fields);
            return Database::one('SELECT * FROM mpesa_payments WHERE id = ?', [(int) $row['id']]);
        });

        if ($recordedPaymentId !== null) {
            Notifications::paymentReceived($recordedPaymentId);
        }
        return $row;
    }

    /** Re-checks open attempts with the gateway (cron safety net for missed webhooks). */
    public function syncStale(int $limit = 10): int
    {
        if (!PaymentGateway::enabled()) {
            return 0;
        }
        $rows = Database::all(
            "SELECT * FROM mpesa_payments
              WHERE status IN ('starting', 'pending') AND gateway_id IS NOT NULL
                AND created_at < ? AND created_at > ? AND (last_synced_at IS NULL OR last_synced_at < ?)
              ORDER BY last_synced_at IS NULL DESC, last_synced_at LIMIT $limit",
            [date('Y-m-d H:i:s', time() - 120), date('Y-m-d H:i:s', time() - 2 * 86400), date('Y-m-d H:i:s', time() - 120)]
        );
        foreach ($rows as $row) {
            $this->sync($row);
        }
        // A start that never got an answer from the gateway.
        Database::execute(
            "UPDATE mpesa_payments SET status = 'error', message = 'The payment service did not answer', updated_at = ?
              WHERE status = 'starting' AND gateway_id IS NULL AND created_at < ?",
            [Database::now(), date('Y-m-d H:i:s', time() - 600)]
        );
        return count($rows);
    }

    // ── For the portal and staff app ─────────────────────────────────────────

    /** What the portal's application page needs about paying with M-Pesa (keyed by batch id). */
    public function portalInfo(array $batches): array
    {
        if (!$batches) {
            return [];
        }
        $ids = array_map(fn ($b) => (int) $b['id'], $batches);
        $in = Database::placeholders(count($ids));
        $paid = [];
        foreach (Database::all("SELECT application_batch_id, SUM(amount) AS total FROM payments WHERE application_batch_id IN ($in) AND deleted_at IS NULL GROUP BY application_batch_id", $ids) as $r) {
            $paid[(int) $r['application_batch_id']] = (float) $r['total'];
        }
        $latest = [];
        foreach (Database::all("SELECT * FROM mpesa_payments WHERE id IN (SELECT MAX(id) FROM mpesa_payments WHERE application_batch_id IN ($in) GROUP BY application_batch_id)", $ids) as $r) {
            $latest[(int) $r['application_batch_id']] = self::present($r);
        }
        $phones = [];
        $applicantIds = array_values(array_unique(array_map(fn ($b) => (int) $b['applicant_id'], $batches)));
        foreach (Database::all('SELECT id, phone_number FROM applicants WHERE id IN (' . Database::placeholders(count($applicantIds)) . ')', $applicantIds) as $a) {
            $phones[(int) $a['id']] = (string) $a['phone_number'];
        }

        $out = [];
        foreach ($batches as $b) {
            $id = (int) $b['id'];
            $fee = $this->fee($b);
            $out[$id] = [
                'enabled'     => PaymentGateway::enabled(),
                'amount_paid' => $paid[$id] ?? 0.0,
                'amount_due'  => max(0.0, (float) ceil($fee - ($paid[$id] ?? 0.0))),
                'phone'       => $phones[(int) $b['applicant_id']] ?? '',
                'latest'      => $latest[$id] ?? null,
            ];
        }
        return $out;
    }

    /** Staff M-Pesa Payments page. $status: a status, 'waiting' or 'unsuccessful'; $review: '' | 'needs_review' | 'reviewed'. */
    public function list(Pagination $page, string $status, string $review): array
    {
        $where = '1 = 1';
        $params = [];
        if ($status === 'unsuccessful') {
            $where .= " AND mp.status IN ('failed', 'cancelled', 'timeout', 'expired', 'error')";
        } elseif ($status === 'waiting') {
            $where .= " AND mp.status IN ('starting', 'pending')";
        } elseif ($status !== '') {
            $where .= ' AND mp.status = ?';
            $params[] = $status;
        }
        if ($review === 'needs_review') {
            $where .= " AND mp.flags <> '' AND mp.reviewed_at IS NULL";
        } elseif ($review === 'reviewed') {
            $where .= ' AND mp.reviewed_at IS NOT NULL';
        }
        if ($page->search !== '') {
            $where .= " AND (LOWER(CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name)) LIKE ? OR ab.application_number LIKE ? OR mp.mpesa_receipt LIKE ? OR mp.phone LIKE ?)";
            $like = '%' . strtolower($page->search) . '%';
            array_push($params, $like, $like, strtoupper($like), '%' . preg_replace('/^0/', '254', $page->search) . '%');
        }
        $from = "FROM mpesa_payments mp
                 JOIN application_batches ab ON ab.id = mp.application_batch_id
                 JOIN applicants a ON a.id = ab.applicant_id
                 LEFT JOIN users ru ON ru.id = mp.reviewed_by
                WHERE $where";
        $total = (int) Database::value("SELECT COUNT(*) $from", $params);
        $rows = Database::all(
            "SELECT mp.*, ab.application_number, ab.payment_status AS batch_payment_status,
                    CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name) AS applicant_name, CONCAT_WS(' ', ru.first_name, ru.last_name) AS reviewed_by_name
             $from ORDER BY mp.id DESC " . $page->limitSql(),
            $params
        );
        return $page->result(array_map(fn ($r) => self::present($r, true), $rows), $total);
    }

    public function stats(): array
    {
        $row = Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(status = 'success'), 0) AS successful,
                    COALESCE(SUM(status IN ('starting', 'pending')), 0) AS waiting,
                    COALESCE(SUM(status IN ('failed', 'cancelled', 'timeout', 'expired', 'error')), 0) AS unsuccessful,
                    COALESCE(SUM(flags <> '' AND reviewed_at IS NULL), 0) AS needs_review,
                    COALESCE(SUM(CASE WHEN status = 'success' AND paid_at >= ? THEN paid_amount ELSE 0 END), 0) AS amount_today
               FROM mpesa_payments",
            [date('Y-m-d 00:00:00')]
        );
        $stats = array_map('intval', $row);
        $stats['amount_today'] = (float) $row['amount_today'];
        $stats['enabled'] = PaymentGateway::enabled();
        return $stats;
    }

    /** Staff confirm they've checked a flagged payment. */
    public function markReviewed(int $id, int $staffUserId): array
    {
        $row = Database::one('SELECT * FROM mpesa_payments WHERE id = ?', [$id]);
        if ($row === null) {
            throw HttpException::notFound('M-Pesa payment not found');
        }
        if ($row['flags'] === '') {
            throw HttpException::badRequest('this payment has nothing to check');
        }
        Database::update('mpesa_payments', $id, ['reviewed_by' => $staffUserId, 'reviewed_at' => Database::now()]);
        return self::present(Database::one(
            "SELECT mp.*, ab.application_number, ab.payment_status AS batch_payment_status,
                    CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name) AS applicant_name,
                    CONCAT_WS(' ', ru.first_name, ru.last_name) AS reviewed_by_name
               FROM mpesa_payments mp
               JOIN application_batches ab ON ab.id = mp.application_batch_id
               JOIN applicants a ON a.id = ab.applicant_id
               LEFT JOIN users ru ON ru.id = mp.reviewed_by
              WHERE mp.id = ?",
            [$id]
        ), true);
    }

    /** What the portal (and, with $forStaff, the staff app) sees of an attempt. */
    public static function present(array $r, bool $forStaff = false): array
    {
        $flags = array_values(array_filter(explode(',', (string) $r['flags'])));
        $out = [
            'id'            => (int) $r['id'],
            'status'        => $r['status'],
            'is_final'      => in_array($r['status'], self::FINAL, true),
            'message'       => self::message($r),
            'phone'         => self::localPhone((string) $r['phone']),
            'amount'        => Format::float($r['amount']),
            'paid_amount'   => $r['paid_amount'] === null ? null : Format::float($r['paid_amount']),
            'mpesa_receipt' => $r['mpesa_receipt'],
            'paid_at'       => $r['paid_at'] ? Format::dateTime($r['paid_at']) : null,
            'payment_id'    => $r['payment_id'] === null ? null : (int) $r['payment_id'],
            'created_at'    => Format::dateTime($r['created_at']),
        ];
        if ($forStaff) {
            $out += [
                'application_batch_id' => (int) $r['application_batch_id'],
                'application_number'   => $r['application_number'] ?? null,
                'applicant_name'       => isset($r['applicant_name']) ? trim(preg_replace('/\s+/', ' ', $r['applicant_name'])) : null,
                'batch_payment_status' => $r['batch_payment_status'] ?? null,
                'gateway_id'           => $r['gateway_id'],
                'flags'                => $flags,
                'needs_review'         => $flags !== [] && $r['reviewed_at'] === null,
                'initiated_by_staff'   => $r['initiated_by'] !== null,
                'reviewed_at'          => $r['reviewed_at'] ? Format::dateTime($r['reviewed_at']) : null,
                'reviewed_by_name'     => $r['reviewed_by_name'] ?? null,
            ];
        }
        return $out;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** The gateway reference for an application (one waiting prompt per reference). */
    public static function reference(int $batchId): string
    {
        return 'batch-' . $batchId;
    }

    /** 2547XXXXXXXX from 07…, 01…, +254…, 254…; null if it isn't a Kenyan mobile number. */
    public static function normalisePhone(string $phone): ?string
    {
        $digits = preg_replace('/[\s\-()]/', '', $phone) ?? '';
        return preg_match('/^(?:\+?254|0)?([17]\d{8})$/', $digits, $m) ? '254' . $m[1] : null;
    }

    /** 254712345678 → 0712345678 */
    public static function localPhone(string $phone): string
    {
        return str_starts_with($phone, '254') && strlen($phone) === 12 ? '0' . substr($phone, 3) : $phone;
    }

    private static function message(array $r): string
    {
        return match ((string) $r['status']) {
            'starting' => 'Sending the payment request…',
            'pending'  => 'Check your phone and enter your M-Pesa PIN to complete the payment.',
            'error'    => (string) $r['message'] ?: 'The payment could not be started.',
            default    => (string) $r['message'],
        };
    }

    /** A gateway transaction this system has no row for (e.g. its own insert was lost): rebuild the row. */
    private function adopt(array $txn): array
    {
        $batchId = (int) ($txn['metadata']['application_batch_id'] ?? 0);
        if ($batchId <= 0 || ($txn['reference'] ?? '') !== self::reference($batchId)) {
            throw HttpException::badRequest('gateway transaction does not belong to an application here');
        }
        $this->batch($batchId);
        try {
            Database::insert('mpesa_payments', [
                'application_batch_id' => $batchId,
                'gateway_id'           => (string) $txn['id'],
                'idempotency_key'      => 'adopted-' . $txn['id'],
                'phone'                => (string) ($txn['phone'] ?? ''),
                'amount'               => (float) ($txn['amount'] ?? 0),
                'status'               => 'pending',
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') {
                throw $e;
            }
        }
        return Database::one('SELECT * FROM mpesa_payments WHERE gateway_id = ? FOR UPDATE', [(string) $txn['id']]);
    }

    private function batch(int $batchId): array
    {
        $batch = Database::one('SELECT * FROM application_batches WHERE id = ? AND deleted_at IS NULL', [$batchId]);
        if ($batch === null) {
            throw HttpException::notFound('application not found');
        }
        return $batch;
    }

    private function fee(array $batch): float
    {
        $tier = (new IntakeRepository())->trainingLevelFor((int) $batch['intake_id'], (int) $batch['training_level_id']);
        return $tier === null ? 0.0 : (float) $tier['application_fee'];
    }

    /** The fee minus what's already been paid, in whole shillings. */
    private function amountDue(array $batch): float
    {
        $paid = (float) Database::value('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE application_batch_id = ? AND deleted_at IS NULL', [(int) $batch['id']]);
        return max(0.0, (float) ceil($this->fee($batch) - $paid));
    }

    private function latestOpen(int $batchId): ?array
    {
        return Database::one(
            "SELECT * FROM mpesa_payments WHERE application_batch_id = ?
               AND ((status = 'pending' AND created_at > ?) OR (status = 'starting' AND created_at > ?))
             ORDER BY id DESC LIMIT 1",
            [$batchId, date('Y-m-d H:i:s', time() - 30 * 60), date('Y-m-d H:i:s', time() - 60)]
        );
    }

    private function byGatewayId(string $gatewayId): ?array
    {
        return Database::one('SELECT * FROM mpesa_payments WHERE gateway_id = ?', [$gatewayId]);
    }

    private static function logError(string $message): void
    {
        @error_log(sprintf("[%s] mpesa: %s\n", date('Y-m-d H:i:s'), $message), 3, \App\Core\Config::storagePath('logs') . '/error.log');
    }
}
