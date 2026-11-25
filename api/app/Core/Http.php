<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/**
 * Outgoing HTTPS requests (to the Payment Gateway). Uses curl when
 * PHP has it, otherwise PHP's own HTTPS streams. Certificates are always checked.
 */
final class Http
{
    /**
     * @param array<string,string> $headers
     * @return array{status:int, body:string}
     * @throws RuntimeException when the server can't be reached at all
     */
    public static function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 30): array
    {
        $lines = [];
        foreach ($headers as $name => $value) {
            $lines[] = "$name: $value";
        }
        return extension_loaded('curl')
            ? self::viaCurl($method, $url, $lines, $body, $timeout)
            : self::viaStream($method, $url, $lines, $body, $timeout);
    }

    private static function viaCurl(string $method, string $url, array $lines, ?string $body, int $timeout): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $lines,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $response = curl_exec($ch);
        if ($response === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException('Could not reach ' . parse_url($url, PHP_URL_HOST) . ': ' . $error);
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ['status' => $status, 'body' => (string) $response];
    }

    private static function viaStream(string $method, string $url, array $lines, ?string $body, int $timeout): array
    {
        $context = stream_context_create([
            'http' => [
                'method'          => $method,
                'header'          => implode("\r\n", $lines),
                'content'         => $body ?? '',
                'timeout'         => $timeout,
                'ignore_errors'   => true,   // read 4xx/5xx bodies too
                'follow_location' => 0,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $http_response_header = [];
        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            $error = error_get_last()['message'] ?? 'connection failed';
            throw new RuntimeException('Could not reach ' . parse_url($url, PHP_URL_HOST) . ': ' . $error);
        }
        $status = 0;
        foreach ($http_response_header as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int) $m[1]; // the last status line wins
            }
        }
        return ['status' => $status, 'body' => $response];
    }
}
