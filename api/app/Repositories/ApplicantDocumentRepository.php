<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Applicants' supporting documents (one row per applicant + type). */
final class ApplicantDocumentRepository
{
    public function forApplicant(int $applicantId): array
    {
        return Database::all(
            'SELECT * FROM applicant_documents WHERE applicant_id = ? AND deleted_at IS NULL ORDER BY id',
            [$applicantId]
        );
    }

    public function findByType(int $applicantId, string $type): ?array
    {
        return Database::one(
            'SELECT * FROM applicant_documents WHERE applicant_id = ? AND document_type = ? AND deleted_at IS NULL',
            [$applicantId, $type]
        );
    }

    /**
     * Saves the applicant's file of this type, replacing (and restoring, if it
     * was deleted) any earlier row; returns the replaced file's path or ''.
     */
    public function upsert(int $applicantId, string $type, array $file): string
    {
        $existing = Database::one(
            'SELECT * FROM applicant_documents WHERE applicant_id = ? AND document_type = ?',
            [$applicantId, $type]
        );
        if ($existing === null) {
            Database::insert('applicant_documents', ['applicant_id' => $applicantId, 'document_type' => $type] + $file);
            return '';
        }
        Database::update('applicant_documents', (int) $existing['id'], $file + ['deleted_at' => null]);
        return $existing['deleted_at'] === null ? (string) $existing['file_path'] : '';
    }

    public function delete(int $id): void
    {
        Database::softDelete('applicant_documents', $id);
    }
}
