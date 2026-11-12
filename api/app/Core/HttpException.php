<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/**
 * An error to send back to the client as
 * {"success": false, "message": ..., "error": ...} with the given status.
 */
class HttpException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly string $detail = ''
    ) {
        parent::__construct($message);
    }

    public static function badRequest(string $message, string $detail = ''): self
    {
        return new self(400, $message, $detail);
    }

    public static function unauthorized(string $message): self
    {
        return new self(401, $message);
    }

    public static function forbidden(string $message): self
    {
        return new self(403, $message);
    }

    public static function notFound(string $message): self
    {
        return new self(404, $message);
    }
}
