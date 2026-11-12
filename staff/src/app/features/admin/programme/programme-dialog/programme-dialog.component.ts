import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { TextFieldModule } from '@angular/cdk/text-field';


import { Programme } from '../../../../core/models/academics/programme.model';
import { Department } from '../../../../core/models/academics/department.model';
import { TrainingLevel } from '../../../../core/models/academics/training-level.model';

export interface ProgrammeDialogData {
  mode: 'create' | 'edit' | 'view';
  programme?: Programme;
  departments: Department[];
  trainingLevels: TrainingLevel[];
}


@Component({
  selector: 'app-programme-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDividerModule,
    TextFieldModule
  ],
  templateUrl: './programme-dialog.component.html',
  styleUrl: './programme-dialog.component.scss'
})
export class ProgrammeDialogComponent implements OnInit{

   programmeForm!: FormGroup;
  mode: 'create' | 'edit' | 'view' = 'create';
  departments: Department[] = [];
  trainingLevels: TrainingLevel[] = [];

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ProgrammeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ProgrammeDialogData
  ) {
    console.log(data)
    this.mode = data.mode;
    this.departments = data.departments || [];
    this.trainingLevels = data.trainingLevels || [];
  }
  ngOnInit(): void {
    this.initializeForm();
    
    if ((this.mode === 'edit' || this.mode === 'view') && this.data.programme) {
      this.programmeForm.patchValue({
        department_id: this.data.programme.department_id,
        training_level_id: this.data.programme.training_level_id,
        name: this.data.programme.name,
        code: this.data.programme.code,
        description: this.data.programme.description || '',
        duration_years: this.data.programme.duration_years,
        is_active: this.data.programme.is_active
      });
    }
  }

  initializeForm(): void {
    this.programmeForm = this.fb.group({
      department_id: [
        { value: null, disabled: this.isViewMode },
        [Validators.required]
      ],
      training_level_id: [
        { value: null, disabled: this.isViewMode },
        [Validators.required]
      ],
      name: [
        { value: '', disabled: this.isViewMode },
        [Validators.required, Validators.maxLength(200)]
      ],
      code: [
        { value: '', disabled: this.isViewMode },
        [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Z0-9]+$/)]
      ],
      duration_years: [
        { value: 1, disabled: this.isViewMode },
        [Validators.required, Validators.min(1), Validators.max(6)]
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
    this.programmeForm.get('code')?.valueChanges.subscribe(value => {
      if (value && !this.isViewMode) {
        const upperValue = value.toUpperCase();
        if (value !== upperValue) {
          this.programmeForm.get('code')?.setValue(upperValue, { emitEvent: false });
        }
      }
    });
  }

  get isViewMode(): boolean {
    return this.mode === 'view';
  }

  get dialogTitle(): string {
    switch (this.mode) {
      case 'create':
        return 'Add New Programme';
      case 'edit':
        return 'Edit Programme';
      case 'view':
        return 'Programme Details';
      default:
        return 'Programme';
    }
  }

  get dialogIcon(): string {
    switch (this.mode) {
      case 'create':
        return 'add_circle';
      case 'edit':
        return 'edit';
      case 'view':
        return 'visibility';
      default:
        return 'school';
    }
  }

  /**
   * Get selected department name
   */
  get selectedDepartmentName(): string {
    const deptId = this.programmeForm.get('department_id')?.value;
    const dept = this.departments.find(d => d.id === deptId);
    return dept ? dept.name : 'Not selected';
  }

  /**
   * Get selected training level name
   */
  get selectedTrainingLevelName(): string {
    const levelId = this.programmeForm.get('training_level_id')?.value;
    const level = this.trainingLevels.find(l => l.id === levelId);
    return level ? level.name : 'Not selected';
  }

  onSubmit(): void {
    if (this.programmeForm.valid && !this.isViewMode) {
      Object.keys(this.programmeForm.controls).forEach(key => {
        this.programmeForm.get(key)?.markAsTouched();
      });

      if (this.programmeForm.valid) {
        this.dialogRef.close(this.programmeForm.getRawValue());
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getErrorMessage(controlName: string): string {
    const control = this.programmeForm.get(controlName);
    
    if (control?.hasError('required')) {
      return `${this.getFieldLabel(controlName)} is required`;
    }
    
    if (control?.hasError('maxlength')) {
      const maxLength = control.errors?.['maxlength'].requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }

    if (control?.hasError('min')) {
      const min = control.errors?.['min'].min;
      return `Minimum value is ${min}`;
    }

    if (control?.hasError('max')) {
      const max = control.errors?.['max'].max;
      return `Maximum value is ${max}`;
    }

    if (control?.hasError('pattern')) {
      if (controlName === 'code') {
        return 'Code must contain only uppercase letters and numbers';
      }
    }
    
    return '';
  }

  private getFieldLabel(controlName: string): string {
    const labels: { [key: string]: string } = {
      'department_id': 'Department',
      'training_level_id': 'Training level',
      'name': 'Programme name',
      'code': 'Programme code',
      'duration_years': 'Duration',
      'description': 'Description'
    };
    return labels[controlName] || controlName;
  }

  hasError(controlName: string): boolean {
    const control = this.programmeForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  /**
   * Get department by ID
   */
  getDepartmentById(id: number): Department | undefined {
    return this.departments.find(d => d.id === id);
  }

  /**
   * Get training level by ID
   */
  getTrainingLevelById(id: number): TrainingLevel | undefined {
    return this.trainingLevels.find(l => l.id === id);
  }

}
