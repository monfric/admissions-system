<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;

/**
 * Staff Dashboard: every figure on the landing page in one response. All
 * application figures follow the chosen intake (null = all intakes);
 * applicant registrations aren't tied to an intake, so those stay global.
 */
final class DashboardService
{
    private const MONTHS = "'January','February','March','April','May','June','July','August','September','October','November','December'";
    private const TREND_DAYS = 30;
    private const FEE_MONTHS = 12;
    private const TOP_PROGRAMMES = 15;
    private const TOP_COUNTIES = 10;
    private const LIST_LIMIT = 10;

    /** Intakes for the filter, newest first. */
    public function intakes(): array
    {
        $rows = Database::all(
            'SELECT id, intake_month, intake_year, is_active FROM intakes WHERE deleted_at IS NULL
              ORDER BY intake_year DESC, FIELD(intake_month, ' . self::MONTHS . ') DESC, id DESC'
        );
        return array_map(fn ($r) => [
            'id'        => (int) $r['id'],
            'label'     => $r['intake_month'] . ' ' . $r['intake_year'],
            'is_active' => Format::bool($r['is_active']),
        ], $rows);
    }

    public function stats(?int $intakeId, bool $isAdmin): array
    {
        $startOfDay = date('Y-m-d 00:00:00');
        $startOfMonth = date('Y-m-01 00:00:00');
        // Batch scope ("ab") and admission scope ("ad") for the chosen intake.
        $scope = $intakeId === null ? '' : ' AND ab.intake_id = ?';
        $adScope = $intakeId === null ? '' : ' AND ad.intake_id = ?';
        $p = $intakeId === null ? [] : [$intakeId];

        $deadline = ApplicationBatchService::NOTIFICATION_DEADLINE_DAYS;
        $expiringFrom = date('Y-m-d 00:00:00', strtotime("today -$deadline days"));
        $expiringTo = date('Y-m-d 00:00:00', strtotime('today -' . ($deadline - StaffApplicationService::EXPIRING_SOON_DAYS - 1) . ' days'));

        $applicants = array_map('intval', Database::one(
            'SELECT COUNT(*) AS total,
                    COALESCE(SUM(a.created_at >= ?), 0) AS today,
                    COALESCE(SUM(a.created_at >= ?), 0) AS this_month,
                    COALESCE(SUM(NOT EXISTS (SELECT 1 FROM application_batches ab WHERE ab.applicant_id = a.id AND ab.deleted_at IS NULL)), 0) AS not_yet_applied
               FROM applicants a WHERE a.deleted_at IS NULL',
            [$startOfDay, $startOfMonth]
        ));

        $paidSince = 'EXISTS (SELECT 1 FROM payments p WHERE p.application_batch_id = ab.id AND p.deleted_at IS NULL AND p.paid_at >= ?)';
        $applications = array_map('intval', Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(ab.created_at >= ?), 0) AS today,
                    COALESCE(SUM(ab.payment_status = 'unpaid'), 0) AS unpaid,
                    COALESCE(SUM(ab.payment_status = 'unpaid' AND (SELECT pp.status FROM payment_proofs pp
                        WHERE pp.application_batch_id = ab.id AND pp.deleted_at IS NULL ORDER BY pp.id DESC LIMIT 1) = 'submitted'), 0) AS proofs_awaiting,
                    COALESCE(SUM(ab.payment_status = 'paid'), 0) AS paid,
                    COALESCE(SUM($paidSince), 0) AS paid_today,
                    COALESCE(SUM(ab.payment_status = 'paid' AND ab.decision_status = 'pending'), 0) AS pending_decision,
                    COALESCE(SUM(ab.notified_at IS NOT NULL OR ab.decision_status = 'approved'), 0) AS reached_notified,
                    COALESCE(SUM(ab.decision_status = 'notified'), 0) AS notified,
                    COALESCE(SUM(ab.decision_status = 'approved'), 0) AS approved,
                    COALESCE(SUM(ab.decision_status = 'rejected'), 0) AS rejected,
                    COALESCE(SUM(ab.decision_status = 'recalled'), 0) AS recalled,
                    COALESCE(SUM(ab.decision_status = 'notified' AND ab.notified_at >= ? AND ab.notified_at < ?), 0) AS expiring_soon,
                    COALESCE(SUM(ab.residence = 'Boarder'), 0) AS boarders,
                    COALESCE(SUM(ab.residence = 'Day Scholar'), 0) AS day_scholars
               FROM application_batches ab
               JOIN applicants a ON a.id = ab.applicant_id AND a.deleted_at IS NULL
              WHERE ab.deleted_at IS NULL$scope",
            array_merge([$startOfDay, $startOfDay, $expiringFrom, $expiringTo], $p)
        ));

        $paymentJoin = 'FROM payments pay
               JOIN application_batches ab ON ab.id = pay.application_batch_id AND ab.deleted_at IS NULL
              WHERE pay.deleted_at IS NULL AND pay.paid_at IS NOT NULL' . $scope;
        $fees = Database::one(
            "SELECT COALESCE(SUM(pay.amount), 0) AS total,
                    COALESCE(SUM(CASE WHEN pay.paid_at >= ? THEN pay.amount END), 0) AS this_month,
                    COALESCE(SUM(CASE WHEN pay.paid_at >= ? THEN pay.amount END), 0) AS today
               $paymentJoin",
            array_merge([$startOfMonth, $startOfDay], $p)
        );

        $admitted = array_map('intval', Database::one(
            "SELECT COUNT(*) AS total, COALESCE(SUM(ad.admitted_at >= ?), 0) AS this_month
               FROM admissions ad
               JOIN applicants a ON a.id = ad.applicant_id AND a.deleted_at IS NULL
              WHERE ad.status = 'active' AND ad.deleted_at IS NULL$adScope",
            array_merge([$startOfMonth], $p)
        ));

        $stats = [
            'intake_id'  => $intakeId,
            'cards'      => [
                'applicants'          => $applicants,
                'applications'        => $applications,
                'fees'                => array_map([Format::class, 'float'], $fees),
                'admitted'            => $admitted,
                'expiring_within_days' => StaffApplicationService::EXPIRING_SOON_DAYS,
            ],
            'pipeline'   => [
                ['stage' => 'Applied', 'count' => $applications['total']],
                ['stage' => 'Paid', 'count' => $applications['paid']],
                ['stage' => 'Notified', 'count' => $applications['reached_notified']],
                ['stage' => 'Admitted', 'count' => $admitted['total']],
            ],
            'decision_status' => $this->decisionStatus($scope, $p),
            'trend'           => $this->trend($scope, $paymentJoin, $p),
            'fees_by_month'   => $this->feesByMonth($paymentJoin, $p),
            'payment_methods' => array_map(fn ($r) => ['method' => $r['method'], 'count' => (int) $r['count'], 'amount' => (float) $r['amount']], Database::all(
                "SELECT COALESCE(NULLIF(pay.payment_method, ''), 'Not specified') AS method, COUNT(*) AS count, SUM(pay.amount) AS amount
                   $paymentJoin GROUP BY method ORDER BY amount DESC",
                $p
            )),
            'programmes'      => $this->programmes($scope, $p),
            'training_levels' => array_map(fn ($r) => ['name' => $r['name'], 'applied' => (int) $r['applied'], 'paid' => (int) $r['paid'], 'approved' => (int) $r['approved']], Database::all(
                "SELECT tl.name, COUNT(*) AS applied,
                        SUM(ab.payment_status = 'paid') AS paid,
                        SUM(ab.decision_status = 'approved') AS approved
                   FROM application_batches ab
                   JOIN training_levels tl ON tl.id = ab.training_level_id
                  WHERE ab.deleted_at IS NULL$scope
                  GROUP BY tl.id, tl.name ORDER BY applied DESC",
                $p
            )),
            'faculties'       => array_map(fn ($r) => ['name' => $r['name'], 'count' => (int) $r['count']], Database::all(
                "SELECT f.name, COUNT(*) AS count
                   FROM applications ap
                   JOIN application_batches ab ON ab.id = ap.application_batch_id AND ab.deleted_at IS NULL
                   JOIN intake_programmes ip ON ip.id = ap.intake_programme_id
                   JOIN programmes pr ON pr.id = ip.programme_id
                   JOIN departments d ON d.id = pr.department_id
                   JOIN faculties f ON f.id = d.faculty_id
                  WHERE ap.deleted_at IS NULL AND ap.choice = 1$scope
                  GROUP BY f.id, f.name ORDER BY count DESC",
                $p
            )),
            'demographics'    => $this->demographics($scope, $p) + [
                'residence' => ['boarders' => $applications['boarders'], 'day_scholars' => $applications['day_scholars']],
            ],
            'post_admission'  => array_map('intval', Database::one(
                "SELECT COUNT(*) AS admitted,
                        COALESCE(SUM(EXISTS (SELECT 1 FROM offer_letters ol JOIN intake_programmes ip ON ip.id = ol.intake_programme_id
                            WHERE ip.intake_id = ad.intake_id AND ip.programme_id = ad.programme_id AND ip.deleted_at IS NULL
                              AND ol.type = 'admission' AND ol.status = 'active' AND ol.deleted_at IS NULL)), 0) AS with_offer_letter,
                        COALESCE(SUM(EXISTS (SELECT 1 FROM application_documents d
                            WHERE d.intake_id = ad.intake_id AND d.programme_id = ad.programme_id
                              AND d.type = 'admission' AND d.status = 'active' AND d.deleted_at IS NULL)), 0) AS with_documents,
                        COALESCE(SUM(EXISTS (SELECT 1 FROM uniform_measurements um
                            WHERE um.admission_id = ad.id AND um.status = 'submitted' AND um.deleted_at IS NULL)), 0) AS uniform_submitted
                   FROM admissions ad
                   JOIN applicants a ON a.id = ad.applicant_id AND a.deleted_at IS NULL
                  WHERE ad.status = 'active' AND ad.deleted_at IS NULL$adScope",
                $p
            )),
            'expiring'        => $this->expiring($scope, $p, $expiringFrom, $expiringTo),
            'recent_activity' => $this->recentActivity($scope, $adScope, $p),
        ];
        if ($isAdmin) {
            $stats['staff_activity'] = $this->staffActivity($scope, $p);
        }
        return $stats;
    }

    /** Every application in exactly one slice: pending ones split by whether they've paid. */
    private function decisionStatus(string $scope, array $p): array
    {
        $rows = Database::all(
            "SELECT CASE WHEN ab.decision_status <> 'pending' THEN ab.decision_status
                         WHEN ab.payment_status = 'paid' THEN 'awaiting_decision'
                         ELSE 'awaiting_payment' END AS status,
                    COUNT(*) AS count
               FROM application_batches ab
               JOIN applicants a ON a.id = ab.applicant_id AND a.deleted_at IS NULL
              WHERE ab.deleted_at IS NULL$scope
              GROUP BY status",
            $p
        );
        $counts = array_column($rows, 'count', 'status');
        $out = [];
        foreach (['awaiting_payment', 'awaiting_decision', 'notified', 'approved', 'rejected', 'recalled'] as $status) {
            $out[] = ['status' => $status, 'count' => (int) ($counts[$status] ?? 0)];
        }
        return $out;
    }

    /** Applications and payments per day for the last TREND_DAYS days (zero days included). */
    private function trend(string $scope, string $paymentJoin, array $p): array
    {
        $from = date('Y-m-d 00:00:00', strtotime('today -' . (self::TREND_DAYS - 1) . ' days'));
        $applied = array_column(Database::all(
            "SELECT DATE(ab.created_at) AS day, COUNT(*) AS count FROM application_batches ab
              WHERE ab.deleted_at IS NULL AND ab.created_at >= ?$scope GROUP BY day",
            array_merge([$from], $p)
        ), 'count', 'day');
        $paid = array_column(Database::all(
            "SELECT DATE(pay.paid_at) AS day, COUNT(*) AS count $paymentJoin AND pay.paid_at >= ? GROUP BY day",
            array_merge($p, [$from])
        ), 'count', 'day');

        $out = [];
        for ($i = self::TREND_DAYS - 1; $i >= 0; $i--) {
            $day = date('Y-m-d', strtotime("today -$i days"));
            $out[] = ['date' => $day, 'applications' => (int) ($applied[$day] ?? 0), 'payments' => (int) ($paid[$day] ?? 0)];
        }
        return $out;
    }

    /** Fees collected per month for the last FEE_MONTHS months (zero months included). */
    private function feesByMonth(string $paymentJoin, array $p): array
    {
        $from = date('Y-m-01 00:00:00', strtotime('first day of this month -' . (self::FEE_MONTHS - 1) . ' months'));
        $amounts = array_column(Database::all(
            "SELECT DATE_FORMAT(pay.paid_at, '%Y-%m') AS month, SUM(pay.amount) AS amount $paymentJoin AND pay.paid_at >= ? GROUP BY month",
            array_merge($p, [$from])
        ), 'amount', 'month');

        $out = [];
        for ($i = self::FEE_MONTHS - 1; $i >= 0; $i--) {
            $month = date('Y-m', strtotime("first day of this month -$i months"));
            $out[] = ['month' => $month, 'amount' => (float) ($amounts[$month] ?? 0)];
        }
        return $out;
    }

    /** The most-chosen programmes, split into 1st and 2nd choices. */
    private function programmes(string $scope, array $p): array
    {
        $rows = Database::all(
            "SELECT pr.name, pr.code, tl.name AS training_level,
                    SUM(ap.choice = 1) AS first_choice, SUM(ap.choice <> 1) AS other_choice
               FROM applications ap
               JOIN application_batches ab ON ab.id = ap.application_batch_id AND ab.deleted_at IS NULL
               JOIN intake_programmes ip ON ip.id = ap.intake_programme_id
               JOIN programmes pr ON pr.id = ip.programme_id
               JOIN training_levels tl ON tl.id = pr.training_level_id
              WHERE ap.deleted_at IS NULL$scope
              GROUP BY pr.id, pr.name, pr.code, tl.name
              ORDER BY COUNT(*) DESC, pr.name
              LIMIT " . self::TOP_PROGRAMMES,
            $p
        );
        return array_map(fn ($r) => [
            'name'           => $r['name'],
            'code'           => $r['code'],
            'training_level' => $r['training_level'],
            'first_choice'   => (int) $r['first_choice'],
            'other_choice'   => (int) $r['other_choice'],
        ], $rows);
    }

    /** Applicants who applied in scope, each counted once. */
    private function demographics(string $scope, array $p): array
    {
        $inScope = "a.deleted_at IS NULL AND a.id IN (SELECT ab.applicant_id FROM application_batches ab WHERE ab.deleted_at IS NULL$scope)";
        $row = array_map('intval', Database::one(
            "SELECT COUNT(*) AS applicants,
                    COALESCE(SUM(a.gender = 'Male'), 0) AS male,
                    COALESCE(SUM(a.gender = 'Female'), 0) AS female,
                    COALESCE(SUM(a.gender NOT IN ('Male', 'Female')), 0) AS other_gender,
                    COALESCE(SUM(a.has_disability = 1), 0) AS with_disability
               FROM applicants a WHERE $inScope",
            $p
        ));
        $counties = Database::all(
            "SELECT COALESCE(NULLIF(TRIM(a.county), ''), 'Not specified') AS county, COUNT(*) AS count
               FROM applicants a WHERE $inScope
              GROUP BY county ORDER BY count DESC, county LIMIT " . self::TOP_COUNTIES,
            $p
        );
        return [
            'applicants'      => $row['applicants'],
            'gender'          => ['male' => $row['male'], 'female' => $row['female'], 'other' => $row['other_gender']],
            'with_disability' => $row['with_disability'],
            'counties'        => array_map(fn ($r) => ['county' => $r['county'], 'count' => (int) $r['count']], $counties),
        ];
    }

    /** Notified applications closest to automatic recall. */
    private function expiring(string $scope, array $p, string $from, string $to): array
    {
        $rows = Database::all(
            "SELECT ab.id, ab.application_number, ab.notified_at, tl.name AS training_level,
                    a.first_name, a.middle_name, a.last_name, a.phone_number
               FROM application_batches ab
               JOIN applicants a ON a.id = ab.applicant_id AND a.deleted_at IS NULL
               JOIN training_levels tl ON tl.id = ab.training_level_id
              WHERE ab.deleted_at IS NULL AND ab.decision_status = 'notified'
                AND ab.notified_at >= ? AND ab.notified_at < ?$scope
              ORDER BY ab.notified_at ASC
              LIMIT " . self::LIST_LIMIT,
            array_merge([$from, $to], $p)
        );
        return array_map(fn ($r) => [
            'id'                 => (int) $r['id'],
            'application_number' => $r['application_number'],
            'applicant_name'     => self::name($r),
            'phone_number'       => $r['phone_number'],
            'training_level'     => $r['training_level'],
            'notified_at'        => Format::iso($r['notified_at']),
            'days_remaining'     => ApplicationBatchService::daysRemaining($r['notified_at']),
        ], $rows);
    }

    /** The latest applications, payments and admissions, newest first. */
    private function recentActivity(string $scope, string $adScope, array $p): array
    {
        $rows = Database::all(
            "SELECT * FROM (
                SELECT 'application' AS type, ab.created_at AS at, a.first_name, a.middle_name, a.last_name,
                       ab.application_number AS reference, tl.name AS detail
                  FROM application_batches ab
                  JOIN applicants a ON a.id = ab.applicant_id AND a.deleted_at IS NULL
                  JOIN training_levels tl ON tl.id = ab.training_level_id
                 WHERE ab.deleted_at IS NULL$scope
                UNION ALL
                SELECT 'payment', pay.paid_at, a.first_name, a.middle_name, a.last_name,
                       ab.application_number, CONCAT('KES ', FORMAT(pay.amount, 0))
                  FROM payments pay
                  JOIN application_batches ab ON ab.id = pay.application_batch_id AND ab.deleted_at IS NULL
                  JOIN applicants a ON a.id = ab.applicant_id AND a.deleted_at IS NULL
                 WHERE pay.deleted_at IS NULL AND pay.paid_at IS NOT NULL$scope
                UNION ALL
                SELECT 'admission', ad.admitted_at, a.first_name, a.middle_name, a.last_name,
                       ad.admission_number, pr.name
                  FROM admissions ad
                  JOIN applicants a ON a.id = ad.applicant_id AND a.deleted_at IS NULL
                  JOIN programmes pr ON pr.id = ad.programme_id
                 WHERE ad.deleted_at IS NULL$adScope
             ) activity
             ORDER BY at DESC
             LIMIT " . self::LIST_LIMIT,
            array_merge($p, $p, $p)
        );
        return array_map(fn ($r) => [
            'type'           => $r['type'],
            'at'             => Format::iso($r['at']),
            'applicant_name' => self::name($r),
            'reference'      => $r['reference'],
            'detail'         => $r['detail'],
        ], $rows);
    }

    /** Admins only: each staff member's last login and approvals in scope. */
    private function staffActivity(string $scope, array $p): array
    {
        $rows = Database::all(
            "SELECT u.id, u.first_name, u.last_name, u.role, u.is_active, u.last_login_at,
                    (SELECT COUNT(*) FROM applications ap
                       JOIN application_batches ab ON ab.id = ap.application_batch_id AND ab.deleted_at IS NULL
                      WHERE ap.approved_by = u.id AND ap.deleted_at IS NULL$scope) AS approvals
               FROM users u
              WHERE u.deleted_at IS NULL
              ORDER BY approvals DESC, u.last_login_at IS NULL, u.last_login_at DESC",
            $p
        );
        return array_map(fn ($r) => [
            'id'            => (int) $r['id'],
            'full_name'     => trim($r['first_name'] . ' ' . $r['last_name']),
            'role'          => $r['role'],
            'is_active'     => Format::bool($r['is_active']),
            'last_login_at' => Format::iso($r['last_login_at']),
            'approvals'     => (int) $r['approvals'],
        ], $rows);
    }

    private static function name(array $r): string
    {
        return trim(preg_replace('/\s+/', ' ', $r['first_name'] . ' ' . $r['middle_name'] . ' ' . $r['last_name']));
    }
}
