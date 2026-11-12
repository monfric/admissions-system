import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import {
  ApplyIntakeOption,
  ApplyProgrammeOption,
  ApplyTrainingLevelOption
} from '../../../core/models/applicant-portal/applicant-application.model';
import { ApplicantPortalService } from '../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { RESIDENCE_OPTIONS } from '../../../core/models/academics/student.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';

/**
 * Apply for a course: pick an open intake, then a training level (which shows
 * its application fee), then a 1st choice programme and an optional 2nd
 * choice. Works like staff "Assign Application"; one application per intake,
 * and it can't be changed or withdrawn once submitted.
 */
@Component({
  selector: 'app-apply',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule],
  templateUrl: './apply.component.html',
  styleUrls: ['../shared/portal-ui.scss', './apply.component.scss']
})
export class ApplyComponent implements OnInit {
  intakes: ApplyIntakeOption[] = [];
  loading = true;
  submitting = false;
  errorMessage = '';

  selectedIntake: ApplyIntakeOption | null = null;
  selectedLevel: ApplyTrainingLevelOption | null = null;
  firstChoiceId: number | null = null;
  secondChoiceId: number | null = null;
  residence = '';
  readonly residenceOptions = RESIDENCE_OPTIONS;

  constructor(
    private portalService: ApplicantPortalService,
    private toast: ToastService,
    private matDialog: MatDialog,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.portalService.getApplyOptions().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success) {
          this.errorMessage = res.message || 'Failed to load open intakes.';
          return;
        }
        this.intakes = res.data || [];
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to load open intakes.';
      }
    });
  }

  /** True when every open intake already has an application from this applicant. */
  get allApplied(): boolean {
    return this.intakes.length > 0 && this.intakes.every(i => i.already_applied);
  }

  selectIntake(intake: ApplyIntakeOption): void {
    if (intake.already_applied || this.selectedIntake === intake) return;
    this.selectedIntake = intake;
    this.selectedLevel = null;
    this.firstChoiceId = null;
    this.secondChoiceId = null;
    this.residence = '';
    this.errorMessage = '';
  }

  selectLevel(level: ApplyTrainingLevelOption): void {
    if (this.selectedLevel === level) return;
    this.selectedLevel = level;
    this.firstChoiceId = null;
    this.secondChoiceId = null;
    this.errorMessage = '';
  }

  /** 2nd-choice options: every programme except the 1st choice. */
  get secondChoiceOptions(): ApplyProgrammeOption[] {
    return (this.selectedLevel?.programmes ?? []).filter(p => p.intake_programme_id !== this.firstChoiceId);
  }

  onFirstChoiceChange(): void {
    if (this.secondChoiceId === this.firstChoiceId) this.secondChoiceId = null;
    this.errorMessage = '';
  }

  programmeName(id: number | null): string {
    return this.selectedLevel?.programmes.find(p => p.intake_programme_id === id)?.programme_name ?? '';
  }

  submit(): void {
    this.errorMessage = '';
    if (!this.selectedIntake || !this.selectedLevel) {
      this.errorMessage = 'Select an intake and a training level.';
      return;
    }
    if (!this.firstChoiceId) {
      this.errorMessage = 'Select your 1st choice programme.';
      return;
    }
    if (!this.residence) {
      this.errorMessage = 'Select your mode of residence.';
      return;
    }

    const intake = this.selectedIntake;
    const level = this.selectedLevel;
    const programmeIds = [this.firstChoiceId, ...(this.secondChoiceId ? [this.secondChoiceId] : [])];
    const choices = `1st choice: ${this.programmeName(this.firstChoiceId)}` +
      (this.secondChoiceId ? `; 2nd choice: ${this.programmeName(this.secondChoiceId)}` : '');
    this.matDialog.open(ConfirmDialogComponent, {
      width: '460px',
      data: {
        title: 'Submit Application',
        message: `Apply to the ${intake.intake_name} intake at ${level.training_level_name} level (${choices}) ` +
                 `as a ${this.residence}? ` +
                 `Once submitted, your application can't be changed or withdrawn.`,
        confirmText: 'Submit Application',
        cancelText: 'Cancel',
        type: 'primary'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.submitting = true;
      this.portalService.apply({
        intake_id: intake.intake_id,
        training_level_id: level.training_level_id,
        intake_programme_ids: programmeIds,
        residence: this.residence
      }).subscribe({
        next: res => {
          this.submitting = false;
          if (!res.success || !res.data) {
            this.errorMessage = res.message || 'Failed to submit your application.';
            return;
          }
          this.toast.showSuccess('Application Submitted', `Your application number is ${res.data.application_number}.`);
          this.router.navigate(['/applicant/applications', res.data.id]);
        },
        error: err => {
          this.submitting = false;
          this.errorMessage = err.error?.message || 'Failed to submit your application.';
        }
      });
    });
  }
}
