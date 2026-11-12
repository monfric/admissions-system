import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PaymentResponse, CreatePaymentRequest } from '../../models/registration/payment.model';
import { PaymentProof } from '../../models/registration/application-batch.model';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  recordPayment(applicationBatchId: number, req: CreatePaymentRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(`${this.apiUrl}/application-batches/${applicationBatchId}/payments`, req);
  }

  /** The latest payment proof image, for display (authenticated, so fetched as a blob). */
  getProofImage(applicationBatchId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/application-batches/${applicationBatchId}/payment-proof/file?t=${Date.now()}`, { responseType: 'blob' });
  }

  /** Staff upload a proof for the applicant (JPG/PNG up to 2 MB) with its transaction code. */
  uploadProof(applicationBatchId: number, file: File, transactionCode: string): Observable<{ success: boolean; message: string; data: PaymentProof }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('transaction_code', transactionCode);
    return this.http.post<{ success: boolean; message: string; data: PaymentProof }>(
      `${this.apiUrl}/application-batches/${applicationBatchId}/payment-proof`, formData
    );
  }

  /** Turns down the submitted proof; the applicant sees the reason and uploads again. */
  rejectProof(applicationBatchId: number, reason: string): Observable<{ success: boolean; message: string; data: PaymentProof }> {
    return this.http.post<{ success: boolean; message: string; data: PaymentProof }>(
      `${this.apiUrl}/application-batches/${applicationBatchId}/payment-proof/reject`, { reason }
    );
  }
}
