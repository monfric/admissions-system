<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\HttpException;
use App\Core\Pagination;
use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\AdmissionService;
use App\Services\PaymentProofService;
use App\Services\StaffApplicationService;
use App\Services\UniformSets;

/** /applicants/:id/application-batches, /application-batches..., /admissions..., /uniform-measurements... */
final class StaffApplicationHandler
{
    private StaffApplicationService $applications;

    private const PERIODS = ['today', 'week', 'month', '30days'];

    public function __construct()
    {
        $this->applications = new StaffApplicationService();
    }

    // ── Application batches ──────────────────────────────────────────────────

    public function assign(Request $r): never
    {
        $applicantId = $r->intParam('id', 'applicant ID');
        $req = Validator::validate($r->json(), [
            'intake_id' => 'required|int|min:1', 'training_level_id' => 'required|int|min:1', 'residence' => 'required|string',
        ]);
        $ids = $req['intake_programme_ids'] ?? null;
        if (!is_array($ids) || count($ids) < 1 || count($ids) > 2 || array_filter($ids, fn ($id) => !is_int($id) || $id < 1)) {
            throw HttpException::badRequest('Invalid request data', 'intake_programme_ids must list 1 or 2 programmes');
        }
        $req['intake_programme_ids'] = array_values($ids);
        Response::created('Application assigned successfully', $this->applications->assign($applicantId, $req));
    }

    public function list(Request $r): never
    {
        $f = [
            'payment_status'    => (string) $r->query('payment_status', ''),
            'decision_status'   => (string) $r->query('decision_status', ''),
            'intake_id'         => Query::int($r, 'intake_id'),
            'training_level_id' => Query::int($r, 'training_level_id'),
            'programme_id'      => Query::int($r, 'programme_id'),
            'gender'            => (string) $r->query('gender', ''),
            'residence'         => (string) $r->query('residence', ''),
            'applied'           => Query::oneOf($r, 'applied', self::PERIODS),
            'paid'              => Query::oneOf($r, 'paid', self::PERIODS),
            'programme_match'   => Query::oneOf($r, 'programme_match', ['any', 'notified', 'recalled']),
            'days_remaining'    => Query::oneOf($r, 'days_remaining', ['last_day', 'le3', 'le7', 'le10', 'gt10']),
            'proof_status'      => Query::oneOf($r, 'proof_status', ['none', 'submitted', 'rejected']),
        ];
        $order = Query::orderBy($r, [
            'created_at' => 'ab.created_at', 'updated_at' => 'ab.updated_at', 'notified_at' => 'ab.notified_at',
            'recalled_at' => 'ab.recalled_at', 'rejected_at' => 'ab.rejected_at', 'application_number' => 'ab.application_number',
        ], 'ab.created_at DESC, ab.id DESC');
        Response::success('Application batches retrieved successfully', $this->applications->list(new Pagination($r), $f, $order));
    }

    public function stats(Request $r): never
    {
        $result = $this->applications->stats((string) $r->query('payment_status', ''), (string) $r->query('decision_status', ''));
        Response::success('Application statistics retrieved successfully', $result);
    }

    public function pay(Request $r): never
    {
        $id = $r->intParam('id', 'application batch ID');
        $req = Validator::validate($r->json(), [
            'payment_method' => 'required|string|max:50', 'transaction_code' => 'required|string|max:100',
        ]);
        Response::created('Payment recorded successfully', $this->applications->recordPayment($id, $req, (int) $r->userId));
    }

    // ── Payment proofs ───────────────────────────────────────────────────────

    /** Staff upload a proof for the applicant (e.g. a photo of an office receipt). */
    public function uploadProof(Request $r): never
    {
        $id = $r->intParam('id', 'application batch ID');
        $proof = (new PaymentProofService())->upload($id, $r->file('file'), (string) $r->form('transaction_code', ''), (int) $r->userId);
        Response::created('Payment proof uploaded successfully', $proof);
    }

    public function proofFile(Request $r): never
    {
        (new PaymentProofService())->send($r->intParam('id', 'application batch ID'));
    }

    public function rejectProof(Request $r): never
    {
        $id = $r->intParam('id', 'application batch ID');
        $req = Validator::validate($r->json(), ['reason' => 'required|string|min:3|max:255']);
        Response::success('Payment proof rejected', (new PaymentProofService())->reject($id, $req['reason'], (int) $r->userId));
    }

    public function notify(Request $r): never
    {
        $id = $r->intParam('id', 'application batch ID');
        $req = Validator::validate($r->json(), ['application_id' => 'required|int|min:1']);
        Response::success('Applicant notified successfully', $this->applications->notify($id, (int) $req['application_id']));
    }

    public function decide(Request $r): never
    {
        $id = $r->intParam('id', 'application batch ID');
        $req = Validator::validate($r->json(), [
            'decision' => 'required|string|oneof:approve,reject', 'remarks' => 'string|max:1000',
        ]);
        $result = $this->applications->decide($id, $req['decision'], trim((string) ($req['remarks'] ?? '')), $r->userId);
        Response::success('Application decision recorded successfully', $result);
    }

    // ── Admissions ───────────────────────────────────────────────────────────

    private function admissionFilters(Request $r): array
    {
        return [
            'intake_id'         => Query::int($r, 'intake_id'),
            'programme_id'      => Query::int($r, 'programme_id'),
            'training_level_id' => Query::int($r, 'training_level_id'),
            'status'            => (string) $r->query('status', ''),
            'gender'            => (string) $r->query('gender', ''),
            'residence'         => (string) $r->query('residence', ''),
            'admitted'          => Query::oneOf($r, 'admitted', self::PERIODS),
            'measurement'       => Query::oneOf($r, 'measurement', ['pending', 'submitted', 'unlocked']),
        ];
    }

    public function admissions(Request $r): never
    {
        Response::success('Admissions retrieved successfully', (new AdmissionService())->list(new Pagination($r), $this->admissionFilters($r)));
    }

    public function admissionStats(Request $r): never
    {
        Response::success('Admission statistics retrieved successfully', (new AdmissionService())->stats());
    }

    // ── Uniform measurements ─────────────────────────────────────────────────

    public function uniformSets(Request $r): never
    {
        Response::success('Uniform sets retrieved successfully', UniformSets::all());
    }

    public function uniformList(Request $r): never
    {
        $result = (new AdmissionService())->uniformList(new Pagination($r), $this->admissionFilters($r));
        Response::success('Uniform measurements retrieved successfully', $result);
    }

    public function uniformStats(Request $r): never
    {
        Response::success('Uniform measurement statistics retrieved successfully', (new AdmissionService())->uniformStats());
    }

    public function uniformShow(Request $r): never
    {
        $id = $r->intParam('admissionId', 'admission ID');
        Response::success('Uniform measurements retrieved successfully', (new AdmissionService())->uniformGet($id));
    }

    public function uniformPdf(Request $r): never
    {
        [$pdf, $fileName] = (new AdmissionService())->uniformPdf($r->intParam('admissionId', 'admission ID'));
        Response::pdf($pdf, $fileName);
    }

    public function uniformUnlock(Request $r): never
    {
        $id = $r->intParam('admissionId', 'admission ID');
        Response::success('Uniform measurements unlocked', (new AdmissionService())->uniformUnlock($id));
    }
}
