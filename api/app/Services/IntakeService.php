<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Pagination;

/**
 * Intakes and what is open in them: programmes (intake_programmes) and
 * training levels with their application fee (intake_training_levels).
 * Unlike the Go version, nothing that applications depend on can be removed.
 */
final class IntakeService
{
    public const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // ── Intakes ──────────────────────────────────────────────────────────────

    public function list(Pagination $page, array $filters, string $orderBy): array
    {
        $where = 'deleted_at IS NULL';
        $params = [];
        if ($page->search !== '') {
            $where .= ' AND LOWER(intake_month) LIKE ?';
            $params[] = '%' . strtolower($page->search) . '%';
        }
        foreach (['intake_year' => 'intake_year', 'intake_id' => 'id'] as $key => $column) {
            if ($filters[$key] !== null) {
                $where .= " AND $column = ?";
                $params[] = $filters[$key];
            }
        }
        if ($filters['is_active'] !== null) {
            $where .= ' AND is_active = ?';
            $params[] = $filters['is_active'] ? 1 : 0;
        }
        $total = (int) Database::value("SELECT COUNT(*) FROM intakes WHERE $where", $params);
        $rows = Database::all("SELECT * FROM intakes WHERE $where ORDER BY $orderBy " . $page->limitSql(), $params);
        return $page->result($this->withCounts($rows), $total);
    }

    public function get(int $id): array
    {
        return $this->withCounts([$this->row($id)])[0];
    }

    public function create(array $req): array
    {
        $this->assertNoDuplicate($req['intake_month'], (int) $req['intake_year'], 0);
        $id = Database::insert('intakes', [
            'intake_month' => $req['intake_month'],
            'intake_year'  => (int) $req['intake_year'],
            'is_active'    => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        return $this->get($id);
    }

    public function update(int $id, array $req): array
    {
        $intake = $this->row($id);
        $month = ($req['intake_month'] ?? '') !== '' ? $req['intake_month'] : $intake['intake_month'];
        $year = isset($req['intake_year']) ? (int) $req['intake_year'] : (int) $intake['intake_year'];
        if ($month !== $intake['intake_month'] || $year !== (int) $intake['intake_year']) {
            $this->assertNoDuplicate($month, $year, $id);
        }
        $data = ['intake_month' => $month, 'intake_year' => $year];
        if (isset($req['is_active'])) {
            $data['is_active'] = $req['is_active'] ? 1 : 0;
        }
        Database::update('intakes', $id, $data);
        return $this->get($id);
    }

    public function delete(int $id): void
    {
        $this->row($id);
        if (Database::value('SELECT COUNT(*) FROM application_batches WHERE intake_id = ? AND deleted_at IS NULL', [$id]) > 0) {
            throw HttpException::badRequest('cannot delete an intake that has applications. Close it instead');
        }
        Database::softDelete('intakes', $id);
    }

    /** Counts for the Intakes page cards (open intakes only, except the totals). */
    public function stats(): array
    {
        $stats = Database::one(
            'SELECT COUNT(*) AS total_intakes, COALESCE(SUM(is_active = 1), 0) AS open_intakes FROM intakes WHERE deleted_at IS NULL'
        );
        $openJoin = 'JOIN intakes i ON i.id = %s.intake_id AND i.deleted_at IS NULL AND i.is_active = 1';
        $stats['programmes_running'] = Database::value(
            'SELECT COUNT(*) FROM intake_programmes ip ' . sprintf($openJoin, 'ip') . ' WHERE ip.is_active = 1 AND ip.deleted_at IS NULL'
        );
        $apps = Database::one(
            "SELECT COUNT(*) AS applications,
                    COALESCE(SUM(ab.payment_status = 'paid'), 0) AS paid_applications,
                    COALESCE(SUM(ab.payment_status <> 'paid'), 0) AS unpaid_applications,
                    COALESCE(SUM(ab.decision_status = 'notified'), 0) AS notified
               FROM application_batches ab " . sprintf($openJoin, 'ab') . ' WHERE ab.deleted_at IS NULL'
        );
        $stats += $apps;
        $stats['admitted'] = Database::value(
            "SELECT COUNT(*) FROM admissions ad " . sprintf($openJoin, 'ad') . " WHERE ad.status = 'active' AND ad.deleted_at IS NULL"
        );
        return array_map('intval', $stats);
    }

    private function row(int $id): array
    {
        $row = Database::one('SELECT * FROM intakes WHERE id = ? AND deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    private function assertNoDuplicate(string $month, int $year, int $exceptId): void
    {
        $existing = Database::value(
            'SELECT id FROM intakes WHERE intake_month = ? AND intake_year = ? AND deleted_at IS NULL AND id <> ?',
            [$month, $year, $exceptId]
        );
        if ($existing !== null) {
            throw HttpException::badRequest("an intake for $month $year already exists");
        }
    }

    /** Adds programme and application counts (one grouped query each). */
    private function withCounts(array $intakes): array
    {
        if (!$intakes) {
            return [];
        }
        $ids = array_map(fn ($i) => (int) $i['id'], $intakes);
        $in = Database::placeholders(count($ids));
        $programmes = [];
        foreach (Database::all(
            "SELECT intake_id, COUNT(*) AS total, COALESCE(SUM(is_active = 1), 0) AS running
               FROM intake_programmes WHERE intake_id IN ($in) AND deleted_at IS NULL GROUP BY intake_id",
            $ids
        ) as $r) {
            $programmes[(int) $r['intake_id']] = $r;
        }
        $applications = [];
        foreach (Database::all(
            "SELECT intake_id, COUNT(*) AS total,
                    COALESCE(SUM(payment_status = 'paid'), 0) AS paid,
                    COALESCE(SUM(payment_status <> 'paid'), 0) AS unpaid
               FROM application_batches WHERE intake_id IN ($in) AND deleted_at IS NULL GROUP BY intake_id",
            $ids
        ) as $r) {
            $applications[(int) $r['intake_id']] = $r;
        }

        return array_map(function (array $i) use ($programmes, $applications) {
            $p = $programmes[(int) $i['id']] ?? ['total' => 0, 'running' => 0];
            $a = $applications[(int) $i['id']] ?? ['total' => 0, 'paid' => 0, 'unpaid' => 0];
            return [
                'id'                => (int) $i['id'],
                'intake_month'      => $i['intake_month'],
                'intake_year'       => (int) $i['intake_year'],
                'is_active'         => Format::bool($i['is_active']),
                'programme_count'   => (int) $p['total'],
                'running_count'     => (int) $p['running'],
                'closed_count'      => (int) $p['total'] - (int) $p['running'],
                'paid_count'        => (int) $a['paid'],
                'unpaid_count'      => (int) $a['unpaid'],
                'application_count' => (int) $a['total'],
                'created_at'        => Format::dateTime($i['created_at']),
                'updated_at'        => Format::dateTime($i['updated_at']),
            ];
        }, $intakes);
    }

    // ── Programmes open in an intake ─────────────────────────────────────────

    private const PROGRAMME_SELECT = 'SELECT ip.*, p.name AS programme_name, p.code AS programme_code,
            p.training_level_id, t.name AS training_level_name
          FROM intake_programmes ip
          JOIN programmes p ON p.id = ip.programme_id
          JOIN training_levels t ON t.id = p.training_level_id';

    public function programmes(int $intakeId): array
    {
        return array_map([$this, 'programmeResponse'], Database::all(
            self::PROGRAMME_SELECT . ' WHERE ip.intake_id = ? AND ip.deleted_at IS NULL ORDER BY ip.created_at DESC, ip.id DESC',
            [$intakeId]
        ));
    }

    public function addProgramme(int $intakeId, array $req): array
    {
        if (Database::value('SELECT 1 FROM intakes WHERE id = ? AND deleted_at IS NULL', [$intakeId]) === null) {
            throw HttpException::badRequest('intake not found');
        }
        $this->assertProgramme((int) $req['programme_id']);
        $this->assertProgrammeFree($intakeId, (int) $req['programme_id'], 0);
        $id = Database::insert('intake_programmes', [
            'intake_id' => $intakeId, 'programme_id' => (int) $req['programme_id'],
            'is_active' => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        return $this->programmeResponse($this->programmeRow($id));
    }

    public function updateProgramme(int $id, array $req): array
    {
        $ip = $this->programmeRow($id);
        $data = [];
        if (isset($req['programme_id']) && (int) $req['programme_id'] !== (int) $ip['programme_id']) {
            $this->assertProgramme((int) $req['programme_id']);
            $this->assertProgrammeFree((int) $ip['intake_id'], (int) $req['programme_id'], $id);
            if ($this->applicationsFor($id) > 0) {
                throw HttpException::badRequest('cannot change the programme: applicants have already applied for it');
            }
            $data['programme_id'] = (int) $req['programme_id'];
        }
        if (isset($req['is_active'])) {
            $data['is_active'] = $req['is_active'] ? 1 : 0;
        }
        if ($data) {
            Database::update('intake_programmes', $id, $data);
        }
        return $this->programmeResponse($this->programmeRow($id));
    }

    public function removeProgramme(int $id): void
    {
        $this->programmeRow($id);
        if ($this->applicationsFor($id) > 0) {
            throw HttpException::badRequest('cannot remove a programme that applicants have applied for. Close it instead');
        }
        Database::softDelete('intake_programmes', $id);
    }

    private function programmeRow(int $id): array
    {
        $row = Database::one(self::PROGRAMME_SELECT . ' WHERE ip.id = ? AND ip.deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    private function assertProgramme(int $programmeId): void
    {
        if (Database::value('SELECT 1 FROM programmes WHERE id = ? AND deleted_at IS NULL', [$programmeId]) === null) {
            throw HttpException::badRequest('programme not found');
        }
    }

    private function assertProgrammeFree(int $intakeId, int $programmeId, int $exceptId): void
    {
        if (Database::value(
            'SELECT 1 FROM intake_programmes WHERE intake_id = ? AND programme_id = ? AND deleted_at IS NULL AND id <> ?',
            [$intakeId, $programmeId, $exceptId]
        ) !== null) {
            throw HttpException::badRequest('this programme is already registered for this intake');
        }
    }

    private function applicationsFor(int $intakeProgrammeId): int
    {
        return (int) Database::value(
            'SELECT COUNT(*) FROM applications WHERE intake_programme_id = ? AND deleted_at IS NULL',
            [$intakeProgrammeId]
        );
    }

    private function programmeResponse(array $ip): array
    {
        return [
            'id' => (int) $ip['id'], 'intake_id' => (int) $ip['intake_id'], 'programme_id' => (int) $ip['programme_id'],
            'programme_name' => $ip['programme_name'], 'programme_code' => $ip['programme_code'],
            'training_level_id' => (int) $ip['training_level_id'], 'training_level_name' => $ip['training_level_name'],
            'is_active' => Format::bool($ip['is_active']),
            'created_at' => Format::dateTime($ip['created_at']), 'updated_at' => Format::dateTime($ip['updated_at']),
        ];
    }

    // ── Training levels (fee tiers) open in an intake ────────────────────────

    private const LEVEL_SELECT = 'SELECT itl.*, t.name AS training_level_name, t.code AS training_level_code
          FROM intake_training_levels itl JOIN training_levels t ON t.id = itl.training_level_id';

    public function trainingLevels(int $intakeId): array
    {
        return array_map([$this, 'levelResponse'], Database::all(
            self::LEVEL_SELECT . ' WHERE itl.intake_id = ? AND itl.deleted_at IS NULL ORDER BY itl.created_at DESC, itl.id DESC',
            [$intakeId]
        ));
    }

    public function addTrainingLevel(int $intakeId, array $req): array
    {
        if (Database::value('SELECT 1 FROM intakes WHERE id = ? AND deleted_at IS NULL', [$intakeId]) === null) {
            throw HttpException::badRequest('intake not found');
        }
        $this->assertTrainingLevel((int) $req['training_level_id']);
        $this->assertLevelFree($intakeId, (int) $req['training_level_id'], 0);
        $id = Database::insert('intake_training_levels', [
            'intake_id' => $intakeId, 'training_level_id' => (int) $req['training_level_id'],
            'application_fee' => (float) $req['application_fee'], 'is_active' => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        return $this->levelResponse($this->levelRow($id));
    }

    public function updateTrainingLevel(int $id, array $req): array
    {
        $itl = $this->levelRow($id);
        $data = [];
        if (isset($req['training_level_id']) && (int) $req['training_level_id'] !== (int) $itl['training_level_id']) {
            $this->assertTrainingLevel((int) $req['training_level_id']);
            $this->assertLevelFree((int) $itl['intake_id'], (int) $req['training_level_id'], $id);
            if ($this->batchesFor($itl) > 0) {
                throw HttpException::badRequest('cannot change the training level: applicants have already applied under it');
            }
            $data['training_level_id'] = (int) $req['training_level_id'];
        }
        if (isset($req['application_fee'])) {
            $data['application_fee'] = (float) $req['application_fee'];
        }
        if (isset($req['is_active'])) {
            $data['is_active'] = $req['is_active'] ? 1 : 0;
        }
        if ($data) {
            Database::update('intake_training_levels', $id, $data);
        }
        return $this->levelResponse($this->levelRow($id));
    }

    public function removeTrainingLevel(int $id): void
    {
        $itl = $this->levelRow($id);
        if ($this->batchesFor($itl) > 0) {
            throw HttpException::badRequest('cannot remove a fee tier that applicants have applied under. Close it instead');
        }
        Database::softDelete('intake_training_levels', $id);
    }

    private function levelRow(int $id): array
    {
        $row = Database::one(self::LEVEL_SELECT . ' WHERE itl.id = ? AND itl.deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    private function assertTrainingLevel(int $levelId): void
    {
        if (Database::value('SELECT 1 FROM training_levels WHERE id = ? AND deleted_at IS NULL', [$levelId]) === null) {
            throw HttpException::badRequest('training level not found');
        }
    }

    private function assertLevelFree(int $intakeId, int $levelId, int $exceptId): void
    {
        if (Database::value(
            'SELECT 1 FROM intake_training_levels WHERE intake_id = ? AND training_level_id = ? AND deleted_at IS NULL AND id <> ?',
            [$intakeId, $levelId, $exceptId]
        ) !== null) {
            throw HttpException::badRequest('this training level already has a fee tier for this intake');
        }
    }

    private function batchesFor(array $itl): int
    {
        return (int) Database::value(
            'SELECT COUNT(*) FROM application_batches WHERE intake_id = ? AND training_level_id = ? AND deleted_at IS NULL',
            [(int) $itl['intake_id'], (int) $itl['training_level_id']]
        );
    }

    private function levelResponse(array $itl): array
    {
        return [
            'id' => (int) $itl['id'], 'intake_id' => (int) $itl['intake_id'],
            'training_level_id' => (int) $itl['training_level_id'],
            'training_level_name' => $itl['training_level_name'], 'training_level_code' => (string) $itl['training_level_code'],
            'application_fee' => Format::float($itl['application_fee']), 'is_active' => Format::bool($itl['is_active']),
            'created_at' => Format::dateTime($itl['created_at']), 'updated_at' => Format::dateTime($itl['updated_at']),
        ];
    }
}
