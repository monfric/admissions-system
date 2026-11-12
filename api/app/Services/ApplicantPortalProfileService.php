<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Format;
use App\Core\HttpException;
use App\Repositories\ApplicantDocumentRepository;
use App\Repositories\ApplicantRepository;

/**
 * The applicant's own profile on the portal: a 6-step wizard that can only
 * move forward once earlier steps are complete. Once submitted, only
 * documents can change.
 */
final class ApplicantPortalProfileService
{
    private const STEP_PERSONAL = 0;
    private const STEP_LOCATION = 1;
    private const STEP_GUARDIAN = 2;
    private const STEP_EDUCATION = 3;
    private const STEP_DOCUMENTS = 4;
    private const STEP_REVIEW = 5;

    /** Required before the profile can be submitted. */
    private const REQUIRED_DOCUMENTS = [
        'profile'          => 'Profile photo',
        'id_card'          => 'ID card',
        'kcse_certificate' => 'KCSE results certificate',
    ];

    private ApplicantService $applicantService;
    private ApplicantRepository $applicants;
    private ApplicantDocumentRepository $documents;

    public function __construct()
    {
        $this->applicantService = new ApplicantService();
        $this->applicants = new ApplicantRepository();
        $this->documents = new ApplicantDocumentRepository();
    }

    public function get(int $applicantId): array
    {
        return $this->applicantService->get($applicantId);
    }

    /** Saves profile fields while the profile is a draft, then moves to current_step if given. */
    public function update(int $applicantId, array $req): array
    {
        $applicant = $this->applicantService->find($applicantId);
        if (Format::bool($applicant['mark_complete'])) {
            throw HttpException::forbidden('your profile has been submitted and can no longer be edited. You can still update your documents');
        }

        $idNumber = trim((string) ($req['id_number'] ?? ''));
        if ($idNumber !== '' && $idNumber !== $applicant['id_number'] && $this->applicants->findByIdNumber($idNumber) !== null) {
            throw HttpException::badRequest('an account with this ID number already exists');
        }

        $trim = fn (string $key) => isset($req[$key]) ? trim((string) $req[$key]) : null;
        $fields = [
            'first_name' => $trim('first_name'), 'middle_name' => $trim('middle_name'), 'last_name' => $trim('last_name'),
            'phone_number' => $trim('phone_number'), 'id_number' => $idNumber,
            'date_of_birth' => $req['date_of_birth'] ?? null, 'gender' => $req['gender'] ?? null,
            'county' => $req['county'] ?? null, 'sub_county' => $trim('sub_county'),
            'denomination' => $trim('denomination'),
            'has_disability' => $req['has_disability'] ?? null, 'disability_details' => $req['disability_details'] ?? null,
            'guardian_name' => $trim('guardian_name'), 'relationship' => $req['relationship'] ?? null,
            'guardian_contact' => $trim('guardian_contact'),
            'sponsor_name' => $trim('sponsor_name'), 'sponsor_contact' => $trim('sponsor_contact'),
            'secondary_school' => $trim('secondary_school'), 'index_number' => $trim('index_number'),
            'kcse_year' => $req['kcse_year'] ?? null, 'aggregate' => $trim('aggregate'),
            'english_grade' => $req['english_grade'] ?? null, 'kiswahili_grade' => $req['kiswahili_grade'] ?? null,
            'biology_grade' => $req['biology_grade'] ?? null, 'maths_grade' => $req['maths_grade'] ?? null,
            'chemistry_grade' => $req['chemistry_grade'] ?? null, 'physics_grade' => $req['physics_grade'] ?? null,
            'college_grade' => $trim('college_grade'), 'graduation_year' => $req['graduation_year'] ?? null,
        ];
        $result = $this->applicantService->update($applicantId, array_filter($fields, fn ($v) => $v !== null));

        if (!isset($req['current_step'])) {
            return $result;
        }
        return $this->moveToStep($applicantId, (int) $req['current_step']);
    }

    /** Records the step the applicant is on; moving forward needs every earlier step complete. */
    private function moveToStep(int $applicantId, int $step): array
    {
        $step = min($step, self::STEP_REVIEW);
        $applicant = $this->applicantService->find($applicantId);
        for ($i = 0; $i < $step; $i++) {
            $missing = $this->missingForStep($applicant, $i);
            if ($missing) {
                throw HttpException::badRequest('please complete the following before continuing: ' . implode(', ', $missing));
            }
        }
        if ((int) $applicant['profile_step'] !== $step) {
            $this->applicants->update($applicantId, ['profile_step' => $step]);
        }
        return $this->applicantService->get($applicantId);
    }

    /** Checks every step, then marks the profile complete (locking it, documents excepted). */
    public function submit(int $applicantId): array
    {
        $applicant = $this->applicantService->find($applicantId);
        if (Format::bool($applicant['mark_complete'])) {
            return $this->applicantService->get($applicantId);
        }
        $missing = [];
        for ($step = self::STEP_PERSONAL; $step < self::STEP_REVIEW; $step++) {
            array_push($missing, ...$this->missingForStep($applicant, $step));
        }
        if ($missing) {
            throw HttpException::badRequest('please complete the following before submitting: ' . implode(', ', $missing));
        }
        $profile = $this->applicantService->update($applicantId, ['mark_complete' => true]);
        Notifications::profileSubmitted($applicantId);
        return $profile;
    }

    /** What is still missing for one wizard step. */
    private function missingForStep(array $a, int $step): array
    {
        $missing = [];
        $require = function (string $field, string $label) use ($a, &$missing): void {
            if (trim((string) $a[$field]) === '') {
                $missing[] = $label;
            }
        };

        switch ($step) {
            case self::STEP_PERSONAL:
                $require('first_name', 'first name');
                $require('last_name', 'last name');
                $require('phone_number', 'phone number');
                $require('id_number', 'ID number');
                if (empty($a['date_of_birth'])) {
                    $missing[] = 'date of birth';
                }
                $require('gender', 'gender');
                break;
            case self::STEP_LOCATION:
                $require('county', 'county');
                $require('sub_county', 'sub-county');
                $require('denomination', 'denomination');
                if (Format::bool($a['has_disability'])) {
                    $require('disability_details', 'disability details');
                }
                break;
            case self::STEP_GUARDIAN:
                $require('guardian_name', 'guardian name');
                $require('relationship', 'guardian relationship');
                $require('guardian_contact', 'guardian contact');
                break;
            case self::STEP_EDUCATION:
                $require('secondary_school', 'secondary school');
                $require('index_number', 'KCSE index number');
                if ((int) $a['kcse_year'] === 0) {
                    $missing[] = 'KCSE year';
                }
                $require('aggregate', 'KCSE aggregate');
                $require('english_grade', 'English grade');
                $require('kiswahili_grade', 'Kiswahili grade');
                $require('biology_grade', 'Biology grade');
                $require('maths_grade', 'Mathematics grade');
                $require('chemistry_grade', 'Chemistry grade');
                $require('physics_grade', 'Physics grade');
                break;
            case self::STEP_DOCUMENTS:
                foreach (self::REQUIRED_DOCUMENTS as $type => $label) {
                    $present = $type === 'profile'
                        ? (string) $a['profile_photo'] !== ''
                        : $this->documents->findByType((int) $a['id'], $type) !== null;
                    if (!$present) {
                        $missing[] = $label;
                    }
                }
                break;
        }
        return $missing;
    }
}
