<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Intakes and what is open in them (programmes, training levels with fees). */
final class IntakeRepository
{
    public function findById(int $id): ?array
    {
        return Database::one('SELECT * FROM intakes WHERE id = ? AND deleted_at IS NULL', [$id]);
    }

    /** Active intakes, newest first (as the Go API's default order). */
    public function active(int $limit = 100): array
    {
        return Database::all(
            'SELECT * FROM intakes WHERE is_active = 1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ' . (int) $limit
        );
    }

    /** "September 2026" */
    public static function name(array $intake): string
    {
        return $intake['intake_month'] . ' ' . $intake['intake_year'];
    }

    /** An intake's fee tiers with the training level name, newest first. */
    public function trainingLevels(int $intakeId): array
    {
        return Database::all(
            'SELECT itl.*, tl.name AS training_level_name
               FROM intake_training_levels itl
               JOIN training_levels tl ON tl.id = itl.training_level_id
              WHERE itl.intake_id = ? AND itl.deleted_at IS NULL
              ORDER BY itl.created_at DESC, itl.id DESC',
            [$intakeId]
        );
    }

    public function trainingLevelFor(int $intakeId, int $trainingLevelId): ?array
    {
        return Database::one(
            'SELECT * FROM intake_training_levels
              WHERE intake_id = ? AND training_level_id = ? AND deleted_at IS NULL
              ORDER BY id LIMIT 1',
            [$intakeId, $trainingLevelId]
        );
    }

    /** Fee tiers for several intakes. */
    public function trainingLevelsForIntakes(array $intakeIds): array
    {
        if (!$intakeIds) {
            return [];
        }
        return Database::all(
            'SELECT * FROM intake_training_levels WHERE intake_id IN (' . Database::placeholders(count($intakeIds)) . ') AND deleted_at IS NULL',
            array_values($intakeIds)
        );
    }

    /** An intake's programmes with name, code and training level, newest first. */
    public function programmes(int $intakeId): array
    {
        return Database::all(
            'SELECT ip.*, p.name AS programme_name, p.code AS programme_code, p.training_level_id
               FROM intake_programmes ip
               JOIN programmes p ON p.id = ip.programme_id
              WHERE ip.intake_id = ? AND ip.deleted_at IS NULL
              ORDER BY ip.created_at DESC, ip.id DESC',
            [$intakeId]
        );
    }

    public function intakeProgramme(int $id): ?array
    {
        return Database::one(
            'SELECT ip.*, p.name AS programme_name, p.code AS programme_code, p.training_level_id
               FROM intake_programmes ip
               JOIN programmes p ON p.id = ip.programme_id
              WHERE ip.id = ? AND ip.deleted_at IS NULL',
            [$id]
        );
    }
}
