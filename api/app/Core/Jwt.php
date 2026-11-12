<?php
declare(strict_types=1);

namespace App\Core;

/** Minimal JSON Web Tokens signed with HS256 (no external library needed). */
final class Jwt
{
    public static function encode(array $claims, string $key): string
    {
        $header = self::base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = self::base64url(json_encode($claims, JSON_UNESCAPED_SLASHES));
        $signature = self::base64url(hash_hmac('sha256', "$header.$payload", $key, true));
        return "$header.$payload.$signature";
    }

    /** The token's claims if it is HS256, correctly signed and not expired; otherwise null. */
    public static function decode(string $token, string $key): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$header, $payload, $signature] = $parts;

        $head = json_decode(self::unbase64url($header), true);
        if (!is_array($head) || ($head['alg'] ?? '') !== 'HS256') {
            return null;
        }
        $expected = self::base64url(hash_hmac('sha256', "$header.$payload", $key, true));
        if (!hash_equals($expected, $signature)) {
            return null;
        }
        $claims = json_decode(self::unbase64url($payload), true);
        if (!is_array($claims) || !isset($claims['exp']) || (int) $claims['exp'] < time()) {
            return null;
        }
        return $claims;
    }

    private static function base64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function unbase64url(string $data): string
    {
        return (string) base64_decode(strtr($data, '-_', '+/'), true);
    }
}
