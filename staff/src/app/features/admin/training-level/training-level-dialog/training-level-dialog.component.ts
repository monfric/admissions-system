import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { TextFieldModule } from '@angular/cdk/text-field';
import { TrainingLevel } from '../../../../core/models/academics/training-level.model';

export interface TrainingLevelDialogData {
  mode: 'create' | 'edit' | 'view';
  trainingLevel?: TrainingLevel;
}

@Component({
  selector: 'app-training-level-dialog',
  standalone: true,
   imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDividerModule,
    TextFieldModule
  ],
  templateUrl: './training-level-dialog.component.html',
  styleUrl: './training-level-dialog.component.scss'
})
export class TrainingLevelDialogComponent implements OnInit {
  trainingLevelForm!: FormGroup;
  mode: 'create' | 'edit' | 'view' = 'create';

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<TrainingLevelDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TrainingLevelDialogData
  ) {
    this.mode = data.mode;
  }

  ngOnInit(): void {
    this.initializeForm();
    
    if ((this.mode === 'edit' || this.mode === 'view') && this.data.trainingLevel) {
      this.trainingLevelForm.patchValue({
        name: this.data.trainingLevel.name,
        code: this.data.trainingLevel.code,
        description: this.data.trainingLevel.description || '',
        order: this.data.trainingLevel.order,
        is_active: this.data.trainingLevel.is_active
      });
    }
  }

  initializeForm(): void {
    this.trainingLevelForm = this.fb.group({
      name: [
        { value: '', disabled: this.isViewMode },
        [Validators.required, Validators.maxLength(100)]
      ],
      code: [
        { value: '', disabled: this.isViewMode },
        [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Z0-9]+$/)]
      ],
      order: [
        { value: 1, disabled: this.isViewMode },
        [Validators.required, Validators.min(1), Validators.max(99)]
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
    this.trainingLevelForm.get('code')?.valueChanges.subscribe(value => {
      if (value && !this.isViewMode) {
        const upperValue = value.toUpperCase();
        if (value !== upperValue) {
          this.trainingLevelForm.get('code')?.setValue(upperValue, { emitEvent: false });
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
        return 'Add New Training Level';
      case 'edit':
        return 'Edit Training Level';
      case 'view':
        return 'Training Level Details';
      default:
        return 'Training Level';
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
        return 'layers';
    }
  }

  onSubmit(): void {
    if (this.trainingLevelForm.valid && !this.isViewMode) {
      Object.keys(this.trainingLevelForm.controls).forEach(key => {
        this.trainingLevelForm.get(key)?.markAsTouched();
      });

      if (this.trainingLevelForm.valid) {
        this.dialogRef.close(this.trainingLevelForm.getRawValue());
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getErrorMessage(controlName: string): string {
    const control = this.trainingLevelForm.get(controlName);
    
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
      'name': 'Training level name',
      'code': 'Training level code',
      'order': 'Order',
      'description': 'Description'
    };
    return labels[controlName] || controlName;
  }

  hasError(controlName: string): boolean {
    const control = this.trainingLevelForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }


}
