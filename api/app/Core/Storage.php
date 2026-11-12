<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Uploaded files, kept under storage/ (outside the web root) and only ever
 * sent through authenticated API endpoints. Database rows store paths
 * relative to storage/, e.g. "uploads/applicants/profile/applicant_3_profile_20261103101500.png".
 */
final class Storage
{
    /**
     * Checks an upload's size and extension; returns its lower-case extension
     * (with the dot). Messages match the Go backend.
     */
    public static function validate(array $file, array $allowedExtensions, int $maxBytes, string $sizeLabel): string
    {
        $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE || ($file['size'] ?? 0) > $maxBytes) {
            throw HttpException::badRequest("file size exceeds maximum allowed size of $sizeLabel");
        }
        $isUpload = !empty($file['parsed']) ? is_file($file['tmp_name'] ?? '') : is_uploaded_file($file['tmp_name'] ?? '');
        if ($error !== UPLOAD_ERR_OK || !$isUpload) {
            throw HttpException::badRequest('No file uploaded');
        }
        $ext = '.' . strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExtensions, true)) {
            throw HttpException::badRequest(sprintf('invalid file extension %s. Allowed: [%s]', $ext, implode(' ', $allowedExtensions)));
        }
        return $ext;
    }

    /** Moves an upload to $relativeDir/$fileName and returns the stored relative path. */
    public static function save(array $file, string $relativeDir, string $fileName): string
    {
        $dir = Config::storagePath($relativeDir);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException("failed to create directory $relativeDir");
        }
        $relative = trim($relativeDir, '/') . '/' . $fileName;
        $moved = !empty($file['parsed'])
            ? rename($file['tmp_name'], Config::storagePath($relative))
            : move_uploaded_file($file['tmp_name'], Config::storagePath($relative));
        if (!$moved) {
            throw new \RuntimeException('failed to save file');
        }
        return $relative;
    }

    /** The file's MIME type from its content (fallback: the browser's claim). */
    public static function mimeType(array $file): string
    {
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $type = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
            if ($type) {
                return $type;
            }
        }
        return (string) ($file['type'] ?? 'application/octet-stream');
    }

    public static function absolute(string $relativePath): string
    {
        return Config::storagePath($relativePath);
    }

    public static function delete(string $relativePath): void
    {
        if ($relativePath === '') {
            return;
        }
        $path = Config::storagePath($relativePath);
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
