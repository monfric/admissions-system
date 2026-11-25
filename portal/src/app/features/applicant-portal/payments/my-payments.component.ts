import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { PortalPayment } from '../../../core/models/applicant-portal/applicant-application.model';
import { ApplicantPortalService } from '../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../core/services/toast/toast.service';

/** The application-fee payments recorded for the applicant, each with a PDF receipt. */
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
  /** Id of the payment whose receipt is downloading. */
  downloading: number | null = null;

  constructor(private portalService: ApplicantPortalService, private toast: ToastService) {}

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

  downloadReceipt(p: PortalPayment): void {
    this.downloading = p.id;
    this.portalService.downloadFile(this.portalService.receiptUrl(p.id), `Receipt-${p.application_number}-${p.id}.pdf`).subscribe({
      next: () => this.downloading = null,
      error: () => {
        this.downloading = null;
        this.toast.showError('Download failed', 'Please try again.');
      }
    });
  }
}
