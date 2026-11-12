<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Pagination;
use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\AcademicSetupService;

/** /faculties, /departments, /training-levels, /programmes */
final class AcademicSetupHandler
{
    private AcademicSetupService $setup;

    private const SORT = ['name' => 'name', 'code' => 'code', 'created_at' => 'created_at', 'updated_at' => 'updated_at', 'is_active' => 'is_active'];

    public function __construct()
    {
        $this->setup = new AcademicSetupService();
    }

    /** ORDER BY for table alias $a (default: newest first, as in Go). */
    private function order(Request $r, string $a, array $extra = []): string
    {
        $allowed = [];
        foreach (self::SORT + $extra as $key => $column) {
            $allowed[$key] = "$a.$column";
        }
        return Query::orderBy($r, $allowed, "$a.created_at DESC, $a.id DESC");
    }

    // ── Faculties ────────────────────────────────────────────────────────────

    public function listFaculties(Request $r): never
    {
        $result = $this->setup->listFaculties(new Pagination($r), Query::bool($r, 'is_active'), $this->order($r, 'f'));
        Response::success('Faculties retrieved successfully', $result);
    }

    public function getFaculty(Request $r): never
    {
        Response::success('Faculty retrieved successfully', $this->setup->getFaculty($r->intParam('id', 'faculty ID')));
    }

    public function createFaculty(Request $r): never
    {
        $req = Validator::validate($r->json(), [
            'name' => 'required|string|min:3|max:100', 'code' => 'required|string|min:2|max:20',
            'description' => 'string|max:500', 'is_active' => 'bool',
        ]);
        Response::created('Faculty created successfully', $this->setup->createFaculty($req));
    }

    public function updateFaculty(Request $r): never
    {
        $id = $r->intParam('id', 'faculty ID');
        $req = Validator::validate($r->json(), [
            'name' => 'string|min:3|max:100', 'code' => 'string|min:2|max:20',
            'description' => 'string|max:500', 'is_active' => 'bool',
        ]);
        Response::success('Faculty updated successfully', $this->setup->updateFaculty($id, $req));
    }

    public function deleteFaculty(Request $r): never
    {
        $this->setup->deleteFaculty($r->intParam('id', 'faculty ID'));
        Response::success('Faculty deleted successfully');
    }

    // ── Departments ──────────────────────────────────────────────────────────

    public function listDepartments(Request $r): never
    {
        $result = $this->setup->listDepartments(
            new Pagination($r), Query::int($r, 'faculty_id'), Query::bool($r, 'is_active'), $this->order($r, 'd')
        );
        Response::success('Departments retrieved successfully', $result);
    }

    public function getDepartment(Request $r): never
    {
        Response::success('Department retrieved successfully', $this->setup->getDepartment($r->intParam('id', 'department ID')));
    }

    public function createDepartment(Request $r): never
    {
        $req = Validator::validate($r->json(), [
            'faculty_id' => 'required|int|min:1', 'name' => 'required|string|min:3|max:100',
            'code' => 'required|string|min:2|max:20', 'description' => 'string|max:500', 'is_active' => 'bool',
        ]);
        Response::created('Department created successfully', $this->setup->createDepartment($req));
    }

    public function updateDepartment(Request $r): never
    {
        $id = $r->intParam('id', 'department ID');
        $req = Validator::validate($r->json(), [
            'faculty_id' => 'int|min:1', 'name' => 'string|min:3|max:100', 'code' => 'string|min:2|max:20',
            'description' => 'string|max:500', 'is_active' => 'bool',
        ]);
        Response::success('Department updated successfully', $this->setup->updateDepartment($id, $req));
    }

    public function deleteDepartment(Request $r): never
    {
        $this->setup->deleteDepartment($r->intParam('id', 'department ID'));
        Response::success('Department deleted successfully');
    }

    // ── Training levels ──────────────────────────────────────────────────────

    public function listTrainingLevels(Request $r): never
    {
        // Sorted by display order first (as in Go), unless asked otherwise.
        $order = Query::orderBy($r, [
            'order' => 't.`order`', 'name' => 't.name', 'code' => 't.code',
            'created_at' => 't.created_at', 'updated_at' => 't.updated_at', 'is_active' => 't.is_active',
        ], 't.`order` ASC, t.created_at DESC');
        $result = $this->setup->listTrainingLevels(new Pagination($r), Query::bool($r, 'is_active'), $order);
        Response::success('Training levels retrieved successfully', $result);
    }

    public function getTrainingLevel(Request $r): never
    {
        Response::success('Training level retrieved successfully', $this->setup->getTrainingLevel($r->intParam('id', 'training level ID')));
    }

    public function createTrainingLevel(Request $r): never
    {
        $req = Validator::validate($r->json(), [
            'name' => 'required|string|min:3|max:100', 'code' => 'required|string|min:2|max:20',
            'description' => 'string|max:500', 'order' => 'int|min:0', 'is_active' => 'bool',
        ]);
        Response::created('Training level created successfully', $this->setup->createTrainingLevel($req));
    }

    public function updateTrainingLevel(Request $r): never
    {
        $id = $r->intParam('id', 'training level ID');
        $req = Validator::validate($r->json(), [
            'name' => 'string|min:3|max:100', 'code' => 'string|min:2|max:20',
            'description' => 'string|max:500', 'order' => 'int|min:0', 'is_active' => 'bool',
        ]);
        Response::success('Training level updated successfully', $this->setup->updateTrainingLevel($id, $req));
    }

    public function deleteTrainingLevel(Request $r): never
    {
        $this->setup->deleteTrainingLevel($r->intParam('id', 'training level ID'));
        Response::success('Training level deleted successfully');
    }

    // ── Programmes ───────────────────────────────────────────────────────────

    public function listProgrammes(Request $r): never
    {
        $filters = [
            'department_id'     => Query::int($r, 'department_id'),
            'training_level_id' => Query::int($r, 'training_level_id'),
            'faculty_id'        => Query::int($r, 'faculty_id'),
            'is_active'         => Query::bool($r, 'is_active'),
        ];
        $order = $this->order($r, 'p', ['duration_years' => 'duration_years']);
        Response::success('Programmes retrieved successfully', $this->setup->listProgrammes(new Pagination($r), $filters, $order));
    }

    public function getProgramme(Request $r): never
    {
        Response::success('Programme retrieved successfully', $this->setup->getProgramme($r->intParam('id', 'programme ID')));
    }

    public function createProgramme(Request $r): never
    {
        $req = Validator::validate($r->json(), [
            'department_id' => 'required|int|min:1', 'training_level_id' => 'required|int|min:1',
            'name' => 'required|string|min:3|max:200', 'code' => 'required|string|min:2|max:20',
            'description' => 'string|max:500', 'duration_years' => 'required|int|min:1|max:10',
            'duration_months' => 'int|min:0|max:11', 'is_active' => 'bool',
        ]);
        Response::created('Programme created successfully', $this->setup->createProgramme($req));
    }

    public function updateProgramme(Request $r): never
    {
        $id = $r->intParam('id', 'programme ID');
        $req = Validator::validate($r->json(), [
            'department_id' => 'int|min:1', 'training_level_id' => 'int|min:1',
            'name' => 'string|min:3|max:200', 'code' => 'string|min:2|max:20', 'description' => 'string|max:500',
            'duration_years' => 'int|min:1|max:10', 'duration_months' => 'int|min:0|max:11', 'is_active' => 'bool',
        ]);
        Response::success('Programme updated successfully', $this->setup->updateProgramme($id, $req));
    }

    public function deleteProgramme(Request $r): never
    {
        $this->setup->deleteProgramme($r->intParam('id', 'programme ID'));
        Response::success('Programme deleted successfully');
    }
}
