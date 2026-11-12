import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { PaymentService } from '../../../../../core/services/registration/payment.service';
import { PAYMENT_MODES } from '../../../../../core/models/registration/payment.model';
import { ApplicationBatch, PaymentProof } from '../../../../../core/models/registration/application-batch.model';

export interface PayApplicationDialogData {
  batch: ApplicationBatch;
}

@Component({
  selector: 'app-pay-application-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './pay-application-dialog.component.html',
  styleUrls: ['./pay-application-dialog.component.scss']
})
export class PayApplicationDialogComponent implements OnInit, OnDestroy {
  batch: ApplicationBatch;
  paymentForm!: FormGroup;
  paymentModes = PAYMENT_MODES;
  submitting = false;
  errorMessage = '';

  /** The latest proof; a payment can only be confirmed while it's 'submitted'. */
  proof: PaymentProof | null;
  proofImageUrl: SafeUrl | null = null;
  private proofObjectUrl: string | null = null;
  loadingProofImage = false;
  proofEnlarged = false;
  /** Set when a proof was uploaded or rejected here, so the list refreshes on close. */
  private changed = false;

  rejecting = false;
  rejectReason = '';
  busyRejecting = false;

  // Staff uploading a proof for the applicant
  uploadCode = '';
  uploadFile: File | null = null;
  uploadingProof = false;
  readonly proofMaxBytes = 2 * 1024 * 1024;

  constructor(
    private fb: FormBuilder,
    private toast: ToastService,
    private paymentService: PaymentService,
    private sanitizer: DomSanitizer,
    public dialogRef: MatDialogRef<PayApplicationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PayApplicationDialogData
  ) {
    this.batch = data.batch;
    this.proof = data.batch.payment_proof ?? null;
  }

  ngOnInit(): void {
    this.paymentForm = this.fb.group({
      payment_method: ['M-Pesa', Validators.required],
      transaction_code: ['', Validators.required]
    });
    this.applyProof();
  }

  ngOnDestroy(): void {
    this.revokeImage();
  }

  get proofSubmitted(): boolean {
    return this.proof?.status === 'submitted';
  }

  /** Shows the current proof: its image, and its code in the payment form. */
  private applyProof(): void {
    this.revokeImage();
    this.rejecting = false;
    this.rejectReason = '';
    if (!this.proofSubmitted) return;
    this.paymentForm.patchValue({ transaction_code: this.proof!.transaction_code });
    this.loadingProofImage = true;
    this.paymentService.getProofImage(this.batch.id).subscribe({
      next: blob => {
        this.loadingProofImage = false;
        this.proofObjectUrl = URL.createObjectURL(blob);
        this.proofImageUrl = this.sanitizer.bypassSecurityTrustUrl(this.proofObjectUrl);
      },
      error: () => {
        this.loadingProofImage = false;
        this.errorMessage = 'Could not load the proof image.';
      }
    });
  }

  private revokeImage(): void {
    if (this.proofObjectUrl) URL.revokeObjectURL(this.proofObjectUrl);
    this.proofObjectUrl = null;
    this.proofImageUrl = null;
  }

  rejectProof(): void {
    const reason = this.rejectReason.trim();
    if (reason.length < 3) {
      this.errorMessage = 'Give the applicant a short reason (e.g. "Image unclear", "Amount does not match").';
      return;
    }
    this.busyRejecting = true;
    this.errorMessage = '';
    this.paymentService.rejectProof(this.batch.id, reason).subscribe({
      next: res => {
        this.busyRejecting = false;
        this.proof = res.data;
        this.changed = true;
        this.paymentForm.patchValue({ transaction_code: '' });
        this.applyProof();
        this.toast.showSuccess('Proof rejected', 'The applicant will see your reason and can upload a new proof.');
      },
      error: err => {
        this.busyRejecting = false;
        this.errorMessage = err.error?.message || 'Failed to reject the proof.';
      }
    });
  }

  onUploadFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.uploadFile = null;
    this.errorMessage = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.errorMessage = 'The proof must be a JPG or PNG image.';
      input.value = '';
      return;
    }
    if (file.size > this.proofMaxBytes) {
      this.errorMessage = 'The image is larger than 2 MB.';
      input.value = '';
      return;
    }
    this.uploadFile = file;
  }

  /** Uploads a proof for the applicant, e.g. a photo of a receipt from the office. */
  uploadProof(): void {
    if (!this.uploadCode.trim() || !this.uploadFile) {
      this.errorMessage = 'Enter the transaction code and choose the image.';
      return;
    }
    this.uploadingProof = true;
    this.errorMessage = '';
    this.paymentService.uploadProof(this.batch.id, this.uploadFile, this.uploadCode.trim()).subscribe({
      next: res => {
        this.uploadingProof = false;
        this.proof = res.data;
        this.changed = true;
        this.uploadCode = '';
        this.uploadFile = null;
        this.applyProof();
      },
      error: err => {
        this.uploadingProof = false;
        this.errorMessage = err.error?.message || 'Failed to upload the proof.';
      }
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
    if (this.paymentForm.invalid || !this.proofSubmitted) return;

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
    this.dialogRef.close(this.changed ? { changed: true } : null);
  }
}
