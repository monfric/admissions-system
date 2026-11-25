<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Database;
use App\Core\HttpException;
use App\Repositories\ApplicantRepository;
use App\Services\Pdf\ReceiptPdf;

/** PDF receipts for recorded fee payments (any method), for applicants and staff. */
final class ReceiptService
{
    /**
     * @param int|null $applicantId only this applicant's own payments (null = staff, any payment)
     * @return array{0: string, 1: string} PDF bytes and file name
     */
    public function pdf(int $paymentId, ?int $applicantId): array
    {
        $p = Database::one(
            "SELECT pay.*, ab.application_number, ab.applicant_id, CONCAT(i.intake_month, ' ', i.intake_year) AS intake_label,
                    tl.name AS training_level, a.first_name, a.middle_name, a.last_name,
                    (SELECT mp.phone FROM mpesa_payments mp WHERE mp.payment_id = pay.id LIMIT 1) AS mpesa_phone
               FROM payments pay
               JOIN application_batches ab ON ab.id = pay.application_batch_id AND ab.deleted_at IS NULL
               JOIN applicants a ON a.id = ab.applicant_id
               JOIN intakes i ON i.id = ab.intake_id
               JOIN training_levels tl ON tl.id = ab.training_level_id
              WHERE pay.id = ? AND pay.deleted_at IS NULL",
            [$paymentId]
        );
        if ($p === null || ($applicantId !== null && (int) $p['applicant_id'] !== $applicantId)) {
            throw HttpException::notFound('payment not found');
        }
        $paidAt = (string) ($p['paid_at'] ?: $p['created_at']);
        $number = ReceiptPdf::number((string) Config::get('letters.reference_prefix', 'NMTC'), (int) $p['id'], $paidAt);
        $pdf = ReceiptPdf::generate([
            'receipt_number'     => $number,
            'received_from'      => ApplicantRepository::fullName($p),
            'application_number' => $p['application_number'],
            'intake'             => $p['intake_label'],
            'training_level'     => $p['training_level'],
            'description'        => 'Application fee',
            'amount'             => (float) $p['amount'],
            'method'             => $p['payment_method'] ?: '—',
            'transaction_code'   => (string) $p['transaction_code'],
            'phone'              => $p['mpesa_phone'] ? MpesaPaymentService::localPhone((string) $p['mpesa_phone']) : '',
            'paid_at'            => $paidAt,
        ]);
        return [$pdf, 'Receipt-' . str_replace('/', '-', $number) . '.pdf'];
    }
}
