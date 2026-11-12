import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SharedService } from '../shared/shared.service';
import {
  ApplicantApiResponse,
  ApplicantRegisterRequest,
  ApplicantSession,
  ApplicantSessionInfo
} from '../../models/applicant-portal/applicant-auth.model';

// Kept apart from the staff 'currentUser' entry so an applicant session and a
// staff session never overwrite each other.
const STORAGE_KEY = 'currentApplicant';

/** Applicant-portal authentication — fully separate from the staff AuthService. */
@Injectable({
  providedIn: 'root'
})
export class ApplicantAuthService {
  private apiUrl = `${environment.apiUrl}/applicant-portal`;
  private sessionSubject: BehaviorSubject<ApplicantSession | null>;
  readonly session$: Observable<ApplicantSession | null>;

  constructor(
    private http: HttpClient,
    private router: Router,
    private sharedService: SharedService
  ) {
    this.sessionSubject = new BehaviorSubject<ApplicantSession | null>(this.readStoredSession());
    this.session$ = this.sessionSubject.asObservable();
  }

  get session(): ApplicantSession | null {
    return this.sessionSubject.value;
  }

  get token(): string | null {
    return this.isLoggedIn() ? this.session!.token : null;
  }

  isLoggedIn(): boolean {
    const session = this.session;
    return !!session && session.expires_at * 1000 > Date.now();
  }

  login(email: string, password: string): Observable<ApplicantSession> {
    return this.http.post<ApplicantApiResponse<ApplicantSession>>(`${this.apiUrl}/auth/login`, { email, password })
      .pipe(map(res => res.data), tap(session => this.storeSession(session)));
  }

  register(req: ApplicantRegisterRequest): Observable<ApplicantSession> {
    return this.http.post<ApplicantApiResponse<ApplicantSession>>(`${this.apiUrl}/auth/register`, req)
      .pipe(map(res => res.data), tap(session => this.storeSession(session)));
  }

  /** Emails a reset link if the address has an account (the reply is the same either way). */
  forgotPassword(email: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  /** Sets a new password using the token from the emailed link. */
  resetPassword(token: string, password: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/auth/reset-password`, { token, password });
  }

  /** Refreshes the applicant's details (e.g. profile_complete) from the server. */
  me(): Observable<ApplicantSessionInfo> {
    return this.http.get<ApplicantApiResponse<ApplicantSessionInfo>>(`${this.apiUrl}/me`).pipe(
      map(res => res.data),
      tap(applicant => {
        const session = this.session;
        if (session) this.storeSession({ ...session, applicant });
      })
    );
  }

  logout(redirect = true): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sessionSubject.next(null);
    if (redirect) this.router.navigate(['/applicant/login']);
  }

  private storeSession(session: ApplicantSession): void {
    localStorage.setItem(STORAGE_KEY, this.sharedService.encryptData(session));
    this.sessionSubject.next(session);
  }

  private readStoredSession(): ApplicantSession | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const session: ApplicantSession = this.sharedService.decryptData(stored);
      if (session?.token && session.expires_at * 1000 > Date.now()) return session;
    } catch {
      // fall through and clear the bad entry
    }
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
