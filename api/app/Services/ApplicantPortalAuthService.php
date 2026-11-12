<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Validator;
use App\Repositories\ApplicantRepository;

/** Applicant portal sign-up, login and session (same rules as the Go backend). */
final class ApplicantPortalAuthService
{
    private ApplicantRepository $applicants;

    public function __construct()
    {
        $this->applicants = new ApplicantRepository();
    }

    /**
     * Creates an applicant account and logs them straight in. Email and ID
     * number uniqueness is checked here in code.
     */
    public function register(array $req): array
    {
        $email = strtolower(trim($req['email']));
        $idNumber = trim($req['id_number']);
        Validator::digitsOnly(['Phone number' => $req['phone_number']]);

        if ($this->applicants->findByEmail($email) !== null) {
            throw HttpException::badRequest('an account with this email already exists');
        }
        if ($this->applicants->findByIdNumber($idNumber) !== null) {
            throw HttpException::badRequest('an account with this ID number already exists');
        }

        $id = $this->applicants->create([
            'email'        => $email,
            'password'     => password_hash($req['password'], PASSWORD_BCRYPT),
            'first_name'   => trim($req['first_name']),
            'last_name'    => trim($req['last_name']),
            'phone_number' => trim($req['phone_number']),
            'id_number'    => $idNumber,
            'is_active'    => 1,
        ]);
        Notifications::applicantRegistered($id);
        return $this->authResponse($this->applicants->findById($id));
    }

    public function login(string $email, string $password): array
    {
        $applicant = $this->applicants->findByEmail(strtolower(trim($email)));
        if ($applicant === null) {
            // Same work as a real check, so timing doesn't reveal unknown emails.
            password_verify($password, Auth::DUMMY_PASSWORD_HASH);
            throw HttpException::unauthorized('Invalid email or password');
        }
        if (!password_verify($password, $applicant['password'])) {
            throw HttpException::unauthorized('Invalid email or password');
        }
        if (!Format::bool($applicant['is_active'])) {
            throw HttpException::unauthorized('your account is inactive. Please contact the registry office');
        }
        return $this->authResponse($applicant);
    }

    public function me(int $applicantId): array
    {
        $applicant = $this->applicants->findById($applicantId);
        if ($applicant === null || !Format::bool($applicant['is_active'])) {
            throw HttpException::unauthorized('your account is inactive');
        }
        return self::sessionInfo($applicant);
    }

    private function authResponse(array $applicant): array
    {
        [$token, $expiresAt] = Auth::issueApplicantToken($applicant);
        return ['token' => $token, 'expires_at' => $expiresAt, 'applicant' => self::sessionInfo($applicant)];
    }

    /** The logged-in applicant as the portal sees them. */
    public static function sessionInfo(array $applicant): array
    {
        return [
            'id'               => (int) $applicant['id'],
            'first_name'       => $applicant['first_name'],
            'last_name'        => $applicant['last_name'],
            'full_name'        => ApplicantRepository::fullName($applicant),
            'email'            => $applicant['email'],
            'phone_number'     => $applicant['phone_number'],
            'id_number'        => $applicant['id_number'],
            'profile_complete' => Format::bool($applicant['mark_complete']),
        ];
    }
}
