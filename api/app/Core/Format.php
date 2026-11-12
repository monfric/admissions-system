<?php
declare(strict_types=1);

namespace App\Core;

/** Converts database values to the JSON formats the Go API sends. */
final class Format
{
    /** "2006-01-02 15:04:05" (used in most response DTOs); '' for null. */
    public static function dateTime(?string $value): string
    {
        return $value ? date('Y-m-d H:i:s', strtotime($value)) : '';
    }

    /** RFC 3339 with offset, e.g. "2026-11-03T10:15:00+03:00" (Go's time.Time JSON); null for null. */
    public static function iso(?string $value): ?string
    {
        return $value ? date('c', strtotime($value)) : null;
    }

    public static function bool(mixed $value): bool
    {
        return (bool) (int) $value;
    }

    public static function float(mixed $value): float
    {
        return (float) $value;
    }
}
