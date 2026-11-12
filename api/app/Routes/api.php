<?php
declare(strict_types=1);

// Every API route, relative to /api/v1. Same URLs as the LMIS (Go) backend.

use App\Core\Auth;
use App\Core\RateLimiter;
use App\Core\Router;
use App\Handlers\AcademicSetupHandler;
use App\Handlers\ApplicantHandler;
use App\Handlers\ApplicantPortalApplicationHandler;
use App\Handlers\ApplicantPortalAuthHandler;
use App\Handlers\ApplicantPortalProfileHandler;
use App\Handlers\DashboardHandler;
use App\Handlers\EmailLogHandler;
use App\Handlers\HealthHandler;
use App\Handlers\IntakeHandler;
use App\Handlers\LetterDocumentHandler;
use App\Handlers\PasswordResetHandler;
use App\Handlers\StaffApplicationHandler;
use App\Handlers\StaffAuthHandler;
use App\Handlers\UserHandler;

return function (Router $r): void {
    $r->get('/health', [HealthHandler::class, 'health']);

    // ── Staff app ────────────────────────────────────────────────────────────
    $r->group('/auth', [], function (Router $r) {
        $r->post('/login', [StaffAuthHandler::class, 'login'], [RateLimiter::middleware(10, 15 * 60)]);
        $r->post('/verify-token', [StaffAuthHandler::class, 'verifyToken']);
        $r->post('/forgot-password', [PasswordResetHandler::class, 'staffForgot'], [RateLimiter::middleware(5, 3600)]);
        $r->post('/reset-password', [PasswordResetHandler::class, 'staffReset'], [RateLimiter::middleware(10, 3600)]);
        $r->group('', [Auth::staff()], function (Router $r) {
            $r->get('/me', [StaffAuthHandler::class, 'me']);
            $r->post('/change-password', [StaffAuthHandler::class, 'changePassword']);
            $r->post('/logout', [StaffAuthHandler::class, 'logout']);
        });
    });

    // Staff Users page: admins only.
    $r->group('/users', [Auth::staff(), Auth::admin()], function (Router $r) {
        $r->get('', [UserHandler::class, 'list']);
        $r->post('', [UserHandler::class, 'create']);
        $r->get('/stats', [UserHandler::class, 'stats']);
        $r->get('/:id', [UserHandler::class, 'show']);
        $r->put('/:id', [UserHandler::class, 'update']);
        $r->delete('/:id', [UserHandler::class, 'delete']);
        $r->post('/:id/activate', [UserHandler::class, 'activate']);
        $r->post('/:id/deactivate', [UserHandler::class, 'deactivate']);
    });

    // Email Log page: admins only.
    $r->group('/email-log', [Auth::staff(), Auth::admin()], function (Router $r) {
        $r->get('', [EmailLogHandler::class, 'list']);
        $r->get('/stats', [EmailLogHandler::class, 'stats']);
        $r->get('/:id', [EmailLogHandler::class, 'show']);
        $r->post('/:id/resend', [EmailLogHandler::class, 'resend']);
    });

    // Everything below needs a logged-in staff user. Fixed paths such as
    // /stats come before /:id so they aren't read as an ID.
    $r->group('', [Auth::staff()], function (Router $r) {
        // Dashboard (staff landing page)
        $r->get('/dashboard/stats', [DashboardHandler::class, 'stats']);

        // Academic setup
        foreach ([
            '/faculties'       => ['listFaculties', 'createFaculty', 'getFaculty', 'updateFaculty', 'deleteFaculty'],
            '/departments'     => ['listDepartments', 'createDepartment', 'getDepartment', 'updateDepartment', 'deleteDepartment'],
            '/training-levels' => ['listTrainingLevels', 'createTrainingLevel', 'getTrainingLevel', 'updateTrainingLevel', 'deleteTrainingLevel'],
            '/programmes'      => ['listProgrammes', 'createProgramme', 'getProgramme', 'updateProgramme', 'deleteProgramme'],
        ] as $path => [$list, $create, $get, $update, $delete]) {
            $r->get($path, [AcademicSetupHandler::class, $list]);
            $r->post($path, [AcademicSetupHandler::class, $create]);
            $r->get("$path/:id", [AcademicSetupHandler::class, $get]);
            $r->put("$path/:id", [AcademicSetupHandler::class, $update]);
            $r->delete("$path/:id", [AcademicSetupHandler::class, $delete]);
        }

        // Intakes and what's open in them
        $r->get('/intakes', [IntakeHandler::class, 'list']);
        $r->post('/intakes', [IntakeHandler::class, 'create']);
        $r->get('/intakes/stats', [IntakeHandler::class, 'stats']);
        $r->get('/intakes/:id', [IntakeHandler::class, 'show']);
        $r->put('/intakes/:id', [IntakeHandler::class, 'update']);
        $r->delete('/intakes/:id', [IntakeHandler::class, 'delete']);
        $r->get('/intakes/:id/programmes', [IntakeHandler::class, 'programmes']);
        $r->post('/intakes/:id/programmes', [IntakeHandler::class, 'addProgramme']);
        $r->put('/intake-programmes/:id', [IntakeHandler::class, 'updateProgramme']);
        $r->delete('/intake-programmes/:id', [IntakeHandler::class, 'removeProgramme']);
        $r->get('/intakes/:id/training-levels', [IntakeHandler::class, 'trainingLevels']);
        $r->post('/intakes/:id/training-levels', [IntakeHandler::class, 'addTrainingLevel']);
        $r->put('/intake-training-levels/:id', [IntakeHandler::class, 'updateTrainingLevel']);
        $r->delete('/intake-training-levels/:id', [IntakeHandler::class, 'removeTrainingLevel']);

        // Applicants (New Applicants page)
        $r->get('/applicants', [ApplicantHandler::class, 'list']);
        $r->post('/applicants', [ApplicantHandler::class, 'create']);
        $r->get('/applicants/stats', [ApplicantHandler::class, 'stats']);
        $r->post('/applicants/documents/:id/upload', [ApplicantHandler::class, 'upload']);
        $r->get('/applicants/documents/:id/files/:type', [ApplicantHandler::class, 'file']);
        $r->delete('/applicants/documents/:id/files/:type', [ApplicantHandler::class, 'deleteFile']);
        $r->get('/applicants/:id', [ApplicantHandler::class, 'show']);
        $r->put('/applicants/:id', [ApplicantHandler::class, 'update']);
        $r->delete('/applicants/:id', [ApplicantHandler::class, 'delete']);
        $r->post('/applicants/:id/application-batches', [StaffApplicationHandler::class, 'assign']);

        // Applications: lists, Pay, Notify, Approve/Reject
        $r->get('/application-batches', [StaffApplicationHandler::class, 'list']);
        $r->get('/application-batches/stats', [StaffApplicationHandler::class, 'stats']);
        $r->post('/application-batches/:id/payments', [StaffApplicationHandler::class, 'pay']);
        $r->post('/application-batches/:id/notify', [StaffApplicationHandler::class, 'notify']);
        $r->post('/application-batches/:id/decision', [StaffApplicationHandler::class, 'decide']);

        // Approved Applications
        $r->get('/admissions', [StaffApplicationHandler::class, 'admissions']);
        $r->get('/admissions/stats', [StaffApplicationHandler::class, 'admissionStats']);

        // Offer letters
        $r->get('/offer-letters', [LetterDocumentHandler::class, 'listLetters']);
        $r->post('/offer-letters', [LetterDocumentHandler::class, 'createLetter']);
        $r->get('/offer-letters/:id', [LetterDocumentHandler::class, 'getLetter']);
        $r->get('/offer-letters/:id/preview', [LetterDocumentHandler::class, 'previewLetter']);
        $r->put('/offer-letters/:id', [LetterDocumentHandler::class, 'updateLetter']);
        $r->delete('/offer-letters/:id', [LetterDocumentHandler::class, 'deleteLetter']);

        // Application documents (multipart uploads, PDF only)
        $r->get('/application-documents', [LetterDocumentHandler::class, 'listDocuments']);
        $r->post('/application-documents', [LetterDocumentHandler::class, 'createDocument']);
        $r->get('/application-documents/stats', [LetterDocumentHandler::class, 'documentStats']);
        $r->get('/application-documents/:id', [LetterDocumentHandler::class, 'getDocument']);
        $r->get('/application-documents/:id/file', [LetterDocumentHandler::class, 'documentFile']);
        $r->put('/application-documents/:id', [LetterDocumentHandler::class, 'updateDocument']);
        $r->delete('/application-documents/:id', [LetterDocumentHandler::class, 'deleteDocument']);

        // Uniform measurements
        $r->get('/uniform-measurements', [StaffApplicationHandler::class, 'uniformList']);
        $r->get('/uniform-measurements/sets', [StaffApplicationHandler::class, 'uniformSets']);
        $r->get('/uniform-measurements/stats', [StaffApplicationHandler::class, 'uniformStats']);
        $r->get('/uniform-measurements/:admissionId', [StaffApplicationHandler::class, 'uniformShow']);
        $r->get('/uniform-measurements/:admissionId/pdf', [StaffApplicationHandler::class, 'uniformPdf']);
        $r->post('/uniform-measurements/:admissionId/unlock', [StaffApplicationHandler::class, 'uniformUnlock']);
    });

    // ── Applicant portal ─────────────────────────────────────────────────────
    $r->group('/applicant-portal', [], function (Router $r) {
        $r->post('/auth/register', [ApplicantPortalAuthHandler::class, 'register'], [RateLimiter::middleware(5, 3600)]);
        $r->post('/auth/login', [ApplicantPortalAuthHandler::class, 'login'], [RateLimiter::middleware(10, 15 * 60)]);
        $r->post('/auth/forgot-password', [PasswordResetHandler::class, 'applicantForgot'], [RateLimiter::middleware(5, 3600)]);
        $r->post('/auth/reset-password', [PasswordResetHandler::class, 'applicantReset'], [RateLimiter::middleware(10, 3600)]);

        $r->group('', [Auth::applicant()], function (Router $r) {
            $r->get('/me', [ApplicantPortalAuthHandler::class, 'me']);

            $r->get('/profile', [ApplicantPortalProfileHandler::class, 'get']);
            $r->put('/profile', [ApplicantPortalProfileHandler::class, 'update']);
            $r->post('/profile/submit', [ApplicantPortalProfileHandler::class, 'submit']);
            // Documents stay editable after the profile is submitted.
            $r->post('/profile/documents/:type', [ApplicantPortalProfileHandler::class, 'uploadDocument']);
            $r->get('/profile/documents/:type', [ApplicantPortalProfileHandler::class, 'getDocument']);

            // Applying needs a submitted profile. Applications are permanent:
            // there's no update or delete.
            $r->get('/apply-options', [ApplicantPortalApplicationHandler::class, 'applyOptions']);
            $r->get('/applications', [ApplicantPortalApplicationHandler::class, 'list']);
            $r->post('/applications', [ApplicantPortalApplicationHandler::class, 'apply']);
            $r->get('/applications/:id', [ApplicantPortalApplicationHandler::class, 'show']);
            $r->get('/applications/:id/letters/:type', [ApplicantPortalApplicationHandler::class, 'letter']);
            $r->get('/applications/:id/documents/:documentId', [ApplicantPortalApplicationHandler::class, 'document']);
            // Admitted applicants fill in their uniform measurements to unlock their documents.
            $r->get('/applications/:id/uniform', [ApplicantPortalApplicationHandler::class, 'uniformForm']);
            $r->put('/applications/:id/uniform', [ApplicantPortalApplicationHandler::class, 'submitUniform']);
            $r->get('/applications/:id/uniform/pdf', [ApplicantPortalApplicationHandler::class, 'uniformPdf']);
            $r->get('/payments', [ApplicantPortalApplicationHandler::class, 'payments']);
        });
    });
};
