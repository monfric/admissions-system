<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Tokens and the auth middleware. Staff and applicant tokens are signed with
 * different keys, so a staff token never passes the applicant check and vice
 * versa (same as the Go backend). Applicant endpoints take the applicant's ID
 * from the token only, never from the URL.
 */
final class Auth
{
    private const APPLICANT_TOKEN_TYPE = 'applicant';

    /** A real bcrypt hash checked when a login email is unknown, so failed logins take the same time. */
    public const DUMMY_PASSWORD_HASH = '$2y$10$Wt.Wyw6mf4yywz1h6a17ge46nAX7h5xbBMkiTr3/QZXGBARaX5BD6';

    public static function staffKey(): string
    {
        return (string) Config::get('jwt_secret');
    }

    /** applicant_jwt_secret, or a key derived from jwt_secret that is still distinct from it. */
    public static function applicantKey(): string
    {
        $key = (string) Config::get('applicant_jwt_secret', '');
        return $key !== '' ? $key : hash_hmac('sha256', 'applicant-portal-token-key', self::staffKey(), true);
    }

    /** @return array{0: string, 1: int} token and expiry (unix time) */
    public static function issueStaffToken(array $user): array
    {
        $expires = time() + 3600 * (int) Config::get('jwt_expiration_hours', 24);
        $token = Jwt::encode([
            'user_id' => (int) $user['id'],
            'email'   => $user['email'],
            'role'    => $user['role'],
            'iss'     => Config::get('app_name'),
            'iat'     => time(),
            'exp'     => $expires,
        ], self::staffKey());
        return [$token, $expires];
    }

    /** @return array{0: string, 1: int} token and expiry (unix time) */
    public static function issueApplicantToken(array $applicant): array
    {
        $expires = time() + 3600 * (int) Config::get('jwt_expiration_hours', 24);
        $token = Jwt::encode([
            'applicant_id' => (int) $applicant['id'],
            'email'        => $applicant['email'],
            'token_type'   => self::APPLICANT_TOKEN_TYPE,
            'iss'          => Config::get('app_name'),
            'sub'          => 'applicant',
            'iat'          => time(),
            'exp'          => $expires,
        ], self::applicantKey());
        return [$token, $expires];
    }

    /** Staff claims from a token, or null if it isn't a valid staff token. */
    public static function staffClaims(string $token): ?array
    {
        $claims = Jwt::decode($token, self::staffKey());
        return ($claims && (int) ($claims['user_id'] ?? 0) > 0) ? $claims : null;
    }

    /** Middleware: a valid staff token from an active staff account. */
    public static function staff(): callable
    {
        return function (Request $request): void {
            $token = $request->bearerToken();
            if ($token === null) {
                throw HttpException::unauthorized('Authorization header required');
            }
            $claims = self::staffClaims($token);
            if ($claims === null) {
                throw HttpException::unauthorized('Invalid or expired token');
            }
            $user = Database::one(
                'SELECT id, role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL',
                [(int) $claims['user_id']]
            );
            if ($user === null) {
                throw HttpException::unauthorized('Invalid or expired token');
            }
            $request->userId = (int) $user['id'];
            $request->userRole = (string) $user['role'];
        };
    }

    /** Middleware (after staff()): admins only. */
    public static function admin(): callable
    {
        return function (Request $request): void {
            if ($request->userRole !== 'admin') {
                throw HttpException::forbidden('Only administrators can do this');
            }
        };
    }

    /** Middleware: a valid applicant-portal token. */
    public static function applicant(): callable
    {
        return function (Request $request): void {
            $token = $request->bearerToken();
            if ($token === null) {
                throw HttpException::unauthorized('Authorization header required');
            }
            $claims = Jwt::decode($token, self::applicantKey());
            if (
                $claims === null
                || ($claims['token_type'] ?? '') !== self::APPLICANT_TOKEN_TYPE
                || (int) ($claims['applicant_id'] ?? 0) <= 0
            ) {
                throw HttpException::unauthorized('Invalid or expired token');
            }
            $request->applicantId = (int) $claims['applicant_id'];
        };
    }
}
