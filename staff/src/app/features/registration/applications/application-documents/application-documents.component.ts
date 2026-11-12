import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ApplicationDocument } from '../../../../core/models/registration/application-document.model';
import { ApplicationListFilters } from '../../../../core/services/registration/application-batch.service';
import { ApplicationFiltersComponent } from '../../../../shared/components/registration/application-filters/application-filters.component';
import { ApplicationDocumentStats } from '../../../../core/models/registration/application-document.model';
import { ApplicationDocumentService } from '../../../../core/services/registration/application-document.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';
import { DocumentViewerDialogComponent } from '../../../admin/student/document-viewer-dialog/document-viewer-dialog.component';
import { ApplicationDocumentDialogComponent } from './application-document-dialog/application-document-dialog.component';

@Component({
  selector: 'app-application-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent, ApplicationFiltersComponent],
  templateUrl: './application-documents.component.html',
  styleUrl: './application-documents.component.scss'
})
export class ApplicationDocumentsComponent implements OnInit {

  documents: ApplicationDocument[] = [];
  loading = false;

  searchTerm = '';
  filters: ApplicationListFilters = {};
  statusFilter: '' | 'active' | 'inactive' = '';

  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  openMenuId: number | null = null;
  stats: ApplicationDocumentStats | null = null;

  constructor(
    private dialog: MatDialog,
    private applicationDocumentService: ApplicationDocumentService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadDocuments();
    this.loadStats();
  }

  /** A dropdown filter changed: back to page 1 and reload. */
  onFiltersChange(filters: ApplicationListFilters): void {
    this.filters = filters;
    this.page = 1;
    this.loadDocuments();
  }

  /** Loads the counts for the cards above the table. */
  loadStats(): void {
    this.applicationDocumentService.getStats().subscribe({
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
      { label: 'Documents Uploaded', value: s ? s.documents : '—',
        subtext: s ? `${s.provisional_documents} provisional · ${s.admission_documents} admission` : 'Loading…',
        icon: 'fas fa-paperclip', color: 'primary' },
      { label: 'Programmes Covered', value: s ? `${s.provisional_covered} · ${s.admission_covered}` : '—',
        subtext: s ? `Provisional · admission, of ${s.running_programmes} running` : 'Loading…',
        icon: 'fas fa-check-circle', color: 'success' },
      { label: 'Programmes Missing Docs', value: s ? `${s.provisional_missing} · ${s.admission_missing}` : '—',
        subtext: s ? 'Provisional · admission (open intakes)' : 'Loading…',
        icon: 'fas fa-exclamation-triangle', color: 'danger' }
    ];
  }

  loadDocuments(): void {
    this.loading = true;
    this.applicationDocumentService.getAll(
      this.page, this.pageSize, this.searchTerm || undefined, this.statusFilter || undefined, this.filters
    ).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.documents = res.data.data;
          this.totalItems = res.data.total_items;
          this.totalPages = res.data.total_pages;
        }
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load application documents.');
      }
    });
  }

  setStatusFilter(status: '' | 'active' | 'inactive'): void {
    this.statusFilter = status;
    this.page = 1;
    this.loadDocuments();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadDocuments();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadDocuments();
  }

  onSearch(): void {
    this.page = 1;
    this.loadDocuments();
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

  addDocument(): void {
    this.openDocumentDialog({ mode: 'create' });
  }

  editDocument(doc: ApplicationDocument): void {
    this.openMenuId = null;
    this.openDocumentDialog({ mode: 'edit', document: doc });
  }

  private openDocumentDialog(data: { mode: 'create' | 'edit'; document?: ApplicationDocument }): void {
    this.dialog.open(ApplicationDocumentDialogComponent, {
      width: '640px', maxWidth: '95vw',
      panelClass: 'intake-dialog-container',
      data
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadDocuments();
        this.loadStats();
      }
    });
  }

  /** Opens the PDF in the shared viewer, which also offers Download. */
  viewDocument(doc: ApplicationDocument): void {
    this.openMenuId = null;
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '85vh',
      data: {
        fileUrl: this.applicationDocumentService.fileUrl(doc.id),
        fileType: 'pdf',
        title: doc.document_name,
        fileName: doc.file_name
      }
    });
  }

  confirmDeleteDocument(doc: ApplicationDocument): void {
    this.openMenuId = null;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Delete Document',
        message: `Are you sure you want to delete "${doc.document_name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.applicationDocumentService.delete(doc.id).subscribe({
        next: res => {
          if (res.success) {
            this.toast.showSuccess('Success', 'Document deleted successfully.');
            // Step back a page if this deleted the last row on it.
            if (this.documents.length === 1 && this.page > 1) this.page--;
            this.loadDocuments();
            this.loadStats();
          } else {
            this.toast.showError('Error', res.message || 'Failed to delete document.');
          }
        },
        error: err => this.toast.showError('Error', err.error?.message || 'Failed to delete document.')
      });
    });
  }
}
