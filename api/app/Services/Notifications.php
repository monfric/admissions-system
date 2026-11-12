<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Database;

/**
 * Emails sent to applicants as they go through the process. Each method
 * loads what its email needs and queues it; none of them ever throws, so a
 * problem here can't undo or block the action that triggered it. Call them
 * after the action's transaction has committed.
 */
final class Notifications
{
    public static function applicantRegistered(int $applicantId): void
    {
        self::guard('applicant_welcome', function () use ($applicantId) {
            $a = self::applicant($applicantId);
            EmailQueue::push($a['email'], self::name($a), 'applicant_welcome', EmailTemplates::applicantWelcome($a['first_name']));
        });
    }

    public static function profileSubmitted(int $applicantId): void
    {
        self::guard('profile_submitted', function () use ($applicantId) {
            $a = self::applicant($applicantId);
            EmailQueue::push($a['email'], self::name($a), 'profile_submitted', EmailTemplates::profileSubmitted($a['first_name']));
        });
    }

    public static function applicationSubmitted(int $batchId): void
    {
        self::guard('application_submitted', function () use ($batchId) {
            $b = self::batch($batchId);
            $programmes = array_column(Database::all(
                'SELECT p.name FROM applications ap
                   JOIN intake_programmes ip ON ip.id = ap.intake_programme_id
                   JOIN programmes p ON p.id = ip.programme_id
                  WHERE ap.application_batch_id = ? AND ap.deleted_at IS NULL ORDER BY ap.choice',
                [$batchId]
            ), 'name');
            $fee = (float) Database::value(
                'SELECT application_fee FROM intake_training_levels
                  WHERE intake_id = ? AND training_level_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
                [(int) $b['intake_id'], (int) $b['training_level_id']]
            );
            EmailQueue::push($b['email'], self::name($b), 'application_submitted', EmailTemplates::applicationSubmitted(
                $b['first_name'], $b['application_number'], $b['intake_label'], $b['training_level'], $programmes, $fee
            ));
        });
    }

    public static function notified(int $batchId): void
    {
        self::guard('notified', function () use ($batchId) {
            $b = self::batch($batchId);
            EmailQueue::push($b['email'], self::name($b), 'notified', EmailTemplates::notified(
                $b['first_name'], $b['application_number'], self::chosenProgramme($batchId), self::deadline($b['notified_at'])
            ));
        });
    }

    /** @param int[] $batchIds */
    public static function recalled(array $batchIds): void
    {
        foreach ($batchIds as $batchId) {
            self::guard('recalled', function () use ($batchId) {
                $b = self::batch($batchId);
                EmailQueue::push($b['email'], self::name($b), 'recalled', EmailTemplates::recalled(
                    $b['first_name'], $b['application_number'], self::chosenProgramme($batchId)
                ));
            });
        }
    }

    public static function decided(int $batchId, string $decision): void
    {
        self::guard("decision_$decision", function () use ($batchId, $decision) {
            $b = self::batch($batchId);
            if ($decision !== 'approve') {
                EmailQueue::push($b['email'], self::name($b), 'rejected', EmailTemplates::rejected(
                    $b['first_name'], $b['application_number'], (string) $b['remarks']
                ));
                return;
            }
            $admission = Database::one(
                'SELECT ad.admission_number, p.name AS programme_name FROM admissions ad
                   JOIN applications ap ON ap.id = ad.application_id
                   JOIN programmes p ON p.id = ad.programme_id
                  WHERE ap.application_batch_id = ? AND ad.deleted_at IS NULL ORDER BY ad.id DESC LIMIT 1',
                [$batchId]
            );
            if ($admission !== null) {
                EmailQueue::push($b['email'], self::name($b), 'admitted', EmailTemplates::admitted(
                    $b['first_name'], $admission['admission_number'], $admission['programme_name'], $b['intake_label']
                ));
            }
        });
    }

    public static function uniformUnlocked(int $admissionId): void
    {
        self::guard('uniform_unlocked', function () use ($admissionId) {
            $row = Database::one(
                'SELECT ad.admission_number, a.email, a.first_name, a.middle_name, a.last_name
                   FROM admissions ad JOIN applicants a ON a.id = ad.applicant_id
                  WHERE ad.id = ? AND a.deleted_at IS NULL',
                [$admissionId]
            );
            if ($row !== null) {
                EmailQueue::push($row['email'], self::name($row), 'uniform_unlocked', EmailTemplates::uniformUnlocked($row['first_name'], $row['admission_number']));
            }
        });
    }

    /**
     * Queues the 7-day and last-day reminders for notified applications
     * (each goes out once: the dedupe key stops repeats). Run by cron/emails.php.
     */
    public static function queueDeadlineReminders(): int
    {
        $deadline = ApplicationBatchService::NOTIFICATION_DEADLINE_DAYS;
        $reminderDays = StaffApplicationService::EXPIRING_SOON_DAYS;
        // Notified on or after this day = still inside the window; up to $reminderDays days left.
        $from = date('Y-m-d 00:00:00', strtotime("today -$deadline days"));
        $to = date('Y-m-d 00:00:00', strtotime('today -' . ($deadline - $reminderDays - 1) . ' days'));
        $rows = Database::all(
            "SELECT ab.id, ab.notified_at FROM application_batches ab
              WHERE ab.decision_status = 'notified' AND ab.deleted_at IS NULL AND ab.notified_at >= ? AND ab.notified_at < ?",
            [$from, $to]
        );
        $count = 0;
        foreach ($rows as $row) {
            $days = ApplicationBatchService::daysRemaining($row['notified_at']);
            $kind = $days <= 0 ? 'last_day' : 'week';
            $batchId = (int) $row['id'];
            self::guard('deadline_reminder', function () use ($batchId, $days, $kind, &$count) {
                $b = self::batch($batchId);
                EmailQueue::push($b['email'], self::name($b), 'deadline_reminder', EmailTemplates::deadlineReminder(
                    $b['first_name'], $b['application_number'], self::chosenProgramme($batchId), $days, self::deadline($b['notified_at'])
                ), "reminder:$kind:$batchId:" . substr($b['notified_at'], 0, 10));
                $count++;
            });
        }
        return $count;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static function guard(string $what, callable $work): void
    {
        try {
            $work();
        } catch (\Throwable $e) {
            $dir = Config::storagePath('logs');
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            @error_log(sprintf("[%s] email ($what): %s\n", date('Y-m-d H:i:s'), $e->getMessage()), 3, $dir . '/error.log');
        }
    }

    private static function applicant(int $id): array
    {
        $a = Database::one('SELECT email, first_name, middle_name, last_name FROM applicants WHERE id = ? AND deleted_at IS NULL', [$id]);
        if ($a === null) {
            throw new \RuntimeException("applicant $id not found");
        }
        return $a;
    }

    private static function batch(int $batchId): array
    {
        $b = Database::one(
            "SELECT ab.*, CONCAT(i.intake_month, ' ', i.intake_year) AS intake_label, tl.name AS training_level,
                    a.email, a.first_name, a.middle_name, a.last_name
               FROM application_batches ab
               JOIN applicants a ON a.id = ab.applicant_id AND a.deleted_at IS NULL
               JOIN intakes i ON i.id = ab.intake_id
               JOIN training_levels tl ON tl.id = ab.training_level_id
              WHERE ab.id = ?",
            [$batchId]
        );
        if ($b === null) {
            throw new \RuntimeException("application batch $batchId not found");
        }
        return $b;
    }

    /** The programme the applicant was notified for (or recalled from). */
    private static function chosenProgramme(int $batchId): string
    {
        return (string) Database::value(
            "SELECT p.name FROM applications ap
               JOIN intake_programmes ip ON ip.id = ap.intake_programme_id
               JOIN programmes p ON p.id = ip.programme_id
              WHERE ap.application_batch_id = ? AND ap.deleted_at IS NULL
              ORDER BY ap.application_status IN ('notified', 'recalled', 'approved') DESC, ap.choice
              LIMIT 1",
            [$batchId]
        );
    }

    /** The last day of the notification window, e.g. "Thursday, 3 December 2026". */
    private static function deadline(string $notifiedAt): string
    {
        $days = ApplicationBatchService::NOTIFICATION_DEADLINE_DAYS;
        return date('l, j F Y', strtotime(substr($notifiedAt, 0, 10) . " +$days days"));
    }

    private static function name(array $r): string
    {
        return trim(preg_replace('/\s+/', ' ', $r['first_name'] . ' ' . ($r['middle_name'] ?? '') . ' ' . $r['last_name']));
    }
}
