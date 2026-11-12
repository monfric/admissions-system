<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Pagination;
use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\IntakeService;

/** /intakes, /intakes/:id/programmes|training-levels, /intake-programmes, /intake-training-levels */
final class IntakeHandler
{
    private IntakeService $intakes;

    public function __construct()
    {
        $this->intakes = new IntakeService();
    }

    public function list(Request $r): never
    {
        $filters = [
            'intake_year' => Query::int($r, 'intake_year'),
            'intake_id'   => Query::int($r, 'intake_id'),
            'is_active'   => Query::bool($r, 'is_active'),
        ];
        $order = Query::orderBy($r, [
            'intake_year' => 'intake_year', 'intake_month' => 'intake_month', 'is_active' => 'is_active',
            'created_at' => 'created_at', 'updated_at' => 'updated_at',
        ], 'created_at DESC, id DESC');
        Response::success('Intakes retrieved successfully', $this->intakes->list(new Pagination($r), $filters, $order));
    }

    public function stats(Request $r): never
    {
        Response::success('Intake statistics retrieved successfully', $this->intakes->stats());
    }

    public function show(Request $r): never
    {
        Response::success('Intake retrieved successfully', $this->intakes->get($r->intParam('id', 'intake ID')));
    }

    public function create(Request $r): never
    {
        $req = Validator::validate($r->json(), [
            'intake_month' => 'required|string|oneof:' . implode(',', IntakeService::MONTHS),
            'intake_year'  => 'required|int|min:2000|max:2100',
            'is_active'    => 'bool',
        ]);
        Response::created('Intake created successfully', $this->intakes->create($req));
    }

    public function update(Request $r): never
    {
        $id = $r->intParam('id', 'intake ID');
        $req = Validator::validate($r->json(), [
            'intake_month' => 'string|oneof:' . implode(',', IntakeService::MONTHS),
            'intake_year'  => 'int|min:2000|max:2100',
            'is_active'    => 'bool',
        ]);
        Response::success('Intake updated successfully', $this->intakes->update($id, $req));
    }

    public function delete(Request $r): never
    {
        $this->intakes->delete($r->intParam('id', 'intake ID'));
        Response::success('Intake deleted successfully');
    }

    // ── Programmes ───────────────────────────────────────────────────────────

    public function programmes(Request $r): never
    {
        Response::success('Programmes retrieved successfully', $this->intakes->programmes($r->intParam('id', 'intake ID')));
    }

    public function addProgramme(Request $r): never
    {
        $id = $r->intParam('id', 'intake ID');
        $req = Validator::validate($r->json(), ['programme_id' => 'required|int|min:1', 'is_active' => 'bool']);
        Response::created('Programme registered successfully', $this->intakes->addProgramme($id, $req));
    }

    public function updateProgramme(Request $r): never
    {
        $id = $r->intParam('id');
        $req = Validator::validate($r->json(), ['programme_id' => 'int|min:1', 'is_active' => 'bool']);
        Response::success('Intake programme updated successfully', $this->intakes->updateProgramme($id, $req));
    }

    public function removeProgramme(Request $r): never
    {
        $this->intakes->removeProgramme($r->intParam('id'));
        Response::success('Intake programme removed successfully');
    }

    // ── Fee tiers ────────────────────────────────────────────────────────────

    public function trainingLevels(Request $r): never
    {
        Response::success('Fee tiers retrieved successfully', $this->intakes->trainingLevels($r->intParam('id', 'intake ID')));
    }

    public function addTrainingLevel(Request $r): never
    {
        $id = $r->intParam('id', 'intake ID');
        $req = Validator::validate($r->json(), [
            'training_level_id' => 'required|int|min:1', 'application_fee' => 'required|number|min:0', 'is_active' => 'bool',
        ]);
        Response::created('Fee tier added successfully', $this->intakes->addTrainingLevel($id, $req));
    }

    public function updateTrainingLevel(Request $r): never
    {
        $id = $r->intParam('id');
        $req = Validator::validate($r->json(), [
            'training_level_id' => 'int|min:1', 'application_fee' => 'number|min:0', 'is_active' => 'bool',
        ]);
        Response::success('Fee tier updated successfully', $this->intakes->updateTrainingLevel($id, $req));
    }

    public function removeTrainingLevel(Request $r): never
    {
        $this->intakes->removeTrainingLevel($r->intParam('id'));
        Response::success('Fee tier removed successfully');
    }
}
