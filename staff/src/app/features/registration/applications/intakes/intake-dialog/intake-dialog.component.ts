import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { IntakeService } from '../../../../../core/services/registration/intake.service';
import {
  Intake,
  INTAKE_MONTHS,
  CreateIntakeRequest,
  UpdateIntakeRequest
} from '../../../../../core/models/registration/intake.model';

export interface IntakeDialogData {
  mode?: 'create' | 'edit' | 'view';
  intake?: Intake;
}

@Component({
  selector: 'app-intake-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './intake-dialog.component.html',
  styleUrls: ['./intake-dialog.component.scss']
})
export class IntakeDialogComponent implements OnInit {
  intakeForm!: FormGroup;
  submitting = false;
  errorMessage = '';
  mode: 'create' | 'edit' | 'view' = 'create';
  intakeId: number | null = null;

  months = INTAKE_MONTHS;
  years: number[] = [];

  constructor(
    private fb: FormBuilder,
    private toast: ToastService,
    private intakeService: IntakeService,
    public dialogRef: MatDialogRef<IntakeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: IntakeDialogData
  ) {
    this.mode = data.mode || 'create';
    const currentYear = new Date().getFullYear();
    for (let i = -1; i < 6; i++) {
      this.years.push(currentYear + i);
    }
  }

  ngOnInit(): void {
    this.intakeForm = this.fb.group({
      intake_month: ['', [Validators.required]],
      intake_year: [new Date().getFullYear(), [Validators.required]],
      is_active: [true]
    });

    if (this.mode !== 'create' && this.data.intake) {
      this.intakeId = this.data.intake.id;
      this.intakeForm.patchValue({
        intake_month: this.data.intake.intake_month,
        intake_year: this.data.intake.intake_year,
        is_active: this.data.intake.is_active
      });
    }

    if (this.mode === 'view') {
      this.intakeForm.disable();
    }
  }

  isCreate(): boolean { return this.mode === 'create'; }
  isEdit(): boolean { return this.mode === 'edit'; }
  isView(): boolean { return this.mode === 'view'; }

  get title(): string {
    const labels = { create: 'Add New Intake', edit: 'Edit Intake', view: 'Intake Details' };
    return labels[this.mode];
  }

  fieldError(name: string): string {
    const ctrl = this.intakeForm.get(name);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return '';
    if (ctrl.errors['required']) return 'This field is required';
    return 'Invalid value';
  }

  save(): void {
    if (this.isView()) { this.dialogRef.close(null); return; }

    this.intakeForm.markAllAsTouched();
    if (this.intakeForm.invalid) {
      this.errorMessage = 'Please fix the highlighted fields before submitting.';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const raw = this.intakeForm.getRawValue();

    if (this.isEdit() && this.intakeId) {
      const payload: UpdateIntakeRequest = { ...raw };
      this.intakeService.updateIntake(this.intakeId, payload).subscribe({
        next: res => {
          this.submitting = false;
          if (!res.success || !res.data) {
            this.errorMessage = res.message || 'Failed to update intake.';
            return;
          }
          this.toast.showSuccess('Success', 'Intake updated successfully.');
          this.dialogRef.close({ success: true, data: res.data });
        },
        error: err => {
          this.submitting = false;
          this.errorMessage = err.error?.message || 'Failed to update intake.';
        }
      });
      return;
    }

    const payload: CreateIntakeRequest = { ...raw };
    this.intakeService.createIntake(payload).subscribe({
      next: res => {
        this.submitting = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to create intake.';
          return;
        }
        this.toast.showSuccess('Success', 'Intake created successfully.');
        this.dialogRef.close({ success: true, data: res.data });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to create intake.';
      }
    });
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
