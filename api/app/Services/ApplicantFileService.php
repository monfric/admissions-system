<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;
use App\Core\Response;
use App\Core\Storage;
use App\Repositories\ApplicantDocumentRepository;
use App\Repositories\ApplicantRepository;

/**
 * Applicants' uploaded files: the profile photo (stored on the applicant) and
 * supporting documents (applicant_documents). Shared by the portal and staff.
 */
final class ApplicantFileService
{
    public const TYPES = ['profile', 'id_card', 'kcse_certificate', 'leaving_certificate', 'post_secondary_certificate'];

    private const EXTENSIONS = [
        'profile'                    => ['.jpg', '.jpeg', '.png', '.gif'],
        'id_card'                    => ['.pdf', '.jpg', '.jpeg', '.png'],
        'kcse_certificate'           => ['.pdf', '.jpg', '.jpeg', '.png'],
        'leaving_certificate'        => ['.pdf', '.jpg', '.jpeg', '.png'],
        'post_secondary_certificate' => ['.pdf', '.jpg', '.jpeg', '.png'],
    ];
    private const MAX_BYTES = 5 * 1024 * 1024;

    private const MIME_BY_EXTENSION = [
        'pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png', 'gif' => 'image/gif',
    ];

    private ApplicantRepository $applicants;
    private ApplicantDocumentRepository $documents;

    public function __construct()
    {
        $this->applicants = new ApplicantRepository();
        $this->documents = new ApplicantDocumentRepository();
    }

    /** Validates and stores a file, replacing (and deleting) the previous one of that type. */
    public function upload(int $applicantId, string $type, ?array $file): array
    {
        if (!in_array($type, self::TYPES, true)) {
            throw HttpException::badRequest('Invalid or missing file_type (profile, id_card, kcse_certificate, leaving_certificate, or post_secondary_certificate)');
        }
        if ($file === null) {
            throw HttpException::badRequest('No file uploaded');
        }
        $ext = Storage::validate($file, self::EXTENSIONS[$type], self::MAX_BYTES, '5MB');
        $applicant = $this->applicants->findById($applicantId);
        if ($applicant === null) {
            throw HttpException::notFound('Applicant not found');
        }

        $fileName = sprintf('applicant_%d_%s_%s%s', $applicantId, $type, date('YmdHis'), $ext);
        $mimeType = Storage::mimeType($file);
        $path = Storage::save($file, "uploads/applicants/$type", $fileName);

        try {
            if ($type === 'profile') {
                $oldPath = (string) $applicant['profile_photo'];
                $this->applicants->update($applicantId, ['profile_photo' => $path]);
            } else {
                $oldPath = $this->documents->upsert($applicantId, $type, [
                    'file_name' => $fileName,
                    'file_path' => $path,
                    'file_size' => (int) $file['size'],
                    'mime_type' => $mimeType,
                ]);
            }
        } catch (\Throwable $e) {
            Storage::delete($path);
            throw new HttpException(500, 'Failed to update applicant record');
        }
        if ($oldPath !== '' && $oldPath !== $path) {
            Storage::delete($oldPath);
        }

        return [
            'file_path' => $path,
            'file_name' => $fileName,
            'file_type' => $type,
            'file_size' => (int) $file['size'],
        ];
    }

    /** Streams the applicant's current file of this type. */
    public function send(int $applicantId, string $type): never
    {
        if (!in_array($type, self::TYPES, true)) {
            throw HttpException::badRequest('Invalid file type');
        }
        $path = $this->currentPath($applicantId, $type);
        if ($path === '') {
            throw HttpException::notFound('File not found');
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        Response::file(Storage::absolute($path), self::MIME_BY_EXTENSION[$ext] ?? 'application/octet-stream', basename($path));
    }

    /** Deletes the applicant's file of this type (staff only). */
    public function delete(int $applicantId, string $type): void
    {
        if (!in_array($type, self::TYPES, true)) {
            throw HttpException::badRequest('Invalid file type');
        }
        if ($type === 'profile') {
            $applicant = $this->applicants->findById($applicantId);
            $path = (string) ($applicant['profile_photo'] ?? '');
            if ($path === '') {
                throw HttpException::notFound('File not found');
            }
            $this->applicants->update($applicantId, ['profile_photo' => '']);
        } else {
            $doc = $this->documents->findByType($applicantId, $type);
            if ($doc === null) {
                throw HttpException::notFound('File not found');
            }
            $path = (string) $doc['file_path'];
            $this->documents->delete((int) $doc['id']);
        }
        Storage::delete($path);
    }

    private function currentPath(int $applicantId, string $type): string
    {
        if ($type === 'profile') {
            return (string) ($this->applicants->findById($applicantId)['profile_photo'] ?? '');
        }
        return (string) ($this->documents->findByType($applicantId, $type)['file_path'] ?? '');
    }
}
