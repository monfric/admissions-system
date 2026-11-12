<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Pagination;
use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Core\Storage;
use App\Core\Validator;
use App\Services\LetterDocumentService;

/** /offer-letters and /application-documents */
final class LetterDocumentHandler
{
    private LetterDocumentService $service;

    public function __construct()
    {
        $this->service = new LetterDocumentService();
    }

    private function filters(Request $r): array
    {
        return [
            'type'              => Query::oneOf($r, 'type', ['provisional', 'admission']),
            'status'            => Query::oneOf($r, 'status', ['active', 'inactive']),
            'intake_id'         => Query::int($r, 'intake_id'),
            'programme_id'      => Query::int($r, 'programme_id'),
            'training_level_id' => Query::int($r, 'training_level_id'),
        ];
    }

    // ── Offer letters ────────────────────────────────────────────────────────

    public function listLetters(Request $r): never
    {
        $order = Query::orderBy($r, [
            'created_at' => 'ol.created_at', 'updated_at' => 'ol.updated_at', 'type' => 'ol.type', 'status' => 'ol.status',
        ], 'ol.created_at DESC, ol.id DESC');
        Response::success('Offer letters retrieved successfully', $this->service->listLetters(new Pagination($r), $this->filters($r), $order));
    }

    public function getLetter(Request $r): never
    {
        Response::success('Offer letter retrieved successfully', $this->service->getLetter($r->intParam('id')));
    }

    /** The letter as students will see it, with "Student Name" / "ADM/NO" and today's date. */
    public function previewLetter(Request $r): never
    {
        $letter = $this->service->letterRow($r->intParam('id'));
        $data = [
            'type'      => $letter['type'],
            'reference' => \App\Services\Pdf\LetterPdf::reference($letter['type'], $letter['intake_month'], (int) $letter['intake_year']),
            'date'      => new \DateTime(),
            'name'      => 'Student Name',
            'body'      => (string) $letter['body'],
        ];
        if ($letter['type'] === 'admission') {
            $data['admission_number'] = 'ADM/NO';
        }
        Response::pdf(\App\Services\Pdf\LetterPdf::generate($data), 'offer-letter-preview.pdf');
    }

    public function createLetter(Request $r): never
    {
        $req = Validator::validate($r->json(), [
            'intake_programme_id' => 'required|int|min:1', 'type' => 'required|string|oneof:provisional,admission',
            'body' => 'required|string', 'status' => 'string|oneof:active,inactive',
        ]);
        Response::created('Offer letter created successfully', $this->service->createLetter($req));
    }

    public function updateLetter(Request $r): never
    {
        $id = $r->intParam('id');
        $req = Validator::validate($r->json(), [
            'intake_programme_id' => 'int|min:1', 'type' => 'string|oneof:provisional,admission',
            'body' => 'string', 'status' => 'string|oneof:active,inactive',
        ]);
        Response::success('Offer letter updated successfully', $this->service->updateLetter($id, $req));
    }

    public function deleteLetter(Request $r): never
    {
        $this->service->deleteLetter($r->intParam('id'));
        Response::success('Offer letter deleted successfully');
    }

    // ── Application documents (multipart: document_name, intake_id, programme_id, type, status, file) ──

    private function documentForm(Request $r, bool $create): array
    {
        $fields = [];
        foreach (['document_name', 'intake_id', 'programme_id', 'type', 'status'] as $key) {
            $value = $r->form($key);
            if ($value !== null) {
                $fields[$key] = in_array($key, ['intake_id', 'programme_id'], true) && ctype_digit((string) $value) ? (int) $value : $value;
            }
        }
        $required = $create ? 'required|' : '';
        return Validator::validate($fields, [
            'document_name' => "{$required}string|max:255",
            'intake_id'     => "{$required}int|min:1",
            'programme_id'  => "{$required}int|min:1",
            'type'          => "{$required}string|oneof:provisional,admission",
            'status'        => 'string|oneof:active,inactive',
        ]);
    }

    public function listDocuments(Request $r): never
    {
        $order = Query::orderBy($r, [
            'created_at' => 'd.created_at', 'updated_at' => 'd.updated_at', 'document_name' => 'd.document_name',
            'file_size' => 'd.file_size', 'type' => 'd.type', 'status' => 'd.status',
        ], 'd.created_at DESC, d.id DESC');
        Response::success('Application documents retrieved successfully', $this->service->listDocuments(new Pagination($r), $this->filters($r), $order));
    }

    public function documentStats(Request $r): never
    {
        Response::success('Document statistics retrieved successfully', $this->service->documentStats());
    }

    public function getDocument(Request $r): never
    {
        Response::success('Application document retrieved successfully', $this->service->getDocument($r->intParam('id')));
    }

    public function documentFile(Request $r): never
    {
        $doc = $this->service->documentRow($r->intParam('id'));
        Response::file(Storage::absolute($doc['file_path']), $doc['mime_type'], $doc['file_name']);
    }

    public function createDocument(Request $r): never
    {
        $req = $this->documentForm($r, true);
        Response::created('Application document created successfully', $this->service->createDocument($req, $r->file('file')));
    }

    public function updateDocument(Request $r): never
    {
        $id = $r->intParam('id');
        $req = $this->documentForm($r, false);
        Response::success('Application document updated successfully', $this->service->updateDocument($id, $req, $r->file('file')));
    }

    public function deleteDocument(Request $r): never
    {
        $this->service->deleteDocument($r->intParam('id'));
        Response::success('Application document deleted successfully');
    }
}
