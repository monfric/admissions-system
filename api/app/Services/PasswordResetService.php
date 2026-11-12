<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\HttpException;

/**
 * "Forgot password?" for applicants and staff, and the set-password link in
 * a new staff member's welcome email. A link holds a random token; only its
 * SHA-256 hash is stored, it works once, and requesting a new one cancels
 * the old ones.
 */
final class PasswordResetService
{
    public const RESET_MINUTES = 60;
    public const WELCOME_HOURS = 72;

    private const ACCOUNTS = [
        'applicant' => ['table' => 'applicants', 'route' => '/applicant/reset-password'],
        'staff'     => ['table' => 'users', 'route' => '/reset-password'],
    ];

    /**
     * Emails a reset link if the address belongs to an active account. Says
     * nothing either way, so the form can't be used to find out who has an account.
     */
    public function request(string $type, string $email): void
    {
        $table = self::ACCOUNTS[$type]['table'];
        $account = Database::one(
            "SELECT id, email, first_name, last_name FROM $table WHERE email = ? AND is_active = 1 AND deleted_at IS NULL",
            [strtolower(trim($email))]
        );
        if ($account === null) {
            return;
        }
        $url = $this->link($type, (int) $account['id'], self::RESET_MINUTES * 60);
        EmailQueue::push(
            $account['email'],
            trim($account['first_name'] . ' ' . $account['last_name']),
            'password_reset',
            EmailTemplates::passwordReset($account['first_name'], $url, self::RESET_MINUTES)
        );
    }

    /** Welcome email for a new staff account, with a link to choose their own password. */
    public function welcomeStaff(int $userId): void
    {
        try {
            $user = Database::one('SELECT id, email, first_name, last_name FROM users WHERE id = ? AND deleted_at IS NULL', [$userId]);
            if ($user === null) {
                return;
            }
            $url = $this->link('staff', $userId, self::WELCOME_HOURS * 3600);
            EmailQueue::push(
                $user['email'],
                trim($user['first_name'] . ' ' . $user['last_name']),
                'staff_welcome',
                EmailTemplates::staffWelcome($user['first_name'], $user['email'], $url, self::WELCOME_HOURS)
            );
        } catch (\Throwable) {
            // The account exists either way; the admin can tell them their password.
        }
    }

    /** Sets the new password if the token is valid, then uses it up (and any others for that account). */
    public function reset(string $type, string $token, string $password): void
    {
        $row = Database::one(
            'SELECT * FROM password_resets WHERE token_hash = ? AND account_type = ? AND used_at IS NULL AND deleted_at IS NULL',
            [hash('sha256', $token), $type]
        );
        if ($row === null || strtotime($row['expires_at']) < time()) {
            throw HttpException::badRequest('this link is invalid or has expired: please request a new one');
        }
        $table = self::ACCOUNTS[$type]['table'];
        $accountId = (int) $row['account_id'];
        $active = Database::value("SELECT id FROM $table WHERE id = ? AND is_active = 1 AND deleted_at IS NULL", [$accountId]);
        if ($active === null) {
            throw HttpException::badRequest('this account is inactive: please contact the admissions office');
        }
        Database::transaction(function () use ($table, $accountId, $type, $password) {
            Database::update($table, $accountId, ['password' => password_hash($password, PASSWORD_BCRYPT)]);
            $this->cancelLinks($type, $accountId);
        });
    }

    /** A new one-time link (cancelling older ones for the same account). */
    private function link(string $type, int $accountId, int $ttlSeconds): string
    {
        $token = bin2hex(random_bytes(32));
        Database::transaction(function () use ($type, $accountId, $token, $ttlSeconds) {
            $this->cancelLinks($type, $accountId);
            Database::insert('password_resets', [
                'account_type' => $type,
                'account_id'   => $accountId,
                'token_hash'   => hash('sha256', $token),
                'expires_at'   => date('Y-m-d H:i:s', time() + $ttlSeconds),
            ]);
        });
        $route = self::ACCOUNTS[$type]['route'] . '?token=' . $token;
        return $type === 'staff' ? EmailTemplates::staff($route) : EmailTemplates::portal($route);
    }

    private function cancelLinks(string $type, int $accountId): void
    {
        Database::execute(
            'UPDATE password_resets SET used_at = ?, updated_at = ? WHERE account_type = ? AND account_id = ? AND used_at IS NULL',
            [Database::now(), Database::now(), $type, $accountId]
        );
    }
}
