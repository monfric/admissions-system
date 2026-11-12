import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { ConfirmDialogComponent } from '../../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';

import { Intake } from '../../../../../core/models/registration/intake.model';
import { IntakeProgramme } from '../../../../../core/models/registration/intake-programme.model';
import { IntakeTrainingLevel } from '../../../../../core/models/registration/intake-training-level.model';
import { Programme, PaginatedProgrammes } from '../../../../../core/models/academics/programme.model';
import { TrainingLevel, PaginatedTrainingLevels } from '../../../../../core/models/academics/training-level.model';

import { IntakeProgrammeService } from '../../../../../core/services/registration/intake-programme.service';
import { IntakeTrainingLevelService } from '../../../../../core/services/registration/intake-training-level.service';
import { ProgrammeService } from '../../../../../core/services/programme/programme.service';
import { TrainingLevelService } from '../../../../../core/services/training-level/training-level.service';

export interface IntakeManageDialogData {
  intake: Intake;
}

type ManageTab = 'programmes' | 'fees';

@Component({
  selector: 'app-intake-manage-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './intake-manage-dialog.component.html',
  styleUrls: ['./intake-manage-dialog.component.scss']
})
export class IntakeManageDialogComponent implements OnInit {
  intake: Intake;
  activeTab: ManageTab = 'programmes';

  // ── Programmes tab ──────────────────────────────────────────
  intakeProgrammes: IntakeProgramme[] = [];
  loadingProgrammes = false;
  allProgrammes: Programme[] = [];
  programmeForm!: FormGroup;
  editingProgrammeId: number | null = null;
  submittingProgramme = false;

  // ── Application Fees tab ────────────────────────────────────
  intakeTrainingLevels: IntakeTrainingLevel[] = [];
  loadingFees = false;
  allTrainingLevels: TrainingLevel[] = [];
  feeForm!: FormGroup;
  editingFeeId: number | null = null;
  submittingFee = false;

  constructor(
    private fb: FormBuilder,
    private toast: ToastService,
    private matDialog: MatDialog,
    private intakeProgrammeService: IntakeProgrammeService,
    private intakeTrainingLevelService: IntakeTrainingLevelService,
    private programmeService: ProgrammeService,
    private trainingLevelService: TrainingLevelService,
    public dialogRef: MatDialogRef<IntakeManageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: IntakeManageDialogData
  ) {
    this.intake = data.intake;
  }

  ngOnInit(): void {
    this.programmeForm = this.fb.group({
      programme_id: [null, Validators.required],
      is_active: [true]
    });

    this.feeForm = this.fb.group({
      training_level_id: [null, Validators.required],
      application_fee: [null, [Validators.required, Validators.min(0)]],
      is_active: [true]
    });

    this.loadProgrammeOptions();
    this.loadTrainingLevelOptions();
    this.loadIntakeProgrammes();
    this.loadIntakeTrainingLevels();
  }

  get intakeName(): string {
    return `${this.intake.intake_month} ${this.intake.intake_year}`;
  }

  selectTab(tab: ManageTab): void {
    this.activeTab = tab;
  }

  close(): void {
    this.dialogRef.close();
  }

  toggleActive(form: FormGroup): void {
    const ctrl = form.get('is_active');
    ctrl?.setValue(!ctrl.value);
  }

  // ── Programmes tab ──────────────────────────────────────────

  private loadProgrammeOptions(): void {
    this.programmeService.getAllProgrammes().subscribe({
      next: res => {
        if (!res.success) return;
        const data = res.data as Programme[] | PaginatedProgrammes;
        this.allProgrammes = Array.isArray(data) ? data : data.data;
      },
      error: () => this.toast.showError('Error', 'Failed to load programmes list.')
    });
  }

  loadIntakeProgrammes(): void {
    this.loadingProgrammes = true;
    this.intakeProgrammeService.getByIntake(this.intake.id).subscribe({
      next: res => {
        this.loadingProgrammes = false;
        if (res.success) this.intakeProgrammes = res.data;
      },
      error: () => {
        this.loadingProgrammes = false;
        this.toast.showError('Error', 'Failed to load registered programmes.');
      }
    });
  }

  editProgramme(ip: IntakeProgramme): void {
    this.editingProgrammeId = ip.id;
    this.programmeForm.patchValue({
      programme_id: ip.programme_id,
      is_active: ip.is_active
    });
  }

  cancelEditProgramme(): void {
    this.editingProgrammeId = null;
    this.programmeForm.reset({ programme_id: null, is_active: true });
  }

  saveProgramme(): void {
    this.programmeForm.markAllAsTouched();
    if (this.programmeForm.invalid) return;

    this.submittingProgramme = true;
    const raw = this.programmeForm.getRawValue();

    const req$ = this.editingProgrammeId
      ? this.intakeProgrammeService.update(this.editingProgrammeId, raw)
      : this.intakeProgrammeService.create(this.intake.id, raw);

    req$.subscribe({
      next: res => {
        this.submittingProgramme = false;
        if (!res.success) {
          this.toast.showError('Error', res.message || 'Failed to save programme.');
          return;
        }
        this.toast.showSuccess('Success', this.editingProgrammeId ? 'Programme updated.' : 'Programme registered.');
        this.cancelEditProgramme();
        this.loadIntakeProgrammes();
      },
      error: err => {
        this.submittingProgramme = false;
        this.toast.showError('Error', err.error?.message || 'Failed to save programme.');
      }
    });
  }

  deleteProgramme(ip: IntakeProgramme): void {
    this.matDialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Remove Programme',
        message: `Remove "${ip.programme_name}" from this intake?`,
        confirmText: 'Remove',
        cancelText: 'Cancel',
        type: 'danger'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.intakeProgrammeService.delete(ip.id).subscribe({
        next: res => {
          if (res.success) {
            this.toast.showSuccess('Success', 'Programme removed.');
            if (this.editingProgrammeId === ip.id) this.cancelEditProgramme();
            this.loadIntakeProgrammes();
          } else {
            this.toast.showError('Error', res.message || 'Failed to remove programme.');
          }
        },
        error: err => this.toast.showError('Error', err.error?.message || 'Failed to remove programme.')
      });
    });
  }

  // ── Application Fees tab ────────────────────────────────────

  private loadTrainingLevelOptions(): void {
    this.trainingLevelService.getAllTrainingLevels().subscribe({
      next: res => {
        if (!res.success) return;
        const data = res.data as TrainingLevel[] | PaginatedTrainingLevels;
        this.allTrainingLevels = Array.isArray(data) ? data : data.data;
      },
      error: () => this.toast.showError('Error', 'Failed to load training levels list.')
    });
  }

  loadIntakeTrainingLevels(): void {
    this.loadingFees = true;
    this.intakeTrainingLevelService.getByIntake(this.intake.id).subscribe({
      next: res => {
        this.loadingFees = false;
        if (res.success) this.intakeTrainingLevels = res.data;
      },
      error: () => {
        this.loadingFees = false;
        this.toast.showError('Error', 'Failed to load fee tiers.');
      }
    });
  }

  editFee(itl: IntakeTrainingLevel): void {
    this.editingFeeId = itl.id;
    this.feeForm.patchValue({
      training_level_id: itl.training_level_id,
      application_fee: itl.application_fee,
      is_active: itl.is_active
    });
  }

  cancelEditFee(): void {
    this.editingFeeId = null;
    this.feeForm.reset({ training_level_id: null, application_fee: null, is_active: true });
  }

  saveFee(): void {
    this.feeForm.markAllAsTouched();
    if (this.feeForm.invalid) return;

    this.submittingFee = true;
    const raw = this.feeForm.getRawValue();

    const req$ = this.editingFeeId
      ? this.intakeTrainingLevelService.update(this.editingFeeId, raw)
      : this.intakeTrainingLevelService.create(this.intake.id, raw);

    req$.subscribe({
      next: res => {
        this.submittingFee = false;
        if (!res.success) {
          this.toast.showError('Error', res.message || 'Failed to save fee tier.');
          return;
        }
        this.toast.showSuccess('Success', this.editingFeeId ? 'Fee tier updated.' : 'Fee tier added.');
        this.cancelEditFee();
        this.loadIntakeTrainingLevels();
      },
      error: err => {
        this.submittingFee = false;
        this.toast.showError('Error', err.error?.message || 'Failed to save fee tier.');
      }
    });
  }

  deleteFee(itl: IntakeTrainingLevel): void {
    this.matDialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Remove Fee Tier',
        message: `Remove the ${itl.training_level_name} fee tier from this intake?`,
        confirmText: 'Remove',
        cancelText: 'Cancel',
        type: 'danger'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.intakeTrainingLevelService.delete(itl.id).subscribe({
        next: res => {
          if (res.success) {
            this.toast.showSuccess('Success', 'Fee tier removed.');
            if (this.editingFeeId === itl.id) this.cancelEditFee();
            this.loadIntakeTrainingLevels();
          } else {
            this.toast.showError('Error', res.message || 'Failed to remove fee tier.');
          }
        },
        error: err => this.toast.showError('Error', err.error?.message || 'Failed to remove fee tier.')
      });
    });
  }
}
