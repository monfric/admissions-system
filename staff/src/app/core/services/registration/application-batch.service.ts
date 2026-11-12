import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ApplicationBatchResponse,
  ApplicationBatchListResponse,
  CreateApplicationBatchRequest,
  ApplicationBatchStats
} from '../../models/registration/application-batch.model';

/** Dropdown filters shared by the staff application list pages. */
export interface ApplicationListFilters {
  intakeId?: number;
  trainingLevelId?: number;
  /** Matches applications that chose this programme as either choice. */
  programmeId?: number;
  gender?: string;
  /** today | week | month | 30days — by application date */
  applied?: string;
  /** today | week | month | 30days — by payment date */
  paid?: string;
  /** 'notified' / 'recalled' = programmeId matches only that programme (default: either choice). */
  programmeMatch?: 'any' | 'notified' | 'recalled';
  /** last_day | le3 | le7 | le10 | gt10 — days left to respond (notified applications) */
  daysRemaining?: string;
  /** today | week | month | 30days — by admission date (admissions list) */
  admitted?: string;
  /** active | inactive (admissions list) */
  status?: string;
  /** provisional | admission (offer letters list) */
  letterType?: string;
  /** Boarder | Day Scholar */
  residence?: string;
  /** none | submitted | rejected — the latest payment proof (unpaid list) */
  proofStatus?: string;
  /** pending | submitted | unlocked (uniform measurements list) */
  measurement?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApplicationBatchService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  create(applicantId: number, req: CreateApplicationBatchRequest): Observable<ApplicationBatchResponse> {
    return this.http.post<ApplicationBatchResponse>(`${this.apiUrl}/applicants/${applicantId}/application-batches`, req);
  }

  /** Counts for the list-page cards, filtered like the list (e.g. payment_status 'unpaid'). */
  getStats(filters: { payment_status?: string; decision_status?: string }):
      Observable<{ success: boolean; message: string; data: ApplicationBatchStats }> {
    let params = new HttpParams();
    if (filters.payment_status) params = params.set('payment_status', filters.payment_status);
    if (filters.decision_status) params = params.set('decision_status', filters.decision_status);
    return this.http.get<{ success: boolean; message: string; data: ApplicationBatchStats }>(`${this.apiUrl}/application-batches/stats`, { params });
  }

  getAll(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    paymentStatus?: string,
    intakeId?: number,
    decisionStatus?: string,
    filters: ApplicationListFilters = {}
  ): Observable<ApplicationBatchListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (search) params = params.set('search', search);
    if (paymentStatus) params = params.set('payment_status', paymentStatus);
    if (intakeId !== undefined) params = params.set('intake_id', intakeId.toString());
    if (decisionStatus) params = params.set('decision_status', decisionStatus);
    if (filters.intakeId) params = params.set('intake_id', String(filters.intakeId));
    if (filters.trainingLevelId) params = params.set('training_level_id', String(filters.trainingLevelId));
    if (filters.programmeId) params = params.set('programme_id', String(filters.programmeId));
    if (filters.gender) params = params.set('gender', filters.gender);
    if (filters.residence) params = params.set('residence', filters.residence);
    if (filters.applied) params = params.set('applied', filters.applied);
    if (filters.paid) params = params.set('paid', filters.paid);
    if (filters.programmeMatch) params = params.set('programme_match', filters.programmeMatch);
    if (filters.daysRemaining) params = params.set('days_remaining', filters.daysRemaining);
    if (filters.proofStatus) params = params.set('proof_status', filters.proofStatus);

    return this.http.get<ApplicationBatchListResponse>(`${this.apiUrl}/application-batches`, { params });
  }

  notify(applicationBatchId: number, applicationId: number): Observable<ApplicationBatchResponse> {
    return this.http.post<ApplicationBatchResponse>(
      `${this.apiUrl}/application-batches/${applicationBatchId}/notify`,
      { application_id: applicationId }
    );
  }

  decide(applicationBatchId: number, decision: 'approve' | 'reject', remarks?: string): Observable<ApplicationBatchResponse> {
    return this.http.post<ApplicationBatchResponse>(
      `${this.apiUrl}/application-batches/${applicationBatchId}/decision`,
      { decision, remarks: remarks || '' }
    );
  }
}
