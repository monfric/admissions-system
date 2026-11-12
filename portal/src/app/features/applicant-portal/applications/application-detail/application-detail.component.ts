import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import {
  PortalApplication,
  PortalDocument,
  PortalLetter,
  applicationStatus,
  countdownDisplay,
  decisionDisplay,
  programmeStatus
} from '../../../../core/models/applicant-portal/applicant-application.model';
import { choiceLabel } from '../../../../core/models/registration/application-batch.model';
import { ApplicantPortalService } from '../../../../core/services/applicant-portal/applicant-portal.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { DocumentViewerDialogComponent } from '../../../../shared/components/document-viewer-dialog/document-viewer-dialog.component';

/** One of the applicant's applications: its status, fee and programme choices. */
@Component({
  selector: 'app-application-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule],
  templateUrl: './application-detail.component.html',
  styleUrls: ['../../shared/portal-ui.scss', './application-detail.component.scss']
})
export class ApplicationDetailComponent implements OnInit {
  application: PortalApplication | null = null;
  loading = true;
  errorMessage = '';
  copied = false;
  /** Key of the file currently downloading, e.g. "letter:provisional" or "doc:12". */
  downloading: string | null = null;

  readonly decisionDisplay = decisionDisplay;
  readonly applicationStatus = applicationStatus;
  readonly programmeStatus = programmeStatus;
  readonly choiceLabel = choiceLabel;
  readonly countdownDisplay = countdownDisplay;

  constructor(
    private route: ActivatedRoute,
    private portalService: ApplicantPortalService,
    private toast: ToastService,
    private matDialog: MatDialog
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.portalService.getApplication(id).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Application not found.';
          return;
        }
        this.application = res.data;
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Application not found.';
      }
    });
  }

  /** The programme the applicant was selected for, once notified or approved. */
  get selectedProgramme(): string | null {
    const p = this.application?.programmes.find(x => ['notified', 'recalled', 'approved'].includes(x.application_status));
    return p ? p.programme_name : null;
  }

  copyAdmissionNumber(number: string): void {
    navigator.clipboard?.writeText(number).then(
      () => {
        this.copied = true;
        setTimeout(() => this.copied = false, 2000);
      },
      () => this.toast.showError('Copy failed', 'Please copy the admission number manually.')
    );
  }

  viewLetter(app: PortalApplication, letter: PortalLetter): void {
    this.matDialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '90vh',
      data: {
        fileUrl: this.portalService.letterUrl(app.id, letter.type),
        fileType: 'pdf',
        title: letter.title,
        fileName: this.letterFileName(app, letter)
      }
    });
  }

  downloadLetter(app: PortalApplication, letter: PortalLetter): void {
    this.download('letter:' + letter.type, this.portalService.letterUrl(app.id, letter.type), this.letterFileName(app, letter));
  }

  canPreview(doc: PortalDocument): boolean {
    return doc.mime_type === 'application/pdf' || doc.mime_type.startsWith('image/');
  }

  viewDocument(app: PortalApplication, doc: PortalDocument): void {
    this.matDialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '90vh',
      data: {
        fileUrl: this.portalService.applicationDocumentUrl(app.id, doc.id),
        fileType: doc.mime_type === 'application/pdf' ? 'pdf' : 'image',
        title: doc.document_name,
        fileName: doc.file_name
      }
    });
  }

  downloadDocument(app: PortalApplication, doc: PortalDocument): void {
    this.download('doc:' + doc.id, this.portalService.applicationDocumentUrl(app.id, doc.id), doc.file_name);
  }

  private download(key: string, url: string, fileName: string): void {
    this.downloading = key;
    this.portalService.downloadFile(url, fileName).subscribe({
      next: () => this.downloading = null,
      error: () => {
        this.downloading = null;
        this.toast.showError('Download failed', 'Please try again.');
      }
    });
  }

  private letterFileName(app: PortalApplication, letter: PortalLetter): string {
    return `${letter.title.replace(/\s+/g, '-')}-${app.application_number}.pdf`;
  }
}
