<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Repositories\UserRepository;

/** Staff login, session check and password change. */
final class StaffAuthService
{
    private UserRepository $users;

    public function __construct()
    {
        $this->users = new UserRepository();
    }

    public function login(string $email, string $password): array
    {
        $user = $this->users->findByEmail(strtolower(trim($email)));
        // Compare against a dummy hash when the email is unknown, so a failed
        // login takes about as long either way.
        if ($user === null) {
            password_verify($password, Auth::DUMMY_PASSWORD_HASH);
            throw HttpException::unauthorized('Invalid email or password');
        }
        if (!password_verify($password, $user['password'])) {
            throw HttpException::unauthorized('Invalid email or password');
        }
        if (!Format::bool($user['is_active'])) {
            throw HttpException::unauthorized('Your account is inactive. Please contact the administrator');
        }

        $this->users->update((int) $user['id'], ['last_login_at' => Database::now()]);
        $user['last_login_at'] = Database::now();

        [$token, $expiresAt] = Auth::issueStaffToken($user);
        return ['token' => $token, 'expires_at' => $expiresAt, 'user' => self::toResponse($user)];
    }

    /** Whether a token is a valid staff token for an active account. */
    public function verifyToken(string $token): array
    {
        $claims = Auth::staffClaims($token);
        if ($claims === null) {
            return ['valid' => false];
        }
        $user = $this->users->findById((int) $claims['user_id']);
        return ['valid' => $user !== null && Format::bool($user['is_active'])];
    }

    public function me(int $userId): array
    {
        $user = $this->users->findById($userId);
        if ($user === null) {
            throw HttpException::notFound('User not found');
        }
        return self::toResponse($user);
    }

    public function changePassword(int $userId, string $oldPassword, string $newPassword): void
    {
        $user = $this->users->findById($userId);
        if ($user === null || !password_verify($oldPassword, $user['password'])) {
            throw HttpException::badRequest('Current password is incorrect');
        }
        $this->users->update($userId, ['password' => password_hash($newPassword, PASSWORD_BCRYPT)]);
    }

    /** A staff account as sent to the staff app (never the password). */
    public static function toResponse(array $user): array
    {
        return [
            'id'            => (int) $user['id'],
            'email'         => $user['email'],
            'first_name'    => $user['first_name'],
            'last_name'     => $user['last_name'],
            'full_name'     => trim($user['first_name'] . ' ' . $user['last_name']),
            'phone_number'  => $user['phone_number'],
            'role'          => $user['role'],
            'is_active'     => Format::bool($user['is_active']),
            'last_login_at' => Format::dateTime($user['last_login_at']) ?: null,
            'created_at'    => Format::dateTime($user['created_at']),
        ];
    }
}
