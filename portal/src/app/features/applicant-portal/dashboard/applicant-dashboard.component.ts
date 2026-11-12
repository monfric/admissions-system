import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApplicantAuthService } from '../../../core/services/applicant-portal/applicant-auth.service';
import { ApplicantPortalService } from '../../../core/services/applicant-portal/applicant-portal.service';
import { PortalApplication, applicationStatus, countdownDisplay, decisionDisplay } from '../../../core/models/applicant-portal/applicant-application.model';

/** Applicant home: application summary, any offers needing attention, and a way to apply. */
@Component({
  selector: 'app-applicant-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './applicant-dashboard.component.html',
  styleUrls: ['../shared/portal-ui.scss', './applicant-dashboard.component.scss']
})
export class ApplicantDashboardComponent implements OnInit {
  applications: PortalApplication[] = [];
  /** Open intakes the applicant hasn't applied for yet. */
  openIntakeCount = 0;
  loading = true;
  errorMessage = '';

  readonly decisionDisplay = decisionDisplay;
  readonly applicationStatus = applicationStatus;
  readonly countdownDisplay = countdownDisplay;

  constructor(
    public applicantAuth: ApplicantAuthService,
    private portalService: ApplicantPortalService
  ) {}

  ngOnInit(): void {
    forkJoin({
      applications: this.portalService.getApplications(),
      options: this.portalService.getApplyOptions()
    }).subscribe({
      next: ({ applications, options }) => {
        this.loading = false;
        this.applications = applications.success ? applications.data || [] : [];
        this.openIntakeCount = options.success ? (options.data || []).filter(i => !i.already_applied).length : 0;
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to load your dashboard.';
      }
    });
  }

  get firstName(): string {
    return this.applicantAuth.session?.applicant?.first_name || '';
  }

  get recentApplications(): PortalApplication[] {
    return this.applications.slice(0, 3);
  }

  /** Applications where the applicant has been selected and the offer is still open. */
  get offers(): PortalApplication[] {
    return this.applications.filter(a => a.decision_status === 'notified');
  }

  /** Approved applications with an active admission. */
  get admissions(): PortalApplication[] {
    return this.applications.filter(a => !!a.admission);
  }

  /** Admitted applications whose uniform measurements are still to be submitted (or were reopened). */
  get uniformPending(): PortalApplication[] {
    return this.applications.filter(a => a.uniform_status === 'pending' || a.uniform_status === 'unlocked');
  }

  /** Applications still waiting for the application fee. */
  get unpaid(): PortalApplication[] {
    return this.applications.filter(a => a.payment_status !== 'paid' && a.decision_status === 'pending');
  }

  hasLetter(app: PortalApplication, type: string): boolean {
    return app.letters.some(l => l.type === type);
  }

  count(status: string): number {
    return this.applications.filter(a => applicationStatus(a) === status).length;
  }

  selectedProgramme(app: PortalApplication): string {
    return app.programmes.find(p => p.application_status === 'notified')?.programme_name || '';
  }
}
