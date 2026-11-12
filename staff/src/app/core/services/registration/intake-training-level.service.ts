import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  IntakeTrainingLevelResponse,
  IntakeTrainingLevelListResponse,
  CreateIntakeTrainingLevelRequest,
  UpdateIntakeTrainingLevelRequest
} from '../../models/registration/intake-training-level.model';

@Injectable({
  providedIn: 'root'
})
export class IntakeTrainingLevelService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getByIntake(intakeId: number): Observable<IntakeTrainingLevelListResponse> {
    return this.http.get<IntakeTrainingLevelListResponse>(`${this.apiUrl}/intakes/${intakeId}/training-levels`);
  }

  create(intakeId: number, req: CreateIntakeTrainingLevelRequest): Observable<IntakeTrainingLevelResponse> {
    return this.http.post<IntakeTrainingLevelResponse>(`${this.apiUrl}/intakes/${intakeId}/training-levels`, req);
  }

  update(id: number, req: UpdateIntakeTrainingLevelRequest): Observable<IntakeTrainingLevelResponse> {
    return this.http.put<IntakeTrainingLevelResponse>(`${this.apiUrl}/intake-training-levels/${id}`, req);
  }

  delete(id: number): Observable<IntakeTrainingLevelResponse> {
    return this.http.delete<IntakeTrainingLevelResponse>(`${this.apiUrl}/intake-training-levels/${id}`);
  }
}
