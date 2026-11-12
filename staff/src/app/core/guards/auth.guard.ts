import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';

/** Only logged-in staff get past; everyone else goes to the login page. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn) return true;
  auth.logout(false);
  return inject(Router).createUrlTree(['/login']);
};

/** Admins only (the Staff Users page). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin ? true : inject(Router).createUrlTree(['/dashboard']);
};
