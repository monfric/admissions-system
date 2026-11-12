import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StaffUser } from './auth/auth.service';

type ApiResponse<T> = { success: boolean; message: string; data: T };

export interface StaffUserStats {
  total: number;
  active: number;
  inactive: number;
  admins: number;
}

export interface StaffUserRequest {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  role?: 'admin' | 'staff';
  is_active?: boolean;
}

/** Staff Users page (admins only). */
@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  getAll(page: number, pageSize: number, search?: string, isActive?: boolean, role?: string):
    Observable<ApiResponse<{ data: StaffUser[]; total_items: number; total_pages: number }>> {
    let params = new HttpParams().set('page', String(page)).set('page_size', String(pageSize));
    if (search) params = params.set('search', search);
    if (isActive !== undefined) params = params.set('is_active', String(isActive));
    if (role) params = params.set('role', role);
    return this.http.get<ApiResponse<{ data: StaffUser[]; total_items: number; total_pages: number }>>(this.apiUrl, { params });
  }

  getStats(): Observable<ApiResponse<StaffUserStats>> {
    return this.http.get<ApiResponse<StaffUserStats>>(`${this.apiUrl}/stats`);
  }

  create(req: StaffUserRequest): Observable<ApiResponse<StaffUser>> {
    return this.http.post<ApiResponse<StaffUser>>(this.apiUrl, req);
  }

  update(id: number, req: StaffUserRequest): Observable<ApiResponse<StaffUser>> {
    return this.http.put<ApiResponse<StaffUser>>(`${this.apiUrl}/${id}`, req);
  }

  setActive(id: number, active: boolean): Observable<ApiResponse<StaffUser>> {
    return this.http.post<ApiResponse<StaffUser>>(`${this.apiUrl}/${id}/${active ? 'activate' : 'deactivate'}`, {});
  }

  delete(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/${id}`);
  }
}
