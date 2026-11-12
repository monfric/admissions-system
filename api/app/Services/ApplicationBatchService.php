<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\HttpException;
use App\Repositories\ApplicantRepository;
use App\Repositories\ApplicationRepository;
use App\Repositories\IntakeRepository;

/**
 * Creating applications (portal Apply and, later, staff Assign Application).
 * One application batch per applicant per intake; the fee is charged once
 * per batch; at most a 1st and a 2nd choice under the same training level.
 */
final class ApplicationBatchService
{
    public const RESIDENCE_OPTIONS = ['Boarder', 'Day Scholar'];
    /** Days a notified applicant has to be approved before the offer is recalled. */
    public const NOTIFICATION_DEADLINE_DAYS = 30;

    private ApplicationRepository $applications;
    private IntakeRepository $intakes;
    private ApplicantRepository $applicants;

    public function __construct()
    {
        $this->applications = new ApplicationRepository();
        $this->intakes = new IntakeRepository();
        $this->applicants = new ApplicantRepository();
    }

    /** Creates the batch and its programme applications; returns the new batch id. */
    public function create(int $applicantId, array $req): int
    {
        if ($this->applicants->findById($applicantId) === null) {
            throw HttpException::badRequest('applicant not found');
        }
        $intakeId = (int) $req['intake_id'];
        $trainingLevelId = (int) $req['training_level_id'];

        $intake = $this->intakes->findById($intakeId);
        if ($intake === null) {
            throw HttpException::badRequest('intake not found');
        }
        if (!(int) $intake['is_active']) {
            throw HttpException::badRequest('this intake is not currently active');
        }
        $feeTier = $this->intakes->trainingLevelFor($intakeId, $trainingLevelId);
        if ($feeTier === null || !(int) $feeTier['is_active']) {
            throw HttpException::badRequest('this training level is not open for applications on the selected intake');
        }
        if ($this->applications->batchForApplicantAndIntake($applicantId, $intakeId) !== null) {
            throw HttpException::badRequest('this applicant already has an application for the selected intake');
        }
        if (!in_array($req['residence'], self::RESIDENCE_OPTIONS, true)) {
            throw HttpException::badRequest('choose a mode of residence: Boarder or Day Scholar');
        }

        $ids = array_map('intval', $req['intake_programme_ids']);
        if (count($ids) > 2) {
            throw HttpException::badRequest('choose at most two programmes: a 1st and a 2nd choice');
        }
        if (count($ids) === 2 && $ids[0] === $ids[1]) {
            throw HttpException::badRequest('your 1st and 2nd choice must be different programmes');
        }
        $intakeProgrammes = [];
        foreach ($ids as $id) {
            $ip = $this->intakes->intakeProgramme($id);
            if ($ip === null) {
                throw HttpException::badRequest("programme selection $id not found");
            }
            if ((int) $ip['intake_id'] !== $intakeId) {
                throw HttpException::badRequest('a selected programme does not belong to the chosen intake');
            }
            if ((int) $ip['training_level_id'] !== $trainingLevelId) {
                throw HttpException::badRequest("{$ip['programme_name']} is not offered under the selected training level");
            }
            if (!(int) $ip['is_active']) {
                throw HttpException::badRequest("{$ip['programme_name']} is not currently open for applications");
            }
            $intakeProgrammes[] = $ip;
        }
        if (!$intakeProgrammes) {
            throw HttpException::badRequest('select at least one programme');
        }

        $batchId = Database::transaction(function () use ($applicantId, $intakeId, $trainingLevelId, $req, $intakeProgrammes): int {
            $batchId = $this->applications->createBatch([
                'applicant_id'       => $applicantId,
                'intake_id'          => $intakeId,
                'training_level_id'  => $trainingLevelId,
                'application_number' => $this->uniqueApplicationNumber(),
                'residence'          => $req['residence'],
                'payment_status'     => 'unpaid',
                'decision_status'    => 'pending',
            ]);
            foreach ($intakeProgrammes as $i => $ip) {
                $this->applications->createApplication([
                    'application_batch_id' => $batchId,
                    'intake_programme_id'  => (int) $ip['id'],
                    'application_status'   => 'pending',
                    'choice'               => $i + 1,
                ]);
            }
            return $batchId;
        });
        Notifications::applicationSubmitted($batchId);
        return $batchId;
    }

    /** A random 6-digit number not used by another application (checked in code, as in Go). */
    private function uniqueApplicationNumber(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $code = sprintf('%06d', random_int(0, 999999));
            if (!$this->applications->numberExists($code)) {
                return $code;
            }
        }
        throw HttpException::badRequest('failed to generate a unique application number, please try again');
    }

    /**
     * Whole calendar days left in the notification window: 0 is the last day,
     * negative means it has passed (same rule as the staff Notified page).
     */
    public static function daysRemaining(string $notifiedAt, ?int $now = null): int
    {
        $tz = new \DateTimeZone(date_default_timezone_get());
        $notifiedDay = new \DateTime(substr($notifiedAt, 0, 10), $tz);
        $today = new \DateTime(date('Y-m-d', $now ?? time()), $tz);
        $elapsed = (int) round(($today->getTimestamp() - $notifiedDay->getTimestamp()) / 86400);
        return self::NOTIFICATION_DEADLINE_DAYS - $elapsed;
    }
}
