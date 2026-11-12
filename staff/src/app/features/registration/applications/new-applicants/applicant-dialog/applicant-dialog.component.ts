import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { forkJoin, of, Observable, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  KCSE_GRADES,
  KCSE_SUBJECT_GRADES,
  GENDER_OPTIONS,
  RELATIONSHIP_OPTIONS,
  KENYA_COUNTIES
} from '../../../../../core/models/academics/student.model';
import { ToastService } from '../../../../../core/services/toast/toast.service';
import { ApplicantService } from '../../../../../core/services/registration/applicant.service';
import { applyBackgroundRules, DENOMINATION_OPTIONS, joinDenomination, splitDenomination } from '../../../../../core/models/registration/applicant-background';
import { DIGITS_ONLY, DigitsOnlyDirective } from '../../../../../shared/directives/digits-only.directive';
import { environment } from '../../../../../../environments/environment';
import { DocumentViewerDialogComponent } from '../../../../admin/student/document-viewer-dialog/document-viewer-dialog.component';
import {
  Applicant,
  ApplicantDocumentType,
  CreateApplicantRequest,
  UpdateApplicantRequest
} from '../../../../../core/models/registration/applicant.model';

export interface ApplicantDialogData {
  mode?: 'create' | 'edit' | 'view';
  applicant?: Applicant;
}

interface UploadedFile {
  file: File | null;
  fileName: string;
  error: string;
  previewUrl: string | null;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

@Component({
  selector: 'app-applicant-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, DigitsOnlyDirective],
  templateUrl: './applicant-dialog.component.html',
  styleUrls: ['./applicant-dialog.component.scss']
})
export class ApplicantDialogComponent implements OnInit, OnDestroy {
  applicantForm!: FormGroup;
  activeTab = 0;
  submitting = false;
  errorMessage = '';
  mode: 'create' | 'edit' | 'view' = 'create';
  applicantId: number | null = null;

  // Filenames already on file for this applicant, read from data.applicant (edit/view only)
  existingProfilePhoto = '';
  existingProfilePhotoUrl: SafeUrl | null = null;
  existingDocuments: { [type: string]: { fileName: string; mimeType: string } } = {};

  // Dropdown options
  kcseGrades = KCSE_GRADES;
  subjectGrades = KCSE_SUBJECT_GRADES;
  genderOptions = GENDER_OPTIONS;
  relationshipOptions = RELATIONSHIP_OPTIONS;
  counties = KENYA_COUNTIES;

  currentYear = new Date().getFullYear();
  kcseYears: number[] = [];
  graduationYears: number[] = [];

  readonly denominations = DENOMINATION_OPTIONS;
  private backgroundRules?: Subscription;

  readonly tabs = [
    { label: 'Account',                icon: 'fa-user-lock' },
    { label: 'Personal',               icon: 'fa-id-card' },
    { label: 'Location & Background',  icon: 'fa-map-marker-alt' },
    { label: 'Guardian & Sponsor',     icon: 'fa-users' },
    { label: 'Education',              icon: 'fa-graduation-cap' },
    { label: 'Documents',              icon: 'fa-file-alt' }
  ];

  profilePhoto: UploadedFile     = { file: null, fileName: '', error: '', previewUrl: null };
  idCardFile: UploadedFile       = { file: null, fileName: '', error: '', previewUrl: null };
  kcseCertFile: UploadedFile     = { file: null, fileName: '', error: '', previewUrl: null };
  leavingCertFile: UploadedFile  = { file: null, fileName: '', error: '', previewUrl: null };
  postSecondaryFile: UploadedFile = { file: null, fileName: '', error: '', previewUrl: null };

  constructor(
    private fb: FormBuilder,
    private toast: ToastService,
    private applicantService: ApplicantService,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private matDialog: MatDialog,
    public dialogRef: MatDialogRef<ApplicantDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApplicantDialogData
  ) {
    this.mode = data.mode || 'create';
    for (let i = 0; i < 10; i++) {
      this.kcseYears.push(this.currentYear - i);
      this.graduationYears.push(this.currentYear - i);
    }
  }

  ngOnInit(): void {
    this.applicantForm = this.fb.group({
      // Account
      email:                ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
      password:             ['', [Validators.required, Validators.minLength(6)]],
      // Personal
      first_name:           ['', [Validators.required, Validators.maxLength(100)]],
      middle_name:          ['', [Validators.maxLength(100)]],
      last_name:            ['', [Validators.required, Validators.maxLength(100)]],
      phone_number:         ['', [Validators.required, DIGITS_ONLY, Validators.maxLength(20)]],
      id_number:            ['', [Validators.required, Validators.maxLength(20)]],
      date_of_birth:        ['', [Validators.required]],
      gender:               ['', [Validators.required]],
      // Location & Background
      county:               ['', [Validators.required]],
      sub_county:           ['', [Validators.required, Validators.maxLength(100)]],
      denomination:         ['', [Validators.required]],
      denomination_other:   [''],
      has_disability:       [false],
      disability_details:   [''],
      // Guardian & Sponsor
      guardian_name:        ['', [Validators.required, Validators.maxLength(200)]],
      relationship:         ['', [Validators.required]],
      guardian_contact:     ['', [Validators.required, DIGITS_ONLY, Validators.maxLength(20)]],
      sponsor_name:         ['', [Validators.maxLength(200)]],
      sponsor_contact:      ['', [DIGITS_ONLY, Validators.maxLength(20)]],
      // Education
      secondary_school:     ['', [Validators.required, Validators.maxLength(200)]],
      index_number:         ['', [Validators.required, Validators.maxLength(20)]],
      kcse_year:             [this.currentYear, [Validators.required]],
      aggregate:            ['', [Validators.required, Validators.maxLength(10)]],
      english_grade:        ['', [Validators.required]],
      kiswahili_grade:      ['', [Validators.required]],
      biology_grade:        ['', [Validators.required]],
      maths_grade:          ['', [Validators.required]],
      chemistry_grade:      ['', [Validators.required]],
      physics_grade:        ['', [Validators.required]],
      college_grade:        ['', [Validators.maxLength(50)]],
      graduation_year:      [null],
      // Documents
      mark_complete:        [false]
    });
    this.backgroundRules = applyBackgroundRules(this.applicantForm);

    if (this.mode !== 'create') {
      this.applicantForm.get('password')?.clearValidators();
      this.applicantForm.get('password')?.updateValueAndValidity();
    }

    if (this.mode !== 'create' && this.data.applicant) {
      this.populateForm(this.data.applicant);
    }

    if (this.mode === 'view') {
      this.applicantForm.disable();
    }
  }

  private populateForm(a: Applicant): void {
    this.applicantId = a.id;
    this.applicantForm.patchValue({
      email:            a.email,
      first_name:       a.first_name,
      middle_name:      a.middle_name ?? '',
      last_name:        a.last_name,
      phone_number:     a.phone_number,
      id_number:        a.id_number,
      date_of_birth:    a.date_of_birth ? String(a.date_of_birth).substring(0, 10) : '',
      gender:           a.gender,
      county:           a.county,
      sub_county:       a.sub_county,
      ...splitDenomination(a.denomination),
      has_disability:   a.has_disability,
      disability_details: a.disability_details ?? '',
      guardian_name:    a.guardian_name,
      relationship:     a.relationship,
      guardian_contact: a.guardian_contact,
      sponsor_name:     a.sponsor_name ?? '',
      sponsor_contact:  a.sponsor_contact ?? '',
      secondary_school: a.secondary_school,
      index_number:     a.index_number,
      kcse_year:        a.kcse_year,
      aggregate:        a.aggregate,
      english_grade:    a.english_grade,
      kiswahili_grade:  a.kiswahili_grade,
      biology_grade:    a.biology_grade,
      maths_grade:      a.maths_grade,
      chemistry_grade:  a.chemistry_grade,
      physics_grade:    a.physics_grade,
      college_grade:    a.college_grade ?? '',
      graduation_year:  a.graduation_year ?? null,
      mark_complete:    a.mark_complete
    });

    this.existingProfilePhoto = a.profile_photo ? this.fileNameFromPath(a.profile_photo) : '';
    this.existingDocuments = {};
    (a.documents || []).forEach(doc => {
      this.existingDocuments[doc.document_type] = {
        fileName: doc.file_name || this.fileNameFromPath(doc.file_path),
        mimeType: doc.mime_type
      };
    });

    if (a.profile_photo && a.id) {
      // The stored path isn't a browser-loadable URL and the file endpoint
      // requires auth, so fetch it as a blob (HttpClient carries the token)
      // and bind an object URL instead. Cache-bust since re-uploads reuse
      // this same URL for a different underlying file.
      const url = `${environment.apiUrl}/applicants/documents/${a.id}/files/profile?t=${Date.now()}`;
      this.http.get(url, { responseType: 'blob' }).subscribe({
        next: blob => {
          this.existingProfilePhotoUrl = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
        },
        error: () => {}
      });
    }
  }

  private fileNameFromPath(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  // ── Document preview ──────────────────────────────────────

  viewDocument(fileType: ApplicantDocumentType, fileName: string, mimeType: string): void {
    if (!this.applicantId) return;

    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const url = `${environment.apiUrl}/applicants/documents/${this.applicantId}/files/${fileType}?t=${Date.now()}`;

    this.matDialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '85vh',
      data: {
        fileUrl: url,
        fileType: isPdf ? 'pdf' : 'image',
        title: fileName,
        fileName
      }
    });
  }

  // ── Mode helpers ───────────────────────────────────────────

  isCreate(): boolean { return this.mode === 'create'; }
  isEdit(): boolean { return this.mode === 'edit'; }
  isView(): boolean { return this.mode === 'view'; }

  get title(): string {
    const labels = { create: 'Add New Applicant', edit: 'Edit Applicant', view: 'Applicant Details' };
    return labels[this.mode];
  }

  ngOnDestroy(): void {
    this.backgroundRules?.unsubscribe();
    [this.profilePhoto, this.idCardFile, this.kcseCertFile, this.leavingCertFile, this.postSecondaryFile]
      .forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
  }

  // ── Tab helpers ────────────────────────────────────────────

  selectTab(i: number): void { this.activeTab = i; }

  tabHasError(i: number): boolean {
    if (this.applicantForm.untouched) return false;
    const groups: string[][] = [
      ['email', 'password'],
      ['first_name', 'last_name', 'phone_number', 'id_number', 'date_of_birth', 'gender'],
      ['county', 'sub_county', 'denomination', 'denomination_other', 'disability_details'],
      ['guardian_name', 'relationship', 'guardian_contact'],
      ['secondary_school', 'index_number', 'kcse_year', 'aggregate',
       'english_grade', 'kiswahili_grade', 'biology_grade', 'maths_grade', 'chemistry_grade', 'physics_grade'],
      []
    ];
    return groups[i]?.some(ctrl => this.applicantForm.get(ctrl)?.invalid) ?? false;
  }

  fieldError(name: string): string {
    const ctrl = this.applicantForm.get(name);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return '';
    if (ctrl.errors['required'])   return 'This field is required';
    if (ctrl.errors['email'])      return 'Enter a valid email address';
    if (ctrl.errors['minlength'])  return `Min ${ctrl.errors['minlength'].requiredLength} characters`;
    if (ctrl.errors['maxlength'])  return `Max ${ctrl.errors['maxlength'].requiredLength} characters`;
    if (ctrl.errors['pattern'])    return 'Numbers only';
    return 'Invalid value';
  }

  // ── File handling ─────────────────────────────────────────

  onFileSelected(event: Event, target: UploadedFile, allowedTypes: string[]): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    target.error = '';

    if (!file) return;

    if (!allowedTypes.includes(file.type)) {
      target.error = allowedTypes.includes('application/pdf')
        ? 'Only JPEG, PNG or PDF files are allowed.'
        : 'Only JPEG or PNG files are allowed.';
      target.file = null;
      input.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      target.error = 'File exceeds the maximum size of 2MB.';
      target.file = null;
      input.value = '';
      return;
    }

    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    target.file = file;
    target.fileName = file.name;
    target.previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
  }

  removeFile(target: UploadedFile, input: HTMLInputElement): void {
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    target.file = null;
    target.fileName = '';
    target.error = '';
    target.previewUrl = null;
    input.value = '';
  }

  // ── Submit ─────────────────────────────────────────────────

  save(): void {
    if (this.isView()) { this.dialogRef.close(null); return; }

    this.applicantForm.markAllAsTouched();
    if (this.applicantForm.invalid) {
      for (let i = 0; i < this.tabs.length; i++) {
        if (this.tabHasError(i)) { this.activeTab = i; break; }
      }
      this.errorMessage = 'Please fix the highlighted fields before submitting.';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const { denomination_other, ...formValues } = this.applicantForm.getRawValue();
    const raw = { ...formValues, denomination: joinDenomination(formValues.denomination, denomination_other) };
    const dateOfBirth = this.formatDate(raw.date_of_birth);
    const graduationYear = raw.graduation_year || null;

    if (this.isEdit() && this.applicantId) {
      const { password, ...rest } = raw; // password changes aren't supported via this form
      const payload: UpdateApplicantRequest = {
        ...rest,
        date_of_birth: dateOfBirth,
        graduation_year: graduationYear
      };

      this.applicantService.updateApplicant(this.applicantId, payload).subscribe({
        next: res => {
          if (!res.success || !res.data) {
            this.submitting = false;
            this.errorMessage = res.message || 'Failed to update applicant.';
            return;
          }

          this.uploadDocuments(this.applicantId!).subscribe(() => {
            this.submitting = false;
            this.toast.showSuccess('Success', 'Applicant updated successfully.');
            this.dialogRef.close({ success: true, data: res.data });
          });
        },
        error: err => {
          this.submitting = false;
          this.errorMessage = err.error?.message || 'Failed to update applicant.';
        }
      });
      return;
    }

    const payload: CreateApplicantRequest = {
      ...raw,
      date_of_birth: dateOfBirth,
      graduation_year: graduationYear
    };

    this.applicantService.createApplicant(payload).subscribe({
      next: res => {
        if (!res.success || !res.data) {
          this.submitting = false;
          this.errorMessage = res.message || 'Failed to register applicant.';
          return;
        }

        const applicantId = res.data.id;
        this.uploadDocuments(applicantId).subscribe(() => {
          this.submitting = false;
          this.toast.showSuccess('Success', 'Applicant registered successfully.');
          this.dialogRef.close({ success: true, data: res.data });
        });
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to register applicant.';
      }
    });
  }

  private uploadDocuments(applicantId: number): Observable<unknown> {
    const uploads: { file: File; type: ApplicantDocumentType }[] = [];
    if (this.profilePhoto.file) uploads.push({ file: this.profilePhoto.file, type: 'profile' });
    if (this.idCardFile.file) uploads.push({ file: this.idCardFile.file, type: 'id_card' });
    if (this.kcseCertFile.file) uploads.push({ file: this.kcseCertFile.file, type: 'kcse_certificate' });
    if (this.leavingCertFile.file) uploads.push({ file: this.leavingCertFile.file, type: 'leaving_certificate' });
    if (this.postSecondaryFile.file) uploads.push({ file: this.postSecondaryFile.file, type: 'post_secondary_certificate' });

    if (uploads.length === 0) return of(null);

    return forkJoin(
      uploads.map(u =>
        this.applicantService.uploadDocument(applicantId, u.file, u.type).pipe(
          catchError(() => of(null)) // Applicant record is already saved; don't block on a single failed upload.
        )
      )
    );
  }

  private formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }

  cancel(): void {
    if (this.submitting) return;
    this.dialogRef.close(null);
  }
}
