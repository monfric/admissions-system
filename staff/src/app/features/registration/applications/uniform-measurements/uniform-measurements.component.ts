import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import ExcelJS from 'exceljs';

import {
  measurementStatusDisplay,
  UniformMeasurementListItem,
  UniformMeasurementStats,
  UniformSet,
  uniformSetLabel
} from '../../../../core/models/registration/uniform-measurement.model';
import { ApplicationListFilters } from '../../../../core/services/registration/application-batch.service';
import { UniformMeasurementService } from '../../../../core/services/registration/uniform-measurement.service';
import { ApplicantService } from '../../../../core/services/registration/applicant.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ApplicationFiltersComponent } from '../../../../shared/components/registration/application-filters/application-filters.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';
import { DocumentViewerDialogComponent } from '../../../admin/student/document-viewer-dialog/document-viewer-dialog.component';
import { ApplicantDialogComponent } from '../new-applicants/applicant-dialog/applicant-dialog.component';
import { UniformMeasurementDialogComponent } from './uniform-measurement-dialog/uniform-measurement-dialog.component';

/** Admitted students and the uniform measurements they submitted on the applicant portal. */
@Component({
  selector: 'app-uniform-measurements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent, ApplicationFiltersComponent],
  templateUrl: './uniform-measurements.component.html',
  styleUrl: './uniform-measurements.component.scss'
})
export class UniformMeasurementsComponent implements OnInit {

  students: UniformMeasurementListItem[] = [];
  loading = false;
  exporting = false;

  searchTerm = '';
  filters: ApplicationListFilters = {};

  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  openMenuId: number | null = null;
  stats: UniformMeasurementStats | null = null;

  // Applicant profile photos are served from an authenticated endpoint, so
  // they're fetched as blobs and turned into object URLs.
  applicantImageUrls = new Map<number, SafeUrl>();

  readonly statusDisplay = measurementStatusDisplay;
  readonly uniformSetLabel = uniformSetLabel;

  constructor(
    private dialog: MatDialog,
    private uniformService: UniformMeasurementService,
    private applicantService: ApplicantService,
    private toast: ToastService,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadStudents();
    this.loadStats();
  }

  /** Loads the counts for the cards above the table (all active admissions). */
  loadStats(): void {
    this.uniformService.getStats().subscribe({
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
      { label: 'Admitted Students', value: s ? s.admitted : '—', subtext: s ? this.genderSplit(s) : 'Loading…',
        icon: 'fas fa-user-graduate', color: 'primary' },
      { label: 'Measurements Submitted', value: s ? s.submitted : '—', subtext: s ? `${s.gents} gents · ${s.ladies} ladies` : 'Loading…',
        icon: 'fas fa-ruler', color: 'success' },
      { label: 'Pending Measurements', value: s ? s.pending : '—', subtext: s ? `${s.unlocked} unlocked for correction` : 'Loading…',
        icon: 'fas fa-hourglass-half', color: 'warning' }
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
    this.loadStudents();
  }

  loadStudents(): void {
    this.loading = true;
    this.uniformService.getAll(this.page, this.pageSize, this.searchTerm || undefined, this.filters).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.students = res.data.data;
          this.totalItems = res.data.total_items;
          this.totalPages = res.data.total_pages;
          this.loadApplicantPhotos(this.students);
        }
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load uniform measurements.');
      }
    });
  }

  private loadApplicantPhotos(students: UniformMeasurementListItem[]): void {
    students.forEach(s => {
      if (s.applicant_profile_photo && s.applicant_id) this.loadApplicantPhoto(s.applicant_id);
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

  getApplicantPhotoUrl(student: UniformMeasurementListItem): SafeUrl | null {
    return this.applicantImageUrls.get(student.applicant_id) ?? null;
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadStudents();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadStudents();
  }

  onSearch(): void {
    this.page = 1;
    this.loadStudents();
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

  viewMeasurements(student: UniformMeasurementListItem): void {
    this.openMenuId = null;
    this.dialog.open(UniformMeasurementDialogComponent, {
      width: '760px', maxWidth: '95vw', maxHeight: '90vh',
      panelClass: 'applicant-dialog-container',
      data: { admissionId: student.admission_id }
    }).afterClosed().subscribe(changed => {
      if (changed) this.refresh();
    });
  }

  viewApplicant(student: UniformMeasurementListItem): void {
    this.openMenuId = null;
    this.applicantService.getApplicant(student.applicant_id).subscribe({
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

  viewPdf(student: UniformMeasurementListItem): void {
    this.openMenuId = null;
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '90vh',
      data: {
        fileUrl: this.uniformService.pdfUrl(student.admission_id),
        fileType: 'pdf',
        title: `Uniform Measurements – ${student.applicant_full_name}`,
        fileName: `Uniform-Measurements-${student.admission_number.replace(/[\/\s]+/g, '-')}.pdf`
      }
    });
  }

  confirmUnlock(student: UniformMeasurementListItem): void {
    this.openMenuId = null;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Unlock Measurements',
        message: `Unlock ${student.applicant_full_name}'s uniform measurements? They will be able to correct and resubmit them on the applicant portal. Their documents stay available.`,
        confirmText: 'Unlock',
        cancelText: 'Cancel',
        type: 'warn'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.uniformService.unlock(student.admission_id).subscribe({
        next: res => {
          if (res.success) {
            this.toast.showSuccess('Success', 'Measurements unlocked for correction.');
            this.refresh();
          } else {
            this.toast.showError('Error', res.message || 'Failed to unlock measurements.');
          }
        },
        error: err => this.toast.showError('Error', err.error?.message || 'Failed to unlock measurements.')
      });
    });
  }

  private refresh(): void {
    this.loadStudents();
    this.loadStats();
  }

  // ── Excel export ───────────────────────────────────────────

  /**
   * Exports the submitted measurements matching the current search and
   * filters: one sheet for gents and one for ladies, a column per measurement.
   */
  async exportExcel(): Promise<void> {
    this.exporting = true;
    try {
      const [setsRes, listRes] = await Promise.all([
        firstValueFrom(this.uniformService.getSets()),
        firstValueFrom(this.uniformService.getAll(1, 10000, this.searchTerm || undefined, this.filters))
      ]);
      const sets: UniformSet[] = setsRes.data || [];
      const rows = (listRes.data?.data || []).filter(s => !!s.measurement);
      if (rows.length === 0) {
        this.toast.showError('Nothing to export', 'No submitted measurements match the current filters.');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      for (const set of sets) {
        const setRows = rows.filter(r => r.measurement!.uniform_set === set.key);
        if (setRows.length === 0) continue;
        this.addSetSheet(workbook, set, setRows);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `uniform-measurements_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.toast.showError('Export failed', 'Could not export uniform measurements. Please try again.');
    } finally {
      this.exporting = false;
    }
  }

  private addSetSheet(workbook: ExcelJS.Workbook, set: UniformSet, rows: UniformMeasurementListItem[]): void {
    const sheet = workbook.addWorksheet(set.label);
    const infoHeaders = ['#', 'Admission No', 'Full Name', 'Gender', 'Phone No', 'Course Admitted', 'Intake', 'Residence'];
    const fields = set.garments.flatMap(g => g.fields.map(f => ({ key: f.key, garment: g.name, label: f.label })));

    // Row 1: garment names over their columns; row 2: field labels.
    const garmentRow = sheet.getRow(1);
    const labelRow = sheet.getRow(2);
    infoHeaders.forEach((h, i) => {
      sheet.mergeCells(1, i + 1, 2, i + 1);
      this.styleHeaderCell(garmentRow.getCell(i + 1), h);
    });
    let col = infoHeaders.length + 1;
    for (const g of set.garments) {
      const end = col + g.fields.length - 1;
      sheet.mergeCells(1, col, 1, end);
      this.styleHeaderCell(garmentRow.getCell(col), `${g.name} (inches)`);
      g.fields.forEach((f, i) => this.styleHeaderCell(labelRow.getCell(col + i), f.label));
      col = end + 1;
    }
    sheet.mergeCells(1, col, 2, col);
    this.styleHeaderCell(garmentRow.getCell(col), 'Submitted On');

    rows.forEach((r, i) => {
      const m = r.measurement!;
      const row = sheet.addRow([
        i + 1, r.admission_number, r.applicant_full_name, r.applicant_gender, r.applicant_phone,
        r.programme_name, r.intake_name, r.residence || '—',
        ...fields.map(f => m.values[f.key] ?? null),
        m.submitted_at.slice(0, 10)
      ]);
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = this.thinBorder();
        if (colNumber > infoHeaders.length) cell.alignment = { horizontal: 'center' };
      });
    });

    [5, 16, 26, 9, 14, 32, 16, 12].forEach((w, i) => sheet.getColumn(i + 1).width = w);
    fields.forEach((_, i) => sheet.getColumn(infoHeaders.length + 1 + i).width = 12);
    sheet.getColumn(col).width = 14;
    labelRow.height = 30;
    sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 2 }];
  }

  private styleHeaderCell(cell: ExcelJS.Cell, label: string): void {
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.border = this.thinBorder();
  }

  private thinBorder(): Partial<ExcelJS.Borders> {
    const style: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCBD5E1' } };
    return { top: style, left: style, bottom: style, right: style };
  }
}
