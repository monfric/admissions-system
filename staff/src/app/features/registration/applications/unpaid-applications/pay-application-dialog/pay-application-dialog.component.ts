import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { PaymentService } from '../../../../../core/services/registration/payment.service';
import { PAYMENT_MODES } from '../../../../../core/models/registration/payment.model';
import { ApplicationBatch } from '../../../../../core/models/registration/application-batch.model';

export interface PayApplicationDialogData {
  batch: ApplicationBatch;
}

@Component({
  selector: 'app-pay-application-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './pay-application-dialog.component.html',
  styleUrls: ['./pay-application-dialog.component.scss']
})
export class PayApplicationDialogComponent implements OnInit {
  batch: ApplicationBatch;
  paymentForm!: FormGroup;
  paymentModes = PAYMENT_MODES;
  submitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private toast: ToastService,
    private paymentService: PaymentService,
    public dialogRef: MatDialogRef<PayApplicationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PayApplicationDialogData
  ) {
    this.batch = data.batch;
  }

  ngOnInit(): void {
    this.paymentForm = this.fb.group({
      payment_method: ['M-Pesa', Validators.required],
      transaction_code: ['', Validators.required]
    });
  }

  fieldError(name: string): string {
    const ctrl = this.paymentForm.get(name);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return '';
    if (ctrl.errors['required']) return 'This field is required';
    return 'Invalid value';
  }

  confirmPayment(): void {
    this.paymentForm.markAllAsTouched();
    if (this.paymentForm.invalid) return;

    this.submitting = true;
    this.errorMessage = '';

    this.paymentService.recordPayment(this.batch.id, this.paymentForm.getRawValue()).subscribe({
      next: res => {
        this.submitting = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to record payment.';
          return;
        }
        this.toast.showSuccess('Success', 'Payment recorded successfully.');
        this.dialogRef.close({ success: true, data: res.data });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to record payment.';
      }
    });
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
