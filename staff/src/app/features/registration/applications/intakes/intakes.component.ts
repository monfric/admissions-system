import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { IntakeDialogComponent } from './intake-dialog/intake-dialog.component';
import { IntakeManageDialogComponent } from './intake-manage-dialog/intake-manage-dialog.component';
import { IntakeService } from '../../../../core/services/registration/intake.service';
import { Intake, IntakeStats } from '../../../../core/models/registration/intake.model';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';

type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-intakes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent],
  templateUrl: './intakes.component.html',
  styleUrl: './intakes.component.scss'
})
export class IntakesComponent implements OnInit {

  intakes: Intake[] = [];
  loading = false;

  searchTerm = '';
  /** Intake filter: show just this intake (null = all). */
  intakeFilter: number | null = null;
  /** Every intake, for the Intake filter's options. */
  intakeOptions: Intake[] = [];
  statusFilter: StatusFilter = 'all';

  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;

  openMenuId: number | null = null;
  stats: IntakeStats | null = null;

  constructor(
    private dialog: MatDialog,
    private intakeService: IntakeService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadIntakes();
    this.loadStats();
    this.loadIntakeOptions();
  }

  /** Loads the counts for the cards above the table. */
  loadStats(): void {
    this.intakeService.getStats().subscribe({
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
      { label: 'Open Intakes', value: s ? s.open_intakes : '—',
        subtext: s ? `of ${s.total_intakes} intake${s.total_intakes === 1 ? '' : 's'} in total` : 'Loading…',
        icon: 'fas fa-calendar-alt', color: 'success' },
      { label: 'Programmes Running', value: s ? s.programmes_running : '—', subtext: s ? 'Across the open intakes' : 'Loading…',
        icon: 'fas fa-book-open', color: 'info' },
      { label: 'Applications', value: s ? s.applications : '—',
        subtext: s ? `${s.paid_applications} paid · ${s.unpaid_applications} unpaid (open intakes)` : 'Loading…',
        icon: 'fas fa-file-alt', color: 'primary' },
      { label: 'Admitted', value: s ? s.admitted : '—',
        subtext: s ? `${s.notified} notified, awaiting decision` : 'Loading…',
        icon: 'fas fa-user-graduate', color: 'purple' }
    ];
  }

  /** Loads every intake for the Intake filter's options. */
  loadIntakeOptions(): void {
    this.intakeService.getIntakes(1, 100).subscribe({
      next: res => {
        if (!res.success) return;
        this.intakeOptions = res.data.data;
        // The filtered intake was deleted: go back to showing all intakes.
        if (this.intakeFilter && !this.intakeOptions.some(i => i.id === this.intakeFilter)) {
          this.intakeFilter = null;
          this.onIntakeFilterChange();
        }
      },
      error: () => {}
    });
  }

  onIntakeFilterChange(): void {
    this.page = 1;
    this.loadIntakes();
  }

  loadIntakes(): void {
    this.loading = true;
    const isActive = this.statusFilter === 'all' ? undefined : this.statusFilter === 'active';

    this.intakeService.getIntakes(
      this.page, this.pageSize, this.searchTerm || undefined, isActive, undefined, this.intakeFilter ?? undefined
    ).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.intakes = res.data.data;
          this.totalItems = res.data.total_items;
          this.totalPages = res.data.total_pages;
        }
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load intakes.');
      }
    });
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadIntakes();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadIntakes();
  }

  onSearch(): void {
    this.page = 1;
    this.loadIntakes();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
    this.page = 1;
    this.loadIntakes();
  }

  openAddIntakeDialog(): void {
    this.dialog.open(IntakeDialogComponent, {
      width: '600px', maxWidth: '95vw',
      panelClass: 'intake-dialog-container',
      data: { mode: 'create' }
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadIntakes();
        this.loadStats();
        this.loadIntakeOptions();
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

  openViewIntake(intake: Intake): void {
    this.openMenuId = null;
    this.dialog.open(IntakeDialogComponent, {
      width: '600px', maxWidth: '95vw',
      panelClass: 'intake-dialog-container',
      data: { mode: 'view', intake: { ...intake } }
    });
  }

  openEditIntake(intake: Intake): void {
    this.openMenuId = null;
    this.dialog.open(IntakeDialogComponent, {
      width: '600px', maxWidth: '95vw',
      panelClass: 'intake-dialog-container',
      data: { mode: 'edit', intake: { ...intake } }
    }).afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadIntakes();
        this.loadStats();
        this.loadIntakeOptions();
      }
    });
  }

  manageIntake(intake: Intake): void {
    this.openMenuId = null;
    this.dialog.open(IntakeManageDialogComponent, {
      width: '1000px', maxWidth: '95vw', maxHeight: '90vh',
      panelClass: 'intake-dialog-container',
      data: { intake: { ...intake } }
    }).afterClosed().subscribe(() => {
      // Programme registrations may have changed inside — refresh the counts.
      this.loadIntakes();
      this.loadStats();
      this.loadIntakeOptions();
    });
  }

  confirmDeleteIntake(intake: Intake): void {
    this.openMenuId = null;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Delete Intake',
        message: `Are you sure you want to delete the ${intake.intake_month} ${intake.intake_year} intake? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.intakeService.deleteIntake(intake.id).subscribe({
        next: res => {
          if (res.success) {
            this.toast.showSuccess('Success', 'Intake deleted successfully.');
            this.loadIntakes();
            this.loadStats();
            this.loadIntakeOptions();
          } else {
            this.toast.showError('Error', res.message || 'Failed to delete intake.');
          }
        },
        error: err => this.toast.showError('Error', err.error?.message || 'Failed to delete intake.')
      });
    });
  }
}
