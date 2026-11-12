<?php
declare(strict_types=1);

namespace App\Core;

/** Helpers for list endpoints: safe sorting and optional boolean/int filters. */
final class Query
{
    /**
     * "ORDER BY …" from sort_by / sort_dir, but only for whitelisted columns
     * ($allowed maps the API name to the SQL column). Unknown names fall back
     * to $default, so client input never reaches the SQL.
     */
    public static function orderBy(Request $request, array $allowed, string $default): string
    {
        $dir = strtolower((string) $request->query('sort_dir', 'desc'));
        if (!in_array($dir, ['asc', 'desc'], true)) {
            throw HttpException::badRequest('Invalid query parameters', 'sort_dir must be asc or desc');
        }
        $by = (string) $request->query('sort_by', '');
        return isset($allowed[$by]) ? $allowed[$by] . ' ' . strtoupper($dir) : $default;
    }

    /** A true/false query parameter, or null when absent. */
    public static function bool(Request $request, string $name): ?bool
    {
        $value = $request->query($name);
        if ($value === null) {
            return null;
        }
        if (!in_array($value, ['true', 'false', '1', '0'], true)) {
            throw HttpException::badRequest('Invalid query parameters', "$name must be true or false");
        }
        return $value === 'true' || $value === '1';
    }

    /** A positive integer query parameter, or null when absent. */
    public static function int(Request $request, string $name): ?int
    {
        $value = $request->query($name);
        if ($value === null) {
            return null;
        }
        if (!ctype_digit((string) $value)) {
            throw HttpException::badRequest('Invalid query parameters', "$name must be a whole number");
        }
        return (int) $value;
    }

    /** An enum query parameter ('' when absent). */
    public static function oneOf(Request $request, string $name, array $values): string
    {
        $value = (string) $request->query($name, '');
        if ($value !== '' && !in_array($value, $values, true)) {
            throw HttpException::badRequest('Invalid query parameters', "$name must be one of: " . implode(', ', $values));
        }
        return $value;
    }

    /** True when $e is MySQL refusing a delete/insert because of a foreign key. */
    public static function isForeignKeyError(\Throwable $e): bool
    {
        return $e instanceof \PDOException && in_array((int) ($e->errorInfo[1] ?? 0), [1451, 1452], true);
    }
}
