import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ApplicantResponse,
  ApplicantListResponse,
  ApplicantStats,
  CreateApplicantRequest,
  UpdateApplicantRequest,
  ApplicantDocumentType,
  FileUploadResponse
} from '../../models/registration/applicant.model';

/** Extra filters for the New Applicants list. */
export interface ApplicantListFilters {
  profileComplete?: boolean;
  hasApplied?: boolean;
  intakeId?: number;
  /** today | week | month | 30days */
  registered?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApplicantService {
  private apiUrl = `${environment.apiUrl}/applicants`;

  constructor(private http: HttpClient) {}

  /** Counts for the New Applicants page cards. */
  getStats(): Observable<{ success: boolean; message: string; data: ApplicantStats }> {
    return this.http.get<{ success: boolean; message: string; data: ApplicantStats }>(`${this.apiUrl}/stats`);
  }

  getApplicants(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    isActive?: boolean,
    gender?: string,
    county?: string,
    filters: ApplicantListFilters = {}
  ): Observable<ApplicantListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (search) params = params.set('search', search);
    if (isActive !== undefined) params = params.set('is_active', isActive.toString());
    if (gender) params = params.set('gender', gender);
    if (county) params = params.set('county', county);
    if (filters.profileComplete !== undefined) params = params.set('profile_complete', String(filters.profileComplete));
    if (filters.hasApplied !== undefined) params = params.set('has_applied', String(filters.hasApplied));
    if (filters.intakeId) params = params.set('intake_id', String(filters.intakeId));
    if (filters.registered) params = params.set('registered', filters.registered);

    return this.http.get<ApplicantListResponse>(this.apiUrl, { params });
  }

  getApplicant(id: number): Observable<ApplicantResponse> {
    return this.http.get<ApplicantResponse>(`${this.apiUrl}/${id}`);
  }

  createApplicant(applicant: CreateApplicantRequest): Observable<ApplicantResponse> {
    return this.http.post<ApplicantResponse>(this.apiUrl, applicant);
  }

  updateApplicant(id: number, applicant: UpdateApplicantRequest): Observable<ApplicantResponse> {
    return this.http.put<ApplicantResponse>(`${this.apiUrl}/${id}`, applicant);
  }

  deleteApplicant(id: number): Observable<ApplicantResponse> {
    return this.http.delete<ApplicantResponse>(`${this.apiUrl}/${id}`);
  }

  uploadDocument(applicantId: number, file: File, fileType: ApplicantDocumentType): Observable<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);

    return this.http.post<FileUploadResponse>(
      `${environment.apiUrl}/applicants/documents/${applicantId}/upload`,
      formData
    );
  }
}
