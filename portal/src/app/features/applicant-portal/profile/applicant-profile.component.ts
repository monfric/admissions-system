import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { Applicant, ApplicantDocumentType } from '../../../core/models/registration/applicant.model';
import { ApplicantPortalService } from '../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { DocumentViewerDialogComponent } from '../../../shared/components/document-viewer-dialog/document-viewer-dialog.component';
import { documentFileError } from '../profile-setup/profile-form';

interface DocumentTile {
  type: ApplicantDocumentType;
  label: string;
  icon: string;
  required: boolean;
  accept: string;
  uploading: boolean;
  error: string;
}

/**
 * My Profile, after submission: a read-only overview of the applicant's
 * details, with documents still replaceable (each file uploads as soon as
 * it's chosen).
 */
@Component({
  selector: 'app-applicant-profile',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './applicant-profile.component.html',
  styleUrls: ['../shared/portal-ui.scss', './applicant-profile.component.scss']
})
export class ApplicantProfileComponent implements OnInit, OnDestroy {
  profile: Applicant | null = null;
  loading = true;
  errorMessage = '';

  photoUrl: SafeUrl | null = null;
  private photoObjectUrl: string | null = null;

  readonly sections = [
    { id: 'personal',  label: 'Personal Details',      icon: 'fa-user' },
    { id: 'location',  label: 'Location & Background', icon: 'fa-map-marker-alt' },
    { id: 'guardian',  label: 'Guardian & Sponsor',    icon: 'fa-users' },
    { id: 'education', label: 'Education',             icon: 'fa-graduation-cap' },
    { id: 'documents', label: 'Documents',             icon: 'fa-paperclip' }
  ];

  documents: DocumentTile[] = [
    { type: 'profile',                    label: 'Profile Photo',                   icon: 'fa-portrait',     required: true,  accept: 'image/jpeg,image/png',                 uploading: false, error: '' },
    { type: 'id_card',                    label: 'ID Card',                         icon: 'fa-id-card',      required: true,  accept: 'image/jpeg,image/png,application/pdf', uploading: false, error: '' },
    { type: 'kcse_certificate',           label: 'KCSE Results Certificate',        icon: 'fa-award',        required: true,  accept: 'image/jpeg,image/png,application/pdf', uploading: false, error: '' },
    { type: 'leaving_certificate',        label: 'High School Leaving Certificate', icon: 'fa-file-alt',     required: false, accept: 'image/jpeg,image/png,application/pdf', uploading: false, error: '' },
    { type: 'post_secondary_certificate', label: 'Post Secondary Certificate',      icon: 'fa-file-contract', required: false, accept: 'image/jpeg,image/png,application/pdf', uploading: false, error: '' }
  ];

  constructor(
    private portalService: ApplicantPortalService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    private matDialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  ngOnDestroy(): void {
    if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl);
  }

  loadProfile(): void {
    this.portalService.getProfile().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Failed to load your profile.';
          return;
        }
        this.profile = res.data;
        if (res.data.profile_photo) this.loadPhoto();
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to load your profile.';
      }
    });
  }

  get initials(): string {
    const p = this.profile;
    return p ? `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase() : '';
  }

  get grades(): { subject: string; grade: string }[] {
    const p = this.profile;
    if (!p) return [];
    return [
      { subject: 'English',     grade: p.english_grade },
      { subject: 'Kiswahili',   grade: p.kiswahili_grade },
      { subject: 'Biology',     grade: p.biology_grade },
      { subject: 'Mathematics', grade: p.maths_grade },
      { subject: 'Chemistry',   grade: p.chemistry_grade },
      { subject: 'Physics',     grade: p.physics_grade }
    ];
  }

  scrollTo(id: string): void {
    document.getElementById('profile-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  existingFile(type: ApplicantDocumentType): { fileName: string; mimeType: string } | null {
    if (!this.profile) return null;
    if (type === 'profile') {
      return this.profile.profile_photo ? { fileName: this.fileNameFromPath(this.profile.profile_photo), mimeType: '' } : null;
    }
    const doc = (this.profile.documents || []).find(d => d.document_type === type);
    return doc ? { fileName: doc.file_name || this.fileNameFromPath(doc.file_path), mimeType: doc.mime_type } : null;
  }

  onFileSelected(event: Event, tile: DocumentTile): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    tile.error = '';
    if (!file) return;

    tile.error = documentFileError(tile.type, file);
    if (tile.error) return;

    tile.uploading = true;
    this.portalService.uploadDocument(tile.type, file).subscribe({
      next: () => {
        tile.uploading = false;
        this.toast.showSuccess('Uploaded', `${tile.label} uploaded successfully.`);
        this.loadProfile();
      },
      error: err => {
        tile.uploading = false;
        tile.error = err.error?.message || `Failed to upload ${tile.label.toLowerCase()}.`;
      }
    });
  }

  viewDocument(tile: DocumentTile): void {
    const existing = this.existingFile(tile.type);
    if (!existing) return;
    const isPdf = existing.mimeType === 'application/pdf' || existing.fileName.toLowerCase().endsWith('.pdf');
    this.matDialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '85vh',
      data: {
        fileUrl: this.portalService.documentUrl(tile.type),
        fileType: isPdf ? 'pdf' : 'image',
        title: tile.label,
        fileName: existing.fileName
      }
    });
  }

  private loadPhoto(): void {
    this.portalService.getDocumentBlob('profile').subscribe({
      next: blob => {
        if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl);
        this.photoObjectUrl = URL.createObjectURL(blob);
        this.photoUrl = this.sanitizer.bypassSecurityTrustUrl(this.photoObjectUrl);
      },
      error: () => {}
    });
  }

  private fileNameFromPath(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }
}
