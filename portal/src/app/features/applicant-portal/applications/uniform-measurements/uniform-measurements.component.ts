import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { PortalUniformForm } from '../../../../core/models/applicant-portal/applicant-application.model';
import { UniformSet } from '../../../../core/models/registration/uniform-measurement.model';
import { ApplicantPortalService } from '../../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';
import { DocumentViewerDialogComponent } from '../../../../shared/components/document-viewer-dialog/document-viewer-dialog.component';

/** Accepted range for a measurement, in inches (same as the server). */
const MIN_INCHES = 1;
const MAX_INCHES = 99;

/**
 * The uniform measurement form an admitted applicant fills in. Submitting it
 * unlocks the application's documents; it's then read-only until the
 * admissions office unlocks it for a correction.
 */
@Component({
  selector: 'app-uniform-measurements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule],
  templateUrl: './uniform-measurements.component.html',
  styleUrls: ['../../shared/portal-ui.scss', './uniform-measurements.component.scss']
})
export class UniformMeasurementsComponent implements OnInit {
  applicationId = 0;
  form: PortalUniformForm | null = null;
  loading = true;
  loadError = '';

  uniformSet = '';
  values: Record<string, number | null> = {};
  tailorConfirmed = false;

  /** Set after a submit attempt, so empty fields only turn red then. */
  attempted = false;
  submitting = false;
  errorMessage = '';
  /** Documents that were locked when the page opened (for the success toast). */
  private lockedDocuments = 0;

  readonly minInches = MIN_INCHES;
  readonly maxInches = MAX_INCHES;

  constructor(
    private route: ActivatedRoute,
    private portalService: ApplicantPortalService,
    private toast: ToastService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.applicationId = Number(this.route.snapshot.paramMap.get('id'));
    this.portalService.getUniformForm(this.applicationId).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.loadError = res.message || 'Uniform measurements are not available for this application.';
          return;
        }
        this.setForm(res.data);
      },
      error: err => {
        this.loading = false;
        this.loadError = err.error?.message || 'Uniform measurements are not available for this application.';
      }
    });
    this.portalService.getApplication(this.applicationId).subscribe({
      next: res => this.lockedDocuments = res.data?.locked_documents ?? 0,
      error: () => {}
    });
  }

  private setForm(form: PortalUniformForm): void {
    this.form = form;
    const m = form.measurement;
    this.uniformSet = m?.uniform_set || (form.allowed_sets.length === 1 ? form.allowed_sets[0] : '');
    this.values = {};
    for (const set of form.sets) {
      for (const g of set.garments) {
        for (const f of g.fields) this.values[f.key] = m?.values[f.key] ?? null;
      }
    }
    // A reopened form must be confirmed again before resubmitting.
    this.tailorConfirmed = !!m && !form.editable;
  }

  /** The form being filled (or shown), or null until a set is picked. */
  get activeSet(): UniformSet | null {
    return this.form?.sets.find(s => s.key === this.uniformSet) ?? null;
  }

  get allowedSets(): UniformSet[] {
    return this.form?.sets.filter(s => this.form!.allowed_sets.includes(s.key)) ?? [];
  }

  get canChooseSet(): boolean {
    return !!this.form?.editable && this.allowedSets.length > 1;
  }

  fieldError(key: string): string {
    const v = this.values[key];
    if (v === null || v === undefined || (v as unknown) === '') return this.attempted ? 'Required' : '';
    if (isNaN(Number(v)) || v < MIN_INCHES || v > MAX_INCHES) return `${MIN_INCHES}–${MAX_INCHES} in`;
    return '';
  }

  /** Measurements filled in for the chosen set, e.g. "9 of 14". */
  get progress(): { done: number; total: number } {
    const fields = this.activeSet?.garments.flatMap(g => g.fields) ?? [];
    const done = fields.filter(f => this.values[f.key] !== null && this.values[f.key] !== undefined && !this.fieldError(f.key)).length;
    return { done, total: fields.length };
  }

  submit(): void {
    this.attempted = true;
    this.errorMessage = '';
    const set = this.activeSet;
    if (!set) {
      this.errorMessage = 'Please choose your uniform (Gents or Ladies).';
      return;
    }
    const fields = set.garments.flatMap(g => g.fields.map(f => ({ ...f, garment: g.name })));
    const invalid = fields.find(f => this.fieldError(f.key));
    if (invalid) {
      this.errorMessage = `Please fill in every measurement correctly (${invalid.garment} – ${invalid.label}).`;
      return;
    }
    if (!this.tailorConfirmed) {
      this.errorMessage = 'Please confirm that your measurements were taken by a qualified tailor.';
      return;
    }

    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Submit Uniform Measurements',
        message: 'Please check your measurements. Once submitted, they can only be changed by the admissions office.',
        confirmText: 'Submit',
        cancelText: 'Go Back',
        type: 'primary'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      const measurements: Record<string, number> = {};
      fields.forEach(f => measurements[f.key] = Number(this.values[f.key]));

      this.submitting = true;
      this.portalService.submitUniform(this.applicationId, {
        uniform_set: set.key,
        measurements,
        tailor_confirmed: true
      }).subscribe({
        next: res => {
          this.submitting = false;
          if (!res.success || !res.data) {
            this.errorMessage = res.message || 'Failed to submit your measurements.';
            return;
          }
          this.attempted = false;
          this.setForm(res.data);
          this.toast.showSuccess(
            'Measurements submitted',
            this.lockedDocuments > 0 ? 'Your documents are now available.' : 'Thank you. Your measurements have been received.'
          );
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: err => {
          this.submitting = false;
          this.errorMessage = err.error?.message || 'Failed to submit your measurements.';
        }
      });
    });
  }

  viewPdf(): void {
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '90vh',
      data: {
        fileUrl: this.portalService.uniformPdfUrl(this.applicationId),
        fileType: 'pdf',
        title: 'Uniform Measurements',
        fileName: `Uniform-Measurements-${(this.form?.admission_number || '').replace(/[\/\s]+/g, '-')}.pdf`
      }
    });
  }
}
