import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApplicantAuthService } from '../services/applicant-portal/applicant-auth.service';

/** Only lets in a logged-in applicant; everyone else goes to the applicant login. */
export const applicantAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(ApplicantAuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  auth.logout(false);
  return router.createUrlTree(['/applicant/login'], { queryParams: { returnUrl: state.url } });
};
