import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CreateTrainingLevelRequest, TrainingLevelResponse, UpdateTrainingLevelRequest } from '../../models/academics/training-level.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TrainingLevelService {
  private apiUrl = `${environment.apiUrl}/training-levels`;

  constructor(private http: HttpClient) {}

  /**
   * Get all training levels with pagination and filters
   */
  getTrainingLevels(
    page: number = 1, 
    pageSize: number = 10,
    search?: string,
    isActive?: boolean,
    sortBy: string = 'order',
    sortDir: string = 'asc'
  ): Observable<TrainingLevelResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString())
      .set('sort_by', sortBy)
      .set('sort_dir', sortDir);

    if (search) {
      params = params.set('search', search);
    }

    if (isActive !== undefined && isActive !== null) {
      params = params.set('is_active', isActive.toString());
    }

    return this.http.get<TrainingLevelResponse>(this.apiUrl, { params });
  }

  /**
   * Get all training levels (no pagination) - for dropdowns
   */
  getAllTrainingLevels(): Observable<TrainingLevelResponse> {
    const params = new HttpParams()
      .set('page', '1')
      .set('page_size', '100')
      .set('is_active', 'true')
      .set('sort_by', 'order')
      .set('sort_dir', 'asc');

    return this.http.get<TrainingLevelResponse>(this.apiUrl);
  }

  /**
   * Get training level by ID
   */
  getTrainingLevel(id: number): Observable<TrainingLevelResponse> {
    return this.http.get<TrainingLevelResponse>(`${this.apiUrl}/${id}`);
  }

  /**
   * Create new training level
   */
  createTrainingLevel(trainingLevel: CreateTrainingLevelRequest): Observable<TrainingLevelResponse> {
    return this.http.post<TrainingLevelResponse>(this.apiUrl, trainingLevel);
  }

  /**
   * Update training level
   */
  updateTrainingLevel(id: number, trainingLevel: UpdateTrainingLevelRequest): Observable<TrainingLevelResponse> {
    return this.http.put<TrainingLevelResponse>(`${this.apiUrl}/${id}`, trainingLevel);
  }

  /**
   * Delete training level
   */
  deleteTrainingLevel(id: number): Observable<TrainingLevelResponse> {
    return this.http.delete<TrainingLevelResponse>(`${this.apiUrl}/${id}`);
  }

  /**
   * Toggle training level active status
   */
  toggleTrainingLevelStatus(id: number, isActive: boolean): Observable<TrainingLevelResponse> {
    return this.http.put<TrainingLevelResponse>(`${this.apiUrl}/${id}`, { is_active: isActive });
  }
}
