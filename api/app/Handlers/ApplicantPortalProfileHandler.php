<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\ApplicantFileService;
use App\Services\ApplicantPortalProfileService;

/** /applicant-portal/profile... — the applicant's own profile and documents. */
final class ApplicantPortalProfileHandler
{
    private ApplicantPortalProfileService $profile;

    public function __construct()
    {
        $this->profile = new ApplicantPortalProfileService();
    }

    public function get(Request $request): never
    {
        try {
            $profile = $this->profile->get($request->applicantId);
        } catch (HttpException $e) {
            throw HttpException::notFound($e->getMessage());
        }
        Response::success('Profile retrieved successfully', $profile);
    }

    public function update(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'first_name'   => 'string|min:2|max:100',
            'middle_name'  => 'string|max:100',
            'last_name'    => 'string|min:2|max:100',
            'phone_number' => 'string|max:20',
            'id_number'    => 'string|max:50',
            'date_of_birth' => 'string|date',
            'gender'       => 'string|oneof:Male,Female,Other',
            'county'       => 'string|max:100',
            'sub_county'   => 'string|max:100',
            'denomination' => 'string|max:100',
            'has_disability' => 'bool',
            'disability_details' => 'string|max:255',
            'guardian_name'    => 'string|max:200',
            'relationship'     => 'string|max:50',
            'guardian_contact' => 'string|max:20',
            'sponsor_name'     => 'string|max:200',
            'sponsor_contact'  => 'string|max:20',
            'secondary_school' => 'string|max:200',
            'index_number'     => 'string|max:50',
            'kcse_year'        => 'int|min:1990|max:2100',
            'aggregate'        => 'string|max:10',
            'english_grade'    => 'string|max:20',
            'kiswahili_grade'  => 'string|max:20',
            'biology_grade'    => 'string|max:20',
            'maths_grade'      => 'string|max:20',
            'chemistry_grade'  => 'string|max:20',
            'physics_grade'    => 'string|max:20',
            'college_grade'    => 'string|max:50',
            'graduation_year'  => 'int',
            'current_step'     => 'int|min:0',
        ]);
        Response::success('Profile saved successfully', $this->profile->update($request->applicantId, $req));
    }

    public function submit(Request $request): never
    {
        Response::success('Profile submitted successfully', $this->profile->submit($request->applicantId));
    }

    /** Documents stay editable after the profile is submitted. */
    public function uploadDocument(Request $request): never
    {
        $type = (string) ($request->params['type'] ?? '');
        $result = (new ApplicantFileService())->upload($request->applicantId, $type, $request->file('file'));
        Response::success("$type uploaded successfully", $result);
    }

    public function getDocument(Request $request): never
    {
        (new ApplicantFileService())->send($request->applicantId, (string) ($request->params['type'] ?? ''));
    }
}
