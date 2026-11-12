import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AdmissionListResponse, AdmissionStats } from '../../models/registration/admission.model';
import { ApplicationListFilters } from './application-batch.service';

@Injectable({
  providedIn: 'root'
})
export class AdmissionService {
  private apiUrl = `${environment.apiUrl}/admissions`;

  constructor(private http: HttpClient) {}

  getAll(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    intakeId?: number,
    programmeId?: number,
    status?: string,
    filters: ApplicationListFilters = {}
  ): Observable<AdmissionListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (search) params = params.set('search', search);
    if (intakeId !== undefined) params = params.set('intake_id', intakeId.toString());
    if (programmeId !== undefined) params = params.set('programme_id', programmeId.toString());
    if (status) params = params.set('status', status);
    if (filters.trainingLevelId) params = params.set('training_level_id', String(filters.trainingLevelId));
    if (filters.gender) params = params.set('gender', filters.gender);
    if (filters.residence) params = params.set('residence', filters.residence);
    if (filters.admitted) params = params.set('admitted', filters.admitted);

    return this.http.get<AdmissionListResponse>(this.apiUrl, { params });
  }

  /** Counts for the Approved Applications page cards (all admissions). */
  getStats(): Observable<{ success: boolean; message: string; data: AdmissionStats }> {
    return this.http.get<{ success: boolean; message: string; data: AdmissionStats }>(`${this.apiUrl}/stats`);
  }
}
