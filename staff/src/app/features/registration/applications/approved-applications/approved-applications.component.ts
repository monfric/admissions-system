import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

import { Admission, AdmissionStats } from '../../../../core/models/registration/admission.model';
import { residenceSplit } from '../../../../core/models/registration/application-batch.model';
import { AdmissionService } from '../../../../core/services/registration/admission.service';
import { ApplicationListFilters } from '../../../../core/services/registration/application-batch.service';
import { ApplicationFiltersComponent } from '../../../../shared/components/registration/application-filters/application-filters.component';
import { ApplicantService } from '../../../../core/services/registration/applicant.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ApplicantDialogComponent } from '../new-applicants/applicant-dialog/applicant-dialog.component';

@Component({
  selector: 'app-approved-applications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent, ApplicationFiltersComponent],
  templateUrl: './approved-applications.component.html',
  styleUrl: './approved-applications.component.scss'
})
export class ApprovedApplicationsComponent implements OnInit {

  admissions: Admission[] = [];
  loading = false;

  searchTerm = '';
  filters: ApplicationListFilters = {};

  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  openMenuId: number | null = null;
  stats: AdmissionStats | null = null;

  // Applicant profile photos are served from an authenticated endpoint, so
  // they're fetched as blobs and turned into object URLs.
  applicantImageUrls = new Map<number, SafeUrl>();

  constructor(
    private dialog: MatDialog,
    private admissionService: AdmissionService,
    private applicantService: ApplicantService,
    private toast: ToastService,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadAdmissions();
    this.loadStats();
  }

  /** Loads the counts for the cards above the table (all admissions). */
  loadStats(): void {
    this.admissionService.getStats().subscribe({
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
      { label: 'Admitted Students', value: s ? s.total : '—', subtext: s ? this.genderSplit(s) : 'Loading…',
        icon: 'fas fa-user-graduate', color: 'success' },
      { label: 'Admitted This Month', value: s ? s.admitted_this_month : '—', subtext: s ? `${s.admitted_today} today` : 'Loading…',
        icon: 'fas fa-calendar-check', color: 'primary' },
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
    this.loadAdmissions();
  }

  loadAdmissions(): void {
    this.loading = true;
    const f = this.filters;
    this.admissionService.getAll(
      this.page, this.pageSize, this.searchTerm || undefined, f.intakeId, f.programmeId, f.status, f
    ).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.admissions = res.data.data;
          this.totalItems = res.data.total_items;
          this.totalPages = res.data.total_pages;
          this.loadApplicantPhotos(this.admissions);
        }
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load approved applications.');
      }
    });
  }

  private loadApplicantPhotos(admissions: Admission[]): void {
    admissions.forEach(a => {
      if (a.applicant_profile_photo && a.applicant_id) this.loadApplicantPhoto(a.applicant_id);
    });
  }

  private loadApplicantPhoto(applicantId: number): void {
    // Cache-bust: the file behind this URL can change on re-upload while
    // the URL itself stays identical, so force a fresh fetch every time.
    const url = `${environment.apiUrl}/applicants/documents/${applicantId}/files/profile?t=${Date.now()}`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: blob => {
        const safeUrl = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
        this.applicantImageUrls.set(applicantId, safeUrl);
      },
      error: () => {}
    });
  }

  getApplicantPhotoUrl(admission: Admission): SafeUrl | null {
    return this.applicantImageUrls.get(admission.applicant_id) ?? null;
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadAdmissions();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadAdmissions();
  }

  onSearch(): void {
    this.page = 1;
    this.loadAdmissions();
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

  viewApplicant(admission: Admission): void {
    this.openMenuId = null;
    this.applicantService.getApplicant(admission.applicant_id).subscribe({
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
}
