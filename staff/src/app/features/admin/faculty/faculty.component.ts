import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateFacultyDto, Faculty, FacultyFilters, UpdateFacultyDto } from '../../../core/models/academics/faculty.model';
import { FacultyService } from '../../../core/services/faculty/faculty.service';

declare var $: any; 

@Component({
  selector: 'app-faculty',
  standalone: true,
   imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './faculty.component.html',
  styleUrl: './faculty.component.scss'
})
export class FacultyComponent {
   // Data properties
  faculties: Faculty[] = [];
  selectedFaculty: Faculty | null = null;
  
  // Pagination properties
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  
  // UI state properties
  isLoading = false;
  isSubmitting = false;
  isLoadingPermissions = false;
  errorMessage = '';
  successMessage = '';
  
  // Search and filter
  searchTerm = '';
  activeFilter: boolean | undefined = undefined;
  
  // Forms
  facultyForm: FormGroup;
  isEditMode = false;
  
  // Permissions
  canCreate = true;
  canUpdate = true;
  canDelete = true;
  canView = true;
  Math: any;

  constructor(
    private facultyService: FacultyService,
    private fb: FormBuilder
  ) {
    this.facultyForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      code: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(10)]],
      description: ['', [Validators.required]],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    // Load permissions first, then load data
    this.loadPermissions();
  }

  /**
   * Load permissions on component initialization
   */
  loadPermissions(): void {
    // NMTC: every staff user can manage faculties.
    this.loadFaculties();
  }

  /**
   * Load faculties with current filters
   */
  loadFaculties(): void {
    if (!this.canView) {
      this.errorMessage = 'You do not have permission to view faculties';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const filters: FacultyFilters = {
      page: this.currentPage,
      page_size: this.pageSize,
      search: this.searchTerm || undefined,
      is_active: this.activeFilter,
      sort_by: 'name',
      sort_dir: 'asc'
    };

    this.facultyService.getFaculties(filters).subscribe({
      next: (response) => {
        console.log(response)
        this.faculties = response.data.data;
        this.totalItems = response.data.total;
        this.totalPages = response.data.total_pages;
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load faculties';
        this.isLoading = false;
      }
    });
  }

  /**
   * Open modal to create new faculty
   */
  openCreateModal(): void {
    if (!this.canCreate) {
      this.showError('You do not have permission to create faculties');
      return;
    }

    this.isEditMode = false;
    this.selectedFaculty = null;
    this.facultyForm.reset({ is_active: true });
    $('#facultyModal').modal('show');
  }

  /**
   * Open modal to edit existing faculty
   */
  openEditModal(faculty: Faculty): void {
    if (!this.canUpdate) {
      this.showError('You do not have permission to update faculties');
      return;
    }

    this.isEditMode = true;
    this.selectedFaculty = faculty;
    this.facultyForm.patchValue({
      name: faculty.name,
      code: faculty.code,
      description: faculty.description,
      is_active: faculty.is_active
    });
    $('#facultyModal').modal('show');
  }

  /**
   * Submit form (create or update)
   */
  onSubmit(): void {
    if (this.facultyForm.invalid) {
      this.markFormGroupTouched(this.facultyForm);
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const formValue = this.facultyForm.value;

    if (this.isEditMode && this.selectedFaculty) {
      // Check update permission
      if (!this.canUpdate) {
        this.showError('You do not have permission to update faculties');
        this.isSubmitting = false;
        return;
      }

      const updateDto: UpdateFacultyDto = {
        name: formValue.name,
        code: formValue.code,
        description: formValue.description,
        is_active: formValue.is_active
      };

      this.facultyService.updateFaculty(this.selectedFaculty.id!, updateDto).subscribe({
        next: (response) => {
          this.showSuccess(response.message || 'Faculty updated successfully');
          this.closeModal();
          this.loadFaculties();
          this.isSubmitting = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update faculty';
          this.isSubmitting = false;
        }
      });
    } else {
      // Check create permission
      if (!this.canCreate) {
        this.showError('You do not have permission to create faculties');
        this.isSubmitting = false;
        return;
      }

      const createDto: CreateFacultyDto = {
        name: formValue.name,
        code: formValue.code,
        description: formValue.description,
        is_active: formValue.is_active
      };

      this.facultyService.createFaculty(createDto).subscribe({
        next: (response) => {
          this.showSuccess(response.message || 'Faculty created successfully');
          this.closeModal();
          this.loadFaculties();
          this.isSubmitting = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to create faculty';
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Confirm and delete faculty
   */
  confirmDelete(faculty: Faculty): void {
    if (!this.canDelete) {
      this.showError('You do not have permission to delete faculties');
      return;
    }

    if (confirm(`Are you sure you want to delete the faculty "${faculty.name}"? This action cannot be undone.`)) {
      this.deleteFaculty(faculty.id!);
    }
  }

  /**
   * Delete faculty
   */
  deleteFaculty(id: number): void {
    this.isLoading = true;
    this.facultyService.deleteFaculty(id).subscribe({
      next: (response) => {
        this.showSuccess(response.message || 'Faculty deleted successfully');
        this.loadFaculties();
      },
      error: (error) => {
        this.showError(error.message || 'Failed to delete faculty');
        this.isLoading = false;
      }
    });
  }

  /**
   * Search faculties
   */
  onSearch(): void {
    this.currentPage = 1;
    this.loadFaculties();
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadFaculties();
  }

  /**
   * Filter by active status
   */
  filterByStatus(status: boolean | undefined): void {
    this.activeFilter = status;
    this.currentPage = 1;
    this.loadFaculties();
  }

  /**
   * Change page
   */
  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadFaculties();
    }
  }

  /**
   * Change page size
   */
  changePageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.loadFaculties();
  }

  /**
   * Get page numbers for pagination
   */
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  /**
   * Close modal
   */
  closeModal(): void {
    $('#facultyModal').modal('hide');
    this.facultyForm.reset();
    this.selectedFaculty = null;
    this.errorMessage = '';
  }

  /**
   * Show success message
   */
  showSuccess(message: string): void {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = '';
    }, 5000);
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    this.errorMessage = message;
    setTimeout(() => {
      this.errorMessage = '';
    }, 5000);
  }

  /**
   * Mark all form fields as touched
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  /**
   * Check if form field has error
   */
  hasError(fieldName: string, errorType: string): boolean {
    const field = this.facultyForm.get(fieldName);
    return !!(field && field.hasError(errorType) && (field.dirty || field.touched));
  }

  /**
   * Get error message for field
   */
  getErrorMessage(fieldName: string): string {
    const field = this.facultyForm.get(fieldName);
    
    if (field?.hasError('required')) {
      return `${this.getFieldLabel(fieldName)} is required`;
    }
    
    if (field?.hasError('minlength')) {
      const minLength = field.errors?.['minlength'].requiredLength;
      return `${this.getFieldLabel(fieldName)} must be at least ${minLength} characters`;
    }
    
    if (field?.hasError('maxlength')) {
      const maxLength = field.errors?.['maxlength'].requiredLength;
      return `${this.getFieldLabel(fieldName)} must not exceed ${maxLength} characters`;
    }
    
    return '';
  }

  /**
   * Get field label
   */
  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      name: 'Faculty Name',
      code: 'Faculty Code',
      description: 'Description'
    };
    return labels[fieldName] || fieldName;
  }

}
