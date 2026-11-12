import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { ApplicationBatchService } from '../../../../../core/services/registration/application-batch.service';
import { ApplicationBatch, ApplicationItem } from '../../../../../core/models/registration/application-batch.model';

export interface ApproveApplicationDialogData {
  batch: ApplicationBatch;
}

@Component({
  selector: 'app-approve-application-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './approve-application-dialog.component.html',
  styleUrls: ['./approve-application-dialog.component.scss']
})
export class ApproveApplicationDialogComponent {
  batch: ApplicationBatch;
  remarks = '';
  submitting = false;
  errorMessage = '';

  constructor(
    private toast: ToastService,
    private applicationBatchService: ApplicationBatchService,
    public dialogRef: MatDialogRef<ApproveApplicationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApproveApplicationDialogData
  ) {
    this.batch = data.batch;
  }

  // The programme awaiting a decision: "notified", or "recalled" when the
  // dialog is opened from Recalled Applications.
  get selectedApplication(): ApplicationItem | undefined {
    return this.batch.applications.find(a => a.application_status === 'notified' || a.application_status === 'recalled');
  }

  get notifiedProgramme(): string {
    return this.selectedApplication?.programme_name ?? '';
  }

  get programmeLabel(): string {
    return this.selectedApplication?.application_status === 'recalled' ? 'Recalled Programme' : 'Notified Programme';
  }

  decide(decision: 'approve' | 'reject'): void {
    this.errorMessage = '';
    this.submitting = true;

    this.applicationBatchService.decide(this.batch.id, decision, this.remarks).subscribe({
      next: res => {
        this.submitting = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to record decision.';
          return;
        }
        this.toast.showSuccess('Success', decision === 'approve' ? 'Application approved.' : 'Application rejected.');
        this.dialogRef.close({ success: true, data: res.data });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to record decision.';
      }
    });
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
