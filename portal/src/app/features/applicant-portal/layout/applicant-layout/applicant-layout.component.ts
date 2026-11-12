import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApplicantAuthService } from '../../../../core/services/applicant-portal/applicant-auth.service';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';

/** Shell for every logged-in applicant page — separate from all staff layouts. */
@Component({
  selector: 'app-applicant-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FooterComponent],
  templateUrl: './applicant-layout.component.html',
  styleUrl: './applicant-layout.component.scss'
})
export class ApplicantLayoutComponent {
  constructor(public applicantAuth: ApplicantAuthService) {}

  get firstName(): string {
    return this.applicantAuth.session?.applicant.first_name ?? '';
  }

  get nameInitial(): string {
    return (this.firstName || 'A').charAt(0).toUpperCase();
  }

  get profileComplete(): boolean {
    return !!this.applicantAuth.session?.applicant.profile_complete;
  }

  logout(): void {
    this.applicantAuth.logout();
  }
}
