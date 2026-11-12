<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Admissions (created when an application is approved). */
final class AdmissionRepository
{
    /** Admission columns plus applicant, programme and intake details. */
    private const SELECT = 'SELECT ad.*, p.name AS programme_name, p.code AS programme_code,
                                   i.intake_month, i.intake_year
                              FROM admissions ad
                              JOIN programmes p ON p.id = ad.programme_id
                              JOIN intakes i ON i.id = ad.intake_id';

    public function findById(int $id): ?array
    {
        return Database::one(self::SELECT . ' WHERE ad.id = ? AND ad.deleted_at IS NULL', [$id]);
    }

    /** Active admissions of the given programme applications. */
    public function activeForApplications(array $applicationIds): array
    {
        if (!$applicationIds) {
            return [];
        }
        return Database::all(
            self::SELECT . " WHERE ad.application_id IN (" . Database::placeholders(count($applicationIds)) . ")
                             AND ad.status = 'active' AND ad.deleted_at IS NULL",
            array_values($applicationIds)
        );
    }
}
