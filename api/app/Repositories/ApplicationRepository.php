<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/**
 * Application batches (one per applicant per intake) and the programme
 * applications inside them.
 */
final class ApplicationRepository
{
    /** Batch columns plus intake and training level details. */
    private const BATCH_SELECT = 'SELECT ab.*, i.intake_month, i.intake_year, tl.name AS training_level_name
                                    FROM application_batches ab
                                    JOIN intakes i ON i.id = ab.intake_id
                                    JOIN training_levels tl ON tl.id = ab.training_level_id';

    public function findBatch(int $id): ?array
    {
        return Database::one(self::BATCH_SELECT . ' WHERE ab.id = ? AND ab.deleted_at IS NULL', [$id]);
    }

    /** An applicant's batches, newest first. */
    public function batchesForApplicant(int $applicantId): array
    {
        return Database::all(
            self::BATCH_SELECT . ' WHERE ab.applicant_id = ? AND ab.deleted_at IS NULL ORDER BY ab.created_at DESC, ab.id DESC',
            [$applicantId]
        );
    }

    public function batchForApplicantAndIntake(int $applicantId, int $intakeId): ?array
    {
        return Database::one(
            'SELECT * FROM application_batches WHERE applicant_id = ? AND intake_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
            [$applicantId, $intakeId]
        );
    }

    public function numberExists(string $applicationNumber): bool
    {
        return Database::value(
            'SELECT 1 FROM application_batches WHERE application_number = ? AND deleted_at IS NULL LIMIT 1',
            [$applicationNumber]
        ) !== null;
    }

    public function createBatch(array $data): int
    {
        return Database::insert('application_batches', $data);
    }

    public function createApplication(array $data): int
    {
        return Database::insert('applications', $data);
    }

    /**
     * Programme applications of the given batches, 1st choice first, with the
     * programme's id, name and code and the intake programme's intake.
     */
    public function applicationsForBatches(array $batchIds): array
    {
        if (!$batchIds) {
            return [];
        }
        return Database::all(
            'SELECT a.*, ip.intake_id, ip.programme_id, p.name AS programme_name, p.code AS programme_code, p.training_level_id
               FROM applications a
               JOIN intake_programmes ip ON ip.id = a.intake_programme_id
               JOIN programmes p ON p.id = ip.programme_id
              WHERE a.application_batch_id IN (' . Database::placeholders(count($batchIds)) . ') AND a.deleted_at IS NULL
              ORDER BY a.choice ASC, a.id ASC',
            array_values($batchIds)
        );
    }

    /** The programme a notified or approved batch was selected for, or null. */
    public static function selectedApplication(array $batch, array $applications): ?array
    {
        $want = ['notified' => 'notified', 'approved' => 'approved'][$batch['decision_status']] ?? null;
        if ($want === null) {
            return null;
        }
        foreach ($applications as $application) {
            if ($application['application_status'] === $want) {
                return $application;
            }
        }
        return null;
    }
}
