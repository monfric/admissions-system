import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Department, PaginatedDepartments } from '../../../../core/models/academics/department.model';
import { Faculty, FacultyFilters } from '../../../../core/models/academics/faculty.model';
import { DepartmentService } from '../../../../core/services/department/department.service';
import { FacultyService } from '../../../../core/services/faculty/faculty.service';

import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
// Angular Material Modules
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';

import { DepartmentDialogComponent } from '../department-dialog/department-dialog.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';


@Component({
  selector: 'app-department-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
  
    // Angular Material
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    
  ],
  templateUrl: './department-list.component.html',
  styleUrl: './department-list.component.scss'
})
export class DepartmentListComponent  implements OnInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns: string[] = [
    'code',
    'name',
    'faculty_name',
    'description',
    'is_active',
    'created_at',
    'actions'
  ];

  dataSource = new MatTableDataSource<Department>([]);
  
  // Pagination
  totalItems = 0;
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 50, 100];

  // Filtering
  searchTerm = '';
  selectedFacultyId: number | null = null;
  selectedStatus: boolean | null = null;
  faculties: Faculty[] = [];

  // Sorting
  sortBy = 'created_at';
  sortDir = 'desc';

  // Loading states
  loading = false;
  loadingFaculties = false;

  constructor(
    private departmentService: DepartmentService,
    private facultyService: FacultyService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadFaculties();
    this.loadDepartments();
  }

  /**
   * Load all faculties for filter dropdown
   */
  loadFaculties(): void {

    this.loadingFaculties = true;
   // this.errorMessage = '';

    const filters: FacultyFilters = {
      page:1,
      page_size: 50,
      search: this.searchTerm || undefined,
      is_active: true,
      sort_by: 'name',
      sort_dir: 'asc'
    };

    this.facultyService.getFaculties(filters).subscribe({
      next: (response) => {
        console.log(response)
        this.faculties = response.data.data;
        this.totalItems = response.data.total;
      //  this.totalPages = response.data.total_pages;
        this.loadingFaculties = false;
      },
      error: (error) => {
       // this.errorMessage = error.message || 'Failed to load faculties';
        this.loadingFaculties = false;
      }
    });
  }


  /**
   * Load departments with current filters
   */
  loadDepartments(): void {
    this.loading = true;

    this.departmentService.getDepartments(
      this.pageIndex + 1,
      this.pageSize,
      this.searchTerm,
      this.selectedFacultyId || undefined,
      this.selectedStatus !== null ? this.selectedStatus : undefined,
      this.sortBy,
      this.sortDir
    ).subscribe({
      next: (response) => {
        console.log(response)
        if (response.success && response.data) {
          const data = response.data as PaginatedDepartments;
          this.dataSource.data = data.data;
          this.totalItems = data.total;
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading departments:', error);
        this.showSnackBar('Failed to load departments', 'error');
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
    this.loadDepartments();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    this.sortBy = sort.active || 'created_at';
    this.sortDir = sort.direction || 'desc';
    this.pageIndex = 0; // Reset to first page
    this.loadDepartments();
  }

  /**
   * Handle search
   */
  onSearch(): void {
    this.pageIndex = 0; // Reset to first page
    this.loadDepartments();
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  /**
   * Handle faculty filter change
   */
  onFacultyFilterChange(): void {
    this.pageIndex = 0;
    this.loadDepartments();
  }

  /**
   * Handle status filter change
   */
  onStatusFilterChange(): void {
    this.pageIndex = 0;
    this.loadDepartments();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.searchTerm = '';
    this.selectedFacultyId = null;
    this.selectedStatus = null;
    this.pageIndex = 0;
    this.loadDepartments();
  }

  /**
   * Open create department dialog
   */
  openCreateDialog(): void {
    const dialogRef = this.dialog.open(DepartmentDialogComponent, {
     width: '600px',
      data: { 
        mode: 'create',
        faculties: this.faculties
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createDepartment(result);
      }
    });
  }

  /**
   * Open edit department dialog
   */
  openEditDialog(department: Department): void {
    const dialogRef = this.dialog.open(DepartmentDialogComponent, {
      width: '600px',
      data: { 
        mode: 'edit', 
        department: { ...department },
        faculties: this.faculties
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateDepartment(department.id, result);
      }
    });
  }

  /**
   * Open view department dialog
   */
  openViewDialog(department: Department): void {
    this.dialog.open(DepartmentDialogComponent, {
      width: '600px',
      data: { 
        mode: 'view', 
        department: { ...department },
        faculties: this.faculties
      }
    });
  }

  /**
   * Create department
   */
  createDepartment(departmentData: any): void {
    this.loading = true;
    this.departmentService.createDepartment(departmentData).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Department created successfully', 'success');
          this.loadDepartments();
        }
      },
      error: (error) => {
        console.error('Error creating department:', error);
        this.showSnackBar(error.error?.message || 'Failed to create department', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Update department
   */
  updateDepartment(id: number, departmentData: any): void {
    this.loading = true;
    this.departmentService.updateDepartment(id, departmentData).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Department updated successfully', 'success');
          this.loadDepartments();
        }
      },
      error: (error) => {
        console.error('Error updating department:', error);
        this.showSnackBar(error.error?.message || 'Failed to update department', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Confirm and delete department
   */
  confirmDelete(department: Department): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Department',
        message: `Are you sure you want to delete "${department.name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.deleteDepartment(department.id);
      }
    });
  }

  /**
   * Delete department
   */
  deleteDepartment(id: number): void {
    this.loading = true;
    this.departmentService.deleteDepartment(id).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar('Department deleted successfully', 'success');
          this.loadDepartments();
        }
      },
      error: (error) => {
        console.error('Error deleting department:', error);
        this.showSnackBar(error.error?.message || 'Failed to delete department', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Toggle department active status
   */
  toggleStatus(department: Department): void {
    const newStatus = !department.is_active;
    const action = newStatus ? 'activate' : 'deactivate';

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: `${newStatus ? 'Activate' : 'Deactivate'} Department`,
        message: `Are you sure you want to ${action} "${department.name}"?`,
        confirmText: newStatus ? 'Activate' : 'Deactivate',
        cancelText: 'Cancel',
        type: newStatus ? 'primary' : 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateDepartmentStatus(department.id, newStatus);
      }
    });
  }

  /**
   * Update department status
   */
  updateDepartmentStatus(id: number, isActive: boolean): void {
    this.loading = true;
    this.departmentService.toggleDepartmentStatus(id, isActive).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSnackBar(
            `Department ${isActive ? 'activated' : 'deactivated'} successfully`, 
            'success'
          );
          this.loadDepartments();
        }
      },
      error: (error) => {
        console.error('Error updating department status:', error);
        this.showSnackBar(error.error?.message || 'Failed to update department status', 'error');
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
    return isActive ? 'badge-success' : 'badge-inactive';
  }

  /**
   * Get status text
   */
  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

}
