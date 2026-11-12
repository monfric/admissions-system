import { Routes } from '@angular/router';

export const routes: Routes = [
  // The portal keeps its /applicant URLs (same as when it was part of the staff app).
  { path: '', redirectTo: 'applicant/login', pathMatch: 'full' },
  {
    path: 'applicant',
    loadChildren: () => import('./features/applicant-portal/applicant-portal.routes')
      .then(m => m.APPLICANT_PORTAL_ROUTES)
  },
  { path: '**', redirectTo: 'applicant/login' }
];
