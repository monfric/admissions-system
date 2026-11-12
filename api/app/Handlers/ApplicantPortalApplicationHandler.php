<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Storage;
use App\Core\Validator;
use App\Services\ApplicantPortalApplicationService;

/** /applicant-portal/apply-options, /applications..., /payments */
final class ApplicantPortalApplicationHandler
{
    private ApplicantPortalApplicationService $service;

    public function __construct()
    {
        $this->service = new ApplicantPortalApplicationService();
    }

    public function applyOptions(Request $request): never
    {
        Response::success('Open intakes retrieved successfully', $this->service->applyOptions($request->applicantId));
    }

    public function apply(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'intake_id'         => 'required|int|min:1',
            'training_level_id' => 'required|int|min:1',
            'residence'         => 'required|string',
        ]);
        $ids = $req['intake_programme_ids'] ?? null;
        if (!is_array($ids) || count($ids) < 1 || count($ids) > 2 || array_filter($ids, fn ($id) => !is_int($id) || $id < 1)) {
            throw HttpException::badRequest('Invalid request data', 'intake_programme_ids must list 1 or 2 programmes');
        }
        $req['intake_programme_ids'] = array_values($ids);
        Response::created('Application submitted successfully', $this->service->apply($request->applicantId, $req));
    }

    public function list(Request $request): never
    {
        Response::success('Applications retrieved successfully', $this->service->myApplications($request->applicantId));
    }

    public function show(Request $request): never
    {
        $id = $request->intParam('id', 'application ID');
        Response::success('Application retrieved successfully', $this->service->myApplication($request->applicantId, $id));
    }

    /** Proof of the fee payment (multipart: file, transaction_code). */
    public function uploadPaymentProof(Request $request): never
    {
        $id = $request->intParam('id', 'application ID');
        $application = $this->service->uploadPaymentProof(
            $request->applicantId, $id, $request->file('file'), (string) $request->form('transaction_code', '')
        );
        Response::success('Payment proof uploaded. The admissions office will confirm your payment.', $application);
    }

    public function paymentProofFile(Request $request): never
    {
        $this->service->paymentProofFile($request->applicantId, $request->intParam('id', 'application ID'));
    }

    /** A staff-uploaded document (fee structure, joining requirements, …). */
    public function document(Request $request): never
    {
        $id = $request->intParam('id', 'application ID');
        $documentId = $request->intParam('documentId', 'document ID');
        $doc = $this->service->document($request->applicantId, $id, $documentId);
        Response::file(Storage::absolute($doc['file_path']), $doc['mime_type'], $doc['file_name']);
    }

    public function letter(Request $request): never
    {
        $id = $request->intParam('id', 'application ID');
        $type = (string) ($request->params['type'] ?? '');
        if (!in_array($type, ['provisional', 'admission'], true)) {
            throw HttpException::badRequest('Invalid letter type');
        }
        [$pdf, $fileName] = $this->service->letterPdf($request->applicantId, $id, $type);
        Response::pdf($pdf, $fileName);
    }

    public function uniformPdf(Request $request): never
    {
        $id = $request->intParam('id', 'application ID');
        [$pdf, $fileName] = $this->service->uniformPdf($request->applicantId, $id);
        Response::pdf($pdf, $fileName);
    }

    public function payments(Request $request): never
    {
        Response::success('Payments retrieved successfully', $this->service->payments($request->applicantId));
    }

    public function uniformForm(Request $request): never
    {
        $id = $request->intParam('id', 'application ID');
        Response::success('Uniform measurement form retrieved successfully', $this->service->uniformForm($request->applicantId, $id));
    }

    public function submitUniform(Request $request): never
    {
        $id = $request->intParam('id', 'application ID');
        $req = Validator::validate($request->json(), [
            'uniform_set'      => 'required|string|oneof:gents,ladies',
            'tailor_confirmed' => 'bool',
        ]);
        if (!isset($req['measurements']) || !is_array($req['measurements'])) {
            throw HttpException::badRequest('Invalid request data', 'measurements is required');
        }
        Response::success('Uniform measurements submitted successfully', $this->service->submitUniform($request->applicantId, $id, $req));
    }
}
