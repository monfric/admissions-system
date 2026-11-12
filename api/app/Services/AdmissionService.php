<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Pagination;
use App\Repositories\ApplicantRepository;
use App\Repositories\IntakeRepository;
use App\Repositories\UniformMeasurementRepository;

/** Approved Applications (admissions) and the staff Uniform Measurements page. */
final class AdmissionService
{
    private const SELECT = 'SELECT ad.*, a.first_name, a.middle_name, a.last_name, a.email, a.phone_number, a.gender, a.profile_photo,
            p.name AS programme_name, p.code AS programme_code, i.intake_month, i.intake_year, ab.residence
          FROM admissions ad
          JOIN applicants a ON a.id = ad.applicant_id
          JOIN programmes p ON p.id = ad.programme_id
          JOIN intakes i ON i.id = ad.intake_id
          LEFT JOIN applications ap ON ap.id = ad.application_id
          LEFT JOIN application_batches ab ON ab.id = ap.application_batch_id';

    /**
     * Admissions sorted by programme code, then the admission number's
     * sequence as a number (so .../2/... comes before .../10/...).
     * @return array{0: array, 1: int} rows and total
     */
    private function query(Pagination $page, array $f): array
    {
        $where = ['ad.deleted_at IS NULL'];
        $params = [];
        if ($page->search !== '') {
            $where[] = '(LOWER(a.first_name) LIKE ? OR LOWER(a.last_name) LIKE ? OR LOWER(a.phone_number) LIKE ? OR LOWER(ad.admission_number) LIKE ?)';
            array_push($params, ...array_fill(0, 4, '%' . strtolower($page->search) . '%'));
        }
        foreach (['intake_id' => 'ad.intake_id', 'programme_id' => 'ad.programme_id', 'training_level_id' => 'p.training_level_id'] as $key => $column) {
            if (($f[$key] ?? null) !== null) {
                $where[] = "$column = ?";
                $params[] = $f[$key];
            }
        }
        foreach (['status' => 'ad.status', 'gender' => 'a.gender', 'residence' => 'ab.residence'] as $key => $column) {
            if (($f[$key] ?? '') !== '') {
                $where[] = "$column = ?";
                $params[] = $f[$key];
            }
        }
        if (($since = ApplicantService::periodSince($f['admitted'] ?? '')) !== null) {
            $where[] = 'ad.admitted_at >= ?';
            $params[] = $since;
        }
        switch ($f['measurement'] ?? '') {
            case 'pending':
                $where[] = 'ad.id NOT IN (SELECT admission_id FROM uniform_measurements WHERE deleted_at IS NULL)';
                break;
            case 'submitted':
            case 'unlocked':
                $where[] = 'ad.id IN (SELECT admission_id FROM uniform_measurements WHERE status = ? AND deleted_at IS NULL)';
                $params[] = $f['measurement'];
                break;
        }
        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value(
            "SELECT COUNT(*) FROM admissions ad JOIN applicants a ON a.id = ad.applicant_id JOIN programmes p ON p.id = ad.programme_id
               LEFT JOIN applications ap ON ap.id = ad.application_id LEFT JOIN application_batches ab ON ab.id = ap.application_batch_id
              WHERE $whereSql",
            $params
        );
        $rows = Database::all(
            self::SELECT . " WHERE $whereSql
              ORDER BY SUBSTRING_INDEX(ad.admission_number, '/', 1) ASC,
                       CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(ad.admission_number, '/', 2), '/', -1) AS UNSIGNED) ASC,
                       ad.admitted_at ASC " . $page->limitSql(),
            $params
        );
        return [$rows, $total];
    }

    public function list(Pagination $page, array $f): array
    {
        [$rows, $total] = $this->query($page, $f);
        return $page->result(array_map(function (array $r) {
            $response = [
                'id' => (int) $r['id'], 'admission_number' => $r['admission_number'],
                'applicant_id' => (int) $r['applicant_id'], 'applicant_full_name' => ApplicantRepository::fullName($r),
                'applicant_email' => $r['email'], 'applicant_phone' => $r['phone_number'],
                'application_id' => (int) $r['application_id'],
                'intake_id' => (int) $r['intake_id'], 'intake_name' => IntakeRepository::name($r),
                'programme_id' => (int) $r['programme_id'], 'programme_name' => $r['programme_name'], 'programme_code' => $r['programme_code'],
                'residence' => (string) $r['residence'], 'status' => $r['status'],
                'admitted_at' => Format::dateTime($r['admitted_at']), 'updated_at' => Format::dateTime($r['updated_at']),
            ];
            if ($r['profile_photo'] !== '') {
                $response['applicant_profile_photo'] = $r['profile_photo'];
            }
            return $response;
        }, $rows), $total);
    }

    /** Counts for the Approved Applications cards (every admission). */
    public function stats(): array
    {
        $row = Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(a.gender = 'Male'), 0) AS male,
                    COALESCE(SUM(a.gender = 'Female'), 0) AS female,
                    COALESCE(SUM(a.gender = 'Other'), 0) AS other_gender,
                    COALESCE(SUM(ad.admitted_at >= ?), 0) AS admitted_this_month,
                    COALESCE(SUM(ad.admitted_at >= ?), 0) AS admitted_today,
                    COALESCE(SUM(ab.residence = 'Boarder'), 0) AS boarders,
                    COALESCE(SUM(ab.residence = 'Day Scholar'), 0) AS day_scholars
               FROM admissions ad
               JOIN applicants a ON a.id = ad.applicant_id AND a.deleted_at IS NULL
               LEFT JOIN applications ap ON ap.id = ad.application_id
               LEFT JOIN application_batches ab ON ab.id = ap.application_batch_id
              WHERE ad.deleted_at IS NULL",
            [date('Y-m-01 00:00:00'), date('Y-m-d 00:00:00')]
        );
        return array_map('intval', $row);
    }

    // ── Uniform Measurements page ────────────────────────────────────────────

    /** Active admissions with their form status (inactive ones can't see the form either). */
    public function uniformList(Pagination $page, array $f): array
    {
        $f['status'] = 'active';
        [$rows, $total] = $this->query($page, $f);
        $forms = [];
        foreach ((new UniformMeasurementRepository())->forAdmissions(array_map(fn ($r) => (int) $r['id'], $rows)) as $form) {
            $forms[(int) $form['admission_id']] = $form;
        }
        return $page->result(array_map(fn ($r) => $this->uniformItem($r, $forms[(int) $r['id']] ?? null), $rows), $total);
    }

    public function uniformStats(): array
    {
        $row = Database::one(
            "SELECT COUNT(*) AS admitted,
                    COALESCE(SUM(a.gender = 'Male'), 0) AS male,
                    COALESCE(SUM(a.gender = 'Female'), 0) AS female,
                    COALESCE(SUM(a.gender = 'Other'), 0) AS other_gender,
                    COALESCE(SUM(um.id IS NOT NULL), 0) AS submitted,
                    COALESCE(SUM(um.uniform_set = 'gents'), 0) AS gents,
                    COALESCE(SUM(um.uniform_set = 'ladies'), 0) AS ladies,
                    COALESCE(SUM(um.id IS NULL), 0) AS pending,
                    COALESCE(SUM(um.status = 'unlocked'), 0) AS unlocked
               FROM admissions ad
               JOIN applicants a ON a.id = ad.applicant_id AND a.deleted_at IS NULL
               LEFT JOIN uniform_measurements um ON um.admission_id = ad.id AND um.deleted_at IS NULL
              WHERE ad.status = 'active' AND ad.deleted_at IS NULL"
        );
        return array_map('intval', $row);
    }

    public function uniformGet(int $admissionId): array
    {
        $row = Database::one(self::SELECT . ' WHERE ad.id = ? AND ad.deleted_at IS NULL', [$admissionId]);
        if ($row === null) {
            throw HttpException::notFound('admission not found');
        }
        return $this->uniformItem($row, (new UniformMeasurementRepository())->forAdmission($admissionId));
    }

    /** Reopens a submitted form so the student can correct and resubmit it (documents stay available). */
    public function uniformUnlock(int $admissionId): array
    {
        $uniforms = new UniformMeasurementRepository();
        $form = $uniforms->forAdmission($admissionId);
        if ($form === null) {
            throw HttpException::badRequest('this student has not submitted uniform measurements yet');
        }
        if ($form['status'] !== 'unlocked') {
            $uniforms->update((int) $form['id'], ['status' => 'unlocked', 'unlocked_at' => Database::now()]);
            Notifications::uniformUnlocked($admissionId);
        }
        return $this->uniformGet($admissionId);
    }

    /** @return array{0: string, 1: string} a student's submitted form as a PDF and its file name */
    public function uniformPdf(int $admissionId): array
    {
        $row = Database::one(self::SELECT . ' WHERE ad.id = ? AND ad.deleted_at IS NULL', [$admissionId]);
        if ($row === null) {
            throw HttpException::notFound('admission not found');
        }
        $form = (new UniformMeasurementRepository())->forAdmission($admissionId);
        if ($form === null) {
            throw HttpException::notFound('this student has not submitted uniform measurements yet');
        }
        return ApplicantPortalApplicationService::uniformPdfFor($row, ApplicantRepository::fullName($row), $form);
    }

    private function uniformItem(array $r, ?array $form): array
    {
        $item = [
            'admission_id' => (int) $r['id'], 'admission_number' => $r['admission_number'],
            'applicant_id' => (int) $r['applicant_id'], 'applicant_full_name' => ApplicantRepository::fullName($r),
            'applicant_gender' => $r['gender'], 'applicant_phone' => $r['phone_number'],
            'programme_name' => $r['programme_name'], 'programme_code' => $r['programme_code'],
            'intake_name' => IntakeRepository::name($r), 'residence' => (string) $r['residence'],
            'admitted_at' => Format::dateTime($r['admitted_at']),
            'measurement_status' => $form['status'] ?? 'pending',
        ];
        if ($r['profile_photo'] !== '') {
            $item['applicant_profile_photo'] = $r['profile_photo'];
        }
        if ($form !== null) {
            $item['measurement'] = UniformSets::response($form);
        }
        return $item;
    }
}
