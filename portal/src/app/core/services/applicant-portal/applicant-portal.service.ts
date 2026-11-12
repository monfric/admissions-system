import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Applicant, ApplicantDocumentType, UpdateApplicantRequest } from '../../models/registration/applicant.model';
import { ApplicantApiResponse } from '../../models/applicant-portal/applicant-auth.model';
import {
  ApplyIntakeOption,
  ApplyRequest,
  PortalApplication,
  PortalPayment,
  PortalUniformForm,
  SubmitUniformRequest
} from '../../models/applicant-portal/applicant-application.model';

/** Profile fields an applicant may save from the portal (no account fields). */
export type ApplicantProfileUpdate = Omit<UpdateApplicantRequest, 'email' | 'password' | 'is_active' | 'mark_complete'> & {
  /** The profile-form step being moved to; the server refuses it while an earlier step is incomplete. */
  current_step?: number;
};

/**
 * The logged-in applicant's own data. Every call goes to /applicant-portal/,
 * so the interceptor sends the applicant token and the backend works out
 * who the applicant is from it — no applicant IDs in these URLs.
 */
@Injectable({
  providedIn: 'root'
})
export class ApplicantPortalService {
  private apiUrl = `${environment.apiUrl}/applicant-portal`;

  constructor(private http: HttpClient) {}

  getProfile(): Observable<ApplicantApiResponse<Applicant>> {
    return this.http.get<ApplicantApiResponse<Applicant>>(`${this.apiUrl}/profile`);
  }

  updateProfile(req: ApplicantProfileUpdate): Observable<ApplicantApiResponse<Applicant>> {
    return this.http.put<ApplicantApiResponse<Applicant>>(`${this.apiUrl}/profile`, req);
  }

  submitProfile(): Observable<ApplicantApiResponse<Applicant>> {
    return this.http.post<ApplicantApiResponse<Applicant>>(`${this.apiUrl}/profile/submit`, {});
  }

  uploadDocument(type: ApplicantDocumentType, file: File): Observable<ApplicantApiResponse<unknown>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ApplicantApiResponse<unknown>>(`${this.apiUrl}/profile/documents/${type}`, formData);
  }

  /** Authenticated URL of one of the applicant's documents, with a cache-buster. */
  documentUrl(type: ApplicantDocumentType): string {
    return `${this.apiUrl}/profile/documents/${type}?t=${Date.now()}`;
  }

  getDocumentBlob(type: ApplicantDocumentType): Observable<Blob> {
    return this.http.get(this.documentUrl(type), { responseType: 'blob' });
  }

  /** Open intakes with their training levels, fees and programmes. */
  getApplyOptions(): Observable<ApplicantApiResponse<ApplyIntakeOption[]>> {
    return this.http.get<ApplicantApiResponse<ApplyIntakeOption[]>>(`${this.apiUrl}/apply-options`);
  }

  apply(req: ApplyRequest): Observable<ApplicantApiResponse<PortalApplication>> {
    return this.http.post<ApplicantApiResponse<PortalApplication>>(`${this.apiUrl}/applications`, req);
  }

  getApplications(): Observable<ApplicantApiResponse<PortalApplication[]>> {
    return this.http.get<ApplicantApiResponse<PortalApplication[]>>(`${this.apiUrl}/applications`);
  }

  getPayments(): Observable<ApplicantApiResponse<PortalPayment[]>> {
    return this.http.get<ApplicantApiResponse<PortalPayment[]>>(`${this.apiUrl}/payments`);
  }

  getApplication(id: number): Observable<ApplicantApiResponse<PortalApplication>> {
    return this.http.get<ApplicantApiResponse<PortalApplication>>(`${this.apiUrl}/applications/${id}`);
  }

  /** Authenticated URL of an application's letter PDF, with a cache-buster. */
  letterUrl(applicationId: number, type: string): string {
    return `${this.apiUrl}/applications/${applicationId}/letters/${type}?t=${Date.now()}`;
  }

  /** Authenticated URL of a document attached to an application, with a cache-buster. */
  applicationDocumentUrl(applicationId: number, documentId: number): string {
    return `${this.apiUrl}/applications/${applicationId}/documents/${documentId}?t=${Date.now()}`;
  }

  /** The uniform measurement form of an admitted application. */
  getUniformForm(applicationId: number): Observable<ApplicantApiResponse<PortalUniformForm>> {
    return this.http.get<ApplicantApiResponse<PortalUniformForm>>(`${this.apiUrl}/applications/${applicationId}/uniform`);
  }

  /** Submits the measurements (inches); this unlocks the application's documents. */
  submitUniform(applicationId: number, req: SubmitUniformRequest): Observable<ApplicantApiResponse<PortalUniformForm>> {
    return this.http.put<ApplicantApiResponse<PortalUniformForm>>(`${this.apiUrl}/applications/${applicationId}/uniform`, req);
  }

  /** Authenticated URL of the submitted form as a PDF, with a cache-buster. */
  uniformPdfUrl(applicationId: number): string {
    return `${this.apiUrl}/applications/${applicationId}/uniform/pdf?t=${Date.now()}`;
  }

  /** Fetches a file with the applicant token and saves it under the given name. */
  downloadFile(url: string, fileName: string): Observable<void> {
    return new Observable<void>(subscriber => {
      this.http.get(url, { responseType: 'blob' }).subscribe({
        next: blob => {
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = fileName;
          link.click();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          subscriber.next();
          subscriber.complete();
        },
        error: err => subscriber.error(err)
      });
    });
  }
}
