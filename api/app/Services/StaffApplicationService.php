<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Pagination;
use App\Repositories\ApplicantRepository;
use App\Repositories\IntakeRepository;

/**
 * The staff side of applications: Assign Application, the Unpaid / Paid /
 * Notified / Recalled / Rejected lists, Pay, Notify, Approve/Reject and the
 * automatic recall. Same rules as the Go application batch service, except
 * that only pending applications can be notified.
 */
final class StaffApplicationService
{
    /** A notified application counts as "expiring soon" with this many days or fewer left. */
    public const EXPIRING_SOON_DAYS = 7;

    private const BATCH_SELECT = 'SELECT ab.*, i.intake_month, i.intake_year, tl.name AS training_level_name,
            a.first_name, a.middle_name, a.last_name, a.phone_number, a.gender, a.profile_photo
          FROM application_batches ab
          JOIN intakes i ON i.id = ab.intake_id
          JOIN training_levels tl ON tl.id = ab.training_level_id
          JOIN applicants a ON a.id = ab.applicant_id';

    /** Staff "Assign Application" for an applicant (same rules as portal Apply). */
    public function assign(int $applicantId, array $req): array
    {
        $batchId = (new ApplicationBatchService())->create($applicantId, $req);
        return $this->get($batchId);
    }

    public function get(int $batchId): array
    {
        $batch = Database::one(self::BATCH_SELECT . ' WHERE ab.id = ? AND ab.deleted_at IS NULL', [$batchId]);
        if ($batch === null) {
            throw HttpException::badRequest('application batch not found');
        }
        return $this->buildResponses([$batch])[0];
    }

    public function list(Pagination $page, array $f, string $orderBy): array
    {
        $where = ['ab.deleted_at IS NULL'];
        $params = [];
        if ($page->search !== '') {
            $where[] = '(LOWER(a.first_name) LIKE ? OR LOWER(a.last_name) LIKE ? OR LOWER(a.phone_number) LIKE ? OR LOWER(ab.application_number) LIKE ?)';
            array_push($params, ...array_fill(0, 4, '%' . strtolower($page->search) . '%'));
        }
        foreach (['payment_status', 'decision_status', 'residence'] as $key) {
            if ($f[$key] !== '') {
                $where[] = "ab.$key = ?";
                $params[] = $f[$key];
            }
        }
        foreach (['intake_id', 'training_level_id'] as $key) {
            if ($f[$key] !== null) {
                $where[] = "ab.$key = ?";
                $params[] = $f[$key];
            }
        }
        if ($f['gender'] !== '') {
            $where[] = 'a.gender = ?';
            $params[] = $f['gender'];
        }
        if ($f['programme_id'] !== null) {
            // Either choice, unless only the notified / recalled programme should match.
            $match = 'EXISTS (SELECT 1 FROM applications ap JOIN intake_programmes ip ON ip.id = ap.intake_programme_id
                       WHERE ap.application_batch_id = ab.id AND ap.deleted_at IS NULL AND ip.programme_id = ?';
            $params[] = $f['programme_id'];
            if (in_array($f['programme_match'], ['notified', 'recalled'], true)) {
                $match .= ' AND ap.application_status = ?';
                $params[] = $f['programme_match'];
            }
            $where[] = $match . ')';
        }
        if ($f['days_remaining'] !== '') {
            $where[] = "ab.decision_status = 'notified'";
            [$from, $to] = self::daysRemainingWindow($f['days_remaining']);
            if ($from !== null) {
                $where[] = 'ab.notified_at >= ?';
                $params[] = $from;
            }
            if ($to !== null) {
                $where[] = 'ab.notified_at < ?';
                $params[] = $to;
            }
        }
        if (($since = ApplicantService::periodSince($f['applied'])) !== null) {
            $where[] = 'ab.created_at >= ?';
            $params[] = $since;
        }
        if (($since = ApplicantService::periodSince($f['paid'])) !== null) {
            $where[] = 'EXISTS (SELECT 1 FROM payments p WHERE p.application_batch_id = ab.id AND p.deleted_at IS NULL AND p.paid_at >= ?)';
            $params[] = $since;
        }

        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value(
            "SELECT COUNT(*) FROM application_batches ab JOIN applicants a ON a.id = ab.applicant_id WHERE $whereSql",
            $params
        );
        $rows = Database::all(self::BATCH_SELECT . " WHERE $whereSql ORDER BY $orderBy " . $page->limitSql(), $params);
        return $page->result($this->buildResponses($rows), $total);
    }

    /**
     * notified_at range for a "days remaining" filter: last_day, le3, le7,
     * le10 or gt10, with the same day counting as the Notified page.
     * @return array{0: ?string, 1: ?string}
     */
    private static function daysRemainingWindow(string $filter): array
    {
        $deadline = ApplicationBatchService::NOTIFICATION_DEADLINE_DAYS;
        $day = fn (int $offset) => date('Y-m-d 00:00:00', strtotime("today $offset days"));
        $upTo = fn (int $k) => [$day(-$deadline), $day(-($deadline - $k) + 1)];
        return match ($filter) {
            'last_day' => $upTo(0),
            'le3'      => $upTo(3),
            'le7'      => $upTo(7),
            'le10'     => $upTo(10),
            'gt10'     => [$day(-($deadline - 11)), null],
            default    => [null, null],
        };
    }

    /** Counts for an application page's cards, limited to one payment/decision status. */
    public function stats(string $paymentStatus, string $decisionStatus): array
    {
        $deadline = ApplicationBatchService::NOTIFICATION_DEADLINE_DAYS;
        $startOfDay = date('Y-m-d 00:00:00');
        $startOfMonth = date('Y-m-01 00:00:00');
        $lastDayStart = date('Y-m-d 00:00:00', strtotime("today -$deadline days"));
        $lastDayEnd = date('Y-m-d 00:00:00', strtotime('today -' . ($deadline - 1) . ' days'));
        $expiringEnd = date('Y-m-d 00:00:00', strtotime('today -' . ($deadline - self::EXPIRING_SOON_DAYS - 1) . ' days'));

        $where = 'ab.deleted_at IS NULL';
        $filterParams = [];
        if ($paymentStatus !== '') {
            $where .= ' AND ab.payment_status = ?';
            $filterParams[] = $paymentStatus;
        }
        if ($decisionStatus !== '') {
            $where .= ' AND ab.decision_status = ?';
            $filterParams[] = $decisionStatus;
        }
        $paidSince = 'EXISTS (SELECT 1 FROM payments p WHERE p.application_batch_id = ab.id AND p.deleted_at IS NULL AND p.paid_at >= ?)';
        $row = Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(a.gender = 'Male'), 0) AS male,
                    COALESCE(SUM(a.gender = 'Female'), 0) AS female,
                    COALESCE(SUM(a.gender = 'Other'), 0) AS other_gender,
                    COALESCE(SUM(ab.created_at >= ?), 0) AS new_this_month,
                    COALESCE(SUM(ab.created_at >= ?), 0) AS new_today,
                    COALESCE(SUM($paidSince), 0) AS paid_this_month,
                    COALESCE(SUM($paidSince), 0) AS paid_today,
                    COALESCE(SUM(ab.decision_status = 'notified' AND ab.notified_at >= ? AND ab.notified_at < ?), 0) AS expiring_soon,
                    COALESCE(SUM(ab.decision_status = 'notified' AND ab.notified_at >= ? AND ab.notified_at < ?), 0) AS last_day,
                    COALESCE(SUM(ab.recalled_at >= ?), 0) AS recalled_this_month,
                    COALESCE(SUM(ab.recalled_at >= ?), 0) AS recalled_today,
                    COALESCE(SUM(ab.rejected_at >= ?), 0) AS rejected_this_month,
                    COALESCE(SUM(ab.rejected_at >= ?), 0) AS rejected_today,
                    COALESCE(SUM(ab.residence = 'Boarder'), 0) AS boarders,
                    COALESCE(SUM(ab.residence = 'Day Scholar'), 0) AS day_scholars
               FROM application_batches ab
               JOIN applicants a ON a.id = ab.applicant_id AND a.deleted_at IS NULL
              WHERE $where",
            array_merge(
                [$startOfMonth, $startOfDay, $startOfMonth, $startOfDay, $lastDayStart, $expiringEnd, $lastDayStart, $lastDayEnd,
                 $startOfMonth, $startOfDay, $startOfMonth, $startOfDay],
                $filterParams
            )
        );
        $stats = array_map('intval', $row);
        $stats['expiring_within_days'] = self::EXPIRING_SOON_DAYS;
        return $stats;
    }

    /** Records the application fee (amount always taken from the fee tier, never the client). */
    public function recordPayment(int $batchId, array $req): array
    {
        $batch = Database::one('SELECT * FROM application_batches WHERE id = ? AND deleted_at IS NULL', [$batchId]);
        if ($batch === null) {
            throw HttpException::badRequest('application batch not found');
        }
        if ($batch['payment_status'] === 'paid') {
            throw HttpException::badRequest('this application has already been paid for');
        }
        $tier = (new IntakeRepository())->trainingLevelFor((int) $batch['intake_id'], (int) $batch['training_level_id']);
        if ($tier === null) {
            throw HttpException::badRequest("no fee schedule found for this application's intake and training level");
        }
        $now = Database::now();
        $id = Database::transaction(function () use ($batchId, $tier, $req, $now) {
            $id = Database::insert('payments', [
                'application_batch_id' => $batchId,
                'amount'               => (float) $tier['application_fee'],
                'payment_method'       => trim($req['payment_method']),
                'transaction_code'     => trim($req['transaction_code']),
                'paid_at'              => $now,
            ]);
            Database::update('application_batches', $batchId, ['payment_status' => 'paid']);
            return $id;
        });
        return [
            'id' => $id, 'application_batch_id' => $batchId, 'amount' => Format::float($tier['application_fee']),
            'payment_method' => trim($req['payment_method']), 'transaction_code' => trim($req['transaction_code']),
            'paid_at' => $now, 'created_at' => $now,
        ];
    }

    /** Provisionally selects one programme of a paid, pending application. */
    public function notify(int $batchId, int $applicationId): array
    {
        $batch = Database::one('SELECT * FROM application_batches WHERE id = ? AND deleted_at IS NULL', [$batchId]);
        if ($batch === null) {
            throw HttpException::badRequest('application batch not found');
        }
        if ($batch['payment_status'] !== 'paid') {
            throw HttpException::badRequest('only paid applications can be notified');
        }
        if ($batch['decision_status'] !== 'pending') {
            throw HttpException::badRequest('only pending applications can be notified');
        }
        $applications = Database::all('SELECT * FROM applications WHERE application_batch_id = ? AND deleted_at IS NULL', [$batchId]);
        if (!in_array($applicationId, array_map(fn ($a) => (int) $a['id'], $applications), true)) {
            throw HttpException::badRequest('the selected programme does not belong to this application');
        }
        Database::transaction(function () use ($applications, $applicationId, $batchId) {
            foreach ($applications as $app) {
                $status = (int) $app['id'] === $applicationId ? 'notified' : 'pending';
                if ($app['application_status'] !== $status) {
                    Database::update('applications', (int) $app['id'], ['application_status' => $status]);
                }
            }
            Database::update('application_batches', $batchId, ['decision_status' => 'notified', 'notified_at' => Database::now()]);
        });
        Notifications::notified($batchId);
        return $this->get($batchId);
    }

    /**
     * Approves (creating the admission with the next admission number) or
     * rejects a notified or recalled application.
     */
    public function decide(int $batchId, string $decision, string $remarks, int $staffUserId): array
    {
        $batch = Database::one(
            'SELECT ab.*, i.intake_month, i.intake_year FROM application_batches ab JOIN intakes i ON i.id = ab.intake_id
              WHERE ab.id = ? AND ab.deleted_at IS NULL',
            [$batchId]
        );
        if ($batch === null) {
            throw HttpException::badRequest('application batch not found');
        }
        if (!in_array($batch['decision_status'], ['notified', 'recalled'], true)) {
            throw HttpException::badRequest('only notified or recalled applications can be approved or rejected');
        }
        $applications = Database::all(
            'SELECT ap.*, ip.programme_id, p.code AS programme_code FROM applications ap
               JOIN intake_programmes ip ON ip.id = ap.intake_programme_id JOIN programmes p ON p.id = ip.programme_id
              WHERE ap.application_batch_id = ? AND ap.deleted_at IS NULL',
            [$batchId]
        );

        Database::transaction(function () use ($batch, $applications, $decision, $remarks, $staffUserId) {
            $now = Database::now();
            $batchData = ['remarks' => $remarks];
            if ($decision === 'approve') {
                $approved = null;
                foreach ($applications as $app) {
                    $selected = in_array($app['application_status'], ['notified', 'recalled'], true);
                    $status = $selected ? 'approved' : 'rejected';
                    if ($selected) {
                        $approved = $app;
                    }
                    if ($app['application_status'] !== $status) {
                        $data = ['application_status' => $status];
                        if ($selected) {
                            $data += ['approved_by' => $staffUserId, 'approved_at' => $now];
                        }
                        Database::update('applications', (int) $app['id'], $data);
                    }
                }
                if ($approved === null) {
                    throw HttpException::badRequest('no notified or recalled programme found for this application');
                }
                $batchData['decision_status'] = 'approved';
                $this->createAdmission($batch, $approved);
            } else {
                foreach ($applications as $app) {
                    if ($app['application_status'] !== 'rejected') {
                        Database::update('applications', (int) $app['id'], ['application_status' => 'rejected']);
                    }
                }
                $batchData['decision_status'] = 'rejected';
                $batchData['rejected_at'] = $now;
            }
            Database::update('application_batches', (int) $batch['id'], $batchData);
        });
        Notifications::decided($batchId, $decision);
        return $this->get($batchId);
    }

    /**
     * Inserts the admission with the next free sequence number for the
     * programme + intake: "{CODE}/{seq}/{MM}/{YY}". The intake programme row
     * is locked so two approvals can't take the same number.
     */
    private function createAdmission(array $batch, array $approved): void
    {
        Database::one('SELECT id FROM intake_programmes WHERE id = ? FOR UPDATE', [(int) $approved['intake_programme_id']]);
        $existing = Database::all(
            'SELECT admission_number FROM admissions WHERE programme_id = ? AND intake_id = ? AND deleted_at IS NULL',
            [(int) $approved['programme_id'], (int) $batch['intake_id']]
        );
        $used = [];
        foreach ($existing as $row) {
            $parts = explode('/', (string) $row['admission_number']);
            if (count($parts) >= 2 && ctype_digit($parts[1])) {
                $used[(int) $parts[1]] = true;
            }
        }
        $seq = 1;
        while (isset($used[$seq])) {
            $seq++;
        }
        $month = array_search($batch['intake_month'], IntakeService::MONTHS, true);
        $number = sprintf('%s/%d/%02d/%02d', $approved['programme_code'], $seq, $month === false ? 0 : $month + 1, (int) $batch['intake_year'] % 100);

        Database::insert('admissions', [
            'applicant_id'     => (int) $batch['applicant_id'],
            'application_id'   => (int) $approved['id'],
            'intake_id'        => (int) $batch['intake_id'],
            'programme_id'     => (int) $approved['programme_id'],
            'admission_number' => $number,
            'status'           => 'active',
            'admitted_at'      => Database::now(),
            'updated_at'       => Database::now(),
        ], false);
    }

    /**
     * Recalls notified applications whose 30-day window has passed (the whole
     * of the last day counts). Run hourly by cron/recall.php.
     */
    public function recallExpired(): int
    {
        $cutoff = date('Y-m-d 00:00:00', strtotime('today -' . ApplicationBatchService::NOTIFICATION_DEADLINE_DAYS . ' days'));
        $ids = Database::transaction(function () use ($cutoff) {
            $ids = array_map('intval', array_column(Database::all(
                "SELECT id FROM application_batches WHERE decision_status = 'notified' AND notified_at < ? AND deleted_at IS NULL FOR UPDATE",
                [$cutoff]
            ), 'id'));
            if (!$ids) {
                return [];
            }
            $in = Database::placeholders(count($ids));
            Database::execute(
                "UPDATE applications SET application_status = 'recalled', updated_at = ? WHERE application_batch_id IN ($in) AND application_status = 'notified'",
                array_merge([Database::now()], $ids)
            );
            Database::execute(
                "UPDATE application_batches SET decision_status = 'recalled', recalled_at = ?, updated_at = ? WHERE id IN ($in)",
                array_merge([Database::now(), Database::now()], $ids)
            );
            return $ids;
        });
        Notifications::recalled($ids);
        return count($ids);
    }

    /** Staff batch responses (Go's ApplicationBatchResponse), one query per related table. */
    private function buildResponses(array $batches): array
    {
        if (!$batches) {
            return [];
        }
        $batchIds = array_map(fn ($b) => (int) $b['id'], $batches);
        $appsByBatch = [];
        foreach ((new \App\Repositories\ApplicationRepository())->applicationsForBatches($batchIds) as $a) {
            $appsByBatch[(int) $a['application_batch_id']][] = [
                'id'                  => (int) $a['id'],
                'intake_programme_id' => (int) $a['intake_programme_id'],
                'programme_name'      => $a['programme_name'],
                'programme_code'      => $a['programme_code'],
                'application_status'  => $a['application_status'],
                'choice'              => (int) $a['choice'],
            ];
        }
        $fees = [];
        $intakeIds = array_values(array_unique(array_map(fn ($b) => (int) $b['intake_id'], $batches)));
        foreach ((new IntakeRepository())->trainingLevelsForIntakes($intakeIds) as $t) {
            $fees[$t['intake_id'] . ':' . $t['training_level_id']] = Format::float($t['application_fee']);
        }
        $applicantIds = array_values(array_unique(array_map(fn ($b) => (int) $b['applicant_id'], $batches)));
        $byApplicant = [];
        foreach (Database::all(
            'SELECT ab.id, ab.applicant_id, ab.application_number, ab.decision_status, ab.payment_status, i.intake_month, i.intake_year
               FROM application_batches ab JOIN intakes i ON i.id = ab.intake_id
              WHERE ab.applicant_id IN (' . Database::placeholders(count($applicantIds)) . ') AND ab.deleted_at IS NULL
              ORDER BY ab.created_at DESC, ab.id DESC',
            $applicantIds
        ) as $b) {
            $byApplicant[(int) $b['applicant_id']][] = $b;
        }

        return array_map(function (array $b) use ($appsByBatch, $fees, $byApplicant) {
            $previous = [];
            foreach ($byApplicant[(int) $b['applicant_id']] ?? [] as $p) {
                if ((int) $p['id'] !== (int) $b['id']) {
                    $previous[] = [
                        'application_batch_id' => (int) $p['id'], 'application_number' => $p['application_number'],
                        'intake_name' => IntakeRepository::name($p), 'decision_status' => $p['decision_status'],
                        'payment_status' => $p['payment_status'],
                    ];
                }
            }
            $response = [
                'id'                  => (int) $b['id'],
                'applicant_id'        => (int) $b['applicant_id'],
                'applicant_full_name' => ApplicantRepository::fullName($b),
                'applicant_phone'     => $b['phone_number'],
                'applicant_gender'    => $b['gender'],
                'intake_id'           => (int) $b['intake_id'],
                'intake_name'         => IntakeRepository::name($b),
                'training_level_id'   => (int) $b['training_level_id'],
                'training_level_name' => $b['training_level_name'],
                'application_fee'     => $fees[$b['intake_id'] . ':' . $b['training_level_id']] ?? 0.0,
                'application_number'  => $b['application_number'],
                'residence'           => $b['residence'],
                'payment_status'      => $b['payment_status'],
                'decision_status'     => $b['decision_status'],
                'applications'        => $appsByBatch[(int) $b['id']] ?? [],
                'previous_applications' => $previous,
                'created_at'          => Format::dateTime($b['created_at']),
                'updated_at'          => Format::dateTime($b['updated_at']),
            ];
            // Fields Go leaves out when empty.
            if ($b['profile_photo'] !== '') {
                $response['applicant_profile_photo'] = $b['profile_photo'];
            }
            if ((string) $b['remarks'] !== '') {
                $response['remarks'] = $b['remarks'];
            }
            if ($b['notified_at']) {
                $response['notified_at'] = Format::dateTime($b['notified_at']);
            }
            if ($b['recalled_at']) {
                $response['recalled_at'] = Format::dateTime($b['recalled_at']);
            }
            return $response;
        }, $batches);
    }
}
