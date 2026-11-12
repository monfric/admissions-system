import { Component, ViewChild } from '@angular/core';

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
import { PaginatedProgrammes, Programme } from '../../../../core/models/academics/programme.model';
import { Department } from '../../../../core/models/academics/department.model';
import { TrainingLevel } from '../../../../core/models/academics/training-level.model';
import { ProgrammeService } from '../../../../core/services/programme/programme.service';
import { DepartmentService } from '../../../../core/services/department/department.service';
import { TrainingLevelService } from '../../../../core/services/training-level/training-level.service';
import { ProgrammeDialogComponent } from '../programme-dialog/programme-dialog.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-programme-list',
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
  templateUrl: './programme-list.component.html',
  styleUrl: './programme-list.component.scss'
})
export class ProgrammeListComponent {

   @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns: string[] = [
    'code',
    'name',
    'department_name',
    'training_level_name',
    'duration_years',
    'is_active',
    'created_at',
    'actions'
  ];

  dataSource = new MatTableDataSource<Programme>([]);
  
  // Pagination
  totalItems = 0;
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 50];

  // Filtering
  searchTerm = '';
  selectedDepartmentId: number | null = null;
  selectedTrainingLevelId: number | null = null;
  selectedStatus: boolean | null = null;
  departments: Department[] = [];
  trainingLevels: TrainingLevel[] = [];

  // Sorting
  sortBy = 'created_at';
  sortDir = 'desc';

  // Loading states
  loading = false;
  loadingDepartments = false;
  loadingTrainingLevels = false;

  constructor(
    private programmeService: ProgrammeService,
    private departmentService: DepartmentService,
    private trainingLevelService: TrainingLevelService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadDepartments();
    this.loadTrainingLevels();
    this.loadProgrammes();
  }
  /**
   * Load all departments for filter dropdown
   */
  loadDepartments(): void {
    this.loadingDepartments = true;
    this.departmentService.getAllDepartments().subscribe({
      next: (response: any) => {
        console.log(response)
        if (response.success && response.data) {
          if (Array.isArray(response.data)) {
            this.departments = response.data;
          } else if ('data' in response.data) {
            this.departments = response.data.data;
          }
        }
        console.log(this.departments)
        this.loadingDepartments = false;
      },
      error: (error) => {
        console.error('Error loading departments:', error);
        this.showSnackBar('Failed to load departments', 'error');
        this.loadingDepartments = false;
      }
    });
  }

  /**
   * Load all training levels for filter dropdown
   */
  loadTrainingLevels(): void {
    this.loadingTrainingLevels = true;
    this.trainingLevelService.getAllTrainingLevels().subscribe({
      next: (response: any) => {
        console.log(response)
        if (response.success && response.data) {
          if (Array.isArray(response.data)) {
            this.trainingLevels = response.data;
          } else if ('data' in response.data) {
            this.trainingLevels = response.data.data;
          }
        }
        this.loadingTrainingLevels = false;
      },
      error: (error) => {
        console.error('Error loading training levels:', error);
        this.showSnackBar('Failed to load training levels', 'error');
        this.loadingTrainingLevels = false;
      }
    });
  }

  /**
   * Load programmes with current filters
   */
  loadProgrammes(): void {
    this.loading = true;

    this.programmeService.getProgrammes(
      this.pageIndex + 1,
      this.pageSize,
      this.searchTerm,
      this.selectedDepartmentId || undefined,
      this.selectedTrainingLevelId || undefined,
      this.selectedStatus !== null ? this.selectedStatus : undefined,
      this.sortBy,
      this.sortDir
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const data = response.data as PaginatedProgrammes;
          this.dataSource.data = data.data;
          this.totalItems = data.total_items;
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading programmes:', error);
        this.showSnackBar('Failed to load programmes', 'error');
        this.loading = false;
      }
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadProgrammes();
  }

  onSortChange(sort: Sort): void {
    this.sortBy = sort.active || 'created_at';
    this.sortDir = sort.direction || 'desc';
    this.pageIndex = 0;
    this.loadProgrammes();
  }

  onSearch(): void {
    this.pageIndex = 0;
    this.loadProgrammes();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  onDepartmentFilterChange(): void {
    this.pageIndex = 0;
    this.loadProgrammes();
  }

  onTrainingLevelFilterChange(): void {
    this.pageIndex = 0;
    this.loadProgrammes();
  }

  onStatusFilterChange(): void {
    this.pageIndex = 0;
    this.loadProgrammes();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedDepartmentId = null;
    this.selectedTrainingLevelId = null;
    this.selectedStatus = null;
    this.pageIndex = 0;
    this.loadProgrammes();
  }

  openCreateDialog(): void {
    console.log(this.departments)
    const dialogRef = this.dialog.open(ProgrammeDialogComponent, {
      width: '700px',
      data: { 
        mode: 'create',
        departments: this.departments,
        trainingLevels: this.trainingLevels
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createProgramme(result);
      }
    });
  }

  openEditDialog(programme: Programme): void {
    const dialogRef = this.dialog.open(ProgrammeDialogComponent, {
      width: '700px',
      data: { 
        mode: 'edit', 
        programme: { ...programme },
        departments: this.departments,
        trainingLevels: this.trainingLevels
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateProgramme(programme.id, result);
      }
    });
  }

  openViewDialog(programme: Programme): void {
    this.dialog.open(ProgrammeDialogComponent, {
      width: '700px',
      data: { 
        mode: 'view', 
        programme: { ...programme },
        departments: this.departments,
        trainingLevels: this.trainingLevels
      }
    });
  }

  createProgramme(programmeData: any): void {
    this.loading = true;
    this.programmeService.createProgramme(programmeData).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Programme created successfully', 'success');
          this.loadProgrammes();
        }
      },
      error: (error) => {
        console.error('Error creating programme:', error);
        this.showSnackBar(error.error?.message || 'Failed to create programme', 'error');
        this.loading = false;
      }
    });
  }

  updateProgramme(id: number, programmeData: any): void {
    this.loading = true;
    this.programmeService.updateProgramme(id, programmeData).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Programme updated successfully', 'success');
          this.loadProgrammes();
        }
      },
      error: (error) => {
        console.error('Error updating programme:', error);
        this.showSnackBar(error.error?.message || 'Failed to update programme', 'error');
        this.loading = false;
      }
    });
  }

  confirmDelete(programme: Programme): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Programme',
        message: `Are you sure you want to delete "${programme.name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.deleteProgramme(programme.id);
      }
    });
  }

  deleteProgramme(id: number): void {
    this.loading = true;
    this.programmeService.deleteProgramme(id).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Programme deleted successfully', 'success');
          this.loadProgrammes();
        }
      },
      error: (error) => {
        console.error('Error deleting programme:', error);
        this.showSnackBar(error.error?.message || 'Failed to delete programme', 'error');
        this.loading = false;
      }
    });
  }

  toggleStatus(programme: Programme): void {
    const newStatus = !programme.is_active;
    const action = newStatus ? 'activate' : 'deactivate';

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: `${newStatus ? 'Activate' : 'Deactivate'} Programme`,
        message: `Are you sure you want to ${action} "${programme.name}"?`,
        confirmText: newStatus ? 'Activate' : 'Deactivate',
        cancelText: 'Cancel',
        type: newStatus ? 'primary' : 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateProgrammeStatus(programme.id, newStatus);
      }
    });
  }

  updateProgrammeStatus(id: number, isActive: boolean): void {
    this.loading = true;
    this.programmeService.toggleProgrammeStatus(id, isActive).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar(
            `Programme ${isActive ? 'activated' : 'deactivated'} successfully`, 
            'success'
          );
          this.loadProgrammes();
        }
      },
      error: (error) => {
        console.error('Error updating programme status:', error);
        this.showSnackBar(error.error?.message || 'Failed to update programme status', 'error');
        this.loading = false;
      }
    });
  }

  private showSnackBar(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: [`snackbar-${type}`]
    });
  }

  getStatusClass(isActive: boolean): string {
    return isActive ? 'badge-success' : 'badge-danger';
  }

  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  getDurationText(years: number): string {
    return years === 1 ? '1 Year' : `${years} Years`;
  }

}
