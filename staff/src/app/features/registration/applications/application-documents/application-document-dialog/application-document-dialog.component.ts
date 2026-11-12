import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { ToastService } from '../../../../../core/services/toast/toast.service';
import { IntakeService } from '../../../../../core/services/registration/intake.service';
import { IntakeProgrammeService } from '../../../../../core/services/registration/intake-programme.service';
import { ApplicationDocumentService } from '../../../../../core/services/registration/application-document.service';
import { Intake } from '../../../../../core/models/registration/intake.model';
import { IntakeProgramme } from '../../../../../core/models/registration/intake-programme.model';
import {
  ApplicationDocument,
  ApplicationDocumentRequest,
  ApplicationDocumentResponse
} from '../../../../../core/models/registration/application-document.model';
import { Observable } from 'rxjs';

export interface ApplicationDocumentDialogData {
  mode?: 'create' | 'edit';
  document?: ApplicationDocument;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, matches the backend limit

@Component({
  selector: 'app-application-document-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './application-document-dialog.component.html',
  styleUrls: ['./application-document-dialog.component.scss']
})
export class ApplicationDocumentDialogComponent implements OnInit {
  documentForm!: FormGroup;
  submitting = false;
  errorMessage = '';
  mode: 'create' | 'edit' = 'create';

  intakes: Intake[] = [];
  programmes: IntakeProgramme[] = [];
  loadingProgrammes = false;

  selectedFile: File | null = null;
  fileError = '';

  constructor(
    private fb: FormBuilder,
    private toast: ToastService,
    private intakeService: IntakeService,
    private intakeProgrammeService: IntakeProgrammeService,
    private applicationDocumentService: ApplicationDocumentService,
    public dialogRef: MatDialogRef<ApplicationDocumentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApplicationDocumentDialogData
  ) {
    this.mode = data.mode || 'create';
  }

  ngOnInit(): void {
    this.documentForm = this.fb.group({
      document_name: ['', [Validators.required, Validators.maxLength(255)]],
      intake_id: [null, [Validators.required]],
      programme_id: [null, [Validators.required]],
      type: ['', [Validators.required]],
      is_active: [true]
    });

    const doc = this.data.document;
    if (this.isEdit() && doc) {
      this.documentForm.patchValue({
        document_name: doc.document_name,
        intake_id: doc.intake_id,
        programme_id: doc.programme_id,
        type: doc.type,
        is_active: doc.status === 'active'
      });
      this.loadProgrammes(doc.intake_id);
    }

    this.loadIntakes();
  }

  isEdit(): boolean { return this.mode === 'edit'; }

  get title(): string {
    return this.isEdit() ? 'Edit Document' : 'Add New Document';
  }

  private loadIntakes(): void {
    this.intakeService.getIntakes(1, 1000).subscribe({
      next: res => {
        if (res.success) this.intakes = res.data.data;
      },
      error: () => this.errorMessage = 'Failed to load intakes.'
    });
  }

  /** Lists the programmes offered in the intake — active ones, plus the
   *  document's current programme when editing so it stays selectable. */
  private loadProgrammes(intakeId: number): void {
    this.programmes = [];
    this.loadingProgrammes = true;
    this.intakeProgrammeService.getByIntake(intakeId).subscribe({
      next: res => {
        this.loadingProgrammes = false;
        if (!res.success) return;
        const currentId = this.isEdit() && this.data.document?.intake_id === intakeId
          ? this.data.document.programme_id : null;
        this.programmes = res.data.filter(p => p.is_active || p.programme_id === currentId);
      },
      error: () => {
        this.loadingProgrammes = false;
        this.errorMessage = 'Failed to load programmes for this intake.';
      }
    });
  }

  onIntakeChange(): void {
    this.documentForm.patchValue({ programme_id: null });
    const intakeId = this.documentForm.get('intake_id')?.value;
    if (intakeId) {
      this.loadProgrammes(Number(intakeId));
    } else {
      this.programmes = [];
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError = '';
    this.selectedFile = null;
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.fileError = 'Only PDF files are allowed.';
      input.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.fileError = 'File size exceeds the 10MB limit.';
      input.value = '';
      return;
    }
    this.selectedFile = file;
  }

  toggleActive(): void {
    const ctrl = this.documentForm.get('is_active');
    ctrl?.setValue(!ctrl.value);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  fieldError(name: string): string {
    const ctrl = this.documentForm.get(name);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return '';
    if (ctrl.errors['required']) return 'This field is required';
    if (ctrl.errors['maxlength']) return 'Must be 255 characters or fewer';
    return 'Invalid value';
  }

  save(): void {
    this.documentForm.markAllAsTouched();
    if (!this.isEdit() && !this.selectedFile && !this.fileError) {
      this.fileError = 'Please choose a PDF file to upload.';
    }
    if (this.documentForm.invalid || this.fileError) {
      this.errorMessage = 'Please fix the highlighted fields before submitting.';
      return;
    }

    const raw = this.documentForm.getRawValue();
    const payload: ApplicationDocumentRequest = {
      document_name: raw.document_name.trim(),
      intake_id: Number(raw.intake_id),
      programme_id: Number(raw.programme_id),
      type: raw.type,
      status: raw.is_active ? 'active' : 'inactive'
    };

    const request$: Observable<ApplicationDocumentResponse> = this.isEdit() && this.data.document
      ? this.applicationDocumentService.update(this.data.document.id, payload, this.selectedFile)
      : this.applicationDocumentService.create(payload, this.selectedFile!);

    const action = this.isEdit() ? 'update' : 'upload';
    this.submitting = true;
    this.errorMessage = '';

    request$.subscribe({
      next: res => {
        this.submitting = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || `Failed to ${action} document.`;
          return;
        }
        this.toast.showSuccess('Success', this.isEdit() ? 'Document updated successfully.' : 'Document uploaded successfully.');
        this.dialogRef.close({ success: true, data: res.data });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || `Failed to ${action} document.`;
      }
    });
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
