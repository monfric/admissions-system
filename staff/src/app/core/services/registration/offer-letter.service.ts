import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  OfferLetterResponse,
  OfferLetterListResponse,
  CreateOfferLetterRequest,
  UpdateOfferLetterRequest
} from '../../models/registration/offer-letter.model';
import { ApplicationListFilters } from './application-batch.service';

@Injectable({
  providedIn: 'root'
})
export class OfferLetterService {
  private apiUrl = `${environment.apiUrl}/offer-letters`;

  constructor(private http: HttpClient) {}

  getAll(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    type?: string,
    status?: string,
    filters: ApplicationListFilters = {}
  ): Observable<OfferLetterListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (search) params = params.set('search', search);
    if (type) params = params.set('type', type);
    if (status) params = params.set('status', status);
    if (filters.intakeId) params = params.set('intake_id', String(filters.intakeId));
    if (filters.trainingLevelId) params = params.set('training_level_id', String(filters.trainingLevelId));
    if (filters.programmeId) params = params.set('programme_id', String(filters.programmeId));

    return this.http.get<OfferLetterListResponse>(this.apiUrl, { params });
  }

  getById(id: number): Observable<OfferLetterResponse> {
    return this.http.get<OfferLetterResponse>(`${this.apiUrl}/${id}`);
  }

  create(req: CreateOfferLetterRequest): Observable<OfferLetterResponse> {
    return this.http.post<OfferLetterResponse>(this.apiUrl, req);
  }

  update(id: number, req: UpdateOfferLetterRequest): Observable<OfferLetterResponse> {
    return this.http.put<OfferLetterResponse>(`${this.apiUrl}/${id}`, req);
  }

  delete(id: number): Observable<OfferLetterResponse> {
    return this.http.delete<OfferLetterResponse>(`${this.apiUrl}/${id}`);
  }

  /** The letter rendered as a PDF with placeholder applicant details. */
  previewUrl(id: number): string {
    return `${this.apiUrl}/${id}/preview?t=${Date.now()}`;
  }
}
