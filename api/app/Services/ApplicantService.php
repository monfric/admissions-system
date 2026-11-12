<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Pagination;
use App\Core\Validator;
use App\Repositories\ApplicantDocumentRepository;
use App\Repositories\ApplicantRepository;
use App\Repositories\ApplicationRepository;
use App\Repositories\IntakeRepository;

/**
 * Applicant details, shared by the portal profile and (later) the staff New
 * Applicants page. Same rules as the Go applicant service.
 */
final class ApplicantService
{
    /** Text fields an update may set; an empty value leaves the field unchanged (as in Go). */
    private const TEXT_FIELDS = [
        'first_name', 'middle_name', 'last_name', 'phone_number', 'id_number', 'gender',
        'county', 'sub_county', 'denomination', 'disability_details',
        'guardian_name', 'relationship', 'guardian_contact', 'sponsor_name', 'sponsor_contact',
        'secondary_school', 'index_number', 'aggregate',
        'english_grade', 'kiswahili_grade', 'biology_grade', 'maths_grade', 'chemistry_grade', 'physics_grade',
        'college_grade', 'email',
    ];

    private ApplicantRepository $applicants;
    private ApplicantDocumentRepository $documents;
    private ApplicationRepository $applications;

    public function __construct()
    {
        $this->applicants = new ApplicantRepository();
        $this->documents = new ApplicantDocumentRepository();
        $this->applications = new ApplicationRepository();
    }

    public function find(int $id): array
    {
        $applicant = $this->applicants->findById($id);
        if ($applicant === null) {
            throw HttpException::notFound('record not found');
        }
        return $applicant;
    }

    /** The full applicant, with documents and every application they made. */
    public function get(int $id): array
    {
        $response = $this->toResponse($this->find($id));
        $documents = $this->documents->forApplicant($id);
        if ($documents) {
            $response['documents'] = array_map([self::class, 'documentResponse'], $documents);
        }
        return $response;
    }

    /**
     * Applies an update. Like the Go service, empty values don't clear
     * fields; disability details are dropped when has_disability is false.
     * Returns the applicant without documents (as Go's UpdateApplicant does).
     */
    public function update(int $id, array $req): array
    {
        $current = $this->applicants->findById($id);
        $idNumber = trim((string) ($req['id_number'] ?? ''));
        if ($current !== null && $idNumber !== '' && $idNumber !== $current['id_number'] && $this->applicants->findByIdNumber($idNumber) !== null) {
            throw HttpException::badRequest('ID number already exists');
        }
        Validator::digitsOnly([
            'Phone number'     => $req['phone_number'] ?? '',
            'Guardian contact' => $req['guardian_contact'] ?? '',
            'Sponsor contact'  => $req['sponsor_contact'] ?? '',
        ]);
        $applicant = $this->find($id);
        $data = [];

        if (($req['email'] ?? '') !== '' && $req['email'] !== $applicant['email']) {
            if ($this->applicants->findByEmail($req['email']) !== null) {
                throw HttpException::badRequest('email already exists');
            }
        }
        foreach (self::TEXT_FIELDS as $field) {
            if (isset($req[$field]) && $req[$field] !== '') {
                $data[$field] = (string) $req[$field];
            }
        }
        if (!empty($req['date_of_birth'])) {
            $data['date_of_birth'] = self::toDate((string) $req['date_of_birth']);
        }
        if (array_key_exists('has_disability', $req) && $req['has_disability'] !== null) {
            $data['has_disability'] = $req['has_disability'] ? 1 : 0;
        }
        foreach (['kcse_year', 'graduation_year'] as $field) {
            if (isset($req[$field])) {
                $data[$field] = (int) $req[$field];
            }
        }
        foreach (['mark_complete', 'is_active'] as $field) {
            if (isset($req[$field])) {
                $data[$field] = $req[$field] ? 1 : 0;
            }
        }

        // Disability details are kept only while has_disability is true.
        $hasDisability = (bool) ($data['has_disability'] ?? $applicant['has_disability']);
        $data['disability_details'] = $hasDisability ? trim((string) ($data['disability_details'] ?? $applicant['disability_details'])) : '';

        $this->applicants->update($id, $data);
        return $this->toResponse($this->find($id));
    }

    // ── Staff: New Applicants page ───────────────────────────────────────────

    /** Creates an applicant from the staff form (all core details required). */
    public function create(array $req): array
    {
        Validator::digitsOnly([
            'Phone number'     => $req['phone_number'],
            'Guardian contact' => $req['guardian_contact'],
            'Sponsor contact'  => $req['sponsor_contact'] ?? '',
        ]);
        if ($this->applicants->findByEmail($req['email']) !== null) {
            throw HttpException::badRequest('email already exists');
        }
        if ($this->applicants->findByIdNumber($req['id_number']) !== null) {
            throw HttpException::badRequest('ID number already exists');
        }
        $hasDisability = !empty($req['has_disability']);
        $data = [
            'email' => $req['email'], 'password' => password_hash($req['password'], PASSWORD_BCRYPT),
            'date_of_birth' => self::toDate((string) $req['date_of_birth']),
            'has_disability' => $hasDisability ? 1 : 0,
            'disability_details' => $hasDisability ? trim((string) ($req['disability_details'] ?? '')) : '',
            'kcse_year' => (int) $req['kcse_year'],
            'graduation_year' => isset($req['graduation_year']) ? (int) $req['graduation_year'] : null,
            'mark_complete' => !empty($req['mark_complete']) ? 1 : 0,
            'is_active' => ($req['is_active'] ?? true) ? 1 : 0,
        ];
        foreach (self::TEXT_FIELDS as $field) {
            if ($field !== 'email' && $field !== 'disability_details') {
                $data[$field] = (string) ($req[$field] ?? '');
            }
        }
        $id = $this->applicants->create($data);
        return $this->toResponse($this->find($id));
    }

    /** The New Applicants list with its filters (Go's ApplicantFilterQuery). */
    public function list(Pagination $page, array $f, string $orderBy): array
    {
        $where = ['deleted_at IS NULL'];
        $params = [];
        if ($page->search !== '') {
            $where[] = '(LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(middle_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(id_number) LIKE ? OR LOWER(phone_number) LIKE ?)';
            array_push($params, ...array_fill(0, 6, '%' . strtolower($page->search) . '%'));
        }
        foreach (['gender' => 'gender', 'county' => 'county'] as $key => $column) {
            if ($f[$key] !== '') {
                $where[] = "$column = ?";
                $params[] = $f[$key];
            }
        }
        foreach (['has_disability' => 'has_disability', 'is_active' => 'is_active', 'profile_complete' => 'mark_complete'] as $key => $column) {
            if ($f[$key] !== null) {
                $where[] = "$column = ?";
                $params[] = $f[$key] ? 1 : 0;
            }
        }
        $hasApplication = 'EXISTS (SELECT 1 FROM application_batches ab WHERE ab.applicant_id = applicants.id AND ab.deleted_at IS NULL)';
        if ($f['has_applied'] !== null) {
            $where[] = ($f['has_applied'] ? '' : 'NOT ') . $hasApplication;
        }
        if ($f['intake_id'] !== null) {
            $where[] = 'EXISTS (SELECT 1 FROM application_batches ab WHERE ab.applicant_id = applicants.id AND ab.deleted_at IS NULL AND ab.intake_id = ?)';
            $params[] = $f['intake_id'];
        }
        if (($since = self::periodSince($f['registered'])) !== null) {
            $where[] = 'created_at >= ?';
            $params[] = $since;
        }
        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value("SELECT COUNT(*) FROM applicants WHERE $whereSql", $params);
        $rows = Database::all("SELECT * FROM applicants WHERE $whereSql ORDER BY $orderBy " . $page->limitSql(), $params);

        $byApplicant = [];
        if ($rows) {
            $ids = array_map(fn ($r) => (int) $r['id'], $rows);
            foreach (Database::all(
                'SELECT ab.*, i.intake_month, i.intake_year FROM application_batches ab JOIN intakes i ON i.id = ab.intake_id
                  WHERE ab.applicant_id IN (' . Database::placeholders(count($ids)) . ') AND ab.deleted_at IS NULL
                  ORDER BY ab.created_at DESC, ab.id DESC',
                $ids
            ) as $b) {
                $byApplicant[(int) $b['applicant_id']][] = $b;
            }
        }
        $data = array_map(fn ($a) => $this->toResponse($a, $byApplicant[(int) $a['id']] ?? []), $rows);
        return $page->result($data, $total);
    }

    /** Counts for the New Applicants page cards. */
    public function stats(): array
    {
        $startOfMonth = date('Y-m-01 00:00:00');
        $startOfDay = date('Y-m-d 00:00:00');
        $row = Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(gender = 'Male'), 0) AS male,
                    COALESCE(SUM(gender = 'Female'), 0) AS female,
                    COALESCE(SUM(gender = 'Other'), 0) AS other_gender,
                    COALESCE(SUM(created_at >= ?), 0) AS new_this_month,
                    COALESCE(SUM(created_at >= ?), 0) AS new_today,
                    COALESCE(SUM(mark_complete = 0), 0) AS incomplete_profiles,
                    COALESCE(SUM(NOT EXISTS (SELECT 1 FROM application_batches ab WHERE ab.applicant_id = applicants.id AND ab.deleted_at IS NULL)), 0) AS not_yet_applied
               FROM applicants WHERE deleted_at IS NULL",
            [$startOfMonth, $startOfDay]
        );
        return array_map('intval', $row);
    }

    /**
     * Deletes an applicant who has no applications (their email and ID number
     * are freed for a new account). Applicants with applications are kept.
     */
    public function delete(int $id): void
    {
        $this->find($id);
        if (Database::value('SELECT COUNT(*) FROM application_batches WHERE applicant_id = ? AND deleted_at IS NULL', [$id]) > 0) {
            throw HttpException::badRequest('cannot delete an applicant who has applications. Deactivate the account instead');
        }
        Database::execute(
            "UPDATE applicants SET deleted_at = ?, email = CONCAT(LEFT(email, 70), '.deleted.', id), id_number = CONCAT(LEFT(id_number, 30), '.deleted.', id)
              WHERE id = ? AND deleted_at IS NULL",
            [Database::now(), $id]
        );
    }

    /** Start of a period for date filters: today, week (from Monday), month, 30days; null otherwise. */
    public static function periodSince(string $period): ?string
    {
        return match ($period) {
            'today'  => date('Y-m-d 00:00:00'),
            'week'   => date('Y-m-d 00:00:00', strtotime('monday this week')),
            'month'  => date('Y-m-01 00:00:00'),
            '30days' => date('Y-m-d 00:00:00', strtotime('-29 days')),
            default  => null,
        };
    }

    /** The applicant as the API returns it (Go's ApplicantResponse; no documents). */
    public function toResponse(array $a, ?array $batches = null): array
    {
        $response = [
            'id'           => (int) $a['id'],
            'email'        => $a['email'],
            'first_name'   => $a['first_name'],
            'middle_name'  => $a['middle_name'],
            'last_name'    => $a['last_name'],
            'full_name'    => ApplicantRepository::fullName($a),
            'phone_number' => $a['phone_number'],
            'id_number'    => $a['id_number'],
            'date_of_birth' => $a['date_of_birth'] ? substr((string) $a['date_of_birth'], 0, 10) : '',
            'gender'       => $a['gender'],
            'county'       => $a['county'],
            'sub_county'   => $a['sub_county'],
            'denomination' => $a['denomination'],
            'has_disability' => Format::bool($a['has_disability']),
            'disability_details' => $a['disability_details'],
            'guardian_name'    => $a['guardian_name'],
            'relationship'     => $a['relationship'],
            'guardian_contact' => $a['guardian_contact'],
            'sponsor_name'     => $a['sponsor_name'],
            'sponsor_contact'  => $a['sponsor_contact'],
            'secondary_school' => $a['secondary_school'],
            'index_number'     => $a['index_number'],
            'kcse_year'        => (int) $a['kcse_year'],
            'aggregate'        => $a['aggregate'],
            'english_grade'    => $a['english_grade'],
            'kiswahili_grade'  => $a['kiswahili_grade'],
            'biology_grade'    => $a['biology_grade'],
            'maths_grade'      => $a['maths_grade'],
            'chemistry_grade'  => $a['chemistry_grade'],
            'physics_grade'    => $a['physics_grade'],
            'college_grade'    => $a['college_grade'],
            'graduation_year'  => $a['graduation_year'] === null ? null : (int) $a['graduation_year'],
            'profile_photo'    => $a['profile_photo'],
            'mark_complete'    => Format::bool($a['mark_complete']),
            'profile_step'     => (int) $a['profile_step'],
            'applications'     => $this->previousApplications((int) $a['id'], $batches),
            'is_active'        => Format::bool($a['is_active']),
            'created_at'       => Format::dateTime($a['created_at']),
            'updated_at'       => Format::dateTime($a['updated_at']),
        ];
        // Fields Go leaves out when empty.
        foreach (['disability_details', 'college_grade'] as $field) {
            if ($response[$field] === '') {
                unset($response[$field]);
            }
        }
        if ($response['graduation_year'] === null) {
            unset($response['graduation_year']);
        }
        return $response;
    }

    /** Every application batch the applicant made, newest first. */
    private function previousApplications(int $applicantId, ?array $batches = null): array
    {
        $batches ??= $this->applications->batchesForApplicant($applicantId);
        return array_map(fn (array $b) => [
            'application_batch_id' => (int) $b['id'],
            'application_number'   => $b['application_number'],
            'intake_name'          => IntakeRepository::name($b),
            'decision_status'      => $b['decision_status'],
            'payment_status'       => $b['payment_status'],
        ], $batches);
    }

    public static function documentResponse(array $doc): array
    {
        return [
            'id'            => (int) $doc['id'],
            'document_type' => $doc['document_type'],
            'file_name'     => $doc['file_name'],
            'file_path'     => $doc['file_path'],
            'file_size'     => (int) $doc['file_size'],
            'mime_type'     => $doc['mime_type'],
            'created_at'    => Format::dateTime($doc['created_at']),
        ];
    }

    /**
     * A date from the apps ("2000-05-01T00:00:00.000Z" or "2000-05-01"),
     * stored as that calendar day so time zones can't shift it.
     */
    private static function toDate(string $value): string
    {
        if (!preg_match('/^(\d{4}-\d{2}-\d{2})/', $value, $m) || strtotime($m[1]) === false) {
            throw HttpException::badRequest('Invalid request data', 'date_of_birth must be a valid date');
        }
        return $m[1] . ' 00:00:00';
    }
}
