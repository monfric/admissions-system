import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApplicantAuthService } from '../services/applicant-portal/applicant-auth.service';

/**
 * Sends applicants who haven't submitted their profile to the profile-setup
 * form. Checks the server (not just the cached session) so the answer is
 * current; on failure the interceptor handles 401s and we stay put.
 */
export const applicantProfileCompleteGuard: CanActivateFn = () => {
  const auth = inject(ApplicantAuthService);
  const router = inject(Router);

  return auth.me().pipe(
    map(applicant => applicant.profile_complete ? true : router.createUrlTree(['/applicant/profile-setup'])),
    catchError(() => of(router.createUrlTree(['/applicant/login'])))
  );
};
