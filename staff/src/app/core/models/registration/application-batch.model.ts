export interface ApplicationItem {
  id: number;
  intake_programme_id: number;
  programme_name: string;
  programme_code: string;
  application_status: string;
  /** 1 = 1st choice, 2 = 2nd choice; 0 for applications made before choices were recorded. */
  choice: number;
}

/** "1st choice" / "2nd choice", or '' when the choice wasn't recorded. */
export function choiceLabel(choice: number | null | undefined): string {
  if (choice === 1) return '1st choice';
  if (choice === 2) return '2nd choice';
  return '';
}

export interface PreviousApplication {
  application_batch_id: number;
  application_number: string;
  intake_name: string;
  decision_status: string;
  payment_status: string;
}

export interface ApplicationBatch {
  id: number;
  applicant_id: number;
  applicant_full_name: string;
  applicant_phone: string;
  applicant_gender: string;
  applicant_profile_photo?: string;
  intake_id: number;
  intake_name: string;
  training_level_id: number;
  training_level_name: string;
  application_fee: number;
  application_number: string;
  /** "Boarder" | "Day Scholar" ('' for older applications) */
  residence: string;
  payment_status: string;
  decision_status: string;
  remarks?: string;
  notified_at?: string;
  recalled_at?: string;
  applications: ApplicationItem[];
  previous_applications: PreviousApplication[];
  /** The latest payment proof, if one was uploaded. */
  payment_proof?: PaymentProof;
  created_at: string;
  updated_at: string;
}

/** Proof of the fee payment; a payment can only be recorded against a submitted one. */
export interface PaymentProof {
  /** submitted (needs checking) | accepted | rejected | replaced */
  status: 'submitted' | 'accepted' | 'rejected' | string;
  transaction_code: string;
  rejection_reason: string;
  uploaded_by_staff: boolean;
  uploaded_at: string;
  reviewed_at: string;
  /** Other application numbers whose payment or proof used the same transaction code. */
  code_used_by?: string[];
}

export interface CreateApplicationBatchRequest {
  intake_id: number;
  training_level_id: number;
  intake_programme_ids: number[];
  /** "Boarder" | "Day Scholar" */
  residence: string;
}

export interface ApplicationBatchResponse {
  success: boolean;
  message: string;
  data: ApplicationBatch;
}

export interface PaginatedApplicationBatches {
  data: ApplicationBatch[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApplicationBatchListResponse {
  success: boolean;
  message: string;
  data: PaginatedApplicationBatches;
}

/** Counts for the cards on the staff application list pages. */
export interface ApplicationBatchStats {
  total: number;
  male: number;
  female: number;
  other_gender: number;
  new_this_month: number;
  new_today: number;
  /** Applications with a payment recorded this calendar month / today. */
  paid_this_month: number;
  paid_today: number;
  /** Notified applications with 0..expiring_within_days days left; last_day = 0 days left. */
  expiring_soon: number;
  last_day: number;
  expiring_within_days: number;
  /** Applications recalled this calendar month / today. */
  recalled_this_month: number;
  recalled_today: number;
  /** Applications rejected this calendar month / today. */
  rejected_this_month: number;
  rejected_today: number;
  /** Split by mode of residence. */
  boarders: number;
  day_scholars: number;
}

/** Card subtext for the residence split, e.g. "61% boarders · 39% day scholars". */
export function residenceSplit(boarders: number, dayScholars: number): string {
  const total = boarders + dayScholars;
  if (!total) return 'None yet';
  const boarderShare = Math.round((boarders / total) * 100);
  return `${boarderShare}% boarders · ${100 - boarderShare}% day scholars`;
}
