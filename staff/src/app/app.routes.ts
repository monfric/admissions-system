import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards/auth.guard';

const page = (path: string, load: () => Promise<any>) => ({ path, loadComponent: load });

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  // Opened from the emailed link: /reset-password?token=…
  { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/staff-layout.component').then(m => m.StaffLayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      page('dashboard', () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)),

      // Applications
      page('new-applicants', () => import('./features/registration/applications/new-applicants/new-applicants.component').then(m => m.NewApplicantsComponent)),
      page('unpaid-applications', () => import('./features/registration/applications/unpaid-applications/unpaid-applications.component').then(m => m.UnpaidApplicationsComponent)),
      page('paid-applications', () => import('./features/registration/applications/paid-applications/paid-applications.component').then(m => m.PaidApplicationsComponent)),
      page('notified-applications', () => import('./features/registration/applications/notified-applications/notified-applications.component').then(m => m.NotifiedApplicationsComponent)),
      page('approved-applications', () => import('./features/registration/applications/approved-applications/approved-applications.component').then(m => m.ApprovedApplicationsComponent)),
      page('recalled-applications', () => import('./features/registration/applications/recalled-applications/recalled-applications.component').then(m => m.RecalledApplicationsComponent)),
      page('rejected-applications', () => import('./features/registration/applications/rejected-applications/rejected-applications.component').then(m => m.RejectedApplicationsComponent)),
      page('offer-letter', () => import('./features/registration/applications/offer-letters/offer-letters.component').then(m => m.OfferLettersComponent)),
      page('application-documents', () => import('./features/registration/applications/application-documents/application-documents.component').then(m => m.ApplicationDocumentsComponent)),
      page('uniform-measurements', () => import('./features/registration/applications/uniform-measurements/uniform-measurements.component').then(m => m.UniformMeasurementsComponent)),
      page('applications-reports', () => import('./features/registration/applications/applications-reports/applications-reports.component').then(m => m.ApplicationsReportsComponent)),
      page('intakes', () => import('./features/registration/applications/intakes/intakes.component').then(m => m.IntakesComponent)),

      // Academic structure
      page('faculties', () => import('./features/admin/faculty/faculty.component').then(m => m.FacultyComponent)),
      page('departments', () => import('./features/admin/departments/department-list/department-list.component').then(m => m.DepartmentListComponent)),
      page('training-levels', () => import('./features/admin/training-level/training-level-list/training-level-list.component').then(m => m.TrainingLevelListComponent)),
      page('programmes', () => import('./features/admin/programme/programme-list/programme-list.component').then(m => m.ProgrammeListComponent)),

      // Administration
      { path: 'users', canActivate: [adminGuard], loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent) },
      { path: 'email-log', canActivate: [adminGuard], loadComponent: () => import('./features/email-log/email-log.component').then(m => m.EmailLogComponent) }
    ]
  },
  { path: '**', redirectTo: '' }
];
