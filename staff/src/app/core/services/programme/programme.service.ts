import { Injectable } from '@angular/core';
import { CreateProgrammeRequest, ProgrammeResponse, UpdateProgrammeRequest } from '../../models/academics/programme.model';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProgrammeService {
  private apiUrl = `${environment.apiUrl}/programmes`;

  constructor(private http: HttpClient) {}

  /**
   * Get all programmes with pagination and filters
   */
  getProgrammes(
    page: number = 1, 
    pageSize: number = 10,
    search?: string,
    departmentId?: number,
    trainingLevelId?: number,
    isActive?: boolean,
    sortBy: string = 'created_at',
    sortDir: string = 'desc'
  ): Observable<ProgrammeResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString())
      .set('sort_by', sortBy)
      .set('sort_dir', sortDir);

    if (search) {
      params = params.set('search', search);
    }

    if (departmentId !== undefined && departmentId !== null) {
      params = params.set('department_id', departmentId.toString());
    }

    if (trainingLevelId !== undefined && trainingLevelId !== null) {
      params = params.set('training_level_id', trainingLevelId.toString());
    }

    if (isActive !== undefined && isActive !== null) {
      params = params.set('is_active', isActive.toString());
    }

    return this.http.get<ProgrammeResponse>(this.apiUrl, { params });
  }

  /**
   * Get all programmes (no pagination) - for dropdowns
   */
  getAllProgrammes(): Observable<ProgrammeResponse> {
    const params = new HttpParams()
      .set('page', '1')
      .set('page_size', '99')
      .set('is_active', 'true');

    return this.http.get<ProgrammeResponse>(this.apiUrl, { params });
  }

  /**
   * Get programmes by department
   */
  getProgrammesByDepartment(departmentId: number): Observable<ProgrammeResponse> {
    const params = new HttpParams()
      .set('department_id', departmentId.toString())
      .set('page', '1')
      .set('page_size', '99')
      .set('is_active', 'true');

    return this.http.get<ProgrammeResponse>(this.apiUrl, { params });
  }

  /**
   * Get programmes by training level
   */
  getProgrammesByTrainingLevel(trainingLevelId: number): Observable<ProgrammeResponse> {
    const params = new HttpParams()
      .set('training_level_id', trainingLevelId.toString())
      .set('page', '1')
      .set('page_size', '99')
      .set('is_active', 'true');

    return this.http.get<ProgrammeResponse>(this.apiUrl, { params });
  }

  /**
   * Get programme by ID
   */
  getProgramme(id: number): Observable<ProgrammeResponse> {
    return this.http.get<ProgrammeResponse>(`${this.apiUrl}/${id}`);
  }

  /**
   * Create new programme
   */
  createProgramme(programme: CreateProgrammeRequest): Observable<ProgrammeResponse> {
    return this.http.post<ProgrammeResponse>(this.apiUrl, programme);
  }

  /**
   * Update programme
   */
  updateProgramme(id: number, programme: UpdateProgrammeRequest): Observable<ProgrammeResponse> {
    return this.http.put<ProgrammeResponse>(`${this.apiUrl}/${id}`, programme);
  }

  /**
   * Delete programme
   */
  deleteProgramme(id: number): Observable<ProgrammeResponse> {
    return this.http.delete<ProgrammeResponse>(`${this.apiUrl}/${id}`);
  }

  /**
   * Toggle programme active status
   */
  toggleProgrammeStatus(id: number, isActive: boolean): Observable<ProgrammeResponse> {
    return this.http.put<ProgrammeResponse>(`${this.apiUrl}/${id}`, { is_active: isActive });
  }
}
