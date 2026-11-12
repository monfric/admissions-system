<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\ApplicantPortalAuthService;

/** /applicant-portal/auth/... and /applicant-portal/me */
final class ApplicantPortalAuthHandler
{
    private ApplicantPortalAuthService $auth;

    public function __construct()
    {
        $this->auth = new ApplicantPortalAuthService();
    }

    public function register(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'first_name'   => 'required|string|max:100',
            'last_name'    => 'required|string|max:100',
            'email'        => 'required|string|email|max:100',
            'phone_number' => 'required|string|max:20',
            'id_number'    => 'required|string|max:50',
            'password'     => 'required|string|min:8|max:72',
        ]);
        Response::created('Account created successfully', $this->auth->register($req));
    }

    public function login(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'email'    => 'required|string|email',
            'password' => 'required|string',
        ]);
        Response::success('Login successful', $this->auth->login($req['email'], $req['password']));
    }

    public function me(Request $request): never
    {
        Response::success('Applicant retrieved successfully', $this->auth->me($request->applicantId));
    }
}
