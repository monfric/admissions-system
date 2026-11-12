import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** One outgoing email as the Email Log shows it. */
export interface EmailLogItem {
  id: number;
  to_email: string;
  to_name: string;
  template: string;
  subject: string;
  /** pending | sent | failed */
  status: string;
  attempts: number;
  last_error: string;
  send_after: string;
  sent_at: string | null;
  created_at: string;
  /** Only from getOne(). */
  html_body?: string;
  text_body?: string;
}

export interface EmailLogStats {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  sent_today: number;
  /** 'log' = emails are written to a file on the server, not sent. */
  driver: string;
}

interface ApiResponse<T> { success: boolean; message: string; data: T }

export interface EmailLogPage {
  data: EmailLogItem[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

/** The admins' Email Log (/email-log). */
@Injectable({
  providedIn: 'root'
})
export class EmailLogService {
  private apiUrl = `${environment.apiUrl}/email-log`;

  constructor(private http: HttpClient) {}

  getAll(page = 1, pageSize = 20, search = '', status = ''): Observable<ApiResponse<EmailLogPage>> {
    let params = new HttpParams().set('page', page).set('page_size', pageSize);
    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);
    return this.http.get<ApiResponse<EmailLogPage>>(this.apiUrl, { params });
  }

  getStats(): Observable<ApiResponse<EmailLogStats>> {
    return this.http.get<ApiResponse<EmailLogStats>>(`${this.apiUrl}/stats`);
  }

  getOne(id: number): Observable<ApiResponse<EmailLogItem>> {
    return this.http.get<ApiResponse<EmailLogItem>>(`${this.apiUrl}/${id}`);
  }

  resend(id: number): Observable<ApiResponse<EmailLogItem>> {
    return this.http.post<ApiResponse<EmailLogItem>>(`${this.apiUrl}/${id}/resend`, {});
  }
}
