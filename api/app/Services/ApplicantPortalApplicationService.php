<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Format;
use App\Core\HttpException;
use App\Repositories\AdmissionRepository;
use App\Repositories\ApplicantRepository;
use App\Repositories\ApplicationRepository;
use App\Repositories\IntakeRepository;
use App\Repositories\LetterRepository;
use App\Repositories\PaymentRepository;
use App\Repositories\UniformMeasurementRepository;
use App\Services\Pdf\LetterPdf;
use App\Services\Pdf\UniformPdf;

/**
 * The applicant's applications on the portal: apply, follow progress, get
 * letters/documents, pay history and uniform measurements. Applications are
 * permanent (no withdraw or edit). Same rules as the Go portal service.
 */
final class ApplicantPortalApplicationService
{
    private ApplicationRepository $applications;
    private IntakeRepository $intakes;
    private AdmissionRepository $admissions;
    private LetterRepository $letters;
    private UniformMeasurementRepository $uniforms;

    public function __construct()
    {
        $this->applications = new ApplicationRepository();
        $this->intakes = new IntakeRepository();
        $this->admissions = new AdmissionRepository();
        $this->letters = new LetterRepository();
        $this->uniforms = new UniformMeasurementRepository();
    }

    /**
     * Active intakes with their open training levels (and fees) and the open
     * programmes under each. Levels with no open programme, and intakes with
     * no open level, are left out.
     */
    public function applyOptions(int $applicantId): array
    {
        $appliedNumber = [];
        foreach ($this->applications->batchesForApplicant($applicantId) as $batch) {
            $appliedNumber[(int) $batch['intake_id']] = $batch['application_number'];
        }

        $options = [];
        foreach ($this->intakes->active(100) as $intake) {
            $programmesByLevel = [];
            foreach ($this->intakes->programmes((int) $intake['id']) as $ip) {
                if (!(int) $ip['is_active']) {
                    continue;
                }
                $programmesByLevel[(int) $ip['training_level_id']][] = [
                    'intake_programme_id' => (int) $ip['id'],
                    'programme_name'      => $ip['programme_name'],
                    'programme_code'      => $ip['programme_code'],
                ];
            }
            $levels = [];
            foreach ($this->intakes->trainingLevels((int) $intake['id']) as $tier) {
                $programmes = $programmesByLevel[(int) $tier['training_level_id']] ?? [];
                if (!(int) $tier['is_active'] || !$programmes) {
                    continue;
                }
                $levels[] = [
                    'training_level_id'   => (int) $tier['training_level_id'],
                    'training_level_name' => $tier['training_level_name'],
                    'application_fee'     => Format::float($tier['application_fee']),
                    'programmes'          => $programmes,
                ];
            }
            if (!$levels) {
                continue;
            }
            $option = [
                'intake_id'       => (int) $intake['id'],
                'intake_name'     => IntakeRepository::name($intake),
                'already_applied' => isset($appliedNumber[(int) $intake['id']]),
                'training_levels' => $levels,
            ];
            if (isset($appliedNumber[(int) $intake['id']])) {
                $option['application_number'] = $appliedNumber[(int) $intake['id']];
            }
            $options[] = $option;
        }
        return $options;
    }

    /** Applies for a course; needs a submitted profile and one application per intake. */
    public function apply(int $applicantId, array $req): array
    {
        $applicant = (new ApplicantRepository())->findById($applicantId);
        if ($applicant === null) {
            throw HttpException::badRequest('record not found');
        }
        if (!Format::bool($applicant['mark_complete'])) {
            throw HttpException::forbidden('please complete and submit your profile before applying');
        }
        $existing = $this->applications->batchForApplicantAndIntake($applicantId, (int) $req['intake_id']);
        if ($existing !== null) {
            throw HttpException::badRequest("you have already applied for this intake (application number {$existing['application_number']})");
        }
        $batchId = (new ApplicationBatchService())->create($applicantId, $req);
        return $this->myApplication($applicantId, $batchId);
    }

    public function myApplications(int $applicantId): array
    {
        return $this->buildResponses($this->applications->batchesForApplicant($applicantId));
    }

    /** One of the applicant's own applications; anyone else's is "not found". */
    public function myApplication(int $applicantId, int $batchId): array
    {
        $batch = $this->applications->findBatch($batchId);
        if ($batch === null || (int) $batch['applicant_id'] !== $applicantId) {
            throw HttpException::notFound('application not found');
        }
        return $this->buildResponses([$batch])[0];
    }

    /** Uploads (or replaces) the proof of payment for one of the applicant's own unpaid applications. */
    public function uploadPaymentProof(int $applicantId, int $batchId, ?array $file, string $transactionCode): array
    {
        $this->myApplication($applicantId, $batchId);
        (new PaymentProofService())->upload($batchId, $file, $transactionCode, null);
        return $this->myApplication($applicantId, $batchId);
    }

    /** Streams the applicant's own latest payment proof. */
    public function paymentProofFile(int $applicantId, int $batchId): never
    {
        $this->myApplication($applicantId, $batchId);
        (new PaymentProofService())->send($batchId);
    }

    /** A staff-uploaded document, if it's available (and not locked) for this application. */
    public function document(int $applicantId, int $batchId, int $documentId): array
    {
        $app = $this->myApplication($applicantId, $batchId);
        foreach ($app['documents'] as $doc) {
            if ($doc['id'] === $documentId) {
                $row = $this->letters->document($documentId);
                if ($row !== null) {
                    return $row;
                }
            }
        }
        throw HttpException::notFound('this letter is not available for your application');
    }

    /**
     * The applicant's provisional offer or admission letter as a PDF, dated
     * when they were notified / admitted so it reads the same every time.
     * @return array{0: string, 1: string} PDF bytes and file name
     */
    public function letterPdf(int $applicantId, int $batchId, string $type): array
    {
        $app = $this->myApplication($applicantId, $batchId);
        $notAvailable = HttpException::notFound('this letter is not available for your application');
        if (!in_array($type, array_column($app['letters'], 'type'), true)) {
            throw $notAvailable;
        }
        $batch = $this->applications->findBatch($batchId);
        $selected = ApplicationRepository::selectedApplication($batch, $this->applications->applicationsForBatches([$batchId]));
        $letter = $selected ? $this->letters->letterFor((int) $selected['intake_programme_id'], $type) : null;
        if ($letter === null || $letter['status'] !== 'active') {
            throw $notAvailable;
        }

        $date = $batch['updated_at'];
        $data = ['type' => $type, 'reference' => LetterPdf::reference($type, $batch['intake_month'], (int) $batch['intake_year'])];
        if ($type === 'admission') {
            if (!isset($app['admission'])) {
                throw $notAvailable;
            }
            $data['admission_number'] = $app['admission']['admission_number'];
            $date = $app['admission']['admitted_at'];
        } elseif ($batch['notified_at']) {
            $date = $batch['notified_at'];
        }
        $applicant = (new ApplicantRepository())->findById($applicantId);
        $pdf = LetterPdf::generate($data + [
            'date' => new \DateTime($date),
            'name' => ApplicantRepository::fullName($applicant),
            'body' => (string) $letter['body'],
        ]);
        $name = $type === 'admission' ? 'Admission-Letter' : 'Provisional-Offer-Letter';
        return [$pdf, "$name-{$batch['application_number']}.pdf"];
    }

    /** @return array{0: string, 1: string} the submitted uniform form as a PDF and its file name */
    public function uniformPdf(int $applicantId, int $batchId): array
    {
        [$admission, $applicant] = $this->admittedFor($applicantId, $batchId);
        $form = $this->uniforms->forAdmission((int) $admission['id']);
        if ($form === null) {
            throw HttpException::notFound('you have not submitted your uniform measurements yet');
        }
        return self::uniformPdfFor($admission, ApplicantRepository::fullName($applicant), $form);
    }

    /** Shared with the staff Uniform Measurements page. */
    public static function uniformPdfFor(array $admission, string $fullName, array $form): array
    {
        $pdf = UniformPdf::generate([
            'name'             => $fullName,
            'admission_number' => $admission['admission_number'],
            'class'            => $admission['programme_name'] . ' – ' . IntakeRepository::name($admission),
        ], $form);
        $safe = preg_replace('#[/\\\\:*?"<>| ]#', '-', (string) $admission['admission_number']);
        return [$pdf, "Uniform-Measurements-$safe.pdf"];
    }

    public function payments(int $applicantId): array
    {
        return array_map(function (array $p) {
            $payment = [
                'id'                 => (int) $p['id'],
                'application_number' => $p['application_number'],
                'intake_name'        => IntakeRepository::name($p),
                'transaction_code'   => $p['transaction_code'],
                'payment_method'     => $p['payment_method'],
                'amount'             => Format::float($p['amount']),
            ];
            if ($p['paid_at']) {
                $payment['paid_at'] = Format::dateTime($p['paid_at']);
            }
            return $payment;
        }, (new PaymentRepository())->forApplicant($applicantId));
    }

    // ── Uniform measurements ─────────────────────────────────────────────────

    /** The uniform form of an admitted application, with any saved values. */
    public function uniformForm(int $applicantId, int $batchId): array
    {
        [$admission, $applicant] = $this->admittedFor($applicantId, $batchId);
        $form = $this->uniforms->forAdmission((int) $admission['id']);
        $response = [
            'application_id'   => $batchId,
            'full_name'        => ApplicantRepository::fullName($applicant),
            'gender'           => $applicant['gender'],
            'admission_number' => $admission['admission_number'],
            'programme_name'   => $admission['programme_name'],
            'intake_name'      => IntakeRepository::name($admission),
            'allowed_sets'     => UniformSets::allowedFor((string) $applicant['gender']),
            'sets'             => UniformSets::all(),
            'editable'         => $form === null || $form['status'] === 'unlocked',
        ];
        if ($form !== null) {
            $response['measurement'] = UniformSets::response($form);
        }
        return $response;
    }

    /** Saves the measurements; a submitted form stays locked until staff unlock it. */
    public function submitUniform(int $applicantId, int $batchId, array $req): array
    {
        [$admission, $applicant] = $this->admittedFor($applicantId, $batchId);
        $form = $this->uniforms->forAdmission((int) $admission['id']);
        if ($form !== null && $form['status'] !== 'unlocked') {
            throw HttpException::forbidden('your uniform measurements have already been submitted. Please contact the admissions office to make changes');
        }
        $columns = UniformSets::submissionColumns($req, (string) $applicant['gender']);
        if ($form === null) {
            $this->uniforms->create($columns + ['admission_id' => (int) $admission['id'], 'applicant_id' => $applicantId]);
        } else {
            $this->uniforms->update((int) $form['id'], $columns);
        }
        return $this->uniformForm($applicantId, $batchId);
    }

    /**
     * The active admission of one of the applicant's approved applications.
     * @return array{0: array, 1: array} admission and applicant
     */
    public function admittedFor(int $applicantId, int $batchId): array
    {
        $batch = $this->applications->findBatch($batchId);
        if ($batch === null || (int) $batch['applicant_id'] !== $applicantId) {
            throw HttpException::notFound('application not found');
        }
        $notAvailable = HttpException::notFound('uniform measurements are only available once you have been admitted');
        if ($batch['decision_status'] !== 'approved') {
            throw $notAvailable;
        }
        $selected = ApplicationRepository::selectedApplication($batch, $this->applications->applicationsForBatches([$batchId]));
        $admissions = $selected ? $this->admissions->activeForApplications([(int) $selected['id']]) : [];
        if (!$admissions) {
            throw $notAvailable;
        }
        return [$admissions[0], (new ApplicantRepository())->findById($applicantId)];
    }

    // ── Response building ────────────────────────────────────────────────────

    /**
     * Portal responses for batches, fetching their programmes, fees,
     * admissions, letters, documents and uniform forms in one query each.
     */
    private function buildResponses(array $batches): array
    {
        if (!$batches) {
            return [];
        }
        $batchIds = array_map(fn ($b) => (int) $b['id'], $batches);
        $intakeIds = array_values(array_unique(array_map(fn ($b) => (int) $b['intake_id'], $batches)));

        $appsByBatch = [];
        $appIds = [];
        foreach ($this->applications->applicationsForBatches($batchIds) as $a) {
            $appsByBatch[(int) $a['application_batch_id']][] = $a;
            $appIds[] = (int) $a['id'];
        }

        // Inactive admissions are left out: the applicant then sees "Approved"
        // without an admission number.
        $admissionByApp = [];
        foreach ($this->admissions->activeForApplications($appIds) as $adm) {
            $admissionByApp[(int) $adm['application_id']] = $adm;
        }

        // The selected programme of each notified/approved batch decides which
        // letters and documents apply.
        $selectedByBatch = [];
        foreach ($batches as $b) {
            $sel = ApplicationRepository::selectedApplication($b, $appsByBatch[(int) $b['id']] ?? []);
            if ($sel !== null) {
                $selectedByBatch[(int) $b['id']] = $sel;
            }
        }
        $hasLetter = [];
        foreach ($this->letters->activeLettersFor(array_map(fn ($s) => (int) $s['intake_programme_id'], $selectedByBatch)) as $l) {
            $hasLetter[$l['intake_programme_id'] . ':' . $l['type']] = true;
        }
        $documents = $this->letters->activeDocumentsFor($intakeIds, array_map(fn ($s) => (int) $s['programme_id'], $selectedByBatch));

        $formStatus = [];
        foreach ($this->uniforms->forAdmissions(array_map(fn ($a) => (int) $a['id'], array_values($admissionByApp))) as $f) {
            $formStatus[(int) $f['admission_id']] = $f['status'];
        }

        $feeByKey = [];
        foreach ($this->intakes->trainingLevelsForIntakes($intakeIds) as $tier) {
            $feeByKey[$tier['intake_id'] . ':' . $tier['training_level_id']] = Format::float($tier['application_fee']);
        }

        $proofs = (new PaymentProofService())->latestFor($batchIds, false);

        $responses = [];
        foreach ($batches as $b) {
            $id = (int) $b['id'];
            $admission = null;
            $programmes = [];
            foreach ($appsByBatch[$id] ?? [] as $a) {
                if ($b['decision_status'] === 'approved' && $admission === null) {
                    $admission = $admissionByApp[(int) $a['id']] ?? null;
                }
                $programmes[] = [
                    'programme_name'     => $a['programme_name'],
                    'programme_code'     => $a['programme_code'],
                    'application_status' => $a['application_status'],
                    'choice'             => (int) $a['choice'],
                ];
            }

            $response = [
                'id'                  => $id,
                'application_number'  => $b['application_number'],
                'intake_name'         => IntakeRepository::name($b),
                'training_level_name' => $b['training_level_name'],
                'residence'           => $b['residence'],
                'application_fee'     => $feeByKey[$b['intake_id'] . ':' . $b['training_level_id']] ?? 0.0,
                'payment_status'      => $b['payment_status'],
                'decision_status'     => $b['decision_status'],
            ];
            if (isset($proofs[$id])) {
                $response['payment_proof'] = $proofs[$id];
            }
            if ($b['notified_at']) {
                $response['notified_at'] = Format::dateTime($b['notified_at']);
                // The whole of the last day counts (same as the recall job).
                $response['respond_by'] = date('Y-m-d', strtotime(substr($b['notified_at'], 0, 10) . ' +' . ApplicationBatchService::NOTIFICATION_DEADLINE_DAYS . ' days'));
                if ($b['decision_status'] === 'notified') {
                    $response['days_remaining'] = ApplicationBatchService::daysRemaining($b['notified_at']);
                }
            }
            if ($admission !== null) {
                $response['admission'] = [
                    'admission_number' => $admission['admission_number'],
                    'programme_name'   => $admission['programme_name'],
                    'programme_code'   => $admission['programme_code'],
                    'intake_name'      => IntakeRepository::name($admission),
                    'admitted_at'      => Format::dateTime($admission['admitted_at']),
                ];
            }

            // Once admitted, documents stay locked until the uniform form is
            // submitted; letters stay available.
            $uniformStatus = '';
            $lockedDocuments = 0;
            if ($b['decision_status'] === 'approved' && $admission !== null) {
                $uniformStatus = $formStatus[(int) $admission['id']] ?? 'pending';
            }

            $letters = [];
            $docs = [];
            if (isset($selectedByBatch[$id])) {
                $sel = $selectedByBatch[$id];
                $admitted = $b['decision_status'] === 'approved' && $admission !== null;
                if (isset($hasLetter[$sel['intake_programme_id'] . ':provisional'])) {
                    $letters[] = ['type' => 'provisional', 'title' => 'Provisional Offer Letter'];
                }
                if ($admitted && isset($hasLetter[$sel['intake_programme_id'] . ':admission'])) {
                    $letters[] = ['type' => 'admission', 'title' => 'Admission Letter'];
                }
                foreach ($documents as $d) {
                    if ((int) $d['intake_id'] !== (int) $b['intake_id'] || (int) $d['programme_id'] !== (int) $sel['programme_id']) {
                        continue;
                    }
                    if ($d['type'] === 'admission' && !$admitted) {
                        continue;
                    }
                    if ($uniformStatus === 'pending') {
                        $lockedDocuments++;
                        continue;
                    }
                    $docs[] = [
                        'id'            => (int) $d['id'],
                        'document_name' => $d['document_name'],
                        'type'          => $d['type'],
                        'file_name'     => $d['file_name'],
                        'mime_type'     => $d['mime_type'],
                    ];
                }
            }

            $response['letters'] = $letters;
            $response['documents'] = $docs;
            $response['locked_documents'] = $lockedDocuments;
            if ($uniformStatus !== '') {
                $response['uniform_status'] = $uniformStatus;
            }
            $response['programmes'] = $programmes;
            $response['created_at'] = Format::dateTime($b['created_at']);
            $responses[] = $response;
        }
        return $responses;
    }
}
