import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CreateDepartmentRequest, DepartmentResponse, UpdateDepartmentRequest } from '../../models/academics/department.model';
import { ApiResponse, Department, PaginatedResult } from '../../models/academics/master-unit.model';


@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  private apiUrl = `${environment.apiUrl}/departments`;

  constructor(private http: HttpClient) {}

  /**
   * Get all departments with pagination and filters
   */
  getDepartments(
    page: number = 1, 
    pageSize: number = 10,
    search?: string,
    facultyId?: number,
    isActive?: boolean,
    sortBy: string = 'created_at',
    sortDir: string = 'desc'
  ): Observable<DepartmentResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString())
      .set('sort_by', sortBy)
      .set('sort_dir', sortDir);

    if (search) {
      params = params.set('search', search);
    }

    if (facultyId !== undefined && facultyId !== null) {
      params = params.set('faculty_id', facultyId.toString());
    }

    if (isActive !== undefined && isActive !== null) {
      params = params.set('is_active', isActive.toString());
    }

    return this.http.get<DepartmentResponse>(this.apiUrl, { params });
  }

  /**
   * Get all departments (no pagination)
   */
  getAllDepartments(): Observable<DepartmentResponse> {
    const params = new HttpParams()
      .set('page', '1')
      .set('page_size', '100')
      .set('is_active', 'true');

    return this.http.get<DepartmentResponse>(this.apiUrl, { params });
  }

  /**
   * Get departments by faculty
   */
  getDepartmentsByFaculty(facultyId: number): Observable<DepartmentResponse> {
    const params = new HttpParams()
      .set('faculty_id', facultyId.toString())
      .set('page', '1')
      .set('page_size', '100')
      .set('is_active', 'true');

    return this.http.get<DepartmentResponse>(this.apiUrl, { params });
  }

  /**
   * Get department by ID
   */
  getDepartment(id: number): Observable<DepartmentResponse> {
    return this.http.get<DepartmentResponse>(`${this.apiUrl}/${id}`);
  }

  /**
   * Create new department
   */
  createDepartment(department: CreateDepartmentRequest): Observable<DepartmentResponse> {
    return this.http.post<DepartmentResponse>(this.apiUrl, department);
  }

  /**
   * Update department
   */
  updateDepartment(id: number, department: UpdateDepartmentRequest): Observable<DepartmentResponse> {
    return this.http.put<DepartmentResponse>(`${this.apiUrl}/${id}`, department);
  }

  /**
   * Delete department
   */
  deleteDepartment(id: number): Observable<DepartmentResponse> {
    return this.http.delete<DepartmentResponse>(`${this.apiUrl}/${id}`);
  }

  /**
   * Toggle department active status
   */
  toggleDepartmentStatus(id: number, isActive: boolean): Observable<DepartmentResponse> {
    return this.http.put<DepartmentResponse>(`${this.apiUrl}/${id}`, { is_active: isActive });
  }


  /**
   * Get active departments only (for dropdowns)
   */
  getActiveDepartments(): Observable<ApiResponse<Department[]>> {
    const params = new HttpParams().set('is_active', 'true');
    return this.http.get<ApiResponse<Department[]>>(`${this.apiUrl}/active`, { params });
  }

  /**
   * Get all departments
   */
  getDepartments01(filters?: any): Observable<ApiResponse<PaginatedResult<Department>>> {
    let params = new HttpParams();

    if (filters) {
      if (filters.is_active !== undefined) params = params.set('is_active', 'true');
      if (filters.faculty_id) params = params.set('faculty_id', filters.faculty_id.toString());
    }

    return this.http.get<ApiResponse<PaginatedResult<Department>>>(this.apiUrl, { params });
  }
}