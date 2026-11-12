import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  IntakeProgrammeResponse,
  IntakeProgrammeListResponse,
  CreateIntakeProgrammeRequest,
  UpdateIntakeProgrammeRequest
} from '../../models/registration/intake-programme.model';

@Injectable({
  providedIn: 'root'
})
export class IntakeProgrammeService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getByIntake(intakeId: number): Observable<IntakeProgrammeListResponse> {
    return this.http.get<IntakeProgrammeListResponse>(`${this.apiUrl}/intakes/${intakeId}/programmes`);
  }

  create(intakeId: number, req: CreateIntakeProgrammeRequest): Observable<IntakeProgrammeResponse> {
    return this.http.post<IntakeProgrammeResponse>(`${this.apiUrl}/intakes/${intakeId}/programmes`, req);
  }

  update(id: number, req: UpdateIntakeProgrammeRequest): Observable<IntakeProgrammeResponse> {
    return this.http.put<IntakeProgrammeResponse>(`${this.apiUrl}/intake-programmes/${id}`, req);
  }

  delete(id: number): Observable<IntakeProgrammeResponse> {
    return this.http.delete<IntakeProgrammeResponse>(`${this.apiUrl}/intake-programmes/${id}`);
  }
}
