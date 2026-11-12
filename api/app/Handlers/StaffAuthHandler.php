<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\StaffAuthService;

/** /auth/... for the staff app. */
final class StaffAuthHandler
{
    private StaffAuthService $auth;

    public function __construct()
    {
        $this->auth = new StaffAuthService();
    }

    public function login(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'email'    => 'required|string|email',
            'password' => 'required|string|min:6',
        ]);
        Response::success('Login successful', $this->auth->login($req['email'], $req['password']));
    }

    public function verifyToken(Request $request): never
    {
        $req = Validator::validate($request->json(), ['token' => 'required|string']);
        Response::success('Token checked', $this->auth->verifyToken($req['token']));
    }

    public function me(Request $request): never
    {
        Response::success('User retrieved successfully', $this->auth->me($request->userId));
    }

    public function changePassword(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'old_password' => 'required|string',
            'new_password' => 'required|string|min:8|max:72',
        ]);
        $this->auth->changePassword($request->userId, $req['old_password'], $req['new_password']);
        Response::success('Password changed successfully');
    }

    /** Tokens are stateless; the app just forgets its token. */
    public function logout(Request $request): never
    {
        Response::success('Logged out successfully');
    }
}
