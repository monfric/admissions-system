import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { RESIDENCE_OPTIONS } from '../../../../../core/models/academics/student.model';
import { Applicant } from '../../../../../core/models/registration/applicant.model';
import { Intake } from '../../../../../core/models/registration/intake.model';
import { IntakeTrainingLevel } from '../../../../../core/models/registration/intake-training-level.model';
import { IntakeProgramme } from '../../../../../core/models/registration/intake-programme.model';

import { IntakeService } from '../../../../../core/services/registration/intake.service';
import { IntakeTrainingLevelService } from '../../../../../core/services/registration/intake-training-level.service';
import { IntakeProgrammeService } from '../../../../../core/services/registration/intake-programme.service';
import { ApplicationBatchService } from '../../../../../core/services/registration/application-batch.service';

export interface AssignApplicationDialogData {
  applicant: Applicant;
}

@Component({
  selector: 'app-assign-application-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './assign-application-dialog.component.html',
  styleUrls: ['./assign-application-dialog.component.scss']
})
export class AssignApplicationDialogComponent implements OnInit {
  applicant: Applicant;

  // Step 1
  intakes: Intake[] = [];
  loadingIntakes = false;
  selectedIntakeId: number | null = null;

  // Step 2
  trainingLevels: IntakeTrainingLevel[] = [];
  loadingTrainingLevels = false;
  selectedTrainingLevelId: number | null = null;
  selectedFee: number | null = null;

  // Step 3: 1st choice (required) and 2nd choice (optional)
  programmes: IntakeProgramme[] = [];
  loadingProgrammes = false;
  firstChoiceId: number | null = null;
  secondChoiceId: number | null = null;

  // Mode of residence (required)
  residence = '';
  readonly residenceOptions = RESIDENCE_OPTIONS;

  submitting = false;
  errorMessage = '';

  constructor(
    private toast: ToastService,
    private intakeService: IntakeService,
    private intakeTrainingLevelService: IntakeTrainingLevelService,
    private intakeProgrammeService: IntakeProgrammeService,
    private applicationBatchService: ApplicationBatchService,
    public dialogRef: MatDialogRef<AssignApplicationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AssignApplicationDialogData
  ) {
    this.applicant = data.applicant;
  }

  ngOnInit(): void {
    this.loadActiveIntakes();
  }

  private loadActiveIntakes(): void {
    this.loadingIntakes = true;
    this.intakeService.getIntakes(1, 100, undefined, true).subscribe({
      next: res => {
        this.loadingIntakes = false;
        if (res.success) this.intakes = res.data.data;
      },
      error: () => {
        this.loadingIntakes = false;
        this.toast.showError('Error', 'Failed to load active intakes.');
      }
    });
  }

  onIntakeChange(): void {
    this.selectedTrainingLevelId = null;
    this.selectedFee = null;
    this.trainingLevels = [];
    this.programmes = [];
    this.firstChoiceId = null;
    this.secondChoiceId = null;
    this.errorMessage = '';

    if (!this.selectedIntakeId) return;

    this.loadingTrainingLevels = true;
    this.intakeTrainingLevelService.getByIntake(this.selectedIntakeId).subscribe({
      next: res => {
        this.loadingTrainingLevels = false;
        if (res.success) this.trainingLevels = res.data.filter(t => t.is_active);
      },
      error: () => {
        this.loadingTrainingLevels = false;
        this.toast.showError('Error', 'Failed to load training levels.');
      }
    });
  }

  onTrainingLevelChange(): void {
    this.programmes = [];
    this.firstChoiceId = null;
    this.secondChoiceId = null;
    this.errorMessage = '';

    const tier = this.trainingLevels.find(t => t.training_level_id === this.selectedTrainingLevelId);
    this.selectedFee = tier ? tier.application_fee : null;

    if (!this.selectedTrainingLevelId || !this.selectedIntakeId) return;

    this.loadingProgrammes = true;
    this.intakeProgrammeService.getByIntake(this.selectedIntakeId).subscribe({
      next: res => {
        this.loadingProgrammes = false;
        if (res.success) {
          this.programmes = res.data.filter(p => p.is_active && p.training_level_id === this.selectedTrainingLevelId);
        }
      },
      error: () => {
        this.loadingProgrammes = false;
        this.toast.showError('Error', 'Failed to load programmes.');
      }
    });
  }

  /** 2nd-choice options: every programme except the 1st choice. */
  get secondChoiceOptions(): IntakeProgramme[] {
    return this.programmes.filter(p => p.id !== this.firstChoiceId);
  }

  onFirstChoiceChange(): void {
    if (this.secondChoiceId === this.firstChoiceId) this.secondChoiceId = null;
    this.errorMessage = '';
  }

  assign(): void {
    this.errorMessage = '';

    if (!this.selectedIntakeId || !this.selectedTrainingLevelId) {
      this.errorMessage = 'Select an intake and a training level.';
      return;
    }
    if (!this.firstChoiceId) {
      this.errorMessage = 'Select the 1st choice programme.';
      return;
    }
    if (!this.residence) {
      this.errorMessage = 'Select the mode of residence.';
      return;
    }

    this.submitting = true;
    this.applicationBatchService.create(this.applicant.id, {
      intake_id: this.selectedIntakeId,
      training_level_id: this.selectedTrainingLevelId,
      intake_programme_ids: [this.firstChoiceId, ...(this.secondChoiceId ? [this.secondChoiceId] : [])],
      residence: this.residence
    }).subscribe({
      next: res => {
        this.submitting = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to assign application.';
          return;
        }
        this.toast.showSuccess('Success', `Application assigned — number ${res.data.application_number}.`);
        this.dialogRef.close({ success: true, data: res.data });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to assign application.';
      }
    });
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
