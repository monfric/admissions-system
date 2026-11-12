import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

import { ApplicantDialogComponent } from './applicant-dialog/applicant-dialog.component';
import { AssignApplicationDialogComponent } from './assign-application-dialog/assign-application-dialog.component';
import { ApplicantService } from '../../../../core/services/registration/applicant.service';
import { IntakeService } from '../../../../core/services/registration/intake.service';
import { Intake } from '../../../../core/models/registration/intake.model';
import { GENDER_OPTIONS, KENYA_COUNTIES } from '../../../../core/models/academics/student.model';
import { Applicant, ApplicantStats } from '../../../../core/models/registration/applicant.model';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-new-applicants',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent],
  templateUrl: './new-applicants.component.html',
  styleUrl: './new-applicants.component.scss'
})
export class NewApplicantsComponent implements OnInit {

  applicants: Applicant[] = [];
  loading = false;

  searchTerm = '';
  statusFilter: StatusFilter = 'all';

  // Dropdown filters ('' = all)
  genderFilter = '';
  countyFilter = '';
  profileFilter: '' | 'complete' | 'incomplete' = '';
  appliedFilter: '' | 'applied' | 'not_applied' = '';
  intakeFilter: number | null = null;
  registeredFilter = '';

  readonly genders = GENDER_OPTIONS;
  readonly counties = KENYA_COUNTIES;
  readonly registeredOptions = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: '30days', label: 'Last 30 days' }
  ];
  intakes: Intake[] = [];

  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  openMenuId: number | null = null;
  stats: ApplicantStats | null = null;

  // Profile photos are served from an authenticated endpoint, so they're
  // fetched as blobs (via HttpClient, which the auth interceptor attaches
  // a token to) and turned into object URLs — a plain <img src> can't
  // reach the file directly.
  applicantImageUrls = new Map<number, SafeUrl>();

  constructor(
    private intakeService: IntakeService,
    private dialog: MatDialog,
    private applicantService: ApplicantService,
    private toast: ToastService,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadApplicants();
    this.loadIntakes();
    this.loadStats();
  }

  /** Loads the counts for the cards above the table. */
  loadStats(): void {
    this.applicantService.getStats().subscribe({
      next: res => {
        if (res.success) this.stats = res.data;
        else console.error('Failed to load statistics:', res.message);
      },
      error: err => console.error('Failed to load statistics:', err)
    });
  }

  /** The cards shown above the table, built from the latest counts. */
  /** The cards above the table; values show "—" until the counts arrive (or if they fail to load). */
  get statCards(): { label: string; value: number | string; subtext: string; icon: string; color: string }[] {
    const s = this.stats;
    return [
      { label: 'Total Applicants', value: s ? s.total : '—', subtext: s ? this.genderSplit(s) : 'Loading…',
        icon: 'fas fa-users', color: 'primary' },
      { label: 'New This Month', value: s ? s.new_this_month : '—', subtext: s ? `${s.new_today} today` : 'Loading…',
        icon: 'fas fa-calendar-plus', color: 'success' },
      { label: 'Incomplete Profiles', value: s ? s.incomplete_profiles : '—', subtext: 'Profile not yet submitted',
        icon: 'fas fa-user-clock', color: 'warning' },
      { label: 'Not Yet Applied', value: s ? s.not_yet_applied : '—', subtext: 'No application for any intake',
        icon: 'fas fa-file-signature', color: 'info' }
    ];
  }

  /** "4 male · 3 female" (plus "· N other" when there are any). */
  private genderSplit(s: { male: number; female: number; other_gender: number }): string {
    const parts = [`${s.male} male`, `${s.female} female`];
    if (s.other_gender > 0) parts.push(`${s.other_gender} other`);
    return parts.join(' · ');
  }

  loadApplicants(): void {
    this.loading = true;
    const isActive = this.statusFilter === 'all' ? undefined : this.statusFilter === 'active';

    this.applicantService.getApplicants(
      this.page, this.pageSize, this.searchTerm || undefined, isActive,
      this.genderFilter || undefined, this.countyFilter || undefined,
      {
        profileComplete: this.profileFilter ? this.profileFilter === 'complete' : undefined,
        hasApplied: this.appliedFilter ? this.appliedFilter === 'applied' : undefined,
        intakeId: this.intakeFilter ?? undefined,
        registered: this.registeredFilter || undefined
      }
    ).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.applicants = res.data.data;
          this.totalItems = res.data.total_items;
          this.totalPages = res.data.total_pages;
          this.loadApplicantPhotos(this.applicants);
        }
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load applicants.');
      }
    });
  }

  private loadApplicantPhotos(applicants: Applicant[]): void {
    applicants.forEach(a => {
      if (a.profile_photo && a.id) this.loadApplicantPhoto(a.id);
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

  getApplicantPhotoUrl(applicant: Applicant): SafeUrl | null {
    return applicant.id ? (this.applicantImageUrls.get(applicant.id) ?? null) : null;
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadApplicants();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadApplicants();
  }

  onSearch(): void {
    this.page = 1;
    this.loadApplicants();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  /** Intakes for the "Intake Applied To" filter, newest first. */
  private loadIntakes(): void {
    this.intakeService.getIntakes(1, 100).subscribe({
      next: res => { if (res.success) this.intakes = res.data.data; },
      error: () => {}
    });
  }

  /** Any dropdown filter changed: back to page 1 and reload. */
  onFilterChange(): void {
    this.page = 1;
    this.loadApplicants();
  }

  get hasActiveFilters(): boolean {
    return !!(this.genderFilter || this.countyFilter || this.profileFilter || this.appliedFilter
      || this.intakeFilter || this.registeredFilter);
  }

  clearFilters(): void {
    this.genderFilter = '';
    this.countyFilter = '';
    this.profileFilter = '';
    this.appliedFilter = '';
    this.intakeFilter = null;
    this.registeredFilter = '';
    this.onFilterChange();
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
    this.page = 1;
    this.loadApplicants();
  }

  openAddApplicantDialog(): void {
    this.dialog.open(ApplicantDialogComponent, {
      width: '1000px', maxWidth: '95vw', maxHeight: '90vh',
      panelClass: 'applicant-dialog-container',
      data: { mode: 'create' }
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadApplicants();
        this.loadStats();
      }
    });
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

  openViewApplicant(applicant: Applicant): void {
    this.openMenuId = null;
    // The list only carries summary fields — fetch the full record (which
    // includes the uploaded documents) before showing it.
    this.applicantService.getApplicant(applicant.id).subscribe({
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

  openEditApplicant(applicant: Applicant): void {
    this.openMenuId = null;
    this.applicantService.getApplicant(applicant.id).subscribe({
      next: res => {
        if (!res.success || !res.data) {
          this.toast.showError('Error', 'Failed to load applicant details.');
          return;
        }
        this.dialog.open(ApplicantDialogComponent, {
          width: '1000px', maxWidth: '95vw', maxHeight: '90vh',
          panelClass: 'applicant-dialog-container',
          data: { mode: 'edit', applicant: res.data }
        }).afterClosed().subscribe(result => {
          if (result?.success) {
            this.loadApplicants();
            this.loadStats();
          }
        });
      },
      error: () => this.toast.showError('Error', 'Failed to load applicant details.')
    });
  }

  assignApplication(applicant: Applicant): void {
    this.openMenuId = null;
    this.dialog.open(AssignApplicationDialogComponent, {
      width: '600px', maxWidth: '95vw', maxHeight: '90vh',
      panelClass: 'applicant-dialog-container',
      data: { applicant: { ...applicant } }
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadApplicants();
        this.loadStats();
      }
    });
  }
}
