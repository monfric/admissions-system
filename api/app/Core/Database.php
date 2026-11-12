<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use Throwable;

/** MySQL access through PDO, with small helpers for common queries. */
final class Database
{
    private static array $settings = [];
    private static ?PDO $pdo = null;

    public static function configure(array $settings): void
    {
        self::$settings = $settings;
    }

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $s = self::$settings;
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $s['host'], (int) ($s['port'] ?? 3306), $s['name']);
            self::$pdo = new PDO($dsn, $s['user'], $s['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_STRINGIFY_FETCHES  => false,
            ]);
            // Store and compare times in the app's time zone.
            self::$pdo->exec("SET time_zone = '" . (new \DateTime())->format('P') . "'");
        }
        return self::$pdo;
    }

    /** Runs a statement and returns it. */
    public static function query(string $sql, array $params = []): \PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /** First row, or null. */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::query($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /** All rows. */
    public static function all(string $sql, array $params = []): array
    {
        return self::query($sql, $params)->fetchAll();
    }

    /** First column of the first row, or null. */
    public static function value(string $sql, array $params = []): mixed
    {
        $value = self::query($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    /** Runs an UPDATE/DELETE and returns the number of rows changed. */
    public static function execute(string $sql, array $params = []): int
    {
        return self::query($sql, $params)->rowCount();
    }

    /** Inserts a row (adding created_at/updated_at unless given) and returns its id. */
    public static function insert(string $table, array $data, bool $timestamps = true): int
    {
        if ($timestamps) {
            $now = self::now();
            $data += ['created_at' => $now, 'updated_at' => $now];
        }
        $columns = array_keys($data);
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(', ', array_map(fn ($c) => "`$c`", $columns)),
            implode(', ', array_fill(0, count($columns), '?'))
        );
        self::query($sql, array_map([self::class, 'toDb'], array_values($data)));
        return (int) self::pdo()->lastInsertId();
    }

    /** Updates a row by id (setting updated_at unless given). */
    public static function update(string $table, int $id, array $data, bool $timestamps = true): int
    {
        if ($timestamps) {
            $data += ['updated_at' => self::now()];
        }
        $sets = implode(', ', array_map(fn ($c) => "`$c` = ?", array_keys($data)));
        $params = array_map([self::class, 'toDb'], array_values($data));
        $params[] = $id;
        return self::execute("UPDATE $table SET $sets WHERE id = ?", $params);
    }

    /** Marks a row deleted (soft delete), like the Go backend. */
    public static function softDelete(string $table, int $id): int
    {
        return self::execute("UPDATE $table SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL", [self::now(), $id]);
    }

    /** Runs $work inside a transaction; rolls back if it throws. */
    public static function transaction(callable $work): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $work();
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** "?, ?, ?" for an IN (...) list of $count values. */
    public static function placeholders(int $count): string
    {
        return implode(', ', array_fill(0, max(1, $count), '?'));
    }

    public static function now(): string
    {
        return date('Y-m-d H:i:s');
    }

    private static function toDb(mixed $value): mixed
    {
        return is_bool($value) ? (int) $value : $value;
    }
}
