<?php
declare(strict_types=1);

namespace App\Core;

/** The incoming HTTP request. */
final class Request
{
    /** Route parameters, e.g. ['id' => '12'] for /applications/:id. */
    public array $params = [];
    /** Set by the auth middleware: staff user id/role or applicant id. */
    public ?int $userId = null;
    public ?string $userRole = null;
    public ?int $applicantId = null;

    private ?array $json = null;
    /** Methods a POST may stand in for (see capture()). */
    private const OVERRIDABLE = ['PUT', 'PATCH', 'DELETE'];

    /** Form fields and files of a multipart PUT (PHP only parses POST itself). */
    private ?array $putForm = null;
    private array $putFiles = [];

    public function __construct(
        public readonly string $method,
        public readonly string $path
    ) {
    }

    /** Builds the request from PHP's globals; $path is relative to /api/v1. */
    public static function capture(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        // Some shared hosts' firewalls (ModSecurity) refuse PUT and DELETE, so
        // the apps send them as a POST with X-HTTP-Method-Override.
        $override = strtoupper(trim((string) ($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? '')));
        if ($method === 'POST' && in_array($override, self::OVERRIDABLE, true)) {
            $method = $override;
        }
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        // Works whether the API is at the domain root or in a sub-folder.
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($base !== '' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base));
        }
        if (str_starts_with($uri, '/api/v1')) {
            $uri = substr($uri, strlen('/api/v1'));
        }
        $path = '/' . trim(rawurldecode($uri), '/');

        return new self($method, $path);
    }

    /** The JSON body as an array ([] if empty); 400 if it isn't valid JSON. */
    public function json(): array
    {
        if ($this->json === null) {
            $raw = file_get_contents('php://input') ?: '';
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

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->json()[$key] ?? $default;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        $value = $_GET[$key] ?? null;
        return ($value === null || $value === '') ? $default : $value;
    }

    public function queryAll(): array
    {
        return $_GET;
    }

    /** A route parameter as a positive integer; 400 with $label if it isn't one. */
    public function intParam(string $name, string $label = 'ID'): int
    {
        $value = $this->params[$name] ?? '';
        if (!ctype_digit((string) $value) || (int) $value <= 0) {
            throw HttpException::badRequest("Invalid $label");
        }
        return (int) $value;
    }

    /** An uploaded file from a multipart form, or null. */
    public function file(string $field): ?array
    {
        $this->parsePutMultipart();
        $file = $_FILES[$field] ?? $this->putFiles[$field] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return null;
        }
        return $file;
    }

    /** A multipart form field. */
    public function form(string $key, mixed $default = null): mixed
    {
        $this->parsePutMultipart();
        $value = $_POST[$key] ?? $this->putForm[$key] ?? null;
        return ($value === null || $value === '') ? $default : $value;
    }

    /**
     * Reads a multipart/form-data PUT body into fields and temp files
     * (marked 'parsed' => true, since they aren't PHP uploads).
     */
    private function parsePutMultipart(): void
    {
        if ($this->putForm !== null) {
            return;
        }
        $this->putForm = [];
        $type = $_SERVER['CONTENT_TYPE'] ?? '';
        // Only a real PUT needs this: an overridden POST was parsed by PHP into $_POST/$_FILES.
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PUT' || !preg_match('/multipart\/form-data;\s*boundary="?([^";]+)"?/i', $type, $m)) {
            return;
        }
        $body = (string) file_get_contents('php://input');
        foreach (explode('--' . $m[1], $body) as $part) {
            $part = ltrim($part, "\r\n");
            if ($part === '' || str_starts_with($part, '--')) {
                continue;
            }
            [$rawHeaders, $content] = array_pad(explode("\r\n\r\n", $part, 2), 2, '');
            $content = substr($content, 0, -2); // trailing CRLF before the next boundary
            if (!preg_match('/name="([^"]*)"/i', $rawHeaders, $name)) {
                continue;
            }
            if (preg_match('/filename="([^"]*)"/i', $rawHeaders, $fileName)) {
                if ($fileName[1] === '') {
                    continue;
                }
                $tmp = tempnam(sys_get_temp_dir(), 'put');
                file_put_contents($tmp, $content);
                preg_match('/Content-Type:\s*([^\r\n]+)/i', $rawHeaders, $ct);
                $this->putFiles[$name[1]] = [
                    'name' => $fileName[1], 'type' => trim($ct[1] ?? ''), 'tmp_name' => $tmp,
                    'error' => UPLOAD_ERR_OK, 'size' => strlen($content), 'parsed' => true,
                ];
            } else {
                $this->putForm[$name[1]] = $content;
            }
        }
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;
        // Apache may hand the Authorization header over under another name.
        if ($value === null && strtolower($name) === 'authorization') {
            $value = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
            if ($value === null && function_exists('apache_request_headers')) {
                foreach (apache_request_headers() as $k => $v) {
                    if (strtolower($k) === 'authorization') {
                        $value = $v;
                    }
                }
            }
        }
        return $value;
    }

    /** The token from "Authorization: Bearer <token>", or null. */
    public function bearerToken(): ?string
    {
        $parts = explode(' ', (string) $this->header('Authorization'), 2);
        return (count($parts) === 2 && $parts[0] === 'Bearer' && $parts[1] !== '') ? $parts[1] : null;
    }

    public function ip(): string
    {
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
}
