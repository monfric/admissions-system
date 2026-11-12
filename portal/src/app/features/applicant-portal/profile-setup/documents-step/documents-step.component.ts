import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

import { Applicant, ApplicantDocumentType } from '../../../../core/models/registration/applicant.model';
import { ApplicantPortalService } from '../../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { documentFileError } from '../profile-form';
import { DocumentViewerDialogComponent } from '../../../../shared/components/document-viewer-dialog/document-viewer-dialog.component';

interface DocumentSlot {
  type: ApplicantDocumentType;
  label: string;
  required: boolean;
  uploading: boolean;
  error: string;
}

/**
 * Profile photo + supporting documents. Unlike the staff dialog, each file is
 * uploaded as soon as it's chosen, so this step also works on the My Profile
 * page where documents are the only thing an applicant can still change.
 */
@Component({
  selector: 'app-documents-step',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './documents-step.component.html',
  styleUrls: ['../profile-form.scss']
})
export class DocumentsStepComponent implements OnChanges, OnDestroy {
  @Input() profile: Applicant | null = null;
  /** Emitted after a successful upload so the parent can reload the profile. */
  @Output() uploaded = new EventEmitter<void>();

  photo: DocumentSlot = { type: 'profile', label: 'Profile Picture', required: true, uploading: false, error: '' };
  documents: DocumentSlot[] = [
    { type: 'id_card',                    label: 'ID Card',                         required: true,  uploading: false, error: '' },
    { type: 'kcse_certificate',           label: 'KCSE Results Certificate',        required: true,  uploading: false, error: '' },
    { type: 'leaving_certificate',        label: 'High School Leaving Certificate', required: false, uploading: false, error: '' },
    { type: 'post_secondary_certificate', label: 'Post Secondary Certificate',      required: false, uploading: false, error: '' }
  ];

  photoUrl: SafeUrl | null = null;
  private photoObjectUrl: string | null = null;

  constructor(
    private portalService: ApplicantPortalService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    private matDialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profile'] && this.profile?.profile_photo) {
      this.loadPhoto();
    }
  }

  ngOnDestroy(): void {
    if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl);
  }

  existingFile(type: ApplicantDocumentType): { fileName: string; mimeType: string } | null {
    if (!this.profile) return null;
    if (type === 'profile') {
      return this.profile.profile_photo ? { fileName: this.fileNameFromPath(this.profile.profile_photo), mimeType: '' } : null;
    }
    const doc = (this.profile.documents || []).find(d => d.document_type === type);
    return doc ? { fileName: doc.file_name || this.fileNameFromPath(doc.file_path), mimeType: doc.mime_type } : null;
  }

  onFileSelected(event: Event, slot: DocumentSlot): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    slot.error = '';
    if (!file) return;

    slot.error = documentFileError(slot.type, file);
    if (slot.error) return;

    slot.uploading = true;
    this.portalService.uploadDocument(slot.type, file).subscribe({
      next: () => {
        slot.uploading = false;
        this.toast.showSuccess('Uploaded', `${slot.label} uploaded successfully.`);
        this.uploaded.emit();
      },
      error: err => {
        slot.uploading = false;
        slot.error = err.error?.message || `Failed to upload ${slot.label.toLowerCase()}.`;
      }
    });
  }

  viewDocument(slot: DocumentSlot): void {
    const existing = this.existingFile(slot.type);
    if (!existing) return;
    const isPdf = existing.mimeType === 'application/pdf' || existing.fileName.toLowerCase().endsWith('.pdf');
    this.matDialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '85vh',
      data: {
        fileUrl: this.portalService.documentUrl(slot.type),
        fileType: isPdf ? 'pdf' : 'image',
        title: slot.label,
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
