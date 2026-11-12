<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Sends responses in the same shape as the LMIS (Go) API:
 * {"success": bool, "message": string, "data"?: any, "error"?: string}.
 */
final class Response
{
    public static function json(int $status, array $payload): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        exit;
    }

    public static function success(string $message, mixed $data = null, int $status = 200): never
    {
        $payload = ['success' => true, 'message' => $message];
        if ($data !== null) {
            $payload['data'] = $data;
        }
        self::json($status, $payload);
    }

    public static function created(string $message, mixed $data = null): never
    {
        self::success($message, $data, 201);
    }

    public static function error(int $status, string $message, string $error = ''): never
    {
        $payload = ['success' => false, 'message' => $message];
        if ($error !== '') {
            $payload['error'] = $error;
        }
        self::json($status, $payload);
    }

    /** Streams a stored file. Never cached, since files can be replaced under the same URL. */
    public static function file(string $absolutePath, string $mimeType, string $fileName): never
    {
        if (!is_file($absolutePath)) {
            self::error(404, 'File not found');
        }
        header('Content-Type: ' . ($mimeType !== '' ? $mimeType : 'application/octet-stream'));
        header('Content-Length: ' . filesize($absolutePath));
        header('Content-Disposition: inline; filename="' . addcslashes($fileName, '"\\') . '"');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        readfile($absolutePath);
        exit;
    }

    /** Sends generated PDF bytes. */
    public static function pdf(string $bytes, string $fileName): never
    {
        header('Content-Type: application/pdf');
        header('Content-Length: ' . strlen($bytes));
        header('Content-Disposition: inline; filename="' . addcslashes($fileName, '"\\') . '"');
        header('Cache-Control: no-store');
        echo $bytes;
        exit;
    }
}
