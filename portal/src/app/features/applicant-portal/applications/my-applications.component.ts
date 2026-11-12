import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

import { PortalApplication, PortalLetter, countdownDisplay, applicationStatus, decisionDisplay, programmeStatus } from '../../../core/models/applicant-portal/applicant-application.model';
import { choiceLabel } from '../../../core/models/registration/application-batch.model';
import { ApplicantPortalService } from '../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../core/services/toast/toast.service';

/** Every application the applicant has made, most recent first. */
@Component({
  selector: 'app-my-applications',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './my-applications.component.html',
  styleUrls: ['../shared/portal-ui.scss', './my-applications.component.scss']
})
export class MyApplicationsComponent implements OnInit {
  applications: PortalApplication[] = [];
  loading = true;
  errorMessage = '';
  openMenuId: number | null = null;

  readonly decisionDisplay = decisionDisplay;
  readonly applicationStatus = applicationStatus;
  readonly programmeStatus = programmeStatus;
  readonly choiceLabel = choiceLabel;
  readonly countdownDisplay = countdownDisplay;

  constructor(
    private portalService: ApplicantPortalService,
    private toast: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.portalService.getApplications().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success) {
          this.errorMessage = res.message || 'Failed to load your applications.';
          return;
        }
        this.applications = res.data || [];
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to load your applications.';
      }
    });
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.openMenuId = null;
  }

  toggleMenu(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  view(app: PortalApplication): void {
    this.openMenuId = null;
    this.router.navigate(['/applicant/applications', app.id]);
  }

  downloadLetter(app: PortalApplication, letter: PortalLetter): void {
    this.openMenuId = null;
    const fileName = `${letter.title.replace(/\s+/g, '-')}-${app.application_number}.pdf`;
    this.portalService.downloadFile(this.portalService.letterUrl(app.id, letter.type), fileName).subscribe({
      error: () => this.toast.showError('Download failed', 'Please try again.')
    });
  }
}
