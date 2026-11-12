<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Limits attempts per client IP and route (e.g. logins), counted in small
 * files under storage/ratelimit since PHP keeps no memory between requests.
 */
final class RateLimiter
{
    /** Middleware allowing $limit requests per $windowSeconds. */
    public static function middleware(int $limit, int $windowSeconds): callable
    {
        return function (Request $request) use ($limit, $windowSeconds): void {
            if (!self::hit($request->ip() . ' ' . $request->method . ' ' . $request->path, $limit, $windowSeconds)) {
                Response::json(429, [
                    'success' => false,
                    'message' => 'Too many attempts. Please wait a few minutes and try again.',
                ]);
            }
        };
    }

    /** Counts one attempt; false when the limit is exceeded. */
    public static function hit(string $key, int $limit, int $windowSeconds): bool
    {
        $dir = Config::storagePath('ratelimit');
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $file = $dir . '/' . hash('sha256', $key);
        $handle = @fopen($file, 'c+');
        if ($handle === false) {
            return true; // never block logins because the counter can't be written
        }
        try {
            flock($handle, LOCK_EX);
            $now = time();
            $state = json_decode((string) stream_get_contents($handle), true);
            if (!is_array($state) || ($state['reset_at'] ?? 0) <= $now) {
                $state = ['count' => 0, 'reset_at' => $now + $windowSeconds];
            }
            $state['count']++;
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, json_encode($state));
            return $state['count'] <= $limit;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}
