<?php
declare(strict_types=1);

namespace App\Core;

/** The incoming HTTP request. */
final class Request
{
    /** Route parameters, e.g. ['id' => 'txn_…'] for /payments/:id. */
    public array $params = [];
    /** The client system that signed the request (set by ClientAuth). */
    public ?array $client = null;

    private ?string $raw = null;
    private ?array $json = null;
    /** Methods a POST may stand in for (some hosts' firewalls block PUT/DELETE). */
    private const OVERRIDABLE = ['PUT', 'PATCH', 'DELETE'];

    public function __construct(
        public readonly string $method,
        public readonly string $path
    ) {
    }

    /** Builds the request from PHP's globals; $path is relative to /api/v1. */
    public static function capture(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $override = strtoupper(trim((string) ($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? '')));
        if ($method === 'POST' && in_array($override, self::OVERRIDABLE, true)) {
            $method = $override;
        }
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($base !== '' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base));
        }
        if (str_starts_with($uri, '/api/v1')) {
            $uri = substr($uri, strlen('/api/v1'));
        }
        return new self($method, '/' . trim(rawurldecode($uri), '/'));
    }

    /** The body exactly as sent (signatures are checked over these bytes). */
    public function raw(): string
    {
        return $this->raw ??= (string) file_get_contents('php://input');
    }

    /** The JSON body as an array ([] if empty); 400 if it isn't a JSON object. */
    public function json(): array
    {
        if ($this->json === null) {
            $raw = $this->raw();
            if (trim($raw) === '') {
                $this->json = [];
            } else {
                $data = json_decode($raw, true);
                if (!is_array($data)) {
                    throw HttpException::badRequest('Invalid request data', 'request body is not valid JSON');
                }
                $this->json = $data;
            }
        }
        return $this->json;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        $value = $_GET[$key] ?? null;
        return ($value === null || $value === '') ? $default : $value;
    }

    /** The query string as sent, e.g. "reference=APP-1" ('' if none). */
    public function queryString(): string
    {
        return (string) ($_SERVER['QUERY_STRING'] ?? '');
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;
        return $value === null ? null : trim((string) $value);
    }

    public function ip(): string
    {
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
}
