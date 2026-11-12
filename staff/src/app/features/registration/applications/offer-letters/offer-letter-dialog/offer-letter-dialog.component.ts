import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { Intake } from '../../../../../core/models/registration/intake.model';
import { IntakeProgramme } from '../../../../../core/models/registration/intake-programme.model';
import { OfferLetter, CreateOfferLetterRequest, UpdateOfferLetterRequest } from '../../../../../core/models/registration/offer-letter.model';

import { IntakeService } from '../../../../../core/services/registration/intake.service';
import { IntakeProgrammeService } from '../../../../../core/services/registration/intake-programme.service';
import { OfferLetterService } from '../../../../../core/services/registration/offer-letter.service';

export interface OfferLetterDialogData {
  mode?: 'create' | 'edit' | 'view';
  offerLetter?: OfferLetter;
}

import { RichTextEditorComponent } from '../../../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-offer-letter-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, RichTextEditorComponent],
  templateUrl: './offer-letter-dialog.component.html',
  styleUrls: ['./offer-letter-dialog.component.scss']
})
export class OfferLetterDialogComponent implements OnInit {
  letterForm!: FormGroup;
  submitting = false;
  errorMessage = '';
  mode: 'create' | 'edit' | 'view' = 'create';
  letterId: number | null = null;

  intakes: Intake[] = [];
  loadingIntakes = false;

  programmes: IntakeProgramme[] = [];
  loadingProgrammes = false;

  types = [
    { value: 'provisional', label: 'Provisional' },
    { value: 'admission', label: 'Admission' }
  ];

  constructor(
    private fb: FormBuilder,
    private toast: ToastService,
    private intakeService: IntakeService,
    private intakeProgrammeService: IntakeProgrammeService,
    private offerLetterService: OfferLetterService,
    public dialogRef: MatDialogRef<OfferLetterDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: OfferLetterDialogData
  ) {
    this.mode = data.mode || 'create';
  }

  ngOnInit(): void {
    this.letterForm = this.fb.group({
      intake_id: [null, [Validators.required]],
      intake_programme_id: [null, [Validators.required]],
      type: ['', [Validators.required]],
      body: ['', [Validators.required]],
      is_active: [true]
    });

    this.loadIntakes(() => {
      if (this.mode !== 'create' && this.data.offerLetter) {
        const letter = this.data.offerLetter;
        this.letterId = letter.id;
        this.letterForm.patchValue({
          intake_id: letter.intake_id,
          type: letter.type,
          body: letter.body,
          is_active: letter.status === 'active'
        });

        this.loadProgrammes(letter.intake_id, () => {
          this.letterForm.patchValue({ intake_programme_id: letter.intake_programme_id });
        });
      }

      if (this.mode === 'view') {
        this.letterForm.disable();
      }
    });
  }

  private loadIntakes(onDone?: () => void): void {
    this.loadingIntakes = true;
    this.intakeService.getIntakes(1, 100).subscribe({
      next: res => {
        this.loadingIntakes = false;
        if (res.success) this.intakes = res.data.data;
        onDone?.();
      },
      error: () => {
        this.loadingIntakes = false;
        this.toast.showError('Error', 'Failed to load intakes.');
        onDone?.();
      }
    });
  }

  onIntakeChange(): void {
    this.programmes = [];
    this.letterForm.patchValue({ intake_programme_id: null });

    const intakeId = this.letterForm.get('intake_id')?.value;
    if (!intakeId) return;

    this.loadProgrammes(intakeId);
  }

  private loadProgrammes(intakeId: number, onDone?: () => void): void {
    this.loadingProgrammes = true;
    this.intakeProgrammeService.getByIntake(intakeId).subscribe({
      next: res => {
        this.loadingProgrammes = false;
        if (res.success) this.programmes = res.data;
        onDone?.();
      },
      error: () => {
        this.loadingProgrammes = false;
        this.toast.showError('Error', 'Failed to load programmes for the selected intake.');
        onDone?.();
      }
    });
  }

  isCreate(): boolean { return this.mode === 'create'; }
  isEdit(): boolean { return this.mode === 'edit'; }
  isView(): boolean { return this.mode === 'view'; }

  get title(): string {
    const labels = { create: 'Add New Letter', edit: 'Edit Offer Letter', view: 'Offer Letter Details' };
    return labels[this.mode];
  }

  fieldError(name: string): string {
    const ctrl = this.letterForm.get(name);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return '';
    if (ctrl.errors['required']) return 'This field is required';
    return 'Invalid value';
  }

  save(): void {
    if (this.isView()) { this.dialogRef.close(null); return; }

    this.letterForm.markAllAsTouched();
    if (this.letterForm.invalid) {
      this.errorMessage = 'Please fix the highlighted fields before submitting.';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const raw = this.letterForm.getRawValue();
    const status = raw.is_active ? 'active' : 'inactive';

    if (this.isEdit() && this.letterId) {
      const payload: UpdateOfferLetterRequest = {
        intake_programme_id: raw.intake_programme_id,
        type: raw.type,
        body: raw.body,
        status
      };
      this.offerLetterService.update(this.letterId, payload).subscribe({
        next: res => {
          this.submitting = false;
          if (!res.success || !res.data) {
            this.errorMessage = res.message || 'Failed to update offer letter.';
            return;
          }
          this.toast.showSuccess('Success', 'Offer letter updated successfully.');
          this.dialogRef.close({ success: true, data: res.data });
        },
        error: err => {
          this.submitting = false;
          this.errorMessage = err.error?.message || 'Failed to update offer letter.';
        }
      });
      return;
    }

    const payload: CreateOfferLetterRequest = {
      intake_programme_id: raw.intake_programme_id,
      type: raw.type,
      body: raw.body,
      status
    };
    this.offerLetterService.create(payload).subscribe({
      next: res => {
        this.submitting = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to create offer letter.';
          return;
        }
        this.toast.showSuccess('Success', 'Offer letter created successfully.');
        this.dialogRef.close({ success: true, data: res.data });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to create offer letter.';
      }
    });
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
