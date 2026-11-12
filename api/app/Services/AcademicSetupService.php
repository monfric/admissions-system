<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Pagination;
use App\Core\Query;

/**
 * Faculties, departments, training levels and programmes (the academic setup
 * the Applications module builds intakes from). Same responses and rules as
 * the Go services; NMTC has no classes, so programmes can't be deleted while
 * an intake offers them. Setup rows are deleted outright once nothing uses
 * them, so their codes can be reused.
 */
final class AcademicSetupService
{
    // ── Faculties ────────────────────────────────────────────────────────────

    public function listFaculties(Pagination $page, ?bool $isActive, string $orderBy): array
    {
        [$where, $params] = $this->searchWhere($page, 'f', $isActive);
        $total = (int) Database::value("SELECT COUNT(*) FROM faculties f WHERE $where", $params);
        $rows = Database::all(
            "SELECT f.*, (SELECT COUNT(*) FROM departments d WHERE d.faculty_id = f.id AND d.deleted_at IS NULL) AS department_count
               FROM faculties f WHERE $where ORDER BY $orderBy " . $page->limitSql(),
            $params
        );
        return $page->result(array_map([$this, 'facultyResponse'], $rows), $total);
    }

    public function getFaculty(int $id): array
    {
        return $this->facultyResponse($this->facultyRow($id));
    }

    public function createFaculty(array $req): array
    {
        $this->assertUnique('faculties', 'code', $req['code'], 'faculty code already exists');
        $this->assertUnique('faculties', 'name', $req['name'], 'faculty name already exists');
        $id = Database::insert('faculties', [
            'name' => $req['name'], 'code' => $req['code'], 'description' => $req['description'] ?? '',
            'is_active' => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        return $this->getFaculty($id);
    }

    public function updateFaculty(int $id, array $req): array
    {
        $row = $this->facultyRow($id);
        $data = $this->commonUpdates('faculties', $row, $req, 'faculty');
        if ($data) {
            Database::update('faculties', $id, $data);
        }
        return $this->getFaculty($id);
    }

    public function deleteFaculty(int $id): void
    {
        $row = $this->facultyRow($id);
        if ((int) $row['department_count'] > 0) {
            throw HttpException::badRequest('cannot delete faculty with existing departments');
        }
        $this->hardDelete('faculties', $id, 'faculty');
    }

    private function facultyRow(int $id): array
    {
        $row = Database::one(
            'SELECT f.*, (SELECT COUNT(*) FROM departments d WHERE d.faculty_id = f.id AND d.deleted_at IS NULL) AS department_count
               FROM faculties f WHERE f.id = ? AND f.deleted_at IS NULL',
            [$id]
        );
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    private function facultyResponse(array $f): array
    {
        return [
            'id' => (int) $f['id'], 'name' => $f['name'], 'code' => (string) $f['code'],
            'description' => (string) $f['description'], 'is_active' => Format::bool($f['is_active']),
            'department_count' => (int) $f['department_count'],
            'created_at' => Format::dateTime($f['created_at']), 'updated_at' => Format::dateTime($f['updated_at']),
        ];
    }

    // ── Departments ──────────────────────────────────────────────────────────

    private const DEPARTMENT_SELECT = 'SELECT d.*, f.name AS faculty_name, f.code AS faculty_code,
            (SELECT COUNT(*) FROM programmes p WHERE p.department_id = d.id AND p.deleted_at IS NULL) AS programme_count
          FROM departments d JOIN faculties f ON f.id = d.faculty_id';

    public function listDepartments(Pagination $page, ?int $facultyId, ?bool $isActive, string $orderBy): array
    {
        [$where, $params] = $this->searchWhere($page, 'd', $isActive);
        if ($facultyId !== null) {
            $where .= ' AND d.faculty_id = ?';
            $params[] = $facultyId;
        }
        $total = (int) Database::value("SELECT COUNT(*) FROM departments d WHERE $where", $params);
        $rows = Database::all(self::DEPARTMENT_SELECT . " WHERE $where ORDER BY $orderBy " . $page->limitSql(), $params);
        return $page->result(array_map([$this, 'departmentResponse'], $rows), $total);
    }

    public function getDepartment(int $id): array
    {
        return $this->departmentResponse($this->departmentRow($id));
    }

    public function createDepartment(array $req): array
    {
        $this->assertExists('faculties', (int) $req['faculty_id'], 'faculty not found');
        $this->assertUnique('departments', 'code', $req['code'], 'department code already exists');
        $id = Database::insert('departments', [
            'faculty_id' => (int) $req['faculty_id'], 'name' => $req['name'], 'code' => $req['code'],
            'description' => $req['description'] ?? '', 'is_active' => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        return $this->getDepartment($id);
    }

    public function updateDepartment(int $id, array $req): array
    {
        $row = $this->departmentRow($id);
        $data = [];
        if (isset($req['faculty_id'])) {
            $this->assertExists('faculties', (int) $req['faculty_id'], 'faculty not found');
            $data['faculty_id'] = (int) $req['faculty_id'];
        }
        $data += $this->commonUpdates('departments', $row, $req, 'department', false);
        if ($data) {
            Database::update('departments', $id, $data);
        }
        return $this->getDepartment($id);
    }

    public function deleteDepartment(int $id): void
    {
        $row = $this->departmentRow($id);
        if ((int) $row['programme_count'] > 0) {
            throw HttpException::badRequest('cannot delete department with existing programmes');
        }
        $this->hardDelete('departments', $id, 'department');
    }

    private function departmentRow(int $id): array
    {
        $row = Database::one(self::DEPARTMENT_SELECT . ' WHERE d.id = ? AND d.deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    private function departmentResponse(array $d): array
    {
        return [
            'id' => (int) $d['id'], 'faculty_id' => (int) $d['faculty_id'],
            'faculty_name' => $d['faculty_name'], 'faculty_code' => (string) $d['faculty_code'],
            'name' => $d['name'], 'code' => (string) $d['code'], 'description' => (string) $d['description'],
            'is_active' => Format::bool($d['is_active']), 'programme_count' => (int) $d['programme_count'],
            'created_at' => Format::dateTime($d['created_at']), 'updated_at' => Format::dateTime($d['updated_at']),
        ];
    }

    // ── Training levels ──────────────────────────────────────────────────────

    public function listTrainingLevels(Pagination $page, ?bool $isActive, string $orderBy): array
    {
        [$where, $params] = $this->searchWhere($page, 't', $isActive);
        $total = (int) Database::value("SELECT COUNT(*) FROM training_levels t WHERE $where", $params);
        $rows = Database::all(
            "SELECT t.*, (SELECT COUNT(*) FROM programmes p WHERE p.training_level_id = t.id AND p.deleted_at IS NULL) AS programme_count
               FROM training_levels t WHERE $where ORDER BY $orderBy " . $page->limitSql(),
            $params
        );
        return $page->result(array_map([$this, 'trainingLevelResponse'], $rows), $total);
    }

    public function getTrainingLevel(int $id): array
    {
        return $this->trainingLevelResponse($this->trainingLevelRow($id));
    }

    public function createTrainingLevel(array $req): array
    {
        $this->assertUnique('training_levels', 'code', $req['code'], 'training level code already exists');
        $this->assertUnique('training_levels', 'name', $req['name'], 'training level name already exists');
        $id = Database::insert('training_levels', [
            'name' => $req['name'], 'code' => $req['code'], 'description' => $req['description'] ?? '',
            'order' => (int) ($req['order'] ?? 0), 'is_active' => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        return $this->getTrainingLevel($id);
    }

    public function updateTrainingLevel(int $id, array $req): array
    {
        $row = $this->trainingLevelRow($id);
        $data = $this->commonUpdates('training_levels', $row, $req, 'training level');
        if (isset($req['order'])) {
            $data['order'] = (int) $req['order'];
        }
        if ($data) {
            Database::update('training_levels', $id, $data);
        }
        return $this->getTrainingLevel($id);
    }

    public function deleteTrainingLevel(int $id): void
    {
        $row = $this->trainingLevelRow($id);
        if ((int) $row['programme_count'] > 0) {
            throw HttpException::badRequest('cannot delete training level with existing programmes');
        }
        $this->hardDelete('training_levels', $id, 'training level');
    }

    private function trainingLevelRow(int $id): array
    {
        $row = Database::one(
            'SELECT t.*, (SELECT COUNT(*) FROM programmes p WHERE p.training_level_id = t.id AND p.deleted_at IS NULL) AS programme_count
               FROM training_levels t WHERE t.id = ? AND t.deleted_at IS NULL',
            [$id]
        );
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    private function trainingLevelResponse(array $t): array
    {
        return [
            'id' => (int) $t['id'], 'name' => $t['name'], 'code' => (string) $t['code'],
            'description' => (string) $t['description'], 'order' => (int) $t['order'],
            'is_active' => Format::bool($t['is_active']), 'programme_count' => (int) $t['programme_count'],
            'created_at' => Format::dateTime($t['created_at']), 'updated_at' => Format::dateTime($t['updated_at']),
        ];
    }

    // ── Programmes ───────────────────────────────────────────────────────────

    private const PROGRAMME_SELECT = 'SELECT p.*, d.name AS department_name, d.code AS department_code, f.name AS faculty_name,
            t.name AS training_level_name, t.code AS training_level_code, t.`order` AS training_level_order
          FROM programmes p
          JOIN departments d ON d.id = p.department_id
          JOIN faculties f ON f.id = d.faculty_id
          JOIN training_levels t ON t.id = p.training_level_id';

    public function listProgrammes(Pagination $page, array $filters, string $orderBy): array
    {
        [$where, $params] = $this->searchWhere($page, 'p', $filters['is_active']);
        foreach (['department_id' => 'p.department_id', 'training_level_id' => 'p.training_level_id', 'faculty_id' => 'd.faculty_id'] as $key => $column) {
            if ($filters[$key] !== null) {
                $where .= " AND $column = ?";
                $params[] = $filters[$key];
            }
        }
        $total = (int) Database::value(
            "SELECT COUNT(*) FROM programmes p JOIN departments d ON d.id = p.department_id WHERE $where",
            $params
        );
        $rows = Database::all(self::PROGRAMME_SELECT . " WHERE $where ORDER BY $orderBy " . $page->limitSql(), $params);
        return $page->result(array_map([$this, 'programmeResponse'], $rows), $total);
    }

    public function getProgramme(int $id): array
    {
        return $this->programmeResponse($this->programmeRow($id));
    }

    public function createProgramme(array $req): array
    {
        $this->assertExists('departments', (int) $req['department_id'], 'department not found');
        $this->assertExists('training_levels', (int) $req['training_level_id'], 'training level not found');
        $this->assertUnique('programmes', 'code', $req['code'], 'programme code already exists');
        $id = Database::insert('programmes', [
            'department_id' => (int) $req['department_id'], 'training_level_id' => (int) $req['training_level_id'],
            'name' => $req['name'], 'code' => $req['code'], 'description' => $req['description'] ?? '',
            'duration_years' => (int) $req['duration_years'], 'duration_months' => (int) ($req['duration_months'] ?? 0),
            'is_active' => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        return $this->getProgramme($id);
    }

    public function updateProgramme(int $id, array $req): array
    {
        $row = $this->programmeRow($id);
        $data = [];
        if (isset($req['department_id'])) {
            $this->assertExists('departments', (int) $req['department_id'], 'department not found');
            $data['department_id'] = (int) $req['department_id'];
        }
        if (isset($req['training_level_id'])) {
            $this->assertExists('training_levels', (int) $req['training_level_id'], 'training level not found');
            $data['training_level_id'] = (int) $req['training_level_id'];
        }
        $data += $this->commonUpdates('programmes', $row, $req, 'programme', false);
        foreach (['duration_years', 'duration_months'] as $field) {
            if (isset($req[$field])) {
                $data[$field] = (int) $req[$field];
            }
        }
        if ($data) {
            Database::update('programmes', $id, $data);
        }
        return $this->getProgramme($id);
    }

    public function deleteProgramme(int $id): void
    {
        $this->programmeRow($id);
        if (Database::value('SELECT COUNT(*) FROM intake_programmes WHERE programme_id = ? AND deleted_at IS NULL', [$id]) > 0) {
            throw HttpException::badRequest('cannot delete a programme that is offered in an intake');
        }
        $this->hardDelete('programmes', $id, 'programme');
    }

    private function programmeRow(int $id): array
    {
        $row = Database::one(self::PROGRAMME_SELECT . ' WHERE p.id = ? AND p.deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    private function programmeResponse(array $p): array
    {
        return [
            'id' => (int) $p['id'],
            'department_id' => (int) $p['department_id'], 'department_name' => $p['department_name'],
            'department_code' => (string) $p['department_code'], 'faculty_name' => $p['faculty_name'],
            'training_level_id' => (int) $p['training_level_id'], 'training_level_name' => $p['training_level_name'],
            'training_level_code' => (string) $p['training_level_code'], 'training_level_order' => (int) $p['training_level_order'],
            'name' => $p['name'], 'code' => $p['code'], 'description' => (string) $p['description'],
            'duration_years' => (int) $p['duration_years'], 'duration_months' => (int) $p['duration_months'],
            'total_duration_text' => self::durationText((int) $p['duration_years'], (int) $p['duration_months']),
            'is_active' => Format::bool($p['is_active']), 'class_count' => 0,
            'created_at' => Format::dateTime($p['created_at']), 'updated_at' => Format::dateTime($p['updated_at']),
        ];
    }

    /** "2 years 6 months", "1 year", "8 months" */
    public static function durationText(int $years, int $months): string
    {
        $plural = fn (int $n, string $word) => "$n $word" . ($n === 1 ? '' : 's');
        if ($months === 0) {
            return $plural($years, 'year');
        }
        if ($years === 0) {
            return $plural($months, 'month');
        }
        return $plural($years, 'year') . ' ' . $plural($months, 'month');
    }

    // ── Shared helpers ───────────────────────────────────────────────────────

    /** WHERE for name/code search and is_active on table alias $a. */
    private function searchWhere(Pagination $page, string $a, ?bool $isActive): array
    {
        $where = "$a.deleted_at IS NULL";
        $params = [];
        if ($page->search !== '') {
            $where .= " AND (LOWER($a.name) LIKE ? OR LOWER($a.code) LIKE ?)";
            $term = '%' . strtolower($page->search) . '%';
            array_push($params, $term, $term);
        }
        if ($isActive !== null) {
            $where .= " AND $a.is_active = ?";
            $params[] = $isActive ? 1 : 0;
        }
        return [$where, $params];
    }

    /** name / code / description / is_active updates; empty values leave fields unchanged (as in Go). */
    private function commonUpdates(string $table, array $row, array $req, string $label, bool $uniqueName = true): array
    {
        $data = [];
        if (($req['code'] ?? '') !== '' && $req['code'] !== $row['code']) {
            $this->assertUnique($table, 'code', $req['code'], "$label code already exists", (int) $row['id']);
            $data['code'] = $req['code'];
        }
        if (($req['name'] ?? '') !== '' && $req['name'] !== $row['name']) {
            if ($uniqueName) {
                $this->assertUnique($table, 'name', $req['name'], "$label name already exists", (int) $row['id']);
            }
            $data['name'] = $req['name'];
        }
        if (($req['description'] ?? '') !== '') {
            $data['description'] = $req['description'];
        }
        if (isset($req['is_active'])) {
            $data['is_active'] = $req['is_active'] ? 1 : 0;
        }
        return $data;
    }

    private function assertUnique(string $table, string $column, string $value, string $message, int $exceptId = 0): void
    {
        if (Database::value("SELECT 1 FROM $table WHERE $column = ? AND id <> ? LIMIT 1", [$value, $exceptId]) !== null) {
            throw HttpException::badRequest($message);
        }
    }

    private function assertExists(string $table, int $id, string $message): void
    {
        if (Database::value("SELECT 1 FROM $table WHERE id = ? AND deleted_at IS NULL", [$id]) === null) {
            throw HttpException::badRequest($message);
        }
    }

    private function hardDelete(string $table, int $id, string $label): void
    {
        try {
            Database::execute("DELETE FROM $table WHERE id = ?", [$id]);
        } catch (\PDOException $e) {
            if (Query::isForeignKeyError($e)) {
                throw HttpException::badRequest("cannot delete this $label: it is still in use");
            }
            throw $e;
        }
    }
}
