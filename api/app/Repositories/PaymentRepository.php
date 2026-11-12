<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Application-fee payments. */
final class PaymentRepository
{
    /** An applicant's payments with the application number and intake, most recent first. */
    public function forApplicant(int $applicantId): array
    {
        return Database::all(
            'SELECT pay.*, ab.application_number, i.intake_month, i.intake_year
               FROM payments pay
               JOIN application_batches ab ON ab.id = pay.application_batch_id AND ab.deleted_at IS NULL
               JOIN intakes i ON i.id = ab.intake_id
              WHERE ab.applicant_id = ? AND pay.deleted_at IS NULL
              ORDER BY pay.paid_at DESC, pay.id DESC',
            [$applicantId]
        );
    }
}
