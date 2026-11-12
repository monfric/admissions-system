<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;
use App\Core\Pagination;

/** Staff accounts (users table). */
final class UserRepository
{
    public function findById(int $id): ?array
    {
        return Database::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [$id]);
    }

    public function findByEmail(string $email): ?array
    {
        return Database::one('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [$email]);
    }

    /** @return array{0: array, 1: int} rows and total count */
    public function list(Pagination $page, ?bool $isActive, string $role): array
    {
        $where = ['deleted_at IS NULL'];
        $params = [];
        if ($page->search !== '') {
            $where[] = '(LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(email) LIKE ? OR phone_number LIKE ?)';
            $term = '%' . strtolower($page->search) . '%';
            array_push($params, $term, $term, $term, $term);
        }
        if ($isActive !== null) {
            $where[] = 'is_active = ?';
            $params[] = $isActive ? 1 : 0;
        }
        if ($role !== '') {
            $where[] = 'role = ?';
            $params[] = $role;
        }
        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value("SELECT COUNT(*) FROM users WHERE $whereSql", $params);
        $rows = Database::all("SELECT * FROM users WHERE $whereSql ORDER BY first_name, last_name, id " . $page->limitSql(), $params);
        return [$rows, $total];
    }

    public function stats(): array
    {
        return Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(is_active = 1), 0) AS active,
                    COALESCE(SUM(is_active = 0), 0) AS inactive,
                    COALESCE(SUM(role = 'admin'), 0) AS admins
               FROM users WHERE deleted_at IS NULL"
        ) ?? [];
    }

    /** Active admins other than $exceptId (so the last admin can't be removed). */
    public function countOtherActiveAdmins(int $exceptId): int
    {
        return (int) Database::value(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND deleted_at IS NULL AND id <> ?",
            [$exceptId]
        );
    }

    public function create(array $data): int
    {
        return Database::insert('users', $data);
    }

    public function update(int $id, array $data): void
    {
        Database::update('users', $id, $data);
    }

    /**
     * Soft-deletes a user. The email gets a "deleted" suffix so it can be
     * used for a new account (the email column is unique).
     */
    public function delete(int $id): void
    {
        Database::execute(
            "UPDATE users SET deleted_at = ?, email = CONCAT(LEFT(email, 70), '.deleted.', id) WHERE id = ? AND deleted_at IS NULL",
            [Database::now(), $id]
        );
    }
}
