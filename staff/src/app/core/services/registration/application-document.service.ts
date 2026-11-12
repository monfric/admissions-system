import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ApplicationDocumentListResponse,
  ApplicationDocumentRequest,
  ApplicationDocumentResponse,
  ApplicationDocumentStats
} from '../../models/registration/application-document.model';
import { ApplicationListFilters } from './application-batch.service';

@Injectable({
  providedIn: 'root'
})
export class ApplicationDocumentService {
  private apiUrl = `${environment.apiUrl}/application-documents`;

  constructor(private http: HttpClient) {}

  getAll(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    status?: string,
    filters: ApplicationListFilters = {}
  ): Observable<ApplicationDocumentListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);
    if (filters.intakeId) params = params.set('intake_id', String(filters.intakeId));
    if (filters.trainingLevelId) params = params.set('training_level_id', String(filters.trainingLevelId));
    if (filters.programmeId) params = params.set('programme_id', String(filters.programmeId));
    // Provisional / Admission ("letterType" in the shared filters).
    if (filters.letterType) params = params.set('type', filters.letterType);

    return this.http.get<ApplicationDocumentListResponse>(this.apiUrl, { params });
  }

  /** Uploads a new document; `file` is required. */
  create(req: ApplicationDocumentRequest, file: File): Observable<ApplicationDocumentResponse> {
    return this.http.post<ApplicationDocumentResponse>(this.apiUrl, this.toFormData(req, file));
  }

  /** Updates a document; pass `file` only to replace the stored PDF. */
  update(id: number, req: ApplicationDocumentRequest, file?: File | null): Observable<ApplicationDocumentResponse> {
    return this.http.put<ApplicationDocumentResponse>(`${this.apiUrl}/${id}`, this.toFormData(req, file));
  }

  delete(id: number): Observable<ApplicationDocumentResponse> {
    return this.http.delete<ApplicationDocumentResponse>(`${this.apiUrl}/${id}`);
  }

  /** Authenticated URL of the stored PDF, with a cache-buster. */
  fileUrl(id: number): string {
    return `${this.apiUrl}/${id}/file?t=${Date.now()}`;
  }

  private toFormData(req: ApplicationDocumentRequest, file?: File | null): FormData {
    const formData = new FormData();
    formData.append('document_name', req.document_name);
    formData.append('intake_id', req.intake_id.toString());
    formData.append('programme_id', req.programme_id.toString());
    formData.append('type', req.type);
    formData.append('status', req.status);
    if (file) formData.append('file', file);
    return formData;
  }

  /** Counts for the Application Documents page cards. */
  getStats(): Observable<{ success: boolean; message: string; data: ApplicationDocumentStats }> {
    return this.http.get<{ success: boolean; message: string; data: ApplicationDocumentStats }>(`${this.apiUrl}/stats`);
  }
}
