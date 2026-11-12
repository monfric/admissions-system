import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardStats } from '../../models/dashboard.model';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private apiUrl = `${environment.apiUrl}/dashboard`;

  constructor(private http: HttpClient) {}

  /** All Dashboard figures; intakeId 0 = all intakes. */
  getStats(intakeId: number = 0): Observable<{ success: boolean; message: string; data: DashboardStats }> {
    const params = new HttpParams().set('intake_id', intakeId.toString());
    return this.http.get<{ success: boolean; message: string; data: DashboardStats }>(`${this.apiUrl}/stats`, { params });
  }
}
