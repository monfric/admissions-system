import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { PortalPayment } from '../../../core/models/applicant-portal/applicant-application.model';
import { ApplicantPortalService } from '../../../core/services/applicant-portal/applicant-portal.service';

/** Read-only list of the application-fee payments recorded for the applicant. */
@Component({
  selector: 'app-my-payments',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './my-payments.component.html'
})
export class MyPaymentsComponent implements OnInit {
  payments: PortalPayment[] = [];
  loading = true;
  errorMessage = '';

  constructor(private portalService: ApplicantPortalService) {}

  ngOnInit(): void {
    this.portalService.getPayments().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success) {
          this.errorMessage = res.message || 'Failed to load your payments.';
          return;
        }
        this.payments = res.data || [];
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to load your payments.';
      }
    });
  }
}
