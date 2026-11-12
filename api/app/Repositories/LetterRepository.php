<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Offer letters (letter bodies) and application documents (staff-uploaded files). */
final class LetterRepository
{
    /** Active letters (any type) for the given intake programmes. */
    public function activeLettersFor(array $intakeProgrammeIds): array
    {
        if (!$intakeProgrammeIds) {
            return [];
        }
        return Database::all(
            "SELECT * FROM offer_letters
              WHERE intake_programme_id IN (" . Database::placeholders(count($intakeProgrammeIds)) . ")
                AND status = 'active' AND deleted_at IS NULL",
            array_values($intakeProgrammeIds)
        );
    }

    public function letterFor(int $intakeProgrammeId, string $type): ?array
    {
        return Database::one(
            'SELECT * FROM offer_letters WHERE intake_programme_id = ? AND type = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
            [$intakeProgrammeId, $type]
        );
    }

    /** Active documents for any of the intakes and programmes, by name. */
    public function activeDocumentsFor(array $intakeIds, array $programmeIds): array
    {
        if (!$intakeIds || !$programmeIds) {
            return [];
        }
        return Database::all(
            "SELECT * FROM application_documents
              WHERE intake_id IN (" . Database::placeholders(count($intakeIds)) . ")
                AND programme_id IN (" . Database::placeholders(count($programmeIds)) . ")
                AND status = 'active' AND deleted_at IS NULL
              ORDER BY document_name ASC",
            array_merge(array_values($intakeIds), array_values($programmeIds))
        );
    }

    public function document(int $id): ?array
    {
        return Database::one('SELECT * FROM application_documents WHERE id = ? AND deleted_at IS NULL', [$id]);
    }
}
