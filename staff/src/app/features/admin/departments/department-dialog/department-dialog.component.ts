import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Department } from '../../../../core/models/academics/department.model';
import { Faculty } from '../../../../core/models/academics/faculty.model';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

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
import { MatDividerModule } from '@angular/material/divider'
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';


export interface DepartmentDialogData {
  mode: 'create' | 'edit' | 'view';
  department?: Department;
  faculties: Faculty[];
}

@Component({
  selector: 'app-department-dialog',
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
       NgxMatSelectSearchModule
      
    ],
  templateUrl: './department-dialog.component.html',
  styleUrl: './department-dialog.component.scss'
})
export class DepartmentDialogComponent implements OnInit {
  
 departmentForm!: FormGroup;
  mode: 'create' | 'edit' | 'view' = 'create';
  faculties: Faculty[] = [];

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<DepartmentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DepartmentDialogData
  ) {
    this.mode = data.mode;
    this.faculties = data.faculties || [];
  }

  ngOnInit(): void {
    this.initializeForm();
    
    // If edit or view mode, patch the form values
    if ((this.mode === 'edit' || this.mode === 'view') && this.data.department) {
      this.departmentForm.patchValue({
        faculty_id: this.data.department.faculty_id,
        name: this.data.department.name,
        code: this.data.department.code,
        description: this.data.department.description || '',
        is_active: this.data.department.is_active
      });
    }
  }

  /**
   * Initialize form with validators
   */
  initializeForm(): void {
    this.departmentForm = this.fb.group({
      faculty_id: [
        { value: null, disabled: this.isViewMode },
        [Validators.required]
      ],
      name: [
        { value: '', disabled: this.isViewMode },
        [Validators.required, Validators.maxLength(100)]
      ],
      code: [
        { value: '', disabled: this.isViewMode },
        [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Z0-9]+$/)]
      ],
      description: [
        { value: '', disabled: this.isViewMode },
        [Validators.maxLength(500)]
      ],
      is_active: [
        { value: true, disabled: this.isViewMode }
      ]
    });

    // Auto-uppercase the code field
    this.departmentForm.get('code')?.valueChanges.subscribe(value => {
      if (value && !this.isViewMode) {
        const upperValue = value.toUpperCase();
        if (value !== upperValue) {
          this.departmentForm.get('code')?.setValue(upperValue, { emitEvent: false });
        }
      }
    });
  }

  /**
   * Check if in view mode
   */
  get isViewMode(): boolean {
    return this.mode === 'view';
  }

  /**
   * Get dialog title based on mode
   */
  get dialogTitle(): string {
    switch (this.mode) {
      case 'create':
        return 'Add New Department';
      case 'edit':
        return 'Edit Department';
      case 'view':
        return 'Department Details';
      default:
        return 'Department';
    }
  }

  /**
   * Get dialog icon based on mode
   */
  get dialogIcon(): string {
    switch (this.mode) {
      case 'create':
        return 'add_business';
      case 'edit':
        return 'edit';
      case 'view':
        return 'visibility';
      default:
        return 'business';
    }
  }

  /**
   * Get selected faculty name for display
   */
  get selectedFacultyName(): string {
    const facultyId = this.departmentForm.get('faculty_id')?.value;
    const faculty = this.faculties.find(f => f.id === facultyId);
    return faculty ? faculty.name : 'Not selected';
  }

  /**
   * Handle form submission
   */
  onSubmit(): void {
    if (this.departmentForm.valid && !this.isViewMode) {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.departmentForm.controls).forEach(key => {
        this.departmentForm.get(key)?.markAsTouched();
      });

      if (this.departmentForm.valid) {
        this.dialogRef.close(this.departmentForm.getRawValue());
      }
    }
  }

  /**
   * Close dialog without saving
   */
  onCancel(): void {
    this.dialogRef.close();
  }

  /**
   * Get form control error message
   */
  getErrorMessage(controlName: string): string {
    const control = this.departmentForm.get(controlName);
    
    if (control?.hasError('required')) {
      return `${this.getFieldLabel(controlName)} is required`;
    }
    
    if (control?.hasError('maxlength')) {
      const maxLength = control.errors?.['maxlength'].requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }

    if (control?.hasError('pattern')) {
      if (controlName === 'code') {
        return 'Code must contain only uppercase letters and numbers';
      }
    }
    
    return '';
  }

  /**
   * Get field label for error messages
   */
  private getFieldLabel(controlName: string): string {
    const labels: { [key: string]: string } = {
      'faculty_id': 'Faculty',
      'name': 'Department name',
      'code': 'Department code',
      'description': 'Description'
    };
    return labels[controlName] || controlName;
  }

  /**
   * Check if field has error and should show error message
   */
  hasError(controlName: string): boolean {
    const control = this.departmentForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  /**
   * Get faculty by ID
   */
  getFacultyById(id: number): Faculty | undefined {
    return this.faculties.find(f => f.id === id);
  }

  /**
   * Check if form is dirty (has unsaved changes)
   */
  get hasUnsavedChanges(): boolean {
    return this.departmentForm.dirty && !this.isViewMode;
  }


}
