import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';

import { Applicant } from '../../../core/models/registration/applicant.model';
import { ApplicantAuthService } from '../../../core/services/applicant-portal/applicant-auth.service';
import { ApplicantPortalService } from '../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';
import { PROFILE_STEPS, REQUIRED_DOCUMENTS, buildProfileForm, patchProfileForm, toProfilePayload } from './profile-form';
import { PersonalStepComponent } from './personal-step/personal-step.component';
import { LocationBackgroundStepComponent } from './location-background-step/location-background-step.component';
import { GuardianSponsorStepComponent } from './guardian-sponsor-step/guardian-sponsor-step.component';
import { EducationStepComponent } from './education-step/education-step.component';
import { DocumentsStepComponent } from './documents-step/documents-step.component';
import { ReviewSubmitStepComponent } from './review-submit-step/review-submit-step.component';

/**
 * Multi-step profile form shown after sign-up. Each step is saved when the
 * applicant moves between steps, together with the step they're on, so a
 * refresh or later visit resumes there. Steps must be finished in order: a
 * step unlocks only once every step before it is complete (the server
 * enforces the same rule). Submitting locks the details (documents excepted)
 * and unlocks the rest of the portal.
 */
@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    PersonalStepComponent, LocationBackgroundStepComponent, GuardianSponsorStepComponent,
    EducationStepComponent, DocumentsStepComponent, ReviewSubmitStepComponent
  ],
  templateUrl: './profile-setup.component.html',
  styleUrls: ['./profile-form.scss', './profile-setup.component.scss']
})
export class ProfileSetupComponent implements OnInit {
  readonly steps = PROFILE_STEPS;
  profileForm: FormGroup;
  profile: Applicant | null = null;

  activeStep = 0;
  loading = true;
  saving = false;
  submitting = false;
  errorMessage = '';

  constructor(
    fb: FormBuilder,
    private portalService: ApplicantPortalService,
    private applicantAuth: ApplicantAuthService,
    private toast: ToastService,
    private matDialog: MatDialog,
    private router: Router
  ) {
    this.profileForm = buildProfileForm(fb);
  }

  ngOnInit(): void {
    this.portalService.getProfile().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to load your profile.';
          return;
        }
        if (res.data.mark_complete) {
          // Already submitted — details are locked; send them to My Profile.
          this.router.navigate(['/applicant/profile']);
          return;
        }
        this.profile = res.data;
        patchProfileForm(this.profileForm, res.data);
        this.profileForm.markAsPristine();
        // Resume on the saved step — unless an earlier step has since become incomplete.
        this.activeStep = Math.min(res.data.profile_step ?? 0, this.unlockedStep);
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to load your profile.';
      }
    });
  }

  get isLastStep(): boolean { return this.activeStep === this.steps.length - 1; }

  /** The furthest step the applicant may open: the first incomplete one. */
  get unlockedStep(): number {
    const firstIncomplete = this.steps.findIndex((_, i) => !this.isLastStepIndex(i) && !this.stepComplete(i));
    return firstIncomplete === -1 ? this.steps.length - 1 : firstIncomplete;
  }

  /** Share of the steps before Review & Submit that are complete. */
  get progressPercent(): number {
    return Math.round((this.unlockedStep / (this.steps.length - 1)) * 100);
  }

  stepState(i: number): 'current' | 'done' | 'open' | 'locked' {
    if (i === this.activeStep) return 'current';
    if (i > this.unlockedStep) return 'locked';
    return this.stepComplete(i) ? 'done' : 'open';
  }

  stepComplete(i: number): boolean {
    const step = this.steps[i];
    if (step.key === 'documents') return this.missingDocuments().length === 0;
    if (step.key === 'review') return false;
    return step.fields.every(name => this.profileForm.get(name)?.valid ?? true);
  }

  stepHasError(i: number): boolean {
    return this.steps[i].fields.some(name => {
      const ctrl = this.profileForm.get(name);
      return !!ctrl && ctrl.touched && ctrl.invalid;
    });
  }

  /** Continue: the current step must be complete, then it's saved and the next one opens. */
  next(): void {
    if (!this.validateCurrentStep()) return;
    this.goTo(this.activeStep + 1, true);
  }

  previous(): void {
    this.goTo(this.activeStep - 1);
  }

  /**
   * Stepper click. Going back is always allowed and keeps whatever was typed;
   * going forward needs the current step complete, and locked steps can't be opened.
   */
  selectStep(i: number): void {
    if (i === this.activeStep || i > this.unlockedStep) return;
    if (i > this.activeStep && !this.validateCurrentStep()) return;
    this.goTo(i);
  }

  submit(): void {
    this.profileForm.markAllAsTouched();
    const firstInvalid = this.steps.findIndex((_, i) => this.stepHasError(i));
    if (firstInvalid !== -1) {
      this.activeStep = firstInvalid;
      this.errorMessage = 'Please complete the highlighted fields before submitting.';
      return;
    }
    const missingDocs = this.missingDocuments();
    if (missingDocs.length) {
      this.activeStep = this.steps.findIndex(s => s.key === 'documents');
      this.errorMessage = `Please upload: ${missingDocs.map(d => d.label).join(', ')}.`;
      return;
    }

    this.matDialog.open(ConfirmDialogComponent, {
      width: '440px',
      data: {
        title: 'Submit Profile',
        message: 'Once submitted, your details are locked and only your documents can be changed. Submit now?',
        confirmText: 'Submit',
        cancelText: 'Cancel',
        type: 'primary'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.submitting = true;
      this.errorMessage = '';
      this.saveIfDirty().subscribe(ok => {
        if (!ok) { this.submitting = false; return; }
        this.portalService.submitProfile().subscribe({
          next: res => {
            if (!res.success) {
              this.submitting = false;
              this.errorMessage = res.message || 'Failed to submit your profile.';
              return;
            }
            // Refresh the session so the guards and sidebar see the completed profile.
            this.applicantAuth.me().subscribe({
              next: () => {
                this.submitting = false;
                this.toast.showSuccess('Profile Submitted', 'Your profile is complete. You can now apply for a course.');
                this.router.navigate(['/applicant/dashboard']);
              },
              error: () => { this.submitting = false; }
            });
          },
          error: err => {
            this.submitting = false;
            this.errorMessage = err.error?.message || 'Failed to submit your profile.';
          }
        });
      });
    });
  }

  /** Reloads the profile after a document upload so the checklist updates. */
  reloadProfile(): void {
    this.portalService.getProfile().subscribe({
      next: res => { if (res.success && res.data) this.profile = res.data; }
    });
  }

  private hasDocument(type: string): boolean {
    if (!this.profile) return false;
    if (type === 'profile') return !!this.profile.profile_photo;
    return (this.profile.documents || []).some(d => d.document_type === type);
  }

  private missingDocuments(): { type: string; label: string }[] {
    return REQUIRED_DOCUMENTS.filter(d => !this.hasDocument(d.type));
  }

  private isLastStepIndex(i: number): boolean { return i === this.steps.length - 1; }

  /** Marks the current step's fields touched and reports whether it is complete. */
  private validateCurrentStep(): boolean {
    const step = this.steps[this.activeStep];
    if (step.key === 'documents') {
      const missingDocs = this.missingDocuments();
      if (missingDocs.length) {
        this.errorMessage = `Please upload: ${missingDocs.map(d => d.label).join(', ')}.`;
        return false;
      }
      return true;
    }
    step.fields.forEach(name => this.profileForm.get(name)?.markAsTouched());
    if (!this.stepComplete(this.activeStep)) {
      this.errorMessage = 'Please complete the highlighted fields before continuing.';
      return false;
    }
    return true;
  }

  /**
   * Saves the draft along with the new step, then shows it. `announce` (used by
   * Continue only) confirms the save with a toast; Back and stepper jumps stay quiet.
   */
  private goTo(step: number, announce = false): void {
    if (step < 0 || step >= this.steps.length || this.saving) return;
    const completed = this.steps[this.activeStep];
    this.save(step).subscribe(ok => {
      if (!ok) return;
      if (announce) {
        // Documents upload on their own (each with a toast), so Continue there just confirms the step.
        const title = completed.key === 'documents' ? 'Documents complete' : `${completed.label} saved`;
        this.toast.showSuccess(title, `Next: ${this.steps[step].label}`);
      }
      this.errorMessage = '';
      this.activeStep = step;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /** Saves the form as a draft only when it has unsaved changes (used before submitting). */
  private saveIfDirty(): Observable<boolean> {
    return this.profileForm.dirty ? this.save() : of(true);
  }

  /** Saves the form as a draft, plus the step being moved to. Emits whether it succeeded. */
  private save(step?: number): Observable<boolean> {
    const payload = toProfilePayload(this.profileForm);
    if (step !== undefined) payload.current_step = step;
    this.saving = true;
    return new Observable<boolean>(subscriber => {
      this.portalService.updateProfile(payload).subscribe({
        next: res => {
          this.saving = false;
          if (!res.success || !res.data) {
            this.errorMessage = res.message || 'Failed to save your details.';
            subscriber.next(false);
          } else {
            this.profile = res.data;
            this.profileForm.markAsPristine();
            subscriber.next(true);
          }
          subscriber.complete();
        },
        error: err => {
          this.saving = false;
          this.errorMessage = err.error?.message || 'Failed to save your details.';
          subscriber.next(false);
          subscriber.complete();
        }
      });
    });
  }
}
