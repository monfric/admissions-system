<?php
declare(strict_types=1);

namespace App\Core;

/** Settings from app/config.php. */
final class Config
{
    private static array $values = [];

    public static function load(array $values): void
    {
        self::$values = $values;
    }

    /** A setting by key; dots reach into nested arrays, e.g. "db.host". */
    public static function get(string $key, mixed $default = null): mixed
    {
        $value = self::$values;
        foreach (explode('.', $key) as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                return $default;
            }
            $value = $value[$part];
        }
        return $value;
    }

    public static function storagePath(string $relative = ''): string
    {
        $base = rtrim((string) self::get('storage_path'), '/');
        return $relative === '' ? $base : $base . '/' . ltrim($relative, '/');
    }
}
