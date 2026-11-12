import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SharedService } from '../shared/shared.service';

/** A staff account as the API returns it. */
export interface StaffUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_number: string;
  /** admin | staff — admins can also manage staff users. */
  role: 'admin' | 'staff' | string;
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
}

interface StaffSession {
  token: string;
  /** Unix time (seconds) when the token expires. */
  expires_at: number;
  user: StaffUser;
}

const STORAGE_KEY = 'currentStaffUser';

/**
 * Staff login for the NMTC staff app. Every logged-in staff member sees the
 * whole Applications module; admins can also manage staff users.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private sessionSubject: BehaviorSubject<StaffSession | null>;

  constructor(
    private http: HttpClient,
    private router: Router,
    private sharedService: SharedService
  ) {
    // Set here, not as a field initializer: with ES2022 class fields those run
    // before sharedService is assigned, so the stored session never decrypts.
    this.sessionSubject = new BehaviorSubject<StaffSession | null>(this.readSession());
  }

  /** The logged-in user, or null. */
  get currentUser(): StaffUser | null {
    return this.sessionSubject.value?.user ?? null;
  }

  get token(): string | null {
    return this.sessionSubject.value?.token ?? null;
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  /** True while a session exists and its token hasn't expired. */
  get isLoggedIn(): boolean {
    const session = this.sessionSubject.value;
    return !!session && session.expires_at * 1000 > Date.now();
  }

  login(email: string, password: string): Observable<StaffUser> {
    return this.http.post<{ success: boolean; message: string; data: StaffSession }>(`${this.apiUrl}/login`, { email, password })
      .pipe(map(res => {
        this.saveSession(res.data);
        return res.data.user;
      }));
  }

  changePassword(oldPassword: string, newPassword: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/change-password`, {
      old_password: oldPassword,
      new_password: newPassword
    });
  }

  /** Emails a reset link if the address has an account (the reply is the same either way). */
  forgotPassword(email: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/forgot-password`, { email });
  }

  /** Sets a new password using the token from the emailed link. */
  resetPassword(token: string, password: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/reset-password`, { token, password });
  }

  /** Ends the session; by default goes back to the login page. */
  logout(redirect = true): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sessionSubject.next(null);
    if (redirect) this.router.navigate(['/login']);
  }

  private saveSession(session: StaffSession): void {
    localStorage.setItem(STORAGE_KEY, this.sharedService.encryptData(session));
    this.sessionSubject.next(session);
  }

  private readSession(): StaffSession | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const session: StaffSession = this.sharedService.decryptData(stored);
      if (session?.token && session.expires_at * 1000 > Date.now()) return session;
    } catch {
      // Unreadable or tampered session: start again.
    }
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
