import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { EmailLogItem, EmailLogService, EmailLogStats } from '../../core/services/email-log.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';

type StatusFilter = '' | 'pending' | 'sent' | 'failed';

/** What each email is, for the Type column. */
const TEMPLATE_LABELS: Record<string, string> = {
  applicant_welcome: 'Welcome (applicant)',
  profile_submitted: 'Profile submitted',
  application_submitted: 'Application received',
  notified: 'Provisional offer',
  deadline_reminder: 'Offer deadline reminder',
  recalled: 'Offer expired',
  rejected: 'Application rejected',
  admitted: 'Admitted',
  uniform_unlocked: 'Uniform form reopened',
  staff_welcome: 'Welcome (staff)',
  password_reset: 'Password reset'
};

/** Templates holding a one-time link: never resent (the API refuses too). */
const SECRET_TEMPLATES = ['password_reset', 'staff_welcome'];

/** Admins: every email the system has queued, its status, and Resend. */
@Component({
  selector: 'app-email-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PaginationComponent],
  templateUrl: './email-log.component.html',
  styleUrl: './email-log.component.scss'
})
export class EmailLogComponent implements OnInit {
  emails: EmailLogItem[] = [];
  stats: EmailLogStats | null = null;
  loading = false;

  searchTerm = '';
  statusFilter: StatusFilter = '';
  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  /** The email open in the preview below the table. */
  preview: EmailLogItem | null = null;
  previewHtml: SafeHtml | null = null;
  resendingId: number | null = null;

  constructor(private emailLog: EmailLogService, private toast: ToastService, private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.refresh();
  }

  get statCards(): { label: string; value: number | string; subtext: string; icon: string; color: string }[] {
    const s = this.stats;
    return [
      { label: 'Sent Today', value: s ? s.sent_today : '—', subtext: s ? `${s.sent} sent in total` : 'Loading…', icon: 'fas fa-paper-plane', color: 'success' },
      { label: 'Waiting to Send', value: s ? s.pending : '—', subtext: 'Sent within a minute or two', icon: 'fas fa-hourglass-half', color: 'info' },
      { label: 'Failed', value: s ? s.failed : '—', subtext: 'Gave up after 5 tries · can be resent', icon: 'fas fa-exclamation-triangle', color: 'danger' },
      { label: 'All Emails', value: s ? s.total : '—', subtext: 'Queued by the system', icon: 'fas fa-envelope', color: 'primary' }
    ];
  }

  templateLabel(template: string): string {
    return TEMPLATE_LABELS[template] ?? template;
  }

  canResend(email: EmailLogItem): boolean {
    return email.status !== 'pending' && !SECRET_TEMPLATES.includes(email.template);
  }

  loadEmails(): void {
    this.loading = true;
    this.emailLog.getAll(this.page, this.pageSize, this.searchTerm.trim(), this.statusFilter).subscribe({
      next: res => {
        this.loading = false;
        this.emails = res.data.data;
        this.totalItems = res.data.total_items;
        this.totalPages = res.data.total_pages;
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load the email log.');
      }
    });
  }

  loadStats(): void {
    this.emailLog.getStats().subscribe({
      next: res => this.stats = res.data,
      error: err => console.error('Failed to load email statistics:', err)
    });
  }

  refresh(): void {
    this.loadEmails();
    this.loadStats();
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
    this.page = 1;
    this.loadEmails();
  }

  onSearch(): void {
    this.page = 1;
    this.loadEmails();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadEmails();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size);
    this.page = 1;
    this.loadEmails();
  }

  openPreview(email: EmailLogItem): void {
    if (this.preview?.id === email.id) {
      this.closePreview();
      return;
    }
    this.emailLog.getOne(email.id).subscribe({
      next: res => {
        this.preview = res.data;
        // Built by the API with every value escaped; shown in a sandboxed frame (no scripts).
        this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(res.data.html_body ?? '');
      },
      error: () => this.toast.showError('Error', 'Failed to load the email.')
    });
  }

  closePreview(): void {
    this.preview = null;
    this.previewHtml = null;
  }

  resend(email: EmailLogItem): void {
    this.resendingId = email.id;
    this.emailLog.resend(email.id).subscribe({
      next: res => {
        this.resendingId = null;
        this.toast.showSuccess('Queued', res.message);
        this.refresh();
      },
      error: err => {
        this.resendingId = null;
        this.toast.showError('Error', err.error?.message || 'Failed to resend the email.');
      }
    });
  }
}
