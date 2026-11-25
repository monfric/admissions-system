import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { EMPTY, Subscription, timer } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';

import {
  PortalApplication,
  PortalDocument,
  PortalLetter,
  PortalMpesaPayment,
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
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule],
  templateUrl: './application-detail.component.html',
  styleUrls: ['../../shared/portal-ui.scss', './application-detail.component.scss']
})
export class ApplicationDetailComponent implements OnInit, OnDestroy {
  application: PortalApplication | null = null;
  loading = true;
  errorMessage = '';
  copied = false;
  /** Key of the file currently downloading, e.g. "letter:provisional" or "doc:12". */
  downloading: string | null = null;

  // Payment proof form
  proofCode = '';
  proofFile: File | null = null;
  /** Local preview of the chosen image (object URL). */
  proofPreview: string | null = null;
  proofError = '';
  uploadingProof = false;
  /** True while replacing a proof that's still awaiting verification. */
  replacingProof = false;
  readonly proofMaxBytes = 2 * 1024 * 1024;

  // Pay with M-Pesa
  mpesaPhone = '';
  /** The attempt on screen (the latest one). */
  mpesa: PortalMpesaPayment | null = null;
  mpesaError = '';
  startingMpesa = false;
  /** Polling stopped while M-Pesa still had no answer: offer "Check again". */
  mpesaStillWaiting = false;
  /** Shown after a successful payment, with its receipt. */
  paidWithMpesa: PortalMpesaPayment | null = null;
  private mpesaPoll?: Subscription;
  /** Check every 4 seconds, for up to 3 minutes. */
  private readonly pollEveryMs = 4000;
  private readonly pollTimes = 45;

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
    this.loadApplication(Number(this.route.snapshot.paramMap.get('id')));
  }

  ngOnDestroy(): void {
    this.clearProofFile();
    this.stopMpesaPoll();
  }

  private loadApplication(id: number): void {
    this.portalService.getApplication(id).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.errorMessage = res.message || 'Application not found.';
          return;
        }
        this.application = res.data;
        this.initMpesa(res.data);
      },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Application not found.';
      }
    });
  }

  // ── Pay with M-Pesa ────────────────────────────────────────────────────────

  private initMpesa(app: PortalApplication): void {
    if (!app.mpesa) {
      this.mpesa = null;
      return;
    }
    if (!this.mpesaPhone) {
      this.mpesaPhone = app.mpesa.phone;
    }
    this.mpesa = app.mpesa.latest;
    if (this.mpesa && !this.mpesa.is_final) {
      this.pollMpesa(app.id);
    }
  }

  /** True when an M-Pesa prompt is waiting for the PIN. */
  get mpesaWaiting(): boolean {
    return !!this.mpesa && !this.mpesa.is_final;
  }

  payWithMpesa(app: PortalApplication): void {
    const phone = this.mpesaPhone.replace(/[\s-]/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(phone)) {
      this.mpesaError = 'Enter a Safaricom M-Pesa number, e.g. 0712345678.';
      return;
    }
    this.mpesaError = '';
    this.startingMpesa = true;
    this.portalService.startMpesaPayment(app.id, phone).subscribe({
      next: res => {
        this.startingMpesa = false;
        this.mpesa = res.data;
        this.handleMpesaUpdate(app);
      },
      error: err => {
        this.startingMpesa = false;
        this.mpesaError = err.error?.message || 'The payment request could not be sent. Please try again.';
      }
    });
  }

  /** After polling gave up: ask once more, and keep watching if it's still waiting. */
  checkMpesaAgain(app: PortalApplication): void {
    if (!this.mpesa) return;
    this.mpesaStillWaiting = false;
    this.portalService.getMpesaPayment(app.id, this.mpesa.id).subscribe({
      next: res => {
        this.mpesa = res.data;
        this.handleMpesaUpdate(app);
      },
      error: () => this.mpesaStillWaiting = true
    });
  }

  private pollMpesa(appId: number): void {
    this.stopMpesaPoll();
    this.mpesaStillWaiting = false;
    const mpesaId = this.mpesa!.id;
    this.mpesaPoll = timer(this.pollEveryMs, this.pollEveryMs).pipe(
      take(this.pollTimes),
      // A failed check (e.g. network blip) is skipped; the next one tries again.
      switchMap(() => this.portalService.getMpesaPayment(appId, mpesaId).pipe(catchError(() => EMPTY)))
    ).subscribe({
      next: res => {
        this.mpesa = res.data;
        if (res.data.is_final && this.application) {
          this.handleMpesaUpdate(this.application);
        }
      },
      complete: () => {
        if (this.mpesaWaiting) {
          this.mpesaStillWaiting = true;
        }
      }
    });
  }

  private handleMpesaUpdate(app: PortalApplication): void {
    if (!this.mpesa) return;
    if (!this.mpesa.is_final) {
      this.pollMpesa(app.id);
      return;
    }
    this.stopMpesaPoll();
    if (this.mpesa.status === 'success') {
      this.paidWithMpesa = this.mpesa;
      this.toast.showSuccess('Payment received', 'Thank you. Your M-Pesa payment has been received.');
      this.loadApplication(app.id); // payment status, balance, banner
    }
  }

  private stopMpesaPoll(): void {
    this.mpesaPoll?.unsubscribe();
    this.mpesaPoll = undefined;
  }

  downloadReceipt(paymentId: number, app: PortalApplication): void {
    this.download('receipt:' + paymentId, this.portalService.receiptUrl(paymentId), `Receipt-${app.application_number}.pdf`);
  }

  /** The upload form shows until a proof is waiting (or after staff reject one). */
  showProofForm(app: PortalApplication): boolean {
    return !app.payment_proof || app.payment_proof.status === 'rejected' || this.replacingProof;
  }

  onProofFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.clearProofFile();
    this.proofError = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.proofError = 'Please choose a JPG or PNG image (a photo or screenshot of your payment message).';
      input.value = '';
      return;
    }
    if (file.size > this.proofMaxBytes) {
      this.proofError = 'The image is larger than 2 MB. Try a screenshot instead of a photo.';
      input.value = '';
      return;
    }
    this.proofFile = file;
    this.proofPreview = URL.createObjectURL(file);
  }

  uploadProof(app: PortalApplication): void {
    const code = this.proofCode.trim();
    if (!code) {
      this.proofError = 'Enter the transaction code from your payment message.';
      return;
    }
    if (!this.proofFile) {
      this.proofError = 'Choose the photo or screenshot of your payment.';
      return;
    }
    this.uploadingProof = true;
    this.proofError = '';
    this.portalService.uploadPaymentProof(app.id, this.proofFile, code).subscribe({
      next: res => {
        this.uploadingProof = false;
        this.application = res.data;
        this.replacingProof = false;
        this.proofCode = '';
        this.clearProofFile();
        this.toast.showSuccess('Proof uploaded', res.message);
      },
      error: err => {
        this.uploadingProof = false;
        this.proofError = err.error?.message || 'Upload failed. Please try again.';
      }
    });
  }

  viewProof(app: PortalApplication): void {
    this.matDialog.open(DocumentViewerDialogComponent, {
      width: '90vw', maxWidth: '900px', height: '90vh',
      data: {
        fileUrl: this.portalService.paymentProofUrl(app.id),
        fileType: 'image',
        title: 'Payment Proof',
        fileName: `Payment-Proof-${app.application_number}`
      }
    });
  }

  startReplaceProof(): void {
    this.replacingProof = true;
    this.proofError = '';
  }

  cancelReplaceProof(): void {
    this.replacingProof = false;
    this.proofError = '';
    this.proofCode = '';
    this.clearProofFile();
  }

  private clearProofFile(): void {
    if (this.proofPreview) URL.revokeObjectURL(this.proofPreview);
    this.proofPreview = null;
    this.proofFile = null;
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
