import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { ApplicationBatchService } from '../../../../../core/services/registration/application-batch.service';
import { ApplicationBatch, choiceLabel } from '../../../../../core/models/registration/application-batch.model';

export interface NotifyApplicationDialogData {
  batch: ApplicationBatch;
}

@Component({
  selector: 'app-notify-application-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './notify-application-dialog.component.html',
  styleUrls: ['./notify-application-dialog.component.scss']
})
export class NotifyApplicationDialogComponent {
  readonly choiceLabel = choiceLabel;
  batch: ApplicationBatch;
  selectedApplicationId: number | null = null;
  submitting = false;
  errorMessage = '';

  constructor(
    private toast: ToastService,
    private applicationBatchService: ApplicationBatchService,
    public dialogRef: MatDialogRef<NotifyApplicationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NotifyApplicationDialogData
  ) {
    this.batch = data.batch;
  }

  notify(): void {
    this.errorMessage = '';

    if (!this.selectedApplicationId) {
      this.errorMessage = 'Select a programme to notify.';
      return;
    }

    this.submitting = true;
    this.applicationBatchService.notify(this.batch.id, this.selectedApplicationId).subscribe({
      next: res => {
        this.submitting = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to notify applicant.';
          return;
        }
        this.toast.showSuccess('Success', 'Applicant notified successfully.');
        this.dialogRef.close({ success: true, data: res.data });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to notify applicant.';
      }
    });
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
