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
import { PayApplicationDialogComponent } from './pay-application-dialog/pay-application-dialog.component';

@Component({
  selector: 'app-unpaid-applications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent, ApplicationFiltersComponent],
  templateUrl: './unpaid-applications.component.html',
  styleUrl: './unpaid-applications.component.scss'
})
export class UnpaidApplicationsComponent implements OnInit {
  readonly choiceLabel = choiceLabel;

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

  /** Loads the counts for the cards above the table (all unpaid applications). */
  loadStats(): void {
    this.applicationBatchService.getStats({ payment_status: 'unpaid' }).subscribe({
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
      { label: 'Unpaid Applications', value: s ? s.total : '—', subtext: s ? this.genderSplit(s) : 'Loading…',
        icon: 'fas fa-hourglass-half', color: 'warning' },
      { label: 'Applied This Month', value: s ? s.new_this_month : '—', subtext: s ? `${s.new_today} today` : 'Loading…',
        icon: 'fas fa-calendar-plus', color: 'primary' },
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
      this.page, this.pageSize, this.searchTerm || undefined, 'unpaid', undefined, undefined, this.filters
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
        this.toast.showError('Error', 'Failed to load unpaid applications.');
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

  payApplication(batch: ApplicationBatch): void {
    this.openMenuId = null;
    this.dialog.open(PayApplicationDialogComponent, {
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
