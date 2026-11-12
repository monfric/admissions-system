<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Uniform measurement forms (one per admission). */
final class UniformMeasurementRepository
{
    public function forAdmission(int $admissionId): ?array
    {
        return Database::one(
            'SELECT * FROM uniform_measurements WHERE admission_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
            [$admissionId]
        );
    }

    public function forAdmissions(array $admissionIds): array
    {
        if (!$admissionIds) {
            return [];
        }
        return Database::all(
            'SELECT * FROM uniform_measurements WHERE admission_id IN (' . Database::placeholders(count($admissionIds)) . ') AND deleted_at IS NULL',
            array_values($admissionIds)
        );
    }

    public function create(array $data): int
    {
        return Database::insert('uniform_measurements', $data);
    }

    public function update(int $id, array $data): void
    {
        Database::update('uniform_measurements', $id, $data);
    }
}
