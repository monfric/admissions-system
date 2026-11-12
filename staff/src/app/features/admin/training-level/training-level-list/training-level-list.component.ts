import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { PaginatedTrainingLevels, TrainingLevel } from '../../../../core/models/academics/training-level.model';
import { TrainingLevelService } from '../../../../core/services/training-level/training-level.service';
import { TrainingLevelDialogComponent } from '../training-level-dialog/training-level-dialog.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';


@Component({
  selector: 'app-training-level-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSelectModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule
  ],
  templateUrl: './training-level-list.component.html',
  styleUrl: './training-level-list.component.scss'
})
export class TrainingLevelListComponent implements OnInit{
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns: string[] = [
    'order',
    'code',
    'name',
    'description',
    'is_active',
    'created_at',
    'actions'
  ];

  dataSource = new MatTableDataSource<TrainingLevel>([]);
  
  // Pagination
  totalItems = 0;
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 50];

  // Filtering
  searchTerm = '';
  selectedStatus: boolean | null = null;

  // Sorting
  sortBy = 'order';
  sortDir = 'asc';

  // Loading states
  loading = false;

  constructor(
    private trainingLevelService: TrainingLevelService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadTrainingLevels();
  }

  /**
   * Load training levels with current filters
   */
  loadTrainingLevels(): void {
    this.loading = true;

    this.trainingLevelService.getTrainingLevels(
      this.pageIndex + 1,
      this.pageSize,
      this.searchTerm,
      this.selectedStatus !== null ? this.selectedStatus : undefined,
      this.sortBy,
      this.sortDir
    ).subscribe({
      next: (response) => {
        console.log(response)
        if (response.success && response.data) {
          const data = response.data as PaginatedTrainingLevels;
          this.dataSource.data = data.data;
          this.totalItems = data.total_items;
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading training levels:', error);
        this.showSnackBar('Failed to load training levels', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Handle page change
   */
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadTrainingLevels();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    this.sortBy = sort.active || 'order';
    this.sortDir = sort.direction || 'asc';
    this.pageIndex = 0;
    this.loadTrainingLevels();
  }

  /**
   * Handle search
   */
  onSearch(): void {
    this.pageIndex = 0;
    this.loadTrainingLevels();
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  /**
   * Handle status filter change
   */
  onStatusFilterChange(): void {
    this.pageIndex = 0;
    this.loadTrainingLevels();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = null;
    this.pageIndex = 0;
    this.loadTrainingLevels();
  }

  /**
   * Open create training level dialog
   */
  openCreateDialog(): void {
    const dialogRef = this.dialog.open(TrainingLevelDialogComponent, {
      width: '600px',
      data: { mode: 'create' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createTrainingLevel(result);
      }
    });
  }

  /**
   * Open edit training level dialog
   */
  openEditDialog(trainingLevel: TrainingLevel): void {
    const dialogRef = this.dialog.open(TrainingLevelDialogComponent, {
      width: '600px',
      data: { 
        mode: 'edit', 
        trainingLevel: { ...trainingLevel }
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateTrainingLevel(trainingLevel.id, result);
      }
    });
  }

  /**
   * Open view training level dialog
   */
  openViewDialog(trainingLevel: TrainingLevel): void {
    this.dialog.open(TrainingLevelDialogComponent, {
      width: '600px',
      data: { 
        mode: 'view', 
        trainingLevel: { ...trainingLevel }
      }
    });
  }

  /**
   * Create training level
   */
  createTrainingLevel(trainingLevelData: any): void {
    this.loading = true;
    this.trainingLevelService.createTrainingLevel(trainingLevelData).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Training level created successfully', 'success');
          this.loadTrainingLevels();
        }
      },
      error: (error) => {
        console.error('Error creating training level:', error);
        this.showSnackBar(error.error?.message || 'Failed to create training level', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Update training level
   */
  updateTrainingLevel(id: number, trainingLevelData: any): void {
    this.loading = true;
    this.trainingLevelService.updateTrainingLevel(id, trainingLevelData).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Training level updated successfully', 'success');
          this.loadTrainingLevels();
        }
      },
      error: (error) => {
        console.error('Error updating training level:', error);
        this.showSnackBar(error.error?.message || 'Failed to update training level', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Confirm and delete training level
   */
  confirmDelete(trainingLevel: TrainingLevel): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Training Level',
        message: `Are you sure you want to delete "${trainingLevel.name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.deleteTrainingLevel(trainingLevel.id);
      }
    });
  }

  /**
   * Delete training level
   */
  deleteTrainingLevel(id: number): void {
    this.loading = true;
    this.trainingLevelService.deleteTrainingLevel(id).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Training level deleted successfully', 'success');
          this.loadTrainingLevels();
        }
      },
      error: (error) => {
        console.error('Error deleting training level:', error);
        this.showSnackBar(error.error?.message || 'Failed to delete training level', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Toggle training level active status
   */
  toggleStatus(trainingLevel: TrainingLevel): void {
    const newStatus = !trainingLevel.is_active;
    const action = newStatus ? 'activate' : 'deactivate';

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: `${newStatus ? 'Activate' : 'Deactivate'} Training Level`,
        message: `Are you sure you want to ${action} "${trainingLevel.name}"?`,
        confirmText: newStatus ? 'Activate' : 'Deactivate',
        cancelText: 'Cancel',
        type: newStatus ? 'primary' : 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateTrainingLevelStatus(trainingLevel.id, newStatus);
      }
    });
  }

  /**
   * Update training level status
   */
  updateTrainingLevelStatus(id: number, isActive: boolean): void {
    this.loading = true;
    this.trainingLevelService.toggleTrainingLevelStatus(id, isActive).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar(
            `Training level ${isActive ? 'activated' : 'deactivated'} successfully`, 
            'success'
          );
          this.loadTrainingLevels();
        }
      },
      error: (error) => {
        console.error('Error updating training level status:', error);
        this.showSnackBar(error.error?.message || 'Failed to update training level status', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Show snack bar notification
   */
  private showSnackBar(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: [`snackbar-${type}`]
    });
  }

  /**
   * Get status badge class
   */
  getStatusClass(isActive: boolean): string {
    return isActive ? 'badge-success' : 'badge-danger';
  }

  /**
   * Get status text
   */
  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  /**
   * Get order badge class
   */
  getOrderBadgeClass(order: number): string {
    if (order <= 2) return 'badge-primary';
    if (order <= 4) return 'badge-info';
    return 'badge-secondary';
  }

}
