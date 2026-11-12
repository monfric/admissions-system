import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  UniformMeasurementListItem,
  UniformMeasurementListResponse,
  UniformMeasurementStats,
  UniformSet
} from '../../models/registration/uniform-measurement.model';
import { ApplicationListFilters } from './application-batch.service';

type ApiResponse<T> = { success: boolean; message: string; data: T };

/** Staff side of the uniform measurement forms admitted students fill in on the portal. */
@Injectable({
  providedIn: 'root'
})
export class UniformMeasurementService {
  private apiUrl = `${environment.apiUrl}/uniform-measurements`;

  constructor(private http: HttpClient) {}

  /** Active admissions with their form status. */
  getAll(page: number, pageSize: number, search?: string, filters: ApplicationListFilters = {}): Observable<UniformMeasurementListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (search) params = params.set('search', search);
    if (filters.intakeId) params = params.set('intake_id', String(filters.intakeId));
    if (filters.programmeId) params = params.set('programme_id', String(filters.programmeId));
    if (filters.trainingLevelId) params = params.set('training_level_id', String(filters.trainingLevelId));
    if (filters.gender) params = params.set('gender', filters.gender);
    if (filters.residence) params = params.set('residence', filters.residence);
    if (filters.measurement) params = params.set('measurement', filters.measurement);

    return this.http.get<UniformMeasurementListResponse>(this.apiUrl, { params });
  }

  /** The gents and ladies forms (garments and fields). */
  getSets(): Observable<ApiResponse<UniformSet[]>> {
    return this.http.get<ApiResponse<UniformSet[]>>(`${this.apiUrl}/sets`);
  }

  getStats(): Observable<ApiResponse<UniformMeasurementStats>> {
    return this.http.get<ApiResponse<UniformMeasurementStats>>(`${this.apiUrl}/stats`);
  }

  get(admissionId: number): Observable<ApiResponse<UniformMeasurementListItem>> {
    return this.http.get<ApiResponse<UniformMeasurementListItem>>(`${this.apiUrl}/${admissionId}`);
  }

  /** Reopens a submitted form so the student can correct and resubmit it. */
  unlock(admissionId: number): Observable<ApiResponse<UniformMeasurementListItem>> {
    return this.http.post<ApiResponse<UniformMeasurementListItem>>(`${this.apiUrl}/${admissionId}/unlock`, {});
  }

  /** Authenticated URL of a student's form as a PDF, with a cache-buster. */
  pdfUrl(admissionId: number): string {
    return `${this.apiUrl}/${admissionId}/pdf?t=${Date.now()}`;
  }

  getPdfBlob(admissionId: number): Observable<Blob> {
    return this.http.get(this.pdfUrl(admissionId), { responseType: 'blob' });
  }
}
