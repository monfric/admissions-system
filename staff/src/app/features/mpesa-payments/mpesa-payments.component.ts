import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { MpesaPayment, MpesaPaymentService, MpesaPaymentStats } from '../../core/services/mpesa-payment.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';

type View = '' | 'needs_review' | 'success' | 'waiting' | 'unsuccessful';

/** Why a payment needs a look, in plain words. */
const FLAG_LABELS: Record<string, string> = {
  amount_mismatch: 'Amount differs from the request',
  underpaid: 'Less than the fee: balance still due',
  receipt_pending: 'M-Pesa receipt number not received yet',
  late: 'Confirmed after the request had timed out',
  duplicate_receipt: 'Receipt number already used on another payment'
};

const STATUS_LABELS: Record<string, string> = {
  starting: 'Sending', pending: 'Waiting for PIN', success: 'Paid', failed: 'Failed',
  cancelled: 'Cancelled', timeout: 'No response', expired: 'Expired', error: 'Error'
};

/** Applicants' M-Pesa payments: what came in, what failed, and what staff should check. */
@Component({
  selector: 'app-mpesa-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PaginationComponent],
  templateUrl: './mpesa-payments.component.html',
  styleUrl: './mpesa-payments.component.scss'
})
export class MpesaPaymentsComponent implements OnInit {
  payments: MpesaPayment[] = [];
  stats: MpesaPaymentStats | null = null;
  loading = false;

  searchTerm = '';
  view: View = '';
  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  reviewingId: number | null = null;
  downloadingId: number | null = null;

  constructor(private mpesa: MpesaPaymentService, private toast: ToastService) {}

  ngOnInit(): void {
    this.refresh();
  }

  get statCards(): { label: string; value: number | string; subtext: string; icon: string; color: string }[] {
    const s = this.stats;
    return [
      { label: 'Received Today', value: s ? 'KES ' + s.amount_today.toLocaleString() : '—', subtext: s ? `${s.successful} successful payments in total` : 'Loading…', icon: 'fas fa-coins', color: 'success' },
      { label: 'Needs Checking', value: s ? s.needs_review : '—', subtext: 'Different amount, missing receipt…', icon: 'fas fa-flag', color: 'warning' },
      { label: 'Waiting for PIN', value: s ? s.waiting : '—', subtext: 'Prompts on applicants\' phones', icon: 'fas fa-mobile-alt', color: 'info' },
      { label: 'Not Completed', value: s ? s.unsuccessful : '—', subtext: 'Cancelled, failed or timed out', icon: 'fas fa-times-circle', color: 'secondary' }
    ];
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  flagLabel(flag: string): string {
    return FLAG_LABELS[flag] ?? flag;
  }

  loadPayments(): void {
    this.loading = true;
    const status = this.view === 'needs_review' ? '' : this.view;
    const review = this.view === 'needs_review' ? 'needs_review' : '';
    this.mpesa.getAll(this.page, this.pageSize, this.searchTerm.trim(), status, review).subscribe({
      next: res => {
        this.loading = false;
        this.payments = res.data.data;
        this.totalItems = res.data.total_items;
        this.totalPages = res.data.total_pages;
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load M-Pesa payments.');
      }
    });
  }

  loadStats(): void {
    this.mpesa.getStats().subscribe({
      next: res => this.stats = res.data,
      error: err => console.error('Failed to load M-Pesa statistics:', err)
    });
  }

  refresh(): void {
    this.loadPayments();
    this.loadStats();
  }

  setView(view: View): void {
    this.view = view;
    this.page = 1;
    this.loadPayments();
  }

  onSearch(): void {
    this.page = 1;
    this.loadPayments();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadPayments();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size);
    this.page = 1;
    this.loadPayments();
  }

  markReviewed(p: MpesaPayment): void {
    this.reviewingId = p.id;
    this.mpesa.markReviewed(p.id).subscribe({
      next: res => {
        this.reviewingId = null;
        Object.assign(p, res.data);
        this.toast.showSuccess('Checked', 'Marked as checked.');
        this.loadStats();
      },
      error: err => {
        this.reviewingId = null;
        this.toast.showError('Error', err.error?.message || 'Failed to update the payment.');
      }
    });
  }

  downloadReceipt(p: MpesaPayment): void {
    if (!p.payment_id) return;
    this.downloadingId = p.id;
    this.mpesa.downloadReceipt(p.payment_id, `Receipt-${p.application_number}-${p.payment_id}.pdf`).subscribe({
      next: () => this.downloadingId = null,
      error: () => {
        this.downloadingId = null;
        this.toast.showError('Error', 'Failed to download the receipt.');
      }
    });
  }
}
