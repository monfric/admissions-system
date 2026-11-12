<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Applicants (self-registered on the portal or added by staff). */
final class ApplicantRepository
{
    public function findById(int $id): ?array
    {
        return Database::one('SELECT * FROM applicants WHERE id = ? AND deleted_at IS NULL', [$id]);
    }

    public function findByEmail(string $email): ?array
    {
        return Database::one('SELECT * FROM applicants WHERE email = ? AND deleted_at IS NULL', [$email]);
    }

    public function findByIdNumber(string $idNumber): ?array
    {
        return Database::one('SELECT * FROM applicants WHERE id_number = ? AND deleted_at IS NULL', [$idNumber]);
    }

    public function create(array $data): int
    {
        return Database::insert('applicants', $data);
    }

    public function update(int $id, array $data): void
    {
        Database::update('applicants', $id, $data);
    }

    /** "First Middle Last" (middle name only when given), as in the Go model. */
    public static function fullName(array $applicant): string
    {
        $middle = trim((string) ($applicant['middle_name'] ?? ''));
        return $middle !== ''
            ? "{$applicant['first_name']} $middle {$applicant['last_name']}"
            : "{$applicant['first_name']} {$applicant['last_name']}";
    }
}
