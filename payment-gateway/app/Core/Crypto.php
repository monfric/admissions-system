<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/** Encryption of stored secrets, and the HMAC signatures used with clients. */
final class Crypto
{
    private const CIPHER = 'aes-256-gcm';

    /** Encrypts with config app_key: base64(iv | tag | ciphertext). */
    public static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, self::CIPHER, self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Encryption failed');
        }
        return base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(string $encoded): string
    {
        $data = base64_decode($encoded, true);
        if ($data === false || strlen($data) < 28) {
            throw new RuntimeException('Stored secret is damaged');
        }
        $plain = openssl_decrypt(substr($data, 28), self::CIPHER, self::key(), OPENSSL_RAW_DATA, substr($data, 0, 12), substr($data, 12, 16));
        if ($plain === false) {
            throw new RuntimeException('Stored secret could not be decrypted (was app_key changed?)');
        }
        return $plain;
    }

    /**
     * What a client signs for each request, one item per line:
     * unix timestamp, METHOD, path after /api/v1 (e.g. /payments/stk),
     * raw query string, sha256 hex of the raw body.
     */
    public static function requestCanonical(string $timestamp, string $method, string $path, string $query, string $body): string
    {
        return implode("\n", [$timestamp, strtoupper($method), $path, $query, hash('sha256', $body)]);
    }

    /** What the gateway signs for each webhook: "<timestamp>.<raw body>". */
    public static function webhookCanonical(string $timestamp, string $body): string
    {
        return $timestamp . '.' . $body;
    }

    public static function sign(string $canonical, string $secret): string
    {
        return hash_hmac('sha256', $canonical, $secret);
    }

    /** "<prefix>_" followed by random hex, e.g. txn_9f… */
    public static function id(string $prefix, int $bytes = 12): string
    {
        return $prefix . '_' . bin2hex(random_bytes($bytes));
    }

    private static function key(): string
    {
        return base64_decode((string) Config::get('app_key'), true) ?: '';
    }
}
