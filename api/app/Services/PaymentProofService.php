<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Response;
use App\Core\Storage;

/**
 * Proof of the application-fee payment: a photo or screenshot plus the
 * transaction code, uploaded by the applicant (or by staff for them) while the
 * application is unpaid. Staff then confirm the payment against it
 * (StaffApplicationService::recordPayment) or reject it with a reason, and the
 * applicant uploads again. Only the latest proof of an application counts.
 */
final class PaymentProofService
{
    private const EXTENSIONS = ['.jpg', '.jpeg', '.png'];
    private const MIME_TYPES = ['image/jpeg', 'image/png'];
    private const MAX_BYTES = 2 * 1024 * 1024;

    /** Stores a new proof, replacing a submitted one that hasn't been reviewed yet. */
    public function upload(int $batchId, ?array $file, string $transactionCode, ?int $staffUserId): array
    {
        $batch = Database::one('SELECT id, payment_status FROM application_batches WHERE id = ? AND deleted_at IS NULL', [$batchId]);
        if ($batch === null) {
            throw HttpException::notFound('application not found');
        }
        if ($batch['payment_status'] === 'paid') {
            throw HttpException::badRequest('this application has already been paid for');
        }
        $code = self::normaliseCode($transactionCode);
        if ($file === null) {
            throw HttpException::badRequest('choose a photo or screenshot of your payment');
        }
        $ext = Storage::validate($file, self::EXTENSIONS, self::MAX_BYTES, '2MB');
        $mimeType = Storage::mimeType($file);
        if (!in_array($mimeType, self::MIME_TYPES, true)) {
            throw HttpException::badRequest('the file must be a JPG or PNG image');
        }

        $fileName = sprintf('proof_%d_%s%s', $batchId, date('YmdHis'), $ext);
        $path = Storage::save($file, 'uploads/payment_proofs', $fileName);
        try {
            Database::transaction(function () use ($batchId, $code, $fileName, $path, $file, $mimeType, $staffUserId) {
                Database::execute(
                    "UPDATE payment_proofs SET status = 'replaced', updated_at = ? WHERE application_batch_id = ? AND status = 'submitted' AND deleted_at IS NULL",
                    [Database::now(), $batchId]
                );
                Database::insert('payment_proofs', [
                    'application_batch_id' => $batchId,
                    'transaction_code'     => $code,
                    'file_name'            => $fileName,
                    'file_path'            => $path,
                    'file_size'            => (int) $file['size'],
                    'mime_type'            => $mimeType,
                    'status'               => 'submitted',
                    'uploaded_by'          => $staffUserId,
                ]);
            });
        } catch (\Throwable $e) {
            Storage::delete($path);
            throw $e;
        }
        return $this->latestFor([$batchId], true)[$batchId];
    }

    /** Streams the latest proof's image. */
    public function send(int $batchId): never
    {
        $proof = $this->latestRow($batchId);
        if ($proof === null) {
            throw HttpException::notFound('no payment proof has been uploaded');
        }
        Response::file(Storage::absolute($proof['file_path']), $proof['mime_type'], $proof['file_name']);
    }

    /** Staff: turns down the submitted proof so the applicant can upload a better one. */
    public function reject(int $batchId, string $reason, int $staffUserId): array
    {
        $proof = $this->latestRow($batchId);
        if ($proof === null || $proof['status'] !== 'submitted') {
            throw HttpException::badRequest('there is no submitted payment proof to reject');
        }
        Database::update('payment_proofs', (int) $proof['id'], [
            'status'           => 'rejected',
            'rejection_reason' => trim($reason),
            'reviewed_by'      => $staffUserId,
            'reviewed_at'      => Database::now(),
        ]);
        return $this->latestFor([$batchId], true)[$batchId];
    }

    /**
     * The submitted proof a payment is being recorded against; 400 if there
     * isn't one. Called inside recordPayment's transaction (row locked).
     */
    public function requireSubmitted(int $batchId): array
    {
        $proof = Database::one(
            "SELECT * FROM payment_proofs WHERE application_batch_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE",
            [$batchId]
        );
        if ($proof === null || $proof['status'] !== 'submitted') {
            throw HttpException::badRequest('a payment proof must be uploaded before the payment can be recorded');
        }
        return $proof;
    }

    public function accept(int $proofId, int $staffUserId): void
    {
        Database::update('payment_proofs', $proofId, ['status' => 'accepted', 'reviewed_by' => $staffUserId, 'reviewed_at' => Database::now()]);
    }

    /**
     * The latest proof of each batch, keyed by batch id (batches without one
     * are left out). $forStaff adds the other applications that used the same
     * transaction code, so staff can spot a reused receipt.
     */
    public function latestFor(array $batchIds, bool $forStaff): array
    {
        if (!$batchIds) {
            return [];
        }
        $in = Database::placeholders(count($batchIds));
        $rows = Database::all(
            "SELECT pp.* FROM payment_proofs pp
              WHERE pp.id IN (SELECT MAX(id) FROM payment_proofs WHERE application_batch_id IN ($in) AND deleted_at IS NULL GROUP BY application_batch_id)",
            array_values($batchIds)
        );
        $out = [];
        foreach ($rows as $p) {
            $proof = [
                'status'           => $p['status'],
                'transaction_code' => $p['transaction_code'],
                'rejection_reason' => $p['rejection_reason'],
                'uploaded_by_staff' => $p['uploaded_by'] !== null,
                'uploaded_at'      => Format::dateTime($p['created_at']),
                'reviewed_at'      => Format::dateTime($p['reviewed_at']),
            ];
            if ($forStaff) {
                $proof['code_used_by'] = $this->codeUsedElsewhere($p['transaction_code'], (int) $p['application_batch_id']);
            }
            $out[(int) $p['application_batch_id']] = $proof;
        }
        return $out;
    }

    /** Application numbers of other applications whose payment or live proof has this code. */
    private function codeUsedElsewhere(string $code, int $batchId): array
    {
        $rows = Database::all(
            "SELECT DISTINCT ab.application_number FROM application_batches ab
              WHERE ab.id <> ? AND ab.deleted_at IS NULL AND (
                    EXISTS (SELECT 1 FROM payments p WHERE p.application_batch_id = ab.id AND p.deleted_at IS NULL AND UPPER(p.transaction_code) = ?)
                 OR EXISTS (SELECT 1 FROM payment_proofs pp WHERE pp.application_batch_id = ab.id AND pp.deleted_at IS NULL
                               AND pp.status IN ('submitted', 'accepted') AND pp.transaction_code = ?))",
            [$batchId, $code, $code]
        );
        return array_column($rows, 'application_number');
    }

    private function latestRow(int $batchId): ?array
    {
        return Database::one(
            'SELECT * FROM payment_proofs WHERE application_batch_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
            [$batchId]
        );
    }

    /** "qk12 abc3de" → "QK12ABC3DE"; letters and digits only, 6–30 of them. */
    private static function normaliseCode(string $code): string
    {
        $code = strtoupper(preg_replace('/[\s-]+/', '', $code));
        if (!preg_match('/^[A-Z0-9]{6,30}$/', $code)) {
            throw HttpException::badRequest('enter the transaction code from your payment message (letters and numbers, e.g. QK12ABC3DE)');
        }
        return $code;
    }
}
