import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';

import {
  measurementStatusDisplay,
  UniformMeasurementListItem,
  UniformSet
} from '../../../../../core/models/registration/uniform-measurement.model';
import { UniformMeasurementService } from '../../../../../core/services/registration/uniform-measurement.service';
import { ConfirmDialogComponent } from '../../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';
import { DocumentViewerDialogComponent } from '../../../../admin/student/document-viewer-dialog/document-viewer-dialog.component';

export interface UniformMeasurementDialogData {
  admissionId: number;
}

/** A student's submitted uniform measurements. Closes with true if they were unlocked. */
@Component({
  selector: 'app-uniform-measurement-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './uniform-measurement-dialog.component.html',
  styleUrls: ['./uniform-measurement-dialog.component.scss']
})
export class UniformMeasurementDialogComponent implements OnInit {
  student: UniformMeasurementListItem | null = null;
  set: UniformSet | null = null;
  loading = true;
  unlocking = false;
  errorMessage = '';
  private changed = false;

  readonly statusDisplay = measurementStatusDisplay;

  constructor(
    public dialogRef: MatDialogRef<UniformMeasurementDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UniformMeasurementDialogData,
    private uniformService: UniformMeasurementService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    forkJoin({
      student: this.uniformService.get(this.data.admissionId),
      sets: this.uniformService.getSets()
    }).subscribe({
      next: ({ student, sets }) => {
        this.loading = false;
        this.student = student.data;
        this.set = (sets.data || []).find(s => s.key === student.data?.measurement?.uniform_set) ?? null;
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to load uniform measurements.';
      }
    });
  }

  value(key: string): number | null {
    return this.student?.measurement?.values[key] ?? null;
  }

  viewPdf(): void {
    if (!this.student) return;
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '90vh',
      data: {
        fileUrl: this.uniformService.pdfUrl(this.student.admission_id),
        fileType: 'pdf',
        title: `Uniform Measurements – ${this.student.applicant_full_name}`,
        fileName: `Uniform-Measurements-${this.student.admission_number.replace(/[\/\s]+/g, '-')}.pdf`
      }
    });
  }

  unlock(): void {
    if (!this.student) return;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Unlock Measurements',
        message: `Unlock ${this.student.applicant_full_name}'s uniform measurements? They will be able to correct and resubmit them on the applicant portal. Their documents stay available.`,
        confirmText: 'Unlock',
        cancelText: 'Cancel',
        type: 'warn'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed || !this.student) return;
      this.unlocking = true;
      this.uniformService.unlock(this.student.admission_id).subscribe({
        next: res => {
          this.unlocking = false;
          if (res.success) {
            this.student = res.data;
            this.changed = true;
          } else {
            this.errorMessage = res.message || 'Failed to unlock measurements.';
          }
        },
        error: err => {
          this.unlocking = false;
          this.errorMessage = err.error?.message || 'Failed to unlock measurements.';
        }
      });
    });
  }

  close(): void {
    this.dialogRef.close(this.changed);
  }
}
