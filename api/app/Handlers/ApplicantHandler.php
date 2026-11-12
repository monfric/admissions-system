<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Pagination;
use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\ApplicantFileService;
use App\Services\ApplicantService;

/** /applicants and /applicants/documents (staff New Applicants page). */
final class ApplicantHandler
{
    private ApplicantService $applicants;

    private const GRADE_RULES = [
        'english_grade' => 'max:20', 'kiswahili_grade' => 'max:20', 'biology_grade' => 'max:20',
        'maths_grade' => 'max:20', 'chemistry_grade' => 'max:20', 'physics_grade' => 'max:20',
    ];

    public function __construct()
    {
        $this->applicants = new ApplicantService();
    }

    public function list(Request $r): never
    {
        $filters = [
            'gender'           => (string) $r->query('gender', ''),
            'county'           => (string) $r->query('county', ''),
            'has_disability'   => Query::bool($r, 'has_disability'),
            'is_active'        => Query::bool($r, 'is_active'),
            'profile_complete' => Query::bool($r, 'profile_complete'),
            'has_applied'      => Query::bool($r, 'has_applied'),
            'intake_id'        => Query::int($r, 'intake_id'),
            'registered'       => Query::oneOf($r, 'registered', ['today', 'week', 'month', '30days']),
        ];
        $order = Query::orderBy($r, [
            'first_name' => 'first_name', 'last_name' => 'last_name', 'email' => 'email',
            'created_at' => 'created_at', 'updated_at' => 'updated_at',
        ], 'created_at DESC, id DESC');
        Response::success('Applicants retrieved successfully', $this->applicants->list(new Pagination($r), $filters, $order));
    }

    public function stats(Request $r): never
    {
        Response::success('Applicant statistics retrieved successfully', $this->applicants->stats());
    }

    public function show(Request $r): never
    {
        Response::success('Applicant retrieved successfully', $this->applicants->get($r->intParam('id', 'applicant ID')));
    }

    public function create(Request $r): never
    {
        $rules = [
            'email' => 'required|string|email', 'password' => 'required|string|min:6',
            'first_name' => 'required|string|min:2|max:100', 'middle_name' => 'string|max:100',
            'last_name' => 'required|string|min:2|max:100', 'phone_number' => 'required|string',
            'id_number' => 'required|string', 'date_of_birth' => 'required|string|date',
            'gender' => 'required|string|oneof:Male,Female,Other',
            'county' => 'string|max:100', 'sub_county' => 'string|max:100', 'denomination' => 'string|max:100',
            'has_disability' => 'bool', 'disability_details' => 'string|max:255',
            'guardian_name' => 'required|string|max:200', 'relationship' => 'required|string|max:50',
            'guardian_contact' => 'required|string', 'sponsor_name' => 'string|max:200', 'sponsor_contact' => 'string|max:20',
            'secondary_school' => 'required|string|max:200', 'index_number' => 'required|string|max:50',
            'kcse_year' => 'required|int|min:1990|max:2030', 'aggregate' => 'required|string|max:10',
            'college_grade' => 'string|max:50', 'graduation_year' => 'int', 'mark_complete' => 'bool', 'is_active' => 'bool',
        ];
        foreach (self::GRADE_RULES as $field => $rule) {
            $rules[$field] = "required|string|$rule";
        }
        $req = Validator::validate($r->json(), $rules);
        Response::created('Applicant registered successfully', $this->applicants->create($req));
    }

    public function update(Request $r): never
    {
        $id = $r->intParam('id', 'applicant ID');
        $rules = [
            'email' => 'string|email', 'first_name' => 'string|min:2|max:100', 'middle_name' => 'string|max:100',
            'last_name' => 'string|min:2|max:100', 'phone_number' => 'string', 'id_number' => 'string',
            'date_of_birth' => 'string|date', 'gender' => 'string|oneof:Male,Female,Other',
            'county' => 'string|max:100', 'sub_county' => 'string|max:100', 'denomination' => 'string|max:100',
            'has_disability' => 'bool', 'disability_details' => 'string|max:255',
            'guardian_name' => 'string|max:200', 'relationship' => 'string|max:50', 'guardian_contact' => 'string',
            'sponsor_name' => 'string|max:200', 'sponsor_contact' => 'string|max:20',
            'secondary_school' => 'string|max:200', 'index_number' => 'string|max:50',
            'kcse_year' => 'int|min:1990|max:2030', 'aggregate' => 'string|max:10',
            'college_grade' => 'string|max:50', 'graduation_year' => 'int', 'mark_complete' => 'bool', 'is_active' => 'bool',
        ];
        foreach (self::GRADE_RULES as $field => $rule) {
            $rules[$field] = "string|$rule";
        }
        $req = Validator::validate($r->json(), $rules);
        Response::success('Applicant updated successfully', $this->applicants->update($id, $req));
    }

    public function delete(Request $r): never
    {
        $this->applicants->delete($r->intParam('id', 'applicant ID'));
        Response::success('Applicant deleted successfully');
    }

    // ── Files ────────────────────────────────────────────────────────────────

    /** POST /applicants/documents/:id/upload — multipart "file" + "file_type". */
    public function upload(Request $r): never
    {
        $id = $r->intParam('id', 'applicant ID');
        $type = (string) $r->form('file_type', '');
        $result = (new ApplicantFileService())->upload($id, $type, $r->file('file'));
        Response::success("$type uploaded successfully", $result);
    }

    public function file(Request $r): never
    {
        (new ApplicantFileService())->send($r->intParam('id', 'applicant ID'), (string) ($r->params['type'] ?? ''));
    }

    public function deleteFile(Request $r): never
    {
        $type = (string) ($r->params['type'] ?? '');
        (new ApplicantFileService())->delete($r->intParam('id', 'applicant ID'), $type);
        Response::success("$type deleted successfully");
    }
}
