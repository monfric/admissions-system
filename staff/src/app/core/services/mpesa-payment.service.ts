import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/** One M-Pesa (STK Push) attempt, as the M-Pesa Payments page shows it. */
export interface MpesaPayment {
  id: number;
  /** starting | pending | success | failed | cancelled | timeout | expired | error */
  status: string;
  is_final: boolean;
  message: string;
  phone: string;
  /** Requested. */
  amount: number;
  /** What M-Pesa reports was paid. */
  paid_amount: number | null;
  mpesa_receipt: string | null;
  paid_at: string | null;
  /** The recorded fee payment (for its receipt). */
  payment_id: number | null;
  created_at: string;
  application_batch_id: number;
  application_number: string;
  applicant_name: string;
  /** unpaid | paid: the application's payment status now. */
  batch_payment_status: string;
  gateway_id: string | null;
  /** amount_mismatch | underpaid | receipt_pending | late | duplicate_receipt */
  flags: string[];
  needs_review: boolean;
  initiated_by_staff: boolean;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

export interface MpesaPaymentStats {
  total: number;
  successful: number;
  waiting: number;
  unsuccessful: number;
  needs_review: number;
  amount_today: number;
  /** False when M-Pesa is switched off in the API config. */
  enabled: boolean;
}

interface ApiResponse<T> { success: boolean; message: string; data: T }

export interface MpesaPaymentPage {
  data: MpesaPayment[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

/** M-Pesa payments made through the Payment Gateway (/mpesa-payments) and payment receipts. */
@Injectable({
  providedIn: 'root'
})
export class MpesaPaymentService {
  private apiUrl = `${environment.apiUrl}/mpesa-payments`;

  constructor(private http: HttpClient) {}

  getAll(page = 1, pageSize = 20, search = '', status = '', review = ''): Observable<ApiResponse<MpesaPaymentPage>> {
    let params = new HttpParams().set('page', page).set('page_size', pageSize);
    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);
    if (review) params = params.set('review', review);
    return this.http.get<ApiResponse<MpesaPaymentPage>>(this.apiUrl, { params });
  }

  getStats(): Observable<ApiResponse<MpesaPaymentStats>> {
    return this.http.get<ApiResponse<MpesaPaymentStats>>(`${this.apiUrl}/stats`);
  }

  /** Staff confirm they've checked a flagged payment. */
  markReviewed(id: number): Observable<ApiResponse<MpesaPayment>> {
    return this.http.post<ApiResponse<MpesaPayment>>(`${this.apiUrl}/${id}/review`, {});
  }

  /** Downloads a recorded payment's PDF receipt. */
  downloadReceipt(paymentId: number, fileName: string): Observable<void> {
    return this.http.get(`${environment.apiUrl}/payments/${paymentId}/receipt`, { responseType: 'blob' }).pipe(
      map(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
    );
  }
}
