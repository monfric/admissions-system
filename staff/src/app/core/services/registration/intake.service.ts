import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  IntakeResponse,
  IntakeListResponse,
  CreateIntakeRequest,
  UpdateIntakeRequest,
  IntakeStats
} from '../../models/registration/intake.model';

@Injectable({
  providedIn: 'root'
})
export class IntakeService {
  private apiUrl = `${environment.apiUrl}/intakes`;

  constructor(private http: HttpClient) {}

  getIntakes(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    isActive?: boolean,
    intakeYear?: number,
    intakeId?: number
  ): Observable<IntakeListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (search) params = params.set('search', search);
    if (isActive !== undefined) params = params.set('is_active', isActive.toString());
    if (intakeYear !== undefined) params = params.set('intake_year', intakeYear.toString());
    if (intakeId) params = params.set('intake_id', intakeId.toString());

    return this.http.get<IntakeListResponse>(this.apiUrl, { params });
  }

  getIntake(id: number): Observable<IntakeResponse> {
    return this.http.get<IntakeResponse>(`${this.apiUrl}/${id}`);
  }

  createIntake(intake: CreateIntakeRequest): Observable<IntakeResponse> {
    return this.http.post<IntakeResponse>(this.apiUrl, intake);
  }

  updateIntake(id: number, intake: UpdateIntakeRequest): Observable<IntakeResponse> {
    return this.http.put<IntakeResponse>(`${this.apiUrl}/${id}`, intake);
  }

  deleteIntake(id: number): Observable<IntakeResponse> {
    return this.http.delete<IntakeResponse>(`${this.apiUrl}/${id}`);
  }

  /** Counts for the Intakes page cards. */
  getStats(): Observable<{ success: boolean; message: string; data: IntakeStats }> {
    return this.http.get<{ success: boolean; message: string; data: IntakeStats }>(`${this.apiUrl}/stats`);
  }
}
