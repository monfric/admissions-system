<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\PasswordResetService;

/** /auth/forgot-password|reset-password (staff) and the same under /applicant-portal/auth. */
final class PasswordResetHandler
{
    private const SENT = 'If that email belongs to an account, a password reset link has been sent to it. The link expires in '
        . PasswordResetService::RESET_MINUTES . ' minutes.';

    public function staffForgot(Request $r): never
    {
        $this->forgot($r, 'staff');
    }

    public function staffReset(Request $r): never
    {
        $this->reset($r, 'staff');
    }

    public function applicantForgot(Request $r): never
    {
        $this->forgot($r, 'applicant');
    }

    public function applicantReset(Request $r): never
    {
        $this->reset($r, 'applicant');
    }

    private function forgot(Request $r, string $type): never
    {
        $req = Validator::validate($r->json(), ['email' => 'required|string|email|max:100']);
        (new PasswordResetService())->request($type, $req['email']);
        Response::success(self::SENT, null);
    }

    private function reset(Request $r, string $type): never
    {
        $req = Validator::validate($r->json(), [
            'token'    => 'required|string|max:128',
            'password' => 'required|string|min:8|max:72',
        ]);
        (new PasswordResetService())->reset($type, $req['token'], $req['password']);
        Response::success('Your password has been changed. You can now log in with it.', null);
    }
}
