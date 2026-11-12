import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { CreateFacultyDto, Faculty, FacultyFilters, FacultyListResponse, FacultyResponse, UpdateFacultyDto } from '../../models/academics/faculty.model';
import { catchError, map, Observable, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FacultyService {

    private apiUrl = `${environment.apiUrl}/faculties`;

  constructor(private http: HttpClient) {}

  /**
   * Get all faculties with optional filters
   */
  getFaculties(filters?: FacultyFilters): Observable<FacultyListResponse> {
    let params = new HttpParams();

    if (filters) {
      if (filters.page) {
        params = params.set('page', filters.page.toString());
      }
      if (filters.page_size) {
        params = params.set('page_size', filters.page_size.toString());
      }
      if (filters.search) {
        params = params.set('search', filters.search);
      }
      if (filters.is_active !== undefined) {
        params = params.set('is_active', filters.is_active.toString());
      }
      if (filters.sort_by) {
        params = params.set('sort_by', filters.sort_by);
      }
      if (filters.sort_dir) {
        params = params.set('sort_dir', filters.sort_dir);
      }
    }

    return this.http.get<FacultyListResponse>(this.apiUrl, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get a single faculty by ID
   */
  getFacultyById(id: number): Observable<FacultyResponse> {
    return this.http.get<FacultyResponse>(`${this.apiUrl}/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Create a new faculty
   */
  createFaculty(faculty: CreateFacultyDto): Observable<FacultyResponse> {
    return this.http.post<FacultyResponse>(this.apiUrl, faculty).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Update an existing faculty
   */
  updateFaculty(id: number, faculty: UpdateFacultyDto): Observable<FacultyResponse> {
    return this.http.put<FacultyResponse>(`${this.apiUrl}/${id}`, faculty).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Delete a faculty
   */
  deleteFaculty(id: number): Observable<FacultyResponse> {
    return this.http.delete<FacultyResponse>(`${this.apiUrl}/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get all active faculties (helper method)
   */
  getActiveFaculties(): Observable<Faculty[]> {
    return this.getFaculties({ is_active: true, page_size: 100 }).pipe(
      map(response => response.data.data)
    );
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.error && error.error.message) {
        errorMessage = error.error.message;
      } else {
        errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('Faculty Service Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
