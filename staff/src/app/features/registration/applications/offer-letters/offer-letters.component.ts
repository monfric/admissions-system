import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { OfferLetter } from '../../../../core/models/registration/offer-letter.model';
import { ApplicationListFilters } from '../../../../core/services/registration/application-batch.service';
import { ApplicationFiltersComponent } from '../../../../shared/components/registration/application-filters/application-filters.component';
import { OfferLetterService } from '../../../../core/services/registration/offer-letter.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { OfferLetterDialogComponent } from './offer-letter-dialog/offer-letter-dialog.component';

type StatusFilter = 'all' | 'active' | 'inactive';

import { DocumentViewerDialogComponent } from '../../../admin/student/document-viewer-dialog/document-viewer-dialog.component';
@Component({
  selector: 'app-offer-letters',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent, ApplicationFiltersComponent],
  templateUrl: './offer-letters.component.html',
  styleUrl: './offer-letters.component.scss'
})
export class OfferLettersComponent implements OnInit {

  letters: OfferLetter[] = [];
  loading = false;

  searchTerm = '';
  filters: ApplicationListFilters = {};
  statusFilter: StatusFilter = 'all';

  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  openMenuId: number | null = null;

  constructor(
    private dialog: MatDialog,
    private offerLetterService: OfferLetterService,
    private toast: ToastService,
    private dialogService: DialogService
  ) {}

  ngOnInit(): void {
    this.loadLetters();
  }

  /** A dropdown filter changed: back to page 1 and reload. */
  onFiltersChange(filters: ApplicationListFilters): void {
    this.filters = filters;
    this.page = 1;
    this.loadLetters();
  }

  loadLetters(): void {
    this.loading = true;
    const status = this.statusFilter === 'all' ? undefined : this.statusFilter;

    this.offerLetterService.getAll(
      this.page, this.pageSize, this.searchTerm || undefined, this.filters.letterType, status, this.filters
    ).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.letters = res.data.data;
          this.totalItems = res.data.total_items;
          this.totalPages = res.data.total_pages;
        }
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load offer letters.');
      }
    });
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadLetters();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadLetters();
  }

  onSearch(): void {
    this.page = 1;
    this.loadLetters();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
    this.page = 1;
    this.loadLetters();
  }

  bodyPreview(body: string): string {
    // Bodies are stored as simple HTML from the letter editor.
    const plain = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
    return plain.length > 80 ? plain.slice(0, 80) + '…' : plain;
  }

  openAddDialog(): void {
    this.dialog.open(OfferLetterDialogComponent, {
      width: '760px', maxWidth: '95vw', maxHeight: '90vh',
      panelClass: 'applicant-dialog-container',
      data: { mode: 'create' }
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadLetters();
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

  viewLetter(letter: OfferLetter): void {
    this.openMenuId = null;
    this.dialog.open(OfferLetterDialogComponent, {
      width: '760px', maxWidth: '95vw', maxHeight: '90vh',
      panelClass: 'applicant-dialog-container',
      data: { mode: 'view', offerLetter: letter }
    });
  }

  editLetter(letter: OfferLetter): void {
    this.openMenuId = null;
    this.dialog.open(OfferLetterDialogComponent, {
      width: '760px', maxWidth: '95vw', maxHeight: '90vh',
      panelClass: 'applicant-dialog-container',
      data: { mode: 'edit', offerLetter: letter }
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadLetters();
      }
    });
  }

  /** Opens the letter as applicants will get it, with placeholder applicant details. */
  previewLetter(letter: OfferLetter): void {
    this.openMenuId = null;
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '90vh',
      data: {
        fileUrl: this.offerLetterService.previewUrl(letter.id),
        fileType: 'pdf',
        title: `${letter.type === 'admission' ? 'Admission' : 'Provisional Offer'} Letter — ${letter.programme_name}`,
        fileName: `${letter.type}-letter-${letter.programme_code}.pdf`
      }
    });
  }

  deleteLetter(letter: OfferLetter): void {
    this.openMenuId = null;
    this.dialogService.confirmDelete(`${letter.programme_name} — ${letter.intake_name}`, 'offer letter').subscribe(confirmed => {
      if (!confirmed) return;

      this.offerLetterService.delete(letter.id).subscribe({
        next: res => {
          if (res.success) {
            this.toast.showSuccess('Success', 'Offer letter deleted successfully.');
            this.loadLetters();
          }
        },
        error: err => {
          this.toast.showError('Error', err.error?.message || 'Failed to delete offer letter.');
        }
      });
    });
  }
}
