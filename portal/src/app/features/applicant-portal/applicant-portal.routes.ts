import { Routes } from '@angular/router';
import { applicantAuthGuard } from '../../core/guards/applicant-auth.guard';
import { applicantProfileCompleteGuard } from '../../core/guards/applicant-profile-complete.guard';

export const APPLICANT_PORTAL_ROUTES: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./auth/applicant-login/applicant-login.component').then(m => m.ApplicantLoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/applicant-register/applicant-register.component').then(m => m.ApplicantRegisterComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    // Opened from the emailed link: /applicant/reset-password?token=…
    path: 'reset-password',
    loadComponent: () => import('./auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  {
    path: '',
    canActivate: [applicantAuthGuard],
    loadComponent: () => import('./layout/applicant-layout/applicant-layout.component').then(m => m.ApplicantLayoutComponent),
    children: [
      {
        path: 'profile-setup',
        loadComponent: () => import('./profile-setup/profile-setup.component').then(m => m.ProfileSetupComponent)
      },
      {
        path: 'profile',
        canActivate: [applicantProfileCompleteGuard],
        loadComponent: () => import('./profile/applicant-profile.component').then(m => m.ApplicantProfileComponent)
      },
      {
        path: 'dashboard',
        canActivate: [applicantProfileCompleteGuard],
        loadComponent: () => import('./dashboard/applicant-dashboard.component').then(m => m.ApplicantDashboardComponent)
      },
      {
        path: 'apply',
        canActivate: [applicantProfileCompleteGuard],
        loadComponent: () => import('./apply/apply.component').then(m => m.ApplyComponent)
      },
      {
        path: 'applications',
        canActivate: [applicantProfileCompleteGuard],
        loadComponent: () => import('./applications/my-applications.component').then(m => m.MyApplicationsComponent)
      },
      {
        path: 'applications/:id',
        canActivate: [applicantProfileCompleteGuard],
        loadComponent: () => import('./applications/application-detail/application-detail.component').then(m => m.ApplicationDetailComponent)
      },
      {
        path: 'applications/:id/uniform',
        canActivate: [applicantProfileCompleteGuard],
        loadComponent: () => import('./applications/uniform-measurements/uniform-measurements.component').then(m => m.UniformMeasurementsComponent)
      },
      {
        path: 'payments',
        canActivate: [applicantProfileCompleteGuard],
        loadComponent: () => import('./payments/my-payments.component').then(m => m.MyPaymentsComponent)
      }
    ]
  }
];
