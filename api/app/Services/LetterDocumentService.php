<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Pagination;
use App\Core\Storage;
use App\Repositories\IntakeRepository;

/**
 * Offer Letters (letter bodies per programme in an intake, one per type) and
 * Application Documents (staff-uploaded PDFs per intake + programme + type).
 */
final class LetterDocumentService
{
    // ── Offer letters ────────────────────────────────────────────────────────

    private const LETTER_SELECT = 'SELECT ol.*, ip.intake_id, ip.programme_id, p.name AS programme_name, p.code AS programme_code,
            i.intake_month, i.intake_year
          FROM offer_letters ol
          JOIN intake_programmes ip ON ip.id = ol.intake_programme_id
          JOIN programmes p ON p.id = ip.programme_id
          JOIN intakes i ON i.id = ip.intake_id';

    public function listLetters(Pagination $page, array $f, string $orderBy): array
    {
        $where = ['ol.deleted_at IS NULL'];
        $params = [];
        if ($page->search !== '') {
            $where[] = '(LOWER(p.name) LIKE ? OR LOWER(p.code) LIKE ? OR LOWER(i.intake_month) LIKE ? OR LOWER(ol.type) LIKE ? OR CAST(i.intake_year AS CHAR) LIKE ?)';
            array_push($params, ...array_fill(0, 5, '%' . strtolower($page->search) . '%'));
        }
        foreach (['type' => 'ol.type', 'status' => 'ol.status'] as $key => $column) {
            if ($f[$key] !== '') {
                $where[] = "$column = ?";
                $params[] = $f[$key];
            }
        }
        foreach (['intake_id' => 'ip.intake_id', 'programme_id' => 'ip.programme_id', 'training_level_id' => 'p.training_level_id'] as $key => $column) {
            if ($f[$key] !== null) {
                $where[] = "$column = ?";
                $params[] = $f[$key];
            }
        }
        $whereSql = implode(' AND ', $where);
        $from = 'FROM offer_letters ol JOIN intake_programmes ip ON ip.id = ol.intake_programme_id
                 JOIN programmes p ON p.id = ip.programme_id JOIN intakes i ON i.id = ip.intake_id';
        $total = (int) Database::value("SELECT COUNT(*) $from WHERE $whereSql", $params);
        $rows = Database::all(self::LETTER_SELECT . " WHERE $whereSql ORDER BY $orderBy " . $page->limitSql(), $params);
        return $page->result(array_map([$this, 'letterResponse'], $rows), $total);
    }

    public function getLetter(int $id): array
    {
        return $this->letterResponse($this->letterRow($id));
    }

    public function letterRow(int $id): array
    {
        $row = Database::one(self::LETTER_SELECT . ' WHERE ol.id = ? AND ol.deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    public function createLetter(array $req): array
    {
        $this->assertIntakeProgramme((int) $req['intake_programme_id']);
        $this->assertLetterFree((int) $req['intake_programme_id'], $req['type'], 0);
        $id = Database::insert('offer_letters', [
            'intake_programme_id' => (int) $req['intake_programme_id'],
            'type'   => $req['type'],
            'body'   => $req['body'],
            'status' => ($req['status'] ?? '') !== '' ? $req['status'] : 'active',
        ]);
        return $this->getLetter($id);
    }

    public function updateLetter(int $id, array $req): array
    {
        $letter = $this->letterRow($id);
        $ipId = isset($req['intake_programme_id']) ? (int) $req['intake_programme_id'] : (int) $letter['intake_programme_id'];
        if ($ipId !== (int) $letter['intake_programme_id']) {
            $this->assertIntakeProgramme($ipId);
        }
        $type = ($req['type'] ?? '') !== '' ? $req['type'] : $letter['type'];
        if ($ipId !== (int) $letter['intake_programme_id'] || $type !== $letter['type']) {
            $this->assertLetterFree($ipId, $type, $id);
        }
        $data = ['intake_programme_id' => $ipId, 'type' => $type];
        if (($req['body'] ?? '') !== '') {
            $data['body'] = $req['body'];
        }
        if (($req['status'] ?? '') !== '') {
            $data['status'] = $req['status'];
        }
        Database::update('offer_letters', $id, $data);
        return $this->getLetter($id);
    }

    public function deleteLetter(int $id): void
    {
        $this->letterRow($id);
        Database::softDelete('offer_letters', $id);
    }

    private function assertIntakeProgramme(int $id): void
    {
        if (Database::value('SELECT 1 FROM intake_programmes WHERE id = ? AND deleted_at IS NULL', [$id]) === null) {
            throw HttpException::badRequest('intake programme not found');
        }
    }

    private function assertLetterFree(int $intakeProgrammeId, string $type, int $exceptId): void
    {
        if (Database::value(
            'SELECT 1 FROM offer_letters WHERE intake_programme_id = ? AND type = ? AND deleted_at IS NULL AND id <> ?',
            [$intakeProgrammeId, $type, $exceptId]
        ) !== null) {
            throw HttpException::badRequest("a $type offer letter already exists for this programme in this intake");
        }
    }

    private function letterResponse(array $l): array
    {
        return [
            'id' => (int) $l['id'], 'intake_programme_id' => (int) $l['intake_programme_id'],
            'intake_id' => (int) $l['intake_id'], 'intake_name' => IntakeRepository::name($l),
            'programme_id' => (int) $l['programme_id'], 'programme_name' => $l['programme_name'], 'programme_code' => $l['programme_code'],
            'type' => $l['type'], 'body' => (string) $l['body'], 'status' => $l['status'],
            'created_at' => Format::dateTime($l['created_at']), 'updated_at' => Format::dateTime($l['updated_at']),
        ];
    }

    // ── Application documents ────────────────────────────────────────────────

    private const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

    private const DOCUMENT_SELECT = 'SELECT d.*, p.name AS programme_name, p.code AS programme_code, i.intake_month, i.intake_year
          FROM application_documents d
          JOIN programmes p ON p.id = d.programme_id
          JOIN intakes i ON i.id = d.intake_id';

    public function listDocuments(Pagination $page, array $f, string $orderBy): array
    {
        $where = ['d.deleted_at IS NULL'];
        $params = [];
        if ($page->search !== '') {
            $where[] = '(LOWER(d.document_name) LIKE ? OR LOWER(d.file_name) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(p.code) LIKE ?
                         OR LOWER(i.intake_month) LIKE ? OR CAST(i.intake_year AS CHAR) LIKE ? OR LOWER(d.type) LIKE ?)';
            array_push($params, ...array_fill(0, 7, '%' . strtolower($page->search) . '%'));
        }
        foreach (['type' => 'd.type', 'status' => 'd.status'] as $key => $column) {
            if ($f[$key] !== '') {
                $where[] = "$column = ?";
                $params[] = $f[$key];
            }
        }
        foreach (['intake_id' => 'd.intake_id', 'programme_id' => 'd.programme_id', 'training_level_id' => 'p.training_level_id'] as $key => $column) {
            if ($f[$key] !== null) {
                $where[] = "$column = ?";
                $params[] = $f[$key];
            }
        }
        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value(
            "SELECT COUNT(*) FROM application_documents d JOIN programmes p ON p.id = d.programme_id JOIN intakes i ON i.id = d.intake_id WHERE $whereSql",
            $params
        );
        $rows = Database::all(self::DOCUMENT_SELECT . " WHERE $whereSql ORDER BY $orderBy " . $page->limitSql(), $params);
        return $page->result(array_map([$this, 'documentResponse'], $rows), $total);
    }

    public function getDocument(int $id): array
    {
        return $this->documentResponse($this->documentRow($id));
    }

    public function documentRow(int $id): array
    {
        $row = Database::one(self::DOCUMENT_SELECT . ' WHERE d.id = ? AND d.deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('record not found');
        }
        return $row;
    }

    public function createDocument(array $req, ?array $file): array
    {
        if ($file === null) {
            throw HttpException::badRequest('a PDF file is required');
        }
        $this->validatePdf($file);
        $name = trim($req['document_name']);
        if ($name === '') {
            throw HttpException::badRequest('document name is required');
        }
        $this->assertOffered((int) $req['intake_id'], (int) $req['programme_id']);
        $this->assertNameFree((int) $req['intake_id'], (int) $req['programme_id'], $req['type'], $name, 0);

        $path = $this->saveFile($file);
        try {
            $id = Database::insert('application_documents', [
                'document_name' => $name, 'intake_id' => (int) $req['intake_id'], 'programme_id' => (int) $req['programme_id'],
                'type' => $req['type'], 'file_name' => basename((string) $file['name']), 'file_path' => $path,
                'file_size' => (int) $file['size'], 'mime_type' => 'application/pdf',
                'status' => ($req['status'] ?? '') !== '' ? $req['status'] : 'active',
            ]);
        } catch (\Throwable $e) {
            Storage::delete($path);
            throw $e;
        }
        return $this->getDocument($id);
    }

    public function updateDocument(int $id, array $req, ?array $file): array
    {
        $doc = $this->documentRow($id);
        if ($file !== null) {
            $this->validatePdf($file);
        }
        $intakeId = isset($req['intake_id']) ? (int) $req['intake_id'] : (int) $doc['intake_id'];
        $programmeId = isset($req['programme_id']) ? (int) $req['programme_id'] : (int) $doc['programme_id'];
        $type = ($req['type'] ?? '') !== '' ? $req['type'] : $doc['type'];
        $name = trim((string) ($req['document_name'] ?? '')) !== '' ? trim($req['document_name']) : $doc['document_name'];
        if ($intakeId !== (int) $doc['intake_id'] || $programmeId !== (int) $doc['programme_id']) {
            $this->assertOffered($intakeId, $programmeId);
        }
        $this->assertNameFree($intakeId, $programmeId, $type, $name, $id);

        $data = ['document_name' => $name, 'intake_id' => $intakeId, 'programme_id' => $programmeId, 'type' => $type];
        if (($req['status'] ?? '') !== '') {
            $data['status'] = $req['status'];
        }
        $oldPath = '';
        if ($file !== null) {
            $data += [
                'file_path' => $this->saveFile($file), 'file_name' => basename((string) $file['name']),
                'file_size' => (int) $file['size'], 'mime_type' => 'application/pdf',
            ];
            $oldPath = $doc['file_path'];
        }
        try {
            Database::update('application_documents', $id, $data);
        } catch (\Throwable $e) {
            if (isset($data['file_path'])) {
                Storage::delete($data['file_path']);
            }
            throw $e;
        }
        if ($oldPath !== '') {
            Storage::delete($oldPath);
        }
        return $this->getDocument($id);
    }

    public function deleteDocument(int $id): void
    {
        $doc = $this->documentRow($id);
        Database::softDelete('application_documents', $id);
        Storage::delete($doc['file_path']);
    }

    /** Counts for the Application Documents cards; coverage is over running programmes in open intakes. */
    public function documentStats(): array
    {
        $stats = Database::one(
            "SELECT COUNT(*) AS documents,
                    COALESCE(SUM(type = 'provisional'), 0) AS provisional_documents,
                    COALESCE(SUM(type = 'admission'), 0) AS admission_documents
               FROM application_documents WHERE status = 'active' AND deleted_at IS NULL"
        );
        $hasDoc = "EXISTS (SELECT 1 FROM application_documents d WHERE d.intake_id = ip.intake_id AND d.programme_id = ip.programme_id
                    AND d.type = '%s' AND d.status = 'active' AND d.deleted_at IS NULL)";
        $coverage = Database::one(
            'SELECT COUNT(*) AS running_programmes,
                    COALESCE(SUM(' . sprintf($hasDoc, 'provisional') . '), 0) AS provisional_covered,
                    COALESCE(SUM(' . sprintf($hasDoc, 'admission') . '), 0) AS admission_covered
               FROM intake_programmes ip
               JOIN intakes i ON i.id = ip.intake_id AND i.deleted_at IS NULL AND i.is_active = 1
              WHERE ip.deleted_at IS NULL AND ip.is_active = 1'
        );
        $stats = array_map('intval', $stats + $coverage);
        $stats['provisional_missing'] = $stats['running_programmes'] - $stats['provisional_covered'];
        $stats['admission_missing'] = $stats['running_programmes'] - $stats['admission_covered'];
        return $stats;
    }

    private function validatePdf(array $file): void
    {
        Storage::validate($file, ['.pdf'], self::MAX_DOCUMENT_BYTES, '10MB');
        $handle = fopen($file['tmp_name'], 'rb');
        $header = $handle ? fread($handle, 5) : '';
        if ($handle) {
            fclose($handle);
        }
        if ($header !== '%PDF-') {
            throw HttpException::badRequest('the uploaded file is not a valid PDF');
        }
    }

    private function saveFile(array $file): string
    {
        return Storage::save($file, 'uploads/application_documents', sprintf('application_document_%s.pdf', str_replace('.', '', (string) hrtime(true))));
    }

    private function assertOffered(int $intakeId, int $programmeId): void
    {
        if (Database::value(
            'SELECT 1 FROM intake_programmes WHERE intake_id = ? AND programme_id = ? AND deleted_at IS NULL',
            [$intakeId, $programmeId]
        ) === null) {
            throw HttpException::badRequest('the selected programme is not offered in the selected intake');
        }
    }

    private function assertNameFree(int $intakeId, int $programmeId, string $type, string $name, int $exceptId): void
    {
        if (Database::value(
            'SELECT 1 FROM application_documents WHERE intake_id = ? AND programme_id = ? AND type = ? AND LOWER(document_name) = ?
                AND deleted_at IS NULL AND id <> ?',
            [$intakeId, $programmeId, $type, strtolower($name), $exceptId]
        ) !== null) {
            throw HttpException::badRequest(sprintf('a %s document named "%s" already exists for this programme in this intake', $type, $name));
        }
    }

    private function documentResponse(array $d): array
    {
        return [
            'id' => (int) $d['id'], 'document_name' => $d['document_name'],
            'intake_id' => (int) $d['intake_id'], 'intake_name' => IntakeRepository::name($d),
            'programme_id' => (int) $d['programme_id'], 'programme_name' => $d['programme_name'], 'programme_code' => $d['programme_code'],
            'type' => $d['type'], 'file_name' => $d['file_name'], 'file_size' => (int) $d['file_size'],
            'mime_type' => $d['mime_type'], 'status' => $d['status'],
            'created_at' => Format::dateTime($d['created_at']), 'updated_at' => Format::dateTime($d['updated_at']),
        ];
    }
}
