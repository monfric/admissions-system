export interface Intake {
  id: number;
  intake_month: string;
  intake_year: number;
  is_active: boolean;
  programme_count: number;
  running_count: number;
  closed_count: number;
  /** Applications in this intake, by payment status, and in total. */
  paid_count: number;
  unpaid_count: number;
  application_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateIntakeRequest {
  intake_month: string;
  intake_year: number;
  is_active?: boolean;
}

export type UpdateIntakeRequest = Partial<CreateIntakeRequest>;

export interface PaginatedIntakes {
  data: Intake[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface IntakeResponse {
  success: boolean;
  message: string;
  data: Intake;
}

export interface IntakeListResponse {
  success: boolean;
  message: string;
  data: PaginatedIntakes;
}

export const INTAKE_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Counts for the cards on the staff Intakes page ("open" = active intakes). */
export interface IntakeStats {
  total_intakes: number;
  open_intakes: number;
  programmes_running: number;
  applications: number;
  paid_applications: number;
  unpaid_applications: number;
  admitted: number;
  notified: number;
}
