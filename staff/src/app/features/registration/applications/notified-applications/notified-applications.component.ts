import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

import { ApplicationBatch, ApplicationBatchStats, choiceLabel, residenceSplit } from '../../../../core/models/registration/application-batch.model';
import { ApplicationBatchService, ApplicationListFilters } from '../../../../core/services/registration/application-batch.service';
import { ApplicationFiltersComponent } from '../../../../shared/components/registration/application-filters/application-filters.component';
import { ApplicantService } from '../../../../core/services/registration/applicant.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ApplicantDialogComponent } from '../new-applicants/applicant-dialog/applicant-dialog.component';
import { ApproveApplicationDialogComponent } from './approve-application-dialog/approve-application-dialog.component';

// Days an applicant has to respond once notified before losing the offer.
// They keep the whole of the last day; the backend recalls them the day after.
const DEADLINE_DAYS = 30;

@Component({
  selector: 'app-notified-applications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent, ApplicationFiltersComponent],
  templateUrl: './notified-applications.component.html',
  styleUrl: './notified-applications.component.scss'
})
export class NotifiedApplicationsComponent implements OnInit {

  batches: ApplicationBatch[] = [];
  loading = false;

  searchTerm = '';
  filters: ApplicationListFilters = {};

  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  openMenuId: number | null = null;
  stats: ApplicationBatchStats | null = null;

  // Applicant profile photos are served from an authenticated endpoint, so
  // they're fetched as blobs and turned into object URLs.
  applicantImageUrls = new Map<number, SafeUrl>();

  constructor(
    private dialog: MatDialog,
    private applicationBatchService: ApplicationBatchService,
    private applicantService: ApplicantService,
    private toast: ToastService,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadBatches();
    this.loadStats();
  }

  /** Loads the counts for the cards above the table (paid and notified, like the list). */
  loadStats(): void {
    this.applicationBatchService.getStats({ payment_status: 'paid', decision_status: 'notified' }).subscribe({
      next: res => {
        if (res.success) this.stats = res.data;
        else console.error('Failed to load statistics:', res.message);
      },
      error: err => console.error('Failed to load statistics:', err)
    });
  }

  /** The cards above the table; values show "—" until the counts arrive (or if they fail to load). */
  get statCards(): { label: string; value: number | string; subtext: string; icon: string; color: string }[] {
    const s = this.stats;
    return [
      { label: 'Notified Applications', value: s ? s.total : '—', subtext: s ? this.genderSplit(s) : 'Loading…',
        icon: 'fas fa-bell', color: 'info' },
      { label: s ? `Expiring Within ${s.expiring_within_days} Days` : 'Expiring Soon', value: s ? s.expiring_soon : '—',
        subtext: s ? `${s.last_day} on ${s.last_day === 1 ? 'its' : 'their'} last day` : 'Loading…',
        icon: 'fas fa-stopwatch', color: 'danger' },
      { label: 'Boarders · Day Scholars', value: s ? `${s.boarders} · ${s.day_scholars}` : '—',
        subtext: s ? residenceSplit(s.boarders, s.day_scholars) : 'Loading…', icon: 'fas fa-bed', color: 'teal' }
    ];
  }

  /** "4 male · 3 female" (plus "· N other" when there are any). */
  private genderSplit(s: { male: number; female: number; other_gender: number }): string {
    const parts = [`${s.male} male`, `${s.female} female`];
    if (s.other_gender > 0) parts.push(`${s.other_gender} other`);
    return parts.join(' · ');
  }

  /** A dropdown filter changed: back to page 1 and reload. */
  onFiltersChange(filters: ApplicationListFilters): void {
    this.filters = filters;
    this.page = 1;
    this.loadBatches();
  }

  loadBatches(): void {
    this.loading = true;
    this.applicationBatchService.getAll(
      this.page, this.pageSize, this.searchTerm || undefined, 'paid', undefined, 'notified', this.filters
    ).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.batches = res.data.data;
          this.totalItems = res.data.total_items;
          this.totalPages = res.data.total_pages;
          this.loadApplicantPhotos(this.batches);
        }
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load notified applications.');
      }
    });
  }

  private loadApplicantPhotos(batches: ApplicationBatch[]): void {
    batches.forEach(b => {
      if (b.applicant_profile_photo && b.applicant_id) this.loadApplicantPhoto(b.applicant_id);
    });
  }

  private loadApplicantPhoto(applicantId: number): void {
    const url = `${environment.apiUrl}/applicants/documents/${applicantId}/files/profile?t=${Date.now()}`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: blob => {
        const safeUrl = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
        this.applicantImageUrls.set(applicantId, safeUrl);
      },
      error: () => {}
    });
  }

  getApplicantPhotoUrl(batch: ApplicationBatch): SafeUrl | null {
    return this.applicantImageUrls.get(batch.applicant_id) ?? null;
  }

  courseNotified(batch: ApplicationBatch): string {
    const notified = batch.applications.find(a => a.application_status === 'notified');
    if (!notified) return '';
    const choice = choiceLabel(notified.choice);
    return choice ? `${notified.programme_name} (${choice})` : notified.programme_name;
  }

  /**
   * Whole days left before the deadline, counted from the notification date.
   * Returns null when the batch has no notification date, 0 on the last day,
   * and a negative number once the deadline has passed (until the backend's
   * hourly recall job moves the batch to Recalled).
   */
  remainingDays(batch: ApplicationBatch): number | null {
    if (!batch.notified_at) return null;
    const notified = new Date(batch.notified_at.replace(' ', 'T'));
    if (isNaN(notified.getTime())) return null;
    notified.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsed = Math.round((today.getTime() - notified.getTime()) / 86_400_000);
    return DEADLINE_DAYS - elapsed;
  }

  remainingBadgeClass(days: number): string {
    if (days > 10) return 'badge-success';
    if (days > 3) return 'badge-warning';
    return 'badge-danger';
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadBatches();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadBatches();
  }

  onSearch(): void {
    this.page = 1;
    this.loadBatches();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  // ── Row actions ────────────────────────────────────────────

  @HostListener('document:click')
  closeMenus(): void {
    this.openMenuId = null;
  }

  toggleMenu(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  viewApplicant(batch: ApplicationBatch): void {
    this.openMenuId = null;
    this.applicantService.getApplicant(batch.applicant_id).subscribe({
      next: res => {
        if (!res.success || !res.data) {
          this.toast.showError('Error', 'Failed to load applicant details.');
          return;
        }
        this.dialog.open(ApplicantDialogComponent, {
          width: '1000px', maxWidth: '95vw', maxHeight: '90vh',
          panelClass: 'applicant-dialog-container',
          data: { mode: 'view', applicant: res.data }
        });
      },
      error: () => this.toast.showError('Error', 'Failed to load applicant details.')
    });
  }

  approveApplication(batch: ApplicationBatch): void {
    this.openMenuId = null;
    this.dialog.open(ApproveApplicationDialogComponent, {
      width: '520px', maxWidth: '95vw',
      panelClass: 'applicant-dialog-container',
      data: { batch }
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadBatches();
        this.loadStats();
      }
    });
  }
}
