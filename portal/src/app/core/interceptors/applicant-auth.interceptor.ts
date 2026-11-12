import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { ApplicantAuthService } from '../services/applicant-portal/applicant-auth.service';

/**
 * Sends the applicant's token with every portal API request. A 401 (other
 * than on login/register) ends the applicant session.
 */
export const applicantAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/applicant-portal/')) {
    return next(req);
  }

  const applicantAuth = inject(ApplicantAuthService);
  const token = applicantAuth.token;
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  const isAuthCall = req.url.includes('/applicant-portal/auth/');
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthCall) {
        applicantAuth.logout();
      }
      return throwError(() => error);
    })
  );
};
