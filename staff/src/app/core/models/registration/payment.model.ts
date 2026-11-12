export interface Payment {
  id: number;
  application_batch_id: number;
  amount: number;
  payment_method: string;
  transaction_code: string;
  paid_at?: string;
  created_at: string;
}

export interface CreatePaymentRequest {
  payment_method: string;
  transaction_code: string;
}

export interface PaymentResponse {
  success: boolean;
  message: string;
  data: Payment;
}

export const PAYMENT_MODES = ['M-Pesa', 'Bank Transfer', 'Cash', 'Cheque'];
